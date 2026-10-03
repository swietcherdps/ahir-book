import type { Book } from './db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RISALE_CATALOG_CACHE_KEY,
  fetchRisaleCatalog,
  sanitizeRisaleHtml,
  risaleSections,
  type RisalePackage,
  validateCatalog,
  validateRisalePackage
} from './risaleContent'

const catalog = {
  schemaVersion: 1 as const,
  generatedAt: '2026-09-21T00:00:00.000Z',
  source: 'https://risale.online/oku?tip=latince',
  books: [{
    sourceKey: 'risale-online:17',
    sourceId: 17,
    slug: 'sozler',
    title: 'SÖZLER',
    author: 'Bediüzzaman Said Nursi',
    pageCount: 1,
    version: '1-test',
    downloadSize: 100,
    sha256: 'a'.repeat(64),
    packageUrl: './books/sozler.json.gz',
    coverUrl: './covers/sozler.webp',
    sourceUrl: 'https://risale.online/oku/sozler?tip=latince'
  }]
}

const book: Book = {
  id: 1,
  title: 'SÖZLER',
  author: 'Bediüzzaman Said Nursi',
  coverBlob: null,
  fileBlob: null,
  format: 'risale-json',
  createdAt: new Date(),
  sourceKey: 'risale-online:17',
  contentVersion: '1-test',
  pageCount: 1
}

describe('Risale content', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('preserves glossary metadata while removing active content', () => {
    const html = sanitizeRisaleHtml(`
      <script>alert(1)</script>
      <span data-lugat-latince-kelime="Nefis" data-lugat-latince-mana="Bir şeyin kendisi" onclick="alert(1)">nefis</span>
      <img src=x onerror="alert(1)">
    `)

    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('<img')
    expect(html).toContain('data-lugat-latince-mana="Bir şeyin kendisi"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('role="button"')
  })

  it('preserves Ottoman typography and glossary fields', () => {
    const html = sanitizeRisaleHtml(`
      <section class="paragraf-hasiyeler">
        <aside class="paragraf-hasiye paragraf-hasiye-osmanlica">
          <span class="OsmanlicaStandartKirmizi"
            data-lugat-osmanlica-kelime="لِسَانْ"
            data-lugat-osmanlica-mana="دیل"
            data-lugat-latince-kelime="Lisân"
            data-lugat-latince-mana="Dil">لسان</span>
        </aside>
      </section>
    `)

    expect(html).toContain('<section class="paragraf-hasiyeler">')
    expect(html).toContain('<aside class="paragraf-hasiye paragraf-hasiye-osmanlica">')
    expect(html).toContain('data-lugat-osmanlica-kelime="لِسَانْ"')
    expect(html).toContain('data-lugat-osmanlica-mana="دیل"')
  })

  it('rejects malformed catalogs', () => {
    expect(() => validateCatalog({ schemaVersion: 2, books: [] })).toThrow()
    expect(() => validateCatalog({ schemaVersion: 1, books: [{}] })).toThrow()
    expect(() => validateCatalog({ ...catalog, books: [catalog.books[0], catalog.books[0]] }))
      .toThrow('mükerrer')
  })

  it('uses the cached catalog when the network is unavailable', async () => {
    localStorage.setItem(RISALE_CATALOG_CACHE_KEY, JSON.stringify(catalog))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const result = await fetchRisaleCatalog('https://content.example/catalog.json')
    expect(result.fromCache).toBe(true)
    expect(result.catalog.books[0].sourceKey).toBe('risale-online:17')
  })

  it('validates page count and rejects duplicate pages', () => {
    const validPackage = {
      schemaVersion: 1 as const,
      source: { name: 'Risale Online', url: 'https://example.test', publisher: 'Hayrat' },
      book: {
        sourceKey: 'risale-online:17', sourceId: 17, slug: 'sozler', title: 'SÖZLER',
        author: 'Bediüzzaman Said Nursi', pageCount: 1, version: '1-test'
      },
      toc: [],
      pages: [{ pageNumber: 1, html: '<p>Metin</p>', plainText: 'Metin', sourceParagraphIds: [1] }]
    }
    expect(validateRisalePackage(validPackage, book).pages).toHaveLength(1)

    const duplicate = {
      ...validPackage,
      book: { ...validPackage.book, pageCount: 2 },
      pages: [validPackage.pages[0], validPackage.pages[0]]
    }
    expect(() => validateRisalePackage(duplicate, { ...book, pageCount: 2 })).toThrow('tekrarlı')
  })
  it('preserves source section destinations and ignores invalid entries', () => {
    const pkg = { book: { pageCount: 10, writingType: 'latince' }, toc: [
      { sayfa: 1, latince_baslik: 'Birinci Söz', osmanlica_baslik: 'سوز' },
      { sayfa: 3, latince_baslik: 'İkinci Söz' },
      { sayfa: 99, latince_baslik: 'Geçersiz' }, null
    ] } as unknown as RisalePackage
    expect(risaleSections(pkg)).toEqual([
      { title: 'Birinci Söz', pageNumber: 1, level: 0 },
      { title: 'İkinci Söz', pageNumber: 3, level: 0 }
    ])
    pkg.book.writingType = 'osmanlica'
    expect(risaleSections(pkg)[0].title).toBe('سوز')
  })

})
