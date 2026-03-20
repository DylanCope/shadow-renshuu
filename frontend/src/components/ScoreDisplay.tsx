import type { AnalysisResult } from '../types'

interface ScoreDisplayProps {
  result: AnalysisResult
}

function scoreColor(score: number) {
  if (score >= 80) return { stroke: '#22c55e', text: 'text-green-500', bg: 'bg-green-500/10' }
  if (score >= 60) return { stroke: '#eab308', text: 'text-yellow-500', bg: 'bg-yellow-500/10' }
  return { stroke: '#ef4444', text: 'text-red-500', bg: 'bg-red-500/10' }
}

function scoreLabel(score: number) {
  if (score >= 90) return 'Excellent!'
  if (score >= 80) return 'Great!'
  if (score >= 65) return 'Good'
  if (score >= 50) return 'Keep Trying'
  return 'Keep Listening'
}

export default function ScoreDisplay({ result }: ScoreDisplayProps) {
  const { score, tips, phonetic_notes, overall, user_transcript } = result
  const color = scoreColor(score)

  // SVG circle gauge: r=45, circumference=2π*45≈282.7
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (score / 100) * circumference

  return (
    <div className="animate-fade-in space-y-5">
      {/* What the user said */}
      {user_transcript && (
        <div className="card px-4 py-3 flex items-baseline gap-2">
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 flex-shrink-0">You said:</span>
          <p className="text-base font-jp text-gray-800 dark:text-gray-200 leading-relaxed">{user_transcript}</p>
        </div>
      )}
      {/* Score gauge */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="relative inline-flex items-center justify-center">
          <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
            {/* Background track */}
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-gray-200 dark:text-gray-800"
            />
            {/* Score arc */}
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke={color.stroke}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: 'stroke-dashoffset 1s ease-out',
              }}
            />
          </svg>
          <div className="absolute text-center">
            <span className={`text-3xl font-bold ${color.text}`}>{score}</span>
            <span className={`text-xs ${color.text} block -mt-1`}>/100</span>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-semibold ${color.text} ${color.bg}`}>
          {scoreLabel(score)}
        </div>
      </div>

      {/* Overall assessment */}
      <div className="card p-4">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic">
          "{overall}"
        </p>
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="card p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Improvement Tips
          </h4>
          <ul className="space-y-2">
            {tips.map((tip, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 text-xs flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Phonetic notes */}
      {phonetic_notes && (
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
            Phonetic Notes
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {phonetic_notes}
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 dark:text-gray-600 text-center leading-relaxed px-2">
        Analysis is based purely on the transcript generated from your speech. It cannot analyse the audio directly,
        therefore details of your speech such as rhythm and pitch are only captured by the speech-to-text processing. Additionally, LLMs are not perfect and may give inaccurate feedback, so please take the tips as suggestions and consult with a trusted language instructor or resource for comprehensive guidance.
      </p>
    </div>
  )
}
