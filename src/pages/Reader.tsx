import { Link, useParams } from 'react-router-dom'

export default function Reader() {
  const { bookId, pageId } = useParams()

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/library" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="text-sm text-gray-600">Sayfa {pageId}</span>
          <button className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6 text-highlight" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        </header>

        <div className="bg-white rounded-lg shadow-lg p-8 min-h-[600px]">
          <p className="text-gray-500 text-center py-12">
            Kitap içeriği burada gösterilecek (Book ID: {bookId}, Page: {pageId})
          </p>
        </div>

        <div className="flex justify-between mt-6">
          <button className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-gray-600">
            ← Önceki Sayfa
          </button>
          <button className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-gray-600">
            Sonraki Sayfa →
          </button>
        </div>
      </div>
    </div>
  )
}
