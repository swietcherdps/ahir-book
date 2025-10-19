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

  const handleFile = async (file: File) => {
    setError(null)
    setWarning(null)
    setUploading(true)

    try {
      await importBook(file)
      navigate('/library')
    } catch (err: any) {
      setError(err.message || 'Dosya yüklenirken bir hata oluştu')
    } finally {
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
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-background p-4">
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
          className={`border-4 border-dashed rounded-lg p-12 text-center transition cursor-pointer ${
            dragActive ? 'border-accent bg-blue-50' : 'border-gray-300 hover:border-accent'
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
      </div>
    </div>
  )
}
