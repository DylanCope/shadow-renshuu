import { useState } from 'react'
import UploadPage from './components/UploadPage'
import PracticePage from './components/PracticePage'
import ApiKeyModal from './components/ApiKeyModal'
import LoginPage from './components/LoginPage'
import { useTheme } from './hooks/useTheme'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import type { Session } from './types'

function AppContent() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionDocId, setSessionDocId] = useState<string | null>(null)
  const { darkMode, toggle } = useTheme()
  const [showKeyModal, setShowKeyModal] = useState(false)
  const { user, loading } = useAuth()

  const handleSession = (s: Session, docId?: string) => {
    setSession(s)
    setSessionDocId(docId ?? null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-purple-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  if (!user) {
    return <LoginPage darkMode={darkMode} onThemeToggle={toggle} />
  }

  return (
    <div>
      {session ? (
        <PracticePage
          session={session}
          firestoreDocId={sessionDocId}
          darkMode={darkMode}
          onThemeToggle={toggle}
          onNewSession={() => { setSession(null); setSessionDocId(null) }}
          onChangeApiKey={() => setShowKeyModal(true)}
        />
      ) : (
        <UploadPage
          darkMode={darkMode}
          onThemeToggle={toggle}
          onSession={handleSession}
          onChangeApiKey={() => setShowKeyModal(true)}
          userId={user.uid}
        />
      )}
      {showKeyModal && (
        <ApiKeyModal
          onSave={() => setShowKeyModal(false)}
          onDismiss={() => setShowKeyModal(false)}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
