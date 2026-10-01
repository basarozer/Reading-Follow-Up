import { STATUSES, uid, today, emptyLibrary, fold, isbn13, cleanISBN, validDate, safeURL, newBook, duplicateOf, goodreadsImport, stats, validateLibrary } from './core.js';
import { lookupISBN } from './books.js';
import * as storage from './storage.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = n => new Intl.NumberFormat('tr-TR').format(n);
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({ book: '<path d="M3 4h6q3 0 3 3 0-3 3-3h6v16h-6q-3 0-3 2 0-2-3-2H3z"/><path d="M12 7v15"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>', list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>', plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', chart: '<path d="M4 3v18h17M8 16v-4M13 16V7M18 16V4"/>', upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2-1 4 3 2 3-1 2 4 3-1 1-4 4-1 1-3-3-2V6l-3-2-3 1z"/>', heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1s-1 7 8 14c9-7 11-11 8-14z"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>', check: '<path d="m5 12 4 4L19 6"/>', shelf: '<path d="M3 21h18M5 17V4h4v13M12 17V4h3v13m4 0-2-12 3-1 2 13"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' })[name] || ''}</svg>`;
let library = emptyLibrary(), view = 'all', query = '', sort = 'recent', layout = 'grid', ratingFilter = '', onlyFavorites = false, year = Number(today().slice(0, 4)), importResult = null, busy = false;
let toastTimer;
function toast(message, error = false) { $('#toast').textContent = message; $('#toast').className = error ? 'show error' : 'show'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').className = '', error ? 9000 : 4500); }
async function commit(next, message) {
  if (busy) return false;
  busy = true;
  try { await storage.save(next); library = next; if (message) toast(message); render(); return true; }
  catch (e) { toast(e.message, true); return false; }
  finally { busy = false; }
}
function modal(title, body, wide = false) {
  const d = $('#modal');
  d.className = wide ? 'wide' : '';
  d.innerHTML = `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button type="button" class="icon-button" data-close aria-label="Kapat">${icon('close')}</button></div>${body}`;
  if (!d.open) d.showModal();
  d.querySelector('[data-close]').onclick = () => d.close();
  d.querySelectorAll('img').forEach(attachImageFallback);
}
const close = () => $('#modal').close();
function attachImageFallback(img) { img.addEventListener('error', () => { img.remove(); }, { once: true }); }
function cover(b, klass = '') {
  const url = safeURL(b.cover);
  return `<div class="cover ${klass}" data-tone="${[...b.title].reduce((n, c) => n + c.charCodeAt(0), 0) % 5}"><div class="cover-fallback"><span>${icon('book', 30)}</span><strong>${esc(b.title)}</strong><small>${esc(b.authors[0] || '')}</small></div>${url ? `<img src="${esc(url)}" alt="${esc(b.title)} kapağı" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;
}
function navButton(id, label, ico, count) { return `<button class="nav-item ${view === id ? 'active' : ''}" data-view="${esc(id)}" ${view === id ? 'aria-current="page"' : ''}>${icon(ico)}<span>${esc(label)}</span>${count !== undefined ? `<small>${count}</small>` : ''}</button>`; }
function viewTitle() { return ({ all: 'Kitaplığım', 'to-read': 'Want to Read', 'currently-reading': 'Currently Reading', read: 'Read', stats: 'Okuma istatistikleri', import: 'Goodreads aktarımı', settings: 'Verilerim ve hesabım' })[view] || library.shelves.find(s => s.id === view)?.name || 'Kitaplığım'; }
function render() {
  const total = library.books.length;
  $('#app').innerHTML = `<aside class="sidebar">
    <a class="brand" href="#" aria-label="Kitaplığım"><span class="brand-mark">${icon('book', 25)}</span><span>Reading<br><b>Follow Up<span class="brand-period">.</span></b></span></a>
    <div class="nav-caption">KİŞİSEL KİTAPLIĞIN</div><nav aria-label="Kitaplık">
      ${navButton('all', 'Tüm kitaplar', 'grid', total)}
      ${navButton('currently-reading', 'Currently Reading', 'book', library.books.filter(b => b.status === 'currently-reading').length)}
      ${navButton('to-read', 'Want to Read', 'clock', library.books.filter(b => b.status === 'to-read').length)}
      ${navButton('read', 'Read', 'check', library.books.filter(b => b.status === 'read').length)}
    </nav><div class="shelf-heading"><span class="nav-caption">RAFLARIM</span><button class="icon-button" id="new-shelf" aria-label="Yeni raf oluştur">${icon('plus', 18)}</button></div>
    <nav aria-label="Özel raflar">${library.shelves.map(s => navButton(s.id, s.name, 'shelf', library.books.filter(b => b.shelfIds.includes(s.id)).length)).join('') || '<p class="sidebar-hint">Kitaplarını kendi raflarında bir araya getir.</p>'}</nav>
    <div class="nav-bottom">${navButton('stats', 'İstatistikler', 'chart')}${navButton('import', 'Goodreads’ten aktar', 'upload')}${navButton('settings', 'Verilerim ve hesabım', 'settings')}</div>
    <div class="profile"><span class="avatar">B</span><div><strong>Kişisel kitaplık</strong><small>${storage.isCloud() ? 'Bulut hesabı bağlı' : 'Bu tarayıcıda saklanıyor'}</small></div></div>
  </aside><div class="workspace"><header class="topbar"><span class="breadcrumb">Kitaplık <span>/</span> ${esc(viewTitle())}</span><span class="storage-label">${storage.isCloud() ? 'Buluta bağlı' : 'Yerel kayıt'}</span></header>
  <main id="main"><div class="page-heading"><div><p class="eyebrow">READING FOLLOW UP</p><h1>${esc(viewTitle())}</h1></div><div class="heading-actions">${library.shelves.some(s => s.id === view) ? '<button class="button secondary" id="edit-shelf">Rafı düzenle</button>' : ''}<button class="button primary" id="add-book">${icon('plus')} Kitap ekle</button></div></div>
  ${!storage.isCloud() ? '<div class="local-notice">Kitapların bu tarayıcıda kayıtlı. Cihazlar arası erişim için bulut bağlantısı gerekir. <button data-view="settings">Yedekle / hesap</button></div>' : ''}
  <div id="content"></div></main><footer>Her kitap, yeni bir iz.</footer></div>`;
  $('.brand').onclick = e => { e.preventDefault(); changeView('all'); };
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => changeView(b.dataset.view));
  $('#add-book').onclick = addBook;
  $('#new-shelf').onclick = () => shelfDialog();
  if ($('#edit-shelf')) $('#edit-shelf').onclick = () => shelfDialog(library.shelves.find(s => s.id === view));
  if (view === 'stats') renderStats(); else if (view === 'import') renderImport(); else if (view === 'settings') renderSettings(); else renderLibrary();
}
function changeView(v) { view = v; query = ''; ratingFilter = ''; onlyFavorites = false; render(); }
function renderLibrary() {
  const s = stats(library, Number(today().slice(0, 4)));
  $('#content').innerHTML = `<section class="summary" aria-label="Kitaplık özeti"><div><span>Kitaplığındaki kitap</span><strong>${number(library.books.length)}<i>${icon('shelf', 24)}</i></strong></div><div><span>${today().slice(0, 4)} yılında bitirilen</span><strong>${number(s.books)}<small>kitap</small></strong></div><div><span>${today().slice(0, 4)} yılında okunan</span><strong>${number(s.pages)}<small>sayfa</small></strong></div></section>
  <div class="toolbar"><label class="search-field">${icon('search')}<input id="search" type="search" placeholder="Kitap, yazar veya ISBN ara" aria-label="Kitap, yazar veya ISBN ara" value="${esc(query)}"></label><label class="sr-only" for="sort">Sıralama</label><select id="sort"><option value="recent">Son eklenen</option><option value="title">Kitap adı A–Z</option><option value="author">Yazar A–Z</option><option value="rating">En yüksek puan</option><option value="read-date">Son okunan</option></select><div class="view-toggle"><button id="grid-view" class="icon-button ${layout === 'grid' ? 'selected' : ''}" aria-label="Kapak görünümü" aria-pressed="${layout === 'grid'}">${icon('grid')}</button><button id="list-view" class="icon-button ${layout === 'list' ? 'selected' : ''}" aria-label="Liste görünümü" aria-pressed="${layout === 'list'}">${icon('list')}</button></div></div>
  <div class="filter-row"><span id="result-count"></span><div><button id="favorite-filter" class="filter-chip ${onlyFavorites ? 'selected' : ''}" aria-pressed="${onlyFavorites}">${icon('heart', 16)} Favoriler</button><label class="sr-only" for="rating-filter">Puana göre filtrele</label><select id="rating-filter"><option value="">Tüm puanlar</option value="5">5 yıldız</option><option value="4">4 yıldız</option><option value="3">3 yıldız</option><option value="2">2 yıldız</option><option value="1">1 yıldız</option><option value="0">Puansız</option></select></div></div><div id="books"></div>`;
  $('#search').oninput = e => { query = e.target.value; renderBooks(); };
  $('#sort').value = sort; $('#sort').onchange = e => { sort = e.target.value; renderBooks(); };
  $('#rating-filter').value = ratingFilter; $('#rating-filter').onchange = e => { ratingFilter = e.target.value; renderBooks(); };
  $('#favorite-filter').onclick = () => { onlyFavorites = !onlyFavorites; renderLibrary(); };
  $('#grid-view').onclick = () => { layout = 'grid'; renderLibrary(); };
  $('#list-view').onclick = () => { layout = 'list'; renderLibrary(); };
  renderBooks();
}
const readDate = b => b.history.filter(h => h.completed).map(h => h.finishedAt).sort().at(-1) || '';
function renderBooks() {
  let books = library.books.filter(b => (view === 'all' || b.status === view || b.shelfIds.includes(view)) && (!onlyFavorites || b.favorite) && (ratingFilter === '' || b.rating === Number(ratingFilter)) && fold([b.title, ...b.authors, b.isbn, b.isbn10].join(' ')).includes(fold(query)));
  books.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'tr') : sort === 'author' ? (a.authors[0] || '').localeCompare(b.authors[0] || '', 'tr') : sort === 'rating' ? b.rating - a.rating : sort === 'read-date' ? readDate(b).localeCompare(readDate(a)) : b.dateAdded.localeCompare(a.dateAdded) || library.books.indexOf(b) - library.books.indexOf(a));
  $('#result-count').textContent = `${books.length} kitap`;
  if (!books.length) {
    $('#books').innerHTML = `<div class="empty-state"><div class="empty-icon">${icon('book', 42)}</div><h2>${library.books.length ? 'Burada henüz kitap yok' : 'İlk rafını dolduralım'}</h2><p>${library.books.length ? 'Aramanı veya filtrelerini değiştir, ya da bu rafa kitap ekle.' : 'Bir ISBN ile kitabını bul veya Goodreads kitaplığını tek seferde içeri aktar.'}</p><div><button class="button primary" id="empty-add">${icon('plus')} ISBN ile kitap ekle</button>${!library.books.length ? '<button class="button secondary" id="empty-import">Goodreads’ten aktar</button>' : ''}</div></div>`;
    $('#empty-add').onclick = addBook; if ($('#empty-import')) $('#empty-import').onclick = () => changeView('import'); return;
  }
  $('#books').innerHTML = `<div class="book-${layout}">${books.map(b => `<button class="book-card" data-book="${esc(b.id)}">${cover(b)}<div class="book-info"><span class="status status-${esc(b.status)}">${esc(STATUSES[b.status])}</span><h2>${esc(b.title)}</h2><p class="author">${esc(b.authors.join(', ') || 'Yazar bilgisi yok')}</p><div class="book-meta"><span>${b.rating ? `<span class="stars" aria-label="${b.rating} yıldız">${'★'.repeat(b.rating)}<span>${'☆'.repeat(5 - b.rating)}</span></span>` : 'Henüz puan yok'}</span>${b.pageCount ? `<span>${number(b.pageCount)} s.</span>` : ''}${b.favorite ? '<span aria-label="Favori">♥</span>' : ''}</div></div></button>`).join('')}</div>`;
  $('#books').querySelectorAll('[data-book]').forEach(el => el.onclick = () => bookDetails(library.books.find(b => b.id === el.dataset.book)));
  $('#books').querySelectorAll('img').forEach(attachImageFallback);
}
function addBook() {
  modal('Kitap ekle', `<form id="isbn-form"><p class="muted">ISBN’yi gir; kitabın bilgilerini ve kapağını bulalım.</p><label for="isbn-search">ISBN-10 veya ISBN-13</label><div class="input-action"><input id="isbn-search" placeholder="Örn. 9780140328721" required autocomplete="off" inputmode="text"><button class="button primary" id="lookup-button">Kitabı bul</button></div><p class="field-help">Tire ve boşluk kullanabilirsin. Kaynaklarda eksik olan bilgileri sonradan düzenleyebilirsin.</p><p id="lookup-error" class="form-error" role="alert"></p><button class="text-button" type="button" id="manual-book">Bilgileri kendim gireceğim</button></form>`);
  $('#manual-book').onclick = () => editor(newBook({ shelfIds: library.shelves.some(s => s.id === view) ? [view] : [] }), true);
  $('#isbn-form').onsubmit = async e => {
    e.preventDefault(); const searchForm = e.currentTarget; const value = $('#isbn-search').value;
    const existing = duplicateOf(library.books, { isbn: value });
    if (existing) { bookDetails(existing); toast('Bu ISBN zaten kitaplığında.'); return; }
    $('#lookup-button').disabled = true; $('#lookup-button').textContent = 'Aranıyor…'; $('#lookup-error').textContent = '';
    try { const data = await lookupISBN(value, window.READING_CONFIG?.googleBooksKey); if (!searchForm.isConnected || !$('#modal').open) return; editor(newBook({ ...data, shelfIds: library.shelves.some(s => s.id === view) ? [view] : [] }), true); }
    catch (error) { if (searchForm.isConnected && $('#lookup-error')) $('#lookup-error').textContent = error.message; }
    finally { if (searchForm.isConnected && $('#lookup-button')) { $('#lookup-button').disabled = false; $('#lookup-button').textContent = 'Kitabı bul'; } }
  };
}
function bookDetails(b) {
  modal(b.title, `<div class="detail-top">${cover(b)}<div><span class="status status-${b.status}">${STATUSES[b.status]}</span><h3>${esc(b.title)}</h3><p>${esc(b.authors.join(', '))}</p><p class="muted">${esc([b.publisher, b.publishedDate, b.edition].filter(Boolean).join(' · '))}</p><p>${b.pageCount ? number(b.pageCount) + ' sayfa' : 'Sayfa sayısı bilinmiyor'}${b.language ? ' · ' + esc(b.language) : ''}</p><p class="stars">${b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : 'Puan verilmedi'}</p><button class="button primary" id="edit-book">Kitabı düzenle</button></div></div><dl class="metadata"><div><dt>ISBN</dt><dd>${esc(b.isbn || b.isbn10 || '—')}</dd></div><div><dt>Kaynak</dt><dd>${esc(b.source || 'Elle eklendi')}</dd></div><div><dt>Raflar</dt><dd>${esc(library.shelves.filter(s => b.shelfIds.includes(s.id)).map(s => s.name).join(', ') || '—')}</dd></div></dl>${b.description ? `<h3>Kitap hakkında</h3><p class="prose">${esc(b.description)}</p>` : ''}${b.notes ? `<h3>Notlarım</h3><p class="prose">${esc(b.notes)}</p>` : ''}<h3>Okuma geçmişi</h3>${b.history.length ? `<ul class="history-list">${b.history.map(h => `<li><span>${esc(h.startedAt || 'Başlama tarihi yok')} <span class="muted"> / </span> ${esc(h.finishedAt || (h.completed ? 'Bitirme tarihi yok' : 'Devam ediyor'))}</span><span>${h.completed ? 'Tamamlandı' : 'Okunuyor'}${h.pages ? ` · ${h.pages} sayfa` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Henüz okuma kaydı yok.</p>'}<div class="modal-actions"><button class="text-button danger" id="delete-book">Kitaplıktan sil</button><button class="button secondary" id="reread">Yeni okuma başlat</button></div>`, true);
  $('#edit-book').onclick = () => editor(structuredClone(b));
  $('#reread').onclick = () => { const d = structuredClone(b); if (d.history.some(h => !h.completed)) { toast('Zaten devam eden bir okuma kaydı var.'); editor(d); return; } d.history.push({ id: uid(), startedAt: today(), finishedAt: '', completed: false, pages: d.pageCount }); d.status = 'currently-reading'; editor(d); };
  $('#delete-book').onclick = async () => { if (confirm(`“${b.title}” ve okuma geçmişi silinsin mi?`)) { const next = structuredClone(library); next.books = next.books.filter(x => x.id !== b.id); if (await commit(next, 'Kitap silindi.')) close(); } };
}
function inputField(name, label, value, type = 'text', extra = '') { return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value ?? '')}" ${extra}></label>`; }
function editor(b, isNew = false) {
  modal(isNew ? 'Kitap bilgilerini kontrol et' : 'Kitabı düzenle', `<form id="book-form"><div class="editor-intro">${cover(b)}<div><p class="eyebrow">${esc(b.source || 'YENİ KİTAP')}</p><h3>${esc(b.title || 'Yeni bir kitap')}</h3><p class="muted">Eksik veya yanlış bilgileri düzeltebilirsin.</p></div></div>
  <div class="form-grid">${inputField('title', 'Kitap adı *', b.title, 'text', 'required maxlength="500"')}${inputField('authors', 'Yazarlar (virgülle ayır)', b.authors.join(', '))}${inputField('isbn', 'ISBN-13 veya ISBN-10', b.isbn || b.isbn10)}${inputField('pageCount', 'Sayfa sayısı', b.pageCount, 'number', 'min="1" max="100000" step="1"')}
  <label>Okuma durumu<select name="status">${Object.entries(STATUSES).map(([key, val]) => `<option value="${key}" ${b.status === key ? 'selected' : ''}>${val}</option>`).join('')}</select></label><label>Puanım<select name="rating">${Array.from({ length: 6 }, (_, n) => `<option value="${n}" ${b.rating === n ? 'selected' : ''}>${n ? '★'.repeat(n) : 'Puan vermedim'}</option>`).join('')}</select></label></div>
  <label class="checkbox-label"><input type="checkbox" name="favorite" ${b.favorite ? 'checked' : ''}> Favorilerime ekle</label>
  <fieldset><legend>Raflarım</legend><div class="shelf-checks">${library.shelves.map(s => `<label class="checkbox-label"><input type="checkbox" name="shelf" value="${esc(s.id)}" ${b.shelfIds.includes(s.id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('') || '<span class="muted">Henüz özel raf yok.</span>'}</div>${inputField('newShelf', 'Yeni raf oluştur (isteğe bağlı)', '')}</fieldset>
  <details><summary>Baskı ve diğer kitap bilgileri</summary><div class="form-grid">${inputField('subtitle', 'Alt başlık', b.subtitle)}${inputField('publisher', 'Yayınevi', b.publisher)}${inputField('publishedDate', 'Yayın tarihi / yılı', b.publishedDate)}${inputField('edition', 'Baskı / format', b.edition)}${inputField('language', 'Dil', b.language)}${inputField('categories', 'Konular (virgülle ayır)', b.categories.join(', '))}</div>${inputField('cover', 'Kapak görseli bağlantısı', b.cover, 'url')}<label>Açıklama<textarea name="description" rows="4">${esc(b.description)}</textarea></label></details>
  <fieldset><legend>Okuma geçmişi</legend><p class="field-help">Her tekrar okuma ayrı kayıttır. Tamamlanmış fakat tarihsiz okumalar yıllık istatistiklere katılmaz.</p><div id="history-fields">${b.history.map(historyFields).join('')}</div><button type="button" class="text-button" id="add-history">+ Okuma kaydı ekle</button><div id="completion-fields">${inputField('completionDate', 'Bu okumayı bitirdiğin tarih (boş bırakılabilir)', today(), 'date')}</div></fieldset>
  <label>Notlarım<textarea name="notes" rows="4" placeholder="Bu kitapla ilgili aklında kalanlar…">${esc(b.notes)}</textarea></label><p id="book-error" class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="button secondary" id="cancel-edit">Vazgeç</button><button class="button primary" id="save-book">${isNew ? 'Kitaplığıma ekle' : 'Değişiklikleri kaydet'}</button></div></form>`, true);
  function completionVisibility() { const form = $('#book-form'); const show = form.elements.status.value === 'read' && (b.status !== 'read' || !$('#history-fields').children.length); $('#completion-fields').hidden = !show; }
  completionVisibility(); $('#book-form').elements.status.onchange = completionVisibility;
  $('#cancel-edit').onclick = close;
  function bindHistory() { $('#history-fields').querySelectorAll('[data-remove-history]').forEach(button => button.onclick = () => { button.closest('.history-fields').remove(); completionVisibility(); }); }
  bindHistory();
  $('#add-history').onclick = () => { $('#history-fields').insertAdjacentHTML('beforeend', historyFields({ id: uid(), startedAt: '', finishedAt: '', completed: true, pages: b.pageCount })); bindHistory(); completionVisibility(); };
  $('#book-form').onsubmit = async e => {
    e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
    try {
      const rawISBN = cleanISBN(data.get('isbn'));
      if (rawISBN && !isbn13(rawISBN)) throw new Error('ISBN kontrol basamağı geçersiz. Lütfen numarayı düzelt.');
      const nextBook = { ...b, title: data.get('title').trim(), authors: data.get('authors').split(',').map(s => s.trim()).filter(Boolean), isbn: isbn13(rawISBN), isbn10: rawISBN.length === 10 ? rawISBN : b.isbn10, pageCount: Number(data.get('pageCount')) || null, status: data.get('status'), rating: Number(data.get('rating')), favorite: data.has('favorite'), notes: data.get('notes'), shelfIds: data.getAll('shelf'), categories: data.get('categories').split(',').map(s => s.trim()).filter(Boolean), history: [] };
      for (const key of ['subtitle','publisher','publishedDate','edition','language','cover','description']) nextBook[key] = data.get(key).trim();
      if (!nextBook.title) throw new Error('Kitap adı gerekli.');
      nextBook.cover = safeURL(nextBook.cover);
      form.querySelectorAll('.history-fields').forEach(row => {
        const startedAt = row.querySelector('[data-start]').value, finishedAt = row.querySelector('[data-end]').value;
        if (startedAt && finishedAt && startedAt > finishedAt) throw new Error('Bitirme tarihi, başlama tarihinden önce olamaz.');
        nextBook.history.push({ id: row.dataset.id, startedAt, finishedAt, completed: row.querySelector('[data-completed]').checked || !!finishedAt, pages: Number(row.querySelector('[data-pages]').value) || null });
      });
      const explicitlyCompleted = nextBook.history.some(h => h.completed && !b.history.some(old => old.id === h.id && old.completed));
      if (nextBook.status === 'read' && !$('#completion-fields').hidden && !explicitlyCompleted) {
        let h = nextBook.history.findLast(h => !h.completed);
        if (!h) { h = { id: uid(), startedAt: '', pages: nextBook.pageCount }; nextBook.history.push(h); }
        h.finishedAt = data.get('completionDate') || ''; h.completed = true; h.pages = nextBook.pageCount;
        if (h.startedAt && h.finishedAt && h.startedAt > h.finishedAt) throw new Error('Bitirme tarihi başlama tarihinden önce olamaz.');
      }
      if (nextBook.status === 'currently-reading' && !nextBook.history.some(h => !h.completed)) nextBook.history.push({ id: uid(), startedAt: today(), finishedAt: '', completed: false, pages: nextBook.pageCount });
      const dup = duplicateOf(library.books.filter(x => x.id !== b.id), nextBook);
      if (dup) throw new Error(`Bu ISBN zaten kitaplıkta: ${dup.title}`);
      const next = structuredClone(library), name = data.get('newShelf').trim();
      if (name) { let s = next.shelves.find(s => fold(s.name) === fold(name)); if (!s) { s = { id: uid(), name }; next.shelves.push(s); } if (!nextBook.shelfIds.includes(s.id)) nextBook.shelfIds.push(s.id); }
      if (isNew) next.books.push(nextBook); else next.books = next.books.map(x => x.id === b.id ? nextBook : x);
      $('#save-book').disabled = true;
      if (await commit(next, isNew ? 'Kitap kitaplığına eklendi.' : 'Kitap güncellendi.')) close();
      else $('#save-book').disabled = false;
    } catch (error) { $('#book-error').textContent = error.message; }
  };
}
function historyFields(h) { return `<div class="history-fields" data-id="${esc(h.id)}"><div class="form-grid"><label>Başlama<input type="date" data-start value="${esc(h.startedAt)}"></label><label>Bitirme<input type="date" data-end value="${esc(h.finishedAt)}"></label><label>Bu okumadaki sayfa sayısı<input type="number" min="1" step="1" data-pages value="${h.pages ?? ''}"></label><label class="checkbox-label"><input type="checkbox" data-completed ${h.completed ? 'checked' : ''}>Tamamlandı</label></div><button type="button" class="text-button danger" data-remove-history>Bu okuma kaydını kaldır</button></div>`; }
function shelfDialog(shelf) {
  modal(shelf ? 'Rafı düzenle' : 'Yeni raf', `<form id="shelf-form">${inputField('name', 'Raf adı', shelf?.name || '', 'text', 'required maxlength="100"')}<p class="field-help">Bir kitap birden fazla rafta yer alabilir.</p><p class="form-error" id="shelf-error" role="alert"></p><div class="modal-actions">${shelf ? '<button type="button" class="text-button danger" id="delete-shelf">Rafı sil</button>' : ''}<button class="button primary">${shelf ? 'Kaydet' : 'Rafı oluştur'}</button></div></form>`);
  $('#shelf-form').onsubmit = async e => { e.preventDefault(); const name = e.currentTarget.elements.name.value.trim(); if (!name) return; if (library.shelves.some(s => s.id !== shelf?.id && fold(s.name) === fold(name))) { $('#shelf-error').textContent = 'Bu isimde bir raf zaten var.'; return; } const next = structuredClone(library); if (shelf) next.shelves.find(s => s.id === shelf.id).name = name; else next.shelves.push({ id: uid(), name }); if (await commit(next, 'Raf kaydedildi.')) close(); };
  if (shelf) $('#delete-shelf').onclick = async () => { if (!confirm('Raf silinsin mi? Kitaplar kitaplığında kalacak.')) return; const next = structuredClone(library); next.shelves = next.shelves.filter(s => s.id !== shelf.id); next.books.forEach(b => b.shelfIds = b.shelfIds.filter(id => id !== shelf.id)); if (view === shelf.id) view = 'all'; if (await commit(next, 'Raf silindi.')) close(); };
}
function renderStats() {
  const currentYear = Number(today().slice(0, 4));
  const years = [...new Set([currentYear, year, ...library.books.flatMap(b => b.history.filter(h => h.finishedAt).map(h => Number(h.finishedAt.slice(0, 4))))])].sort((a, b) => b - a);
  const s = stats(library, year), max = Math.max(1, ...s.months.map(m => m.books));
  const monthNames = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  $('#content').innerHTML = `<div class="section-title"><h2>Okuma yılın</h2><label>Yıl <select id="stats-year">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div><section class="summary stats-summary"><div><span>Bitirilen kitap</span><strong>${number(s.books)}</strong></div><div><span>Okunan sayfa</span><strong>${number(s.pages)}</strong></div><div><span>Kitap başına sayfa</span><strong>${s.books - s.missingPages ? number(Math.round(s.pages / (s.books - s.missingPages))) : '—'}</strong></div></section>
  <section class="panel"><div class="section-title"><h2>Aylara göre okumaların</h2><span class="muted">${year}</span></div><div class="month-chart" role="img" aria-label="${esc(monthNames.map((m, i) => `${m}: ${s.months[i].books} kitap`).join(', '))}">${s.months.map((m, i) => `<div class="month-column"><span>${m.books || '—'}</span><div class="bar-track"><progress max="${max}" value="${m.books}" aria-label="${monthNames[i]}: ${m.books} kitap"></progress></div><small>${monthNames[i]}</small></div>`).join('')}</div></section>
  <div class="stats-tables"><section class="panel"><h2>Aylık ayrıntı</h2><div class="table-wrap"><table><thead><tr><th>Ay</th><th>Kitap</th><th>Sayfa</th></tr></thead><tbody>${s.months.map((m, i) => `<tr><th>${monthNames[i]}</th><td>${number(m.books)}</td><td>${number(m.pages)}</td></tr>`).join('')}</tbody></table></div></section><section class="panel"><h2>Yıllar arası karşılaştırma</h2><table><thead><tr><th>Yıl</th><th>Kitap</th><th>Sayfa</th></tr></thead><tbody>${years.map(y => { const v = stats(library, y); return `<tr><th>${y}</th><td>${number(v.books)}</td><td>${number(v.pages)}</td></tr>`; }).join('')}</tbody></table><p class="field-help">Tekrar okumalar ayrı sayılır. Sayfa toplamı, o yıl bitirilen okumaların sayfalarıdır; gün gün okunan sayfa takibi değildir.</p>${s.undated ? `<p class="notice">${s.undated} tamamlanmış okumanın tarihi eksik; yıllık toplamlara dahil değil.</p>` : ''}${s.missingPages ? `<p class="notice">${s.missingPages} okumada sayfa sayısı eksik; sayfa toplamı kısmi.</p>` : ''}</section></div>`;
  $('#stats-year').onchange = e => { year = Number(e.target.value); renderStats(); };
}
function renderImport() {
  $('#content').innerHTML = `<section class="panel import-panel"><div class="import-icon">${icon('upload', 32)}</div><h2>Kitaplığın, kaldığı yerden.</h2><p class="muted">Goodreads’ten indirdiğin CSV dosyasını seç. Kaydetmeden önce kitapları ve aktarım sonucunu göreceksin.</p><ol class="import-steps"><li>Goodreads’te <b>My Books → Import and export → Export Library</b> yolunu izle.</li><li>Hazırlanan CSV dosyasını bilgisayarına indir.</li><li>Dosyayı seç, önizlemeyi kontrol et ve aktarımı tamamla.</li></ol><a href="https://www.goodreads.com/review/import" target="_blank" rel="noopener noreferrer" class="text-link">Goodreads aktarım sayfasını aç</a><label class="upload-area" id="drop-zone">${icon('upload', 28)}<strong>CSV dosyanı buraya bırak</strong><span>veya dosya seçmek için tıkla · en fazla 20 MB</span><input id="csv-file" type="file" accept=".csv,text/csv" aria-label="Goodreads CSV dosyası seç"></label><p class="field-help">Kitaplar, yazarlar, ISBN, sayfa sayıları, puanlar, notlar, tarihler ve özel raflar aktarılır. Var olan kitapların üzerine yazılmaz. CSV kapak içermediğinden ISBN olan kitaplar için kapak bağlantısı oluşturulur.</p><p id="import-error" class="form-error" role="alert"></p></section><section id="import-preview"></section>`;
  $('#csv-file').onchange = e => previewFile(e.target.files[0]);
  const zone = $('#drop-zone'); zone.ondragover = e => { e.preventDefault(); zone.classList.add('dragging'); }; zone.ondragleave = () => zone.classList.remove('dragging'); zone.ondrop = e => { e.preventDefault(); zone.classList.remove('dragging'); previewFile(e.dataTransfer.files[0]); };
  if (importResult) previewImport();
}
async function previewFile(file) {
  if (!file) return;
  try {
    if (file.size > 20000000) throw new Error('Dosya 20 MB sınırını aşıyor.');
    importResult = { ...goodreadsImport(await file.text(), library), text: await file.text(), filename: file.name };
    $('#import-error').textContent = ''; previewImport();
  } catch (e) { importResult = null; $('#import-preview').innerHTML = ''; $('#import-error').textContent = e.message; }
}
function previewImport() {
  const r = importResult;
  $('#import-preview').innerHTML = `<div class="panel"><div class="section-title"><div><p class="eyebrow">AKTARIM ÖNİZLEMESİ</p><h2>${esc(r.filename)}</h2></div><button class="button primary" id="confirm-import" ${!r.added.length ? 'disabled' : ''}>${r.added.length} kitabı aktar</button></div><div class="import-counts"><span><b>${r.total}</b> toplam satır</span><span><b>${r.added.length}</b> yeni kitap</span><span><b>${r.skipped.length}</b> atlanacak</span><span><b>${r.library.shelves.length - library.shelves.length}</b> yeni raf</span></div><div class="table-wrap"><table><thead><tr><th>Kitap</th><th>Yazar</th><th>Durum</th><th>Sayfa</th></tr></thead><tbody>${r.added.slice(0, 100).map(b => `<tr><td>${esc(b.title)}</td><td>${esc(b.authors.join(', '))}</td><td>${STATUSES[b.status]}</td><td>${b.pageCount || '—'}</td></tr>`).join('')}</tbody></table></div>${r.added.length > 100 ? '<p class="field-help">Önizlemede ilk 100 kitap gösteriliyor; tüm yeni kitaplar aktarılacak.</p>' : ''}${r.warnings.length ? `<details><summary>${r.warnings.length} veri notu</summary><ul class="warning-list">${r.warnings.slice(0, 100).map(w => `<li>${esc(w)}</li>`).join('')}</ul>${r.warnings.length > 100 ? '<p>İlk 100 not gösteriliyor.</p>' : ''}</details>` : ''}${r.skipped.length ? `<details><summary>Atlanacak kitaplar (${r.skipped.length})</summary><ul>${r.skipped.slice(0, 100).map(s => `<li>${esc(s.title)} — ${esc(s.reason)}</li>`).join('')}</ul></details>` : ''}</div>`;
  $('#confirm-import').onclick = async () => { const fresh = goodreadsImport(r.text, library); $('#confirm-import').disabled = true; if (await commit(fresh.library, `${fresh.added.length} kitap aktarıldı; ${fresh.skipped.length} kayıt atlandı.`)) { importResult = null; changeView('all'); } else if ($('#confirm-import')) $('#confirm-import').disabled = false; };
}
function download(name, content, type) { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([content], { type })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function renderSettings() {
  $('#content').innerHTML = `<div class="settings-grid"><section class="panel"><h2>Yedekleme ve dışa aktarma</h2><p>Tüm kitaplarını, özel raflarını ve tekrar okuma geçmişini JSON olarak yedekleyebilirsin.</p><div class="button-row"><button class="button primary" id="export-json">JSON yedeği indir</button><button class="button secondary" id="export-csv">CSV indir</button></div><p class="field-help">JSON bütün geçmişi korur. CSV kitap başına bir satır ve son bitirme tarihini içerir.</p><hr><h3>JSON yedeğini geri yükle</h3><p class="field-help">Önce mevcut kitaplığının yedeğini al. Geri yükleme mevcut kitaplığın yerini alır.</p><input type="file" id="restore-json" accept=".json,application/json" aria-label="JSON yedeği seç"></section><section class="panel"><h2>Hesap ve cihazlar arası erişim</h2>${storage.isCloud() ? `<p><b>${esc(storage.currentEmail())}</b></p><p>Kitaplığın hesabına kaydediliyor. Başka bir cihazda aynı hesapla giriş yapabilirsin.</p><button class="button secondary" id="logout">Çıkış yap</button>${!library.books.length ? '<button class="button primary" id="upload-local">Tarayıcı kitaplığını buluta aktar</button>' : ''}` : storage.cloudConfigured() ? '<form id="login-form"><label>E-posta<input type="email" name="email" required autocomplete="username"></label><label>Şifre<input type="password" name="password" required autocomplete="current-password"></label><p id="login-error" class="form-error" role="alert"></p><button class="button primary">Giriş yap</button></form><p class="field-help">Giriş yaptığında bulut kitaplığın açılır. Bu tarayıcıdaki kitaplık ayrıca korunur.</p>' : '<p class="notice">Bulut bağlantısı henüz kurulmadı.</p><p>Şimdilik kitapların yalnızca bu tarayıcıda tutulur. Tarayıcı verileri temizlenirse yedeği olmayan kayıtlar kaybolabilir.</p><p class="field-help">Supabase bağlantısı ve hesap kurulumu tamamlandığında burada giriş alanı açılacak.</p>'}</section></div>`;
  $('#export-json').onclick = () => download(`reading-follow-up-${today()}.json`, JSON.stringify(library, null, 2), 'application/json');
  $('#export-csv').onclick = () => {
    const cell = v => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, c => "'" + c).replaceAll('"', '""') + '"';
    const rows = [['Book Id','Title','Author','Additional Authors','ISBN','ISBN13','My Rating','Publisher','Year Published','Number of Pages','Date Read','Date Added','Bookshelves','Exclusive Shelf','My Review','Read Count'], ...library.books.map(b => [b.goodreadsId,b.title,b.authors[0],b.authors.slice(1).join(', '),b.isbn10,b.isbn,b.rating,b.publisher,b.publishedDate,b.pageCount,readDate(b),b.dateAdded,library.shelves.filter(s => b.shelfIds.includes(s.id)).map(s => s.name).join(', '),b.status,b.notes,b.history.filter(h => h.completed).length])];
    download(`reading-follow-up-${today()}.csv`, '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  $('#restore-json').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try { if (file.size > 20000000) throw new Error('Dosya çok büyük.'); const data = validateLibrary(JSON.parse(await file.text())); if (confirm(`${data.books.length} kitap ve ${data.shelves.length} raf geri yüklenecek. Mevcut ${library.books.length} kitaplık kayıt değiştirilsin mi?`)) await commit(data, 'JSON yedeği geri yüklendi.'); } catch (error) { toast(error.message, true); }
  };
  if ($('#login-form')) $('#login-form').onsubmit = async e => { e.preventDefault(); const form = e.currentTarget; form.querySelector('button').disabled = true; try { library = await storage.login(form.elements.email.value, form.elements.password.value); importResult = null; render(); toast('Bulut kitaplığın açıldı.'); } catch (error) { $('#login-error').textContent = error.message; form.querySelector('button').disabled = false; } };
  if ($('#logout')) $('#logout').onclick = async () => { library = await storage.logout(); importResult = null; render(); };
  if ($('#upload-local')) $('#upload-local').onclick = async () => { try { const local = storage.localData().data; if (confirm(`Bu tarayıcıdaki ${local.books.length} kitap boş bulut kitaplığına aktarılsın mı?`)) await commit(local, 'Tarayıcı kitaplığın buluta aktarıldı.'); } catch (e) { toast(e.message, true); } };
}
window.addEventListener('storage', e => { if (e.key === 'reading-follow-up:v1' && !storage.isCloud()) toast('Kitaplık başka sekmede değişti. Güncel kayıtları görmek için sayfayı yenile.', true); });
try { library = await storage.restoreSession(); render(); }
catch (error) { $('#app').innerHTML = `<main class="startup-error"><h1>Kitaplık açılamadı</h1><p>${esc(error.message)}</p><button class="button primary" id="retry">Yeniden dene</button><button class="button secondary" id="local-mode">Bu tarayıcıdaki kitaplığı aç</button></main>`; $('#retry').onclick = () => location.reload(); $('#local-mode').onclick = async () => { try { library = await storage.logout(); render(); } catch (e) { toast(e.message, true); } }; }
