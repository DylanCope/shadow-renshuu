import { useState, useRef, useEffect } from 'react'
import RecordButton from './RecordButton'
import ScoreDisplay from './ScoreDisplay'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { analyzeAttempt, getFurigana, getTranslation, transcribeAudio, isConfigured } from '../lib/api'
import type { Sentence, AnalysisResult, FuriganaSegment, PracticeMode } from '../types'

interface SentenceCardProps {
  sentence: Sentence
  sentenceIndex: number
  totalSentences: number
  sessionId: string
  showFurigana: boolean
  onPrev: () => void
  onNext: () => void
  onScored: (score: number, result: AnalysisResult) => void
  onEditText: (newText: string) => void
  onSplit: (textA: string, textB: string) => void
  onFuriganaFetched?: (furigana: FuriganaSegment[]) => void
  onTranslationFetched?: (translation: string) => void
  initialResult?: AnalysisResult | null
  onMultiMode: () => void
}

// ── Furigana renderer ─────────────────────────────────────────────────────

const hasKanji = (s: string) => /[\u4e00-\u9faf\u3400-\u4dbf]/.test(s)

function FuriganaText({ segments }: { segments: FuriganaSegment[] }) {
  return (
    <span>
      {segments.map((seg, i) =>
        seg.reading && hasKanji(seg.base) ? (
          <ruby key={i} className="ruby-text">
            {seg.base}
            <rt className="text-purple-400 dark:text-purple-300">{seg.reading}</rt>
          </ruby>
        ) : (
          <span key={i}>{seg.base}</span>
        )
      )}
    </span>
  )
}

// ── Mic selector ─────────────────────────────────────────────────────────

interface MicSelectorProps {
  devices: MediaDeviceInfo[]
  selectedId: string
  onSelect: (id: string) => void
  onEnumerate: () => void
}

function MicSelector({ devices, selectedId, onSelect, onEnumerate }: MicSelectorProps) {
  if (devices.length === 0) {
    return (
      <button
        onClick={onEnumerate}
        className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
        title="Choose microphone"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
        Choose microphone
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="text-xs bg-transparent text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-500 max-w-[200px] truncate"
      >
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function SentenceCard({
  sentence,
  sentenceIndex,
  totalSentences,
  sessionId,
  showFurigana,
  onPrev,
  onNext,
  onScored,
  onEditText,
  onSplit,
  onFuriganaFetched,
  onTranslationFetched,
  initialResult,
  onMultiMode,
}: SentenceCardProps) {
  const [mode, setMode] = useState<PracticeMode>('listen')
  const [showTranscript, setShowTranscript] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(initialResult ?? null)
  const [error, setError] = useState<string | null>(null)

  // Furigana — seed from cached value on the sentence if available
  const [furiganaSegments, setFuriganaSegments] = useState<FuriganaSegment[] | null>(sentence.furigana ?? null)
  const [furiganaLoading, setFuriganaLoading] = useState(false)

  // Translation — seed from cached value on the sentence if available
  const [translation, setTranslation] = useState<string | null>(sentence.translation ?? null)
  const [translationLoading, setTranslationLoading] = useState(false)
  const [translationRevealed, setTranslationRevealed] = useState(sentence.translation != null)
  const [showTranslation, setShowTranslation] = useState(false)

  // Playback of own recording
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const recordingBlobRef = useRef<Blob | null>(null)
  const [recorded, setRecorded] = useState(false)
  const [playingRecording, setPlayingRecording] = useState(false)
  const recordingAudioRef = useRef<HTMLAudioElement | null>(null)
  const blobPromiseRef = useRef<Promise<Blob> | null>(null)

  // Whisper transcription (runs automatically after stop)
  const [transcribing, setTranscribing] = useState(false)
  const [autoTranscript, setAutoTranscript] = useState<string | null>(null)
  const [transcriptEditable, setTranscriptEditable] = useState('')
  const transcribeAbortRef = useRef<AbortController | null>(null)

  // Mic device selection
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>('')

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(sentence.text)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  const audioRefs = useRef<HTMLAudioElement[]>([])
  const recorder = useAudioRecorder()

  // Enumerate microphones when entering record mode.
  // We do NOT call getUserMedia here — that must happen inside a user gesture (the record button).
  // Labels will be blank on first visit but device IDs are enough for selection.
  useEffect(() => {
    if (mode !== 'record') return
    const enumerate = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices()
        const mics = all.filter(d => d.kind === 'audioinput')
        setMicDevices(mics)
        setSelectedMicId(prev => prev || (mics[0]?.deviceId ?? ''))
      } catch { /* mediaDevices unavailable */ }
    }
    enumerate()
  }, [mode])
  useEffect(() => {
    setMode('listen')
    setShowTranscript(true)
    setIsPlaying(false)
    setResult(initialResult ?? null)
    setError(null)
    setEditing(false)
    setEditDraft(sentence.text)
    setFuriganaSegments(sentence.furigana ?? null)
    setTranslation(sentence.translation ?? null)
    setTranslationRevealed(sentence.translation != null)
    setShowTranslation(false)
    setRecordingUrl(null)
    setRecorded(false)
    setPlayingRecording(false)
    setAutoTranscript(null)
    setTranscriptEditable('')
    setTranscribing(false)
    setAnalyzing(false)
    blobPromiseRef.current = null
    recordingBlobRef.current = null
    transcribeAbortRef.current?.abort()
    transcribeAbortRef.current = null
    audioRefs.current.forEach((a) => { a.pause(); a.currentTime = 0 })
  }, [sentence.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset furigana + translation when text changes (edit / merge)
  const prevTextRef = useRef(sentence.text)
  useEffect(() => {
    if (prevTextRef.current === sentence.text) return
    prevTextRef.current = sentence.text
    setFuriganaSegments(null)
    setTranslation(null)
    setEditDraft(sentence.text)
    // If translation was already visible, re-fetch immediately
    if (showTranslation) {
      setTranslationLoading(true)
      getTranslation(sentence.text)
        .then((t) => {
          setTranslation(t)
          onTranslationFetched?.(t)
        })
        .catch((err) => setTranslation(`(${err instanceof Error ? err.message : 'Translation failed'})`))
        .finally(() => setTranslationLoading(false))
    }
  }, [sentence.text])

  // Fetch furigana when toggled on
  useEffect(() => {
    if (!showFurigana || furiganaSegments) return
    setFuriganaLoading(true)
    getFurigana(sentence.text)
      .then((segs) => {
        setFuriganaSegments(segs)
        onFuriganaFetched?.(segs)
      })
      .catch(() => setFuriganaSegments([{ base: sentence.text }]))
      .finally(() => setFuriganaLoading(false))
  }, [showFurigana, sentence.text, furiganaSegments])

  // ── audio playback (supports merged multi-segment sentences) ──────────

  const playAudio = async () => {
    if (isPlaying) {
      audioRefs.current.forEach((a) => a.pause())
      setIsPlaying(false)
      return
    }
    setIsPlaying(true)
    for (const url of sentence.segmentUrls) {
      await new Promise<void>((resolve) => {
        const audio = new Audio(url)
        audioRefs.current.push(audio)
        audio.onended = () => resolve()
        audio.onerror = () => resolve()
        audio.play().catch(() => resolve())
      })
    }
    setIsPlaying(false)
  }

  // ── recording & analysis ──────────────────────────────────────────────

  const handleStartRecording = () => {
    setError(null)
    setRecordingUrl(null)
    setRecorded(false)
    blobPromiseRef.current = recorder.startRecording(selectedMicId || undefined)
  }

  const handleStopRecording = async () => {
    recorder.stopRecording()
    const blob = await (blobPromiseRef.current?.catch(() => null) ?? null)
    if (blob && blob.size > 0) {
      recordingBlobRef.current = blob
      setRecordingUrl(URL.createObjectURL(blob))
      // Show the review UI immediately — transcription spinner displays within it
      setRecorded(true)
      setTranscribing(true)
      setAutoTranscript(null)
      setTranscriptEditable('')
      const abortController = new AbortController()
      transcribeAbortRef.current = abortController
      try {
        const text = await transcribeAudio(blob, abortController.signal)
        if (abortController.signal.aborted) return
        const trimmed = text.trim()
        setAutoTranscript(trimmed || null)  // empty string → null (show manual entry fallback)
        setTranscriptEditable(trimmed)
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return  // user re-recorded, ignore
        setAutoTranscript(null) // null signals fallback to manual entry
      } finally {
        if (!abortController.signal.aborted) setTranscribing(false)
      }
    } else {
      setRecorded(true)
    }
  }

  const handleSubmit = async () => {
    setError(null)
    const speechText = transcriptEditable.trim()
    if (!speechText) return
    await submitTranscript(speechText)
  }

  const submitTranscript = async (transcript: string) => {
    setAnalyzing(true)
    setError(null)
    try {
      const analysis = await analyzeAttempt({
        session_id: sessionId,
        sentence_id: sentence.id,
        user_transcript: transcript,
        target_text: sentence.text,
      })
      analysis.user_transcript = transcript
      setResult(analysis)
      setMode('feedback')
      onScored(analysis.score, analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  // ── translation ───────────────────────────────────────────────────────

  const handleShowTranslation = () => {
    setShowTranslation(true)
    if (translation) return
    setTranslationLoading(true)
    getTranslation(sentence.text)
      .then((t) => {
        setTranslation(t)
        onTranslationFetched?.(t)
      })
      .catch((err) => setTranslation(`(${err instanceof Error ? err.message : 'Translation failed'})`))
      .finally(() => setTranslationLoading(false))
  }

  // ── edit / split ──────────────────────────────────────────────────────

  const handleSaveEdit = () => {
    onEditText(editDraft.trim() || sentence.text)
    setEditing(false)
  }

  const handleSplit = () => {
    const el = editTextareaRef.current
    if (!el) return
    const pos = el.selectionStart
    const textA = editDraft.slice(0, pos).trim()
    const textB = editDraft.slice(pos).trim()
    if (!textA || !textB) {
      setError('Place the cursor in the middle of the text to split.')
      return
    }
    onSplit(textA, textB)
    setEditing(false)
  }

  // ── render helpers ────────────────────────────────────────────────────

  const modeSteps: { key: PracticeMode; label: string }[] = [
    { key: 'listen', label: 'Listen' },
    { key: 'shadow', label: 'Shadow' },
    { key: 'record', label: 'Record' },
    { key: 'feedback', label: 'Feedback' },
  ]
  const modeIndex = modeSteps.findIndex((m) => m.key === mode)

  const japaneseText = (
    <div className="text-center">
      {editing ? (
        <div className="space-y-2 text-left">
          <textarea
            ref={editTextareaRef}
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            className="w-full h-24 px-3 py-2 rounded-lg border border-purple-400 dark:border-purple-600
                       bg-gray-50 dark:bg-gray-800 text-xl font-jp
                       focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Place cursor where you want to split, then click ↕ Split.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleSaveEdit} className="btn-primary text-sm">Save</button>
            <button onClick={handleSplit} className="btn-secondary text-sm flex items-center gap-1">
              ↕ Split here
            </button>
            <button onClick={() => { setEditing(false); setEditDraft(sentence.text) }} className="btn-ghost text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-center gap-2">
          <p className="text-2xl sm:text-3xl font-jp font-medium leading-loose text-gray-900 dark:text-gray-100">
            {showFurigana
              ? furiganaLoading
                ? <span className="opacity-50">{sentence.text}</span>
                : furiganaSegments
                  ? <FuriganaText segments={furiganaSegments} />
                  : sentence.text
              : sentence.text
            }
          </p>
          <button
            onClick={() => { setEditing(true); setEditDraft(sentence.text) }}
            className="mt-1 p-1 rounded text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 transition-colors flex-shrink-0"
            title="Edit transcript"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        {sentence.start.toFixed(1)}s – {sentence.end.toFixed(1)}s
      </p>

      {/* Translation row */}
      {!showTranslation ? (
        isConfigured() ? (
          <button
            onClick={handleShowTranslation}
            className="mt-2 text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors flex items-center gap-1 mx-auto"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
            </svg>
            Generate translation
          </button>
        ) : (
          <span
            title="Add an AI API key in settings (✨) to enable translations"
            className="mt-2 text-xs text-gray-300 dark:text-gray-700 flex items-center gap-1 mx-auto cursor-not-allowed select-none"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
            </svg>
            Generate translation
          </span>
        )
      ) : (
        <div className="mt-2">
          {translationLoading ? (
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Translating…
            </div>
          ) : (
            <p
              className={`text-sm text-gray-500 dark:text-gray-400 italic transition-all duration-300 cursor-pointer ${
                translationRevealed ? '' : 'blur-sm select-none'
              }`}
              onClick={() => setTranslationRevealed(true)}
              title={translationRevealed ? '' : 'Click to reveal'}
            >
              {translation ?? ''}
              {!translationRevealed && (
                <span className="ml-1 text-xs not-italic text-gray-400">(click to reveal)</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full animate-slide-up">
      {/* Mode steps */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1">
          {modeSteps.map((step, i) => (
            <div key={step.key} className="flex items-center">
              <button
                onClick={() => { if (step.key !== 'feedback' || result) setMode(step.key) }}
                disabled={step.key === 'feedback' && !result}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150
                  ${mode === step.key
                    ? 'bg-purple-600 text-white'
                    : i < modeIndex
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                  } disabled:cursor-not-allowed`}
              >
                {step.label}
              </button>
              {i < modeSteps.length - 1 && (
                <div className={`w-4 h-px mx-0.5 ${i < modeIndex ? 'bg-purple-400' : 'bg-gray-300 dark:bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        <button onClick={onMultiMode} className="text-xs btn-ghost py-1 px-2 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
          </svg>
          Multi
        </button>
      </div>

      <div className="text-center mb-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Sentence {sentenceIndex + 1} of {totalSentences}
        </span>
      </div>

      {/* Main card */}
      <div className="flex-1 card p-6 mb-4 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {/* Text / transcript */}
          {(showTranscript || mode === 'listen' || mode === 'feedback') ? (
            japaneseText
          ) : (
            <button
              onClick={() => setShowTranscript(true)}
              className="text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors text-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.641 0-8.58-3.007-9.964-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Reveal transcript
            </button>
          )}

          {/* Play button(s) */}
          {mode === 'feedback' ? (
            <div className="flex items-end gap-10">
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={playAudio}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 shadow-md
                    ${isPlaying ? 'bg-purple-700 hover:bg-purple-800 shadow-purple-500/30' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'}`}
                  title={isPlaying ? 'Pause' : 'Play native'}
                >
                  {isPlaying ? (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400">Native</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <button
                  disabled={!recordingUrl}
                  onClick={() => {
                    if (!recordingUrl) return
                    if (playingRecording) {
                      recordingAudioRef.current?.pause()
                      setPlayingRecording(false)
                    } else {
                      recordingAudioRef.current?.play()
                        .then(() => setPlayingRecording(true))
                        .catch(() => setPlayingRecording(false))
                    }
                  }}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 shadow-md
                    ${
                      !recordingUrl
                        ? 'bg-gray-300 dark:bg-gray-700 opacity-50 cursor-not-allowed'
                        : playingRecording
                        ? 'bg-blue-700 hover:bg-blue-800 shadow-blue-500/30'
                        : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                    }`}
                  title={!recordingUrl ? 'No recording captured' : playingRecording ? 'Stop' : 'Play your recording'}
                >
                  {playingRecording ? (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400">Yours</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={playAudio}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 shadow-md
                  ${isPlaying ? 'bg-purple-700 hover:bg-purple-800 shadow-purple-500/30' : 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'}`}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {mode === 'listen' && 'Listen carefully'}
                {mode === 'shadow' && 'Shadow along as it plays'}
                {mode === 'record' && 'Record your attempt below'}
              </p>
            </div>
          )}
        </div>

        {/* Mode controls */}
        <div className="mt-6">
          {mode === 'listen' && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <button onClick={() => { setShowTranscript(false); setMode('shadow') }} className="btn-primary flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811V8.69zM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061a1.125 1.125 0 01-1.683-.977V8.69z" />
                  </svg>
                  Start Shadowing
                </button>
                <button onClick={() => setMode('record')} className="btn-secondary">Skip to Record</button>
              </div>
            </div>
          )}

          {mode === 'shadow' && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Play the audio and shadow along. When ready, record your attempt.
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowTranscript((v) => !v)} className="btn-secondary text-sm">
                  {showTranscript ? 'Hide' : 'Show'} transcript
                </button>
                <button onClick={() => { setShowTranscript(false); setMode('record') }} className="btn-primary flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                  Ready to Record
                </button>
              </div>
            </div>
          )}

          {mode === 'record' && (
            <div className="flex flex-col items-center gap-4">

              {/* Transcript toggle */}
              <button
                onClick={() => setShowTranscript((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showTranscript ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                    Hide transcript
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.641 0-8.58-3.007-9.964-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Show transcript
                  </>
                )}
              </button>

              {/* Phase 1: record button — hide once stopped and reviewed */}
              {!recorded && (
                <div className="flex flex-col items-center gap-3">
                  <RecordButton
                    isRecording={recorder.isRecording}
                    duration={recorder.duration}
                    onStart={handleStartRecording}
                    onStop={handleStopRecording}
                    disabled={analyzing || transcribing}
                  />

                  {/* Mic selector — only shown on non-touch desktop where multiple mics may exist */}
                  {!recorder.isRecording && navigator.maxTouchPoints === 0 && (
                    <MicSelector
                      devices={micDevices}
                      selectedId={selectedMicId}
                      onSelect={setSelectedMicId}
                      onEnumerate={async () => {
                        try {
                          // Request permission so labels are populated, then re-enumerate
                          const s = await navigator.mediaDevices.getUserMedia({ audio: true })
                          s.getTracks().forEach(t => t.stop())
                          const all = await navigator.mediaDevices.enumerateDevices()
                          const mics = all.filter(d => d.kind === 'audioinput')
                          setMicDevices(mics)
                          if (!selectedMicId && mics.length > 0) setSelectedMicId(mics[0].deviceId)
                        } catch { /* permission denied — silently ignore */ }
                      }}
                    />
                  )}

                  {/* Show recording errors (e.g. permission denied) */}
                  {recorder.error && (
                    <p className="text-xs text-red-500 dark:text-red-400 text-center max-w-xs">
                      {recorder.error.includes('Permission') || recorder.error.includes('denied') || recorder.error.includes('NotAllowed')
                        ? 'Microphone access was denied. Please allow microphone access in your browser settings and try again.'
                        : recorder.error
                      }
                    </p>
                  )}
                </div>
              )}

              {/* Phase 2: review UI — shown after user stops recording */}
              {recorded && !recorder.isRecording && !analyzing && (
                <div className="flex flex-col items-center gap-3 w-full">
                  {/* Playback */}
                  <button
                    onClick={() => {
                      if (playingRecording) {
                        recordingAudioRef.current?.pause()
                        setPlayingRecording(false)
                      } else {
                        recordingAudioRef.current?.play()
                          .then(() => setPlayingRecording(true))
                          .catch(() => setPlayingRecording(false))
                      }
                    }}
                    disabled={!recordingUrl}
                    className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {playingRecording ? (
                      <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> Stop playback</>
                    ) : (
                      <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> {recordingUrl ? 'Play back recording' : 'No audio captured'}</>
                    )}
                  </button>

                  {/* Transcribing spinner */}
                  {transcribing && (
                    <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Transcribing recording…
                    </div>
                  )}

                  {/* Transcript review — editable, or manual entry if transcription failed */}
                  {!transcribing && (
                    <div className="w-full space-y-1">
                      {autoTranscript !== null ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Transcribed — edit if needed:</p>
                      ) : (
                        <p className="text-xs text-amber-500 dark:text-amber-400 text-center">Could not transcribe. Type what you said:</p>
                      )}
                      <textarea
                        value={transcriptEditable}
                        onChange={(e) => setTranscriptEditable(e.target.value)}
                        placeholder="Type what you said in Japanese…"
                        className="w-full h-16 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700
                                   bg-gray-50 dark:bg-gray-800 text-sm font-jp
                                   focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                      />
                    </div>
                  )}

                  {/* Action row — Re-record always visible; Submit only after transcription done */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        transcribeAbortRef.current?.abort()
                        transcribeAbortRef.current = null
                        setTranscribing(false)
                        setRecorded(false); setRecordingUrl(null); setPlayingRecording(false)
                        setAutoTranscript(null); setTranscriptEditable(''); recordingBlobRef.current = null
                      }}
                      className="btn-secondary text-sm"
                    >
                      Re-record
                    </button>
                    {!transcribing && (
                      isConfigured() ? (
                        <button
                          onClick={handleSubmit}
                          disabled={!transcriptEditable.trim()}
                          className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Submit for Analysis
                        </button>
                      ) : (
                        <span
                          title="Add an AI API key in settings (✨) to enable analysis"
                          className="btn-primary text-sm flex items-center gap-1.5 opacity-40 cursor-not-allowed select-none"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Submit for Analysis
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}

              {analyzing && (
                <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing with AI…
                </div>
              )}
            </div>
          )}

          {mode === 'feedback' && result && (
            <div className="space-y-4">
              <ScoreDisplay result={result} />
              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  onClick={() => { setResult(null); setRecorded(false); setRecordingUrl(null); setPlayingRecording(false); setAutoTranscript(null); setTranscriptEditable(''); recordingBlobRef.current = null; setMode('record') }}
                  className="btn-secondary text-sm flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Try Again
                </button>
                <button onClick={onNext} className="btn-primary text-sm flex items-center gap-1.5">
                  Next Sentence
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={onPrev} disabled={sentenceIndex === 0} className="btn-secondary flex items-center gap-1.5 text-sm">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Previous
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-600">{sentenceIndex + 1} / {totalSentences}</span>
        <button onClick={onNext} disabled={sentenceIndex === totalSentences - 1} className="btn-secondary flex items-center gap-1.5 text-sm">
          Next
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>

      {/* Hidden audio element for recording playback — more reliable than new Audio() on PC */}
      <audio
        ref={recordingAudioRef}
        src={recordingUrl ?? undefined}
        onEnded={() => setPlayingRecording(false)}
        onError={() => setPlayingRecording(false)}
        className="hidden"
      />
    </div>
  )
}
