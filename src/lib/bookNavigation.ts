import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { BookSection } from './db'

export const resolvePdfPage = async (pdf: PDFDocumentProxy, destination: unknown): Promise<number | null> => {
  const explicit = typeof destination === 'string' ? await pdf.getDestination(destination) : destination
  if (!Array.isArray(explicit) || !explicit.length) return null
  const ref = explicit[0]
  const index = typeof ref === 'number' ? ref : await pdf.getPageIndex(ref)
  return Number.isInteger(index) && index >= 0 && index < pdf.numPages ? index + 1 : null
}

export const extractPdfSections = async (pdf: PDFDocumentProxy): Promise<BookSection[]> => {
  const sections: BookSection[] = []
  type OutlineItem = { title: string; dest: unknown; items?: OutlineItem[] }
  const visit = async (items: OutlineItem[], level: number) => {
    for (const item of items) {
      try {
        const pageNumber = await resolvePdfPage(pdf, item.dest)
        if (pageNumber) sections.push({ title: item.title, pageNumber, level })
      } catch { /* Keep other valid entries when a source destination is broken. */ }
      if (item.items?.length) await visit(item.items, level + 1)
    }
  }
  await visit((await pdf.getOutline()) || [], 0)
  if (sections.length) return sections

  // Some books provide a linked contents page without a PDF outline.
  for (let number = 1; number <= Math.min(pdf.numPages, 40); number++) {
    const page = await pdf.getPage(number)
    const links = (await page.getAnnotations()).filter(link => link.dest && link.rect)
    if (!links.length) continue
    const text = await page.getTextContent()
    for (const link of links) {
      try {
        const pageNumber = await resolvePdfPage(pdf, link.dest)
        if (!pageNumber) continue
        const [x1, y1, x2, y2] = link.rect
        const title = text.items.filter(item => 'str' in item &&
          item.transform[4] + item.width >= x1 - 3 && item.transform[4] <= x2 + 3 &&
          item.transform[5] >= y1 - item.height - 3 && item.transform[5] <= y2 + 3
        ).map(item => 'str' in item ? item.str : '').join(' ').trim()
        if (!title || /^\d+$/.test(title)) continue
        if (!sections.some(section => section.title === title && section.pageNumber === pageNumber)) {
          sections.push({ title, pageNumber, level: 0 })
        }
      } catch { /* Ignore unresolved links. */ }
    }
  }
  return sections
}
