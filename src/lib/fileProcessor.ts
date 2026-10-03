import * as pdfjsLib from 'pdfjs-dist'
import ePub from 'epubjs'
import { extractPdfSections } from './bookNavigation'
import { addBook, indexBookContent, checkStorageQuota, type BookSection } from './db'

// Set PDF.js worker to use local version from node_modules
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export interface ProcessedBook {
  title: string
  author: string | null
  coverBlob: Blob | null
  fileBlob: Blob
  format: 'pdf' | 'epub'
  toc: BookSection[]
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
export const processPDF = async (fileOrBlob: File | Blob, customTitle?: string): Promise<ProcessedBook> => {
  try {
    const arrayBuffer = await fileOrBlob.arrayBuffer()

    // Configure PDF.js to use CMaps for better text extraction (crucial for Ottoman/Arabic)
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: `${import.meta.env.BASE_URL}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`
    }).promise

    try {
    // Extract metadata
    const metadata = await pdf.getMetadata()
    const info = metadata.info as { Title?: string; Author?: string } | undefined
    const title = customTitle || info?.Title || (fileOrBlob instanceof File ? fileOrBlob.name.replace('.pdf', '') : 'Unknown Book')
    const author = info?.Author || null

    const toc = await extractPdfSections(pdf)

    // Extract text from all pages
    const pages: Array<{ pageNumber: number; text: string }> = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()

      // 1. Group items into lines and collect stats
      interface TextLine {
        y: number
        x: number
        width: number
        height: number
        text: string
        hasHyphen: boolean
      }

      const lines: TextLine[] = []
      let currentLineItems: { x: number, width: number, height: number, str: string, hasEOL: boolean }[] = []
      let currentY = -1

      const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

      // Helper to flush current line
      const flushLine = () => {
        if (currentLineItems.length === 0) return

        // Sort ALL items by X ascending (Left-to-Right visual order)
        currentLineItems.sort((a, b) => a.x - b.x)

        // Group items into chunks based on script (Arabic vs Non-Arabic)
        const chunks: { isArabic: boolean; items: typeof currentLineItems }[] = []

        if (currentLineItems.length > 0) {
          let currentChunk = {
            isArabic: arabicRegex.test(currentLineItems[0].str),
            items: [currentLineItems[0]]
          }

          for (let i = 1; i < currentLineItems.length; i++) {
            const item = currentLineItems[i]
            const isItemArabic = arabicRegex.test(item.str)

            if (isItemArabic === currentChunk.isArabic) {
              currentChunk.items.push(item)
            } else {
              chunks.push(currentChunk)
              currentChunk = {
                isArabic: isItemArabic,
                items: [item]
              }
            }
          }
          chunks.push(currentChunk)
        }

        // Process chunks to build final text
        const processedText = chunks.map(chunk => {
          if (chunk.isArabic) {
            // DO NOT REVERSE - PDF.js returns visual order which is what we need
            // Join WITHOUT extra spaces to help ligatures connect
            const text = chunk.items.map(i => i.str).join('').trim()
            return `<span class="arabic-text" dir="rtl">${text}</span>`
          } else {
            // For non-Arabic, keep normal spacing
            return chunk.items.map(i => i.str).join(' ').trim()
          }
        }).join(' ')

        if (!processedText) return

        // Calculate line stats
        const firstItem = currentLineItems[0]
        const lastItem = currentLineItems[currentLineItems.length - 1]
        const width = (lastItem.x + lastItem.width) - firstItem.x
        const height = Math.max(...currentLineItems.map(i => i.height))
        const hasHyphen = processedText.trim().endsWith('-')

        lines.push({
          y: currentY,
          x: firstItem.x,
          width,
          height,
          text: processedText,
          hasHyphen
        })
        currentLineItems = []
      }

      for (const item of textContent.items as any[]) {
        // Round Y to group items on same line
        // Use larger tolerance (15px) to handle Arabic diacritics and varying baselines
        const itemY = Math.round(item.transform[5])
        const hasArabicContent = arabicRegex.test(item.str)
        const yTolerance = hasArabicContent || currentLineItems.some(i => arabicRegex.test(i.str)) ? 15 : 2

        if (currentY !== -1 && Math.abs(itemY - currentY) > yTolerance) {
          flushLine()
        }

        currentY = itemY
        currentLineItems.push({
          x: item.transform[4],
          width: item.width,
          height: item.height,
          str: item.str,
          hasEOL: item.hasEOL
        })
      }
      flushLine()

      // Sort lines top-to-bottom
      lines.sort((a, b) => b.y - a.y)

      // Filter page numbers (simple heuristic: single number or "Page X" at top/bottom)
      if (lines.length > 0) {
        const isPageNum = (t: string) => /^\s*(?:sayfa|page)?\s*\d+(?:\s*\/\s*\d+)?\s*$/i.test(t)
        if (isPageNum(lines[0].text)) lines.shift()
        if (lines.length > 0 && isPageNum(lines[lines.length - 1].text)) lines.pop()
      }

      if (lines.length === 0) {
        pages.push({ pageNumber: i, text: 'EMPTY_PAGE_MARKER' })
        page.cleanup()
        continue
      }

      // 2. Calculate Page Stats for heuristics
      const avgHeight = lines.reduce((sum, l) => sum + l.height, 0) / lines.length
      const maxLineWidth = Math.max(...lines.map(l => l.width))

      // 3. Smart Merge Logic
      let paragraphs: string[] = []
      let currentPara = ''

      for (let j = 0; j < lines.length; j++) {
        const line = lines[j]
        const nextLine = lines[j + 1]

        // Is Header? (Significantly larger than average)
        // Lowered threshold to 1.05 to catch more headers
        const isHeader = line.height > avgHeight * 1.05

        if (isHeader) {
          if (currentPara) {
            paragraphs.push(`<p>${currentPara}</p>`)
            currentPara = ''
          }
          paragraphs.push(`<h3>${line.text}</h3>`)
          continue
        }

        // Start new paragraph if needed
        if (!currentPara) {
          currentPara = line.text
        } else {
          // Merge logic
          // If previous line ends with hyphen, remove it and join
          if (currentPara.endsWith('-')) {
            currentPara = currentPara.slice(0, -1) + line.text
          } else {
            currentPara += ' ' + line.text
          }
        }

        // Determine if we should END the paragraph here
        // End if:
        // 1. Next line is a header
        // 2. This line is "short" AND next line starts with Uppercase (strong signal for paragraph end)
        //    Threshold: < 70% of max width (lowered from 85%)
        // 3. Next line has a large vertical gap (optional, but good for section breaks)

        const isShortLine = line.width < (maxLineWidth * 0.70)
        const nextIsHeader = nextLine && nextLine.height > avgHeight * 1.05
        // Increased gap threshold to avoid splitting paragraphs on small spacing variations
        const largeGap = nextLine && Math.abs(line.y - nextLine.y) > (line.height * 2.0)

        // Check if next line starts with uppercase (Turkish characters included)
        const nextStartsUpper = nextLine && /^[A-ZİĞÜŞÖÇ]/.test(nextLine.text.trim())

        // Only split if strong signal
        if ((isShortLine && nextStartsUpper) || nextIsHeader || largeGap || !nextLine) {
          // RTL Detection
          // Check for Arabic/Ottoman characters
          const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/
          const isRTL = arabicPattern.test(currentPara)

          if (isRTL) {
            paragraphs.push(`<p dir="rtl" style="text-align: right; direction: rtl;">${currentPara}</p>`)
          } else {
            paragraphs.push(`<p>${currentPara}</p>`)
          }

          currentPara = ''
        }
      }

      // If no text extracted (image-only page), add marker
      const finalText = paragraphs.length > 0 ? paragraphs.join('') : 'EMPTY_PAGE_MARKER'

      pages.push({
        pageNumber: i,
        text: finalText
      })
      page.cleanup()
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
        viewport: viewport,
        canvas: canvas
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
      fileBlob: fileOrBlob,
      format: 'pdf',
      toc,
      pages
    }
    } finally { await pdf.destroy() }
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
    await book.loaded.spine
    const spine = book.spine as unknown as { spineItems: Array<{ href: string }> }
    const toc: BookSection[] = []
    const navigation = await book.loaded.navigation
    const sectionStarts = new Map<string, number>()
    const pages: Array<{ pageNumber: number; text: string }> = []

    let pageNumber = 1
    for (const item of (spine.spineItems || [])) {
      try {
        const section = book.spine.get(item.href)
        if (!section) {
          console.warn(`Section not found for href: ${item.href}`)
          continue
        }

        // Load the section content
        const contents = await section.load(book.load.bind(book))

        // Get the HTML content - try multiple approaches
        let text = ''

        if (section.document) {
          // Get body content as HTML (preserving formatting)
          const body = section.document.body || section.document.documentElement
          if (body) {
            // Process images - convert to base64 data URLs
            const images = body.querySelectorAll('img')
            for (const img of Array.from(images)) {
              try {
                const src = img.getAttribute('src')
                if (src && !src.startsWith('data:')) {
                  // Resolve relative path against section's location
                  let resolvedPath = src

                  // Get the section's base path (directory)
                  const sectionHref = item.href
                  const sectionDir = sectionHref.substring(0, sectionHref.lastIndexOf('/') + 1)

                  // If src is relative, resolve it
                  if (!src.startsWith('/') && !src.startsWith('http')) {
                    // Handle ../ paths
                    let basePath = sectionDir
                    let imagePath = src

                    while (imagePath.startsWith('../')) {
                      imagePath = imagePath.substring(3)
                      const lastSlash = basePath.slice(0, -1).lastIndexOf('/')
                      basePath = lastSlash >= 0 ? basePath.substring(0, lastSlash + 1) : ''
                    }

                    resolvedPath = basePath + imagePath
                  }

                  // Try to load the image from EPUB archive
                  let imgBlob = await book.archive.getBlob(resolvedPath)

                  // If not found, try with and without OEBPS prefix
                  if (!imgBlob && !resolvedPath.startsWith('OEBPS/')) {
                    imgBlob = await book.archive.getBlob('OEBPS/' + resolvedPath)
                  }
                  if (!imgBlob && resolvedPath.startsWith('OEBPS/')) {
                    imgBlob = await book.archive.getBlob(resolvedPath.replace('OEBPS/', ''))
                  }
                  // Also try the original src as fallback
                  if (!imgBlob) {
                    imgBlob = await book.archive.getBlob(src)
                  }

                  // Fuzzy search: Try to find by filename only (ignoring path)
                  if (!imgBlob) {
                    const filename = src.split('/').pop()
                    if (filename) {
                      // Decode filename in case it is URL encoded
                      const decodedFilename = decodeURIComponent(filename)

                      // @ts-ignore - accessing internal files map if possible, or iterating
                      // epubjs doesn't expose a simple list, but we can try common paths

                      // Deep Search: Iterate through ALL files in the zip to find the image
                      // This is the most robust way to handle unpredictable internal paths
                      if (!imgBlob) {
                        try {
                          // @ts-ignore - Accessing internal JSZip instance
                          if (book.archive && book.archive.zip && book.archive.zip.files) {
                            // @ts-ignore
                            const zipFiles = book.archive.zip.files
                            const searchFilename = decodedFilename.toLowerCase()

                            // Find any file that ends with this filename
                            let foundPath: string | null = null

                            // 1. Exact match relative path check
                            // 2. Filename match check
                            for (const path in zipFiles) {
                              const pathLower = path.toLowerCase()
                              if (pathLower.endsWith('/' + searchFilename) || pathLower === searchFilename) {
                                console.log('Found image via Deep Search:', path)
                                foundPath = path
                                break // Stop at first match
                              }
                            }

                            if (foundPath) {
                              imgBlob = await book.archive.getBlob(foundPath)
                            }
                          }
                        } catch (deepSearchError) {
                          console.warn('Deep search failed:', deepSearchError)
                        }
                      }

                    }
                  }

                  if (imgBlob) {
                    // Convert blob to base64
                    const reader = new FileReader()
                    const base64 = await new Promise<string>((resolve) => {
                      reader.onloadend = () => resolve(reader.result as string)
                      reader.readAsDataURL(imgBlob)
                    })
                    img.setAttribute('src', base64)

                    // Fix visual issues
                    // Force height 'auto' to override potentially broken '100%' attributes in cover pages
                    img.style.maxWidth = '100%'
                    img.style.height = 'auto'
                    img.style.display = 'block' // Ensure it's visible
                    img.style.margin = '0 auto' // Center it
                  } else {
                    console.warn('Could not find image in EPUB:', src, '(resolved:', resolvedPath, ')')
                    // Show alt text with a visual placeholder border
                    img.style.display = 'block'
                    img.style.border = '1px dashed #ccc'
                    img.style.padding = '10px'
                    img.style.backgroundColor = '#f9f9f9'
                    img.style.color = '#666'
                    img.setAttribute('alt', `Görsel Bulunamadı: ${src.split('/').pop()}`)
                  }
                }
              } catch (imgError) {
                console.warn('Could not process image:', imgError)
                // Keep the broken image placeholder visible but cleaner
                img.style.display = 'none'
              }
            }
            // Get innerHTML to preserve paragraph structure
            text = body.innerHTML || body.textContent || ''
          }
        } else if (typeof contents === 'string') {
          // If contents is a string, use it directly
          text = contents
          text = (contents as any).body.innerHTML || (contents as any).body.textContent || ''
        }

        // Helper to split HTML content by character count (preserving HTML structure)
        // IMPROVED: Now also splits within long elements for books like Kuran Meali
        const splitByCharacterCount = (html: string, maxChars = 555): string[] => {
          try {
            const parser = new DOMParser()
            const doc = parser.parseFromString(html, 'text/html')
            const body = doc.body

            const pages: string[] = []
            let currentPageContent = ''
            let currentCharCount = 0

            // Helper to split long text into chunks
            const splitLongText = (text: string): string[] => {
              const chunks: string[] = []
              // Split by sentences first (. ! ?) to avoid cutting mid-sentence
              const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]

              let currentChunk = ''
              for (const sentence of sentences) {
                if (currentChunk.length + sentence.length <= maxChars) {
                  currentChunk += sentence
                } else {
                  if (currentChunk) chunks.push(currentChunk.trim())
                  // If single sentence is too long, force-split by chars
                  if (sentence.length > maxChars) {
                    for (let i = 0; i < sentence.length; i += maxChars) {
                      chunks.push(sentence.slice(i, i + maxChars).trim())
                    }
                    currentChunk = ''
                  } else {
                    currentChunk = sentence
                  }
                }
              }
              if (currentChunk) chunks.push(currentChunk.trim())
              return chunks.filter(c => c.length > 0)
            }

            // Process each element and split when character limit is reached
            const processElement = (element: Element) => {
              const elementText = element.textContent || ''
              const elementHTML = element.outerHTML
              const tagName = element.tagName.toLowerCase()

              // If element is small enough, add as-is
              if (elementText.length <= maxChars && currentCharCount + elementText.length <= maxChars) {
                currentPageContent += elementHTML
                currentCharCount += elementText.length
                return
              }

              // If current page has content and element won't fit, start new page
              if (currentCharCount > 0 && currentCharCount + elementText.length > maxChars) {
                if (currentPageContent) {
                  pages.push(currentPageContent)
                  currentPageContent = ''
                  currentCharCount = 0
                }
              }

              // If element itself is longer than maxChars, split its content
              if (elementText.length > maxChars) {
                const textChunks = splitLongText(elementText)
                for (const chunk of textChunks) {
                  // Wrap chunk in original tag
                  const wrappedChunk = `<${tagName}>${chunk}</${tagName}>`

                  if (currentCharCount + chunk.length <= maxChars) {
                    currentPageContent += wrappedChunk
                    currentCharCount += chunk.length
                  } else {
                    if (currentPageContent) {
                      pages.push(currentPageContent)
                    }
                    currentPageContent = wrappedChunk
                    currentCharCount = chunk.length
                  }
                }
              } else {
                // Element is small but page is full, start new page
                currentPageContent = elementHTML
                currentCharCount = elementText.length
              }
            }

            // Process all child elements
            Array.from(body.children).forEach(child => {
              if (child instanceof Element) {
                processElement(child)
              }
            })

            // Add final page if any content remains
            if (currentPageContent) {
              pages.push(currentPageContent)
            }

            return pages.length > 0 ? pages : [body.innerHTML]
          } catch (e) {
            console.error('Error splitting HTML by character count:', e)
            return [html]
          }
        }

        // Skip empty chapters
        if (!text || text.trim().length === 0) {
          console.warn(`Empty chapter: ${item.href}`)
          continue
        }

        sectionStarts.set(item.href.split('#')[0], pageNumber)

        // Split chapter into pages by character count (read from localStorage)
        const charLimit = parseInt(localStorage.getItem('epub_char_limit') || '555')
        const splitPages = splitByCharacterCount(text, charLimit)
        if (splitPages.length === 0) {
          // No page breaks detected, treat whole chapter as a single page
          pages.push({
            pageNumber,
            text
          })
          pageNumber++
        } else {
          splitPages.forEach(pageContent => {
            pages.push({
              pageNumber,
              text: pageContent
            })
            pageNumber++
          })
        }
      } catch (error) {
        console.warn(`Could not load chapter ${item.href}:`, error)
      }
    }

    type NavigationItem = { label: string; href: string; subitems?: NavigationItem[] }
    const visitToc = (items: NavigationItem[], level: number) => {
      for (const item of items) {
        const [href, anchor] = item.href.split('#')
        const section = book.spine.get(href)
        let target = sectionStarts.get(section?.href || href)
        if (anchor) {
          const matching = pages.find(page => {
            const container = document.createElement('div')
            container.innerHTML = page.text
            return Array.from(container.querySelectorAll('[id], [name]')).some(element => element.id === anchor || element.getAttribute('name') === anchor)
          })
          if (matching) target = matching.pageNumber
        }
        if (target) toc.push({ title: item.label.trim(), pageNumber: target, anchor, level })
        if (item.subitems) visitToc(item.subitems, level + 1)
      }
    }
    visitToc(navigation.toc, 0)

    // If no pages extracted, add a marker
    if (pages.length === 0) {
      console.error('No pages extracted from EPUB')
      pages.push({ pageNumber: 1, text: '<p>EPUB içeriği okunamadı.</p>' })
    }

    return {
      title,
      author,
      coverBlob,
      fileBlob: file,
      format: 'epub',
      toc,
      pages
    }
  } catch (error) {
    console.error('EPUB processing error:', error)
    throw new Error('EPUB dosyası işlenirken hata oluştu')
  }
}



// Main import function
export const importBook = async (file: File, customTitle?: string): Promise<number> => {
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
    title: customTitle || processedBook.title,
    author: processedBook.author,
    coverBlob: processedBook.coverBlob,
    fileBlob: processedBook.fileBlob,
    format: processedBook.format,
    toc: processedBook.toc,
    pageCount: processedBook.pages.length,
    createdAt: new Date(),
    isDownloaded: true  // Mark as downloaded so it appears in notification settings
  })

  // Index book content for search
  await indexBookContent(bookId as number, processedBook.pages)

  return bookId as number
}
