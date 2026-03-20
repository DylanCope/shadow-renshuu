# Shadow Renshu - Copilot Instructions

## Project Overview
Shadow Renshu is a Japanese shadowing practice web app. Users upload audio from native Japanese speakers with an optional transcript. The app auto-transcribes (if no transcript is provided), splits audio sentence by sentence, and guides users through shadowing practice. Voice analysis scores the user's performance and provides tips.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Audio Processing**: Web Audio API, WaveSurfer.js
- **Transcription**: OpenAI Whisper API (configurable endpoint for local Ollama)
- **Voice Analysis**: Web Audio API (pitch, timing, amplitude analysis)
- **State Management**: Zustand
- **Storage**: IndexedDB (via idb) for local session storage

## Key Features
1. Audio upload + optional transcript upload
2. Auto-transcription via Whisper (configurable API endpoint)
3. Sentence-by-sentence audio segmentation
4. Shadowing practice flow: listen → shadow → feedback
5. Voice recording and analysis (pitch, timing, clarity scores)
6. Progressive difficulty: single sentence → multiple sentences
7. Dark/light mode toggle (dark by default)

## Architecture Notes
- AI backend URL is configurable in Settings (defaults to `http://localhost:11434` for Ollama)
- All audio processing happens client-side via Web Audio API
- Transcripts and sessions are stored locally in IndexedDB
- No user auth required — fully local-first

## Development Guidelines
- Use the App Router (`app/` directory) for all pages and API routes
- Keep components in `src/components/`
- Use `src/lib/` for utilities and API client logic
- Use `src/hooks/` for custom React hooks
- Prefer server components unless client interactivity is needed (`"use client"`)
- Follow shadcn/ui patterns for all UI components
