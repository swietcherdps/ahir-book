import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BookCover from './BookCover'

describe('book artwork', () => {
  it('retains a readable cover if the supplied image cannot be loaded', () => {
    render(<BookCover book={{ title: 'Kapaksız Kitap', author: 'Yazar', coverBlob: null, coverUrl: 'https://example.com/missing.jpg' }} />)
    const image = screen.getByRole('img', { name: 'Kapaksız Kitap kapağı' })
    fireEvent.error(image)
    const source = image.getAttribute('src')!
    expect(source).toMatch(/^data:image\/svg\+xml/)
    expect(decodeURIComponent(source)).toContain('Kapaksız Kitap')
    expect(image).toBeVisible()
  })
})
