import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { getBooks, deleteBook, type Book } from '../lib/db'

export default function Library() {
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBooks()
  }, [])

  const loadBooks = async () => {
    try {
      const allBooks = await getBooks()
      setBooks(allBooks)
    } catch (error) {
      console.error('Error loading books:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (window.confirm('Bu kitabı silmek istediğinizden emin misiniz?')) {
      try {
        await deleteBook(id)
        await loadBooks()
      } catch (error) {
        console.error('Error deleting book:', error)
        alert('Kitap silinirken hata oluştu')
      }
    }
  }

  const getCoverUrl = (coverBlob: Blob | null) => {
    if (!coverBlob) return null
    return URL.createObjectURL(coverBlob)
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
          <h1 className="text-2xl font-bold text-primary">Kütüphane</h1>
          <div className="w-8" />
        </header>

        <div className="mb-6">
          <Link
            to="/import"
            className="w-full bg-accent text-white py-3 rounded-lg hover:bg-blue-600 transition block text-center"
          >
            + Kitap Ekle
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : books.length === 0 ? (
          <div className="space-y-4">
            <p className="text-gray-500 text-center py-8">
              Henüz kitap eklenmemiş. Başlamak için "Kitap Ekle" butonuna tıklayın.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {books.map((book) => (
              <div key={book.id} className="bg-white rounded-lg shadow-md overflow-hidden group">
                <Link to={`/reader/${book.id}/1`} className="block">
                  {book.coverBlob ? (
                    <img
                      src={getCoverUrl(book.coverBlob)!}
                      alt={book.title}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                      <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                  )}
                </Link>
                <div className="p-3">
                  <Link to={`/reader/${book.id}/1`}>
                    <h3 className="font-semibold text-sm truncate hover:text-accent">{book.title}</h3>
                  </Link>
                  {book.author && (
                    <p className="text-xs text-gray-600 truncate">{book.author}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500 uppercase">{book.format}</span>
                    <button
                      onClick={() => handleDelete(book.id!)}
                      className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {books.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-500">
            Toplam {books.length} kitap
          </div>
        )}
      </div>
    </div>
  )
}
