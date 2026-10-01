import { isbn13, cleanISBN, safeURL } from './core.js';
async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), referrerPolicy: 'no-referrer' });
  if (!r.ok) throw new Error(`Kaynak yanıtı: ${r.status}`);
  return r.json();
}
export async function lookupISBN(value, apiKey = '') {
  const isbn = isbn13(value);
  if (!isbn) throw new Error('ISBN geçersiz. 10 veya 13 haneli ISBN’yi kontrol et.');
  const errors = []; let google = null, open = null;
  try {
    const data = await json(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${apiKey ? '&key=' + encodeURIComponent(apiKey) : ''}`);
    const v = data.items?.map(i => i.volumeInfo).find(v => v.industryIdentifiers?.some(i => isbn13(i.identifier) === isbn));
    if (v) google = { title: v.title || '', subtitle: v.subtitle || '', authors: v.authors || [], isbn, isbn10: cleanISBN(v.industryIdentifiers?.find(i => i.type === 'ISBN_10')?.identifier), publisher: v.publisher || '', publishedDate: v.publishedDate || '', pageCount: v.pageCount > 0 ? v.pageCount : null, description: v.description || '', cover: safeURL(v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail), language: v.language || '', categories: v.categories || [], source: 'Google Books' };
  } catch { errors.push('Google Books'); }
  // A second edition-level source fills missing metadata without replacing the matching edition.
  try {
    const d = await json(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const b = d['ISBN:' + isbn];
    if (b) open = { title: b.title || '', subtitle: b.subtitle || '', authors: b.authors?.map(a => a.name) || [], isbn, publisher: b.publishers?.map(p => p.name).join(', ') || '', publishedDate: b.publish_date || '', pageCount: b.number_of_pages > 0 ? b.number_of_pages : null, cover: safeURL(b.cover?.large || b.cover?.medium), categories: b.subjects?.slice(0, 15).map(s => s.name) || [], source: 'Open Library' };
    if (open) {
      try {
        const e = await json(`https://openlibrary.org/isbn/${isbn}.json`);
        open.edition = e.edition_name || e.physical_format || '';
        open.language = e.languages?.map(l => l.key.split('/').pop()).join(', ') || '';
        open.description = typeof e.description === 'string' ? e.description : e.description?.value || '';
        open.isbn10 = e.isbn_10?.[0] || '';
      } catch { /* Main metadata remains usable. */ }
    }
  } catch { errors.push('Open Library'); }
  if (!google && !open) throw new Error(errors.length ? `Kitap bilgisi alınamadı (${errors.join(', ')} bağlantısı başarısız). Yeniden dene veya elle ekle.` : 'Bu ISBN için kayıt bulunamadı. ISBN’yi kontrol et veya elle ekle.');
  const result = { ...open, ...google };
  if (google && open) {
    for (const [key, val] of Object.entries(open)) if (!result[key] || (Array.isArray(result[key]) && !result[key].length)) result[key] = val;
    result.source = 'Google Books + Open Library';
  }
  return result;
}
