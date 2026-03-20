import { useState, useEffect } from 'react'

export function useTheme() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('shadow-renshu-theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('shadow-renshu-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const toggle = () => setDarkMode((d) => !d)

  return { darkMode, toggle }
}
