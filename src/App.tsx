import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Library from './pages/Library'
import Bookmarks from './pages/Bookmarks'
import Settings from './pages/Settings'
import SearchResults from './pages/SearchResults'
import Reader from './pages/Reader'
import Import from './pages/Import'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/search-results" element={<SearchResults />} />
        <Route path="/reader/:bookId/:pageId" element={<Reader />} />
        <Route path="/import" element={<Import />} />
      </Routes>
    </Router>
  )
}

export default App
