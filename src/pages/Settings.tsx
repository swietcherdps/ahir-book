import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'

export default function Settings() {
  const [apiKey, setApiKey] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [cacheCleared, setCacheCleared] = useState(false)

  // Load saved settings
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openrouter_api_key') || ''
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' || 'system'
    setApiKey(savedApiKey)
    setTheme(savedTheme)
    applyTheme(savedTheme)
  }, [])

  // Apply theme
  const applyTheme = (newTheme: 'light' | 'dark' | 'system') => {
    const root = document.documentElement
    if (newTheme === 'dark') {
      root.classList.add('dark')
    } else if (newTheme === 'light') {
      root.classList.remove('dark')
    } else {
      // System theme
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }

  // Handle API key change
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value
    setApiKey(newKey)
    localStorage.setItem('openrouter_api_key', newKey)
  }

  // Handle theme change
  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTheme = e.target.value as 'light' | 'dark' | 'system'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    applyTheme(newTheme)
  }

  // Clear only service worker cache
  const clearCache = async () => {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
      }
      setCacheCleared(true)
      setTimeout(() => setCacheCleared(false), 3000)
    } catch (error) {
      console.error('Cache temizleme hatası:', error)
    }
  }

  return (
    <div className="min-h-screen bg-background dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/" className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg">
            <svg className="w-6 h-6 text-primary dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-primary dark:text-gray-100">Ayarlar</h1>
          <div className="w-8" />
        </header>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-2">
              OpenRouter API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={handleApiKeyChange}
              placeholder="API anahtarınızı girin"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-2">
              Tema
            </label>
            <select 
              value={theme}
              onChange={handleThemeChange}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="light">Açık</option>
              <option value="dark">Koyu</option>
              <option value="system">Sistem</option>
            </select>
          </div>

          <button 
            onClick={clearCache}
            className="w-full bg-red-500 text-white py-3 rounded-lg hover:bg-red-600 transition disabled:opacity-50"
            disabled={cacheCleared}
          >
            {cacheCleared ? 'Cache Temizlendi ✓' : 'Cache Temizle'}
          </button>
        </div>
      </div>
    </div>
  )
}
