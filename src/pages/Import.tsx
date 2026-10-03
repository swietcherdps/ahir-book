import { Link, useNavigate } from 'react-router-dom'
import { useState, useRef } from 'react'
import { importBook } from '../lib/fileProcessor'

export default function Import() {
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Title Modal State
  const [showTitleModal, setShowTitleModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [customTitle, setCustomTitle] = useState('')

  const handleFileSelect = (file: File) => {
    setError(null)
    setWarning(null)

    // Pre-fill title from filename (remove extension)
    const title = file.name.replace(/\.[^/.]+$/, "")
    setCustomTitle(title)
    setSelectedFile(file)
    setShowTitleModal(true)
  }

  const handleImportConfirm = async () => {
    if (!selectedFile) return

    setShowTitleModal(false)
    setUploading(true)

    try {
      await importBook(selectedFile, customTitle)
      navigate('/library')
    } catch (err: unknown) {
      const error = err as Error
      setError(error.message || 'Dosya yüklenirken bir hata oluştu')
      setUploading(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-background dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/library" className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-primary">Kitap İçe Aktar</h1>
          <div className="w-8" />
        </header>

        <div
          className={`border-4 border-dashed rounded-lg p-12 text-center transition cursor-pointer ${dragActive ? 'border-accent bg-blue-50' : 'border-gray-300 hover:border-accent'
            }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={handleButtonClick}
        >
          {uploading ? (
            <>
              <div className="w-16 h-16 mx-auto mb-4 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-lg text-gray-600">Yükleniyor...</p>
            </>
          ) : (
            <>
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-lg text-gray-600 mb-2">PDF veya EPUB dosyalarını sürükleyin</p>
              <p className="text-sm text-gray-500 mb-4">ya da</p>
              <button className="bg-accent text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition">
                Dosya Seç
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.epub"
            onChange={handleChange}
            className="hidden"
          />
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {warning && (
          <div className="mt-4 p-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-lg">
            {warning}
          </div>
        )}

        <div className="mt-8">
          <p className="text-sm text-gray-500">Desteklenen formatlar: PDF, EPUB</p>
          <p className="text-sm text-gray-500 mt-2">Maksimum dosya boyutu: 200MB</p>
        </div>

        {/* Title Input Modal */}
        {showTitleModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Kitap Başlığı</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Kütüphanede ve bildirimlerde görünecek ismi düzenleyebilirsiniz.
              </p>

              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg mb-6 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-accent outline-none"
                placeholder="Kitap Adı"
                autoFocus
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowTitleModal(false)
                    setSelectedFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  İptal
                </button>
                <button
                  onClick={handleImportConfirm}
                  disabled={!customTitle.trim()}
                  className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  İçe Aktar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
