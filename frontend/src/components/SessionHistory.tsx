import { useEffect, useState } from 'react'
import { getUserSessions, deleteSession } from '../lib/firestoreSessions'
import type { StoredSession } from '../lib/firestoreSessions'
import type { Session } from '../types'

interface SessionHistoryProps {
  userId: string
  onResume: (session: Session, docId: string) => void
}

export default function SessionHistory({ userId, onResume }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<StoredSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    getUserSessions(userId)
      .then(setSessions)
      .catch(() => setError('Failed to load sessions.'))
      .finally(() => setLoading(false))
  }, [userId])

  const handleDelete = async (e: React.MouseEvent, sessionDocId: string) => {
    e.stopPropagation()
    setDeletingId(sessionDocId)
    try {
      await deleteSession(sessionDocId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionDocId))
    } catch {
      setError('Failed to delete session.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleResume = (stored: StoredSession) => {
    const session: Session = {
      session_id: stored.session_id,
      sentences: stored.sentences,
      audioUrl: stored.audioUrl,
    }
    onResume(session, stored.id)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <svg className="animate-spin h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-500 dark:text-red-400 text-center py-4">{error}</p>
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No previous sessions yet. Upload an audio file to get started.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {sessions.map((s) => (
        <li key={s.id}>
          <button
            onClick={() => handleResume(s)}
            className="w-full text-left card p-4 hover:border-purple-400 dark:hover:border-purple-600
                       transition-colors group flex items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{s.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {s.sentences.length} sentence{s.sentences.length !== 1 ? 's' : ''} ·{' '}
                {s.createdAt.toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                Resume →
              </span>
              <button
                onClick={(e) => handleDelete(e, s.id)}
                disabled={deletingId === s.id}
                className="p-1 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400
                           opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title="Delete session"
              >
                {deletingId === s.id ? (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
