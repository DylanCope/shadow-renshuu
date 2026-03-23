# 影 Shadow Renshuu

A Japanese language shadowing practice app. Upload audio from a native speaker, and the app will automatically transcribe it, split it sentence by sentence, and guide you through a structured listen → shadow → record → feedback loop. Your recordings are auto-transcribed and analysed by an AI to give you a score and improvement tips.

<img src="https://shadow-renshuu.vercel.app">

---

## Features

- **Audio upload** — upload any audio file (MP3, MP4, WAV, etc.) with or without a transcript
- **Auto-transcription** — if no transcript is provided, <a href="https://github.com/openai/whisper">OpenAI Whisper</a> automatically transcribes and segments the audio
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
- **User authentication** — sign in with Google or a passwordless email link; sessions are saved to Firestore and retrievable across page reloads and devices

---

## Architecture

```
shadow-renshuu/
├── frontend/        # React + TypeScript + Vite (deployed to Vercel)
└── backend/         # FastAPI + Python (deployed to Railway)
```

The frontend is a static SPA; all AI calls go through the backend. Audio files are stored on the backend server temporarily. The Whisper model runs on the backend (no external API needed for transcription).

Authentication and session metadata are stored in **Firebase** (Auth + Firestore). Audio files are uploaded to **Firebase Storage** during processing, so segment URLs are permanent and survive backend restarts and redeployments.

---

## Running Locally

### Prerequisites

- **Node.js** 18+
- **Python** 3.10+ (Miniconda/Anaconda recommended)
- **ffmpeg** — required by Whisper for audio decoding
  - macOS: `brew install ffmpeg`
  - Ubuntu: `sudo apt install ffmpeg`
  - Windows: <a href="https://ffmpeg.org/download.html">download from ffmpeg.org</a> and add to PATH

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

For Firebase Auth to work locally you must add the six `VITE_FIREBASE_*` variables to `frontend/.env.local` (see [Firebase Setup](#firebase-setup) below).

---

## Configuration

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS origins. Set to `*` to allow all. |
| `WHISPER_MODEL` | `tiny` | Whisper model size. Options: `tiny`, `base`, `small`, `medium`, `large`. Larger = more accurate but slower and uses more RAM. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | — | Full JSON content of a Firebase service account key (see [Firebase Setup](#firebase-setup)). Required for audio to persist in Firebase Storage. |
| `FIREBASE_STORAGE_BUCKET` | — | Firebase Storage bucket name, e.g. `your-project.appspot.com` or `your-project.firebasestorage.app`. |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(empty — uses Vite proxy)* | Full URL of the backend, e.g. `https://your-app.up.railway.app`. Required in production. |
| `VITE_SHOW_OLLAMA` | `true` | Set to `false` to hide the Ollama (local) provider option in settings. |
| `VITE_FIREBASE_API_KEY` | — | Firebase Web API key (see [Firebase Setup](#firebase-setup)). |
| `VITE_FIREBASE_AUTH_DOMAIN` | — | Firebase Auth domain, e.g. `your-project.firebaseapp.com`. |
| `VITE_FIREBASE_PROJECT_ID` | — | Firebase project ID. |
| `VITE_FIREBASE_STORAGE_BUCKET` | — | Firebase Storage bucket, e.g. `your-project.appspot.com`. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | — | Firebase Cloud Messaging sender ID. |
| `VITE_FIREBASE_APP_ID` | — | Firebase app ID. |

---

## AI Provider Setup

The app uses an AI model to generate furigana, translations, and to analyse and score your shadowing attempts. Your API key is stored only in your browser's `localStorage` and is sent directly in request headers — it is never persisted on the server.

Click the **✦** (sparkle) button in the top bar to open the AI Settings panel.

---

### Option 1 — Google Gemini (recommended for free use)

Gemini has a generous free tier suitable for regular practice sessions.

1. Go to <a href="https://aistudio.google.com/app/apikey">aistudio.google.com/app/apikey</a>
2. Click **Create API key**
3. In the app, select **Google Gemini** as the provider and paste your key
4. Recommended model: **Gemini 2.5 Flash**

---

### Option 2 — Anthropic Claude

1. Go to <a href="https://console.anthropic.com">console.anthropic.com</a>
2. Navigate to **API Keys** and create a new key
3. In the app, select **Anthropic Claude** and paste your key

Note: Anthropic does not have a free tier; usage is billed per token.

---

### Option 3 — Ollama (fully offline)

For completely offline use with no API key:

1. Install <a href="https://ollama.com">Ollama</a>
2. Pull a model: `ollama pull gemma3`
3. Make sure Ollama is running (`ollama serve`)
4. In the app, select **Ollama (Local)** and enter the model name (e.g. `gemma3`)

> **Note:** Ollama is hidden by default in the Vercel deployment. It is only useful when running the backend locally.

---

## Firebase Setup

Firebase provides user authentication (Google OAuth + passwordless email link) and Firestore for persistent session storage. Both the local dev environment and the production Vercel deployment need a Firebase project.

### 1. Create a Firebase project

1. Go to the <a href="https://console.firebase.google.com">Firebase Console</a> and click **Add project**
2. Give it a name (e.g. `shadow-renshuu`) and follow the setup wizard

### 2. Enable Authentication

1. In the Firebase Console, open **Authentication → Sign-in method**
2. Enable **Google** — set a support email and save
3. Enable **Email/Password**, then toggle on **Email link (passwordless sign-in)** and save
4. Under **Authentication → Settings → Authorised domains**, add your Vercel deployment domain (e.g. `shadow-renshuu.vercel.app`)

### 3. Enable Firebase Storage

1. In the Firebase Console, open **Storage** and click **Get started**
2. Accept the default security rules for now (you'll tighten them in the next step) and choose a region
3. Once created, note the bucket name shown at the top of the Storage page — it looks like `your-project.appspot.com` or `your-project.firebasestorage.app`

#### Storage security rules

In **Storage → Rules**, replace the default rules so that only authenticated users can read files and only the backend service account can write:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /sessions/{sessionId}/{allPaths=**} {
      // Any signed-in user can read their session audio
      allow read: if request.auth != null;
      // Writes come from the backend service account only (not from the browser)
      allow write: if false;
    }
  }
}
```

> The backend uploads files using the Admin SDK (service account), which bypasses Storage security rules entirely. The rules above only restrict browser client access.

### 4. Create a service account for the backend

The backend needs a service account key to upload files to Firebase Storage and to initialise the Admin SDK.

1. In the Firebase Console, go to **Project settings → Service accounts**
2. Click **Generate new private key** and confirm — a JSON file will be downloaded
3. Keep this file secret — treat it like a password
4. You will paste the **entire contents** of this JSON file as the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable on Railway (see [Backend → Railway](#backend--railway) below)

### 5. Create a Firestore database

1. Open **Firestore Database** and click **Create database**
2. Choose **Production mode** (you will add security rules next)
3. Pick a region close to your users

#### Security rules

In **Firestore → Rules**, replace the default rules with the following so that users can only read and write their own sessions:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sessionId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

#### Composite index

The session list query requires a composite index. Either deploy it via the Firebase CLI or create it manually:

- **Collection:** `sessions`
- **Fields:** `userId` (Ascending), `createdAt` (Descending)

You can also let the app create it automatically — Firestore will log a link to create the index the first time the query runs.

### 6. Get your Firebase config

1. In the Firebase Console, open **Project settings → General**
2. Under **Your apps**, click the **Web** icon (`</>`) to register a web app if you haven't already
3. Copy the `firebaseConfig` values — you will need all six fields

### 7. Set environment variables

**Local development** — add to `frontend/.env.local`:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

**Production** — add the same six variables to your Vercel project settings (see [Frontend → Vercel](#frontend--vercel) below).

---

## Deployment

### Frontend → Vercel

The `vercel.json` at the repo root configures everything automatically.

1. Push the repo to GitHub
2. Import the project in <a href="https://vercel.com">vercel.com</a>
3. Set the following **Environment Variables** in Vercel project settings:

   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | Your Railway backend URL, e.g. `https://your-app.up.railway.app` |
   | `VITE_SHOW_OLLAMA` | `false` |
   | `VITE_FIREBASE_API_KEY` | From Firebase project settings |
   | `VITE_FIREBASE_AUTH_DOMAIN` | From Firebase project settings |
   | `VITE_FIREBASE_PROJECT_ID` | From Firebase project settings |
   | `VITE_FIREBASE_STORAGE_BUCKET` | From Firebase project settings |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | From Firebase project settings |
   | `VITE_FIREBASE_APP_ID` | From Firebase project settings |

4. Deploy

> After deploying, remember to add your Vercel domain to **Firebase → Authentication → Settings → Authorised domains**.

---

### Backend → Railway

1. Create a new project in <a href="https://railway.app">railway.app</a> and connect your GitHub repo
2. Set the **Root Directory** to `backend`
3. Railway will detect the `Dockerfile` and build a CPU-only image automatically
4. Set the following **Environment Variables** in Railway:

   | Variable | Value |
   |---|---|
   | `ALLOWED_ORIGINS` | `*` (or your specific Vercel URL) |
   | `WHISPER_MODEL` | `tiny` (or `base`/`small` for better accuracy — needs more RAM; see guide below) |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | Paste the **entire contents** of the service account JSON file you downloaded in the Firebase setup |
   | `FIREBASE_STORAGE_BUCKET` | Your Storage bucket name, e.g. `your-project.appspot.com` |

5. Deploy — the first deploy will take several minutes while the Docker image is built

> **Memory guide:** `tiny` ~200MB, `base` ~500MB, `small` ~1GB, `medium` ~3GB, `large` ~6GB.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Audio recording | Web Audio API / MediaRecorder |
| Speech-to-text | <a href="https://github.com/openai/whisper">OpenAI Whisper</a> (runs locally on the backend) |
| AI analysis | Anthropic Claude / Google Gemini / Ollama |
| Backend framework | FastAPI (Python 3.11) |
| Audio processing | pydub + ffmpeg |
| Containerisation | Docker (CPU-only PyTorch) |
| Authentication | Firebase Auth (Google OAuth + email link) |
| Session storage | Firebase Firestore |
| Audio storage | Firebase Storage |

---

## License

MIT
