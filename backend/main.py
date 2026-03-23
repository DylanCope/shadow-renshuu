import asyncio
import os
import sys
import uuid
import json
import logging
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path
import time
from typing import Optional, Any

# Fix Windows console Unicode encoding (cp1252 can't handle Japanese)
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import aiofiles
import httpx
import anthropic
from dotenv import load_dotenv

from audio_processor import transcribe_audio, transcribe_raw_text, split_audio_segment, get_model

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    handlers=[logging.StreamHandler(stream=sys.stdout)],
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Firebase Admin SDK — optional; enabled when env vars are set
# ─────────────────────────────────────────────

_firebase_initialized = False


def init_firebase() -> None:
    """Initialise Firebase Admin SDK from FIREBASE_SERVICE_ACCOUNT_JSON env var."""
    global _firebase_initialized
    if _firebase_initialized:
        return
    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET")
    if not service_account_json or not bucket_name:
        logger.info("Firebase Storage not configured — audio will be served from backend.")
        return
    try:
        import firebase_admin
        from firebase_admin import credentials as fb_creds
        cred_dict = json.loads(service_account_json)
        cred = fb_creds.Certificate(cred_dict)
        firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})
        _firebase_initialized = True
        logger.info("Firebase Admin SDK initialised (bucket: %s)", bucket_name)
    except Exception as exc:
        logger.warning("Firebase Admin SDK init failed: %s", exc)


def upload_to_firebase(local_path: Path, dest_path: str) -> Optional[str]:
    """Upload a file to Firebase Storage and return a persistent download URL.

    Returns None if Firebase is not configured or the upload fails.
    """
    if not _firebase_initialized:
        return None
    try:
        from firebase_admin import storage as fb_storage
        bucket = fb_storage.bucket()
        blob = bucket.blob(dest_path)
        blob.upload_from_filename(str(local_path))
        # Attach a download token so the URL matches the Firebase client-SDK format
        # and works without making the bucket publicly readable.
        download_token = str(uuid.uuid4())
        blob.metadata = {"firebaseStorageDownloadTokens": download_token}
        blob.patch()
        encoded_path = dest_path.replace("/", "%2F")
        url = (
            f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}"
            f"/o/{encoded_path}?alt=media&token={download_token}"
        )
        logger.info("Uploaded %s → %s", local_path.name, dest_path)
        return url
    except Exception as exc:
        logger.warning("Firebase upload failed for %s: %s", dest_path, exc)
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load the Whisper model at startup so the first request isn't slow
    # and Railway's health check doesn't time out waiting.
    init_firebase()
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, get_model)
    yield


app = FastAPI(title="Shadow Renshu API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if os.getenv("ALLOWED_ORIGINS", "") == "*" else os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────
# In-memory job store for async upload processing
# ─────────────────────────────────────────────

# jobs[job_id] = {"status": "pending"|"transcribing"|"segmenting"|"done"|"error",
#                 "progress": str, "result": dict|None, "error": str|None, "ts": float}
jobs: dict[str, dict[str, Any]] = {}

JOB_TTL = 3600  # seconds before completed/failed jobs are evicted


def _run_job_thread(
    job_id: str,
    session_id: str,
    audio_path: Path,
    audio_filename: str,
    transcript: Optional[str],
    sdir: Path,
):
    """
    Run Whisper + segmentation in a dedicated background thread.
    Using a plain thread (not the asyncio executor) keeps the event loop
    completely free to handle status-poll requests while Whisper runs.
    """
    try:
        jobs[job_id]["status"] = "transcribing"
        jobs[job_id]["progress"] = "Running speech recognition…"

        sentences_raw = transcribe_audio(str(audio_path))

        jobs[job_id]["status"] = "segmenting"
        jobs[job_id]["progress"] = "Splitting audio into sentences…"

        if transcript and transcript.strip():
            user_lines = parse_provided_transcript(transcript)
            for i, line in enumerate(user_lines):
                if i < len(sentences_raw):
                    sentences_raw[i]["text"] = line
                else:
                    last_end = sentences_raw[-1]["end"] if sentences_raw else 0.0
                    sentences_raw.append({"text": line, "start": last_end, "end": last_end + 3.0})

        # Upload original audio to Firebase Storage (best-effort)
        firebase_audio_url = upload_to_firebase(
            audio_path, f"sessions/{session_id}/{audio_filename}"
        )

        sentences_out = []
        for idx, s in enumerate(sentences_raw):
            try:
                seg_filename = split_audio_segment(
                    str(sdir), str(audio_path), s["start"], s["end"], idx
                )
            except Exception as e:
                logger.warning(f"Could not split segment {idx}: {e}")
                seg_filename = audio_filename

            seg_path = sdir / seg_filename
            firebase_seg_url = upload_to_firebase(
                seg_path, f"sessions/{session_id}/{seg_filename}"
            )
            segment_url = firebase_seg_url or f"/api/audio/{session_id}/{seg_filename}"

            sentences_out.append({
                "id": idx,
                "text": s["text"],
                "start": s["start"],
                "end": s["end"],
                "segmentUrl": segment_url,
            })

        audio_url = firebase_audio_url or f"/api/audio/{session_id}/{audio_filename}"

        jobs[job_id].update({
            "status": "done",
            "progress": "Done!",
            "result": {
                "session_id": session_id,
                "sentences": sentences_out,
                "audioUrl": audio_url,
            },
            "ts": time.time(),
        })
        logger.info(f"Job {job_id} completed ({len(sentences_out)} sentences)")

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        jobs[job_id].update({"status": "error", "error": str(e), "ts": time.time()})

# ─────────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    session_id: str
    sentence_id: int
    user_transcript: str
    target_text: str


class FuriganaRequest(BaseModel):
    text: str


class FuriganaSegment(BaseModel):
    base: str
    reading: Optional[str] = None


class FuriganaResponse(BaseModel):
    segments: list[FuriganaSegment]


class TranslateRequest(BaseModel):
    text: str


class TranslateResponse(BaseModel):
    translation: str


class AnalyzeResponse(BaseModel):
    score: int
    tips: list[str]
    phonetic_notes: str
    overall: str


# ─────────────────────────────────────────────
# Helper utilities
# ─────────────────────────────────────────────

def resolve_provider(provider: Optional[str], api_key: Optional[str]) -> tuple[str, str]:
    """Return (provider, api_key). Raises 401 if required credentials are missing."""
    p = (provider or "anthropic").lower()
    if p == "ollama":
        return "ollama", ""  # no key needed
    if p == "gemini":
        key = api_key or os.getenv("GEMINI_API_KEY", "")
        if not key:
            raise HTTPException(status_code=401, detail="No Gemini API key provided. Add your key in Settings.")
        return "gemini", key
    # default: anthropic
    key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
    if not key:
        raise HTTPException(status_code=401, detail="No Anthropic API key provided. Add your key in Settings.")
    return "anthropic", key


async def call_llm_text(
    prompt: str,
    *,
    provider: str,
    api_key: str = "",
    ollama_model: str = "gemma3",
    gemini_model: str = "gemini-2.5-flash",
    max_tokens: int = 1024,
    json_mode: bool = False,
) -> str:
    """Call the configured LLM provider and return the text response."""
    if provider == "gemini":
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent"
        generation_config: dict = {"maxOutputTokens": max_tokens}
        if json_mode:
            # Force valid JSON output and disable thinking so tokens aren't wasted
            # on internal reasoning for simple structured-output tasks.
            generation_config["responseMimeType"] = "application/json"
            generation_config["thinkingConfig"] = {"thinkingBudget": 0}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                params={"key": api_key},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": generation_config,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]

    elif provider == "ollama":
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                "http://localhost:11434/api/generate",
                json={"model": ollama_model, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            return resp.json()["response"]

    else:  # anthropic
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return next((b.text for b in response.content if b.type == "text"), "")


@app.get("/api/debug-key")
async def debug_key(x_api_key: Optional[str] = Header(None)):
    """Temporary debug endpoint — remove after fixing."""
    return {
        "header_received": bool(x_api_key),
        "header_prefix": x_api_key[:12] if x_api_key else None,
        "env_key_set": bool(os.getenv("ANTHROPIC_API_KEY")),
        "env_key_prefix": os.getenv("ANTHROPIC_API_KEY", "")[:12] or None,
    }


@app.post("/api/verify-key")
async def verify_key(
    x_api_key: Optional[str] = Header(None),
    x_provider: Optional[str] = Header(None),
    x_ollama_model: Optional[str] = Header(None),
    x_gemini_model: Optional[str] = Header(None),
):
    """
    Validate that the supplied API key is accepted by the provider.
    Uses the cheapest possible auth-only request and only checks HTTP status —
    response body is intentionally ignored so there are no parsing failure modes.
    """
    provider, api_key = resolve_provider(x_provider, x_api_key)

    if provider == "ollama":
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get("http://localhost:11434/api/tags")
                resp.raise_for_status()
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Could not connect to Ollama at localhost:11434. Is it running?"
            )
        return {"ok": True}

    if provider == "gemini":
        # List-models is a free, read-only endpoint — HTTP 200 means the key is valid.
        gemini_model = x_gemini_model or "gemini-2.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params={"key": api_key})
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not reach Google API: {e}")
        if resp.status_code == 200:
            return {"ok": True}
        if resp.status_code == 429:
            return {"ok": True}  # rate-limited but key is valid
        if resp.status_code in (400, 401, 403):
            raise HTTPException(status_code=401, detail="Invalid Gemini API key — authentication failed.")
        raise HTTPException(status_code=400, detail=f"Google API returned {resp.status_code}.")

    # Anthropic — send the smallest possible billable request (1 token)
    try:
        client = anthropic.Anthropic(api_key=api_key)
        client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1,
            messages=[{"role": "user", "content": "Hi"}],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid Anthropic API key — authentication failed.")
    except anthropic.RateLimitError:
        return {"ok": True}  # rate-limited but key is valid
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Anthropic verification failed: {str(e)[:200]}")

    return {"ok": True}


def session_dir(session_id: str) -> Path:
    d = UPLOADS_DIR / session_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def parse_provided_transcript(transcript_text: str):
    """
    Parse a plain-text transcript (one sentence per line) into
    {text, start, end} dicts with placeholder timestamps (0/0).
    We still need timestamps for segmenting; this path requires
    Whisper to provide them anyway, so we only use the user text
    as a display override.
    """
    lines = [line.strip() for line in transcript_text.splitlines() if line.strip()]
    return lines  # caller decides what to do with it


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@app.post("/api/upload")
async def upload_audio(
    audio: UploadFile = File(...),
    transcript: Optional[str] = Form(None),
):
    """
    Accept audio file + optional transcript text.
    Saves the file immediately and returns a job_id.
    Processing (Whisper + segmentation) runs in the background so the
    client can poll /api/status/{job_id} rather than holding one long
    connection open (which mobile browsers kill when backgrounded).
    """
    session_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    sdir = session_dir(session_id)

    # Save uploaded audio
    original_ext = Path(audio.filename).suffix or ".audio"
    audio_filename = f"original{original_ext}"
    audio_path = sdir / audio_filename

    async with aiofiles.open(audio_path, "wb") as f:
        content = await audio.read()
        await f.write(content)

    logger.info(f"Saved upload to {audio_path} (session {session_id}, job {job_id})")

    # Register job and kick off background processing in a dedicated thread.
    # A plain thread keeps the asyncio event loop completely free to handle
    # status-poll requests while Whisper (CPU-bound) runs.
    jobs[job_id] = {"status": "pending", "progress": "Starting…", "result": None, "error": None, "ts": time.time()}
    t = threading.Thread(
        target=_run_job_thread,
        args=(job_id, session_id, audio_path, audio_filename, transcript, sdir),
        daemon=True,
    )
    t.start()

    return JSONResponse({"job_id": job_id})


@app.get("/api/status/{job_id}")
async def get_job_status(job_id: str):
    """
    Poll the status of an upload+processing job.
    Returns {status, progress, result?, error?}.
    Evicts old completed/failed jobs that exceed JOB_TTL.
    """
    # Opportunistically clean up expired jobs
    now = time.time()
    expired = [jid for jid, j in jobs.items() if j["status"] in ("done", "error") and now - j.get("ts", now) > JOB_TTL]
    for jid in expired:
        jobs.pop(jid, None)

    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    return JSONResponse({
        "status": job["status"],
        "progress": job.get("progress", ""),
        "result": job.get("result"),
        "error": job.get("error"),
    })


@app.get("/api/audio/{session_id}/{filename}")
async def serve_audio(session_id: str, filename: str):
    """Serve audio files (original or segments)."""
    sdir = UPLOADS_DIR / session_id
    file_path = sdir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Basic path traversal protection
    try:
        file_path.resolve().relative_to(UPLOADS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    media_type = "audio/mpeg"
    ext = file_path.suffix.lower()
    if ext in (".wav",):
        media_type = "audio/wav"
    elif ext in (".ogg",):
        media_type = "audio/ogg"
    elif ext in (".m4a",):
        media_type = "audio/mp4"

    return FileResponse(str(file_path), media_type=media_type)


@app.get("/api/segment/{session_id}/{sentence_id}")
async def serve_segment(session_id: str, sentence_id: int):
    """Serve a pre-generated sentence segment."""
    filename = f"segment_{sentence_id}.mp3"
    return await serve_audio(session_id, filename)


@app.post("/api/transcribe")
async def transcribe_user_audio(audio: UploadFile = File(...)):
    """Transcribe a user's recording using Whisper and return the text."""
    suffix = Path(audio.filename).suffix if audio.filename else ".webm"
    # Whisper handles webm/ogg/mp3/wav — write to a temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name
    try:
        loop = asyncio.get_running_loop()
        text = await loop.run_in_executor(None, lambda: transcribe_raw_text(tmp_path))
        return {"text": text}
    except Exception as e:
        logger.error(f"User transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        os.remove(tmp_path)


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_attempt(
    req: AnalyzeRequest,
    x_api_key: Optional[str] = Header(None),
    x_provider: Optional[str] = Header(None),
    x_ollama_model: Optional[str] = Header(None),
    x_gemini_model: Optional[str] = Header(None),
):
    """
    Use an LLM to compare the user's spoken transcript against the target Japanese text.
    Returns a score (0-100), improvement tips, phonetic notes, and overall feedback.
    """
    provider, api_key = resolve_provider(x_provider, x_api_key)

    prompt = f"""You are an expert Japanese language teacher specializing in pronunciation and shadowing practice.

A student is practicing shadowing the following Japanese sentence:
Target text: 「{req.target_text}」

The student attempted to say it and their speech recognition captured:
Student said: 「{req.user_transcript}」

Please analyze their attempt and respond with a JSON object (no markdown, just raw JSON) with these exact fields:
{{
  "score": <integer 0-100 representing pronunciation/accuracy>,
  "tips": [<2-3 specific, actionable improvement tips as strings>],
  "phonetic_notes": "<brief notes on specific phonetic challenges in this sentence>",
  "overall": "<1-2 sentence encouraging overall assessment>"
}}

Scoring guide:
- 90-100: Nearly perfect. 100 if the student's transcript matches the target text exactly, including particles and small words. 90+ if it's very close with only minor issues.
- 75-89: Good attempt, small errors that don't impede understanding.
- 60-74: Understandable but notably different from the target, with multiple errors in particles.
- 40-59: Significant errors, needs focused practice.
- 0-39: Major issues, recommend listening more before attempting.

If the student transcript is empty or very different, give a low score and focus tips on listening first.
Keep in mind that we are only analyzing the transcribed text, which may have errors. If the transcript is inaccurate, note that in the feedback and focus on encouraging the student to listen more to the target sentence. We CANNOT give feedback on aspects like intonation or rhythm since we don't have the actual audio, only the transcript. However, if we can infer common pronunciation mistakes from the transcript errors (e.g. consistently missing particles), we can mention those in the tips. Additionally, if the speech-to-text seems to have confused homophones do not penalize the student. If the confusion is between two words that are written with the same kana but have different pitch (e.g. 橋 vs 箸) then mention this in the phonetic_notes as a common challenge with shadowing practice and highlight the correct pitch for the target word.

Respond ONLY with the JSON object, no other text."""

    ollama_model = x_ollama_model or "gemma3"
    gemini_model = x_gemini_model or "gemini-2.5-flash"
    try:
        if provider == "anthropic":
            # Use extended thinking for deeper analysis
            client = anthropic.Anthropic(api_key=api_key)
            response = client.messages.create(
                model="claude-opus-4-6",
                max_tokens=16000,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": prompt}],
            )
            response_text = next((b.text for b in response.content if b.type == "text"), "")
        else:
            response_text = await call_llm_text(
                prompt,
                provider=provider,
                api_key=api_key,
                ollama_model=ollama_model,
                gemini_model=gemini_model,
                max_tokens=4096,
                json_mode=True,
            )

        # Parse JSON from response
        response_text = response_text.strip()
        # Remove markdown code fences if present
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            response_text = "\n".join(lines)

        data = json.loads(response_text)

        return AnalyzeResponse(
            score=int(data.get("score", 50)),
            tips=data.get("tips", ["Keep practicing!"]),
            phonetic_notes=data.get("phonetic_notes", ""),
            overall=data.get("overall", "Good effort!"),
        )

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}\nResponse: {response_text}")
        # Attempt partial recovery — extract whatever fields we can via regex
        # before giving up, so truncated responses still produce a result.
        try:
            import re
            score_m = re.search(r'"score"\s*:\s*(\d+)', response_text)
            tips_m = re.findall(r'"((?:[^"\\]|\\.)*)"', response_text)
            score = int(score_m.group(1)) if score_m else 50
            # Heuristic: tips are strings longer than 20 chars that aren't field names
            known_keys = {"score", "tips", "phonetic_notes", "overall"}
            tip_candidates = [t for t in tips_m if len(t) > 20 and t not in known_keys]
            tips = tip_candidates[:3] if tip_candidates else ["Keep practicing!"]
            logger.warning(f"Recovered partial response: score={score}, tips={tips}")
            return AnalyzeResponse(score=score, tips=tips, phonetic_notes="", overall="Good effort!")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e}")
    except httpx.HTTPStatusError as e:
        logger.error(f"LLM API HTTP error: {e}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {e.response.text}")


@app.post("/api/furigana", response_model=FuriganaResponse)
async def get_furigana(
    req: FuriganaRequest,
    x_api_key: Optional[str] = Header(None),
    x_provider: Optional[str] = Header(None),
    x_ollama_model: Optional[str] = Header(None),
    x_gemini_model: Optional[str] = Header(None),
):
    """Generate furigana readings for a Japanese text."""
    provider, api_key = resolve_provider(x_provider, x_api_key)
    ollama_model = x_ollama_model or "gemma3"
    gemini_model = x_gemini_model or "gemini-2.5-flash"
    prompt = f"""Add furigana readings to the following Japanese text.
Return a JSON array where each element represents a word or particle. For elements containing kanji, include a "reading" field (hiragana). For pure kana, punctuation, or spaces, omit "reading".

Format: [{{"base": "漢字", "reading": "かんじ"}}, {{"base": "は"}}, ...]

Text: {req.text}

Return ONLY the JSON array, no other text."""

    try:
        text = await call_llm_text(prompt, provider=provider, api_key=api_key, ollama_model=ollama_model, gemini_model=gemini_model, max_tokens=2048)
        text = text.strip()
        if text.startswith("```"):
            text = "\n".join(l for l in text.split("\n") if not l.startswith("```"))
        segments_raw = json.loads(text)
        segments = [FuriganaSegment(base=s["base"], reading=s.get("reading")) for s in segments_raw]
        return FuriganaResponse(segments=segments)
    except Exception as e:
        logger.error(f"Furigana error: {e}")
        return FuriganaResponse(segments=[FuriganaSegment(base=req.text)])


@app.post("/api/translate", response_model=TranslateResponse)
async def translate_text(
    req: TranslateRequest,
    x_api_key: Optional[str] = Header(None),
    x_provider: Optional[str] = Header(None),
    x_ollama_model: Optional[str] = Header(None),
    x_gemini_model: Optional[str] = Header(None),
):
    """Translate Japanese text to English."""
    provider, api_key = resolve_provider(x_provider, x_api_key)
    ollama_model = x_ollama_model or "gemma3"
    gemini_model = x_gemini_model or "gemini-2.5-flash"
    prompt = f"""Translate the following Japanese sentence into natural, fluent English.
Return ONLY the English translation, no explanations.

Japanese: {req.text}"""

    try:
        translation = await call_llm_text(prompt, provider=provider, api_key=api_key, ollama_model=ollama_model, gemini_model=gemini_model, max_tokens=512)
        return TranslateResponse(translation=translation.strip())
    except Exception as e:
        logger.error(f"Translation error: {e}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {e}")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
