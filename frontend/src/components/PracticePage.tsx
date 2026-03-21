import { useState } from 'react'
import SentenceCard from './SentenceCard'
import MultiSentenceMode from './MultiSentenceMode'
import ProgressTracker from './ProgressTracker'
import ThemeToggle from './ThemeToggle'
import { isConfigured } from '../lib/api'
import type { Session, Sentence, SentenceProgress, AnalysisResult } from '../types'

interface PracticePageProps {
  session: Session
  darkMode: boolean
  onThemeToggle: () => void
  onNewSession: () => void
  onChangeApiKey: () => void
}

export default function PracticePage({
  session,
  darkMode,
  onThemeToggle,
  onNewSession,
  onChangeApiKey,
}: PracticePageProps) {
  const [sentences, setSentences] = useState<Sentence[]>(session.sentences)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [progress, setProgress] = useState<Record<number, SentenceProgress>>({})
  const [showMulti, setShowMulti] = useState(false)
  // Start open on desktop (lg = 1024px), closed on mobile so it doesn't cover content
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024)
  const [showFurigana, setShowFurigana] = useState(false)

  const { session_id } = session
  const currentSentence = sentences[currentIndex]

  // ── sentence mutations ──────────────────────────────────────────────────

  const updateSentenceText = (id: number, newText: string) => {
    setSentences((prev) => prev.map((s) => (s.id === id ? { ...s, text: newText } : s)))
  }

  const mergeSentences = (index: number) => {
    if (index >= sentences.length - 1) return
    setSentences((prev) => {
      const next = [...prev]
      const a = next[index]
      const b = next[index + 1]
      const merged: Sentence = {
        id: a.id,
        text: a.text + b.text,
        start: a.start,
        end: b.end,
        segmentUrls: [...a.segmentUrls, ...b.segmentUrls],
      }
      next.splice(index, 2, merged)
      return next.map((s, i) => ({ ...s, id: i }))
    })
    // Clear both merged sentences' scores; shift IDs above them down by 1
    setProgress((prev) => {
      const next: Record<number, SentenceProgress> = {}
      for (const [key, val] of Object.entries(prev)) {
        const id = parseInt(key)
        if (id < index) next[id] = val
        else if (id === index || id === index + 1) { /* dropped */ }
        else next[id - 1] = { ...val, sentence_id: id - 1 }
      }
      return next
    })
    if (currentIndex > index) setCurrentIndex((i) => Math.max(0, i - 1))
    else if (currentIndex === index + 1) setCurrentIndex(index)
  }

  const splitSentence = (index: number, textA: string, textB: string) => {
    setSentences((prev) => {
      const next = [...prev]
      const s = next[index]
      const frac = textA.length / (textA.length + textB.length)
      const mid = s.start + (s.end - s.start) * frac
      const sA: Sentence = { id: s.id, text: textA, start: s.start, end: mid, segmentUrls: s.segmentUrls }
      const sB: Sentence = { id: s.id + 0.5, text: textB, start: mid, end: s.end, segmentUrls: s.segmentUrls }
      next.splice(index, 1, sA, sB)
      return next.map((s, i) => ({ ...s, id: i }))
    })
    // Clear the split sentence's score; shift IDs above it up by 1
    setProgress((prev) => {
      const next: Record<number, SentenceProgress> = {}
      for (const [key, val] of Object.entries(prev)) {
        const id = parseInt(key)
        if (id < index) next[id] = val
        else if (id === index) { /* dropped — now two new sentences */ }
        else next[id + 1] = { ...val, sentence_id: id + 1 }
      }
      return next
    })
  }

  // ── scoring ──────────────────────────────────────────────────────────────

  const handleScored = (sentenceId: number, score: number, result: AnalysisResult) => {
    setProgress((prev) => {
      const existing = prev[sentenceId]
      return {
        ...prev,
        [sentenceId]: {
          sentence_id: sentenceId,
          attempts: (existing?.attempts ?? 0) + 1,
          best_score: Math.max(score, existing?.best_score ?? 0),
          latest_score: score,
          last_result: result,
        },
      }
    })
  }

  const handleMultiScored = (scores: { id: number; result: AnalysisResult }[]) => {
    setProgress((prev) => {
      const next = { ...prev }
      for (const { id, result } of scores) {
        const existing = next[id]
        next[id] = {
          sentence_id: id,
          attempts: (existing?.attempts ?? 0) + 1,
          best_score: Math.max(result.score, existing?.best_score ?? 0),
          latest_score: result.score,
          last_result: result,
        }
      }
      return next
    })
  }

  const scoreColor = (score: number | null) => {
    if (score === null) return ''
    if (score >= 80) return 'text-green-500'
    if (score >= 60) return 'text-yellow-500'
    return 'text-red-500'
  }

  const scoreBg = (score: number | null) => {
    if (score === null) return ''
    if (score >= 80) return 'bg-green-500/10'
    if (score >= 60) return 'bg-yellow-500/10'
    return 'bg-red-500/10'
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col transition-colors duration-200">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="btn-ghost p-2 rounded-lg lg:hidden"
              title="Toggle sentence list"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <span className="text-xl hidden sm:inline">影</span>
            <span className="font-bold text-base tracking-tight truncate">Shadow Renshuu</span>
            <span className="hidden md:inline text-xs text-gray-400 dark:text-gray-500 ml-1 truncate">
              {sentences.length} sentences
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Furigana toggle */}
            <button
              onClick={() => isConfigured() && setShowFurigana((v) => !v)}
              title={isConfigured() ? (showFurigana ? 'Hide furigana' : 'Show furigana') : 'Add an AI API key in settings (✨) to enable furigana'}
              className={`btn-ghost px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                !isConfigured()
                  ? 'opacity-40 cursor-not-allowed'
                  : showFurigana
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                  : ''
              }`}
            >
              <span className="font-jp text-sm">あ</span>
              <span className="hidden sm:inline">Furigana</span>
            </button>

            <button
              onClick={onChangeApiKey}
              className="btn-ghost p-2 rounded-lg"
              title="AI Provider Settings"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
            </button>

            <ThemeToggle darkMode={darkMode} onToggle={onThemeToggle} />

            <button
              onClick={onNewSession}
              className="btn-secondary text-sm py-1.5 px-3 hidden sm:flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Session
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile backdrop — closes sidebar on tap-outside */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — fixed overlay on mobile, inline collapse on desktop */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 flex-shrink-0 flex flex-col w-72
            border-r border-gray-200 dark:border-gray-800
            bg-white dark:bg-gray-900
            transition-all duration-300
            lg:relative lg:inset-auto lg:z-auto
            ${sidebarOpen
              ? 'translate-x-0 lg:w-72'
              : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'
            }
          `}
        >
          <div className="px-3 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Sentences
            </p>
            {/* Close button — mobile only */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sentences.map((s, i) => {
              const prog = progress[s.id]
              const score = prog?.latest_score ?? null
              const attempted = prog && prog.attempts > 0
              const isActive = i === currentIndex
              const isLast = i === sentences.length - 1

              return (
                <div key={s.id}>
                  <button
                    onClick={() => { setCurrentIndex(i); setSidebarOpen(false) }}
                    className={`
                      w-full text-left px-3 py-2.5 transition-colors duration-100
                      flex items-start gap-2.5
                      ${isActive
                        ? 'bg-purple-50 dark:bg-purple-900/20 border-l-2 border-purple-500'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-2 border-transparent'
                      }
                    `}
                  >
                    <span className={`text-xs font-mono mt-0.5 w-5 flex-shrink-0 ${isActive ? 'text-purple-500' : 'text-gray-400 dark:text-gray-600'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      {/* Larger text: text-sm instead of text-xs */}
                      <p className={`text-sm font-jp leading-snug truncate ${isActive ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                        {s.text}
                      </p>
                      {attempted && score !== null && (
                        <span className={`inline-block mt-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${scoreColor(score)} ${scoreBg(score)}`}>
                          {score}/100
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Merge divider — shown between sentences */}
                  {!isLast && (
                    <button
                      onClick={() => mergeSentences(i)}
                      title="Merge with next sentence"
                      className="w-full flex items-center gap-2 px-3 py-0.5 opacity-0 hover:opacity-100 transition-opacity group"
                    >
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700 group-hover:bg-purple-400 dark:group-hover:bg-purple-600 transition-colors" />
                      <span className="text-xs text-gray-400 group-hover:text-purple-500 transition-colors flex-shrink-0">
                        ⊕ merge
                      </span>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700 group-hover:bg-purple-400 dark:group-hover:bg-purple-600 transition-colors" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <ProgressTracker total={sentences.length} progress={progress} />

          <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 sm:hidden">
            <button onClick={onNewSession} className="w-full btn-secondary text-sm py-2">
              + New Session
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-2xl mx-auto">
            {currentSentence ? (
              <SentenceCard
                key={currentSentence.id}
                sentence={currentSentence}
                sentenceIndex={currentIndex}
                totalSentences={sentences.length}
                sessionId={session_id}
                showFurigana={showFurigana}
                onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                onNext={() => setCurrentIndex((i) => Math.min(sentences.length - 1, i + 1))}
                onScored={(score, result) => handleScored(currentSentence.id, score, result)}
                onEditText={(newText) => updateSentenceText(currentSentence.id, newText)}
                onSplit={(textA, textB) => splitSentence(currentIndex, textA, textB)}
                initialResult={progress[currentSentence.id]?.last_result ?? null}
                onMultiMode={() => setShowMulti(true)}
              />
            ) : (
              <div className="text-center py-20 text-gray-400 dark:text-gray-600">
                No sentences available.
              </div>
            )}
          </div>
        </main>
      </div>

      {showMulti && (
        <MultiSentenceMode
          sentences={sentences}
          sessionId={session_id}
          startIndex={currentIndex}
          onClose={() => setShowMulti(false)}
          onScored={handleMultiScored}
        />
      )}
    </div>
  )
}
