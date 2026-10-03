import { describe, expect, it, vi } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { extractPdfSections, resolvePdfPage } from './bookNavigation'

const document = (overrides = {}) => ({ numPages: 100, getDestination: vi.fn().mockResolvedValue([{ num: 4 }]), getPageIndex: vi.fn().mockResolvedValue(8), getOutline: vi.fn().mockResolvedValue([]), ...overrides }) as unknown as PDFDocumentProxy

describe('PDF book navigation', () => {
  it('resolves named destinations and zero-based numeric destinations', async () => {
    expect(await resolvePdfPage(document(), 'chapter')).toBe(9)
    expect(await resolvePdfPage(document(), [0])).toBe(1)
    expect(await resolvePdfPage(document(), [101])).toBeNull()
    expect(await resolvePdfPage(document(), null)).toBeNull()
  })
  it('preserves nested outline levels and retains valid children of invalid entries', async () => {
    const pdf = document({ getOutline: vi.fn().mockResolvedValue([{ title: 'Birinci bölüm', dest: [2], items: [{ title: 'Alt bölüm', dest: [3] }] }, { title: 'Başlık', dest: null, items: [{ title: 'İkinci bölüm', dest: [10] }] }]) })
    expect(await extractPdfSections(pdf)).toEqual([{ title: 'Birinci bölüm', pageNumber: 3, level: 0 }, { title: 'Alt bölüm', pageNumber: 4, level: 1 }, { title: 'İkinci bölüm', pageNumber: 11, level: 1 }])
  })
  it('reads linked contents pages when there is no outline', async () => {
    const pdf = document({ numPages: 1, getPage: vi.fn().mockResolvedValue({ getAnnotations: vi.fn().mockResolvedValue([{ dest: [0], rect: [0, 0, 120, 20] }]), getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'İçindekiler', transform: [1, 0, 0, 1, 4, 10], width: 100, height: 10 }] }) }) })
    expect(await extractPdfSections(pdf)).toEqual([{ title: 'İçindekiler', pageNumber: 1, level: 0 }])
  })
})
