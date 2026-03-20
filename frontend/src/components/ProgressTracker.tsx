import type { SentenceProgress } from '../types'

interface ProgressTrackerProps {
  total: number
  progress: Record<number, SentenceProgress>
}

export default function ProgressTracker({ total, progress }: ProgressTrackerProps) {
  const attempted = Object.values(progress).filter((p) => p.attempts > 0).length
  const avgScore =
    attempted > 0
      ? Math.round(
          Object.values(progress)
            .filter((p) => p.best_score !== null)
            .reduce((sum, p) => sum + (p.best_score ?? 0), 0) /
            Math.max(1, Object.values(progress).filter((p) => p.best_score !== null).length),
        )
      : null

  const percent = total > 0 ? Math.round((attempted / total) * 100) : 0

  return (
    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
        <span>{attempted}/{total} practiced</span>
        {avgScore !== null && (
          <span className="font-medium text-purple-600 dark:text-purple-400">
            Avg {avgScore}/100
          </span>
        )}
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
