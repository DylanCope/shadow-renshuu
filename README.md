# 影 Shadow Renshuu

A Japanese language shadowing practice app. Upload audio from a native speaker, and the app will automatically transcribe it, split it sentence by sentence, and guide you through a structured listen → shadow → record → feedback loop. Your recordings are auto-transcribed and analysed by an AI to give you a score and improvement tips.

![Shadow Renshuu screenshot](https://shadow-renshuu.vercel.app)

---

## Features

- **Audio upload** — upload any audio file (MP3, MP4, WAV, etc.) with or without a transcript
- **Auto-transcription** — if no transcript is provided, [OpenAI Whisper](https://github.com/openai/whisper) automatically transcribes and segments the audio
- **Sentence-by-sentence segmentation** — audio is split at sentence boundaries with timestamps
- **Furigana** — AI-generated furigana reading aids above kanji characters
- **Translation** — on-demand AI translation for each sentence
- **Structured practice flow** — Listen → Shadow → Record → Feedback per sentence
- **Auto-transcribe your recording** — after recording your attempt, Whisper automatically transcribes what you said so you can review it before submitting
- **AI-powered feedback** — your attempt is compared against the target sentence and scored 0–100 with tips on pronunciation and grammar
- **Multi-sentence mode** — practice multiple sentences in sequence
- **Sentence editing** — edit, split, or merge sentences in the sidebar
- **Progress tracking** — scores per sentence tracked across your session
- **Multiple AI providers** — Anthropic Claude, Google Gemini (free tier available), or local Ollama
- **Dark / light mode**
- **Mobile-responsive** — sliding sidebar works on small screens
- **Fully local-first** — no account required; sessions are kept in-browser

---

## Architecture

```
shadow-renshuu/
├── frontend/        # React + TypeScript + Vite (deployed to Vercel)
└── backend/         # FastAPI + Python (deployed to Railway)
```

The frontend is a static SPA; all AI calls go through the backend. Audio files are stored on the backend server temporarily. The Whisper model runs on the backend (no external API needed for transcription).

---

## Running Locally

### Prerequisites

- **Node.js** 18+
- **Python** 3.10+ (Miniconda/Anaconda recommended)
- **ffmpeg** — required by Whisper for audio decoding
  - macOS: `brew install ffmpeg`
  - Ubuntu: `sudo apt install ffmpeg`
  - Windows: [download from ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

---

### Backend

```bash
cd backend

# Create and activate a virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
.venv\Scripts\activate           # Windows

# Install CPU-only PyTorch first (avoids downloading a 2GB CUDA build)
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
pip install -r requirements.txt

# Copy and edit environment variables (optional — see Configuration below)
cp .env.example .env

# Start the server
uvicorn main:app --port 8000 --reload
```

The backend will be available at `http://localhost:8000`. On first start it will download the Whisper model (~75MB for `tiny`).

---

### Frontend

```bash
cd frontend

npm install

# Copy and edit environment variables (optional for local dev)
cp .env.example .env.local

npm run dev
```

The app will be available at `http://localhost:5173`. The Vite dev server proxies `/api` requests to `http://localhost:8000` automatically, so no `VITE_API_URL` is needed locally.

---

## Configuration

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS origins. Set to `*` to allow all. |
| `WHISPER_MODEL` | `tiny` | Whisper model size. Options: `tiny`, `base`, `small`, `medium`, `large`. Larger = more accurate but slower and uses more RAM. |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(empty — uses Vite proxy)* | Full URL of the backend, e.g. `https://your-app.up.railway.app`. Required in production. |
| `VITE_SHOW_OLLAMA` | `true` | Set to `false` to hide the Ollama (local) provider option in settings. |

---

## AI Provider Setup

The app uses an AI model to generate furigana, translations, and to analyse and score your shadowing attempts. Your API key is stored only in your browser's `localStorage` and is sent directly in request headers — it is never persisted on the server.

Click the **✦** (sparkle) button in the top bar to open the AI Settings panel.

---

### Option 1 — Google Gemini (recommended for free use)

Gemini has a generous free tier suitable for regular practice sessions.

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **Create API key**
3. In the app, select **Google Gemini** as the provider and paste your key
4. Recommended model: **Gemini 2.5 Flash**

---

### Option 2 — Anthropic Claude

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Navigate to **API Keys** and create a new key
3. In the app, select **Anthropic Claude** and paste your key

Note: Anthropic does not have a free tier; usage is billed per token.

---

### Option 3 — Ollama (fully offline)

For completely offline use with no API key:

1. Install [Ollama](https://ollama.com)
2. Pull a model: `ollama pull gemma3`
3. Make sure Ollama is running (`ollama serve`)
4. In the app, select **Ollama (Local)** and enter the model name (e.g. `gemma3`)

> **Note:** Ollama is hidden by default in the Vercel deployment. It is only useful when running the backend locally.

---

## Deployment

### Frontend → Vercel

The `vercel.json` at the repo root configures everything automatically.

1. Push the repo to GitHub
2. Import the project in [vercel.com](https://vercel.com)
3. Set the following **Environment Variables** in Vercel project settings:
   - `VITE_API_URL` → your Railway backend URL (e.g. `https://your-app.up.railway.app`)
   - `VITE_SHOW_OLLAMA` → `false`
4. Deploy

---

### Backend → Railway

1. Create a new project in [railway.app](https://railway.app) and connect your GitHub repo
2. Set the **Root Directory** to `backend`
3. Railway will detect the `Dockerfile` and build a CPU-only image automatically
4. Set the following **Environment Variables** in Railway:
   - `ALLOWED_ORIGINS` → `*` (or your specific Vercel URL)
   - `WHISPER_MODEL` → `tiny` (or `base`/`small` if your plan has enough RAM; `base` needs ~1GB, `small` ~2GB)
5. Deploy — the first deploy will take several minutes while the Docker image is built

> **Memory guide:** `tiny` ~200MB, `base` ~500MB, `small` ~1GB, `medium` ~3GB, `large` ~6GB.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Audio recording | Web Audio API / MediaRecorder |
| Speech-to-text | [OpenAI Whisper](https://github.com/openai/whisper) (runs locally on the backend) |
| AI analysis | Anthropic Claude / Google Gemini / Ollama |
| Backend framework | FastAPI (Python 3.11) |
| Audio processing | pydub + ffmpeg |
| Containerisation | Docker (CPU-only PyTorch) |

---

## License

MIT
