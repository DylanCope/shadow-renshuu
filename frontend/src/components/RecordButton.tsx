interface RecordButtonProps {
  isRecording: boolean
  duration: number
  onStart: () => void
  onStop: () => void
  disabled?: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function RecordButton({
  isRecording,
  duration,
  onStart,
  onStop,
  disabled = false,
}: RecordButtonProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={isRecording ? onStop : onStart}
        disabled={disabled}
        className={`
          relative w-20 h-20 rounded-full flex items-center justify-center
          transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus:ring-4 focus:ring-offset-2 dark:focus:ring-offset-gray-900
          ${isRecording
            ? 'bg-red-500 hover:bg-red-600 focus:ring-red-400 recording-pulse shadow-lg shadow-red-500/30'
            : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 focus:ring-purple-400'
          }
        `}
        title={isRecording ? 'Stop recording' : 'Start recording'}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      >
        {isRecording ? (
          // Stop icon (square)
          <div className="w-6 h-6 bg-white rounded-sm" />
        ) : (
          // Mic icon
          <svg
            className="w-8 h-8 text-gray-600 dark:text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        )}
      </button>

      <div className="text-sm h-5 text-center">
        {isRecording ? (
          <span className="flex items-center gap-1.5 text-red-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Recording… {formatTime(duration)}
          </span>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">
            {disabled ? 'Recording unavailable' : 'Tap to record'}
          </span>
        )}
      </div>
    </div>
  )
}
