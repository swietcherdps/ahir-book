import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getBook, addBookmark, deleteBookmark, getBookmarks, db, type Book, type Bookmark } from '../lib/db'
import { highlightText } from '../lib/search'

export default function Reader() {
  const { bookId, pageId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
  const [pageText, setPageText] = useState('')
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base')
  const [showGoToPage, setShowGoToPage] = useState(false)
  const [goToPageInput, setGoToPageInput] = useState('')
  const [showReadingSettings, setShowReadingSettings] = useState(false)
  const [fontFamily, setFontFamily] = useState<'serif' | 'merriweather' | 'system' | 'roboto' | 'opensans' | 'arial' | 'poppins' | 'verdana' | 'mono'>('serif')
  const [backgroundColor, setBackgroundColor] = useState<'white' | 'sepia' | 'dark' | 'cream'>('white')
  
  const currentPage = parseInt(pageId || '1')
  const currentBookId = parseInt(bookId || '0')

  useEffect(() => {
    loadBook()
    loadBookmarks()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  useEffect(() => {
    if (book) {
      loadPageText()
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

  const loadPageText = async () => {
    try {
      setLoading(true)
      // Get page content from database
      const content = await db.bookContent
        .where('[bookId+pageNumber]')
        .equals([currentBookId, currentPage])
        .first()
      
      if (content) {
        setPageText(content.contentText)
        
        // Get total pages for this book
        const allPages = await db.bookContent
          .where('bookId')
          .equals(currentBookId)
          .count()
        setTotalPages(allPages)
      } else {
        setPageText('')
        setError('Sayfa içeriği bulunamadı')
      }
    } catch (err) {
      console.error('Page load error:', err)
      setError('Sayfa yüklenirken hata oluştu')
    } finally {
      setLoading(false)
    }
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

  const handleGoToPage = (e: React.FormEvent) => {
    e.preventDefault()
    const pageNum = parseInt(goToPageInput)
    if (pageNum >= 1 && pageNum <= totalPages) {
      navigate(`/reader/${bookId}/${pageNum}`)
      setShowGoToPage(false)
      setGoToPageInput('')
    }
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

  const fontSizeClasses = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  }

  const fontFamilyStyles = {
    // Serif fonts - classic book reading
    serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
    merriweather: '"Merriweather", Georgia, serif',
    
    // Sans-serif fonts - modern and clean
    system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    roboto: '"Roboto", system-ui, sans-serif',
    opensans: '"Open Sans", system-ui, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    poppins: '"Poppins", system-ui, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    
    // Monospace - code and technical
    mono: '"Courier New", Courier, monospace'
  }

  const backgroundColors = {
    white: { bg: '#FFFFFF', text: '#2D3748' },
    sepia: { bg: '#F4ECD8', text: '#5C4B37' },
    dark: { bg: '#1A202C', text: '#E2E8F0' },
    cream: { bg: '#FFF8DC', text: '#3E3E3E' }
  }

  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: backgroundColor === 'dark' ? '#1A202C' : '#F7FAFC' }}>
      <div className="max-w-4xl mx-auto pb-safe">
        <header className="flex items-center justify-between mb-8">
          <Link to="/library" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="text-center flex-1 relative">
            <h2 className="font-semibold text-lg">{book.title}</h2>
            <div 
              className="text-sm text-gray-600 cursor-pointer hover:text-accent transition"
              onClick={() => setShowGoToPage(!showGoToPage)}
            >
              Sayfa {currentPage} / {totalPages}
            </div>
            {showGoToPage && (
              <form 
                onSubmit={handleGoToPage}
                className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-lg p-2 flex gap-2 z-10"
              >
                <input 
                  type="number"
                  value={goToPageInput}
                  onChange={(e) => setGoToPageInput(e.target.value)}
                  className="w-24 p-1 border rounded-md text-center"
                  placeholder={`1-${totalPages}`}
                  min={1}
                  max={totalPages}
                  autoFocus
                />
                <button 
                  type="submit"
                  className="px-3 py-1 bg-accent text-white rounded-md hover:bg-blue-600"
                >
                  Git
                </button>
              </form>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Reading Settings Button */}
            <button
              onClick={() => setShowReadingSettings(true)}
              className="p-2 hover:bg-gray-200 rounded-lg transition"
              title="Okuma Ayarları"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </button>
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
          </div>
        </header>

        <div className="rounded-lg shadow-lg overflow-hidden" style={{ backgroundColor: backgroundColors[backgroundColor].bg }}>
          {/* Page number header - centered */}
          <div className="border-b px-8 py-4 text-center" style={{ 
            backgroundColor: backgroundColor === 'dark' ? '#2D3748' : backgroundColor === 'sepia' ? '#E8DCC0' : backgroundColor === 'cream' ? '#F5E6B3' : '#F7FAFC',
            borderColor: backgroundColor === 'dark' ? '#4A5568' : '#E2E8F0'
          }}>
            <span className="text-sm font-medium" style={{ color: backgroundColors[backgroundColor].text }}>Sayfa {currentPage}</span>
          </div>
          
          {/* Page content */}
          <div 
            className="p-4 md:p-8 min-h-[400px]"
            onMouseUp={handleTextSelection}
            onTouchEnd={handleTextSelection}
            style={{ backgroundColor: backgroundColors[backgroundColor].bg }}
          >
            <div 
              className={`${fontSizeClasses[fontSize]} leading-loose whitespace-pre-wrap break-words`}
              style={{ 
                fontFamily: fontFamilyStyles[fontFamily],
                lineHeight: fontSize === 'sm' ? '1.8' : fontSize === 'base' ? '2.0' : '2.2',
                textAlign: 'justify',
                hyphens: 'auto',
                wordSpacing: '0.05em',
                letterSpacing: '0.01em',
                color: backgroundColors[backgroundColor].text
              }}
              dangerouslySetInnerHTML={{
                __html: highlightText(
                  pageText,
                  searchParams.get('q')?.split(',').map(k => k.trim()).filter(Boolean) || []
                )
              }}
            />
          </div>
        </div>

        {/* Reading Settings Popup */}
        {showReadingSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowReadingSettings(false)}>
            <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-secondary">Okuma Ayarları</h3>
                <button onClick={() => setShowReadingSettings(false)} className="text-gray-500 hover:text-gray-700">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Font Size */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Yazı Boyutu</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['sm', 'base', 'lg', 'xl'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setFontSize(size)}
                      className={`px-4 py-2 rounded-lg border-2 transition ${
                        fontSize === size 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                    >
                      {size === 'sm' ? 'Küçük' : size === 'base' ? 'Normal' : size === 'lg' ? 'Büyük' : 'Çok Büyük'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Family */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Yazı Tipi</label>
                
                {/* Serif Fonts */}
                <div className="mb-3">
                  <p className="text-xs text-gray-600 mb-2 font-semibold">SERIF (Klasik)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setFontFamily('serif')}
                      className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                        fontFamily === 'serif' 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                      style={{ fontFamily: fontFamilyStyles.serif }}
                    >
                      Georgia
                    </button>
                    <button
                      onClick={() => setFontFamily('merriweather')}
                      className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                        fontFamily === 'merriweather' 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                      style={{ fontFamily: fontFamilyStyles.merriweather }}
                    >
                      Merriweather
                    </button>
                  </div>
                </div>

                {/* Sans-Serif Fonts */}
                <div className="mb-3">
                  <p className="text-xs text-gray-600 mb-2 font-semibold">SANS-SERIF (Modern)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setFontFamily('system')}
                      className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                        fontFamily === 'system' 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                      style={{ fontFamily: fontFamilyStyles.system }}
                    >
                      System UI
                    </button>
                    <button
                      onClick={() => setFontFamily('roboto')}
                      className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                        fontFamily === 'roboto' 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                      style={{ fontFamily: fontFamilyStyles.roboto }}
                    >
                      Roboto
                    </button>
                    <button
                      onClick={() => setFontFamily('opensans')}
                      className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                        fontFamily === 'opensans' 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                      style={{ fontFamily: fontFamilyStyles.opensans }}
                    >
                      Open Sans
                    </button>
                    <button
                      onClick={() => setFontFamily('poppins')}
                      className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                        fontFamily === 'poppins' 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                      style={{ fontFamily: fontFamilyStyles.poppins }}
                    >
                      Poppins
                    </button>
                    <button
                      onClick={() => setFontFamily('arial')}
                      className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                        fontFamily === 'arial' 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                      style={{ fontFamily: fontFamilyStyles.arial }}
                    >
                      Arial
                    </button>
                    <button
                      onClick={() => setFontFamily('verdana')}
                      className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                        fontFamily === 'verdana' 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                      style={{ fontFamily: fontFamilyStyles.verdana }}
                    >
                      Verdana
                    </button>
                  </div>
                </div>

                {/* Monospace */}
                <div>
                  <p className="text-xs text-gray-600 mb-2 font-semibold">MONOSPACE (Teknik)</p>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => setFontFamily('mono')}
                      className={`px-3 py-2 rounded-lg border-2 transition text-sm ${
                        fontFamily === 'mono' 
                          ? 'border-accent bg-accent text-white' 
                          : 'border-gray-300 hover:border-accent'
                      }`}
                      style={{ fontFamily: fontFamilyStyles.mono }}
                    >
                      Courier New
                    </button>
                  </div>
                </div>
              </div>

              {/* Background Color */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Arka Plan</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBackgroundColor('white')}
                    className={`px-4 py-3 rounded-lg border-2 transition flex items-center gap-2 ${
                      backgroundColor === 'white' 
                        ? 'border-accent ring-2 ring-accent' 
                        : 'border-gray-300 hover:border-accent'
                    }`}
                  >
                    <div className="w-6 h-6 rounded bg-white border border-gray-300" />
                    <span>Beyaz</span>
                  </button>
                  <button
                    onClick={() => setBackgroundColor('sepia')}
                    className={`px-4 py-3 rounded-lg border-2 transition flex items-center gap-2 ${
                      backgroundColor === 'sepia' 
                        ? 'border-accent ring-2 ring-accent' 
                        : 'border-gray-300 hover:border-accent'
                    }`}
                  >
                    <div className="w-6 h-6 rounded" style={{ backgroundColor: '#F4ECD8' }} />
                    <span>Sepya</span>
                  </button>
                  <button
                    onClick={() => setBackgroundColor('cream')}
                    className={`px-4 py-3 rounded-lg border-2 transition flex items-center gap-2 ${
                      backgroundColor === 'cream' 
                        ? 'border-accent ring-2 ring-accent' 
                        : 'border-gray-300 hover:border-accent'
                    }`}
                  >
                    <div className="w-6 h-6 rounded" style={{ backgroundColor: '#FFF8DC' }} />
                    <span>Krem</span>
                  </button>
                  <button
                    onClick={() => setBackgroundColor('dark')}
                    className={`px-4 py-3 rounded-lg border-2 transition flex items-center gap-2 ${
                      backgroundColor === 'dark' 
                        ? 'border-accent ring-2 ring-accent' 
                        : 'border-gray-300 hover:border-accent'
                    }`}
                  >
                    <div className="w-6 h-6 rounded bg-gray-800" />
                    <span>Karanlık</span>
                  </button>
                </div>
              </div>

              <button
                onClick={() => setShowReadingSettings(false)}
                className="w-full px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition"
              >
                Tamam
              </button>
            </div>
          </div>
        )}

        {showAIMenu && selectedText && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-2xl p-3 flex gap-2 z-50 border-2 border-accent">
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium shadow-md"
            >
              {summarizing ? '⏳ Özetleniyor...' : '📝 Özetle'}
            </button>
            <button
              onClick={handleSpeak}
              className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-gray-600 text-sm font-medium shadow-md"
            >
              🔊 Sesli Oku
            </button>
            <button
              onClick={() => setShowAIMenu(false)}
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
            >
              ✕
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

        <div className="flex justify-between mt-6 pb-6 mb-safe">
          <button 
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="px-6 py-3 bg-secondary text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-lg"
          >
            ← Önceki Sayfa
          </button>
          <button 
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="px-6 py-3 bg-secondary text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-lg"
          >
            Sonraki Sayfa →
          </button>
        </div>
      </div>
    </div>
  )
}
