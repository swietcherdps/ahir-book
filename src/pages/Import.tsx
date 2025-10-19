import { Link } from 'react-router-dom'

export default function Import() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/library" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-primary">Kitap İçe Aktar</h1>
          <div className="w-8" />
        </header>

        <div className="border-4 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-accent transition cursor-pointer">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-lg text-gray-600 mb-2">PDF veya EPUB dosyalarını sürükleyin</p>
          <p className="text-sm text-gray-500 mb-4">ya da</p>
          <button className="bg-accent text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition">
            Dosya Seç
          </button>
        </div>

        <div className="mt-8">
          <p className="text-sm text-gray-500">Desteklenen formatlar: PDF, EPUB</p>
        </div>
      </div>
    </div>
  )
}
