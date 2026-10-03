import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import catalog from './diniCatalog.json'
import risaleCatalog from './risaleCoverCatalog.json'
import { curatedCover } from './bookCover'

describe('installed library artwork', () => {
  it('ships a valid offline cover for every one of the 75 supplied books', () => {
    const books = [
      ...catalog.books.filter(book => !book.existingIhya),
      ...risaleCatalog.map(book => ({ ...book, title: book.slug })),
      { title: 'İhya-u Ulumiddin' }, { title: 'Kuran Yolu Meali' }
    ]
    expect(books).toHaveLength(75)
    for (const book of books) {
      const cover = curatedCover({ ...book, isCloud: true })
      expect(cover, book.title).toBeTruthy()
      const bytes = readFileSync(resolve('public/covers', cover!.split('/').pop()!))
      expect(bytes.length, book.title).toBeGreaterThan(1000)
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
      expect(bytes.toString('ascii', 8, 12)).toBe('WEBP')
    }
  })
})
