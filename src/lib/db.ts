import Dexie, { type Table } from 'dexie'

export interface BookSection {
  title: string
  pageNumber: number
  level: number
  anchor?: string
}

// Database types
export interface Book {
  id?: number
  title: string
  author: string | null
  coverBlob: Blob | null
  fileBlob: Blob | null // Can be null if not downloaded yet
  format: 'pdf' | 'epub' | 'risale-json'
  createdAt: Date
  lastReadPage?: number
  toc?: BookSection[]

  // Cloud features
  isCloud?: boolean
  isDownloaded?: boolean
  isHidden?: boolean
  cloudUrl?: string
  coverUrl?: string // URL for the cover image (when not downloaded)
  series?: string // Series name (e.g. "Risale-i Nur Osmanlıca")
  viewMode?: 'text' | 'pdf' // User preference for viewing this book
  sourceKey?: string // Stable remote identity, e.g. risale-online:17
  sourceUrl?: string
  contentVersion?: string
  contentHash?: string
  downloadSize?: number
  pageCount?: number
  sourceLanguage?: 'latince' | 'osmanlica'
}

export interface Bookmark {
  id?: number
  bookId: number
  pageId: string // page number
  createdAt: Date
}

export interface BookContent {
  id?: number
  bookId: number
  pageNumber: number
  contentText: string
  plainText?: string
  sourceParagraphIds?: number[]
}

export interface Note {
  id?: number
  content: string
  createdAt: Date
  updatedAt: Date
}

export interface NoteNotificationSettings {
  id?: number
  enabled: boolean
  frequency: number // minutes (1, 5, 15, 30, 60, 120, 240, 720, 1440, 10080)
  mode: 'sequential' | 'random'
  currentIndex: number
  repeatEnabled: boolean
  lastSentAt?: Date
}

// Dexie database
export class AhirBookDB extends Dexie {
  books!: Table<Book>
  bookmarks!: Table<Bookmark>
  bookContent!: Table<BookContent>
  notes!: Table<Note>
  noteNotificationSettings!: Table<NoteNotificationSettings>

  constructor() {
    super('AhirBookDB')

    // Version 1
    this.version(1).stores({
      books: '++id, title, author, format, createdAt, lastReadPage',
      bookmarks: '++id, bookId, pageId, createdAt',
      bookContent: '++id, bookId, [bookId+pageNumber]'
    })

    // Version 2: Add cloud fields
    this.version(2).stores({
      books: '++id, title, author, format, createdAt, lastReadPage, isCloud, isHidden'
    })

    // Version 3: Add series support
    this.version(3).stores({
      books: '++id, title, author, format, createdAt, lastReadPage, isCloud, isHidden, series'
    })

    // Version 4: Add personal notes and notification settings
    this.version(4).stores({
      notes: '++id, createdAt, updatedAt',
      noteNotificationSettings: '++id'
    })

    // Version 5: Remote, versioned content packages.
    this.version(5).stores({
      books: '++id, title, author, format, createdAt, lastReadPage, isCloud, isHidden, series, &sourceKey',
      bookmarks: '++id, bookId, pageId, createdAt',
      bookContent: '++id, bookId, [bookId+pageNumber]',
      notes: '++id, createdAt, updatedAt',
      noteNotificationSettings: '++id'
    })
  }
}

export const db = new AhirBookDB()

// CRUD Operations
export const addBook = async (bookData: Omit<Book, 'id'>) => {
  try {
    const id = await db.books.add(bookData)
    return id
  } catch (error) {
    console.error('Error adding book:', error)
    throw error
  }
}

export const getBooks = async () => {
  try {
    return await db.books.toArray()
  } catch (error) {
    console.error('Error fetching books:', error)
    throw error
  }
}

export const getBook = async (id: number) => {
  try {
    return await db.books.get(id)
  } catch (error) {
    console.error('Error fetching book:', error)
    throw error
  }
}

export const updateBook = async (id: number, data: Partial<Book>) => {
  try {
    await db.books.update(id, data)
  } catch (error) {
    console.error('Error updating book:', error)
    throw error
  }
}

export const deleteBook = async (id: number) => {
  try {
    // Delete book and related bookmarks/content
    await db.transaction('rw', [db.books, db.bookmarks, db.bookContent], async () => {
      await db.books.delete(id)
      await db.bookmarks.where('bookId').equals(id).delete()
      await db.bookContent.where('bookId').equals(id).delete()
    })
  } catch (error) {
    console.error('Error deleting book:', error)
    throw error
  }
}

export const addBookmark = async (bookId: number, pageId: string) => {
  try {
    const id = await db.bookmarks.add({
      bookId,
      pageId,
      createdAt: new Date()
    })
    return id
  } catch (error) {
    console.error('Error adding bookmark:', error)
    throw error
  }
}

export const getBookmarks = async () => {
  try {
    return await db.bookmarks.toArray()
  } catch (error) {
    console.error('Error fetching bookmarks:', error)
    throw error
  }
}

export const deleteBookmark = async (id: number) => {
  try {
    await db.bookmarks.delete(id)
  } catch (error) {
    console.error('Error deleting bookmark:', error)
    throw error
  }
}

export const indexBookContent = async (bookId: number, pages: Array<{ pageNumber: number; text: string }>) => {
  try {
    // Delete existing content for this book
    await db.bookContent.where('bookId').equals(bookId).delete()

    // Add new content
    const contentEntries = pages.map(page => ({
      bookId,
      pageNumber: page.pageNumber,
      contentText: page.text,
      indexedAt: new Date()
    }))

    await db.bookContent.bulkAdd(contentEntries)
  } catch (error) {
    console.error('Error indexing book content:', error)
    throw error
  }
}

export const replaceBookContent = async (
  bookId: number,
  pages: Array<{ pageNumber: number; html: string; plainText: string; sourceParagraphIds?: number[] }>,
  bookUpdates: Partial<Book> = {}
) => {
  await db.transaction('rw', [db.books, db.bookContent], async () => {
    await db.bookContent.where('bookId').equals(bookId).delete()
    await db.bookContent.bulkAdd(pages.map(page => ({
      bookId,
      pageNumber: page.pageNumber,
      contentText: page.html,
      plainText: page.plainText,
      sourceParagraphIds: page.sourceParagraphIds
    })))
    await db.books.update(bookId, bookUpdates)
  })
}

export const offloadBook = async (bookId: number) => {
  await db.transaction('rw', [db.books, db.bookContent], async () => {
    await db.bookContent.where('bookId').equals(bookId).delete()
    await db.books.update(bookId, { fileBlob: null, isDownloaded: false })
  })
}

// Storage quota check
export const checkStorageQuota = async () => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate()
    const usage = estimate.usage || 0
    const quota = estimate.quota || 0
    const percentUsed = (usage / quota) * 100

    return {
      usage,
      quota,
      percentUsed,
      available: quota - usage
    }
  }
  return null
}

// Note CRUD Operations
export const addNote = async (content: string) => {
  try {
    const now = new Date()
    const id = await db.notes.add({
      content,
      createdAt: now,
      updatedAt: now
    })
    return id
  } catch (error) {
    console.error('Error adding note:', error)
    throw error
  }
}

export const getNotes = async () => {
  try {
    return await db.notes.orderBy('createdAt').reverse().toArray()
  } catch (error) {
    console.error('Error fetching notes:', error)
    throw error
  }
}

export const getNote = async (id: number) => {
  try {
    return await db.notes.get(id)
  } catch (error) {
    console.error('Error fetching note:', error)
    throw error
  }
}

export const updateNote = async (id: number, content: string) => {
  try {
    await db.notes.update(id, {
      content,
      updatedAt: new Date()
    })
  } catch (error) {
    console.error('Error updating note:', error)
    throw error
  }
}

export const deleteNote = async (id: number) => {
  try {
    await db.notes.delete(id)
  } catch (error) {
    console.error('Error deleting note:', error)
    throw error
  }
}

// Note Notification Settings
export const getNoteNotificationSettings = async (): Promise<NoteNotificationSettings> => {
  try {
    const settings = await db.noteNotificationSettings.get(1)
    if (!settings) {
      // Initialize default settings
      const defaultSettings: NoteNotificationSettings = {
        id: 1,
        enabled: false,
        frequency: 240, // 4 hours default (in minutes)
        mode: 'sequential',
        currentIndex: 0,
        repeatEnabled: true
      }
      await db.noteNotificationSettings.put(defaultSettings)
      return defaultSettings
    }
    return settings
  } catch (error) {
    console.error('Error fetching note notification settings:', error)
    throw error
  }
}

export const updateNoteNotificationSettings = async (settings: Partial<NoteNotificationSettings>) => {
  try {
    await db.noteNotificationSettings.update(1, settings)
  } catch (error) {
    console.error('Error updating note notification settings:', error)
    throw error
  }
}
