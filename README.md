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

- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Backend:** Supabase (authentication, database, storage, real-time)
- **AI Integration:** OpenRouter API, OpenAI GPT-4o
- **File Processing:** PDF.js, EPUB.js
- **State Management:** Zustand
- **Routing:** React Router DOM
- **PWA:** Vite Plugin PWA

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ahir-book
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start the development server:
```bash
npm run dev
```

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

## Development Phases

1. **Phase 1:** Project Setup & Basic Infrastructure ✅
2. **Phase 2:** Book Management & Library
3. **Phase 3:** Book Reader & Bookmarking
4. **Phase 4:** Advanced Search Functionality
5. **Phase 5:** AI Integration
6. **Phase 6:** Design Improvements & PWA Final Touches

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
