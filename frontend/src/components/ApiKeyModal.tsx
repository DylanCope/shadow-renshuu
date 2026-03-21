import { useState } from 'react'
import {
  getProvider, setProvider,
  getApiKey, setApiKey,
  getGeminiKey, setGeminiKey,
  getGeminiModel, setGeminiModel,
  getOllamaModel, setOllamaModel,
  ollamaEnabled,
  verifyApiKey,
  type Provider,
} from '../lib/api'

interface ApiKeyModalProps {
  onSave: () => void
  onDismiss?: () => void
}

const ALL_PROVIDERS: { id: Provider; label: string; badge?: string }[] = [
  { id: 'anthropic', label: 'Anthropic Claude' },
  { id: 'gemini',    label: 'Google Gemini',  badge: 'Free tier' },
  { id: 'ollama',    label: 'Ollama (Local)',  badge: 'Offline' },
]
const PROVIDERS = ollamaEnabled ? ALL_PROVIDERS : ALL_PROVIDERS.filter((p) => p.id !== 'ollama')

export default function ApiKeyModal({ onSave, onDismiss }: ApiKeyModalProps) {
  const [provider, setProviderState] = useState<Provider>(getProvider)
  const [anthropicKey, setAnthropicKey] = useState(getApiKey)
  const [geminiKey, setGeminiKeyState] = useState(getGeminiKey)
  const [geminiModel, setGeminiModelState] = useState(getGeminiModel)
  const [ollamaModel, setOllamaModelState] = useState(getOllamaModel)
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const handleSave = async () => {
    setError('')

    // Client-side format check
    if (provider === 'anthropic') {
      if (!anthropicKey.trim()) { setError('Paste your Anthropic API key.'); return }
      if (!anthropicKey.trim().startsWith('sk-ant-')) { setError('Key should start with sk-ant-'); return }
    } else if (provider === 'gemini') {
      if (!geminiKey.trim()) { setError('Paste your Gemini API key.'); return }
    }

    // Ollama needs no key — skip verification
    if (provider === 'ollama') {
      setOllamaModel(ollamaModel)
      setProvider(provider)
      onSave()
      return
    }

    // Verify key against the backend before saving
    setVerifying(true)
    try {
      const key = provider === 'gemini' ? geminiKey : anthropicKey
      await verifyApiKey(provider, key.trim(), { geminiModel: geminiModel })
    } catch (err) {
      setError((err as Error).message || 'Invalid API key')
      return
    } finally {
      setVerifying(false)
    }

    if (provider === 'anthropic') {
      setApiKey(anthropicKey)
    } else {
      setGeminiKey(geminiKey)
      setGeminiModel(geminiModel)
    }
    setProvider(provider)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md shadow-2xl text-gray-900 dark:text-gray-100">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">影</span>
              <h1 className="text-xl font-bold tracking-tight">AI Provider Settings</h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Choose how to power analysis, furigana, and translations.
            </p>
          </div>

          {/* Provider picker */}
          <div className="grid grid-cols-3 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => { setProviderState(p.id); setError('') }}
                className={`relative flex flex-col items-center gap-1 p-3 rounded-lg border text-xs font-medium transition-all
                  ${provider === p.id
                    ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
              >
                {p.label}
                {p.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">{p.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Provider-specific inputs */}
          {provider === 'anthropic' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Anthropic API Key</label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => { setAnthropicKey(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="sk-ant-api03-..."
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700
                           bg-gray-50 dark:bg-gray-800 text-sm font-mono
                           focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Get a key at{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">
                  console.anthropic.com
                </a>
                . Paid usage required.
              </p>
            </div>
          )}

          {provider === 'gemini' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Google Gemini API Key</label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => { setGeminiKeyState(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="AIza..."
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700
                           bg-gray-50 dark:bg-gray-800 text-sm font-mono
                           focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 pt-1">Model</label>
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModelState(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700
                           bg-gray-50 dark:bg-gray-800 text-sm
                           focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (recommended, free tier)</option>
                <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (faster, free tier)</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Free tier: 1,500 req/day, 15 RPM. Get a key at{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">
                  aistudio.google.com
                </a>
                .
              </p>
            </div>
          )}

          {provider === 'ollama' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Model name</label>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModelState(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="gemma3"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700
                           bg-gray-50 dark:bg-gray-800 text-sm font-mono
                           focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Requires <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">Ollama</a> running on <span className="font-mono">localhost:11434</span>.
                Recommended models: <span className="font-mono">gemma3</span>, <span className="font-mono">gemma3:12b</span>, <span className="font-mono">llama3.2</span>.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onDismiss}
              disabled={verifying}
              className="flex-1 btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={verifying}
              className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying…
                </>
              ) : 'Save & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
