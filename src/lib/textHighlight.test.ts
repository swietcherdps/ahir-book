import { describe, expect, it } from 'vitest'
import { highlightHtml, readerHighlightTerms } from './textHighlight'

const highlight = (html: string, terms: string[]) => highlightHtml(html, terms, () => '#FBBF24')
describe('notification text highlighting', () => {
  it('highlights a quote across glossary elements and preserves their attributes', () => {
    const result = highlight('<p>İnsan <span data-lugat-id="1" data-lugat-latince-mana="anlam">iman</span> ile yaşar.</p>', ['İnsan iman ile yaşar.'])
    const root = document.createElement('div'); root.innerHTML = result
    expect(Array.from(root.querySelectorAll('mark')).map(mark => mark.textContent).join('')).toBe('İnsan iman ile yaşar.')
    expect(root.querySelector('[data-lugat-id="1"]')?.getAttribute('data-lugat-latince-mana')).toBe('anlam')
  })
  it('matches whitespace, Turkish capitals, smart quotes and circumflex differences', () => {
    expect(highlight('<p>ÎMÂN\n  insanın “hayatı”dır.</p>', ['iman insanın "hayatı"dır.'])).toContain('<mark')
  })
  it('treats regex symbols literally and never highlights HTML attributes', () => {
    const root = document.createElement('div')
    root.innerHTML = highlight('<p title="a+b">a+b [iman]</p>', ['a+b', '[iman]'])
    expect(root.querySelector('p')?.getAttribute('title')).toBe('a+b')
    expect(root.querySelectorAll('mark')).toHaveLength(2)
  })
  it('keeps comma-containing legacy notification sentences intact', () => {
    const quote = 'İman, insanı insan eder.'
    expect(readerHighlightTerms(new URLSearchParams({ q: quote }), quote)).toEqual([quote])
    expect(readerHighlightTerms(new URLSearchParams({ highlight: quote }), '')).toEqual([quote])
    expect(readerHighlightTerms(new URLSearchParams({ q: 'iman, hayat' }), 'Başka metin')).toEqual(['iman', 'hayat'])
  })
  it('sanitizes script and event handlers before highlighting', () => {
    expect(highlight('<script>alert(1)</script><p onclick="alert(1)">iman</p>', ['iman'])).not.toMatch(/script|onclick/)
  })
})
