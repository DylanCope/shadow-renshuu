import { useState } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import ThemeToggle from './ThemeToggle'

const ACTION_CODE_SETTINGS = {
  url: window.location.href,
  handleCodeInApp: true,
}

interface LoginPageProps {
  darkMode: boolean
  onThemeToggle: () => void
}

export default function LoginPage({ darkMode, onThemeToggle }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Handle magic link redirect on page load
  if (isSignInWithEmailLink(auth, window.location.href)) {
    const savedEmail = localStorage.getItem('emailForSignIn') ?? ''
    if (savedEmail) {
      signInWithEmailLink(auth, savedEmail, window.location.href)
        .then(() => {
          localStorage.removeItem('emailForSignIn')
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Sign-in link is invalid or expired. Please request a new one.')
        })
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setLoading(true)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleEmailLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setLoading(true)
    try {
      await sendSignInLinkToEmail(auth, email.trim(), ACTION_CODE_SETTINGS)
      localStorage.setItem('emailForSignIn', email.trim())
      setEmailSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send sign-in link.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200">
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
          <ThemeToggle darkMode={darkMode} onToggle={onThemeToggle} />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3 tracking-tight">Sign in</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Sign in to save your practice sessions and track progress across devices.
          </p>
        </div>

        <div className="card p-6 shadow-sm space-y-4">
          {/* Google sign-in */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg
                       border border-gray-300 dark:border-gray-600
                       bg-white dark:bg-gray-800
                       hover:bg-gray-50 dark:hover:bg-gray-700
                       transition-colors font-medium text-sm disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            or
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          {/* Email magic link */}
          {emailSent ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">📬</div>
              <p className="font-medium mb-1">Check your inbox</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                We sent a sign-in link to <strong>{email}</strong>. Click it to sign in.
              </p>
              <button
                onClick={() => { setEmailSent(false); setEmail('') }}
                className="mt-4 text-xs text-purple-500 hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailLink} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700
                           bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
                           text-sm placeholder:text-gray-400 dark:placeholder:text-gray-600"
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full btn-primary py-2.5 text-sm disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
          )}

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400 text-center">{error}</p>
          )}
        </div>
      </main>
    </div>
  )
}
