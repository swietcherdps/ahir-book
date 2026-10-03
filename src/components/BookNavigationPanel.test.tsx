import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import BookNavigationPanel from './BookNavigationPanel'
afterEach(cleanup)
it('provides direct access to book bookmarks even with a long table of contents', () => {
  const onNavigate = vi.fn()
  render(<BookNavigationPanel title="Kitap" sections={Array.from({ length: 300 }, (_, index) => ({ title: `Bölüm ${index}`, pageNumber: index + 1, level: 0 }))}
    bookmarks={[{ id: 1, bookId: 1, pageId: '8', createdAt: new Date() }]} currentPage={1} loading={false} onClose={vi.fn()} onNavigate={onNavigate} />)
  fireEvent.click(screen.getByRole('button', { name: 'Yer İmlerim (1)' }))
  expect(screen.queryByRole('navigation', { name: 'İçindekiler' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '★ Sayfa 8' }))
  expect(onNavigate).toHaveBeenCalledWith(8)
})
