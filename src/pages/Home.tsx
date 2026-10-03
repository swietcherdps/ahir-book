import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { searchBooks, type SearchResult } from '../lib/search'
import { getBooks, type Book } from '../lib/db'


export default function Home() {
  const [query, setQuery] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [expandedBookId, setExpandedBookId] = useState<number | null>(null)

  // Filter states
  const [availableBooks, setAvailableBooks] = useState<Book[]>([])
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>([])
  const [showFilters, setShowFilters] = useState(false)

  // Load available books on mount
  useEffect(() => {
    loadAvailableBooks()
  }, [])

  const loadAvailableBooks = async () => {
    const books = await getBooks()
    // Only show downloaded books in filter
    const downloadedBooks = books.filter(b => b.isDownloaded)
    setAvailableBooks(downloadedBooks)
    // Select all downloaded books by default
    setSelectedBookIds(downloadedBooks.map(b => b.id!))
  }

  // Restore search state from session storage on mount
  useEffect(() => {
    const savedState = sessionStorage.getItem('searchState')
    if (savedState) {
      try {
        const { query: savedQuery, keywords: savedKeywords, results: savedResults, selectedBookIds: savedBookIds, expandedBookId: savedExpandedBookId } = JSON.parse(savedState)
        setQuery(savedQuery || '')
        setKeywords(savedKeywords || [])
        setResults(savedResults || [])
        setSearched(savedResults && savedResults.length > 0)
        if (savedBookIds) setSelectedBookIds(savedBookIds)
        if (savedExpandedBookId) setExpandedBookId(savedExpandedBookId)
      } catch (error) {
        console.error('Failed to restore search state:', error)
      }
    }
  }, [])

  // Save search state to session storage whenever it changes
  useEffect(() => {
    if (searched) {
      sessionStorage.setItem('searchState', JSON.stringify({ query, keywords, results, selectedBookIds, expandedBookId }))
    }
  }, [query, keywords, results, searched, selectedBookIds, expandedBookId])

  const handleKeywordInput = (value: string) => {
    // Split by comma and parse keywords
    const parts = value.split(',')
    const lastPart = parts[parts.length - 1].trim()

    if (parts.length > 1) {
      // Add previous keywords as tags
      const newKeywords = parts.slice(0, -1).map(k => k.trim()).filter(Boolean)
      setKeywords([...keywords, ...newKeywords])
      setQuery(lastPart)
    } else {
      setQuery(value)
    }
  }

  const removeKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index))
  }

  const handleSearch = async () => {
    const allKeywords = [...keywords, ...query.split(',').map(k => k.trim()).filter(Boolean)]
    if (allKeywords.length === 0) return

    setLoading(true)
    setSearched(true)
    setExpandedBookId(null)

    try {
      const searchQuery = allKeywords.join(',')
      // Fetch all results to group them
      const searchResults = await searchBooks(
        searchQuery,
        undefined, // No limit
        0,
        selectedBookIds.length > 0 ? selectedBookIds : undefined,
        'grouped'
      )

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

  // Group results by book
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.bookId]) {
      acc[result.bookId] = {
        bookTitle: result.bookTitle,
        count: 0,
        results: []
      }
    }
    acc[result.bookId].count++
    acc[result.bookId].results.push(result)
    return acc
  }, {} as Record<number, { bookTitle: string; count: number; results: SearchResult[] }>)

  return (
    <div className="min-h-screen bg-background dark:bg-black p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-center mb-8">
          <h1 className="text-2xl font-bold text-primary dark:text-gray-100">Ahir Book</h1>
        </header>

        <div className="space-y-4">
          {/* Filters Toggle Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
          >
            <span className="font-medium text-secondary dark:text-gray-200">🔍 Arama Filtreleri</span>
            <svg
              className={`w-5 h-5 transition-transform ${showFilters ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Filters Panel */}
          {showFilters && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
              {/* Book Selection Filter */}
              <div>
                <label className="block text-sm font-semibold text-secondary mb-2">
                  📚 Aranacak Kitaplar
                </label>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      if (selectedBookIds.length === availableBooks.length) {
                        setSelectedBookIds([])
                      } else {
                        setSelectedBookIds(availableBooks.map(b => b.id!))
                      }
                    }}
                    className="text-xs text-accent hover:underline"
                  >
                    {selectedBookIds.length === availableBooks.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                  </button>
                  {availableBooks.map(book => (
                    <label key={book.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBookIds.includes(book.id!)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBookIds([...selectedBookIds, book.id!])
                          } else {
                            setSelectedBookIds(selectedBookIds.filter(id => id !== book.id))
                          }
                        }}
                        className="w-4 h-4 text-accent rounded focus:ring-accent"
                      />
                      <span className="text-sm text-gray-700">{book.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-2">
            {keywords.map((keyword, index) => (
              <div
                key={index}
                className="bg-accent text-white px-3 py-1 rounded-full flex items-center gap-2 text-sm"
              >
                <span>{keyword}</span>
                <button
                  onClick={() => removeKeyword(index)}
                  className="hover:opacity-75 transition"
                  title="Etiketi kaldır"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => handleKeywordInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Virgülle ayrılmış kelimeler ile ara..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
          <button
            onClick={() => handleSearch()}
            disabled={loading || (keywords.length === 0 && query.trim() === '') || selectedBookIds.length === 0}
            className="w-full bg-accent text-white py-3 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
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
          ) : expandedBookId ? (
            // Detail View
            <div>
              <button
                onClick={() => setExpandedBookId(null)}
                className="mb-4 flex items-center gap-2 text-accent hover:underline"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Tüm Sonuçlara Dön
              </button>

              <h3 className="text-xl font-bold mb-4 text-primary">
                {groupedResults[expandedBookId].bookTitle} ({groupedResults[expandedBookId].count} sonuç)
              </h3>

              <div className="space-y-3">
                {groupedResults[expandedBookId].results.map((result) => (
                  <div
                    key={result.id}
                    className="bg-white p-4 rounded-lg shadow-md"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm text-gray-500">Sayfa {result.pageNumber}</span>
                    </div>
                    <p
                      className="text-sm text-gray-700 mb-3"
                      dangerouslySetInnerHTML={{ __html: result.highlightedSnippet }}
                    />
                    <div className="flex gap-2">
                      <Link
                        to={`/reader/${result.bookId}/${result.pageNumber}?q=${encodeURIComponent([...keywords, query].filter(Boolean).join(','))}`}
                        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-green-700 transition text-sm"
                      >
                        Sayfaya Git
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Summary View
            <div className="grid gap-4">
              {Object.entries(groupedResults).map(([bookId, data]) => (
                <button
                  key={bookId}
                  onClick={() => setExpandedBookId(Number(bookId))}
                  className="bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition text-left flex justify-between items-center group"
                >
                  <div>
                    <h3 className="font-semibold text-primary text-lg group-hover:text-accent transition">
                      {data.bookTitle}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {data.count} sonuç bulundu
                    </p>
                  </div>
                  <svg className="w-6 h-6 text-gray-400 group-hover:text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
