import { readFile } from 'node:fs/promises'
const catalog = JSON.parse(await readFile('src/lib/diniCatalog.json', 'utf8'))
if (catalog.books.length !== 30 || catalog.books.filter(book => !book.existingIhya).length !== 29) throw new Error('Kitap sayısı yanlış')
if (new Set(catalog.books.map(book => book.sourceKey)).size !== 30) throw new Error('Mükerrer kitap')
for (const book of catalog.books) {
  if (!book.packageUrl.endsWith('.pdf') || !/^[a-f0-9]{64}$/.test(book.sha256) || book.downloadSize <= 0) throw new Error(`Geçersiz kitap: ${book.title}`)
}
console.log('30 kaynak PDF, 29 yeni kitap/cilt; katalog geçerli.')
