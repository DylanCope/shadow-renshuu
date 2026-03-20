import { useState } from 'react'
import UploadPage from './components/UploadPage'
import PracticePage from './components/PracticePage'
import ApiKeyModal from './components/ApiKeyModal'
import { useTheme } from './hooks/useTheme'
import { getApiKey, isConfigured } from './lib/api'
import type { Session } from './types'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const { darkMode, toggle } = useTheme()
  const [showKeyModal, setShowKeyModal] = useState(() => !isConfigured())

  return (
    <div className={darkMode ? 'dark' : ''}>
      {showKeyModal && (
        <ApiKeyModal
          onSave={() => setShowKeyModal(false)}
          onDismiss={isConfigured() ? () => setShowKeyModal(false) : undefined}
        />
      )}
      {!showKeyModal && (
        session ? (
          <PracticePage
            session={session}
            darkMode={darkMode}
            onThemeToggle={toggle}
            onNewSession={() => setSession(null)}
            onChangeApiKey={() => setShowKeyModal(true)}
          />
        ) : (
          <UploadPage
            darkMode={darkMode}
            onThemeToggle={toggle}
            onSession={setSession}
            onChangeApiKey={() => setShowKeyModal(true)}
          />
        )
      )}
    </div>
  )
}
