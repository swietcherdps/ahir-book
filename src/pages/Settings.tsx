import { Link } from 'react-router-dom'

export default function Settings() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-primary">Ayarlar</h1>
          <div className="w-8" />
        </header>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-primary mb-2">
              OpenRouter API Key
            </label>
            <input
              type="password"
              placeholder="API anahtarınızı girin"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-2">
              Tema
            </label>
            <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent">
              <option>Açık</option>
              <option>Koyu</option>
              <option>Sistem</option>
            </select>
          </div>

          <button className="w-full bg-red-500 text-white py-3 rounded-lg hover:bg-red-600 transition">
            Cache Temizle
          </button>
        </div>
      </div>
    </div>
  )
}
