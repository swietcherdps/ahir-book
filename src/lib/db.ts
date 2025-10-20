import Dexie, { type Table } from 'dexie'

// Database types
export interface Book {
  id?: number
  title: string
  author: string | null
  coverBlob: Blob | null
  fileBlob: Blob
  format: 'pdf' | 'epub'
  createdAt: Date
}

export interface Bookmark {
  id?: number
  bookId: number
  pageId: string
  createdAt: Date
}

export interface BookContent {
  id?: number
  bookId: number
  pageNumber: number
  contentText: string
  indexedAt: Date
}

// Dexie database
export class AhirBookDB extends Dexie {
  books!: Table<Book>
  bookmarks!: Table<Bookmark>
  bookContent!: Table<BookContent>

  constructor() {
    super('AhirBookDB')
    
    this.version(1).stores({
      books: '++id, title, author, format, createdAt',
      bookmarks: '++id, bookId, pageId, createdAt',
      bookContent: '++id, bookId, pageNumber, [bookId+pageNumber], indexedAt'
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
