import whisper
import os
from pydub import AudioSegment
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Load Whisper models on demand; cache by model name.
# Default model is configurable via the WHISPER_MODEL env var (default: 'base').
# Options: tiny, base, small, medium, large — larger = more accurate but slower and more RAM.
_models: dict = {}
_default_model_name = os.getenv("WHISPER_MODEL", "base")

def get_model(model_name: str = None):
    name = model_name or _default_model_name
    if name not in _models:
        logger.info(f"Loading Whisper model '{name}'...")
        _models[name] = whisper.load_model(name)
        logger.info(f"Whisper model '{name}' loaded.")
    return _models[name]


def transcribe_audio(audio_path: str, model_name: str = None) -> List[Dict[str, Any]]:
    """
    Transcribe audio using Whisper with word-level timestamps.
    Groups words into sentences by Japanese punctuation or pauses > 0.8s.
    Returns list of {text, start, end} dicts.
    """
    model = get_model(model_name)

    logger.info(f"Transcribing audio: {audio_path}")
    result = model.transcribe(
        audio_path,
        language="ja",
        word_timestamps=True,
        verbose=True,
        fp16=False,
    )

    # Collect all words with timestamps from all segments
    all_words = []
    for segment in result.get("segments", []):
        words = segment.get("words", [])
        for word in words:
            all_words.append({
                "word": word.get("word", "").strip(),
                "start": word.get("start", 0.0),
                "end": word.get("end", 0.0),
            })

    if not all_words:
        # Fallback: use segment-level data if no word timestamps
        sentences = []
        for i, segment in enumerate(result.get("segments", [])):
            text = segment.get("text", "").strip()
            if text:
                sentences.append({
                    "text": text,
                    "start": segment.get("start", 0.0),
                    "end": segment.get("end", 0.0),
                })
        return sentences

    # Group words into sentences
    sentences = []
    current_words = []
    current_start = None
    PAUSE_THRESHOLD = 0.8  # seconds

    japanese_sentence_endings = set("。？！…")

    for i, word_info in enumerate(all_words):
        word = word_info["word"]
        start = word_info["start"]
        end = word_info["end"]

        if not word:
            continue

        if current_start is None:
            current_start = start

        # Check for pause before this word
        if current_words and (start - all_words[i - 1]["end"]) > PAUSE_THRESHOLD:
            # Flush current sentence
            text = "".join(w["word"] for w in current_words).strip()
            if text:
                sentences.append({
                    "text": text,
                    "start": current_start,
                    "end": all_words[i - 1]["end"],
                })
            current_words = []
            current_start = start

        current_words.append(word_info)

        # Check if this word ends with Japanese sentence-ending punctuation
        if any(word.endswith(ch) for ch in japanese_sentence_endings):
            text = "".join(w["word"] for w in current_words).strip()
            if text:
                sentences.append({
                    "text": text,
                    "start": current_start,
                    "end": end,
                })
            current_words = []
            current_start = None

    # Flush any remaining words
    if current_words:
        text = "".join(w["word"] for w in current_words).strip()
        if text:
            sentences.append({
                "text": text,
                "start": current_start,
                "end": current_words[-1]["end"],
            })

    # If grouping produced zero sentences, fall back to Whisper segments
    if not sentences:
        for segment in result.get("segments", []):
            text = segment.get("text", "").strip()
            if text:
                sentences.append({
                    "text": text,
                    "start": segment.get("start", 0.0),
                    "end": segment.get("end", 0.0),
                })

    logger.info(f"Produced {len(sentences)} sentence(s) from transcription.")
    return sentences


def transcribe_raw_text(audio_path: str) -> str:
    """
    Transcribe audio and return the plain text string (for user recording review).
    """
    model = get_model()
    result = model.transcribe(audio_path, language="ja", fp16=False)
    return result.get("text", "").strip()


def split_audio_segment(
    session_dir: str,
    audio_path: str,
    start: float,
    end: float,
    sentence_id: int,
) -> str:
    """
    Extract a segment from audio_path between start and end (in seconds).
    Saves the segment as MP3 in session_dir.
    Returns the filename (not full path).
    """
    audio = AudioSegment.from_file(audio_path)

    start_ms = int(start * 1000)
    end_ms = int(end * 1000)

    # Add small padding (50ms each side) without going out of bounds
    start_ms = max(0, start_ms - 50)
    end_ms = min(len(audio), end_ms + 50)

    segment = audio[start_ms:end_ms]

    filename = f"segment_{sentence_id}.mp3"
    output_path = os.path.join(session_dir, filename)
    segment.export(output_path, format="mp3")

    logger.info(f"Saved segment {sentence_id}: {output_path} ({start:.2f}s - {end:.2f}s)")
    return filename
