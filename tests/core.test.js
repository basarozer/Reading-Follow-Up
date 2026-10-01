import test from 'node:test';
import assert from 'node:assert/strict';
import { isbn13, cleanISBN, parseCSV, goodreadsImport, emptyLibrary, stats, newBook, duplicateOf, validDate, validateLibrary, safeURL } from '../src/core.js';
import { lookupISBN } from '../src/books.js';
const headers = ['Book Id','Title','Author','Additional Authors','ISBN','ISBN13','My Rating','Number of Pages','Date Read','Date Added','Bookshelves','Exclusive Shelf','My Review','Read Count','Publisher','Year Published'];
const csv = rows => [headers, ...rows].map(r => r.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
const fixture = csv([
  ['1','Matilda','Roald Dahl','','="0140328726"','="9780140328721"','5','240','2025/12/31','2025/01/01','roman, favoriler','read','Birinci satır, "alıntı"\nİkinci satır','2','Puffin','1988'],
  ['2','Tarihsiz Kitap','Yazar','','','','0','100','','2024/01/01','tarih','read','','1'],
  ['3','Sonraki Kitap','Yazar','','','','0','320','','','roman','to-read','','0']
]);
test('ISBN-10 and 13 canonicalize with checksum validation', () => {
  assert.equal(isbn13('0-140-32872-6'), '9780140328721');
  assert.equal(isbn13('9780140328721'), '9780140328721');
  assert.equal(cleanISBN('="9780140328721"'), '9780140328721');
  assert.equal(isbn13('9780140328722'), '');
  assert.equal(isbn13('014032872X'), '');
  assert.equal(isbn13('0000000000000'), '');
});
test('CSV preserves BOM, commas, escaped quotes, CRLF and multiline notes', () => {
  const rows = parseCSV('\uFEFF' + fixture);
  assert.equal(rows.length, 4);
  assert.equal(rows[1][12], 'Birinci satır, "alıntı"\nİkinci satır');
  assert.throws(() => parseCSV('Title,Author\n"bad'), /tırnak/);
});
test('Goodreads import maps shelves, status, ratings, dates, rereads and notes', () => {
  const r = goodreadsImport(fixture, emptyLibrary());
  assert.equal(r.added.length, 3); assert.equal(r.library.shelves.length, 3);
  assert.equal(r.added[0].shelfIds.length, 2);
  assert.equal(r.added[0].history.length, 2);
  assert.equal(r.added[0].history[0].finishedAt, '2025-12-31');
  assert.equal(r.added[0].history[1].finishedAt, '');
  assert.equal(r.added[1].rating, 0);
  assert.equal(r.added[1].history[0].finishedAt, '');
  assert.equal(r.added[2].status, 'to-read');
  validateLibrary(r.library);
});
test('Reimport is idempotent and leaves existing personal edits untouched', () => {
  const first = goodreadsImport(fixture, emptyLibrary()); first.library.books[0].notes = 'Kendi notum';
  const again = goodreadsImport(fixture, first.library);
  assert.equal(again.added.length, 0); assert.equal(again.skipped.length, 3);
  assert.equal(again.library.books[0].notes, 'Kendi notum');
  assert.equal(again.library.shelves.length, 3);
});
test('ISBN-10 duplicate matches ISBN-13 while another edition remains distinct', () => {
  const b = newBook({ title: 'Matilda', isbn: '9780140328721' });
  assert.equal(duplicateOf([b], { isbn: '0140328726' }), b);
  assert.equal(duplicateOf([b], { isbn: '9780451524935' }), undefined);
});
test('Annual stats use completion year, snapshot pages, rereads and exclude unknown dates', () => {
  const r = goodreadsImport(fixture, emptyLibrary()).library;
  r.books[0].history.push({ id: 'again', completed: true, startedAt: '2026-01-01', finishedAt: '2026-01-02', pages: 250 });
  const y25 = stats(r, 2025), y26 = stats(r, 2026);
  assert.equal(y25.books, 1); assert.equal(y25.pages, 240); assert.equal(y25.months[11].books, 1);
  assert.equal(y26.books, 1); assert.equal(y26.pages, 250); assert.equal(y26.undated, 2);
});
test('Unknown page totals are flagged and invalid dates are rejected', () => {
  assert.equal(validDate('2026/02/29'), ''); assert.equal(validDate('2024/02/29'), '2024-02-29');
  const l = emptyLibrary(); l.books.push(newBook({ title: 'Unknown pages', history: [{ id: 'h', completed: true, startedAt: '', finishedAt: '2026-01-01', pages: null }] }));
  assert.equal(stats(l, 2026).missingPages, 1); assert.equal(stats(l, 2026).pages, 0);
});
test('Import rejects wrong headers and JSON validation rejects malformed backups', () => {
  assert.throws(() => goodreadsImport('x,y\na,b', emptyLibrary()));
  assert.throws(() => validateLibrary({ schema: 1, books: [{}], shelves: [] }));
  assert.equal(safeURL('javascript:alert(1)'), '');
});
test('Exact ISBN lookup fills missing edition metadata and falls back after Google failure', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async url => ({ ok: true, json: async () => url.includes('googleapis') ? { items: [{ volumeInfo: { title: 'Wrong edition', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780451524935' }] } }] } : url.includes('api/books') ? { 'ISBN:9780140328721': { title: 'Matilda', authors: [{ name: 'Roald Dahl' }], number_of_pages: 240, cover: { large: 'https://covers.openlibrary.org/x.jpg' } } } : { edition_name: 'First edition', languages: [{ key: '/languages/eng' }] } });
  try { const b = await lookupISBN('0140328726'); assert.equal(b.title, 'Matilda'); assert.equal(b.edition, 'First edition'); assert.equal(b.language, 'eng'); } finally { globalThis.fetch = old; }
});
test('Outages are distinguished from a definitive ISBN miss', async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(lookupISBN('0140328726'), /bağlantısı başarısız/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
    await assert.rejects(lookupISBN('0140328726'), /kayıt bulunamadı/);
  } finally { globalThis.fetch = old; }
});
