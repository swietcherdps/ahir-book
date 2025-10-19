import { Link } from 'react-router-dom'

export default function Bookmarks() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-primary">Yıldızlı Sayfalar</h1>
          <div className="w-8" />
        </header>

        <div className="space-y-4">
          <p className="text-gray-500 text-center py-8">
            Henüz yıldızlanmış sayfa yok. Kitap okurken sayfaları yıldızlayabilirsiniz.
          </p>
        </div>
      </div>
    </div>
  )
}
