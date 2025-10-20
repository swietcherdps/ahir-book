import { db } from './db'

export interface SearchResult {
  id: number
  bookId: number
  bookTitle: string
  pageNumber: number
  snippet: string
  highlightedSnippet: string
}

// Turkish character normalization for case-insensitive search
export const normalizeTurkish = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/i/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
}

// Color palette for multi-keyword highlighting
const HIGHLIGHT_COLORS = [
  '#FBBF24', // yellow
  '#34D399', // green
  '#60A5FA', // blue
  '#F87171', // red
  '#A78BFA', // purple
  '#FB923C', // orange
  '#EC4899', // pink
  '#14B8A6', // teal
]

export const getHighlightColor = (index: number): string => {
  return HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length]
}

// Highlight matched terms in text with different colors per keyword
export const highlightText = (text: string, keywords: string[]): string => {
  let highlightedText = text
  
  keywords.forEach((keyword, index) => {
    const normalized = normalizeTurkish(keyword)
    const color = getHighlightColor(index)
    const regex = new RegExp(`(${normalized})`, 'gi')
    highlightedText = highlightedText.replace(
      regex, 
      `<mark style="background-color: ${color}; padding: 2px 4px; border-radius: 2px;">$1</mark>`
    )
  })
  
  return highlightedText
}

// Extract snippet with context around matched keyword (3 lines ~ 300 chars)
const extractSnippet = (text: string, keyword: string, contextLength = 300): string => {
  const normalized = normalizeTurkish(text)
  const keywordNormalized = normalizeTurkish(keyword)
  const index = normalized.indexOf(keywordNormalized)
  
  if (index === -1) return text.substring(0, contextLength) + '...'
  
  const start = Math.max(0, index - contextLength)
  const end = Math.min(text.length, index + keyword.length + contextLength)
  
  let snippet = text.substring(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'
  
  return snippet
}

// Main search function
export const searchBooks = async (
  searchQuery: string,
  limit?: number,
  offset = 0
): Promise<SearchResult[]> => {
  if (!searchQuery.trim()) return []
  
  // Split by comma and trim
  const keywords = searchQuery
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0)
  
  if (keywords.length === 0) return []
  
  try {
    // Get all book content
    const allContent = await db.bookContent.toArray()
    const results: SearchResult[] = []
    
    // Search through content
    for (const content of allContent) {
      const normalizedContent = normalizeTurkish(content.contentText)
      
      // Check if any keyword matches
      const matchedKeywords = keywords.filter(keyword => {
        const normalizedKeyword = normalizeTurkish(keyword)
        return normalizedContent.includes(normalizedKeyword)
      })
      
      if (matchedKeywords.length > 0) {
        // Get book info
        const book = await db.books.get(content.bookId)
        if (!book) continue
        
        // Extract snippet with first matched keyword
        const snippet = extractSnippet(content.contentText, matchedKeywords[0])
        const highlightedSnippet = highlightText(snippet, matchedKeywords)
        
        results.push({
          id: content.id!,
          bookId: content.bookId,
          bookTitle: book.title,
          pageNumber: content.pageNumber,
          snippet,
          highlightedSnippet
        })
      }
    }
    
    // Sort by relevance (more keyword matches = higher priority)
    results.sort((a, b) => {
      const aMatches = keywords.filter(k => 
        normalizeTurkish(a.snippet).includes(normalizeTurkish(k))
      ).length
      const bMatches = keywords.filter(k => 
        normalizeTurkish(b.snippet).includes(normalizeTurkish(k))
      ).length
      return bMatches - aMatches
    })
    
    // Apply pagination
    const paginatedResults = limit 
      ? results.slice(offset, offset + limit)
      : results.slice(offset)
    
    return paginatedResults
  } catch (error) {
    console.error('Search error:', error)
    throw error
  }
}

// Search with infinite scroll support
export const searchWithPagination = async (
  searchQuery: string,
  page = 1,
  pageSize = 10
): Promise<{ results: SearchResult[]; hasMore: boolean; total: number }> => {
  const offset = (page - 1) * pageSize
  
  // Get all results to calculate total
  const allResults = await searchBooks(searchQuery)
  const total = allResults.length
  
  // Get paginated results
  const results = allResults.slice(offset, offset + pageSize)
  const hasMore = offset + pageSize < total
  
  return { results, hasMore, total }
}
