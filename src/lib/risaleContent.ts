import DOMPurify from 'dompurify'
import { ungzip } from 'pako'
import { replaceBookContent, type Book, type BookSection } from './db'

export const RISALE_SERIES = 'Risale-i Nur (Latin)'
export const RISALE_OSMANLICA_SERIES = 'Risale-i Nur (Osmanlıca)'
export const RISALE_CATALOG_CACHE_KEY = 'ahirbook:risale-catalog:v1'
export const DEFAULT_RISALE_CATALOG_URL =
  import.meta.env.VITE_CONTENT_CATALOG_URL ||
  'https://swietcherdps.github.io/ahir-book-content/catalog.json'

export interface RisaleCatalogBook {
  sourceKey: string
  sourceId: number
  slug: string
  title: string
  author: string
  pageCount: number
  version: string
  downloadSize: number
  sha256: string
  packageUrl: string
  coverUrl?: string
  sourceUrl: string
  writingType?: 'latince' | 'osmanlica'
}

export interface RisaleCatalog {
  schemaVersion: 1
  generatedAt: string
  source: string
  books: RisaleCatalogBook[]
}

interface RisalePackagePage {
  pageNumber: number
  html: string
  plainText: string
  sourceParagraphIds: number[]
}

export interface RisalePackage {
  schemaVersion: 1
  source: {
    name: string
    url: string
    publisher: string
  }
  book: {
    sourceKey: string
    sourceId: number
    slug: string
    title: string
    author: string
    pageCount: number
    version: string
    writingType?: 'latince' | 'osmanlica'
  }
  toc: unknown[]
  pages: RisalePackagePage[]
}

const ALLOWED_TAGS = [
  'div', 'p', 'span', 'strong', 'em', 'b', 'i', 'sup', 'sub', 'br', 'blockquote', 'section', 'aside'
]

const ALLOWED_ATTR = [
  'class', 'dir', 'lang', 'role', 'tabindex',
  'data-paragraf-id', 'data-eser-id', 'data-sayfa', 'data-sira',
  'data-kelime-tur', 'data-hasiye-no', 'data-lugat-id',
  'data-lugat-latince-kelime', 'data-lugat-latince-mana',
  'data-lugat-osmanlica-kelime', 'data-lugat-osmanlica-mana',
  'data-mehaz-id', 'data-mehaz-metin', 'data-mehaz-latince-meal',
  'data-mehaz-latince-kaynak', 'data-mehaz-osmanlica-meal',
  'data-mehaz-osmanlica-kaynak', 'data-mehaz-harekesiz',
  'data-latince', 'data-latince-ust-bilgi'
]

export const sanitizeRisaleHtml = (html: string): string => {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style']
  })
  const template = document.createElement('template')
  template.innerHTML = clean
  template.content.querySelectorAll<HTMLElement>(
    '[data-lugat-id], [data-lugat-latince-mana], [data-lugat-osmanlica-mana], [data-mehaz-id], [data-latince], [data-latince-ust-bilgi]'
  ).forEach(element => {
    element.tabIndex = 0
    element.setAttribute('role', 'button')
    element.setAttribute('aria-label', `${element.textContent?.trim() || 'Kelime'} açıklamasını göster`)
  })
  return template.innerHTML
}

const resolveCatalogUrls = (catalog: RisaleCatalog, catalogUrl: string): RisaleCatalog => ({
  ...catalog,
  books: catalog.books.map(book => ({
    ...book,
    packageUrl: new URL(book.packageUrl, catalogUrl).toString(),
    coverUrl: book.coverUrl ? new URL(book.coverUrl, catalogUrl).toString() : undefined
  }))
})

export const validateCatalog = (value: unknown): RisaleCatalog => {
  const catalog = value as Partial<RisaleCatalog>
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.books)) {
    throw new Error('Desteklenmeyen içerik kataloğu')
  }

  const sourceKeys = new Set<string>()
  for (const book of catalog.books) {
    if (
      !book.sourceKey || !book.title || !book.packageUrl ||
      !/^[a-f0-9]{64}$/i.test(book.sha256) ||
      !Number.isInteger(book.pageCount) || book.pageCount < 1 ||
      !Number.isInteger(book.downloadSize) || book.downloadSize < 1
    ) {
      throw new Error('Katalogda eksik kitap bilgisi var')
    }
    if (sourceKeys.has(book.sourceKey)) throw new Error('Katalogda mükerrer kitap var')
    sourceKeys.add(book.sourceKey)
  }
  return catalog as RisaleCatalog
}

export const fetchRisaleCatalog = async (
  catalogUrl = DEFAULT_RISALE_CATALOG_URL
): Promise<{ catalog: RisaleCatalog; fromCache: boolean }> => {
  try {
    const response = await fetch(catalogUrl, { cache: 'no-cache', mode: 'cors' })
    if (!response.ok) throw new Error(`Katalog indirilemedi (${response.status})`)
    const catalog = resolveCatalogUrls(validateCatalog(await response.json()), catalogUrl)
    localStorage.setItem(RISALE_CATALOG_CACHE_KEY, JSON.stringify(catalog))
    return { catalog, fromCache: false }
  } catch (error) {
    const cached = localStorage.getItem(RISALE_CATALOG_CACHE_KEY)
    if (!cached) throw error
    return { catalog: validateCatalog(JSON.parse(cached)), fromCache: true }
  }
}

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const exactBuffer = new Uint8Array(bytes).buffer
  const digest = await crypto.subtle.digest('SHA-256', exactBuffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const readResponse = async (
  response: Response,
  onProgress?: (percent: number, totalBytes: number) => void
): Promise<Uint8Array> => {
  const total = Number(response.headers.get('content-length') || 0)
  if (!response.body) return new Uint8Array(await response.arrayBuffer())

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.(total ? Math.round((loaded / total) * 100) : 0, total)
  }

  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export const validateRisalePackage = (value: unknown, book: Book): RisalePackage => {
  const pkg = value as Partial<RisalePackage>
  if (pkg.schemaVersion !== 1 || !pkg.book || !Array.isArray(pkg.pages)) {
    throw new Error('Desteklenmeyen kitap paketi')
  }
  if (pkg.book.sourceKey !== book.sourceKey || pkg.book.version !== book.contentVersion) {
    throw new Error('Kitap paketi katalogla eşleşmiyor')
  }
  if (book.sourceLanguage && pkg.book.writingType !== book.sourceLanguage) {
    throw new Error('Kitap yazı türü katalogla eşleşmiyor')
  }
  if (pkg.pages.length !== pkg.book.pageCount || pkg.book.pageCount !== book.pageCount) {
    throw new Error('Kitap paketinde eksik sayfa var')
  }

  const pageNumbers = new Set<number>()
  for (const page of pkg.pages) {
    if (
      !Number.isInteger(page.pageNumber) || page.pageNumber < 1 ||
      page.pageNumber > pkg.book.pageCount || pageNumbers.has(page.pageNumber)
    ) {
      throw new Error('Kitap paketinde geçersiz veya tekrarlı sayfa var')
    }
    if (typeof page.html !== 'string' || typeof page.plainText !== 'string') {
      throw new Error('Kitap paketinde geçersiz sayfa içeriği var')
    }
    pageNumbers.add(page.pageNumber)
  }
  for (let pageNumber = 1; pageNumber <= pkg.book.pageCount; pageNumber += 1) {
    if (!pageNumbers.has(pageNumber)) throw new Error('Kitap paketinde eksik sayfa var')
  }
  return pkg as RisalePackage
}

const loadRisalePackage = async (
  book: Book,
  onProgress?: (percent: number, totalBytes: number) => void
) => {
  if (!book.id || !book.cloudUrl || !book.contentHash) {
    throw new Error('Kitabın indirme bilgileri eksik')
  }

  const response = await fetch(book.cloudUrl, { mode: 'cors', cache: 'no-cache' })
  if (!response.ok) throw new Error(`Kitap indirilemedi (${response.status})`)
  const compressed = await readResponse(response, onProgress)
  const actualHash = await sha256Hex(compressed)
  if (actualHash !== book.contentHash.toLowerCase()) {
    throw new Error('Kitap dosyası doğrulanamadı')
  }

  let decoded: string
  try {
    decoded = new TextDecoder().decode(ungzip(compressed))
  } catch {
    throw new Error('Sıkıştırılmış kitap açılamadı')
  }

  const pkg = validateRisalePackage(JSON.parse(decoded), book)
  return { pkg, size: compressed.byteLength }
}

export const risaleSections = (pkg: RisalePackage): BookSection[] => (Array.isArray(pkg.toc) ? pkg.toc : []).flatMap(value => {
  if (!value || typeof value !== 'object') return []
  const item = value as { sayfa?: number; latince_baslik?: string; osmanlica_baslik?: string }
  const title = pkg.book.writingType === 'osmanlica' ? (item.osmanlica_baslik || item.latince_baslik) : item.latince_baslik
  if (!title || !Number.isInteger(item.sayfa) || item.sayfa! < 1 || item.sayfa! > pkg.book.pageCount) return []
  return [{ title, pageNumber: item.sayfa!, level: 0 }]
})

export const fetchInstalledRisaleSections = async (book: Book) => risaleSections((await loadRisalePackage(book)).pkg)

export const downloadAndInstallRisaleBook = async (
  book: Book,
  onProgress?: (percent: number, totalBytes: number) => void
) => {
  const { pkg, size } = await loadRisalePackage(book, onProgress)
  const pages = pkg.pages.map(page => ({
    pageNumber: page.pageNumber,
    html: sanitizeRisaleHtml(page.html),
    plainText: page.plainText,
    sourceParagraphIds: page.sourceParagraphIds
  }))

  await replaceBookContent(book.id!, pages, {
    fileBlob: null,
    isDownloaded: true,
    viewMode: 'text',
    pageCount: pkg.book.pageCount,
    toc: risaleSections(pkg)
  })
  onProgress?.(100, size)
}
