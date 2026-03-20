import { useState, useRef } from 'react'
import RecordButton from './RecordButton'
import ScoreDisplay from './ScoreDisplay'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { analyzeAttempt } from '../lib/api'
import type { Sentence, AnalysisResult } from '../types'

interface MultiSentenceModeProps {
  sentences: Sentence[]
  sessionId: string
  startIndex: number
  onClose: () => void
  onScored: (scores: { id: number; result: AnalysisResult }[]) => void
}

export default function MultiSentenceMode({
  sentences,
  sessionId,
  startIndex,
  onClose,
  onScored,
}: MultiSentenceModeProps) {
  const MAX_SENTENCES = sentences.length
  const [count, setCount] = useState(Math.min(2, MAX_SENTENCES))
  const [phase, setPhase] = useState<'setup' | 'listen' | 'record' | 'results'>('setup')
  const [currentPlayIdx, setCurrentPlayIdx] = useState(0)
  const [results, setResults] = useState<{ id: number; result: AnalysisResult }[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualTranscripts, setManualTranscripts] = useState<string[]>([])
  const [showManual, setShowManual] = useState(false)

  const recorder = useAudioRecorder()
  const audioRef = useRef<HTMLAudioElement>(null)
  const selectedSentences = sentences.slice(startIndex, startIndex + count)

  const playSequence = async () => {
    setPhase('listen')
    setCurrentPlayIdx(0)
    for (let i = 0; i < selectedSentences.length; i++) {
      setCurrentPlayIdx(i)
      for (const url of selectedSentences[i].segmentUrls) {
        await playAudio(url)
      }
      // Short pause between sentences
      await sleep(400)
    }
  }

  const playAudio = (src: string): Promise<void> => {
    return new Promise((resolve) => {
      const audio = new Audio(src)
      audio.onended = () => resolve()
      audio.onerror = () => resolve()
      audio.play().catch(() => resolve())
    })
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const handleRecord = async () => {
    setError(null)
    const recordingPromise = recorder.startRecording()

    // Use speech recognition to get transcript of entire sequence
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition

    let fullTranscript = ''

    if (SpeechRecognitionImpl) {
      try {
        fullTranscript = await new Promise<string>((resolve) => {
          const recognition = new SpeechRecognitionImpl()
          recognition.lang = 'ja-JP'
          recognition.continuous = true
          recognition.interimResults = false
          let accumulated = ''

          recognition.onresult = (event: SpeechRecognitionEvent) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              accumulated += event.results[i][0].transcript
            }
          }
          recognition.onend = () => resolve(accumulated)
          recognition.onerror = () => resolve(accumulated)
          recognition.start()
        })
      } catch {
        // Fall through to manual
      }
    }

    recorder.stopRecording()
    await recordingPromise.catch(() => {})

    if (!fullTranscript) {
      setShowManual(true)
      setManualTranscripts(selectedSentences.map(() => ''))
      return
    }

    await analyzeAll(fullTranscript)
  }

  const analyzeAll = async (fullTranscript: string) => {
    setAnalyzing(true)
    setError(null)

    // Split the transcript roughly by number of sentences
    const words = fullTranscript.split(/\s+/)
    const perSentence = Math.ceil(words.length / selectedSentences.length)

    const analysisResults: { id: number; result: AnalysisResult }[] = []

    for (let i = 0; i < selectedSentences.length; i++) {
      const s = selectedSentences[i]
      const chunk = words.slice(i * perSentence, (i + 1) * perSentence).join('')
      try {
        const r = await analyzeAttempt({
          session_id: sessionId,
          sentence_id: s.id,
          user_transcript: chunk || fullTranscript,
          target_text: s.text,
        })
        analysisResults.push({ id: s.id, result: r })
      } catch {
        analysisResults.push({
          id: s.id,
          result: { score: 0, tips: ['Analysis failed'], phonetic_notes: '', overall: 'Could not analyze' },
        })
      }
    }

    setResults(analysisResults)
    setPhase('results')
    onScored(analysisResults)
    setAnalyzing(false)
  }

  const analyzeManual = async () => {
    const combined = manualTranscripts.join(' ')
    await analyzeAll(combined)
  }

  const avgScore =
    results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.result.score, 0) / results.length)
      : 0

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="font-semibold text-base">Multi-Sentence Practice</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Setup phase */}
          {phase === 'setup' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Number of sentences to chain ({count})
                </label>
                <input
                  type="range"
                  min={2}
                  max={MAX_SENTENCES}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full accent-purple-600"
                />
                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-600 mt-1">
                  <span>2</span>
                  <span>{MAX_SENTENCES}</span>
                </div>
              </div>

              <div className="card p-4 space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Selected sentences:</p>
                {selectedSentences.map((s, i) => (
                  <div key={s.id} className="flex gap-2 text-sm">
                    <span className="text-purple-500 font-medium w-4">{i + 1}.</span>
                    <span className="font-jp text-gray-700 dark:text-gray-300">{s.text}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={playSequence} className="btn-primary flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Listen to Sequence
                </button>
                <button onClick={() => setPhase('record')} className="btn-secondary">
                  Skip to Record
                </button>
              </div>
            </div>
          )}

          {/* Listen phase */}
          {phase === 'listen' && (
            <div className="text-center space-y-4 py-4">
              <div className="space-y-2">
                {selectedSentences.map((s, i) => (
                  <div
                    key={s.id}
                    className={`px-4 py-2 rounded-lg font-jp text-sm transition-all duration-200 ${
                      i === currentPlayIdx
                        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 font-medium'
                        : i < currentPlayIdx
                        ? 'text-gray-400 dark:text-gray-600 line-through'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {s.text}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Playing sentence {currentPlayIdx + 1} of {selectedSentences.length}…
              </p>
              <audio ref={audioRef} />
              <button
                onClick={() => setPhase('record')}
                className="btn-secondary text-sm"
              >
                Done Listening — Record Now
              </button>
            </div>
          )}

          {/* Record phase */}
          {phase === 'record' && (
            <div className="space-y-4">
              <div className="card p-4 space-y-1.5">
                {selectedSentences.map((s, i) => (
                  <p key={s.id} className="text-sm font-jp text-gray-700 dark:text-gray-300">
                    <span className="text-purple-500 mr-1">{i + 1}.</span>
                    {s.text}
                  </p>
                ))}
              </div>

              <div className="flex flex-col items-center gap-4">
                <RecordButton
                  isRecording={recorder.isRecording}
                  duration={recorder.duration}
                  onStart={handleRecord}
                  onStop={() => recorder.stopRecording()}
                  disabled={analyzing}
                />

                {analyzing && (
                  <div className="flex items-center gap-2 text-sm text-purple-500">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analyzing all sentences…
                  </div>
                )}

                {showManual && !analyzing && (
                  <div className="w-full space-y-3">
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                      Speech recognition unavailable. Type what you said for each sentence:
                    </p>
                    {selectedSentences.map((s, i) => (
                      <div key={s.id}>
                        <label className="text-xs text-gray-500 dark:text-gray-400 font-jp mb-1 block">
                          {i + 1}. {s.text}
                        </label>
                        <input
                          type="text"
                          value={manualTranscripts[i] ?? ''}
                          onChange={(e) => {
                            const next = [...manualTranscripts]
                            next[i] = e.target.value
                            setManualTranscripts(next)
                          }}
                          placeholder="What you said…"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700
                                     bg-gray-50 dark:bg-gray-800 text-sm font-jp
                                     focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    ))}
                    <button
                      onClick={analyzeManual}
                      className="w-full btn-primary text-sm"
                    >
                      Analyze All
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}
            </div>
          )}

          {/* Results phase */}
          {phase === 'results' && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Overall sequence score</p>
                <p className={`text-4xl font-bold ${avgScore >= 80 ? 'text-green-500' : avgScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {avgScore}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">/100 average</p>
              </div>

              <div className="space-y-4">
                {results.map((r, i) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm font-jp text-gray-700 dark:text-gray-300 leading-relaxed">
                        {selectedSentences[i]?.text}
                      </p>
                    </div>
                    <ScoreDisplay result={r.result} />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setPhase('setup')
                    setResults([])
                    setShowManual(false)
                  }}
                  className="btn-secondary text-sm flex-1"
                >
                  Try Again
                </button>
                <button onClick={onClose} className="btn-primary text-sm flex-1">
                  Back to Practice
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
