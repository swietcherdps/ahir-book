import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getBooks, deleteBook, updateBook, addBook, offloadBook, db, type Book } from '../lib/db'
import { Capacitor } from '@capacitor/core'
import {
  fetchRisaleCatalog,
  RISALE_SERIES,
  RISALE_OSMANLICA_SERIES
} from '../lib/risaleContent'
import SeriesCard from '../components/SeriesCard'
import Notes from './Notes'
import { syncDiniBooks } from '../lib/diniContent'
import { showToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import BookCover from '../components/BookCover'
import { normalizeRemoteUrl } from '../lib/bookCover'
import { downloadBook } from '../lib/downloadBook'

interface SeriesDefinition {
  id: string
  title: string
  folder: string
  cover: string
  parent: string | null
  hasChildren?: boolean
  dynamicCover?: boolean
}

// Define Series Metadata (with nested structure)
const SERIES: SeriesDefinition[] = [
  {
    id: 'risale-osmanlica',
    title: RISALE_OSMANLICA_SERIES,
    folder: '',
    cover: '',
    parent: null,
    dynamicCover: true
  },
  {
    id: 'risale-online',
    title: RISALE_SERIES,
    folder: '',
    cover: '',
    parent: null,
    dynamicCover: true
  }
]

// Define Cloud Books with Series
const CLOUD_BOOKS = [
  // Existing books (no series)
  {
    title: 'İhya-u Ulumiddin',
    author: 'İmam Gazali',
    filename: 'İhya-u Ulumiddin.pdf',
    cover: 'ihya.webp', // Updated to user provided webp
    format: 'pdf' as const,
    series: undefined
  },
  {
    title: 'Kuran Yolu Meali',
    author: 'Diyanet İşleri Başkanlığı',
    filename: 'kuran.epub',
    cover: "kuran.jpg", // Converted to safe ASCII name
    format: 'epub' as const,
    series: undefined
  },
]

const isLegacyLatinBook = (book: Book) => book.isCloud && (
  book.series === "PDF'ler" ||
  book.series?.startsWith("Epub'lar") ||
  book.series === 'Eski Latin koleksiyon'
)

const isLegacyOttomanBook = (book: Book) => book.isCloud &&
  !book.sourceKey && book.series === 'Risale-i Nur Osmanlıca'

const normalizedBookTitle = (title: string) => title
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('tr-TR')
  .replace(/[^a-z0-9çğıöşü]+/g, ' ')
  .trim()

export default function Library() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)
  const [showHidden, setShowHidden] = useState(false)

  const encodeUrlPath = normalizeRemoteUrl

  useEffect(() => {
    // Check initial setup
    // ...
    // Using v1 logic, just ensure we run initialize
  }, [])
  const [downloadingIds, setDownloadingIds] = useState<number[]>([])
  const [downloadProgress, setDownloadProgress] = useState<Record<number, { percent: number, totalMB: string }>>({})
  const [activeSeries, setActiveSeries] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'books' | 'notes'>('books')
  const location = useLocation()
  const [searchParams] = useSearchParams()

  // Confirm Dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'danger' | 'warning' | 'info'
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', type: 'warning', onConfirm: () => { } })

  // Read tab from URL params
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'notes') {
      setActiveTab('notes')
    }
  }, [searchParams])

  // Handle navigation state (for back navigation from Reader)
  useEffect(() => {
    const state = location.state as { activeSeries?: string } | null
    if (state?.activeSeries) {
      setActiveSeries(state.activeSeries)
    }
  }, [location.state])

  useEffect(() => {
    initializeLibrary()
  }, [location, showHidden])


  const initializeLibrary = async () => {
    try {
      setLoading(true)

      await syncDiniBooks()

      // 1. Sync Cloud Books to DB (as placeholders)
      await db.transaction('rw', db.books, async () => {
      const existingBooks = await getBooks()

      const REMOTE_URL = 'https://swietcherdps.github.io/ahir-book/'
      const isNative = Capacitor.isNativePlatform()
      // For Cloud Books: ALWAYS use Remote URL on native, otherwise use local base
      const cloudBaseUrl = isNative ? REMOTE_URL : (import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`)

      for (const cloudBook of CLOUD_BOOKS) {
        // Find by title and series to distinguish between same-named books in different series
        const candidates = existingBooks.filter(b => b.title === cloudBook.title && b.isCloud && b.series === cloudBook.series)
        const existingBook = candidates.find(b => b.isDownloaded) || candidates[0]
        // Keep duplicate ids readable for old links, while showing a single card.
        for (const duplicate of candidates) {
          if (duplicate.id !== existingBook?.id && !duplicate.isDownloaded) await updateBook(duplicate.id!, { isHidden: true })
        }

        // Construct paths
        let fileUrl = ''
        let coverUrl = ''

        if (cloudBook.title === 'İhya-u Ulumiddin') {
          fileUrl = `${REMOTE_URL}books/İhya-u Ulumiddin.pdf`
          if ('cover' in cloudBook) {
            coverUrl = `${REMOTE_URL}books/${cloudBook.cover}`
          }
        } else if (cloudBook.title === 'Kuran Yolu Meali') { // Added check for Kuran Meali
          fileUrl = `${REMOTE_URL}books/kuran.epub`
          if ('cover' in cloudBook) {
            coverUrl = `${REMOTE_URL}books/${cloudBook.cover}`
          }
        } else if (cloudBook.series && 'folder' in cloudBook) {
          // It's in a subfolder - use the folder path directly from cloudBook
          const folder = cloudBook.folder

          // FIX: Treat Risale-i Nur as CLOUD content (Remote), not bundled.
          // We deleted the local folder, so we must point to GitHub Pages.
          const isBundled = false;

          // If bundled, use local root ('/'), otherwise use cloud base (Remote on Native, Local on Web)
          // For local web dev (not native), cloudBaseUrl acts as local base anyway.
          // But specifically for Native, we want '/' instead of 'https://...' for bundled files.
          const baseUrl = isBundled ? '/' : cloudBaseUrl

          fileUrl = `${baseUrl}books/${folder}/${cloudBook.filename}`
          if ('cover' in cloudBook) {
            coverUrl = `${baseUrl}books/${folder}/${cloudBook.cover}`
          }
        } else if (cloudBook.series) {
          // Fallback to SERIES lookup for backward compatibility
          const folder = SERIES.find(s => s.title === cloudBook.series)?.folder
          fileUrl = `${cloudBaseUrl}books/${folder}/${cloudBook.filename}`
          if ('cover' in cloudBook) {
            coverUrl = `${cloudBaseUrl}books/${folder}/${cloudBook.cover}`
          }
        } else {
          // Root level (Legacy/Remote)
          fileUrl = `${cloudBaseUrl}books/${cloudBook.filename}`
          if ('cover' in cloudBook) {
            coverUrl = `${cloudBaseUrl}books/${cloudBook.cover}`
          }
        }

        // Normalize and Encode URL components
        // We normalize to NFC to ensure consistent representation of characters like 'ğ', 'ş', 'İ'
        fileUrl = normalizeRemoteUrl(fileUrl)
        if (coverUrl) {
          coverUrl = normalizeRemoteUrl(coverUrl)
        }

        if (!existingBook) {
          // Add as placeholder
          await addBook({
            title: cloudBook.title,
            author: cloudBook.author,
            coverBlob: null, // Will load from URL (coverUrl) if needed or download later
            fileBlob: null,
            format: cloudBook.format,
            createdAt: new Date(),
            isCloud: true,
            isDownloaded: false,
            isHidden: false,
            cloudUrl: fileUrl,
            coverUrl: coverUrl, // Save the calculated cover URL
            series: cloudBook.series,
          })
        } else {
          // Update URL if needed (fix for previous incorrect URLs)
          if (existingBook.cloudUrl !== fileUrl || existingBook.series !== cloudBook.series || existingBook.coverUrl !== coverUrl) {
            await updateBook(existingBook.id!, {
              cloudUrl: fileUrl,
              coverUrl: coverUrl, // Ensure coverUrl is updated
              series: cloudBook.series
            })
          }
        }
      }

      })

      // Sync the lightweight Risale Online catalog. A failed network request falls
      // back to the last successful catalog and never downloads book content.
      try {
        const { catalog } = await fetchRisaleCatalog()
        const currentBooks = await getBooks()
        const migratedLegacyIds = new Set<number>()

        for (const catalogBook of catalog.books) {
          const existingBook = currentBooks.find(book => book.sourceKey === catalogBook.sourceKey)
          const isOttoman = catalogBook.writingType === 'osmanlica'
          const matchingLegacyBook = existingBook ? undefined : currentBooks.find(book =>
            book.id && !migratedLegacyIds.has(book.id) &&
            (isOttoman ? isLegacyOttomanBook(book) : isLegacyLatinBook(book)) &&
            normalizedBookTitle(book.title) === normalizedBookTitle(catalogBook.title)
          )
          const metadata: Partial<Book> = {
            title: catalogBook.title,
            author: catalogBook.author,
            format: 'risale-json',
            isCloud: true,
            cloudUrl: catalogBook.packageUrl,
            coverUrl: catalogBook.coverUrl,
            series: isOttoman ? RISALE_OSMANLICA_SERIES : RISALE_SERIES,
            viewMode: 'text',
            sourceKey: catalogBook.sourceKey,
            sourceUrl: catalogBook.sourceUrl,
            contentVersion: catalogBook.version,
            contentHash: catalogBook.sha256,
            downloadSize: catalogBook.downloadSize,
            pageCount: catalogBook.pageCount,
            sourceLanguage: isOttoman ? 'osmanlica' : 'latince'
          }

          if (!existingBook && !matchingLegacyBook) {
            await addBook({
              ...(metadata as Omit<Book, 'id' | 'createdAt' | 'coverBlob' | 'fileBlob'>),
              coverBlob: null,
              fileBlob: null,
              createdAt: new Date(),
              isDownloaded: false,
              isHidden: false
            })
          } else if (existingBook) {
            await updateBook(existingBook.id!, {
              ...metadata,
              format: existingBook.isDownloaded ? existingBook.format : metadata.format,
              coverBlob: null,
              isDownloaded: existingBook.isDownloaded
            })
          } else if (matchingLegacyBook?.id) {
            // Preserve the record and installed pages used by bookmarks/notifications.
            await updateBook(matchingLegacyBook.id, {
              ...metadata,
              format: matchingLegacyBook.isDownloaded ? matchingLegacyBook.format : metadata.format,
              coverBlob: null,
              isDownloaded: matchingLegacyBook.isDownloaded,
              isHidden: matchingLegacyBook.isHidden
            })
            migratedLegacyIds.add(matchingLegacyBook.id)
          }
        }

        // Retain old identities: scheduled notifications and bookmarks still use them.
        // Hide only superseded placeholders. Downloaded content remains readable.
        const afterSync = await getBooks()
        for (const book of afterSync) {
          if (book.id && (isLegacyLatinBook(book) || isLegacyOttomanBook(book)) && !book.isDownloaded) {
            await updateBook(book.id, { isHidden: true })
          }
        }
      } catch (catalogError) {
        console.warn('Risale kataloğu yüklenemedi:', catalogError)
      }

      // 2. Cleanup Orphans (Fix for duplicates)
      // DISABLED TEMPORARILY due to bug causing empty library
      /*
      const updatedBooks = await getBooks()

      for (const book of updatedBooks) {
        if (book.isCloud) {
          const stillExists = CLOUD_BOOKS.some(cb =>
            cb.title === book.title &&
            cb.series === book.series
          )

          if (!stillExists) {
            console.log('Removing orphan book:', book.title, book.series)
            if (book.id) await deleteBook(book.id)
          }
        }
      }
      */

      // 3. Fetch final list
      const allBooks = await getBooks()

      // 3. Filter hidden
      const filtered = showHidden
        ? allBooks
        : allBooks.filter(b => !b.isHidden)

      setBooks(filtered)

    } catch (error) {
      console.error('Error initializing library:', error)
    } finally {
      setLoading(false)
    }
  }

  const performDownload = async (book: Book) => {
    if (!book.cloudUrl || !book.id) return

    try {
      setDownloadingIds(prev => [...prev, book.id!])

      await downloadBook(book, (percent, total) => {
        setDownloadProgress(prev => ({ ...prev, [book.id!]: {
          percent, totalMB: (total / (1024 * 1024)).toFixed(1)
        } }))
      })
      await initializeLibrary()
    } catch (error: any) {
      console.error('Download error:', error)
      showToast(`Kitap indirilemedi: ${error.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setDownloadingIds(prev => prev.filter(id => id !== book.id))
      setDownloadProgress(prev => {
        const next = { ...prev }
        delete next[book.id!]
        return next
      })
    }
  }

  const handleDownloadClick = async (book: Book) => {
    // Automatically determine view mode
    // PDF -> 'pdf' (Original)
    // EPUB -> 'text'
    await performDownload(book)
  }

  const handleOffload = async (book: Book) => {
    if (!book.id) return
    setConfirmDialog({
      isOpen: true,
      title: 'Kitabı Cihazdan Sil',
      message: `"${book.title}" cihazdan silinsin mi? Bulut kütüphanede kalmaya devam edecek.`,
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        await offloadBook(book.id!)
        await initializeLibrary()
        showToast('Kitap cihazdan silindi', 'success')
      }
    })
  }

  const handleDelete = async (book: Book) => {
    if (!book.id) return
    setConfirmDialog({
      isOpen: true,
      title: 'Kitabı Tamamen Sil',
      message: `"${book.title}" tamamen silinsin mi? Bu işlem geri alınamaz.`,
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        await deleteBook(book.id!)
        await initializeLibrary()
        showToast('Kitap silindi', 'success')
      }
    })
  }

  const toggleHidden = async (book: Book) => {
    if (!book.id) return
    await updateBook(book.id, { isHidden: !book.isHidden })
    await initializeLibrary()
  }

  const handleDownloadSeries = async (seriesTitle: string) => {
    const seriesBooks = books.filter(b => b.series === seriesTitle && !b.isDownloaded)
    if (seriesBooks.length === 0) return

    setConfirmDialog({
      isOpen: true,
      title: 'Seriyi İndir',
      message: `${seriesBooks.length} kitap indirilecek. Devam edilsin mi?`,
      type: 'info',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        for (const book of seriesBooks) {
          if (book.isCloud && !book.isDownloaded) {
            await performDownload(book)
          }
        }
      }
    })
  }

  // Filter books based on active view
  // Check if current active series is a parent folder with children
  const activeSeriesData = SERIES.find(s => s.title === activeSeries)
  const isParentFolder = activeSeriesData?.hasChildren

  // Get child series of current active series
  const childSeries = activeSeries
    ? SERIES.filter(s => s.parent === activeSeriesData?.id)
    : []

  const displayedItems = activeSeries
    ? isParentFolder
      ? [] // Don't show books directly, show subfolders instead
      : books.filter(b => b.series === activeSeries)
    : books.filter(b => !b.series) // Show non-series books at root

  // Get series to display
  const displayedSeries = !activeSeries
    // At root: show only top-level series (parent === null)
    ? SERIES.filter(s => s.parent === null).map(s => {
      // For parent folders, count books in all children
      if (s.hasChildren) {
        const childIds = SERIES.filter(cs => cs.parent === s.id).map(cs => cs.title)
        const count = books.filter(b => childIds.includes(b.series || '')).length
        return { ...s, count }
      }
      return {
        ...s,
        count: books.filter(b => b.series === s.title).length
      }
    }).filter(s => s.count > 0 || showHidden)
    // Inside a parent folder: show children
    : isParentFolder
      ? childSeries.map(s => ({
        ...s,
        count: books.filter(b => b.series === s.title).length
      })).filter(s => s.count > 0 || showHidden)
      : []

  if (loading) {
    return (
      <div className="min-h-screen bg-background dark:bg-black flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-background dark:bg-black p-4 pb-24">
        <div className="max-w-6xl mx-auto">
          {/* Tab Switcher */}
          <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('books')}
              className={`px-6 py-3 font-semibold transition-colors border-b-2 ${activeTab === 'books'
                ? 'border-accent dark:border-[#B6C950] text-accent dark:text-[#B6C950]'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
            >
              📚 Kitaplarım
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`px-6 py-3 font-semibold transition-colors border-b-2 ${activeTab === 'notes'
                ? 'border-accent dark:border-[#B6C950] text-accent dark:text-[#B6C950]'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
            >
              📝 Notlarım
            </button>
          </div>

          {activeTab === 'notes' ? (
            <Notes />
          ) : (
            <>
              <header className="mb-8">
                {/* Custom Layout for Risale-i Nur Series */}
                {/* Custom Layout for Risale-i Nur Series and Sub-Series */}
                {(activeSeries === RISALE_OSMANLICA_SERIES || activeSeries === RISALE_SERIES) ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setActiveSeries(null)}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
                      >
                        <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                      </button>
                      <h1 className="text-3xl font-normal text-primary dark:text-white">
                        {activeSeries}
                      </h1>
                    </div>

                    <div className="flex gap-3 pl-2">
                      <button
                        onClick={() => handleDownloadSeries(activeSeries!)}
                        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-green-700 transition text-sm flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Tümünü İndir
                      </button>
                      <Link to="/import" className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-gray-600 transition flex items-center gap-2 text-sm dark:bg-gray-700 dark:hover:bg-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-white">Kitap Ekle</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  /* Standard Header */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {activeSeries && (
                        <button
                          onClick={() => setActiveSeries(null)}
                          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
                        >
                          <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                          </svg>
                        </button>
                      )}
                      <h1 className="text-3xl font-bold text-primary dark:text-white">
                        {activeSeries || 'Kütüphanem'}
                      </h1>
                    </div>

                    <div className="flex gap-3">
                      {activeSeries && (
                        <button
                          onClick={() => handleDownloadSeries(activeSeries)}
                          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition text-sm flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Tümünü İndir
                        </button>
                      )}
                      <Link to="/import" className="px-4 py-2 bg-secondary text-white rounded-lg hover:bg-gray-600 transition">
                        Kitap Ekle
                      </Link>
                    </div>
                  </div>
                )}
              </header>

              {/* Series Folders (at root OR inside parent folder) */}
              {displayedSeries.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                  {displayedSeries.map(series => {
                    // Construct cover URL for series card
                    // Construct cover URL for series card
                    // FIX: All Series folders (except maybe if we add bundled ones later) should use remote URL on Native
                    // because we deleted the local files to save space.

                    const remoteUrl = 'https://swietcherdps.github.io/ahir-book/'
                    const localWebUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`

                    const baseUrl = Capacitor.isNativePlatform()
                      ? remoteUrl // ALWAYS use remote for Series covers on Native (since we deleted local assets)
                      : localWebUrl

                    let coverUrl = series.dynamicCover
                      ? books.find(book => book.series === series.title)?.coverUrl
                      : series.cover
                        ? `${baseUrl}books/${series.folder}/${series.cover}`
                        : undefined

                    if (coverUrl) {
                      coverUrl = encodeUrlPath(coverUrl)
                    }

                    return (
                      <SeriesCard
                        key={series.id}
                        title={series.title}
                        count={series.count}
                        coverUrl={coverUrl}
                        coverBook={books.find(book => book.series === series.title)}
                        onClick={() => setActiveSeries(series.title)}
                      />
                    )
                  })}
                </div>
              )}

              {/* Books Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {displayedItems.map((book) => {
                  const isCloudNotDownloaded = book.isCloud && !book.isDownloaded

                  return (
                    <div
                      key={book.id}
                      className={`bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-xl transition relative group ${book.isHidden ? 'opacity-50 grayscale' : ''}`}
                    >
                      {/* Hide/Show Button */}
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          toggleHidden(book)
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition z-10"
                        title={book.isHidden ? "Göster" : "Gizle"}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {book.isHidden ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          )}
                        </svg>
                      </button>

                      {isCloudNotDownloaded ? (
                        // Cloud Book View
                        <div className="aspect-[2/3] relative bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <BookCover book={book} />

                          <div className="absolute inset-0 flex items-center justify-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDownloadClick(book)
                              }}
                              disabled={downloadingIds.includes(book.id!)}
                              className="transition-transform active:scale-95"
                              title="İndir"
                            >
                              {downloadingIds.includes(book.id!) ? (
                                <div className="flex flex-col items-center">
                                  <div className="w-8 h-8 border-4 border-[#B6C950] border-t-transparent rounded-full animate-spin mb-1" />
                                  {downloadProgress[book.id!] && (
                                    <div className="text-xs font-bold text-white drop-shadow-md bg-black/50 px-1 rounded">
                                      %{downloadProgress[book.id!].percent}
                                      <br />
                                      {downloadProgress[book.id!].totalMB} MB
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="p-3 bg-black/40 rounded-full hover:bg-black/60 transition backdrop-blur-sm">
                                  <svg className="w-8 h-8 text-[#B6C950]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </div>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Downloaded Book View
                        <Link to={`/reader/${book.id}/1`}>
                          <div className="aspect-[2/3] relative bg-gray-100 dark:bg-gray-700">
                            <BookCover book={book} />

                            {/* Progress Bar */}
                            {book.lastReadPage && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                                <div
                                  className="h-full bg-accent"
                                  style={{ width: '10%' }} // TODO: Calculate actual percentage
                                />
                              </div>
                            )}
                          </div>
                        </Link>
                      )}

                      <div className="p-3">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">{book.title}</h3>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {book.author}
                            {isCloudNotDownloaded && book.downloadSize
                              ? ` · ${(book.downloadSize / (1024 * 1024)).toFixed(1)} MB`
                              : ''}
                          </span>
                          {!isCloudNotDownloaded && (
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                book.isCloud ? handleOffload(book) : handleDelete(book)
                              }}
                              className="text-red-500 hover:text-red-700 p-1"
                              title={book.isCloud ? "Cihazdan Sil (Bulutta Kalır)" : "Tamamen Sil"}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Empty State */}
              {displayedItems.length === 0 && displayedSeries.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400">Henüz kitap yok.</p>
                </div>
              )}

              {/* Show Hidden Toggle */}
              <div className="mt-8 text-center">
                <button
                  onClick={() => setShowHidden(!showHidden)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                >
                  {showHidden ? 'Gizlenenleri Gizle' : 'Gizlenenleri Göster'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </>
  )
}
