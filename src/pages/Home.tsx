import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { searchBooks, type SearchResult, type SortOrder } from '../lib/search'
import { getBooks, type Book } from '../lib/db'
import Navigation from '../components/Navigation'

export default function Home() {
  const [query, setQuery] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const loadingMoreRef = useRef(false)
  
  // Filter states
  const [availableBooks, setAvailableBooks] = useState<Book[]>([])
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>([])
  const [sortOrder, setSortOrder] = useState<SortOrder>('grouped')
  const [showFilters, setShowFilters] = useState(false)
  
  const observer = useRef<IntersectionObserver | null>(null)
  const lastResultRef = useCallback((node: HTMLDivElement | null) => {
    if (loading || loadingMoreRef.current) return
    if (observer.current) observer.current.disconnect()
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMoreRef.current) {
        setPage(prevPage => prevPage + 1)
      }
    })
    
    if (node) observer.current.observe(node)
  }, [loading, hasMore])

  // Load available books on mount
  useEffect(() => {
    loadAvailableBooks()
  }, [])
  
  const loadAvailableBooks = async () => {
    const books = await getBooks()
    setAvailableBooks(books)
    // Select all books by default
    setSelectedBookIds(books.map(b => b.id!))
  }
  
  // Restore search state from session storage on mount
  useEffect(() => {
    const savedState = sessionStorage.getItem('searchState')
    if (savedState) {
      try {
        const { query: savedQuery, keywords: savedKeywords, results: savedResults, scrollY, selectedBookIds: savedBookIds, sortOrder: savedSortOrder } = JSON.parse(savedState)
        setQuery(savedQuery || '')
        setKeywords(savedKeywords || [])
        setResults(savedResults || [])
        setSearched(savedResults && savedResults.length > 0)
        if (savedBookIds) setSelectedBookIds(savedBookIds)
        if (savedSortOrder) setSortOrder(savedSortOrder)
        
        // Restore scroll position after DOM renders
        if (scrollY && savedResults && savedResults.length > 0) {
          setTimeout(() => {
            window.scrollTo(0, scrollY)
          }, 100)
        }
      } catch (error) {
        console.error('Failed to restore search state:', error)
      }
    }
  }, [])

  // Save search state to session storage whenever it changes
  useEffect(() => {
    if (searched) {
      const scrollY = window.scrollY
      sessionStorage.setItem('searchState', JSON.stringify({ query, keywords, results, scrollY, selectedBookIds, sortOrder }))
    }
  }, [query, keywords, results, searched, selectedBookIds, sortOrder])

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

  const handleSearch = async (isLoadMore = false) => {
    const allKeywords = [...keywords, ...query.split(',').map(k => k.trim()).filter(Boolean)]
    if (allKeywords.length === 0) return
    
    if (isLoadMore) {
      loadingMoreRef.current = true
    } else {
      setLoading(true)
      setSearched(true)
      setPage(1)
      setHasMore(true)
    }
    
    try {
      const searchQuery = allKeywords.join(',')
      const offset = isLoadMore ? (page - 1) * 10 : 0
      const searchResults = await searchBooks(
        searchQuery, 
        10, 
        offset, 
        selectedBookIds.length > 0 ? selectedBookIds : undefined,
        sortOrder
      )
      
      if (isLoadMore) {
        // Append new results without changing scroll position
        setResults(prev => [...prev, ...searchResults])
      } else {
        setResults(searchResults)
      }
      
      // If we got less than 10 results, we've reached the end
      if (searchResults.length < 10) {
        setHasMore(false)
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      if (isLoadMore) {
        loadingMoreRef.current = false
      } else {
        setLoading(false)
      }
    }
  }
  
  // Load more when page changes
  useEffect(() => {
    if (page > 1 && searched) {
      handleSearch(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Navigation />
          <h1 className="text-2xl font-bold text-primary">Ahir Book</h1>
          <div className="w-8" />
        </header>

        <div className="space-y-4">
          {/* Filters Toggle Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            <span className="font-medium text-secondary">🔍 Arama Filtreleri</span>
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

              {/* Sort Order Filter */}
              <div>
                <label className="block text-sm font-semibold text-secondary mb-2">
                  📊 Sonuç Sırası
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sortOrder"
                      value="grouped"
                      checked={sortOrder === 'grouped'}
                      onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                      className="w-4 h-4 text-accent focus:ring-accent"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Kitaplara Göre</div>
                      <div className="text-xs text-gray-500">Önce 1. kitabın tüm sonuçları, sonra 2. kitabın...</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="sortOrder"
                      value="interleaved"
                      checked={sortOrder === 'interleaved'}
                      onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                      className="w-4 h-4 text-accent focus:ring-accent"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-700">Karışık</div>
                      <div className="text-xs text-gray-500">Her kitaptan sırayla birer sonuç</div>
                    </div>
                  </label>
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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={() => handleSearch(false)}
            disabled={loading || (keywords.length === 0 && query.trim() === '') || selectedBookIds.length === 0}
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
                {results.map((result, index) => (
                  <div 
                    key={result.id} 
                    ref={index === results.length - 1 ? lastResultRef : null}
                    className="bg-white p-4 rounded-lg shadow-md"
                  >
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
                      to={`/reader/${result.bookId}/${result.pageNumber}?q=${encodeURIComponent([...keywords, query].filter(Boolean).join(','))}`}
                      className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition text-sm"
                    >
                      Sayfaya Git
                    </Link>
                    </div>
                  </div>
                ))}
              </div>
              
              {loading && page > 1 && (
                <div className="flex justify-center py-4">
                  <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              
              {!hasMore && results.length > 0 && (
                <p className="text-center text-gray-500 py-4">Tüm sonuçlar gösterildi</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
