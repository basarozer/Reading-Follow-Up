import { emptyLibrary, validateLibrary } from './core.js';
const KEY = 'reading-follow-up:v1';
let revision = 0, session = null, cloud = false;
const config = () => window.READING_CONFIG || {};
export const cloudConfigured = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config().supabaseUrl) && !!config().supabaseKey;
export const isCloud = () => cloud;
export const currentEmail = () => session?.user?.email || '';
export function localData() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { revision: 0, data: emptyLibrary() };
  let saved;
  try { saved = JSON.parse(raw); validateLibrary(saved.data); } catch { throw new Error('Tarayıcı kaydı okunamadı. Mevcut kayıt korunuyor; JSON yedeğinle kurtarma yapmadan yeni veri yazılmayacak.'); }
  return saved;
}
async function api(path, body, auth = true) {
  const r = await fetch(config().supabaseUrl + path, { method: 'POST', headers: { apikey: config().supabaseKey, 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + session.access_token } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await r.json();
  if (!r.ok) throw new Error(result.message || result.error_description || result.msg || 'Bulut işlemi başarısız.');
  return result;
}
async function refresh() {
  if (!session) throw new Error('Tekrar giriş yap.');
  if ((session.expires_at || 0) * 1000 > Date.now() + 60000) return;
  session = await api('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token }, false);
  sessionStorage.setItem('reading-session', JSON.stringify(session));
}
export async function load() {
  if (!cloud) { const s = localData(); revision = s.revision; return s.data; }
  await refresh();
  const s = await api('/rest/v1/rpc/load_library', {});
  revision = s.revision;
  return validateLibrary(s.data);
}
export async function save(data) {
  validateLibrary(data);
  if (cloud) {
    await refresh();
    const result = await api('/rest/v1/rpc/save_library', { expected_revision: revision, next_data: data });
    revision = result.revision;
  } else {
    const write = () => {
      if (localData().revision !== revision) throw new Error('Başka sekmede değişiklik var. Sayfayı yenile ve yeniden dene; kayıtların üzerine yazılmadı.');
      const next = revision + 1;
      try { localStorage.setItem(KEY, JSON.stringify({ revision: next, data })); } catch { throw new Error('Tarayıcıya kaydedilemedi. Depolama alanını kontrol et ve JSON yedeği al.'); }
      revision = next;
    };
    if (navigator.locks) await navigator.locks.request(KEY, write); else write();
  }
}
export async function login(email, password) {
  if (!cloudConfigured()) throw new Error('Bulut bağlantısı henüz yapılandırılmadı.');
  session = await api('/auth/v1/token?grant_type=password', { email, password }, false);
  sessionStorage.setItem('reading-session', JSON.stringify(session)); cloud = true;
  try { return await load(); } catch (error) { cloud = false; session = null; sessionStorage.removeItem('reading-session'); throw error; }
}
export async function restoreSession() {
  if (cloudConfigured()) {
    try { session = JSON.parse(sessionStorage.getItem('reading-session')); } catch { session = null; }
    if (session) cloud = true;
  }
  return load();
}
export async function logout() {
  sessionStorage.removeItem('reading-session'); session = null; cloud = false;
  return load();
}
