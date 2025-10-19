import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchBooks, type SearchResult } from '../lib/search'

export default function Home() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    
    setLoading(true)
    setSearched(true)
    try {
      const searchResults = await searchBooks(query, 5)
      setResults(searchResults)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/library" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-primary">Ahir Book</h1>
        </header>

        <div className="space-y-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Virgülle ayrılmış kelimeler ile ara..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full bg-accent text-white py-3 rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
          >
            {loading ? 'Aranıyor...' : 'Arama'}
          </button>
        </div>

        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-primary">Arama Sonuçları</h2>
          
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : searched && results.length === 0 ? (
            <p className="text-gray-500">Hiç sonuç bulunamadı</p>
          ) : !searched ? (
            <p className="text-gray-500">Arama yapmak için yukarıdaki kutuyu kullanın</p>
          ) : (
            <>
              <div className="space-y-3">
                {results.map((result) => (
                  <div key={result.id} className="bg-white p-4 rounded-lg shadow-md">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-primary">{result.bookTitle}</h3>
                      <span className="text-sm text-gray-500">Sayfa {result.pageNumber}</span>
                    </div>
                    <p
                      className="text-sm text-gray-700 mb-3"
                      dangerouslySetInnerHTML={{ __html: result.highlightedSnippet }}
                    />
                    <div className="flex gap-2">
                      <Link
                        to={`/reader/${result.bookId}/${result.pageNumber}`}
                        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition text-sm"
                      >
                        Sayfaya Git
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              {results.length >= 5 && (
                <Link
                  to={`/search-results?q=${encodeURIComponent(query)}`}
                  className="block text-center py-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  Daha Fazla Göster
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
