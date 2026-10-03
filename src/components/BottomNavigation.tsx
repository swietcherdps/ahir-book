import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getBooks, type Book } from '../lib/db'
import { sendTestNotification, scheduleNotifications, type NotificationFrequency } from '../lib/notification'
import { BookNotificationFrequencySelector } from './NotificationFrequencySelector'
import AIStyleSelector from './AIStyleSelector'
import { showToast } from './Toast'

export default function BottomNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isFabOpen, setIsFabOpen] = useState(false)
  const [showNotifPopup, setShowNotifPopup] = useState(false)
  const fabRef = useRef<HTMLDivElement>(null)

  // Notification quick settings state
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [notifFrequency, setNotifFrequency] = useState('4h')
  const [books, setBooks] = useState<Book[]>([])
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>([])
  const [bookNotificationCounts, setBookNotificationCounts] = useState<Record<number, number>>({})
  const [hasApiKey, setHasApiKey] = useState(false)
  const [isSendingTefeul, setIsSendingTefeul] = useState(false)
  const [isTogglingNotif, setIsTogglingNotif] = useState(false)
  const [aiRatio, setAiRatio] = useState(50)
  const [promptStyle, setPromptStyle] = useState('short_quote')

  const isActive = (path: string) => location.pathname === path

  // Load settings when popup opens
  useEffect(() => {
    if (showNotifPopup) {
      loadSettings()
    }
  }, [showNotifPopup])

  const loadSettings = async () => {
    try {
      const allBooks = await getBooks()
      const downloadedBooks = allBooks.filter(b => b.isDownloaded)
      setBooks(downloadedBooks)

      // Load from localStorage - sync with Settings
      const enabled = localStorage.getItem('notifications_enabled') === 'true'
      const frequency = localStorage.getItem('notification_frequency') || '4h'
      const savedBookIds = JSON.parse(localStorage.getItem('notification_book_ids') || '[]')
      const savedBookCounts = JSON.parse(localStorage.getItem('notification_book_counts') || '{}')
      const apiKey = localStorage.getItem('google_api_key')
      const savedAiRatio = parseInt(localStorage.getItem('notification_ai_ratio') || '50')
      const savedPromptStyle = localStorage.getItem('notification_prompt_style') || 'short_quote'

      setNotifEnabled(enabled)
      setNotifFrequency(frequency)
      setSelectedBookIds(savedBookIds)
      setBookNotificationCounts(savedBookCounts)
      setHasApiKey(!!apiKey && apiKey.length > 0)
      setAiRatio(savedAiRatio)
      setPromptStyle(savedPromptStyle)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const toggleNotifications = async () => {
    const newEnabled = !notifEnabled

    if (newEnabled) {
      // Check if books are selected
      if (selectedBookIds.length === 0) {
        showToast('Lütfen en az bir kitap seçin', 'warning')
        return
      }

      // Request notification permission
      if ('Notification' in window) {
        if (Notification.permission === 'denied') {
          showToast('Bildirim izni engellenmiş! Tarayıcı ayarlarından izin verin.', 'error')
          return
        }
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') {
            showToast('Bildirim izni verilmedi', 'warning')
            return
          }
        }
      }
    }

    setIsTogglingNotif(true)
    try {
      // Save to localStorage first
      localStorage.setItem('notifications_enabled', String(newEnabled))
      setNotifEnabled(newEnabled)

      // Call scheduleNotifications to actually start/stop the alarm
      await scheduleNotifications(
        notifFrequency as NotificationFrequency,
        selectedBookIds,
        newEnabled
      )

      if (newEnabled) {
        showToast('Alarm başlatıldı! Bildirimler hazırlanıyor...', 'success')
      } else {
        showToast('Alarm durduruldu', 'info')
      }
    } catch (error: any) {
      console.error('Notification toggle error:', error)
      showToast(`Hata: ${error.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setIsTogglingNotif(false)
    }
  }

  const updateFrequency = async (frequency: string) => {
    localStorage.setItem('notification_frequency', frequency)
    setNotifFrequency(frequency)

    // If notifications are enabled, update the schedule
    if (notifEnabled) {
      try {
        await scheduleNotifications(
          frequency as NotificationFrequency,
          selectedBookIds,
          true
        )
        showToast('Bildirim sıklığı güncellendi', 'success')
      } catch (error) {
        console.error('Failed to update frequency:', error)
      }
    }
  }

  const toggleBook = async (bookId: number, checked: boolean) => {
    const newSelected = checked
      ? Array.from(new Set([...selectedBookIds, bookId]))
      : selectedBookIds.filter(id => id !== bookId)

    setSelectedBookIds(newSelected)
    localStorage.setItem('notification_book_ids', JSON.stringify(newSelected))

    // Default to 1 if selecting and no count set
    if (checked && !bookNotificationCounts[bookId]) {
      const newCounts = { ...bookNotificationCounts, [bookId]: 1 }
      setBookNotificationCounts(newCounts)
      localStorage.setItem('notification_book_counts', JSON.stringify(newCounts))
    }

    if (notifEnabled && newSelected.length > 0) {
      await scheduleNotifications(notifFrequency as NotificationFrequency, newSelected, true)
    }
  }

  const updateBookCount = async (bookId: number, count: number) => {
    const newCounts = { ...bookNotificationCounts, [bookId]: count }
    setBookNotificationCounts(newCounts)
    localStorage.setItem('notification_book_counts', JSON.stringify(newCounts))

    if (notifEnabled) {
      await scheduleNotifications(notifFrequency as NotificationFrequency, selectedBookIds, true)
    }
  }

  const sendTefeul = async () => {
    setIsSendingTefeul(true)
    try {
      // Load books directly for Tefeül
      const allBooks = await getBooks()
      const downloadedBooks = allBooks.filter(b => b.isDownloaded)

      // Exclude Kur'an Meali from Tefeül
      const tefeulBooks = downloadedBooks.filter(b =>
        !b.title.toLowerCase().includes('kur\'an') &&
        !b.title.toLowerCase().includes('kuran') &&
        !b.title.toLowerCase().includes('meal')
      )

      if (tefeulBooks.length === 0) {
        setIsSendingTefeul(false)
        showToast('Tefeül için uygun kitap bulunamadı. Önce bir kitap indirin.', 'warning')
        return
      }

      const tefeulBookIds = tefeulBooks.map(b => b.id!)
      console.log('Sending Tefeül with book IDs:', tefeulBookIds)

      const result = await sendTestNotification(tefeulBookIds)
      console.log('Tefeül sent successfully:', result)

      setIsFabOpen(false)
      setIsSendingTefeul(false)
    } catch (error: any) {
      console.error('Tefeül gönderme hatası:', error)
      setIsSendingTefeul(false)
      const errorMsg = error?.message || 'Bilinmeyen hata'
      showToast(`Tefeül gönderilemedi: ${errorMsg}`, 'error')
    }
  }

  // Close FAB when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
        setIsFabOpen(false)
      }
    }
    if (isFabOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isFabOpen])

  const handleFabAction = (action: 'tefeul' | 'notification' | 'book' | 'note') => {
    switch (action) {
      case 'tefeul':
        sendTefeul()
        break
      case 'notification':
        setShowNotifPopup(true)
        setIsFabOpen(false)
        break
      case 'book':
        setIsFabOpen(false)
        navigate('/import')
        break
      case 'note':
        setIsFabOpen(false)
        navigate('/?tab=notes')
        break
    }
  }

  return (
    <>
      {/* FAB Popup Options Overlay */}
      {isFabOpen && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setIsFabOpen(false)} />
      )}

      {/* Notification Quick Settings Popup - Matches Settings exactly */}
      {showNotifPopup && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setShowNotifPopup(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">📚 Kitap Bildirimleri</h3>
                <button
                  onClick={() => setShowNotifPopup(false)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Enable Toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl mb-3">
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">Bildirimleri Etkinleştir</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedBookIds.length} kitap seçili
                  </p>
                </div>
                <button
                  onClick={toggleNotifications}
                  disabled={isTogglingNotif}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isTogglingNotif ? 'opacity-50 cursor-wait' : ''} ${notifEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${notifEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>

              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Bildirim Sıklığı
                </label>
                <BookNotificationFrequencySelector
                  value={notifFrequency}
                  onChange={(freq) => updateFrequency(freq)}
                />
              </div>

              {/* AI Content Ratio */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Bildirim İçeriği Oranı
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-16 text-right">Hızlı (%{100 - aiRatio})</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={aiRatio}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      setAiRatio(val)
                      localStorage.setItem('notification_ai_ratio', String(val))
                    }}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-accent"
                  />
                  <span className="text-xs text-gray-500 w-14">AI (%{aiRatio})</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 text-center">
                  {aiRatio === 0 ? 'Sadece kitaptan rastgele cümleler.' :
                    aiRatio === 100 ? 'Sadece yapay zeka içeriği.' :
                      'Karışık içerik.'}
                </p>
              </div>

              {/* AI Style Selector - only show if AI ratio > 0 */}
              {aiRatio > 0 && (
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Yapay Zeka Üslubu
                  </label>
                  <AIStyleSelector
                    value={promptStyle}
                    onChange={(value) => {
                      setPromptStyle(value)
                      localStorage.setItem('notification_prompt_style', value)
                    }}
                  />
                </div>
              )}

              {/* Book Selection with Counts - Matches Settings exactly */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                  Kitap Seçimi
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  {books.length === 0 ? (
                    <p className="p-3 text-sm text-gray-500 text-center">İndirilmiş kitap yok</p>
                  ) : (
                    books.map(book => (
                      <div key={book.id} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <label className="flex items-center gap-2 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={selectedBookIds.includes(book.id!)}
                            onChange={(e) => toggleBook(book.id!, e.target.checked)}
                            className="w-4 h-4 text-accent rounded focus:ring-accent"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-gray-700 dark:text-gray-300 truncate">{book.title}</span>
                            {(book.sourceLanguage === 'osmanlica' || book.series?.includes('Osmanlıca') || book.title.includes('Osmanlıca')) && (
                              <span className="block text-[10px] leading-tight text-amber-700 dark:text-amber-400">Osmanlıca</span>
                            )}
                          </span>
                        </label>

                        {selectedBookIds.includes(book.id!) && (
                          <div className="flex items-center gap-1 ml-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Adet:</span>
                            <button
                              onClick={() => updateBookCount(book.id!, Math.max(0, (bookNotificationCounts[book.id!] || 0) - 1))}
                              className="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300 transition text-sm"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={bookNotificationCounts[book.id!] || 0}
                              onChange={(e) => updateBookCount(book.id!, parseInt(e.target.value) || 0)}
                              className="w-10 px-1 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-800 dark:text-white text-center"
                            />
                            <button
                              onClick={() => updateBookCount(book.id!, Math.min(10, (bookNotificationCounts[book.id!] || 0) + 1))}
                              className="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300 transition text-sm"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  Seçili kitapların yanındaki kutucuğa, o kitaptan kaç adet bildirim almak istediğinizi yazın.
                </p>
              </div>

              {/* API Status & Link - Only check ApiKey now */}
              {(!hasApiKey) && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl mb-3">
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                    ⚠️ Arka plan bildirimleri için API kurulumu gerekli
                  </p>
                  <button
                    onClick={() => {
                      setShowNotifPopup(false)
                      navigate('/settings?category=api')
                    }}
                    className="text-xs text-accent font-medium hover:underline"
                  >
                    API Ayarlarına Git →
                  </button>
                </div>
              )}

              {/* Quick Links */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setShowNotifPopup(false)
                    navigate('/settings?category=notifications')
                  }}
                  className="flex items-center justify-center gap-1.5 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
                >
                  <span>⚙️</span>
                  <span className="text-gray-700 dark:text-gray-200">Tam Ayarlar</span>
                </button>
                <button
                  onClick={() => {
                    setShowNotifPopup(false)
                    navigate('/settings?category=notifications')
                  }}
                  className="flex items-center justify-center gap-1.5 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
                >
                  <span>📋</span>
                  <span className="text-gray-700 dark:text-gray-200">Geçmiş</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800 pb-safe z-50">
        <div className="flex justify-around items-center h-16 relative">
          {/* Search */}
          <Link
            to="/search"
            className={`flex flex-col items-center justify-center w-full h-full ${isActive('/search') ? 'text-accent dark:text-[#B6C950]' : 'text-gray-500 dark:text-gray-400'
              }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs mt-1">Arama</span>
          </Link>

          {/* Library */}
          <Link
            to="/library"
            className={`flex flex-col items-center justify-center w-full h-full ${isActive('/library') ? 'text-accent dark:text-[#B6C950]' : 'text-gray-500 dark:text-gray-400'
              }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-xs mt-1">Kütüphane</span>
          </Link>

          {/* FAB - Center Button */}
          <div ref={fabRef} className="flex flex-col items-center justify-center w-full relative">
            {/* Popup Options */}
            <div className={`absolute bottom-24 flex flex-col items-center gap-3 transition-all duration-300 ${isFabOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
              }`}>
              {/* Tefeül */}
              <button
                onClick={() => handleFabAction('tefeul')}
                disabled={isSendingTefeul}
                className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-4 py-2 rounded-full shadow-lg hover:from-amber-500 hover:to-orange-600 transition disabled:opacity-50"
              >
                <span className="text-lg">✨</span>
                <span className="text-sm font-medium whitespace-nowrap">{isSendingTefeul ? 'Gönderiliyor...' : 'Bir Tefeül'}</span>
              </button>

              {/* Notification */}
              <button
                onClick={() => handleFabAction('notification')}
                className="flex items-center gap-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                <span className="text-lg">🔔</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Bildirim</span>
              </button>

              {/* Book */}
              <button
                onClick={() => handleFabAction('book')}
                className="flex items-center gap-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                <span className="text-lg">📚</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Kitap</span>
              </button>

              {/* Note */}
              <button
                onClick={() => handleFabAction('note')}
                className="flex items-center gap-2 bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                <span className="text-lg">📝</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Not</span>
              </button>
            </div>

            {/* FAB Button */}
            <button
              onClick={() => setIsFabOpen(!isFabOpen)}
              className={`relative -mt-6 w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center transition-transform duration-300 ${isFabOpen ? 'rotate-45' : ''
                }`}
              style={{
                border: '3px solid #b6c950'
              }}
            >
              <img
                src={`${import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'}menuicon.png`}
                alt="Menu"
                className="w-8 h-8 object-contain"
              />
            </button>
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 mt-1">EKLE</span>
          </div>

          {/* Bookmarks */}
          <Link
            to="/bookmarks"
            className={`flex flex-col items-center justify-center w-full h-full ${isActive('/bookmarks') ? 'text-accent dark:text-[#B6C950]' : 'text-gray-500 dark:text-gray-400'
              }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <span className="text-xs mt-1">Yıldızlı</span>
          </Link>

          {/* Settings */}
          <Link
            to="/settings"
            className={`flex flex-col items-center justify-center w-full h-full ${isActive('/settings') ? 'text-accent dark:text-[#B6C950]' : 'text-gray-500 dark:text-gray-400'
              }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs mt-1">Ayarlar</span>
          </Link>
        </div>
      </nav>
    </>
  )
}
