import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { useEffect, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useTheme } from './hooks/useTheme'
import { checkWebNotifications, replenishNotifications } from './lib/notification'
// import { initOneSignal } from './lib/push'
import Home from './pages/Home'
import Library from './pages/Library'
import Bookmarks from './pages/Bookmarks'
import Settings from './pages/Settings'
import SearchResults from './pages/SearchResults'
import Reader from './pages/Reader'
import Import from './pages/Import'
import NotificationModal from './components/NotificationModal'
import { ToastProvider } from './components/Toast'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()

  // Apply theme globally on every route
  useTheme()

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [modalContent, setModalContent] = useState<{ title: string; body: string; path?: string }>({ title: '', body: '' })

  // OneSignal Initialization - REMOVED
  /*
  useEffect(() => {
    const oneSignalAppId = localStorage.getItem('onesignal_app_id')
    if (oneSignalAppId) {
      initOneSignal(oneSignalAppId)
    }
  }, [])
  */

  useEffect(() => {
    // StatusBar Configuration
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      // Set style and background color based on theme
      // We can detect theme from localStorage or system
      const isDark = localStorage.getItem('theme') === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches

      if (Capacitor.isNativePlatform()) {
        try {
          StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
          // Use a dynamic color, not transparent, so time is visible
          StatusBar.setBackgroundColor({ color: isDark ? '#000000' : '#FFFFFF' })
          StatusBar.setOverlaysWebView({ overlay: false }) // Disable overlay to ensure background color is used
        } catch (e) {
          console.error('StatusBar config error:', e)
        }
      }
    })

    // Check for web notifications every 10 seconds
    const interval = setInterval(() => {
      checkWebNotifications()
    }, 10000)

    // Initial check and replenishment
    try {
      checkWebNotifications()
      replenishNotifications().catch(err => console.error('Replenish failed:', err))
    } catch (e) {
      console.error('Notification Init Error:', e)
    }

    let listenerHandle: any = null
    let notifListener: any = null

    // Handle Android back button
    CapacitorApp.addListener('backButton', ({ canGoBack }: { canGoBack: boolean }) => {
      if (canGoBack) {
        // Navigate back in app history
        navigate(-1)
      } else {
        // If on home page, exit app
        if (location.pathname === '/') {
          CapacitorApp.exitApp()
        } else {
          // Otherwise go to home
          navigate('/')
        }
      }
    }).then(handle => {
      listenerHandle = handle
    })

    // Handle Notification Click (Deep Linking & Modal)
    import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
      LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
        // 1. Parse Deep Link Path
        let path = ''
        const extra = notification.notification.extra
        if (extra) {
          if (extra.url) {
            try {
              const hashIndex = extra.url.indexOf('#')
              if (hashIndex !== -1) {
                path = extra.url.substring(hashIndex + 1)
              } else if (extra.url.startsWith('/')) {
                path = extra.url
              }
            } catch (e) {
              console.error('Deep link parsing failed:', e)
            }
          } else if (extra.bookId && extra.pageId) {
            path = `/reader/${extra.bookId}/${extra.pageId}`
          }
        }

        // 2. Show Modal with Content and Path
        const { title, body } = notification.notification
        if (path.startsWith('/reader/') && (extra?.bookTitle || extra?.originalTitle || title)) {
          const url = new URL(path, window.location.origin)
          url.searchParams.set('bookTitle', extra?.bookTitle || extra?.originalTitle || title)
          if (extra?.sourceKey) url.searchParams.set('sourceKey', extra.sourceKey)
          path = url.pathname + url.search
        }
        if (title && body) {
          setModalContent({ title, body, path })
          setModalOpen(true)
        } else if (path) {
          // If no title/body (silent notification?), just navigate
          navigate(path)
        }
      }).then(handle => {
        notifListener = handle
      })
    })

    return () => {
      clearInterval(interval)
      if (listenerHandle) {
        listenerHandle.remove()
      }
      if (notifListener) {
        notifListener.remove()
      }
    }
  }, [navigate, location])

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Library />} />
          <Route path="/search" element={<Home />} />
          <Route path="/library" element={<Library />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/search-results" element={<SearchResults />} />
          <Route path="/reader/:bookId/:pageId" element={<Reader />} />
          <Route path="/import" element={<Import />} />
        </Route>
      </Routes>

      <NotificationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalContent.title}
        body={modalContent.body}
        actionLabel={modalContent.path ? "Metne Git" : undefined}
        onAction={modalContent.path ? () => {
          navigate(modalContent.path!)
          setModalOpen(false)
        } : undefined}
      />
    </>
  )
}

function App() {
  return (
    <ToastProvider>
      <Router>
        <AppContent />
      </Router>
    </ToastProvider>
  )
}

export default App
