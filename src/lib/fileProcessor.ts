import * as pdfjsLib from 'pdfjs-dist'
import ePub from 'epubjs'
import { addBook, indexBookContent, checkStorageQuota } from './db'

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export interface ProcessedBook {
  title: string
  author: string | null
  coverBlob: Blob | null
  fileBlob: Blob
  format: 'pdf' | 'epub'
  pages: Array<{ pageNumber: number; text: string }>
}

// Check file size and warn if too large
export const validateFileSize = async (file: File): Promise<{ valid: boolean; warning?: string }> => {
  const fileSizeMB = file.size / (1024 * 1024)
  const quota = await checkStorageQuota()
  
  if (fileSizeMB > 200) {
    return {
      valid: false,
      warning: `Dosya çok büyük (${fileSizeMB.toFixed(2)}MB). Maksimum 200MB destekleniyor.`
    }
  }
  
  if (fileSizeMB > 50) {
    return {
      valid: true,
      warning: `Uyarı: Dosya boyutu ${fileSizeMB.toFixed(2)}MB. Sıkıştırma önerilir.`
    }
  }
  
  if (quota && quota.percentUsed > 80) {
    return {
      valid: true,
      warning: `Depolama alanınızın %${quota.percentUsed.toFixed(0)}'i dolu. Yer açmayı düşünün.`
    }
  }
  
  return { valid: true }
}

// Process PDF file
export const processPDF = async (file: File): Promise<ProcessedBook> => {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    
    // Extract metadata
    const metadata = await pdf.getMetadata()
    const title = metadata.info?.Title || file.name.replace('.pdf', '')
    const author = metadata.info?.Author || null
    
    // Extract text from all pages
    const pages: Array<{ pageNumber: number; text: string }> = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ')
      
      pages.push({
        pageNumber: i,
        text
      })
    }
    
    // Try to extract cover (first page as thumbnail)
    let coverBlob: Blob | null = null
    try {
      const firstPage = await pdf.getPage(1)
      const viewport = firstPage.getViewport({ scale: 0.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const context = canvas.getContext('2d')!
      
      await firstPage.render({
        canvasContext: context,
        viewport: viewport
      }).promise
      
      coverBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8)
      })
    } catch (error) {
      console.warn('Could not extract PDF cover:', error)
    }
    
    return {
      title,
      author,
      coverBlob,
      fileBlob: file,
      format: 'pdf',
      pages
    }
  } catch (error) {
    console.error('PDF processing error:', error)
    throw new Error('PDF dosyası işlenirken hata oluştu')
  }
}

// Process EPUB file
export const processEPUB = async (file: File): Promise<ProcessedBook> => {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const book = ePub(arrayBuffer)
    
    await book.ready
    
    // Extract metadata
    const metadata = await book.loaded.metadata
    const title = metadata.title || file.name.replace('.epub', '')
    const author = metadata.creator || null
    
    // Try to extract cover
    let coverBlob: Blob | null = null
    try {
      const coverUrl = await book.coverUrl()
      if (coverUrl) {
        const response = await fetch(coverUrl)
        coverBlob = await response.blob()
      }
    } catch (error) {
      console.warn('Could not extract EPUB cover:', error)
    }
    
    // Extract text from all chapters
    const spine = await book.loaded.spine
    const pages: Array<{ pageNumber: number; text: string }> = []
    
    let pageNumber = 1
    for (const item of spine.items) {
      try {
        const section = book.spine.get(item.href)
        await section.load(book.load.bind(book))
        const text = section.document?.textContent || ''
        
        pages.push({
          pageNumber,
          text
        })
        pageNumber++
      } catch (error) {
        console.warn(`Could not load chapter ${item.href}:`, error)
      }
    }
    
    return {
      title,
      author,
      coverBlob,
      fileBlob: file,
      format: 'epub',
      pages
    }
  } catch (error) {
    console.error('EPUB processing error:', error)
    throw new Error('EPUB dosyası işlenirken hata oluştu')
  }
}

// Main import function
export const importBook = async (file: File): Promise<number> => {
  // Validate file type
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['pdf', 'epub'].includes(extension || '')) {
    throw new Error('Desteklenmeyen dosya formatı. Sadece PDF ve EPUB destekleniyor.')
  }
  
  // Validate file size
  const validation = await validateFileSize(file)
  if (!validation.valid) {
    throw new Error(validation.warning || 'Dosya çok büyük')
  }
  
  // Process file based on type
  let processedBook: ProcessedBook
  if (extension === 'pdf') {
    processedBook = await processPDF(file)
  } else {
    processedBook = await processEPUB(file)
  }
  
  // Store book in IndexedDB
  const bookId = await addBook({
    title: processedBook.title,
    author: processedBook.author,
    coverBlob: processedBook.coverBlob,
    fileBlob: processedBook.fileBlob,
    format: processedBook.format,
    createdAt: new Date()
  })
  
  // Index book content for search
  await indexBookContent(bookId as number, processedBook.pages)
  
  return bookId as number
}
