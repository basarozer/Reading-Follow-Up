export const STATUSES = { 'to-read': 'Want to Read', 'currently-reading': 'Currently Reading', read: 'Read' };
export const uid = () => crypto.randomUUID();
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const emptyLibrary = () => ({ schema: 1, books: [], shelves: [] });
export const fold = text => String(text ?? '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
export const cleanISBN = value => String(value ?? '').replace(/^=\s*"(.*)"$/, '$1').replace(/[\s-]/g, '').toUpperCase();
export function isbn13(value) {
  const s = cleanISBN(value);
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((n, c, i) => n + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    if (sum % 11) return '';
    const base = '978' + s.slice(0, 9);
    return base + ((10 - [...base].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10) % 10);
  }
  if (!/^97[89]\d{10}$/.test(s)) return '';
  return [...s].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0 ? s : '';
}
export function validDate(value) {
  const s = String(value ?? '').replaceAll('/', '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s ? s : '';
}
export function safeURL(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href.replace(/^http:/, 'https:') : ''; } catch { return ''; }
}
export function newBook(data = {}) {
  return { id: uid(), title: '', subtitle: '', authors: [], isbn: '', isbn10: '', publisher: '', publishedDate: '', edition: '', language: '', pageCount: null, description: '', categories: [], cover: '', source: '', status: 'to-read', rating: 0, favorite: false, notes: '', shelfIds: [], history: [], dateAdded: today(), goodreadsId: '', ...data };
}
export function duplicateOf(books, book) {
  const normalized = isbn13(book.isbn || book.isbn10);
  return books.find(b => b.id === book.id || (normalized && isbn13(b.isbn || b.isbn10) === normalized) || (book.goodreadsId && b.goodreadsId === book.goodreadsId));
}
// CSV state machine: quoted commas, escaped quotes, CRLF, BOM and multiline reviews.
export function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === ',') { row.push(field); field = ''; closed = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(x => x.trim())) rows.push(row);
      row = []; field = ''; closed = false;
    } else if (closed && !/\s/.test(c)) throw new Error('CSV içinde kapanmış tırnaktan sonra beklenmeyen karakter var.');
    else if (!closed) field += c;
  }
  if (quoted) throw new Error('CSV dosyasında kapanmamış tırnak var. Dosyayı Goodreads’ten yeniden indir.');
  row.push(field); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
export function goodreadsImport(text, library) {
  const [header, ...rows] = parseCSV(text);
  if (!header || !['Title', 'Author', 'Exclusive Shelf'].every(x => header.includes(x))) throw new Error('Goodreads CSV başlıkları bulunamadı. Title, Author ve Exclusive Shelf sütunları gerekli.');
  if (rows.length > 20000) throw new Error('Tek seferde en fazla 20.000 kitap aktarılabilir.');
  const result = structuredClone(library), added = [], skipped = [], warnings = [];
  rows.forEach((row, i) => {
    const r = Object.fromEntries(header.map((h, j) => [h, row[j] ?? '']));
    if (row.length !== header.length) warnings.push(`Satır ${i + 2}: sütun sayısı farklı; mevcut alanlar alındı.`);
    if (!r.Title.trim()) { skipped.push({ title: `Satır ${i + 2}`, reason: 'Kitap adı boş' }); return; }
    const rawISBN = cleanISBN(r.ISBN13 || r.ISBN), isbn = isbn13(rawISBN) || isbn13(r.ISBN);
    if (rawISBN && !isbn) warnings.push(`${r.Title}: ISBN doğrulanamadı; Goodreads kimliği korundu.`);
    const status = Object.hasOwn(STATUSES, r['Exclusive Shelf']) ? r['Exclusive Shelf'] : 'to-read';
    const pages = Number(r['Number of Pages']) > 0 ? Math.trunc(Number(r['Number of Pages'])) : null;
    const end = validDate(r['Date Read']);
    if (status === 'read' && !end) warnings.push(`${r.Title}: bitirme tarihi yok; yıllık istatistiğe eklenmedi.`);
    const b = newBook({ title: r.Title.trim(), authors: [r.Author, ...(r['Additional Authors'] || '').split(',')].map(a => a.trim()).filter(Boolean), isbn, isbn10: cleanISBN(r.ISBN), publisher: r.Publisher || '', publishedDate: r['Year Published'] || '', edition: r.Binding || '', pageCount: pages, rating: Math.max(0, Math.min(5, Math.round(Number(r['My Rating']) || 0))), status, notes: [r['My Review'], r['Private Notes']].filter(Boolean).join('\n\n'), dateAdded: validDate(r['Date Added']) || today(), goodreadsId: r['Book Id'].trim(), source: 'Goodreads CSV', cover: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` : '', history: [] });
    if (status === 'read' || end) b.history.push({ id: uid(), startedAt: '', finishedAt: end, completed: true, pages, source: 'Goodreads' });
    // Goodreads exports a total Read Count, not all reread dates. Preserve undated rereads.
    const count = Math.min(1000, Math.max(b.history.length, parseInt(r['Read Count'], 10) || 0));
    while (b.history.length < count) b.history.push({ id: uid(), startedAt: '', finishedAt: '', completed: true, pages, source: 'Goodreads' });
    if (count > 1) warnings.push(`${r.Title}: ${count - 1} tekrar okumanın tarihi CSV’de yok; tarihsiz geçmiş olarak saklandı.`);
    const existing = duplicateOf(result.books, b);
    if (existing) { skipped.push({ title: b.title, reason: 'Zaten kitaplıkta' }); return; }
    // A Goodreads ID-less / ISBN-less row can still be reimported safely.
    if (!isbn && !b.goodreadsId && result.books.some(x => fold(x.title) === fold(b.title) && fold(x.authors.join(',')) === fold(b.authors.join(',')))) { skipped.push({ title: b.title, reason: 'Aynı ad ve yazar mevcut' }); return; }
    (r.Bookshelves || '').split(',').map(s => s.trim()).filter(s => s && !Object.hasOwn(STATUSES, s)).forEach(name => {
      let shelf = result.shelves.find(s => fold(s.name) === fold(name));
      if (!shelf) { shelf = { id: uid(), name }; result.shelves.push(shelf); }
      b.shelfIds.push(shelf.id);
    });
    result.books.push(b); added.push(b);
  });
  return { library: result, added, skipped, warnings, total: rows.length };
}
export function stats(library, year) {
  const months = Array.from({ length: 12 }, () => ({ books: 0, pages: 0 }));
  let books = 0, pages = 0, missingPages = 0, undated = 0;
  for (const b of library.books) for (const h of b.history) {
    if (!h.completed) continue;
    if (!validDate(h.finishedAt)) { undated++; continue; }
    if (Number(h.finishedAt.slice(0, 4)) !== Number(year)) continue;
    books++; const p = h.pages ?? b.pageCount;
    if (!Number.isFinite(p) || p <= 0) missingPages++; else pages += p;
    const m = months[Number(h.finishedAt.slice(5, 7)) - 1]; m.books++; if (p > 0) m.pages += p;
  }
  return { books, pages, missingPages, undated, months };
}
export function validateLibrary(data) {
  if (data?.schema !== 1 || !Array.isArray(data.books) || !Array.isArray(data.shelves)) throw new Error('Geçerli bir Reading Follow Up JSON yedeği seç.');
  const stringFields = ['id','title','subtitle','isbn','isbn10','publisher','publishedDate','edition','language','description','cover','source','notes','dateAdded','goodreadsId'];
  const ids = new Set(), shelfIds = new Set();
  for (const s of data.shelves) {
    if (typeof s.id !== 'string' || typeof s.name !== 'string' || !s.name.trim() || shelfIds.has(s.id)) throw new Error('Raf verisi geçersiz.');
    shelfIds.add(s.id);
  }
  for (const b of data.books) {
    if (stringFields.some(k => typeof b[k] !== 'string') || !b.title.trim() || ids.has(b.id) || !Object.hasOwn(STATUSES, b.status)) throw new Error('Kitap verisi geçersiz.');
    ids.add(b.id);
    if (!['authors','categories','shelfIds'].every(k => Array.isArray(b[k]) && b[k].every(x => typeof x === 'string')) || !b.shelfIds.every(x => shelfIds.has(x)) || !Array.isArray(b.history)) throw new Error('Kitap alanları geçersiz.');
    if (!(b.pageCount === null || (Number.isInteger(b.pageCount) && b.pageCount > 0)) || !Number.isInteger(b.rating) || b.rating < 0 || b.rating > 5 || typeof b.favorite !== 'boolean') throw new Error('Sayfa veya puan verisi geçersiz.');
    for (const h of b.history) if (typeof h.id !== 'string' || typeof h.completed !== 'boolean' || !['startedAt','finishedAt'].every(k => h[k] === '' || validDate(h[k])) || !(h.pages === null || (Number.isInteger(h.pages) && h.pages > 0))) throw new Error('Okuma geçmişi geçersiz.');
  }
  return data;
}
