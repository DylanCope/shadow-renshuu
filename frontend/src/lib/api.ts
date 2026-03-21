import type { AnalysisResult, FuriganaSegment, Session } from '../types'

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api'

/** Set VITE_SHOW_OLLAMA=false in production to hide the local Ollama option */
export const ollamaEnabled = import.meta.env.VITE_SHOW_OLLAMA !== 'false'

export type Provider = 'anthropic' | 'gemini' | 'ollama'

// ── Provider / key storage ──────────────────────────────────────────────

export function getProvider(): Provider {
  const stored = localStorage.getItem('ai_provider') as Provider | null
  if (!stored) return 'anthropic'
  // If Ollama is disabled in this deployment, fall back to anthropic
  if (stored === 'ollama' && !ollamaEnabled) return 'anthropic'
  return stored
}
export function setProvider(p: Provider) {
  localStorage.setItem('ai_provider', p)
}

export function getApiKey(): string {
  return localStorage.getItem('anthropic_api_key') ?? ''
}
export function setApiKey(key: string) {
  localStorage.setItem('anthropic_api_key', key.trim())
}

export function getGeminiKey(): string {
  return localStorage.getItem('gemini_api_key') ?? ''
}
export function setGeminiKey(key: string) {
  localStorage.setItem('gemini_api_key', key.trim())
}

export function getOllamaModel(): string {
  return localStorage.getItem('ollama_model') ?? 'gemma3'
}
export function setOllamaModel(model: string) {
  localStorage.setItem('ollama_model', model.trim() || 'gemma3')
}

export function getGeminiModel(): string {
  const stored = localStorage.getItem('gemini_model')
  // Migrate away from removed/restricted models
  if (!stored || stored.startsWith('gemini-1.') || stored === 'gemini-2.0-flash' || stored === 'gemini-2.0-flash-lite') {
    localStorage.setItem('gemini_model', 'gemini-2.5-flash')
    return 'gemini-2.5-flash'
  }
  return stored
}
export function setGeminiModel(model: string) {
  localStorage.setItem('gemini_model', model.trim() || 'gemini-2.5-flash')
}

/** Returns true if the stored key has been successfully verified against the backend. */
export function isKeyVerified(): boolean {
  return localStorage.getItem('ai_key_verified') === 'true'
}
export function setKeyVerified(verified: boolean) {
  localStorage.setItem('ai_key_verified', verified ? 'true' : 'false')
}

/** Returns true if the current provider has verified credentials. */
export function isConfigured(): boolean {
  const p = getProvider()
  if (p === 'ollama') return true
  if (p === 'gemini') return !!getGeminiKey() && isKeyVerified()
  return !!getApiKey() && isKeyVerified()
}

// ── Request headers ─────────────────────────────────────────────────────

function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  const provider = getProvider()
  const key = provider === 'gemini' ? getGeminiKey() : getApiKey()
  return {
    ...(key ? { 'X-Api-Key': key } : {}),
    'X-Provider': provider,
    ...(provider === 'ollama' ? { 'X-Ollama-Model': getOllamaModel() } : {}),
    ...(provider === 'gemini' ? { 'X-Gemini-Model': getGeminiModel() } : {}),
    ...extra,
  }
}

const POLL_INTERVAL_MS = 2500
const POLL_TIMEOUT_MS = 10 * 60 * 1000  // 10 minutes max

export async function uploadAudio(
  audioFile: File,
  transcript?: string,
  onProgress?: (msg: string) => void,
): Promise<Session> {
  // ── Step 1: upload the file (fast — just saves to disk on the server)
  const form = new FormData()
  form.append('audio', audioFile)
  if (transcript && transcript.trim()) {
    form.append('transcript', transcript.trim())
  }

  onProgress?.('Uploading audio…')
  const uploadRes = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    headers: apiHeaders(),
    body: form,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({ detail: uploadRes.statusText }))
    throw new Error(err.detail || 'Upload failed')
  }

  const { job_id } = await uploadRes.json()

  // ── Step 2: poll /api/status/{job_id} until done
  // Short requests resume naturally after the tab is backgrounded / screen locks.
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

    let job: { status: string; progress: string; result: any; error: string | null }
    try {
      const statusRes = await fetch(`${BASE_URL}/status/${job_id}`, { headers: apiHeaders() })
      if (!statusRes.ok) {
        // Transient network blip — keep polling
        continue
      }
      job = await statusRes.json()
    } catch {
      // Tab was suspended / network blip — keep trying
      continue
    }

    if (job.progress) onProgress?.(job.progress)

    if (job.status === 'done') {
      const data = job.result
      const backendOrigin = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
      const toAbsolute = (url: string) =>
        url.startsWith('http') ? url : `${backendOrigin}${url}`
      return {
        ...data,
        sentences: data.sentences.map((s: any) => {
          const urls: string[] = s.segmentUrls ?? [s.segmentUrl]
          return { ...s, segmentUrls: urls.map(toAbsolute) }
        }),
      } as Session
    }

    if (job.status === 'error') {
      throw new Error(job.error || 'Processing failed')
    }
  }

  throw new Error('Processing timed out. Please try again.')
}

export async function analyzeAttempt(params: {
  session_id: string
  sentence_id: number
  user_transcript: string
  target_text: string
}): Promise<AnalysisResult> {
  const res = await fetch(`${BASE_URL}/analyze`, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Analysis failed')
  }

  return res.json()
}

export async function getFurigana(text: string): Promise<FuriganaSegment[]> {
  const res = await fetch(`${BASE_URL}/furigana`, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Furigana fetch failed')
  }
  const data = await res.json()
  return data.segments
}

export async function getTranslation(text: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/translate`, {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Translation fetch failed')
  }
  const data = await res.json()
  return data.translation
}

export async function verifyApiKey(
  provider: Provider,
  key: string,
  opts: { geminiModel?: string } = {},
): Promise<void> {
  const headers: Record<string, string> = {
    'X-Provider': provider,
    ...(key ? { 'X-Api-Key': key } : {}),
    ...(opts.geminiModel ? { 'X-Gemini-Model': opts.geminiModel } : {}),
  }
  const res = await fetch(`${BASE_URL}/verify-key`, { method: 'POST', headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Verification failed' }))
    throw new Error(err.detail || 'Invalid API key')
  }
}

export async function transcribeAudio(blob: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData()
  // Derive the correct extension from the actual recorded MIME type so ffmpeg decodes properly.
  // Mobile Chrome records audio/mp4; desktop Chrome records audio/webm;codecs=opus.
  const type = blob.type || 'audio/webm'
  const ext = /mp4|m4a/i.test(type) ? 'm4a'
    : /ogg/i.test(type) ? 'ogg'
    : 'webm'
  form.append('audio', blob, `recording.${ext}`)
  const res = await fetch(`${BASE_URL}/transcribe`, { method: 'POST', body: form, signal })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Transcription failed')
  }
  const data = await res.json()
  return data.text as string
}
