import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getBookmarks, getBook, deleteBookmark, type Bookmark } from '../lib/db'

interface BookmarkWithDetails extends Bookmark {
  bookTitle: string
}

export default function Bookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBookmarks()
  }, [])

  const loadBookmarks = async () => {
    try {
      setLoading(true)
      const allBookmarks = await getBookmarks()
      
      // Add book titles to bookmarks
      const bookmarksWithDetails = await Promise.all(
        allBookmarks.map(async (bookmark) => {
          const book = await getBook(bookmark.bookId)
          return {
            ...bookmark,
            bookTitle: book?.title || 'Bilinmeyen Kitap'
          }
        })
      )
      
      // Sort by most recent first
      bookmarksWithDetails.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      
      setBookmarks(bookmarksWithDetails)
    } catch (error) {
      console.error('Error loading bookmarks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (bookmarkId: number) => {
    if (window.confirm('Bu işareti kaldırmak istediğinizden emin misiniz?')) {
      try {
        await deleteBookmark(bookmarkId)
        await loadBookmarks()
      } catch (error) {
        console.error('Error deleting bookmark:', error)
        alert('İşaret silinirken hata oluştu')
      }
    }
  }

  return (
    <div className="min-h-screen bg-background dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-primary">Yıldızlı Sayfalar</h1>
          <div className="w-8" />
        </header>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <p className="text-gray-500 mb-4">Henüz işaretlenmiş sayfa yok</p>
            <p className="text-sm text-gray-400">Kitap okurken yıldız simgesine tıklayarak sayfaları işaretleyebilirsiniz</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Toplam {bookmarks.length} işaretli sayfa
            </div>
            <div className="space-y-3">
              {bookmarks.map((bookmark) => (
                <div key={bookmark.id} className="bg-white p-4 rounded-lg shadow-md group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-primary mb-1">{bookmark.bookTitle}</h3>
                      <p className="text-sm text-gray-600">Sayfa {bookmark.pageId}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        İşaretlenme: {new Date(bookmark.createdAt).toLocaleDateString('tr-TR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(bookmark.id!)}
                      className="p-2 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition"
                      title="İşareti kaldır"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <Link
                    to={`/reader/${bookmark.bookId}/${bookmark.pageId}`}
                    className="inline-block px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition text-sm"
                  >
                    Sayfaya Git
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
