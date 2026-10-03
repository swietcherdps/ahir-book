import { useEffect, useState } from 'react'
import type { Book } from '../lib/db'
import { coverEdition, curatedCover, fallbackCover } from '../lib/bookCover'

export default function BookCover({ book, className = '' }: { book: Pick<Book, 'title' | 'author' | 'coverBlob' | 'coverUrl' | 'sourceKey' | 'isCloud'>; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string>()
  const [failedSource, setFailedSource] = useState<string>()
  useEffect(() => {
    if (!book.coverBlob) { setBlobUrl(undefined); return }
    const url = URL.createObjectURL(book.coverBlob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [book.coverBlob])
  const preferred = curatedCover(book) || blobUrl || book.coverUrl
  const src = preferred && failedSource !== preferred ? preferred : fallbackCover(book.title, book.author)
  const edition = coverEdition(book)
  return <div className={`relative w-full h-full ${className}`}>
    <img src={src} alt={`${book.title} kapağı`} className="w-full h-full object-contain" onError={() => setFailedSource(preferred)} />
    {edition && <span className="absolute top-[5%] left-1/2 -translate-x-1/2 bg-[#083f47] border border-[#cead65] text-[#f8e5ba] px-3 py-1 rounded text-sm font-semibold whitespace-nowrap">{edition}</span>}
  </div>
}
