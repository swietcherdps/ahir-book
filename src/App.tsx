import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { useTheme } from './hooks/useTheme'
import Home from './pages/Home'
import Library from './pages/Library'
import Bookmarks from './pages/Bookmarks'
import Settings from './pages/Settings'
import SearchResults from './pages/SearchResults'
import Reader from './pages/Reader'
import Import from './pages/Import'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  
  // Apply theme globally on every route
  useTheme()

  useEffect(() => {
    let listenerHandle: any = null
    
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

    return () => {
      if (listenerHandle) {
        listenerHandle.remove()
      }
    }
  }, [navigate, location])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/library" element={<Library />} />
      <Route path="/bookmarks" element={<Bookmarks />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/search-results" element={<SearchResults />} />
      <Route path="/reader/:bookId/:pageId" element={<Reader />} />
      <Route path="/import" element={<Import />} />
    </Routes>
  )
}

function App() {
  // Use base path for GitHub Pages, empty for mobile apps
  const basename = import.meta.env.BASE_URL
  
  return (
    <Router basename={basename}>
      <AppContent />
    </Router>
  )
}

export default App
