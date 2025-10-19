# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

### Development
```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + production build
npm run preview      # Preview production build locally
npm run lint         # Run ESLint
```

### TypeScript
```bash
npx tsc -b           # Type check without building
npx tsc -b --watch   # Type check in watch mode
```

### Git Workflow
```bash
# After completing each major feature or phase:
git add .
git commit -m "descriptive message about changes"
git push origin main

# IMPORTANT: Commit after each TODO completion
# Use descriptive commit messages that reference the feature/phase
```

**Commit Message Convention:**
- `feat: description` - New feature
- `fix: description` - Bug fix
- `refactor: description` - Code refactoring
- `docs: description` - Documentation changes
- `style: description` - UI/styling changes
- `chore: description` - Maintenance tasks

## Environment Setup

**No environment variables required!** This is a fully offline-first PWA.

Optional (for AI features only):
- Store OpenRouter API key in localStorage via Settings page
- No `.env` file needed

## Architecture Overview

### Tech Stack
- **Build Tool**: Vite (using rolldown-vite override for performance)
- **Framework**: React 19 with TypeScript (strict mode)
- **Routing**: React Router DOM v7
- **Styling**: Tailwind CSS v4
- **State**: Zustand (for state management - to be implemented)
- **Local Database**: IndexedDB via Dexie.js (offline-first storage)
- **File Processing**: PDF.js for PDFs, EPUB.js for EPUBs
- **AI Integration**: OpenRouter API (GPT-4o), local LLM support (Llama models)
- **PWA**: vite-plugin-pwa with Workbox for offline support

**Note:** No backend server required. All data stored locally in browser's IndexedDB.

### Application Flow
1. **Entry**: `main.tsx` → `App.tsx` (router setup)
2. **Pages**: All pages in `src/pages/` directory
3. **Routing Structure**:
   - `/` - Ana Arama Ekranı (home search interface)
   - `/library` - Kütüphane (book collection with cover, title, author)
   - `/import` - Kitap İçe Aktar (file upload with drag & drop for PDF/EPUB)
   - `/reader/:bookId/:pageId` - Kitap Okuyucu (book reader with page navigation)
   - `/search-results` - Arama Sonuçları (multi-book search with infinite scroll)
   - `/bookmarks` - Yıldızlı Sayfalar (starred pages collection)
   - `/settings` - Ayarlar (API keys, theme, local LLM configuration)
   - `/menu` - Sol Menü (slide-out hamburger menu)

### IndexedDB Schema (via Dexie.js)
Location: `src/lib/db.ts`

**Tables:**
- `books` - Book metadata and file blobs
  - id (auto-increment)
  - title (string)
  - author (string | null)
  - coverBlob (Blob | null) - Cover image as blob
  - fileBlob (Blob) - PDF/EPUB file as blob
  - format ('pdf' | 'epub')
  - createdAt (Date)

- `bookmarks` - Starred pages
  - id (auto-increment)
  - bookId (number, foreign key to books)
  - pageId (string)
  - createdAt (Date)

- `bookContent` - Searchable text content for FTS
  - id (auto-increment)
  - bookId (number, foreign key to books)
  - pageNumber (number)
  - contentText (string) - Extracted text for search
  - indexedAt (Date)

**CRUD Functions:**
All exported from `src/lib/db.ts`:
- `addBook()`, `getBooks()`, `getBook()`, `updateBook()`, `deleteBook()`
- `addBookmark()`, `getBookmarks()`, `deleteBookmark()`
- `indexBookContent()` - Index text for search
- `checkStorageQuota()` - Check available storage

### Key Design Patterns
- **Page-based architecture**: Each route is a standalone page component in `src/pages/`
- **No shared layout component yet**: Each page implements its own header/navigation
- **Turkish language UI**: All user-facing text is in Turkish (primary audience)
- **Character encoding**: UTF-8 support with specific attention to Turkish and Arabic characters
- **RTL support**: Right-to-left text rendering for Arabic content
- **Mobile-first responsive design**: Primary target is mobile devices

### Search Architecture
- **Multi-keyword search**: Comma-separated search terms ("virgülle ayrılmış")
- **Full-Text Search (FTS)**: Implemented in Supabase with Turkish/Arabic character support
- **Ajax-based instant search**: Real-time results without page reload
- **Highlight**: Yellow (#FBBF24) highlighting of search terms in results
- **Result display**: First 5 results on home, infinite scroll on `/search-results`

### AI Features
- **Text summarization**: Via OpenRouter API using GPT-4o model
- **Text-to-speech**: Browser's native Web Speech API
- **Bulk summarization**: "Toplu Özetle" button on search results page
- **Offline AI**: Local LLM (Llama) support for offline usage
- **API security**: OpenRouter API key stored securely (localStorage or encrypted in Supabase)

### PWA Configuration
- Service worker configured for auto-update
- Caches Supabase API calls (NetworkFirst, 24h expiration)
- Offline-first strategy for static assets
- PWA File System Access API for local file management
- Theme colors: Primary `#3182CE` (blue), Background `#F7FAFC`
- Dark mode support configurable in settings

### Development Phases
**Phase 1**: ✅ Project setup & basic infrastructure (COMPLETED)
**Phase 2**: 🔄 Book management & library (IN PROGRESS - Supabase connected)
**Phase 3**: Book reader & bookmarking system
**Phase 4**: Advanced search functionality with FTS
**Phase 5**: AI integration (OpenRouter, TTS, local LLM)
**Phase 6**: Design improvements & PWA final touches

## Storage Limitations

### Browser Storage Quotas
- Modern browsers typically provide 50GB+ of IndexedDB storage
- Chrome/Edge: Usually 60% of free disk space
- Firefox: Up to 50% of free disk space  
- Safari: Up to 1GB (can request more)

### Best Practices
- Check storage before importing large files: `checkStorageQuota()`
- Warn users when approaching 80% of quota
- Consider compressing large PDFs before storage
- Typical book sizes:
  - Text-heavy EPUB: 1-5MB
  - Image-heavy PDF: 10-50MB
  - Large textbooks: 50-200MB

## User Flow (11 Steps)

1. **Uygulama Açılışı**: User sees main search screen
2. **İlk Kurulum**: Navigate to Library → Import books
3. **API Konfigürasyonu**: Settings → Enter OpenRouter API key
4. **Arama İşlemi**: Home screen → Enter comma-separated search terms
5. **Sonuç İnceleme**: View first 5 results → "Daha Fazla" for full list
6. **Sayfa Erişimi**: Click "Sayfaya Git" → Open reader mode
7. **İşaretleme**: Star favorite pages in reader
8. **AI Özellikler**: Select text → Summarize or read aloud
9. **Toplu İşlemler**: "Toplu Özetle" on search results page
10. **Bookmark Yönetimi**: Access starred pages from bookmarks section
11. **Çevrimdışı Kullanım**: Download local LLM for offline AI features

## Code Style
- ESLint with TypeScript strict rules
- React Hooks and React Refresh plugins enabled
- Tailwind utility classes for styling
- Functional components with TypeScript
- File naming: PascalCase for components (e.g., `Home.tsx`)
- Turkish variable/function names acceptable for Turkish-specific logic
