import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import ThemeToggle from './ThemeToggle'
import SessionHistory from './SessionHistory'
import { uploadAudio } from '../lib/api'
import { saveSession } from '../lib/firestoreSessions'
import { auth } from '../lib/firebase'
import { signOut } from 'firebase/auth'
import type { Session } from '../types'

interface UploadPageProps {
  darkMode: boolean
  onThemeToggle: () => void
  onSession: (session: Session, docId?: string) => void
  onChangeApiKey: () => void
  userId: string
}

const ACCEPTED_TYPES = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac']
const ACCEPTED_MIME = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/x-m4a',
]

export default function UploadPage({ darkMode, onThemeToggle, onSession, onChangeApiKey, userId }: UploadPageProps) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingMsg, setLoadingMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped && isAudioFile(dropped)) {
      setFile(dropped)
      setError(null)
    } else {
      setError('Please drop a supported audio file (.mp3, .wav, .m4a, .ogg, .flac)')
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setError(null)
    }
  }

  const isAudioFile = (f: File) =>
    ACCEPTED_MIME.includes(f.type) ||
    ACCEPTED_TYPES.some((ext) => f.name.toLowerCase().endsWith(ext))

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setLoadingMsg('Uploading audio…')

    try {
      const session = await uploadAudio(file, transcript || undefined, (msg) => setLoadingMsg(msg))
      // Persist session to Firestore so it survives page reloads
      const docId = await saveSession(userId, session, file.name.replace(/\.[^.]+$/, ''))
      onSession(session, docId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">影</span>
            <div>
              <span className="font-bold text-lg tracking-tight">Shadow Renshuu</span>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                影練習
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onChangeApiKey}
              className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
              title="AI Provider Settings"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              onClick={() => signOut(auth)}
              className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
              title="Sign out"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
            <ThemeToggle darkMode={darkMode} onToggle={onThemeToggle} />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3 tracking-tight">
            Japanese Shadowing Practice
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto leading-relaxed">
            Upload a native speaker audio file to start shadowing practice with AI-powered feedback.
          </p>
        </div>

        {/* Upload card */}
        <div className="card p-6 shadow-sm mb-6">
          <h2 className="font-semibold text-base mb-4 text-gray-700 dark:text-gray-300">
            Upload Audio
          </h2>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
              transition-all duration-200 select-none
              ${dragging
                ? 'border-purple-500 bg-purple-500/10'
                : file
                ? 'border-purple-400 bg-purple-500/5'
                : 'border-gray-300 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="hidden"
              onChange={handleFileChange}
            />

            {file ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-purple-700 dark:text-purple-300">{file.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <div>
                  <p className="font-medium text-gray-600 dark:text-gray-400">
                    Drag & drop or <span className="text-purple-600 dark:text-purple-400">browse</span>
                  </p>
                  <p className="text-sm mt-1">
                    {ACCEPTED_TYPES.join(', ')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Transcript card */}
        <div className="card p-6 shadow-sm mb-6">
          <h2 className="font-semibold text-base mb-1 text-gray-700 dark:text-gray-300">
            Transcript{' '}
            <span className="font-normal text-gray-400 dark:text-gray-500 text-sm">(optional)</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            If you have the transcript, paste it here (one sentence per line).
            Otherwise Whisper will auto-transcribe.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={'例：\nおはようございます。\nよろしくお願いします。'}
            className="w-full h-32 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700
                       bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                       resize-none text-sm font-jp placeholder:text-gray-400 dark:placeholder:text-gray-600"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="w-full btn-primary py-3 text-base flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white/80" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>{loadingMsg}</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Start Practice Session
            </>
          )}
        </button>

        {/* Previous sessions */}
        <div className="mt-10">
          <h2 className="font-semibold text-base mb-3 text-gray-700 dark:text-gray-300">
            Previous Sessions
          </h2>
          <SessionHistory userId={userId} onResume={onSession} />
        </div>

        {/* How it works */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: '🎵',
              title: 'Auto-Segment',
              desc: 'Audio is automatically split into individual sentences with Whisper.',
            },
            {
              icon: '🗣️',
              title: 'Shadow Practice',
              desc: 'Listen, repeat, record — practice each sentence at your own pace.',
            },
            {
              icon: '🤖',
              title: 'AI Feedback',
              desc: 'Large Language Model (LLM) based analysis of your transcribed sentences to give personalised tips.',
            },
          ].map((item) => (
            <div key={item.title} className="card p-4 text-center">
              <div className="text-3xl mb-2">{item.icon}</div>
              <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
