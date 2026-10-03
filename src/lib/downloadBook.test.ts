import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book } from './db'
const mocks = vi.hoisted(() => ({ get: vi.fn(), install: vi.fn(), pdf: vi.fn(), epub: vi.fn(), hash: vi.fn(), risale: vi.fn() }))
vi.mock('./db', () => ({ db: { books: { get: mocks.get } }, replaceBookContent: mocks.install }))
vi.mock('./fileProcessor', () => ({ processPDF: mocks.pdf, processEPUB: mocks.epub }))
vi.mock('./diniContent', () => ({ verifyDownloadHash: mocks.hash }))
vi.mock('./risaleContent', () => ({ downloadAndInstallRisaleBook: mocks.risale }))
import { downloadBook } from './downloadBook'
const book: Book = { id: 1, title: 'Kitap', author: null, coverBlob: null, fileBlob: null, format: 'pdf', createdAt: new Date(), cloudUrl: 'https://example.com/%C4%B0hya.pdf' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Blob', NodeBlob)
  mocks.get.mockResolvedValue(book)
  mocks.pdf.mockResolvedValue({ pages: [{ pageNumber: 1, text: 'Metin' }], toc: [], coverBlob: new Blob(['cover']) })
  mocks.hash.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())
describe('book download and installation', () => {
  it('does not save a server error as a downloaded book', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>404</html>', { status: 404 })))
    await expect(downloadBook(book)).rejects.toThrow('henüz hazır değil')
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('rejects HTML mistakenly returned with HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>')))
    await expect(downloadBook(book)).rejects.toThrow('geçerli bir kitap')
    expect(mocks.pdf).not.toHaveBeenCalled()
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('handles responses without streams and encodes a Turkish path only once', async () => {
    const bytes = new Blob(['%PDF-1.7\nbook'])
    const fetcher = vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), body: null, blob: async () => bytes })
    vi.stubGlobal('fetch', fetcher)
    await downloadBook(book)
    expect(fetcher.mock.calls[0][0]).toBe('https://example.com/%C4%B0hya.pdf')
    expect(mocks.install).toHaveBeenCalledWith(1, [{ pageNumber: 1, html: 'Metin', plainText: '' }], expect.objectContaining({ fileBlob: bytes, isDownloaded: true, pageCount: 1 }))
  })
  it('keeps the previous install when file verification fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('%PDF-bad')))
    mocks.hash.mockRejectedValueOnce(new Error('hash mismatch'))
    await expect(downloadBook(book)).rejects.toThrow('hash mismatch')
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('does not reinstall a record deleted while a download was processing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('%PDF-1.7')))
    mocks.get.mockResolvedValueOnce(undefined)
    await expect(downloadBook(book)).rejects.toThrow('kütüphaneden kaldırılmış')
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('downloads the new Risale package for an old PDF record with a migrated source key', async () => {
    await downloadBook({ ...book, sourceKey: 'risale-online:17' })
    expect(mocks.risale).toHaveBeenCalledWith(expect.objectContaining({ format: 'risale-json', sourceKey: 'risale-online:17' }), undefined)
    expect(mocks.pdf).not.toHaveBeenCalled()
  })
})
