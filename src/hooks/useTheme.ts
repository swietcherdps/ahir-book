import { useEffect } from 'react'

export const useTheme = () => {
  useEffect(() => {
    const applyTheme = () => {
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' || 'system'
      const root = document.documentElement

      if (savedTheme === 'dark') {
        root.classList.add('dark')
      } else if (savedTheme === 'light') {
        root.classList.remove('dark')
      } else {
        // System theme
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        if (prefersDark) {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      }
    }

    // Apply theme immediately
    applyTheme()

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const savedTheme = localStorage.getItem('theme') || 'system'
      if (savedTheme === 'system') {
        applyTheme()
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])
}
