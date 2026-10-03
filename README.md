# Ahir Book

A Progressive Web Application (PWA) for managing and searching your personal PDF and EPUB library with AI-powered features.

## Overview

Ahir Book allows users to easily import and organize PDF and EPUB books from their device, offering advanced search capabilities with support for Turkish and Arabic characters. Users can perform multi-keyword searches, view results in pages, and benefit from AI-powered summarization and text-to-speech features.

## Features

### Book Management
- Import PDF and EPUB files
- Turkish and Arabic character support
- Personal library organization
- Automatic file metadata recognition

### Advanced Search
- Ajax-based instant search
- Multi-keyword search (comma-separated)
- Simultaneous search across all books
- Infinite scroll results
- Yellow highlighting of search terms

### Bookmarking & Navigation
- Page starring system
- "Go to page" feature
- Book reader mode transition
- Easy back navigation

### AI Integration
- Text summarization via OpenRouter API
- Text-to-speech functionality
- Bulk result summarization
- Local LLM support (offline usage)
- API configuration in settings

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v3, Vite
- **Local Storage:** IndexedDB via Dexie.js (offline-first)
- **AI Integration:** OpenRouter API, OpenAI GPT-4o
- **File Processing:** PDF.js, EPUB.js
- **State Management:** Zustand
- **Routing:** React Router DOM v7
- **PWA:** Vite Plugin PWA with Workbox

**Note:** No backend server required. All data is stored locally in the browser.

## Getting Started

### Remote content catalog

Risale-i Nur Latin packages are not bundled with the application. The app reads a
small catalog and downloads only the book selected by the user. Override the
catalog during local development with `VITE_CONTENT_CATALOG_URL`; see
`.env.example`. The content builder lives in the separate `ahir-book-content`
repository and public publishing is gated on written redistribution permission.

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/swietcherdps/ahir-book.git
cd ahir-book
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

**No environment variables or backend setup required!** The app runs completely offline.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Project Structure

```
ahir-book/
├── src/
│   ├── pages/          # Page components
│   │   ├── Home.tsx
│   │   ├── Library.tsx
│   │   ├── Bookmarks.tsx
│   │   ├── Settings.tsx
│   │   ├── SearchResults.tsx
│   │   ├── Reader.tsx
│   │   └── Import.tsx
│   ├── App.tsx         # Main app with routing
│   ├── main.tsx        # Entry point
│   └── index.css       # Global styles
├── public/             # Static assets
├── vite.config.ts      # Vite configuration
├── tailwind.config.js  # Tailwind CSS configuration
└── package.json
```

## Routes

- `/` - Main search screen
- `/library` - Book library
- `/bookmarks` - Starred pages
- `/settings` - App settings
- `/search-results` - Search results with infinite scroll
- `/reader/:bookId/:pageId` - Book reader
- `/import` - Book import screen

## Design

### Color Palette
- Primary: `#2D3748` (Dark Gray)
- Secondary: `#4A5568` (Medium Gray)
- Accent: `#3182CE` (Blue)
- Background: `#F7FAFC` (Light Gray)
- Highlight: `#FBBF24` (Yellow)

### Typography
- Headings: Inter font family
- Body Text: System UI, -apple-system, sans-serif

## Development Status

1. **Phase 1:** Project Setup & Basic Infrastructure ✅
2. **Phase 2:** Book Management & Library ✅
3. **Phase 3:** Book Reader & Bookmarking 🔄 (In Progress)
4. **Phase 4:** Advanced Search Functionality ✅
5. **Phase 5:** AI Integration ⏳ (Planned)
6. **Phase 6:** Design Improvements & PWA ⏳ (Planned)

## Features Implemented

✅ PDF/EPUB file import with drag & drop
✅ Local storage using IndexedDB
✅ Book library with cover images
✅ Full-text search with Turkish/Arabic support
✅ Multi-keyword comma-separated search
✅ Search result highlighting
✅ Responsive mobile-first design
✅ PWA offline support

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
