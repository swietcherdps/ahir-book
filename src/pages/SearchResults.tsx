import { Link, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { searchWithPagination, type SearchResult } from '../lib/search'

export default function SearchResults() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const [bulkSummaryLoading, setBulkSummaryLoading] = useState(false)
  const [summaries, setSummaries] = useState<Record<number, string>>({})
  
  const observer = useRef<IntersectionObserver | null>(null)
  const lastResultRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return
    if (observer.current) observer.current.disconnect()
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1)
      }
    })
    
    if (node) observer.current.observe(node)
  }, [loading, hasMore])

  useEffect(() => {
    setResults([])
    setPage(1)
    setHasMore(true)
    setTotal(0)
  }, [query])

  useEffect(() => {
    if (!query) return
    loadResults()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page])

  const loadResults = async () => {
    if (!query.trim()) return
    
    setLoading(true)
    try {
      const { results: newResults, hasMore: more, total: totalCount } = 
        await searchWithPagination(query, page, 10)
      
      setResults(prev => page === 1 ? newResults : [...prev, ...newResults])
      setHasMore(more)
      setTotal(totalCount)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBulkSummarize = async () => {
    const apiKey = localStorage.getItem('openrouter_api_key')
    if (!apiKey) {
      alert('Lütfen ayarlardan OpenRouter API anahtarınızı girin')
      return
    }

    setBulkSummaryLoading(true)
    const newSummaries: Record<number, string> = {}

    try {
      // Summarize first 5 results
      const resultsToSummarize = results.slice(0, 5)
      
      for (const result of resultsToSummarize) {
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': window.location.origin,
            },
            body: JSON.stringify({
              model: 'openai/gpt-4o',
              messages: [
                {
                  role: 'user',
                  content: `Lütfen şu metni kısaca özetle:\n\n${result.snippet}`
                }
              ]
            })
          })

          const data = await response.json()
          newSummaries[result.id] = data.choices[0].message.content
        } catch (err) {
          console.error('Summary error for result', result.id, err)
          newSummaries[result.id] = 'Özet oluşturulamadı'
        }
      }

      setSummaries(newSummaries)
    } catch {
      alert('Toplu özet oluşturulurken hata oluştu')
    } finally {
      setBulkSummaryLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-primary">Arama Sonuçları</h1>
            {total > 0 && (
              <p className="text-sm text-gray-600">{total} sonuç bulundu</p>
            )}
          </div>
          <div className="w-8" />
        </header>

        <div className="mb-4">
          <div className="bg-gray-100 p-3 rounded-lg mb-4">
            <p className="text-sm text-gray-700">
              Aranan: <span className="font-semibold">{query}</span>
            </p>
          </div>
          
          {results.length > 0 && (
            <button
              onClick={handleBulkSummarize}
              disabled={bulkSummaryLoading}
              className="w-full bg-accent text-white py-3 rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
            >
              {bulkSummaryLoading ? 'Özetleniyor...' : '📝 İlk 5 Sonucu Toplu Özetle'}
            </button>
          )}
        </div>

        <div className="space-y-4">
          {results.length === 0 && !loading ? (
            <p className="text-gray-500 text-center py-8">Hiç sonuç bulunamadı</p>
          ) : (
            results.map((result, index) => (
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
                
                {summaries[result.id] && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-xs font-semibold text-blue-900 mb-1">Özet:</p>
                    <p className="text-xs text-blue-800">{summaries[result.id]}</p>
                  </div>
                )}
                
                <Link
                  to={`/reader/${result.bookId}/${result.pageNumber}`}
                  className="inline-block px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition text-sm"
                >
                  Sayfaya Git
                </Link>
              </div>
            ))
          )}
          
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          
          {!hasMore && results.length > 0 && (
            <p className="text-center text-gray-500 py-4">Tüm sonuçlar gösterildi</p>
          )}
        </div>
      </div>
    </div>
  )
}
