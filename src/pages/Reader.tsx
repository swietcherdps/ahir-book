import { Link, useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { getBook, addBookmark, deleteBookmark, getBookmarks, type Book, type Bookmark } from '../lib/db'
import * as pdfjsLib from 'pdfjs-dist'
import ePub from 'epubjs'

export default function Reader() {
  const { bookId, pageId } = useParams()
  const navigate = useNavigate()
  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [selectedText, setSelectedText] = useState('')
  const [showAIMenu, setShowAIMenu] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [summary, setSummary] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  const currentPage = parseInt(pageId || '1')
  const currentBookId = parseInt(bookId || '0')

  useEffect(() => {
    loadBook()
    loadBookmarks()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  useEffect(() => {
    if (book) {
      renderPage()
      checkBookmark()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, book, bookmarks])

  const loadBook = async () => {
    try {
      setLoading(true)
      const bookData = await getBook(currentBookId)
      if (!bookData) {
        setError('Kitap bulunamadı')
        return
      }
      setBook(bookData)
    } catch {
      setError('Kitap yüklenirken hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  const loadBookmarks = async () => {
    const allBookmarks = await getBookmarks()
    setBookmarks(allBookmarks)
  }

  const checkBookmark = () => {
    const bookmarked = bookmarks.some(
      (bm) => bm.bookId === currentBookId && bm.pageId === pageId
    )
    setIsBookmarked(bookmarked)
  }

  const renderPage = async () => {
    if (!book || !contentRef.current) return

    try {
      if (book.format === 'pdf') {
        await renderPDFPage()
      } else {
        await renderEPUBPage()
      }
    } catch (err) {
      console.error('Page render error:', err)
      setError('Sayfa görüntülenirken hata oluştu')
    }
  }

  const renderPDFPage = async () => {
    if (!book || !canvasRef.current) return

    const arrayBuffer = await book.fileBlob.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    setTotalPages(pdf.numPages)

    const page = await pdf.getPage(currentPage)
    const viewport = page.getViewport({ scale: 1.5 })
    
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')!
    canvas.height = viewport.height
    canvas.width = viewport.width

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas
    }).promise

    // Extract text for selection
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    
    if (contentRef.current) {
      contentRef.current.setAttribute('data-text', text)
    }
  }

  const renderEPUBPage = async () => {
    if (!book || !contentRef.current) return

    const arrayBuffer = await book.fileBlob.arrayBuffer()
    const epubBook = ePub(arrayBuffer)
    await epubBook.ready

    const spine = await epubBook.loaded.spine as { items?: Array<{ href: string }> }
    setTotalPages(spine.items?.length || 0)

    const rendition = epubBook.renderTo(contentRef.current, {
      width: '100%',
      height: 600
    })

    await rendition.display(currentPage - 1)
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      navigate(`/reader/${bookId}/${currentPage - 1}`)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      navigate(`/reader/${bookId}/${currentPage + 1}`)
    }
  }

  const toggleBookmark = async () => {
    if (isBookmarked) {
      const bookmark = bookmarks.find(
        (bm) => bm.bookId === currentBookId && bm.pageId === pageId
      )
      if (bookmark?.id) {
        await deleteBookmark(bookmark.id)
      }
    } else {
      await addBookmark(currentBookId, pageId!)
    }
    await loadBookmarks()
  }

  const handleTextSelection = () => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (text && text.length > 0) {
      setSelectedText(text)
      setShowAIMenu(true)
    } else {
      setShowAIMenu(false)
    }
  }

  const handleSummarize = async () => {
    if (!selectedText) return
    
    setSummarizing(true)
    setSummary('')
    
    try {
      const apiKey = localStorage.getItem('openrouter_api_key')
      if (!apiKey) {
        alert('Lütfen ayarlardan OpenRouter API anahtarınızı girin')
        navigate('/settings')
        return
      }

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
              content: `Lütfen şu metni özetle:\n\n${selectedText}`
            }
          ]
        })
      })

      const data = await response.json()
      setSummary(data.choices[0].message.content)
    } catch {
      alert('Özet oluşturulurken hata oluştu')
    } finally {
      setSummarizing(false)
    }
  }

  const handleSpeak = () => {
    if (!selectedText) return
    
    const utterance = new SpeechSynthesisUtterance(selectedText)
    utterance.lang = 'tr-TR'
    window.speechSynthesis.speak(utterance)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto text-center py-12">
          <p className="text-red-500 mb-4">{error || 'Kitap bulunamadı'}</p>
          <Link to="/library" className="text-accent hover:underline">
            Kütüphaneye Dön
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/library" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="text-center">
            <h2 className="font-semibold text-lg">{book.title}</h2>
            <span className="text-sm text-gray-600">Sayfa {currentPage} / {totalPages}</span>
          </div>
          <button 
            onClick={toggleBookmark}
            className="p-2 hover:bg-gray-200 rounded-lg transition"
          >
            <svg 
              className={`w-6 h-6 ${isBookmarked ? 'text-highlight fill-current' : 'text-gray-400'}`}
              fill={isBookmarked ? 'currentColor' : 'none'}
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        </header>

        <div 
          ref={contentRef}
          className="bg-white rounded-lg shadow-lg p-8 min-h-[600px] relative"
          onMouseUp={handleTextSelection}
        >
          {book.format === 'pdf' ? (
            <canvas ref={canvasRef} className="w-full" />
          ) : (
            <div className="epub-content" />
          )}
        </div>

        {showAIMenu && (
          <div className="fixed bottom-24 right-8 bg-white rounded-lg shadow-xl p-4 space-y-2">
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="w-full px-4 py-2 bg-accent text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {summarizing ? 'Özetleniyor...' : '📝 Özetle'}
            </button>
            <button
              onClick={handleSpeak}
              className="w-full px-4 py-2 bg-secondary text-white rounded hover:bg-gray-600"
            >
              🔊 Sesli Oku
            </button>
          </div>
        )}

        {summary && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold mb-2">Özet:</h3>
            <p className="text-sm">{summary}</p>
            <button
              onClick={() => setSummary('')}
              className="mt-2 text-xs text-gray-500 hover:text-gray-700"
            >
              Kapat
            </button>
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button 
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Önceki Sayfa
          </button>
          <button 
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sonraki Sayfa →
          </button>
        </div>
      </div>
    </div>
  )
}
