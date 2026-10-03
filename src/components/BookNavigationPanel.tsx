import { useEffect, useRef, useState } from 'react'
import type { BookSection, Bookmark } from '../lib/db'

interface Props {
  title: string
  sections: BookSection[]
  bookmarks: Bookmark[]
  currentPage: number
  loading: boolean
  onClose: () => void
  onNavigate: (page: number, anchor?: string) => void
}

export default function BookNavigationPanel({ title, sections, bookmarks, currentPage, loading, onClose, onNavigate }: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const [activeTab, setActiveTab] = useState<'sections' | 'bookmarks'>('sections')
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>('button')
      if (!buttons?.length) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
      previousFocus?.focus()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] bg-black/50" onClick={(event) => { event.stopPropagation(); onClose() }}>
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="book-navigation-title"
        className="absolute inset-y-0 left-0 w-80 max-w-[90vw] bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-2xl overflow-y-auto safe-area-top p-4"
        onClick={event => event.stopPropagation()}>
        <div className="flex justify-between items-center mb-2">
          <h2 id="book-navigation-title" className="text-lg font-bold">Kitap Bölümleri</h2>
          <button onClick={onClose} aria-label="Paneli kapat" className="p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">✕</button>
        </div>
        <p className="text-sm text-gray-500 mb-6">{title}</p>
        <div className="flex gap-2 mb-4" aria-label="Kitap gezinme seçenekleri">
          <button onClick={() => setActiveTab('sections')} aria-pressed={activeTab === 'sections'}
            className={`flex-1 p-3 rounded-lg text-sm ${activeTab === 'sections' ? 'bg-accent text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>İçindekiler</button>
          <button onClick={() => setActiveTab('bookmarks')} aria-pressed={activeTab === 'bookmarks'}
            className={`flex-1 p-3 rounded-lg text-sm ${activeTab === 'bookmarks' ? 'bg-accent text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>Yer İmlerim ({bookmarks.length})</button>
        </div>
        {activeTab === 'sections' && <>
        <h3 className="font-semibold mb-3">Fihrist / İçindekiler</h3>
        {loading ? <p role="status" className="text-sm">Bölümler yükleniyor…</p> : sections.length === 0 ?
          <p className="text-sm text-gray-500">Bu kitapta bölüm bilgisi bulunamadı.</p> :
          <nav aria-label="İçindekiler" className="space-y-1">
            {sections.map((section, index) => (
              <button key={`${section.pageNumber}-${index}`} onClick={() => onNavigate(section.pageNumber, section.anchor)}
                aria-current={section.pageNumber === currentPage ? 'page' : undefined}
                className="w-full text-left py-3 pr-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex justify-between gap-3"
                style={{ paddingLeft: `${Math.min(section.level, 5) * 12 + 8}px` }}>
                <span>{section.title}</span><span className="text-sm text-gray-500 shrink-0">{section.pageNumber}</span>
              </button>
            ))}
          </nav>}
        </>}
        {activeTab === 'bookmarks' && <>
        <h3 className="font-semibold mb-3">Yer İmlerim</h3>
        {bookmarks.length === 0 ? <p className="text-sm text-gray-500">Bu kitapta henüz yer imi yok.</p> :
          bookmarks.map(bookmark => <button key={bookmark.id} onClick={() => onNavigate(Number(bookmark.pageId))}
            className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">★ Sayfa {bookmark.pageId}</button>)}
        </>}
      </aside>
    </div>
  )
}
