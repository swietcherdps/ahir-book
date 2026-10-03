import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { getBooks, type Book, db, getNoteNotificationSettings, updateNoteNotificationSettings, type NoteNotificationSettings } from '../lib/db'
import { scheduleNotifications, sendTestNotification, updateNotificationTimes, type NotificationFrequency } from '../lib/notification'
import { cancelNoteNotifications, getNextNoteNotificationTime, scheduleNoteNotifications } from '../lib/noteNotifications'
import NotificationFrequencySelector, { BookNotificationFrequencySelector } from '../components/NotificationFrequencySelector'
import { showToast } from '../components/Toast'
import AIStyleSelector from '../components/AIStyleSelector'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Settings() {
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [cacheCleared, setCacheCleared] = useState(false)

  // Notification states
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [frequency, setFrequency] = useState<NotificationFrequency>('4h')
  const [availableBooks, setAvailableBooks] = useState<Book[]>([])
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>([])
  const [bookNotificationCounts, setBookNotificationCounts] = useState<Record<number, number>>({})
  const [testNotificationStatus, setTestNotificationStatus] = useState('')

  // Input states (to allow empty string while typing)
  // const [smartCountInput, setSmartCountInput] = useState(localStorage.getItem('notification_smart_count') || '5')
  // const [aiCountInput, setAiCountInput] = useState(localStorage.getItem('notification_ai_count') || '5')

  // New Settings
  const [aiRatio, setAiRatio] = useState(parseInt(localStorage.getItem('notification_ai_ratio') || '50')) // 0-100
  const [promptStyle, setPromptStyle] = useState(localStorage.getItem('notification_prompt_style') || 'short_quote')


  // Pending notifications state
  const [pendingNotifications, setPendingNotifications] = useState<any[]>([])
  const [historyNotifications, setHistoryNotifications] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
  const [selectedNotification, setSelectedNotification] = useState<any>(null)
  const [showNotificationModal, setShowNotificationModal] = useState(false)

  // Note notification settings
  const [noteSettings, setNoteSettings] = useState<NoteNotificationSettings | null>(null)
  const [nextNoteTime, setNextNoteTime] = useState<Date | null>(null)

  // Category expansion state
  type SettingsCategory = 'general' | 'notifications' | 'api' | 'feedback' | 'reset' | null
  const [expandedCategory, setExpandedCategory] = useState<SettingsCategory>(null)
  const [searchParams] = useSearchParams()

  // Confirm Dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'danger' | 'warning' | 'info'
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', type: 'warning', onConfirm: () => { } })

  // Read category from URL params
  useEffect(() => {
    const categoryParam = searchParams.get('category')
    if (categoryParam && ['general', 'notifications', 'api', 'feedback', 'reset'].includes(categoryParam)) {
      setExpandedCategory(categoryParam as SettingsCategory)
    }
  }, [searchParams])

  // Load saved settings and books
  useEffect(() => {
    const savedApiKey = localStorage.getItem('google_api_key') || ''
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' || 'light'
    const savedNotifEnabled = localStorage.getItem('notifications_enabled') === 'true'
    const savedFrequency = (localStorage.getItem('notification_frequency') as NotificationFrequency) || '4h'
    const savedBookIds = JSON.parse(localStorage.getItem('notification_book_ids') || '[]')
    const savedBookCounts = JSON.parse(localStorage.getItem('notification_book_counts') || '{}')

    setApiKey(savedApiKey)
    setTheme(savedTheme)
    setNotificationsEnabled(savedNotifEnabled)
    setFrequency(savedFrequency)
    setSelectedBookIds(savedBookIds)
    setBookNotificationCounts(savedBookCounts)

    applyTheme(savedTheme)
    loadBooks()
    loadPendingNotifications()
    loadHistoryNotifications()
    loadNoteSettings()
  }, [])

  const loadNoteSettings = async () => {
    try {
      const settings = await getNoteNotificationSettings()
      setNoteSettings(settings)
      if (settings.enabled) {
        const next = await getNextNoteNotificationTime()
        setNextNoteTime(next)
      }
    } catch (error) {
      console.error('Failed to load note settings:', error)
    }
  }

  const loadPendingNotifications = async () => {
    try {
      const isWeb = Capacitor.getPlatform() === 'web'
      if (isWeb) {
        const webPending = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
        // Sort by time
        webPending.sort((a: any, b: any) => new Date(a.schedule.at).getTime() - new Date(b.schedule.at).getTime())
        setPendingNotifications(webPending)
      } else {
        const pending = await LocalNotifications.getPending()
        // Sort by time
        pending.notifications.sort((a: any, b: any) => new Date(a.schedule.at).getTime() - new Date(b.schedule.at).getTime())
        setPendingNotifications(pending.notifications)
      }
    } catch (error) {
      console.error('Bekleyen bildirimler yüklenemedi:', error)
    }
  }

  const loadHistoryNotifications = () => {
    const history = JSON.parse(localStorage.getItem('notification_history') || '[]')

    // Clean up old items (older than 5 days) unless favorited
    const fiveDaysAgo = new Date()
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

    const filtered = history.filter((n: any) => {
      if (n.isFavorite) return true
      return new Date(n.sentAt) > fiveDaysAgo
    })

    // If we filtered anything out, update localStorage
    if (filtered.length !== history.length) {
      localStorage.setItem('notification_history', JSON.stringify(filtered))
    }

    setHistoryNotifications(filtered)
  }

  const toggleFavorite = (id: number) => {
    setHistoryNotifications(prev => {
      const updated = prev.map(n =>
        n.id === id ? { ...n, isFavorite: !n.isFavorite } : n
      )
      localStorage.setItem('notification_history', JSON.stringify(updated))
      return updated
    })
  }

  const deleteHistoryItem = (id: number) => {
    setHistoryNotifications(prev => {
      const updated = prev.filter(n => n.id !== id)
      localStorage.setItem('notification_history', JSON.stringify(updated))
      return updated
    })
  }

  const clearHistoryExceptFavorites = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Geçmişi Temizle',
      message: 'Yıldızlı mesajlar hariç tüm geçmiş silinsin mi?',
      type: 'warning',
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        setHistoryNotifications(prev => {
          const updated = prev.filter(n => n.isFavorite)
          localStorage.setItem('notification_history', JSON.stringify(updated))
          showToast('Geçmiş temizlendi', 'success')
          return updated
        })
      }
    })
  }

  const deletePendingItem = async (id: number) => {
    const isWeb = Capacitor.getPlatform() === 'web'
    if (isWeb) {
      const updated = pendingNotifications.filter(n => n.id !== id)
      setPendingNotifications(updated)
      localStorage.setItem('web_scheduled_notifications', JSON.stringify(updated))
    } else {
      // For mobile, we need to cancel specific ID.
      // LocalNotifications.cancel takes an object with notifications array
      await LocalNotifications.cancel({ notifications: [{ id }] })
      loadPendingNotifications()
    }
  }

  const cancelAllNotifications = async () => {
    try {
      const isWeb = Capacitor.getPlatform() === 'web'
      if (isWeb) {
        localStorage.setItem('web_scheduled_notifications', '[]')
        setPendingNotifications([])
        showToast('Tüm bekleyen bildirimler iptal edildi', 'success')
      } else {
        const pending = await LocalNotifications.getPending()
        if (pending.notifications.length > 0) {
          await LocalNotifications.cancel(pending)
          setPendingNotifications([])
          showToast('Tüm bekleyen bildirimler iptal edildi', 'success')
        }
      }
    } catch (error) {
      console.error('Bildirimler iptal edilemedi:', error)
    }
  }

  const loadBooks = async () => {
    const books = await getBooks()
    setAvailableBooks(books)
    // If no books selected yet, select all by default
    if (!localStorage.getItem('notification_book_ids')) {
      setSelectedBookIds(books.map(b => b.id!))
    }
  }

  // Apply theme
  const applyTheme = (newTheme: 'light' | 'dark') => {
    const root = document.documentElement
    if (newTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  // Handle API key change
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = e.target.value
    setApiKey(newKey)
    localStorage.setItem('google_api_key', newKey)
  }

  // Handle theme change
  // Handle theme change
  const changeTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    // Sync reader background with theme
    localStorage.setItem('reader_backgroundColor', newTheme === 'dark' ? 'dark' : 'white')
    applyTheme(newTheme)
  }

  const [isLoading, setIsLoading] = useState(false)

  // Handle Notification Settings
  const updateNotifications = async (
    enabled: boolean,
    freq: NotificationFrequency,
    bookIds: number[]
  ) => {
    if (enabled && bookIds.length === 0) {
      showToast('Lütfen en az bir kitap seçin', 'warning')
      return
    }

    // Explicit check for denied permission
    if (enabled && 'Notification' in window && Notification.permission === 'denied') {
      showToast('Bildirim izni engellenmiş! Tarayıcı ayarlarından izin verin.', 'error')
      return
    }

    setIsLoading(true)
    try {
      // Wait until the operating system has actually registered the alarm.
      // If the app is closed while content is still being prepared, a detached
      // promise can be terminated before anything is scheduled.
      await scheduleNotifications(enabled ? freq : '24h', bookIds, enabled)

      setNotificationsEnabled(enabled)
      setFrequency(freq)
      setSelectedBookIds(bookIds)

      localStorage.setItem('notifications_enabled', String(enabled))
      localStorage.setItem('notification_frequency', freq)
      localStorage.setItem('notification_book_ids', JSON.stringify(bookIds))
      await loadPendingNotifications()

      if (enabled) {
        showToast('Alarm başlatıldı! Bildirimler hazırlanıyor...', 'success')
      } else {
        showToast('Alarm durduruldu', 'info')
      }
    } catch (error: any) {
      console.error('Bildirim ayarları kaydedilemedi:', error)
      showToast(`Hata: ${error.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const updateBookNotificationCount = async (bookId: number, count: number) => {
    const newCounts = { ...bookNotificationCounts, [bookId]: count }
    setBookNotificationCounts(newCounts)
    localStorage.setItem('notification_book_counts', JSON.stringify(newCounts))

    if (notificationsEnabled) {
      await scheduleNotifications(frequency, selectedBookIds, true)
      await loadPendingNotifications()
    }
  }

  const handleTestNotification = async () => {
    try {
      setTestNotificationStatus('Gönderiliyor...')
      await sendTestNotification(selectedBookIds)
      setTestNotificationStatus('Gönderildi! (Birkaç saniye içinde gelmeli)')
      setTimeout(() => setTestNotificationStatus(''), 3000)
    } catch (error: any) {
      setTestNotificationStatus('Hata: ' + error.message)
    }
  }

  // Clear only service worker cache
  const clearCache = async () => {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
      }
      setCacheCleared(true)
      setTimeout(() => setCacheCleared(false), 3000)
    } catch (error) {
      console.error('Cache temizleme hatası:', error)
    }
  }

  // Reset Database (Fix for corruption)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetCountdown, setResetCountdown] = useState(5)

  useEffect(() => {
    let timer: any
    if (showResetModal && resetCountdown > 0) {
      timer = setTimeout(() => setResetCountdown(resetCountdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [showResetModal, resetCountdown])

  const handleResetDatabase = () => {
    setShowResetModal(true)
    setResetCountdown(5)
  }

  const confirmResetDatabase = async () => {
    try {
      await db.delete()
      localStorage.clear()
      showToast('Veritabanı sıfırlandı. Yeniden başlatılıyor...', 'success')
      window.location.reload()
    } catch (error) {
      console.error('Veritabanı silinemedi:', error)
      showToast('Veritabanı silinemedi. Manuel temizleme gerekli.', 'error')
    }
  }

  /* OneSignal Setup Removed
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [onesignalAppId, setOnesignalAppId] = useState(localStorage.getItem('onesignal_app_id') || '')
  const [onesignalApiKey, setOnesignalApiKey] = useState(localStorage.getItem('onesignal_api_key') || '')
  */

  return (
    <>
      <div className="min-h-screen bg-background dark:bg-black p-4 pb-24">
        <div className="max-w-2xl mx-auto">
          <header className="flex items-center justify-center mb-6">
            <h1 className="text-2xl font-bold text-primary dark:text-gray-100">Ayarlar</h1>
          </header>

          <div className="space-y-3">
            {/* Category 1: Genel Ayarlar */}
            <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm">
              <button
                onClick={() => setExpandedCategory(expandedCategory === 'general' ? null : 'general')}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚙️</span>
                  <span className="font-semibold text-gray-900 dark:text-white">Genel Ayarlar</span>
                </div>
                <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedCategory === 'general' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedCategory === 'general' && (
                <div className="p-4 pt-0 border-t border-gray-100 dark:border-gray-800">
                  {/* Theme Setting */}
                  <div className="py-3">
                    <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-2">Tema</label>
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => changeTheme('light')}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${theme === 'light'
                          ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
                          : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                          }`}
                      >
                        <span className="text-lg">☀️</span>
                        Açık
                      </button>
                      <button
                        onClick={() => changeTheme('dark')}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${theme === 'dark'
                          ? 'bg-gray-700 text-white shadow-sm ring-1 ring-white/10'
                          : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                          }`}
                      >
                        <span className="text-lg">🌙</span>
                        Koyu
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Category 2: Bildirim Ayarları */}
            <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm">
              <button
                onClick={() => setExpandedCategory(expandedCategory === 'notifications' ? null : 'notifications')}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔔</span>
                  <span className="font-semibold text-gray-900 dark:text-white">Bildirim Ayarları</span>
                </div>
                <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedCategory === 'notifications' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedCategory === 'notifications' && (
                <div className="p-4 pt-0 border-t border-gray-100 dark:border-gray-800 space-y-4">
                  {/* Notification Settings */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-primary dark:text-gray-100">📚 Kitap Bildirimleri</h3>

                    <div className="flex items-center justify-between">
                      <span className="text-primary dark:text-gray-200 font-medium">Bildirim Durumu</span>
                      <div className="flex gap-2">
                        {!notificationsEnabled ? (
                          <button
                            onClick={() => updateNotifications(true, frequency, selectedBookIds)}
                            disabled={isLoading}
                            className={`px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {isLoading ? (
                              <span>⏳ Başlatılıyor...</span>
                            ) : (
                              <>
                                <span>▶</span> Alarmı Başlat
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => updateNotifications(false, frequency, selectedBookIds)}
                            disabled={isLoading}
                            className={`px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition flex items-center gap-2 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {isLoading ? (
                              <span>⏳ Durduruluyor...</span>
                            ) : (
                              <>
                                <span>⏹</span> Alarmı Durdur
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* AI Warning */}
                    {aiRatio > 0 && notificationsEnabled && (
                      <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2 mt-2">
                        <span className="text-lg">ℹ️</span>
                        <p>
                          Yapay zeka bildirimleri seçildiği için (%{aiRatio}), "Başlat" dedikten sonra arka planda içerik üretimi <strong>birkaç dakika sürebilir</strong>.
                          Lütfen sabırlı olun, bildirimler hazır olduğunda otomatik olarak planlanacaktır.
                        </p>
                      </div>
                    )}

                    <div className="space-y-4 animate-fadeIn pt-4 border-t border-gray-100 dark:border-gray-800">
                      <div>
                        <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-3">
                          Sıklık
                        </label>
                        <BookNotificationFrequencySelector
                          value={frequency}
                          onChange={(newFreq) => {
                            const freq = newFreq as NotificationFrequency
                            setFrequency(freq)
                            // If enabled, only update times (don't regenerate content)
                            if (notificationsEnabled) {
                              updateNotificationTimes(freq).then(() => {
                                loadPendingNotifications()
                              })
                            } else {
                              localStorage.setItem('notification_frequency', freq)
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-2">
                            Bildirim İçeriği Oranı
                          </label>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-gray-500 w-20 text-right">Hızlı Cümle (%{100 - aiRatio})</span>
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
                            <span className="text-xs text-gray-500 w-20">Yapay Zeka (%{aiRatio})</span>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1 text-center">
                            {aiRatio === 0 ? 'Sadece kitaptan rastgele cümleler seçilir.' :
                              aiRatio === 100 ? 'Sadece yapay zeka tarafından üretilen içerikler gönderilir.' :
                                'Bildirimlerin bir kısmı kitaptan, bir kısmı yapay zeka üretiminden oluşur.'}
                          </p>
                        </div>

                        {aiRatio > 0 && (
                          <div>
                            <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-2">
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
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-2">
                          Hangi Kitaplardan? (Sadece İndirilenler)
                        </label>
                        <div className="max-h-60 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 space-y-2 dark:bg-gray-800">
                          {availableBooks.filter(b => b.isDownloaded).length === 0 ? (
                            <p className="text-sm text-gray-500 p-2">Henüz indirilmiş kitap yok.</p>
                          ) : (
                            availableBooks.filter(b => b.isDownloaded).map(book => (
                              <div key={book.id} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition">
                                <label className="flex items-center gap-2 cursor-pointer flex-1">
                                  <input
                                    type="checkbox"
                                    checked={selectedBookIds.includes(book.id!)}
                                    onChange={(e) => {
                                      const newIds = e.target.checked
                                        ? Array.from(new Set([...selectedBookIds, book.id!]))
                                        : selectedBookIds.filter(id => id !== book.id)

                                      setSelectedBookIds(newIds)

                                      // Default to 1 if selecting and no count set
                                      if (e.target.checked && !bookNotificationCounts[book.id!]) {
                                        const newCounts = { ...bookNotificationCounts, [book.id!]: 1 }
                                        setBookNotificationCounts(newCounts)
                                        localStorage.setItem('notification_book_counts', JSON.stringify(newCounts))
                                      }

                                      if (notificationsEnabled) {
                                        updateNotifications(true, frequency, newIds)
                                      } else {
                                        localStorage.setItem('notification_book_ids', JSON.stringify(newIds))
                                      }
                                    }}
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
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Adet:</span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => {
                                          const currentVal = bookNotificationCounts[book.id!] || 0
                                          void updateBookNotificationCount(book.id!, Math.max(0, currentVal - 1))
                                        }}
                                        className="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300 transition"
                                      >
                                        −
                                      </button>
                                      <input
                                        type="number"
                                        min="0"
                                        max="10"
                                        value={bookNotificationCounts[book.id!] || 0}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 0
                                          void updateBookNotificationCount(book.id!, val)
                                        }}
                                        className="w-12 px-1 py-0.5 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-900 dark:text-white text-center"
                                      />
                                      <button
                                        onClick={() => {
                                          const currentVal = bookNotificationCounts[book.id!] || 0
                                          void updateBookNotificationCount(book.id!, Math.min(10, currentVal + 1))
                                        }}
                                        className="w-6 h-6 flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300 transition"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">
                          Seçili kitapların yanındaki kutucuğa, o kitaptan kaç adet bildirim almak istediğinizi yazın. (0 yazarsanız o kitaptan bildirim gelmez)
                        </p>
                      </div>

                      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-4 mb-4 border-b border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() => setActiveTab('pending')}
                            className={`pb-2 px-1 ${activeTab === 'pending'
                              ? 'border-b-2 border-accent text-accent font-medium'
                              : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            Bekleyenler ({pendingNotifications.length})
                          </button>
                          <button
                            onClick={() => setActiveTab('history')}
                            className={`pb-2 px-1 ${activeTab === 'history'
                              ? 'border-b-2 border-accent text-accent font-medium'
                              : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            Geçmiş
                          </button>
                        </div>

                        {activeTab === 'pending' ? (
                          <>
                            <div className="flex justify-end mb-2">
                              {pendingNotifications.length > 0 && (
                                <button
                                  onClick={cancelAllNotifications}
                                  className="text-xs text-red-500 hover:text-red-700"
                                >
                                  Tümünü İptal Et
                                </button>
                              )}
                            </div>

                            {pendingNotifications.length === 0 ? (
                              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                                Bekleyen bildirim yok.
                              </p>
                            ) : (
                              <div className="space-y-3 max-h-60 overflow-y-auto">
                                {pendingNotifications.map((notif) => (
                                  <div
                                    key={notif.id}
                                    onClick={() => {
                                      setSelectedNotification(notif)
                                      setShowNotificationModal(true)
                                    }}
                                    className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 relative group cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        deletePendingItem(notif.id)
                                      }}
                                      className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                      title="İptal Et"
                                    >
                                      ✕
                                    </button>
                                    <div className="flex justify-between items-start pr-6">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <p className="font-medium text-sm text-primary dark:text-gray-200">{notif.title}</p>
                                          {notif.extra?.isAI && (
                                            <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-1.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                                              ✨ AI
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{notif.body}</p>
                                      </div>
                                      <span className="text-xs text-accent bg-blue-50 dark:bg-blue-900 px-2 py-1 rounded whitespace-nowrap ml-2">
                                        {notif.schedule?.at ? new Date(notif.schedule.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Zamanlanmış'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex justify-end mb-2">
                              {historyNotifications.length > 0 && (
                                <button
                                  onClick={clearHistoryExceptFavorites}
                                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                                >
                                  <span>🗑</span> Yıldızlılar Hariç Temizle
                                </button>
                              )}
                            </div>
                            <div className="space-y-3 max-h-60 overflow-y-auto">
                              {historyNotifications.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                                  Henüz gönderilmiş bildirim yok.
                                </p>
                              ) : (
                                historyNotifications.map((notif) => (
                                  <div
                                    key={notif.id}
                                    onClick={() => {
                                      setSelectedNotification(notif)
                                      setShowNotificationModal(true)
                                    }}
                                    className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 relative cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition group"
                                  >
                                    <div className="flex justify-between items-start">
                                      <div className="pr-8">
                                        <p className="font-medium text-sm text-primary dark:text-gray-200">{notif.title}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{notif.body}</p>
                                        <p className="text-[10px] text-gray-400 mt-1">
                                          {new Date(notif.sentAt).toLocaleString()}
                                        </p>
                                      </div>
                                      <div className="flex flex-col gap-2">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            toggleFavorite(notif.id)
                                          }}
                                          className={`text-lg transition-colors ${notif.isFavorite ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`}
                                          title="Favorilere Ekle/Çıkar"
                                        >
                                          {notif.isFavorite ? '★' : '☆'}
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            deleteHistoryItem(notif.id)
                                          }}
                                          className="text-gray-300 hover:text-red-500 text-sm"
                                          title="Sil"
                                        >
                                          🗑
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={handleTestNotification}
                          disabled={selectedBookIds.length === 0}
                          className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-gray-600 transition disabled:opacity-50 text-sm"
                        >
                          Tefeül Bildirim Gönder
                        </button>
                        {testNotificationStatus && (
                          <span className="ml-3 text-sm text-accent">{testNotificationStatus}</span>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* My Notes Notifications */}
                  <section className="space-y-4 pt-6">
                    <h2 className="text-xl font-semibold text-primary dark:text-gray-100 border-b pb-2">📝 Notlarım Bildirimleri</h2>

                    {noteSettings && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-primary dark:text-gray-200 font-medium">Not Bildirimleri</span>
                          <button
                            onClick={async () => {
                              const newEnabled = !noteSettings.enabled
                              await updateNoteNotificationSettings({ enabled: newEnabled })
                              if (newEnabled) {
                                await scheduleNoteNotifications()
                              } else {
                                await cancelNoteNotifications()
                              }
                              await loadNoteSettings()
                            }}
                            className={`px-4 py-2 rounded-lg transition ${noteSettings.enabled
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-400 dark:hover:bg-gray-600'
                              }`}
                          >
                            {noteSettings.enabled ? '✓ Aktif' : 'Kapalı'}
                          </button>
                        </div>

                        {noteSettings.enabled && nextNoteTime && (
                          <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border border-blue-100 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
                            📅 Sonraki bildirim: {nextNoteTime.toLocaleString('tr-TR', {
                              day: 'numeric',
                              month: 'long',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        )}

                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-3">
                              Bildirim Sıklığı
                            </label>
                            <NotificationFrequencySelector
                              value={noteSettings.frequency}
                              onChange={async (freq) => {
                                await updateNoteNotificationSettings({ frequency: freq })
                                if (noteSettings.enabled) {
                                  await scheduleNoteNotifications()
                                }
                                await loadNoteSettings()
                              }}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-2">
                              Bildirim Modu
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={async () => {
                                  await updateNoteNotificationSettings({ mode: 'sequential' })
                                  if (noteSettings.enabled) {
                                    await scheduleNoteNotifications()
                                  }
                                  await loadNoteSettings()
                                }}
                                className={`p-3 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${noteSettings.mode === 'sequential'
                                  ? 'bg-accent text-white shadow-md'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                  }`}
                              >
                                📋 Sıralı
                              </button>
                              <button
                                onClick={async () => {
                                  await updateNoteNotificationSettings({ mode: 'random' })
                                  if (noteSettings.enabled) {
                                    await scheduleNoteNotifications()
                                  }
                                  await loadNoteSettings()
                                }}
                                className={`p-3 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${noteSettings.mode === 'random'
                                  ? 'bg-accent text-white shadow-md'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                  }`}
                              >
                                🎲 Rastgele
                              </button>
                            </div>
                          </div>

                          {noteSettings.mode === 'sequential' && (
                            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                              <span className="text-sm text-primary dark:text-gray-200">Sona gelince başa dön</span>
                              <button
                                onClick={async () => {
                                  await updateNoteNotificationSettings({ repeatEnabled: !noteSettings.repeatEnabled })
                                  await loadNoteSettings()
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${noteSettings.repeatEnabled ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'
                                  }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${noteSettings.repeatEnabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                              </button>
                            </div>
                          )}

                          <div className="text-xs text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            💡 <strong>İpucu:</strong> Not bildirimleri kitap bildirimlerinden bağımsızdır. Her iki sistemi aynı anda kullanabilirsiniz.
                          </div>
                        </div>
                      </>
                    )}
                  </section>
                </div>
              )}
            </div>

            {/* Category 3: İstek Öneri */}
            <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm">
              <button
                onClick={() => setExpandedCategory(expandedCategory === 'feedback' ? null : 'feedback')}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💬</span>
                  <span className="font-semibold text-gray-900 dark:text-white">İstek & Öneri</span>
                </div>
                <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedCategory === 'feedback' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedCategory === 'feedback' && (
                <div className="p-4 pt-0 border-t border-gray-100 dark:border-gray-800">
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">✉️</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Görüşlerinizi Bekliyoruz
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      Uygulamamızı geliştirmemize yardımcı olun. Önerilerinizi, hata bildirimlerinizi veya yeni özellik isteklerinizi bize iletin.
                    </p>
                    <a
                      href="mailto:swietcher@icloud.com?subject=Ahir%20Book%20-%20Geri%20Bildirim"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-xl font-medium hover:bg-blue-600 transition"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      E-posta Gönder
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Category 4: API Ayarları */}
            <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm">
              <button
                onClick={() => setExpandedCategory(expandedCategory === 'api' ? null : 'api')}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔑</span>
                  <span className="font-semibold text-gray-900 dark:text-white">API Ayarları</span>
                </div>
                <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedCategory === 'api' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedCategory === 'api' && (
                <div className="p-4 pt-0 border-t border-gray-100 dark:border-gray-800 space-y-4">
                  {/* Gemini API Key */}
                  <div className="py-3 border-b border-gray-100 dark:border-gray-800">
                    <label className="block text-sm font-medium text-primary dark:text-gray-200 mb-2">
                      🤖 Google Gemini API Key
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Yapay zeka destekli bildirim içerikleri için gerekli
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKey}
                        onChange={handleApiKeyChange}
                        placeholder="AI Studio'dan aldığınız anahtarı girin"
                        className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent select-text"
                        style={{ userSelect: 'text', WebkitUserSelect: 'text', WebkitTouchCallout: 'default' }}
                      />
                      <button
                        onClick={async () => {
                          try {
                            // Try native clipboard first (Capacitor)
                            const { Clipboard } = await import('@capacitor/clipboard')
                            const { value } = await Clipboard.read()

                            if (value) {
                              setApiKey(value.trim())
                              localStorage.setItem('google_api_key', value.trim())
                              showToast('API anahtarı yapıştırıldı', 'success')
                            } else {
                              // Fallback to browser API if native returned empty or failed
                              if (navigator.clipboard) {
                                const text = await navigator.clipboard.readText()
                                if (text) {
                                  setApiKey(text.trim())
                                  localStorage.setItem('google_api_key', text.trim())
                                  showToast('API anahtarı yapıştırıldı', 'success')
                                } else {
                                  showToast('Pano boş', 'warning')
                                }
                              } else {
                                showToast('Pano boş veya erişilemiyor', 'warning')
                              }
                            }
                          } catch (err) {
                            console.error('Clipboard error:', err)
                            // Fallback to browser API
                            try {
                              if (navigator.clipboard) {
                                const text = await navigator.clipboard.readText()
                                if (text) {
                                  setApiKey(text.trim())
                                  localStorage.setItem('google_api_key', text.trim())
                                  showToast('API anahtarı yapıştırıldı', 'success')
                                  return
                                }
                              }
                              showToast('Pano izni reddedildi. Lütfen manuel yapıştırın.', 'error')
                            } catch (e) {
                              showToast('Pano erişimi başarısız', 'error')
                            }
                          }
                        }}
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                        title="Yapıştır"
                      >
                        📋
                      </button>
                    </div>
                    <details className="mt-2">
                      <summary className="text-xs text-accent cursor-pointer hover:underline">ℹ️ Nasıl Alınır?</summary>
                      <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-600 dark:text-gray-400">
                        <ol className="list-decimal pl-4 space-y-1">
                          <li><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Google AI Studio</a>'ya gidin</li>
                          <li>"Create API Key" butonuna tıklayın</li>
                          <li>Oluşturulan anahtarı kopyalayın</li>
                          <li>Yukarıdaki alana yapıştırın</li>
                        </ol>
                      </div>
                    </details>
                  </div>

                  {/* OneSignal Settings REMOVED */}

                  {/* Status Indicator */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`w-2 h-2 rounded-full ${apiKey ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                      <span className="text-gray-600 dark:text-gray-300">Gemini API: {apiKey ? 'Yapılandırıldı ✓' : 'Yapılandırılmadı'}</span>
                    </div>
                    {/* OneSignal Status Removed */}
                  </div>
                </div>
              )}
            </div>

            {/* Category 5: Sıfırlama Ayarları */}
            <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-sm">
              <button
                onClick={() => setExpandedCategory(expandedCategory === 'reset' ? null : 'reset')}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔄</span>
                  <span className="font-semibold text-gray-900 dark:text-white">Sıfırlama Ayarları</span>
                </div>
                <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedCategory === 'reset' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedCategory === 'reset' && (
                <div className="p-4 pt-0 border-t border-gray-100 dark:border-gray-800 space-y-3">
                  <button
                    onClick={clearCache}
                    className="w-full bg-yellow-500 text-white py-3 rounded-xl hover:bg-yellow-600 transition disabled:opacity-50 font-medium"
                    disabled={cacheCleared}
                  >
                    {cacheCleared ? '✓ Cache Temizlendi' : '🧹 Önbelleği Temizle'}
                  </button>

                  <button
                    onClick={handleResetDatabase}
                    className="w-full bg-red-600 text-white py-3 rounded-xl hover:bg-red-700 transition font-medium"
                  >
                    ⚠️ Veritabanını Sıfırla
                  </button>
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                    «Internal error» veya «Backing store» hatası alıyorsanız kullanın. <strong>Tüm kitaplar silinir!</strong>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Database Reset Modal */}
          {showResetModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-fadeIn">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">⚠️</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Veritabanı Sıfırlanacak
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Tüm kitaplarınız, ayarlarınız ve geçmişiniz silinecek. Bu işlem <strong>geri alınamaz!</strong>
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowResetModal(false)}
                    className="flex-1 py-3 px-4 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition font-medium"
                  >
                    İptal
                  </button>
                  <button
                    onClick={confirmResetDatabase}
                    disabled={resetCountdown > 0}
                    className="flex-1 py-3 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resetCountdown > 0 ? `Sıfırla (${resetCountdown})` : 'Sıfırla'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notification Detail Modal */}
          {showNotificationModal && selectedNotification && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl animate-fadeIn max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🔔</span>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                      {selectedNotification.title}
                    </h3>
                    {selectedNotification.extra?.isAI && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-1.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                        ✨ AI
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowNotificationModal(false)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed overflow-y-auto pr-2 custom-scrollbar mb-6">
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedNotification.body}</p>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                  <button
                    onClick={() => setShowNotificationModal(false)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    Kapat
                  </button>
                  {/* Support both pending (extra.bookId) and history (bookId directly) formats */}
                  {((selectedNotification.extra?.bookId && selectedNotification.extra?.pageId) ||
                    (selectedNotification.bookId && selectedNotification.pageId)) && (
                      <button
                        onClick={() => {
                          // Handle both data structures
                          const bookId = selectedNotification.extra?.bookId || selectedNotification.bookId
                          const pageId = selectedNotification.extra?.pageId || selectedNotification.pageId
                          const url = selectedNotification.extra?.url || selectedNotification.url

                          let navigationPath = `/reader/${bookId}/${pageId}`

                          if (url && url.includes('?q=')) {
                            const qParam = url.split('?q=')[1]
                            if (qParam) {
                              navigationPath += `?q=${qParam.split('&')[0]}`
                            }
                          }

                          setShowNotificationModal(false)
                          navigate(navigationPath)
                        }}
                        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition"
                      >
                        {(selectedNotification.extra?.isAI || selectedNotification.isAI) ? '📖 Sayfaya Git' : '🔍 Metne Git'}
                      </button>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Setup Modal REMOVED */}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </>
  )
}
