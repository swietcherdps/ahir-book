import { db, replaceBookContent, type Book } from './db'
import { downloadAndInstallRisaleBook } from './risaleContent'
import { processEPUB, processPDF } from './fileProcessor'
import { verifyDownloadHash } from './diniContent'
import { normalizeRemoteUrl } from './bookCover'

// Both the library and notification reader use this path. Installation is atomic.
export async function downloadBook(book: Book, onProgress?: (percent: number, total: number) => void) {
  if (!book.id || !book.cloudUrl) throw new Error('Bu kitap için indirme adresi tanımlı değil.')
  if (book.format === 'risale-json' || book.sourceKey?.startsWith('risale-online:')) {
    await downloadAndInstallRisaleBook({ ...book, format: 'risale-json' }, onProgress)
    return
  }
  const response = await fetch(normalizeRemoteUrl(book.cloudUrl), { mode: 'cors' })
  if (!response.ok) throw new Error(response.status === 404
    ? 'Kitap sunucuda henüz hazır değil. Lütfen daha sonra tekrar deneyin.'
    : `Sunucuya ulaşılamadı (${response.status}). Lütfen tekrar deneyin.`)
  const total = Number(response.headers.get('content-length')) || book.downloadSize || 0
  const reader = response.body?.getReader()
  const chunks: BlobPart[] = []
  let loaded = 0
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) { chunks.push(value); loaded += value.length; onProgress?.(total ? Math.min(99, Math.round(loaded / total * 100)) : 0, total) }
    }
  }
  const blob = reader ? new Blob(chunks) : await response.blob()
  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
  const valid = book.format === 'pdf' ? new TextDecoder().decode(header) === '%PDF-' : header[0] === 0x50 && header[1] === 0x4b
  if (!valid) throw new Error('Sunucudan geçerli bir kitap dosyası alınamadı. Lütfen tekrar deneyin.')
  await verifyDownloadHash(blob, book.contentHash)
  const processed = book.format === 'epub'
    ? await processEPUB(new File([blob], `${book.title}.epub`, { type: 'application/epub+zip' }))
    : await processPDF(blob, book.title)
  // A stale catalog download must not recreate a deleted user record.
  if (!await db.books.get(book.id)) throw new Error('Kitap kütüphaneden kaldırılmış.')
  await replaceBookContent(book.id, processed.pages.map(page => ({ pageNumber: page.pageNumber, html: page.text, plainText: '' })), {
    fileBlob: blob, toc: processed.toc, pageCount: processed.pages.length,
    coverBlob: book.coverBlob || processed.coverBlob,
    isDownloaded: true, viewMode: book.format === 'pdf' ? 'pdf' : 'text'
  })
  onProgress?.(100, total || blob.size)
}
