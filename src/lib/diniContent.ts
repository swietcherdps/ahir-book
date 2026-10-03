import catalog from './diniCatalog.json'
import { db, type Book } from './db'

export const DINI_SERIES = 'Dini E-Kitaplar'
export const DINI_CONTENT_BASE_URL = import.meta.env.VITE_DINI_CONTENT_BASE_URL ||
  'https://swietcherdps.github.io/ahir-book-content/dini/'

export const syncDiniBooks = async () => {
  await db.transaction('rw', db.books, async () => {
    for (const entry of catalog.books) {
      // İhyâ already belongs to the library; retain its record and download URL.
      if (entry.existingIhya) continue
      const existing = await db.books.where('sourceKey').equals(entry.sourceKey).first()
      const metadata: Partial<Book> = {
        title: entry.title, author: entry.author, format: 'pdf', isCloud: true,
        sourceKey: entry.sourceKey, sourceUrl: entry.sourceUrl, series: DINI_SERIES,
        cloudUrl: new URL(entry.packageUrl, DINI_CONTENT_BASE_URL).href,
        coverUrl: new URL(entry.coverUrl, DINI_CONTENT_BASE_URL).href,
        contentHash: entry.sha256, downloadSize: entry.downloadSize
      }
      if (existing?.id) await db.books.update(existing.id, metadata)
      else await db.books.add({ ...metadata, title: entry.title, author: entry.author,
        format: 'pdf', coverBlob: null, fileBlob: null, createdAt: new Date(),
        isDownloaded: false, isHidden: false })
    }
  })
}

export const verifyDownloadHash = async (blob: Blob, expectedHash?: string) => {
  if (!expectedHash) return
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (actual !== expectedHash.toLowerCase()) throw new Error('Kitap dosyası doğrulanamadı. Lütfen tekrar indirin.')
}
