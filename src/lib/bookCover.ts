import type { Book } from './db'
import risaleCovers from './risaleCoverCatalog.json'

export const curatedCover = (book: Pick<Book, 'title' | 'sourceKey' | 'isCloud'>): string | undefined => {
  if (!book.isCloud) return undefined
  const risale = risaleCovers.find(entry => entry.sourceKey === book.sourceKey)
  if (risale) return `${import.meta.env.BASE_URL}covers/risale-${risale.slug.replace(/-osmanlica$/, '').replace(/emirdag-lahikasi-\d+/, 'emirdag-lahikasi')}.webp`
  const key = book.sourceKey?.replace('ahmet-tunalilar:', '')
  const covers: Record<string, string> = {
    'imam_Gazali-Alemlerin_Sirri.pdf': 'alemler', 'Ayetlerin_Nuzul_Sebebi.pdf': 'ayetler',
    'imam_Gazali-Esmaul_Husna.pdf': 'esma', 'imam_Gazali-Ey_Ogul.pdf': 'ey-ogul',
    'Mevlana-Fihi_Mafih.pdf': 'fihi', 'Futuhul-Gayb.pdf': 'futuh',
    'imam_Gazali-Hidayet_Rehberi.pdf': 'hidayet', 'imam_Gazali-Hikmetler_Kitabi.pdf': 'hikmet',
    'imam_Gazali-Iki_Madnun.pdf': 'iki-madnun', 'imam_Gazali-Kimya-yi_Saadet.pdf': 'kimya',
    'ibrahim_Hakki-Marifetname.pdf': 'marifet', 'Mektubat_Tercemesi.pdf': 'mektubat',
    'imam_Gazali-Miskatul_Envar.pdf': 'miskat', 'ismail_Hakki_Bursavi-Salati_Mesis.pdf': 'salat'
  }
  const name = key?.startsWith('DurrulMensur-') ? 'durr' : key ? covers[key] :
    book.title === 'İhya-u Ulumiddin' ? 'ihya' : book.title === 'Kuran Yolu Meali' ? 'kuran' : undefined
  return name ? `${import.meta.env.BASE_URL}covers/${name}.webp` : undefined
}

export const coverEdition = (book: Pick<Book, 'sourceKey' | 'title'>) => {
  const volumeNumber = book.sourceKey?.match(/^ahmet-tunalilar:DurrulMensur-(\d+)\.pdf$/)?.[1]
  if (volumeNumber) return `${volumeNumber}. Cilt`
  const risale = risaleCovers.find(entry => entry.sourceKey === book.sourceKey)
  if (!risale) return undefined
  const volume = risale.slug.match(/emirdag-lahikasi-(\d+)/)?.[1]
  return [risale.writingType === 'osmanlica' ? 'Osmanlıca' : undefined, volume ? `${volume}. Cilt` : undefined].filter(Boolean).join(' · ') || undefined
}

// Generated locally for arbitrary user titles, including books without embedded artwork.
export const fallbackCover = (title: string, author?: string | null): string => {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!))
  const words = title.split(/\s+/), lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line && `${line} ${word}`.length > 18) { lines.push(line); line = word }
    else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  const lineHeight = Math.min(62, 240 / Math.max(lines.length, 1))
  const fontSize = Math.min(48, lineHeight * 0.85, 580 / Math.max(...lines.map(value => value.length), 1))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#143b39"/><stop offset="1" stop-color="#071c26"/></linearGradient><pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M40 0 80 40 40 80 0 40Z M0 0 80 80 M80 0 0 80" fill="none" stroke="#c6ab70" stroke-opacity=".12"/></pattern></defs><rect width="600" height="900" fill="url(#bg)"/><rect width="600" height="900" fill="url(#grid)"/><rect x="26" y="26" width="548" height="848" rx="3" fill="none" stroke="#c6ab70" stroke-width="2"/><rect x="35" y="35" width="530" height="830" fill="none" stroke="#c6ab70" stroke-opacity=".4"/><path d="M140 660 300 500 460 660 300 820Z M190 660 300 550 410 660 300 770Z" fill="none" stroke="#c6ab70" stroke-width="2"/><circle cx="300" cy="660" r="65" fill="none" stroke="#c6ab70"/><path d="M240 660h120 M300 600v120" stroke="#c6ab70"/><rect x="60" y="140" width="480" height="${300}" fill="#143b39"/>${lines.map((value, index) => `<text x="300" y="${205 + index * lineHeight}" text-anchor="middle" fill="#f5e7ca" font-family="Georgia,serif" font-size="${fontSize}">${escape(value)}</text>`).join('')}<text x="300" y="450" text-anchor="middle" fill="#dccba6" font-family="Georgia,serif" font-size="24">${escape((author || '').slice(0, 44))}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export const fallbackCoverBlob = (title: string, author?: string | null) =>
  new Blob([decodeURIComponent(fallbackCover(title, author).split(',')[1])], { type: 'image/svg+xml' })

export const normalizeRemoteUrl = (url: string) => {
  const parsed = new URL(url, window.location.href)
  parsed.pathname = parsed.pathname.split('/').map(part => {
    try { return encodeURIComponent(decodeURIComponent(part).normalize('NFC')) } catch { return encodeURIComponent(part) }
  }).join('/')
  return parsed.href
}
