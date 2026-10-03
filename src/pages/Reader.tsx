import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { getBook, addBookmark, deleteBookmark, getBookmarks, db, type Book, type Bookmark } from '../lib/db'
import { highlightText, searchBooks, type SearchResult } from '../lib/search'
import { summarizeText } from '../lib/ai'
import { showToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import * as pdfjsLib from 'pdfjs-dist'
import { sanitizeRisaleHtml } from '../lib/risaleContent'

interface GlossaryPopup {
  term: string
  meaning?: string
  original?: string
  translation?: string
  source?: string
  x: number
  y: number
  mobile: boolean
}

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export default function Reader() {
  const { bookId, pageId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [book, setBook] = useState<Book | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const selectedTextRef = useRef('') // Store selection without re-render to preserve native menu
  const [showAIMenu, setShowAIMenu] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [summary, setSummary] = useState('')
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [pageText, setPageText] = useState('')
  const [pagePlainText, setPagePlainText] = useState('')
  const [goToPageInput, setGoToPageInput] = useState('')
  const [showReadingSettings, setShowReadingSettings] = useState(false)
  const [glossaryPopup, setGlossaryPopup] = useState<GlossaryPopup | null>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGlossaryPopup(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [])

  // Immersive Mode & Slider State
  const [showControls, setShowControls] = useState(true)
  const [sliderValue, setSliderValue] = useState<number | null>(null)

  // In-book search state
  const [showInBookSearch, setShowInBookSearch] = useState(false)
  const [inBookQuery, setInBookQuery] = useState('')
  const [inBookResults, setInBookResults] = useState<SearchResult[]>([])
  const [currentResultIndex, setCurrentResultIndex] = useState(0)
  const [searchingInBook, setSearchingInBook] = useState(false)

  // Onboarding State
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Preview Page State (for "Moon Reader" style sliding)
  const [previewPage, setPreviewPage] = useState<number | null>(null)

  // EPUB Reprocess Confirm Dialog
  const [showEpubReprocessConfirm, setShowEpubReprocessConfirm] = useState(false)
  const [isReprocessing, setIsReprocessing] = useState(false)

  // Check for onboarding
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('reader_onboarding_seen')
    if (!hasSeenOnboarding) {
      // Small delay to ensure render is complete
      setTimeout(() => setShowOnboarding(true), 1000)
    }
  }, [])

  // Fix: Hide broken images globally
  useEffect(() => {
    const handleImageError = (event: Event) => {
      const img = event.target as HTMLImageElement
      if (img && img.tagName === 'IMG') {
        // Hide the broken image icon
        img.style.display = 'none'
        console.log('Broken image hidden:', img.src)
      }
    }

    // Capture phase is required for error events which don't bubble
    document.addEventListener('error', handleImageError, true)

    return () => {
      document.removeEventListener('error', handleImageError, true)
    }
  }, [])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<any>(null)

  // Track if we came from notification with highlight - use React Router's searchParams
  const hasHighlight = searchParams.get('q') || searchParams.get('highlight')

  const [viewMode, setViewMode] = useState<'pdf' | 'text'>(() => {
    // Check for highlight parameter from notification - force text mode from start
    const params = new URLSearchParams(window.location.search)
    const highlight = params.get('q') || params.get('highlight')
    return highlight ? 'text' : 'pdf'
  })

  // Force text mode when navigating from Settings with highlight param
  useEffect(() => {
    if (hasHighlight) {
      setViewMode('text')
    }
  }, [hasHighlight])

  // Debounced slider navigation
  useEffect(() => {
    if (sliderValue !== null) {
      const timer = setTimeout(() => {
        navigate(`/reader/${bookId}/${sliderValue}`)
        if (book?.format === 'epub' || book?.format === 'risale-json') {
          window.scrollTo({ top: 0 })
        }
      }, 200) // 200ms debounce
      return () => clearTimeout(timer)
    }
  }, [sliderValue, bookId, book, navigate])

  // Initialize state from localStorage
  const [fontSize, setFontSize] = useState<number>(() =>
    parseInt(localStorage.getItem('reader_fontSize') || '18')
  )
  const [lineHeight, setLineHeight] = useState<number>(() =>
    parseFloat(localStorage.getItem('reader_lineHeight') || '1.8')
  )
  const [paragraphSpacing, setParagraphSpacing] = useState<number>(() =>
    parseInt(localStorage.getItem('reader_paragraphSpacing') || '15')
  )
  const [letterSpacing, setLetterSpacing] = useState<number>(() =>
    parseFloat(localStorage.getItem('reader_letterSpacing') || '0')
  )
  const [fontWeight, setFontWeight] = useState<number>(() =>
    parseInt(localStorage.getItem('reader_fontWeight') || '400')
  )
  const [textAlign, setTextAlign] = useState<'justify' | 'left'>(() =>
    (localStorage.getItem('reader_textAlign') as any) || 'left'
  )
  const [hyphens, setHyphens] = useState<boolean>(() =>
    localStorage.getItem('reader_hyphens') !== 'false'
  )

  // Margins
  const [marginTop, setMarginTop] = useState<number>(() =>
    parseInt(localStorage.getItem('reader_marginTop') || '30')
  )
  const [marginBottom, setMarginBottom] = useState<number>(() =>
    parseInt(localStorage.getItem('reader_marginBottom') || '30')
  )
  const [marginLeft, setMarginLeft] = useState<number>(() =>
    parseInt(localStorage.getItem('reader_marginLeft') || '24')
  )
  const [marginRight, setMarginRight] = useState<number>(() =>
    parseInt(localStorage.getItem('reader_marginRight') || '24')
  )

  const [fontFamily, setFontFamily] = useState<'serif' | 'merriweather' | 'system' | 'roboto' | 'opensans' | 'arial' | 'poppins' | 'verdana' | 'mono'>(() =>
    (localStorage.getItem('reader_fontFamily') as any) || 'serif'
  )
  const [backgroundColor, setBackgroundColor] = useState<'white' | 'sepia' | 'dark' | 'cream' | 'islamic'>(() => {
    // Check if user has set a reader-specific background
    const saved = localStorage.getItem('reader_backgroundColor')
    if (saved) return saved as any
    // Otherwise, follow global theme
    const globalTheme = localStorage.getItem('theme')
    return globalTheme === 'dark' ? 'dark' : 'white'
  })
  const [isSpeaking, setIsSpeaking] = useState(false)

  // EPUB character limit setting
  const [epubCharLimit, setEpubCharLimit] = useState<number>(() =>
    parseInt(localStorage.getItem('epub_char_limit') || '555')
  )

  const currentPage = parseInt(pageId || '1')
  const currentBookId = parseInt(bookId || '0')

  // Refs for direct DOM manipulation (no React re-render = preserves native selection)
  const aiMenuRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const isFullscreenRef = useRef(false)

  // Menu position for dragging
  const menuPositionRef = useRef({ x: 0, y: 0 })
  const dragStartRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)

  // Enter fullscreen via DOM (no re-render, preserves selection)
  const enterFullscreenDirectly = () => {
    if (headerRef.current) headerRef.current.style.display = 'none'
    if (footerRef.current) footerRef.current.style.display = 'none'
    isFullscreenRef.current = true
  }

  // Exit fullscreen via DOM
  const exitFullscreenDirectly = () => {
    if (headerRef.current) headerRef.current.style.display = 'flex'
    if (footerRef.current) footerRef.current.style.display = 'flex'
    isFullscreenRef.current = false
  }

  // Show AI menu (only in fullscreen)
  const showMenuDirectly = () => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()

    if (text && text.length > 2 && aiMenuRef.current && isFullscreenRef.current) {
      console.log('[Selection] Showing menu for:', text.substring(0, 30))
      selectedTextRef.current = text
      // Reset position
      menuPositionRef.current = { x: 0, y: 0 }
      aiMenuRef.current.style.transform = 'translateX(-50%)'
      aiMenuRef.current.style.display = 'block'
    }
  }

  // Hide AI menu
  const hideMenuDirectly = () => {
    if (aiMenuRef.current) {
      aiMenuRef.current.style.display = 'none'
    }
    setShowAIMenu(false)
  }

  // Auto-fullscreen when selection starts (via selectionchange)
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()

      // When text is being selected:
      if (text && text.length > 0) {
        // 1. Auto-enter fullscreen if needed
        if (!isFullscreenRef.current) {
          console.log('[Selection] Auto-entering fullscreen')
          enterFullscreenDirectly()
        }

        // 2. FORCE SHOW MENU IMMEDIATELY
        if (text.length > 2 && aiMenuRef.current) {
          // We can skip showMenuDirectly's check since we just forced fullscreen
          selectedTextRef.current = text
          // Only reset position if it was hidden
          if (aiMenuRef.current.style.display === 'none') {
            menuPositionRef.current = { x: 0, y: 0 }
            aiMenuRef.current.style.transform = 'translateX(-50%)'
          }
          aiMenuRef.current.style.display = 'block'
        }
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  // Load book content
  useEffect(() => {
    const loadBookContent = async () => {
      if (!bookId || !pageId) return

      try {
        setLoading(true)
        setError(null)
        // Use previewPage if available (dragging), otherwise URL param
        const targetPage = previewPage ?? parseInt(pageId)

        // Ensure page is valid
        if (isNaN(targetPage) || targetPage < 1) return

        // Fetch book from db
        const bookData = await getBook(parseInt(bookId))
        if (!bookData) {
          setError('Kitap bulunamadı')
          return
        }
        setBook(bookData)
        // If totalPages is 0 in DB (incomplete import), we might need to rely on PDF/stats
        if (bookData.lastReadPage) {
          // Optional: could sync read state
        }
        // Note: totalPages is usually in bookData or computed. 
        // In previous logic it was derived from content count.
        // Let's get content count here for text mode
        const allPages = await db.bookContent.where('bookId').equals(parseInt(bookId)).count()
        if (allPages > 0) setTotalPages(allPages)


        // Load page content
        const content = await db.bookContent
          .where('[bookId+pageNumber]')
          .equals([parseInt(bookId), targetPage])
          .first()

        if (content) {
          let text = bookData.format === 'risale-json'
            ? sanitizeRisaleHtml(content.contentText)
            : content.contentText

          // EPUB Image Handling: Show cover on first page, strip other broken images
          if (bookData.format === 'epub') {
            // If this is the first page, try to add cover image
            if (targetPage === 1 && (bookData.coverBlob || bookData.coverUrl)) {
              let coverSrc = ''
              if (bookData.coverBlob) {
                coverSrc = URL.createObjectURL(bookData.coverBlob)
              } else if (bookData.coverUrl) {
                coverSrc = bookData.coverUrl
              }

              if (coverSrc) {
                // Add cover image at the beginning of content
                const coverHtml = `<div style="text-align: center; margin-bottom: 2em;">
                  <img src="${coverSrc}" style="max-width: 80%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" alt="Kitap Kapağı" />
                </div>`

                // Remove any existing broken cover images first
                text = text.replace(/<img[^>]*alt=["'](Görsel Bulunamadı|Visual Not Found|cover|kapak)[^>]*>/gi, '')

                // Prepend the working cover
                text = coverHtml + text
              }
            }

            // Remove all OTHER images (broken ones) but keep our cover
            // Only remove images that are NOT our cover (don't have our specific blob URL)
            text = text.replace(/<img(?![^>]*blob:)[^>]*>/gi, (match) => {
              // Keep images with blob: URLs (our cover) or with Kitap Kapağı alt
              if (match.includes('blob:') || match.includes('Kitap Kapağı')) {
                return match
              }
              return ''
            })
          }

          setPageText(text)
          setPagePlainText(content.plainText || content.contentText.replace(/<[^>]+>/g, ' '))
        } else {
          setPageText('')
          setPagePlainText('')
        }
      } catch (err: any) {
        console.error('Error loading book content:', err)
        setError('İçerik yüklenirken hata oluştu')
      } finally {
        setLoading(false)
      }
    }

    loadBookContent()
  }, [bookId, pageId, previewPage, navigate])

  // Update viewMode based on book format and highlight params
  useEffect(() => {
    if (book) {
      // Check for highlight parameter from notification
      const params = new URLSearchParams(location.search)
      const highlight = params.get('q') || params.get('highlight')

      // Force text mode if there's a highlight parameter
      if (highlight) {
        setViewMode('text')
      } else if (book.format === 'epub' || book.format === 'risale-json') {
        setViewMode('text')
      } else {
        // For PDF, default to 'pdf' (Original) but allow switching
        // We could persist this preference too if needed
      }
    }
  }, [book])

  // Scroll to highlight with retry mechanism
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('q') || params.get('highlight')) {
      let attempts = 0
      const maxAttempts = 10

      const tryScroll = () => {
        const mark = document.querySelector('mark')
        if (mark) {
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } else if (attempts < maxAttempts) {
          attempts++
          setTimeout(tryScroll, 300) // Retry every 300ms
        }
      }

      // Start trying
      setTimeout(tryScroll, 500)

      return () => { attempts = maxAttempts } // Stop retrying on cleanup
    }
  }, [pageText, location.search])

  // Render PDF page
  useEffect(() => {
    const renderPage = async () => {
      // Only render canvas if viewMode is 'pdf'
      // NEW: If pageText is 'EMPTY_PAGE_MARKER', it means it's an image-only page, so we MUST render canvas even in text mode.
      const isImageOnlyPage = pageText.includes('EMPTY_PAGE_MARKER')
      const shouldRenderCanvas = book?.format === 'pdf' && (viewMode === 'pdf' || isImageOnlyPage)

      if (!book || !shouldRenderCanvas || !book.fileBlob || !canvasRef.current) return

      try {
        const arrayBuffer = await book.fileBlob.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/standard_fonts/'
        }).promise

        if (currentPage > pdf.numPages) return

        // Fallback: If totalPages is 0 (missing DB content), use PDF page count
        if (totalPages === 0) {
          setTotalPages(pdf.numPages)
        }

        const page = await pdf.getPage(currentPage)

        // High Quality Rendering Logic
        const canvas = canvasRef.current
        // Fix: Check if canvas exists again after await, as component might have unmounted
        if (!canvas) return

        const context = canvas.getContext('2d')
        if (!context) return

        // 1. Get the device pixel ratio (e.g. 2 for Retina screens)
        const dpr = window.devicePixelRatio || 1

        // 2. Set a base scale (zoom level). 1.5 was too low. 2.0 or 2.5 is better.
        // We can make this responsive later, but for now fixed high quality.
        const baseScale = 2.0

        // 3. Calculate viewport at this scale
        const viewport = page.getViewport({ scale: baseScale })

        // 4. Set the actual canvas dimensions (pixels) accounting for DPR
        // This makes the canvas buffer large enough for high-res screens
        canvas.width = viewport.width * dpr
        canvas.height = viewport.height * dpr

        // 5. Scale the context so drawing operations match the viewport
        context.scale(dpr, dpr)

        // 6. Set CSS style width/height to match the viewport (logical pixels)
        // This ensures it fits in the layout correctly while having high internal resolution
        // FIX: Use 100% width and auto height to maintain aspect ratio on mobile
        canvas.style.width = '100%'
        canvas.style.height = 'auto'

        // Cancel previous render if any
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel()
        }

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas as any
        }

        renderTaskRef.current = page.render(renderContext)
        await renderTaskRef.current.promise

        // --- Annotation Layer Implementation ---
        // Create annotation layer div if it doesn't exist
        const canvasContainer = canvas.parentElement
        if (canvasContainer) {
          // Remove existing annotation layer
          const existingLayer = canvasContainer.querySelector('.annotationLayer')
          if (existingLayer) {
            existingLayer.remove()
          }

          const annotationLayerDiv = document.createElement('div')
          annotationLayerDiv.className = 'annotationLayer'
          // Style to match canvas
          annotationLayerDiv.style.setProperty('--scale-factor', `${baseScale}`)
          annotationLayerDiv.style.left = '0'
          annotationLayerDiv.style.top = '0'
          annotationLayerDiv.style.right = '0'
          annotationLayerDiv.style.bottom = '0'
          annotationLayerDiv.style.position = 'absolute'

          // Important: The annotation layer needs to be scaled to match the canvas CSS size
          // The canvas CSS width is 100%, so we need to match that.
          // However, pdf.js annotation layer expects exact pixel dimensions matching the viewport.
          // We can use CSS transform to scale it down to fit the container.

          // Actually, a simpler way for responsive canvas is to let pdf.js render it at full size
          // and then use CSS to fit it.
          // But here we are using a specific responsive approach.

          canvasContainer.appendChild(annotationLayerDiv)

          const annotations = await page.getAnnotations()

          // We need to render the annotation layer with the SAME viewport as the canvas
          // But since we are scaling the canvas context by DPR, and the viewport was created with baseScale,
          // we should use the same viewport for annotations.

          // However, the CSS width of the canvas is '100%'.
          // The annotation layer div will also be '100%' width of the container.
          // We need to ensure the internal content of the annotation layer matches the visual scale.

          // PDF.js AnnotationLayerBuilder is not exposed directly in the basic API usually,
          // but we can use pdfjsLib.AnnotationLayer.render()

          const parameters = {
            viewport: viewport.clone({ dontFlip: true }),
            div: annotationLayerDiv,
            annotations: annotations,
            page: page,
            linkService: {
              goToDestination: (dest: any) => {
                // Handle internal links
                // dest is usually an array [ref, name, ...]
                // We need to find the page index for this ref
                // This requires loading the PDF document object which we have 'pdf'

                const resolveDest = async () => {
                  try {
                    let explicitDest = dest
                    if (typeof dest === 'string') {
                      explicitDest = await pdf.getDestination(dest)
                    }

                    if (!explicitDest) return

                    const ref = explicitDest[0]
                    const pageIndex = await pdf.getPageIndex(ref)
                    navigate(`/reader/${bookId}/${pageIndex + 1}`)
                  } catch (e) {
                    console.error('Link navigation failed', e)
                  }
                }
                resolveDest()
              },
              getDestinationHash: () => '#',
              addLinkAttributes: (link: any) => {
                link.target = '_blank'
                link.rel = 'noopener noreferrer'
              }
            } as any,
            renderInteractiveForms: false
          };

          // Render annotations
          // Render annotations
          try {
            if ((pdfjsLib as any).AnnotationLayer && typeof (pdfjsLib as any).AnnotationLayer.render === 'function') {
              (pdfjsLib as any).AnnotationLayer.render(parameters)
            } else {
              // Fallback or newer API usage if needed, but for now just suppress crash
              console.warn('AnnotationLayer.render is not available')
            }
          } catch (e) {
            console.warn('Failed to render annotations:', e)
          }

          // CSS Fix for Annotation Layer scaling
          // The annotation layer is rendered at 'viewport.width' pixels.
          // But our container is responsive.
          // We need to scale the annotation layer to fit the current container width.

          const updateAnnotationScale = () => {
            if (!canvasContainer || !annotationLayerDiv) return
            const containerWidth = canvasContainer.clientWidth
            const layerWidth = viewport.width // The width it was rendered at

            if (containerWidth && layerWidth) {
              const scale = containerWidth / layerWidth
              annotationLayerDiv.style.transform = `scale(${scale})`
              annotationLayerDiv.style.transformOrigin = 'top left'
            }
          }

          // Initial scale
          updateAnnotationScale()

          // Update on resize (optional, but good for responsiveness)
          window.addEventListener('resize', updateAnnotationScale)

          // Cleanup listener
          // We can't easily remove the listener here without extracting the function, 
          // but since the component re-renders on resize usually or we unmount, it's okay for now.
          // Better to use a ResizeObserver if we wanted to be perfect.
        }

      } catch (error: any) {
        if (error.name !== 'RenderingCancelledException') {
          console.error('Error rendering PDF page:', error)
        }
      }
    }

    renderPage()

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
      }
    }
  }, [book, currentPage, fontSize, pageText, viewMode])

  // Save settings when they change
  useEffect(() => {
    localStorage.setItem('reader_fontSize', fontSize.toString())
    localStorage.setItem('reader_lineHeight', lineHeight.toString())
    localStorage.setItem('reader_paragraphSpacing', paragraphSpacing.toString())
    localStorage.setItem('reader_letterSpacing', letterSpacing.toString())
    localStorage.setItem('reader_fontWeight', fontWeight.toString())
    localStorage.setItem('reader_textAlign', textAlign)
    localStorage.setItem('reader_hyphens', hyphens.toString())

    localStorage.setItem('reader_marginTop', marginTop.toString())
    localStorage.setItem('reader_marginBottom', marginBottom.toString())
    localStorage.setItem('reader_marginLeft', marginLeft.toString())
    localStorage.setItem('reader_marginRight', marginRight.toString())

    localStorage.setItem('reader_fontFamily', fontFamily)
    localStorage.setItem('reader_backgroundColor', backgroundColor)
  }, [fontSize, lineHeight, paragraphSpacing, letterSpacing, fontWeight, textAlign, hyphens, marginTop, marginBottom, marginLeft, marginRight, fontFamily, backgroundColor])

  // Update theme-color meta tag based on reader background
  useEffect(() => {
    const colors = {
      white: '#FFFFFF',
      sepia: '#F4ECD8',
      dark: '#000000',
      cream: '#FFF8DC',
      islamic: '#E8F5E9'
    }

    const themeColorMeta = document.querySelector('meta[name="theme-color"]')
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', colors[backgroundColor])
    }

    // NATIVE STATUS BAR: Sync color with reader theme
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      import('@capacitor/core').then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform()) {
          try {
            // Set style based on if background is dark
            const isDarkBg = backgroundColor === 'dark'
            StatusBar.setStyle({ style: isDarkBg ? Style.Dark : Style.Light })
            StatusBar.setBackgroundColor({ color: colors[backgroundColor] })
          } catch (e) {
            console.error('StatusBar sync error:', e)
          }
        }
      })
    })
  }, [backgroundColor])

  // FULLSCREEN: Set status bar color to match reading theme
  useEffect(() => {
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      import('@capacitor/core').then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform()) {
          try {
            // YES overlay - content extends behind status bar
            // This ensures the background color matches perfectly
            StatusBar.setOverlaysWebView({ overlay: true })

            // Make status bar transparent so app background shows through
            // Use #00000000 for transparent (Android) or empty string/transparent keyword?
            // #00000000 is 8-digit hex (RR GGBB AA) supported on Android 
            StatusBar.setBackgroundColor({ color: '#00000000' })

            // Set icon style - Dark icons for light backgrounds, Light icons for dark backgrounds
            const isDarkBg = backgroundColor === 'dark'
            StatusBar.setStyle({ style: isDarkBg ? Style.Dark : Style.Light })

            // Toggle visibility based on controls?
            // User feedback suggests they want it to match theme, implying visibility.
            // But if we want immersive reading, we might hide it. 
            // However, hiding it usually creates a black void on some notched devices or resizes layout.
            // Let's keep it visible but transparent for "Immersive" feel without layout shifts
            if (showControls) {
              StatusBar.show()
            } else {
              // Optional: Hide status bar for full immersion if requested, 
              // BUT user complaint was about color. Keeping it visible + transparent is safer for "matching theme".
              // Let's try only hiding if user explicitly wanted full screen, but for now 
              // keeping it visible resolves the "color mismatch" issue best (it will just be content).
              // If we do hide it: StatusBar.hide()
              // Let's stick to matching theme logic:
              StatusBar.show()
            }

          } catch (e) {
            console.error('StatusBar error:', e)
          }
        }
      })
    })
  }, [showControls, backgroundColor])

  // Revert theme-color to default on unmount
  useEffect(() => {
    return () => {
      const themeColorMeta = document.querySelector('meta[name="theme-color"]')
      const isDark = document.documentElement.classList.contains('dark')
      if (themeColorMeta) {
        // Default app colors: Dark -> #000000, Light -> #3A502F
        themeColorMeta.setAttribute('content', isDark ? '#000000' : '#3A502F')
      }

      // NATIVE: Restore status bar visibility and default color on exit
      import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        import('@capacitor/core').then(({ Capacitor }) => {
          if (Capacitor.isNativePlatform()) {
            try {
              StatusBar.setOverlaysWebView({ overlay: false }) // Restore overlay false
              StatusBar.show()
              StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
              StatusBar.setBackgroundColor({ color: isDark ? '#000000' : '#FFFFFF' })
            } catch (e) {
              console.error('StatusBar restore error:', e)
            }
          }
        })
      })
    }
  }, [])


  // Save reading progress
  useEffect(() => {
    if (currentBookId && currentPage) {
      console.log(`Saving progress: Book ${currentBookId}, Page ${currentPage}`)
      db.books.update(currentBookId, { lastReadPage: currentPage })
        .then(updated => {
          if (updated) console.log('Progress saved successfully')
          else console.warn('Progress save failed: Book not found')
        })
        .catch(err => console.error('Error saving progress:', err))
    }
  }, [currentBookId, currentPage])

  // Load bookmarks
  const loadBookmarks = useCallback(async () => {
    if (!bookId) return
    const allBookmarks = await getBookmarks()
    const bookBookmarks = allBookmarks.filter(b => b.bookId === parseInt(bookId))
    setBookmarks(bookBookmarks)
  }, [bookId])

  // Check if current page is bookmarked
  const checkBookmark = useCallback(() => {
    if (!bookId) return
    const isPageBookmarked = bookmarks.some(b => b.bookId === parseInt(bookId) && parseInt(b.pageId) === (previewPage ?? currentPage))
    setIsBookmarked(isPageBookmarked)
  }, [bookId, bookmarks, previewPage, currentPage])

  // Initial Data Load
  useEffect(() => {
    loadBookmarks()
  }, [bookId, loadBookmarks])

  // Bookmark Check
  useEffect(() => {
    checkBookmark()
  }, [checkBookmark, currentPage, previewPage])


  const handlePrevPage = () => {
    if (currentPage > 1) {
      navigate(`/reader/${bookId}/${currentPage - 1}`)
      // Scroll to top for EPUB books
      if (book?.format === 'epub' || book?.format === 'risale-json') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      navigate(`/reader/${bookId}/${currentPage + 1}`)
      // Scroll to top for EPUB books
      if (book?.format === 'epub' || book?.format === 'risale-json') {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }

  // Swipe gesture handlers for mobile navigation
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return

    // Don't swipe if text is selected
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) return

    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y

    // Only trigger if horizontal swipe is dominant and significant enough
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) {
        // Swipe right -> previous page
        handlePrevPage()
      } else {
        // Swipe left -> next page
        handleNextPage()
      }
    }

    touchStartRef.current = null
  }

  // Handle back navigation - go to series folder for EPUB
  const handleBackNavigation = () => {
    // If this is an EPUB from a series, navigate to library with the series filter
    if (book?.series) {
      navigate('/library', { state: { activeSeries: book.series } })
    } else {
      navigate('/library')
    }
  }

  const toggleBookmark = async () => {
    if (isBookmarked) {
      const bookmark = bookmarks.find(
        (bm) => bm.bookId === currentBookId && bm.pageId === pageId
      )
      if (bookmark?.id) {
        await deleteBookmark(bookmark.id)
        setIsBookmarked(false) // Update immediately
      }
    } else {
      await addBookmark(currentBookId, pageId!)
      setIsBookmarked(true) // Update immediately
    }
    await loadBookmarks() // Also refresh bookmarks list
  }

  const handleTextSelection = () => {
    // Use direct DOM manipulation to show menu - no React re-render!
    // This preserves native Android text selection
    showMenuDirectly()
  }


  // handleSpeak removed - TTS logic is now inline in the selection menu button

  const handleStopSpeak = () => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  // Handle view mode toggle with Arabic content check
  const handleViewModeToggle = () => {
    if (viewMode === 'pdf') {
      // Check if page contains Arabic content before switching to text mode
      if (pageText) {
        const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g
        const arabicMatches = pageText.match(arabicRegex)

        if (arabicMatches && arabicMatches.length > 10) {
          alert('Sayfada Arapça metinler olduğundan metin moduna geçemezsiniz.\n\nAyetlerin doğru görüntülenmesi için orijinal modda kalmalısınız.')
          return
        }
      }
      setViewMode('text')
    } else {
      setViewMode('pdf')
    }
  }

  const handleGoToPage = (e: React.FormEvent) => {
    e.preventDefault()
    const pageNum = parseInt(goToPageInput)
    if (pageNum >= 1 && pageNum <= totalPages) {
      navigate(`/reader/${bookId}/${pageNum}`)
      setGoToPageInput('')
    }
  }

  // Full page summarize handler
  const handleSummarizeFullPage = async () => {
    if (!pagePlainText || pageText === 'EMPTY_PAGE_MARKER') {
      showToast('Bu sayfa için metin mevcut değil', 'warning')
      return
    }

    setSummarizing(true)
    try {
      const result = await summarizeText(pagePlainText)
      if (result) {
        setSummary(result)
        setShowSummaryModal(true)
      } else {
        showToast('Özet oluşturulamadı - API ayarlarına gidin', 'error')
        // Navigate to settings after 2 seconds
        setTimeout(() => navigate('/settings?category=api'), 2000)
      }
    } catch (error) {
      showToast('Özet oluşturulamadı', 'error')
    } finally {
      setSummarizing(false)
    }
  }

  // In-book search handlers
  const handleInBookSearch = async () => {
    if (!inBookQuery.trim()) return

    setSearchingInBook(true)
    try {
      const results = await searchBooks(
        inBookQuery,
        undefined, // no limit
        0,
        [currentBookId], // only search current book
        'grouped'
      )
      setInBookResults(results)
      setCurrentResultIndex(0)

      // Navigate to first result if any
      if (results.length > 0) {
        navigate(`/reader/${bookId}/${results[0].pageNumber}?q=${encodeURIComponent(inBookQuery)}`)
      } else {
        alert('Sonuç bulunamadı')
      }
    } catch (error) {
      alert('Arama hatası')
    } finally {
      setSearchingInBook(false)
    }
  }

  const handleNextResult = () => {
    if (currentResultIndex < inBookResults.length - 1) {
      const nextIndex = currentResultIndex + 1
      setCurrentResultIndex(nextIndex)
      const result = inBookResults[nextIndex]
      navigate(`/reader/${bookId}/${result.pageNumber}?q=${encodeURIComponent(inBookQuery)}`)
    }
  }

  const handlePrevResult = () => {
    if (currentResultIndex > 0) {
      const prevIndex = currentResultIndex - 1
      setCurrentResultIndex(prevIndex)
      const result = inBookResults[prevIndex]
      navigate(`/reader/${bookId}/${result.pageNumber}?q=${encodeURIComponent(inBookQuery)}`)
    }
  }

  if (loading && !book) {
    return (
      <div className="min-h-screen bg-background dark:bg-gray-900 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="min-h-screen bg-background dark:bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto text-center py-12">
          <p className="text-red-500 mb-4">{error || 'Kitap bulunamadı'}</p>
          <Link to="/library" className="text-accent hover:underline">
            Kütüphaneye Dön
          </Link>
        </div>
      </div>
    )
  }



  const fontFamilyStyles = {
    // Serif fonts - classic book reading
    serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
    merriweather: '"Merriweather", Georgia, serif',

    // Sans-serif fonts - modern and clean
    system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    roboto: '"Roboto", system-ui, sans-serif',
    opensans: '"Open Sans", system-ui, sans-serif',
    arial: 'Arial, Helvetica, sans-serif',
    poppins: '"Poppins", system-ui, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',

    // Monospace - code and technical
    'mono': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }
  }

  const backgroundColors = {
    white: { bg: '#FFFFFF', text: '#2D3748' },
    sepia: { bg: '#F4ECD8', text: '#5C4B37' },
    dark: { bg: '#000000', text: '#E2E8F0' },
    cream: { bg: '#FFF8DC', text: '#3E3E3E' },
    islamic: { bg: '#E8F5E9', text: '#1B5E20' }
  }

  const glossarySelector = '[data-lugat-id], [data-lugat-latince-mana], [data-lugat-osmanlica-mana], [data-mehaz-id], [data-latince], [data-latince-ust-bilgi]'

  const openGlossary = (element: HTMLElement, x: number, y: number) => {
    const data = element.dataset
    const isOttoman = book?.sourceLanguage === 'osmanlica'
    const term = (isOttoman ? data.lugatOsmanlicaKelime : data.lugatLatinceKelime) ||
      element.textContent?.trim() || 'Açıklama'
    const latinWord = data.lugatLatinceKelime || data.latince
    const latinMeaning = data.lugatLatinceMana || data.latinceUstBilgi
    const meaning = isOttoman
      ? [latinWord, latinMeaning].filter(Boolean).join(' — ')
      : latinMeaning || data.latince
    const original = data.mehazMetin
    const translation = isOttoman
      ? data.mehazOsmanlicaMeal || data.mehazLatinceMeal
      : data.mehazLatinceMeal
    const source = isOttoman
      ? data.mehazOsmanlicaKaynak || data.mehazLatinceKaynak
      : data.mehazLatinceKaynak
    if (!meaning && !original && !translation && !source) return false

    setGlossaryPopup({
      term,
      meaning,
      original,
      translation,
      source,
      x,
      y,
      mobile: window.matchMedia('(max-width: 767px)').matches
    })
    return true
  }

  const findGlossaryTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement ? target.closest<HTMLElement>(glossarySelector) : null

  const handleContentClick = async (e: React.MouseEvent) => {
    const glossaryTarget = findGlossaryTarget(e.target)
    if (glossaryTarget) {
      e.preventDefault()
      e.stopPropagation()
      const rect = glossaryTarget.getBoundingClientRect()
      openGlossary(glossaryTarget, rect.left + rect.width / 2, rect.bottom + 10)
      return
    }
    if (glossaryPopup) {
      setGlossaryPopup(null)
      return
    }

    // Prevent if text selection exists or is in progress
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) {
      // Selection exists, don't interfere with native menu
      e.stopPropagation()
      return
    }

    // Also check if user is currently selecting (rangeCount > 0 with non-collapsed range)
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      e.stopPropagation()
      return
    }

    // Check if an anchor link was clicked (for EPUB internal links like footnotes/tefsir)
    const target = e.target as HTMLElement
    const anchor = target.closest('a')
    if (anchor) {
      e.preventDefault()
      const href = anchor.getAttribute('href')

      if (href) {
        // Handle internal links (starting with #)
        if (href.startsWith('#')) {
          const targetId = href.substring(1)
          // Search all pages for this anchor ID
          try {
            const allContent = await db.bookContent.where('bookId').equals(parseInt(bookId!)).toArray()
            for (const page of allContent) {
              // Check if this page contains the target anchor
              if (page.contentText.includes(`id="${targetId}"`) ||
                page.contentText.includes(`id='${targetId}'`) ||
                page.contentText.includes(`name="${targetId}"`) ||
                page.contentText.includes(`name='${targetId}'`)) {
                // Navigate to this page
                navigate(`/reader/${bookId}/${page.pageNumber}`)
                showToast(`Dipnot sayfası: ${page.pageNumber}`, 'info')
                return
              }
            }
            // If not found, show message
            showToast('Hedef sayfa bulunamadı', 'warning')
          } catch (error) {
            console.error('Error navigating to anchor:', error)
          }
          return
        }

        // Handle external links (open in new tab)
        if (href.startsWith('http')) {
          window.open(href, '_blank')
          return
        }
      }
    }

    // Normal click behavior: page turn or toggle controls
    const width = window.innerWidth
    const x = e.clientX

    // Only change page when tapping the outer 20% of screen
    if (x < width * 0.2) {
      handlePrevPage()
    } else if (x > width * 0.8) {
      handleNextPage()
    } else {
      // Toggle controls - sync the ref state
      const newShowControls = !showControls
      if (newShowControls) {
        exitFullscreenDirectly()
        hideMenuDirectly() // Also hide menu when exiting fullscreen
      } else {
        enterFullscreenDirectly()
      }
      setShowControls(newShowControls)
    }
  }

  return (
    <>
      <div
        className="min-h-screen relative bg-background dark:bg-gray-900"
        style={{ backgroundColor: backgroundColors[backgroundColor].bg }}
        onClick={handleContentClick}
      >

        {/* Immersive Heater Wrapper */}
        <div
          ref={headerRef}
          className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out safe-area-top ${showControls ? 'translate-y-0' : '-translate-y-full'}`}
          style={{ backgroundColor: backgroundColors[backgroundColor].bg, borderBottom: `1px solid ${isBookmarked ? '#F59E0B' : 'rgba(0,0,0,0.1)'}` }}
          onClick={(e) => e.stopPropagation()} // Prevent page navigation when clicking header
        >
          <div className="max-w-4xl mx-auto p-4 pb-2">
            <header className="flex flex-col gap-4">
              {/* Row 1: Back Button & Title */}
              <div className="flex items-center justify-between w-full relative">
                <button
                  onClick={(e) => { e.stopPropagation(); handleBackNavigation(); }}
                  className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg absolute left-0"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: backgroundColors[backgroundColor].text }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-xl font-bold text-center w-full px-10 truncate" style={{ color: backgroundColors[backgroundColor].text }}>
                  {book.title}
                </h2>
              </div>

              {/* Row 2: Action Icons (Centered) */}
              <div className="flex items-center justify-center gap-4">
                {/* View Mode Toggle (PDF Only) */}
                {book?.format === 'pdf' && book?.series !== 'Risale-i Nur Osmanlıca' && (
                  <button
                    onClick={handleViewModeToggle}
                    className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    style={{ color: backgroundColors[backgroundColor].text }}
                    title={viewMode === 'pdf' ? 'Metin Moduna Geç' : 'Orijinal Moda Geç'}
                  >
                    {viewMode === 'pdf' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                    )}
                  </button>
                )}

                {/* Full Page Summarize Button */}
                {viewMode === 'text' && (
                  <button
                    onClick={handleSummarizeFullPage}
                    disabled={summarizing || !pageText || pageText === 'EMPTY_PAGE_MARKER'}
                    className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                    style={{ color: backgroundColors[backgroundColor].text }}
                    title="Sayfayı Özetle"
                  >
                    {summarizing ? (
                      <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                      </svg>
                    )}
                  </button>
                )}

                {/* In-Book Search Toggle Button */}
                <button
                  onClick={() => setShowInBookSearch(!showInBookSearch)}
                  className={`p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${showInBookSearch ? 'bg-black/5 dark:bg-white/5' : ''}`}
                  style={{ color: backgroundColors[backgroundColor].text }}
                  title="Kitapta Ara"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                </button>


                {/* Reading Settings Button */}
                <button
                  onClick={() => setShowReadingSettings(true)}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition"
                  title="Okuma Ayarları"
                  style={{ color: backgroundColors[backgroundColor].text }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </button>

                {/* Bookmark Button */}
                <button
                  onClick={toggleBookmark}
                  className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition"
                  style={{ color: isBookmarked ? (backgroundColor === 'dark' ? '#FFEB3B' : '#F59E0B') : backgroundColors[backgroundColor].text }}
                >
                  <svg
                    className={`w-6 h-6 ${isBookmarked ? 'fill-current' : ''}`}
                    fill={isBookmarked ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
              </div>
            </header>
          </div>
        </div>

        {/* Search Panel - Moves down when controls hidden, or stays fixed under header? 
          Actually, search panel should probably toggle with controls or be independent.
          Let's keep it visible if active, but maybe better inside the header area? 
          For now, let's leave it in flow but apply padding top to content to account for header.
      */}

        <div className={`transition-all duration-300 ${showControls ? 'pt-[120px]' : 'pt-0'} pb-[180px]`}>
          <div className="max-w-4xl mx-auto px-4">

            {/* In-Book Search Panel */}

            {showInBookSearch && (
              <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 mb-4">
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={inBookQuery}
                    onChange={(e) => setInBookQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInBookSearch()}
                    placeholder="Kitapta ara..."
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent dark:bg-gray-700 dark:text-white"
                    disabled={searchingInBook}
                  />
                  <button
                    onClick={handleInBookSearch}
                    disabled={searchingInBook || !inBookQuery.trim()}
                    className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {searchingInBook ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      'Ara'
                    )}
                  </button>
                </div>

                {inBookResults.length > 0 && (
                  <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-600 pt-3">
                    <span className="font-medium">
                      {currentResultIndex + 1} / {inBookResults.length} sonuç
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={handlePrevResult}
                        disabled={currentResultIndex === 0}
                        className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Önceki"
                      >
                        ←
                      </button>
                      <button
                        onClick={handleNextResult}
                        disabled={currentResultIndex === inBookResults.length - 1}
                        className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Sonraki"
                      >
                        →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}


            <div className="overflow-hidden" style={{ backgroundColor: backgroundColors[backgroundColor].bg }}>
              {/* Page content - centered in fullscreen */}
              <div
                className={`p-4 md:p-8 min-h-screen flex justify-center ${!showControls ? 'items-center' : 'items-start'} cursor-pointer`}
                onMouseUp={handleTextSelection}
                onTouchStart={handleTouchStart}
                onTouchEnd={(e) => { handleTextSelection(); handleTouchEnd(e); }}
                onClick={handleContentClick}
                onDragStart={(e) => e.preventDefault()}
                style={{
                  backgroundColor: backgroundColors[backgroundColor].bg,
                  // Padding for proper spacing
                  paddingTop: showControls ? '140px' : '40px',
                  paddingBottom: showAIMenu ? '160px' : (showControls ? '120px' : '40px')
                }}
              >
                {book?.format === 'pdf' && book.fileBlob && (viewMode === 'pdf' || pageText.includes('EMPTY_PAGE_MARKER')) ? (
                  <div className="relative w-full max-w-4xl overflow-auto">
                    <canvas
                      ref={canvasRef}
                      className="shadow-sm mx-auto"
                      style={{ maxWidth: '100%', height: 'auto' }}
                    />
                  </div>
                ) : (
                  <>
                    <div
                      className={`reader-content break-words ${book.format === 'risale-json'
                        ? `risale-source risale-${book.sourceLanguage || 'latince'}`
                        : 'leading-loose [&_p]:indent-8'}`}
                      onMouseOver={(event) => {
                        if (!window.matchMedia('(hover: hover)').matches) return
                        const target = findGlossaryTarget(event.target)
                        if (target) openGlossary(target, event.clientX + 12, event.clientY + 12)
                      }}
                      onMouseOut={(event) => {
                        const current = findGlossaryTarget(event.target)
                        const next = findGlossaryTarget(event.relatedTarget)
                        if (current && current !== next && !glossaryPopup?.mobile) setGlossaryPopup(null)
                      }}
                      onFocus={(event) => {
                        const target = findGlossaryTarget(event.target)
                        if (target) {
                          const rect = target.getBoundingClientRect()
                          openGlossary(target, rect.left + rect.width / 2, rect.bottom + 10)
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        const target = findGlossaryTarget(event.target)
                        if (target) {
                          event.preventDefault()
                          const rect = target.getBoundingClientRect()
                          openGlossary(target, rect.left + rect.width / 2, rect.bottom + 10)
                        }
                      }}
                      style={{
                        fontSize: `${fontSize}px`,
                        lineHeight: lineHeight,
                        textAlign: book.format === 'risale-json' ? undefined : textAlign,
                        hyphens: book.format === 'risale-json' ? 'none' : (hyphens ? 'auto' : 'none'),
                        wordSpacing: book.format === 'risale-json' ? undefined : `${letterSpacing}em`,
                        letterSpacing: book.format === 'risale-json' ? undefined : `${letterSpacing}em`,
                        fontWeight: book.format === 'risale-json' ? undefined : fontWeight,
                        color: backgroundColors[backgroundColor].text,
                        fontFamily: book.format === 'risale-json' ? undefined : (
                          typeof fontFamilyStyles[fontFamily] === 'string'
                            ? fontFamilyStyles[fontFamily] as string
                            : (fontFamilyStyles[fontFamily] as any).fontFamily
                        ),

                        // Margins
                        paddingLeft: `${marginLeft}px`,
                        paddingRight: `${marginRight}px`,
                      }}
                      dangerouslySetInnerHTML={{
                        __html: highlightText(
                          pageText,
                          searchParams.get('q')?.split(',').map(k => k.trim()).filter(Boolean) || []
                        )
                      }}
                    />
                    {/* Dynamic Style for Paragraph Spacing */}
                    <style>{`
                  .reader-content:not(.risale-source) p {
                    margin-bottom: ${paragraphSpacing}px !important;
                  }
                  .reader-content [data-lugat-latince-mana],
                  .reader-content [data-lugat-osmanlica-mana],
                  .reader-content [data-lugat-id],
                  .reader-content [data-mehaz-id],
                  .reader-content [data-latince],
                  .reader-content [data-latince-ust-bilgi] {
                    cursor: help;
                    border-bottom: 1px dotted currentColor;
                    border-radius: 3px;
                  }
                  .reader-content [data-lugat-latince-mana]:hover,
                  .reader-content [data-lugat-latince-mana]:focus,
                  .reader-content [data-lugat-osmanlica-mana]:hover,
                  .reader-content [data-lugat-osmanlica-mana]:focus,
                  .reader-content [data-mehaz-id]:hover,
                  .reader-content [data-mehaz-id]:focus {
                    background: rgba(182, 201, 80, 0.2);
                    outline: none;
                  }
                `}</style>
                  </>
                )}
              </div>
            </div>

            {glossaryPopup && (
              <>
              {glossaryPopup.mobile && (
                <div
                  className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-[1px]"
                  aria-hidden="true"
                  onClick={() => setGlossaryPopup(null)}
                />
              )}
              <div
                className={glossaryPopup.mobile
                  ? 'fixed inset-x-0 bottom-0 z-[80] max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-800 px-5 pt-5 pb-[calc(1.25rem+var(--safe-area-bottom))] shadow-2xl border-t border-gray-200 dark:border-gray-700'
                  : 'fixed z-[80] w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white dark:bg-gray-800 p-4 shadow-2xl border border-gray-200 dark:border-gray-700'}
                style={glossaryPopup.mobile ? undefined : {
                  left: Math.min(Math.max(16, glossaryPopup.x - 160), window.innerWidth - 336),
                  top: Math.min(glossaryPopup.y, window.innerHeight - 260)
                }}
                role="dialog"
                aria-label={`${glossaryPopup.term} açıklaması`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{glossaryPopup.term}</h3>
                    {glossaryPopup.meaning && <p className="mt-1 text-gray-700 dark:text-gray-200">{glossaryPopup.meaning}</p>}
                  </div>
                  <button
                    className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    onClick={() => setGlossaryPopup(null)}
                    aria-label="Açıklamayı kapat"
                  >
                    ✕
                  </button>
                </div>
                {glossaryPopup.original && (
                  <p className="mt-3 text-lg text-right leading-loose text-gray-900 dark:text-white" dir="rtl">
                    {glossaryPopup.original}
                  </p>
                )}
                {glossaryPopup.translation && (
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">{glossaryPopup.translation}</p>
                )}
                {glossaryPopup.source && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{glossaryPopup.source}</p>
                )}
              </div>
              </>
            )}

            {/* Reading Settings Popup */}
            {showReadingSettings && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowReadingSettings(false)}>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-semibold text-secondary dark:text-white">Görsel Seçenekler</h3>
                    <button onClick={() => setShowReadingSettings(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Font Settings Group */}
                  <div className="mb-6 space-y-4">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white border-b dark:border-gray-700 pb-1">Yazı Ayarları</h4>

                    {/* Font Size */}
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-700 dark:text-white">Boyut: {fontSize}</label>
                      <input
                        type="range"
                        min="12"
                        max="40"
                        value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                        className="w-32 accent-accent"
                      />
                    </div>

                    {/* Font Weight */}
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-700 dark:text-white">Kalınlık: {fontWeight}</label>
                      <div className="flex gap-2">
                        <button onClick={() => setFontWeight(Math.max(100, fontWeight - 100))} className="px-2 py-1 bg-gray-200 rounded">-</button>
                        <span className="w-8 text-center">{fontWeight}</span>
                        <button onClick={() => setFontWeight(Math.min(900, fontWeight + 100))} className="px-2 py-1 bg-gray-200 rounded">+</button>
                      </div>
                    </div>
                  </div>

                  {/* Spacing Settings Group */}
                  <div className="mb-6 space-y-4">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white border-b dark:border-gray-700 pb-1">Aralıklar</h4>

                    {/* Line Height */}
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-700 dark:text-white">Satır Aralığı: {lineHeight}</label>
                      <input
                        type="range"
                        min="1.0"
                        max="3.0"
                        step="0.1"
                        value={lineHeight}
                        onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                        className="w-32 accent-accent"
                      />
                    </div>

                    {/* Paragraph Spacing */}
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-700 dark:text-white">Paragraf Aralığı: {paragraphSpacing}</label>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={paragraphSpacing}
                        onChange={(e) => setParagraphSpacing(parseInt(e.target.value))}
                        className="w-32 accent-accent"
                      />
                    </div>

                    {/* Letter Spacing */}
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-gray-700 dark:text-white">Harf Aralığı: {letterSpacing}</label>
                      <input
                        type="range"
                        min="-0.1"
                        max="0.5"
                        step="0.01"
                        value={letterSpacing}
                        onChange={(e) => setLetterSpacing(parseFloat(e.target.value))}
                        className="w-32 accent-accent"
                      />
                    </div>
                  </div>

                  {/* Layout Settings Group */}
                  <div className="mb-6 space-y-4">
                    <h4 className="text-sm font-bold text-gray-900 border-b pb-1">Düzen</h4>

                    {/* Margins */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Sol Boşluk</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={marginLeft}
                          onChange={(e) => setMarginLeft(parseInt(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Sağ Boşluk</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={marginRight}
                          onChange={(e) => setMarginRight(parseInt(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Üst Boşluk</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={marginTop}
                          onChange={(e) => setMarginTop(parseInt(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Alt Boşluk</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={marginBottom}
                          onChange={(e) => setMarginBottom(parseInt(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Alignment & Hyphens */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">İki Yana Yasla</span>
                      <button
                        onClick={() => setTextAlign(textAlign === 'justify' ? 'left' : 'justify')}
                        className={`w-10 h-6 rounded-full transition-colors relative ${textAlign === 'justify' ? 'bg-accent' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${textAlign === 'justify' ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">Heceleme</span>
                      <button
                        onClick={() => setHyphens(!hyphens)}
                        className={`w-10 h-6 rounded-full transition-colors relative ${hyphens ? 'bg-accent' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${hyphens ? 'left-5' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Font Family */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Yazı Tipi</label>

                    {/* Serif Fonts */}
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-semibold">SERIF (Klasik)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setFontFamily('serif')}
                          className={`px-3 py-2 rounded border text-sm ${fontFamily === 'serif' ? 'border-accent bg-blue-50 text-accent' : 'border-gray-200 dark:border-gray-600 dark:text-gray-300'}`}
                          style={{ fontFamily: fontFamilyStyles.serif }}
                        >
                          Georgia
                        </button>
                        <button
                          onClick={() => setFontFamily('merriweather')}
                          className={`px-3 py-2 rounded-lg border-2 transition text-sm ${fontFamily === 'merriweather'
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-300 hover:border-accent dark:border-gray-600 dark:text-gray-300'
                            }`}
                          style={{ fontFamily: fontFamilyStyles.merriweather }}
                        >
                          Merriweather
                        </button>
                      </div>
                    </div>

                    {/* Sans-Serif Fonts */}
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-semibold">SANS-SERIF (Modern)</p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setFontFamily('system')}
                          className={`px-3 py-2 rounded-lg border-2 transition text-sm ${fontFamily === 'system'
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-300 hover:border-accent dark:border-gray-600 dark:text-gray-300'
                            }`}
                          style={{ fontFamily: fontFamilyStyles.system }}
                        >
                          System UI
                        </button>
                        <button
                          onClick={() => setFontFamily('roboto')}
                          className={`px-3 py-2 rounded-lg border-2 transition text-sm ${fontFamily === 'roboto'
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-300 hover:border-accent dark:border-gray-600 dark:text-gray-300'
                            }`}
                          style={{ fontFamily: fontFamilyStyles.roboto }}
                        >
                          Roboto
                        </button>
                        <button
                          onClick={() => setFontFamily('opensans')}
                          className={`px-3 py-2 rounded-lg border-2 transition text-sm ${fontFamily === 'opensans'
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-300 hover:border-accent dark:border-gray-600 dark:text-gray-300'
                            }`}
                          style={{ fontFamily: fontFamilyStyles.opensans }}
                        >
                          Open Sans
                        </button>
                        <button
                          onClick={() => setFontFamily('poppins')}
                          className={`px-3 py-2 rounded-lg border-2 transition text-sm ${fontFamily === 'poppins'
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-300 hover:border-accent dark:border-gray-600 dark:text-gray-300'
                            }`}
                          style={{ fontFamily: fontFamilyStyles.poppins }}
                        >
                          Poppins
                        </button>
                        <button
                          onClick={() => setFontFamily('arial')}
                          className={`px-3 py-2 rounded-lg border-2 transition text-sm ${fontFamily === 'arial'
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-300 hover:border-accent dark:border-gray-600 dark:text-gray-300'
                            }`}
                          style={{ fontFamily: fontFamilyStyles.arial }}
                        >
                          Arial
                        </button>
                        <button
                          onClick={() => setFontFamily('verdana')}
                          className={`px-3 py-2 rounded-lg border-2 transition text-sm ${fontFamily === 'verdana'
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-300 hover:border-accent dark:border-gray-600 dark:text-gray-300'
                            }`}
                          style={{ fontFamily: fontFamilyStyles.verdana }}
                        >
                          Verdana
                        </button>
                      </div>
                    </div>

                    {/* Monospace */}
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-semibold">MONOSPACE (Teknik)</p>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={() => setFontFamily('mono')}
                          className={`px-3 py-2 rounded-lg border-2 transition text-sm ${fontFamily === 'mono'
                            ? 'border-accent bg-accent text-white'
                            : 'border-gray-300 hover:border-accent dark:border-gray-600 dark:text-gray-300'
                            }`}
                          style={{ fontFamily: fontFamilyStyles.mono.fontFamily }}
                        >
                          Courier New
                        </button>
                      </div>
                    </div>

                    <div className="text-center pt-2 pb-2">
                      <span className="text-xs text-gray-400">v1.1.5</span>
                    </div>
                  </div>

                  {/* Background Color */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Arka Plan</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setBackgroundColor('white')
                          localStorage.setItem('theme', 'light')
                          document.documentElement.classList.remove('dark')
                        }}
                        className={`px-4 py-3 rounded-lg border-2 transition flex items-center gap-2 ${backgroundColor === 'white'
                          ? 'border-accent ring-2 ring-accent'
                          : 'border-gray-300 dark:border-gray-600 hover:border-accent'
                          }`}
                      >
                        <div className="w-6 h-6 rounded bg-white border border-gray-300" />
                        <span className="text-gray-900 dark:text-white">Beyaz</span>
                      </button>
                      <button
                        onClick={() => {
                          setBackgroundColor('sepia')
                          localStorage.setItem('theme', 'light')
                          document.documentElement.classList.remove('dark')
                        }}
                        className={`px-4 py-3 rounded-lg border-2 transition flex items-center gap-2 ${backgroundColor === 'sepia'
                          ? 'border-accent ring-2 ring-accent'
                          : 'border-gray-300 dark:border-gray-600 hover:border-accent'
                          }`}
                      >
                        <div className="w-6 h-6 rounded" style={{ backgroundColor: '#F4ECD8' }} />
                        <span className="text-gray-900 dark:text-white">Sepya</span>
                      </button>
                      <button
                        onClick={() => {
                          setBackgroundColor('cream')
                          localStorage.setItem('theme', 'light')
                          document.documentElement.classList.remove('dark')
                        }}
                        className={`px-4 py-3 rounded-lg border-2 transition flex items-center gap-2 ${backgroundColor === 'cream'
                          ? 'border-accent ring-2 ring-accent'
                          : 'border-gray-300 dark:border-gray-600 hover:border-accent'
                          }`}
                      >
                        <div className="w-6 h-6 rounded" style={{ backgroundColor: '#FFF8DC' }} />
                        <span className="text-gray-900 dark:text-white">Krem</span>
                      </button>
                      <button
                        onClick={() => {
                          setBackgroundColor('dark')
                          localStorage.setItem('theme', 'dark')
                          document.documentElement.classList.add('dark')
                        }}
                        className={`px-4 py-3 rounded-lg border-2 transition flex items-center gap-2 ${backgroundColor === 'dark'
                          ? 'border-accent ring-2 ring-accent'
                          : 'border-gray-300 dark:border-gray-600 hover:border-accent'
                          }`}
                      >
                        <div className="w-6 h-6 rounded bg-gray-800" />
                        <span className="text-gray-900 dark:text-white">Karanlık</span>
                      </button>

                      {/* Islamic Green Theme */}
                      <button
                        onClick={() => {
                          setBackgroundColor('islamic')
                          localStorage.setItem('theme', 'light')
                          document.documentElement.classList.remove('dark')
                        }}
                        className={`px-4 py-3 rounded-lg border-2 transition flex items-center gap-2 ${backgroundColor === 'islamic'
                          ? 'border-accent ring-2 ring-accent'
                          : 'border-gray-300 dark:border-gray-600 hover:border-accent'
                          }`}
                      >
                        <div className="w-6 h-6 rounded" style={{ backgroundColor: '#E8F5E9' }} />
                        <span className="text-gray-900 dark:text-white">İslam Yeşili</span>
                      </button>
                    </div>
                  </div>

                  {/* EPUB Character Limit Setting */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">EPUB Sayfa Karakter Limiti</label>
                    <div className="flex items-center gap-3 mb-2">
                      <input
                        type="number"
                        min="100"
                        max="10000"
                        step="50"
                        value={epubCharLimit}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 555
                          setEpubCharLimit(value)
                          localStorage.setItem('epub_char_limit', value.toString())
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg w-32 text-center"
                      />
                      <span className="text-sm text-gray-600">karakter/sayfa</span>
                    </div>
                    <button
                      onClick={() => setShowEpubReprocessConfirm(true)}
                      disabled={book?.format !== 'epub' || !book?.fileBlob || isReprocessing}
                      className={`w-full px-3 py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-center gap-2 ${book?.format === 'epub' && book?.fileBlob
                        ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-700 shadow-md'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                      {isReprocessing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          İşleniyor...
                        </>
                      ) : (
                        <>
                          🔄 Bu Kitabı Yeniden İşle
                        </>
                      )}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Sadece şu an okuduğunuz EPUB kitabı yeniden işler
                    </p>
                  </div>

                  <button
                    onClick={() => setShowReadingSettings(false)}
                    className="w-full px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition"
                  >
                    Tamam
                  </button>
                </div>
              </div>
            )}

            {/* AI Menu - Always in DOM, visibility controlled via ref (no React re-render) */}
            <div
              ref={aiMenuRef}
              className="fixed z-[100] shadow-2xl rounded-2xl p-4 border"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => {
                const touch = e.touches[0]
                dragStartRef.current = {
                  x: touch.clientX - menuPositionRef.current.x,
                  y: touch.clientY - menuPositionRef.current.y
                }
                isDraggingRef.current = true
              }}
              onTouchMove={(e) => {
                if (isDraggingRef.current && aiMenuRef.current) {
                  const touch = e.touches[0]
                  menuPositionRef.current = {
                    x: touch.clientX - dragStartRef.current.x,
                    y: touch.clientY - dragStartRef.current.y
                  }
                  aiMenuRef.current.style.transform = `translate(calc(-50% + ${menuPositionRef.current.x}px), ${menuPositionRef.current.y}px)`
                }
              }}
              onTouchEnd={() => {
                isDraggingRef.current = false
              }}
              style={{
                display: 'none',
                maxWidth: '360px',
                width: 'calc(100% - 32px)',
                left: '50%',
                bottom: '16px',
                transform: 'translateX(-50%)',
                backgroundColor: backgroundColors[backgroundColor].bg,
                borderColor: backgroundColor === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'
              }}
            >
              {/* Drag handle indicator */}
              <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3 cursor-grab"></div>

              {/* Action Buttons - Kopyala, Özetle, Seslendir */}
              <div className="flex gap-2">
                {/* Kopyala Button */}
                <button
                  onClick={async () => {
                    try {
                      const { Clipboard } = await import('@capacitor/clipboard')
                      await Clipboard.write({ string: selectedTextRef.current })
                      showToast('Metin kopyalandı', 'success')
                      setShowAIMenu(false)
                    } catch (e) {
                      try {
                        await navigator.clipboard.writeText(selectedTextRef.current)
                        showToast('Metin kopyalandı', 'success')
                        setShowAIMenu(false)
                      } catch (err) {
                        showToast('Kopyalama başarısız', 'error')
                      }
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1 py-3 px-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl active:scale-95 transition font-semibold text-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                  </svg>
                  <span>Kopyala</span>
                </button>

                {/* Özetle Button */}
                <button
                  onClick={async () => {
                    setSummarizing(true)
                    try {
                      const textToSummarize = selectedTextRef.current
                      const summary = await summarizeText(textToSummarize)
                      if (summary) {
                        setSummary(summary)
                        setShowAIMenu(false)
                        setShowSummaryModal(true)
                      } else {
                        showToast('Özet çıkarılamadı. API anahtarınızı kontrol edin.', 'error')
                      }
                    } catch (e) {
                      console.error(e)
                      showToast(`Hata: ${(e as any).message || 'Bilinmeyen hata'}`, 'error')
                    } finally {
                      setSummarizing(false)
                    }
                  }}
                  disabled={summarizing}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-accent hover:bg-accent/90 text-white rounded-xl active:scale-95 transition font-semibold disabled:opacity-50"
                >
                  {!summarizing ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                      </svg>
                      <span>Seçimi Özetle</span>
                    </>
                  ) : (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>İşleniyor...</span>
                    </>
                  )}
                </button>

                {/* Sesli Oku / Durdur Button */}
                <button
                  onClick={async () => {
                    if (isSpeaking) {
                      // Stop speaking using Capacitor TTS
                      try {
                        const { TextToSpeech } = await import('@capacitor-community/text-to-speech')
                        await TextToSpeech.stop()
                        setIsSpeaking(false)
                      } catch (e) {
                        // Fallback to web API
                        window.speechSynthesis.cancel()
                        setIsSpeaking(false)
                      }
                    } else {
                      // Start speaking using Capacitor TTS
                      const textToSpeak = selectedTextRef.current
                      if (textToSpeak && textToSpeak.trim()) {
                        try {
                          const { TextToSpeech } = await import('@capacitor-community/text-to-speech')
                          setIsSpeaking(true)
                          await TextToSpeech.speak({
                            text: textToSpeak,
                            lang: 'tr-TR',
                            rate: 0.9,
                            pitch: 1.0,
                            volume: 1.0,
                            category: 'playback',
                          })
                          setIsSpeaking(false)
                        } catch (e) {
                          console.error('TTS Error:', e)
                          setIsSpeaking(false)
                          // Fallback to Web Speech API for web
                          if (window.speechSynthesis) {
                            const utterance = new SpeechSynthesisUtterance(textToSpeak)
                            utterance.lang = 'tr-TR'
                            utterance.rate = 0.9
                            utterance.onstart = () => setIsSpeaking(true)
                            utterance.onend = () => setIsSpeaking(false)
                            utterance.onerror = () => setIsSpeaking(false)
                            window.speechSynthesis.speak(utterance)
                          } else {
                            showToast('Sesli okuma desteklenmiyor', 'error')
                          }
                        }
                      } else {
                        showToast('Sesli okumak için metin seçin', 'error')
                      }
                    }
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl active:scale-95 transition font-semibold ${isSpeaking
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-accent hover:bg-accent/90 text-white'
                    }`}
                >
                  {isSpeaking ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
                      </svg>
                      <span>Durdur</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                      </svg>
                      <span>Sesli Oku</span>
                    </>
                  )}
                </button>
              </div>

              {/* Close Button - Small X in corner */}
              <button
                onClick={() => {
                  if (isSpeaking) handleStopSpeak()
                  hideMenuDirectly()
                  window.getSelection()?.removeAllRanges()
                }}
                className="absolute -top-2 -right-2 w-7 h-7 bg-gray-800 hover:bg-gray-700 text-white rounded-full flex items-center justify-center shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Summary Modal */}
            {showSummaryModal && summary && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-black rounded-xl p-6 max-w-2xl w-full shadow-2xl animate-fadeIn max-h-[80vh] flex flex-col border dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">✨</span>
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">Yapay Zeka Özeti</h3>
                    </div>
                    <button
                      onClick={() => setShowSummaryModal(false)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition text-gray-700 dark:text-gray-300"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-sm leading-relaxed overflow-y-auto pr-2 custom-scrollbar text-gray-900 dark:text-white">
                    {summary.split('\n').map((line, i) => (
                      <p key={i} className="mb-2 last:mb-0">{line}</p>
                    ))}
                  </div>
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <button
                      onClick={() => setShowSummaryModal(false)}
                      className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 transition"
                    >
                      Kapat
                    </button>
                  </div>
                </div>
              </div>

            )}
          </div>
        </div>


        {/* Onboarding Guide Modal */}
        {showOnboarding && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => {
            setShowOnboarding(false)
            localStorage.setItem('reader_onboarding_seen', 'true')
          }}>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center relative overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-purple-500"></div>

              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                👋
              </div>

              <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Hoş Geldiniz!</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm leading-relaxed">
                Daha iyi bir okuma deneyimi için:
              </p>

              <div className="space-y-3 text-left mb-8">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <span className="text-xl">👆</span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">Menüleri gizlemek/göstermek için <strong>ekranın ortasına</strong> dokunun.</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <span className="text-xl">↔️</span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">Sayfa değiştirmek için <strong>kaydırın</strong> veya kenarlara dokunun.</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowOnboarding(false)
                  localStorage.setItem('reader_onboarding_seen', 'true')
                }}
                className="w-full py-3 bg-gradient-to-r from-accent to-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 active:scale-95 transition-all"
              >
                Anladım, Başla!
              </button>
            </div>
          </div>
        )}

        {/* Immersive Footer Wrapper */}
        <div
          ref={footerRef}
          className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out ${showControls && !showReadingSettings && !glossaryPopup ? 'translate-y-0' : 'translate-y-full'}`}
          style={{ backgroundColor: backgroundColor === 'dark' ? '#000000' : '#F7FAFC' }}
        >
          {/* Slider & Navigation Footer */}
          <div className="pt-4 pb-safe mb-safe border-t dark:border-gray-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            {/* Page Info & Slider */}
            <div className="mb-4 px-4">
              <div className="flex items-center justify-between text-sm text-gray-500 mb-2 font-medium">
                <span style={{ color: backgroundColor === 'dark' ? '#A0AEC0' : 'inherit' }}>
                  Sayfa {sliderValue ?? currentPage} / {totalPages}
                </span>
                <span style={{ color: backgroundColor === 'dark' ? '#A0AEC0' : 'inherit' }}>
                  %{Math.round(((sliderValue ?? currentPage) / totalPages) * 100)}
                </span>
              </div>

              <input
                type="range"
                min="1"
                max={totalPages}
                value={sliderValue ?? currentPage}
                onChange={(e) => {
                  const val = parseInt(e.target.value)
                  setSliderValue(val)
                  setPreviewPage(val) // Load content locally without changing URL
                }}
                onTouchEnd={() => {
                  if (sliderValue !== null) {
                    navigate(`/reader/${bookId}/${sliderValue}`)
                    setSliderValue(null)
                    setPreviewPage(null)
                  }
                }}
                onMouseUp={() => {
                  if (sliderValue !== null) {
                    navigate(`/reader/${bookId}/${sliderValue}`)
                    setSliderValue(null)
                    setPreviewPage(null)
                  }
                }}
                className="w-full h-4 rounded-lg appearance-none cursor-pointer bg-gray-200 dark:bg-gray-700 accent-accent slider-thumb-centered"
                style={{
                  backgroundImage: `linear-gradient(to right, var(--color-accent, #3B82F6) ${((sliderValue ?? currentPage) / totalPages) * 100}%, ${backgroundColor === 'dark' ? '#4A5568' : '#E2E8F0'} ${((sliderValue ?? currentPage) / totalPages) * 100}%)`
                }}
              />

              {/* Custom Slider Styles for Centered Thumb */}
              <style>{`
              .slider-thumb-centered::-webkit-slider-thumb {
                -webkit-appearance: none;
                height: 16px;
                width: 16px;
                border-radius: 50%;
                background: var(--color-accent, #3B82F6);
                cursor: pointer;
                margin-top: -6px; /* Centers thumb on the track */
                box-shadow: 0 0 0 2px white; /* Optional: adds a nice border */
              }
              .slider-thumb-centered::-webkit-slider-runnable-track {
                width: 100%;
                height: 4px;
                cursor: pointer;
                background: transparent; /* Maintained by inline style gradient */
                border-radius: 2px;
              }
            `}</style>
            </div>

            {/* Navigation Buttons Row - 3 Column Grid */}
            <div className="grid grid-cols-3 gap-2 px-3 pb-2">

              {/* Previous Button */}
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                className="w-full px-2 py-3 bg-secondary text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                <span className="hidden sm:inline">Önceki</span>
              </button>

              {/* Go To Page Form (Centered) */}
              <form
                onSubmit={handleGoToPage}
                className="w-full flex items-center justify-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-full border border-gray-200 dark:border-gray-700"
              >
                <input
                  type="number"
                  value={goToPageInput}
                  onChange={(e) => setGoToPageInput(e.target.value)}
                  placeholder="Sayfa No"
                  className="flex-1 bg-transparent text-center text-sm focus:outline-none dark:text-white min-w-0"
                  min={1}
                  max={totalPages}
                />
                <button
                  type="submit"
                  className="p-1.5 px-3 bg-white dark:bg-gray-700 rounded-full text-xs font-semibold shadow-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition"
                >
                  Git
                </button>
              </form>

              {/* Next Button */}
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="w-full px-2 py-3 bg-secondary text-white rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
              >
                <span className="hidden sm:inline">Sonraki</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* EPUB Reprocess Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showEpubReprocessConfirm}
        title="📚 Kitabı Yeniden İşle"
        message={`"${book?.title}" kitabı yeni karakter limitiyle yeniden işlenecek. Bu işlem birkaç saniye sürebilir.`}
        type="info"
        confirmLabel="Evet, İşle"
        cancelLabel="Vazgeç"
        onConfirm={async () => {
          setShowEpubReprocessConfirm(false)
          if (!book?.fileBlob || !book?.id) return

          setIsReprocessing(true)
          try {
            const { processEPUB } = await import('../lib/fileProcessor')

            // Delete old content
            await db.bookContent.where('bookId').equals(book.id).delete()

            // Convert Blob to File for processing
            const file = new File([book.fileBlob], book.title + '.epub', { type: 'application/epub+zip' })

            // Re-process with new character limit
            const result = await processEPUB(file)

            // Transform pages to BookContent format
            const bookContent = result.pages.map(page => ({
              bookId: book.id!,
              pageNumber: page.pageNumber,
              contentText: page.text
            }))

            // Add new content
            await db.bookContent.bulkAdd(bookContent)

            showToast(`${result.pages.length} sayfa olarak yeniden işlendi!`, 'success')

            // Reload to reflect changes
            setTimeout(() => window.location.reload(), 1000)
          } catch (error) {
            console.error('Re-import error:', error)
            showToast('İşleme hatası: ' + error, 'error')
          } finally {
            setIsReprocessing(false)
          }
        }}
        onCancel={() => setShowEpubReprocessConfirm(false)}
      />
    </>
  )
}
