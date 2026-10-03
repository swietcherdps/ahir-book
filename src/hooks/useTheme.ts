import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

export const useTheme = () => {
  useEffect(() => {
    const applyTheme = () => {
      // Default to 'light' if nothing saved
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' || 'light'
      const root = document.documentElement

      // Update document class
      if (savedTheme === 'dark') {
        root.classList.add('dark')
        if (Capacitor.isNativePlatform()) {
          // Dark style = Light text (for dark background)
          StatusBar.setStyle({ style: Style.Dark })
          StatusBar.setBackgroundColor({ color: '#3A502F' }) // Match app green
          StatusBar.setOverlaysWebView({ overlay: false }) // Validate: Ensure it doesn't float over content
        }
      } else {
        root.classList.remove('dark')
        if (Capacitor.isNativePlatform()) {
          // Force Dark style even in light mode to keep white text on green background
          StatusBar.setStyle({ style: Style.Dark })
          StatusBar.setBackgroundColor({ color: '#3A502F' }) // Match app green
          StatusBar.setOverlaysWebView({ overlay: false })
        }
      }

      // Update theme-color meta tag for mobile browser URL bar
      const themeColorMeta = document.querySelector('meta[name="theme-color"]')
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', savedTheme === 'dark' ? '#000000' : '#3A502F')
      }
    }

    // Apply theme immediately
    applyTheme()

    // Listen for storage changes (in case theme is changed in another tab)
    window.addEventListener('storage', applyTheme)
    return () => window.removeEventListener('storage', applyTheme)
  }, [])
}
