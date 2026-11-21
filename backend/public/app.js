/* Shared front-end logic: loads the marketplace from the API (GET /api/bootstrap), talks to the API for every change,
   and holds the navigation, footer and display helpers. The data lives in Supabase; nothing but the
   "simulated AI only" switch is kept in this browser. */
(function () {
  'use strict';

  const PREF_KEY = 'fwm_prefs_v1';
  const CITIES = ['Cairo', 'Giza', 'Alexandria', 'El Mahalla El Kubra', 'Shubra El Kheima', '10th of Ramadan City', 'Port Said', 'Mansoura'];
  const UNITS = ['meters', 'kg', 'pieces'];
  const CONDITIONS = ['new', 'like new', 'used', 'damaged'];
  const STATUSES = ['available', 'reserved', 'sold'];
  const ROLES = ['buyer', 'seller'];
  const UNIT_ONE = { meters: 'meter', kg: 'kg', pieces: 'piece' };

  let state = null;

  /* ---------- small helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const sid = (n) => '00000000-0000-4000-8000-' + ('000000000000' + n).slice(-12);
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
  const ago = (days, hours) => new Date(Date.now() - days * 864e5 - (hours || 0) * 36e5).toISOString();
  const fmtPrice = (p) => Number(p).toLocaleString('en-US', { maximumFractionDigits: 2 });

  function timeAgo(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    const d = Math.floor(s / 86400);
    if (d < 30) return d + (d === 1 ? ' day ago' : ' days ago');
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const monthYear = (iso) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  function waShow(n) { return String(n || '').replace(/^\+20(\d{3})(\d{3})(\d{4})$/, '+20 $1 $2 $3'); }
  function waNormalize(raw) {
    const d = String(raw || '').replace(/[\s\-()]/g, '');
    if (/^01[0125]\d{8}$/.test(d)) return '+20' + d.slice(1);
    if (/^\+?201[0125]\d{8}$/.test(d)) return '+' + d.replace('+', '');
    return null;
  }

  /* ---------- placeholder product art (data URIs, used as listing_photos.image_url) ---------- */
  /* Photographic finish for the generated art: cloth relief (diffuse lighting on turbulence), fine grain,
     a soft studio light and a vignette. Applied to every placeholder image so they read as styled product shots. */
  function wrapSvg(inner) {
    const fx = '<defs>' +
      '<filter id="relief" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .018" numOctaves="3" seed="7" result="t"/>' +
      '<feDiffuseLighting in="t" surfaceScale="7" diffuseConstant="1.05" lighting-color="#fff"><feDistantLight azimuth="235" elevation="52"/></feDiffuseLighting></filter>' +
      '<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3"/><feColorMatrix type="saturate" values="0"/></filter>' +
      '<radialGradient id="vg" cx=".5" cy=".42" r=".8"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1b1208" stop-opacity=".30"/></radialGradient>' +
      '<linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient></defs>';
    const fin = '<rect width="400" height="300" filter="url(#relief)" style="mix-blend-mode:soft-light" opacity=".5"/>' +
      '<rect width="400" height="300" filter="url(#grain)" style="mix-blend-mode:overlay" opacity=".22"/>' +
      '<rect width="400" height="300" fill="url(#lg)"/><rect width="400" height="300" fill="url(#vg)"/>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">' + fx + inner + fin + '</svg>');
  }
  function art(kind, a, b) {
    const bg = '<rect width="400" height="300" fill="' + a + '"/>';
    let s = '', i, j;
    switch (kind) {
      case 'weave':
        s = bg + '<g stroke="' + b + '" stroke-opacity=".25" stroke-width="2">';
        for (i = 0; i <= 400; i += 8) s += '<line x1="' + i + '" y1="0" x2="' + i + '" y2="300"/>';
        for (j = 0; j <= 300; j += 8) s += '<line x1="0" y1="' + j + '" x2="400" y2="' + j + '"/>';
        s += '</g>'; break;
      case 'twill':
        s = bg + '<g stroke="' + b + '" stroke-opacity=".3" stroke-width="3">';
        for (i = -300; i < 400; i += 9) s += '<line x1="' + i + '" y1="300" x2="' + (i + 300) + '" y2="0"/>';
        s += '</g>'; break;
      case 'stripes':
        s = bg; for (i = 0; i < 400; i += 50) s += '<rect x="' + i + '" width="22" height="300" fill="' + b + '"/>'; break;
      case 'plaid':
        s = bg;
        for (i = 20; i < 400; i += 70) s += '<rect x="' + i + '" width="26" height="300" fill="' + b + '" fill-opacity=".45"/>';
        for (j = 10; j < 300; j += 60) s += '<rect y="' + j + '" width="400" height="22" fill="' + b + '" fill-opacity=".45"/>';
        break;
      case 'dots':
        s = bg; for (j = 0; j < 7; j++) for (i = 0; i < 9; i++) s += '<circle cx="' + (i * 48 + (j % 2 ? 24 : 0)) + '" cy="' + (j * 48 + 20) + '" r="9" fill="' + b + '"/>'; break;
      case 'floral':
        s = bg;
        [[70, 70], [220, 50], [340, 110], [130, 190], [290, 230], [40, 260], [380, 260]].forEach((p) => {
          for (let k = 0; k < 5; k++) {
            const t = k * 72 * Math.PI / 180;
            s += '<circle cx="' + (p[0] + Math.cos(t) * 18).toFixed(1) + '" cy="' + (p[1] + Math.sin(t) * 18).toFixed(1) + '" r="13" fill="' + b + '" fill-opacity=".85"/>';
          }
          s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="#fff" fill-opacity=".8"/>';
        });
        break;
      case 'satin':
        s = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset=".45" stop-color="' + b + '"/><stop offset=".6" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/>'; break;
      case 'roll': {
        /* studio shot of a fabric roll: wall, floor, cast shadow, cylinder shading, spiral edge */
        s = '<defs><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe9de"/><stop offset="1" stop-color="#d9d0c0"/></linearGradient>' +
          '<linearGradient id="cyl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient></defs>' +
          '<rect width="400" height="300" fill="url(#wall)"/><rect y="215" width="400" height="85" fill="#c9bfae" fill-opacity=".55"/>' +
          '<ellipse cx="205" cy="243" rx="170" ry="16" fill="#2a1d0e" fill-opacity=".28"/>' +
          '<rect x="70" y="95" width="250" height="140" rx="4" fill="' + a + '"/><rect x="70" y="95" width="250" height="140" fill="url(#cyl)"/>' +
          '<g stroke="' + b + '" stroke-opacity=".22" stroke-width="1.4">';
        for (i = 104; i < 235; i += 7) s += '<line x1="70" y1="' + i + '" x2="320" y2="' + i + '"/>';
        s += '</g><ellipse cx="320" cy="165" rx="36" ry="70" fill="' + a + '"/><ellipse cx="320" cy="165" rx="36" ry="70" fill="url(#cyl)"/>' +
          '<ellipse cx="70" cy="165" rx="36" ry="70" fill="' + b + '" fill-opacity=".85"/><ellipse cx="70" cy="165" rx="30" ry="58" fill="' + a + '"/><ellipse cx="70" cy="165" rx="22" ry="43" fill="none" stroke="' + b + '" stroke-opacity=".5" stroke-width="2"/><ellipse cx="70" cy="165" rx="14" ry="27" fill="none" stroke="' + b + '" stroke-opacity=".5" stroke-width="2"/><ellipse cx="70" cy="165" rx="7" ry="13" fill="#6b5a40"/>' +
          '<path d="M320 95 C352 98 372 130 360 175 C354 205 336 230 320 235" fill="' + a + '" stroke="' + b + '" stroke-opacity=".35" stroke-width="1.5"/>';
        break; }
      case 'dress':
      case 'shirt':
      case 'coat': {
        /* garment on a hanger against a studio wall, with cast shadow, side shading, seams and collar detail */
        const P = {
          dress: 'M168 62 L200 84 L232 62 L254 112 L238 138 L286 272 L114 272 L162 138 L146 112 Z',
          shirt: 'M146 64 L200 82 L254 64 L334 116 L306 160 L272 140 L272 262 L128 262 L128 140 L94 160 L66 116 Z',
          coat: 'M142 58 L200 80 L258 58 L336 104 L322 268 L78 268 L64 104 Z'
        }[kind];
        s = '<defs><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + a + '" stop-opacity=".82"/></linearGradient>' +
          '<linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".30"/><stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".14"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>' +
          '<clipPath id="gc"><path d="' + P + '"/></clipPath></defs>' +
          '<rect width="400" height="300" fill="url(#wall)"/><rect width="400" height="300" fill="#fff" fill-opacity=".12"/>' +
          '<ellipse cx="206" cy="284" rx="118" ry="9" fill="#1d1408" fill-opacity=".26"/>' +
          '<path d="M200 22 L200 40 C212 40 218 50 210 56 L200 62" fill="none" stroke="#7a6a52" stroke-width="3" stroke-linecap="round"/>' +
          '<path d="M200 62 L150 84 M200 62 L250 84" stroke="#7a6a52" stroke-width="3" stroke-linecap="round"/>' +
          '<g transform="translate(5 6)" opacity=".22"><path d="' + P + '" fill="#000"/></g>' +
          '<path d="' + P + '" fill="' + b + '"/><g clip-path="url(#gc)"><rect width="400" height="300" fill="url(#sh)"/>' +
          '<path d="M150 150 C158 190 150 230 142 270 M250 150 C242 190 250 230 258 270 M200 120 C196 170 204 220 200 270" stroke="#000" stroke-opacity=".16" stroke-width="5" fill="none" stroke-linecap="round"/>' +
          '<path d="M176 100 C180 160 176 220 172 272 M226 100 C222 160 226 220 230 272" stroke="#fff" stroke-opacity=".12" stroke-width="9" fill="none" stroke-linecap="round"/></g>' +
          '<path d="' + P + '" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.4"/>';
        if (kind === 'dress') s += '<path d="M164 138 L238 138" stroke="#fff" stroke-opacity=".5" stroke-width="3"/><path d="M164 138 L238 138" stroke="#000" stroke-opacity=".2" stroke-width="1" stroke-dasharray="4 3" transform="translate(0 4)"/>';
        if (kind === 'shirt') s += '<path d="M200 82 L200 262" stroke="#fff" stroke-opacity=".55" stroke-width="2.5"/><path d="M146 64 L168 96 L200 82 L232 96 L254 64" fill="' + b + '" stroke="#fff" stroke-opacity=".45" stroke-width="2"/><g fill="#fff" fill-opacity=".85">' + [112, 142, 172, 202, 232].map(function (y) { return '<circle cx="200" cy="' + y + '" r="3"/>'; }).join('') + '</g>';
        if (kind === 'coat') s += '<path d="M200 80 L172 150 L200 270 M200 80 L228 150 L200 270" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="2.5"/><path d="M142 58 L172 150 L200 80 L228 150 L258 58" fill="#000" fill-opacity=".18"/><g fill="#000" fill-opacity=".55">' + [170, 205, 240].map(function (y) { return '<circle cx="214" cy="' + y + '" r="4"/>'; }).join('') + '</g>';
        break; }
      case 'buttons':
        s = bg;
        for (j = 0; j < 3; j++) for (i = 0; i < 5; i++) {
          const cx = 50 + i * 75 + (j % 2 ? 20 : 0), cy = 55 + j * 95;
          s += '<circle cx="' + cx + '" cy="' + cy + '" r="27" fill="' + b + '"/><g fill="' + a + '"><circle cx="' + (cx - 8) + '" cy="' + (cy - 8) + '" r="4"/><circle cx="' + (cx + 8) + '" cy="' + (cy - 8) + '" r="4"/><circle cx="' + (cx - 8) + '" cy="' + (cy + 8) + '" r="4"/><circle cx="' + (cx + 8) + '" cy="' + (cy + 8) + '" r="4"/></g>';
        }
        break;
      case 'zip':
        s = bg + '<rect x="170" width="60" height="300" fill="' + b + '" fill-opacity=".35"/>';
        for (j = 0; j < 300; j += 18) s += '<rect x="' + (j % 36 ? 186 : 198) + '" y="' + j + '" width="16" height="10" rx="2" fill="' + b + '"/>';
        break;
      case 'belt':
        s = bg + '<rect x="20" y="120" width="360" height="56" rx="8" fill="' + b + '"/><rect x="150" y="104" width="76" height="88" rx="8" fill="none" stroke="#e8e8e8" stroke-width="10"/><g fill="' + a + '" fill-opacity=".6">' + [260, 290, 320, 350].map((x) => '<circle cx="' + x + '" cy="148" r="5"/>').join('') + '</g>'; break;
    }
    return wrapSvg(s);
  }

  /* ---------- state: filled from the server by GET /api/bootstrap ---------- */
  state = { categories: [], listings: [], photos: [], orders: [], saved: [], profiles: [], prefs: {}, impact: [], feed: [], aiMode: 'auto', session: { userId: null } };
  try { if ((JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}).aiMode === 'sim') state.aiMode = 'sim'; } catch (e) { /* ignore */ }
  // Only the "simulated AI only" switch is remembered in this browser. Everything else lives in the database.
  function save() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ aiMode: state.aiMode })); return true; } catch (e) { return false; }
  }

  /* ---------- talking to the API ---------- */
  async function api(method, path, body) {
    let res;
    try {
      res = await fetch('/api' + path, {
        method, credentials: 'same-origin',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw new Error('Could not reach the server. Check your connection and try again.'); }
    let data = null;
    if (res.status !== 204) { try { data = await res.json(); } catch (e) { data = null; } }
    if (!res.ok) {
      const list = data && Array.isArray(data.details) && data.details.length ? data.details.join(' ') : '';
      const err = new Error(list || (data && data.error) || 'Something went wrong. Please try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function applyBootstrap(d) {
    state.categories = d.categories || []; state.listings = d.listings || []; state.photos = d.photos || [];
    state.profiles = d.profiles || []; state.orders = d.orders || []; state.saved = d.saved || [];
    state.impact = d.impact || []; state.feed = d.feed || [];
    state.session.userId = d.me ? d.me.id : null;
    state.prefs = d.me && d.prefs ? { [d.me.id]: d.prefs } : {};
    if (d.me) {
      const i = state.profiles.findIndex((p) => p.id === d.me.id);
      if (i >= 0) state.profiles[i] = Object.assign({}, state.profiles[i], d.me); else state.profiles.push(d.me);
    }
  }

  let loadError = null;
  const readyPromise = (function () {
    // A direct link to one listing (listing.html#<id>) also asks for that listing, even if it is sold or reserved.
    const m = /^#([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(location.hash);
    const q = m && /listing\.html$/.test(location.pathname) ? '?listing=' + m[1] : '';
    return api('GET', '/bootstrap' + q).then(applyBootstrap, (e) => { loadError = e; });
  })();

  /* Runs a page's code once the data has loaded. If it could not load, shows a retry message instead. */
  function whenReady(fn) {
    readyPromise.then(() => {
      if (loadError) {
        const main = document.querySelector('main') || document.body;
        main.innerHTML = '<div class="narrow"><div class="panel stack"><h1>We could not load the marketplace</h1><p class="muted">' + esc(loadError.message) + '</p><button type="button" class="btn btn-primary" onclick="location.reload()">Try again</button></div></div>';
        return;
      }
      fn();
    });
  }

  /* ---------- data access ---------- */
  const me = () => state.profiles.find((p) => p.id === state.session.userId) || null;
  const profile = (id) => state.profiles.find((p) => p.id === id) || null;
  const category = (id) => state.categories.find((c) => c.id === id) || null;
  const listing = (id) => state.listings.find((l) => l.id === id) || null;
  const photosOf = (id) => state.photos.filter((p) => p.listing_id === id).sort((a, b) => a.position - b.position);
  const coverOf = (id) => { const p = photosOf(id)[0]; return p ? p.image_url : null; };

  /* ---------- saved items and orders ---------- */
  const isSaved = (userId, listingId) => state.saved.some((s) => s.user_id === userId && s.listing_id === listingId);
  const savesOf = (listingId) => state.saved.filter((s) => s.listing_id === listingId).length;
  function toggleSave(listingId) {
    const u = me(); if (!u) return null;
    const i = state.saved.findIndex((s) => s.user_id === u.id && s.listing_id === listingId);
    if (i >= 0) {
      const old = state.saved.splice(i, 1)[0];
      api('DELETE', '/saved/' + listingId).catch((e) => { state.saved.push(old); toast(e.message); });
    } else {
      const item = { id: uid(), created_at: new Date().toISOString(), user_id: u.id, listing_id: listingId };
      state.saved.push(item);
      api('PUT', '/saved/' + listingId).catch((e) => { const j = state.saved.indexOf(item); if (j >= 0) state.saved.splice(j, 1); toast(e.message); });
    }
    return i < 0;
  }
  const ordersWhere = (fn) => state.orders.filter(fn).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  async function createOrder(listingId, qty, note) {
    const d = await api('POST', '/orders', { listing_id: listingId, quantity: qty, note: note || '' });
    state.orders.push(d.order);
    return d.order;
  }
  async function setOrderStatus(id, status) {
    const d = await api('PATCH', '/orders/' + id, { status });
    const i = state.orders.findIndex((x) => x.id === id);
    if (i >= 0) state.orders[i] = d.order; else state.orders.push(d.order);
    if (d.listing) { const l = listing(d.listing.id); if (l) { l.status = d.listing.status; l.quantity = d.listing.quantity; } }
    return d.order;
  }

  /* ---------- listings, profile, preferences, accounts ---------- */
  async function createListing(payload) {
    const d = await api('POST', '/listings', payload);
    const photos = d.photos || []; delete d.photos;
    state.listings.unshift(d);
    photos.forEach((p) => state.photos.push(p));
    return d;
  }
  async function updateListing(id, patch) {
    const d = await api('PATCH', '/listings/' + id, patch);
    const l = listing(id); if (l) Object.assign(l, d);
    return d;
  }
  async function deleteListing(id) {
    await api('DELETE', '/listings/' + id);
    state.listings = state.listings.filter((l) => l.id !== id);
    state.photos = state.photos.filter((p) => p.listing_id !== id);
    state.saved = state.saved.filter((s) => s.listing_id !== id);
    state.orders = state.orders.filter((o) => o.listing_id !== id);
  }
  async function saveProfile(patch) {
    const d = await api('PATCH', '/profiles/me', patch);
    const i = state.profiles.findIndex((p) => p.id === state.session.userId);
    if (i >= 0) state.profiles[i] = Object.assign({}, state.profiles[i], d); else state.profiles.push(d);
    return d;
  }
  function savePrefs(p) {
    api('PUT', '/preferences', p).catch((e) => toast('Preferences were not saved: ' + e.message));
  }
  const signIn = (email, password) => api('POST', '/auth/login', { email, password });
  const signUp = (payload) => api('POST', '/auth/register', payload);
  const pendingFor = (userId) => state.orders.filter((o) => o.seller_id === userId && o.status === 'requested').length;
  const ORDER_LABEL = { requested: 'Requested', accepted: 'Accepted', declined: 'Declined', completed: 'Completed', cancelled: 'Cancelled' };
  const orderBadge = (s) => '<span class="badge o-' + esc(s) + '">' + (ORDER_LABEL[s] || cap(s)) + '</span>';
  const fabricName = (v) => (window.AI ? AI.fabricLabel(v) : cap(v));

  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-9.2C1.8 7.6 3.7 5 6.5 5c1.8 0 3.1 1 3.9 2.3h.2C11.4 6 12.7 5 14.5 5c2.8 0 4.7 2.6 3.5 5.8C19 15.600 12 20 12 20z" transform="translate(0 .4)"/></svg>';
  function cardHTML(l) {
    const u = me(), on = u && isSaved(u.id, l.id), canSave = !u || u.role === 'buyer';
    return '<article class="card">' +
      '<a class="card-link" href="listing.html#' + l.id + '">' + media(coverOf(l.id), l.title).replace(/<\/div>$/, '<span class="tag">' + esc(fabricName(l.fabric_type)) + '</span></div>') +
      '<div class="card-body"><div class="price">' + priceHTML(l, true) + '</div>' +
      '<div class="card-title">' + esc(l.title) + '</div>' +
      '<div class="card-meta">' + l.quantity + ' ' + l.unit + ' · ' + esc(l.city) + '</div>' +
      '<div class="card-foot"><span class="chip">' + cap(l.condition) + '</span></div></div></a>' +
      (canSave ? '<button type="button" class="save" data-save="' + l.id + '" aria-pressed="' + (!!on) + '" aria-label="' + (on ? 'Remove from saved: ' : 'Save: ') + esc(l.title) + '">' + HEART + '</button>' : '') + '</article>';
  }
  /* One delegated handler per container: saves/unsaves and tells logged-out visitors to log in. */
  function bindSave(root, onChange) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-save]'); if (!b) return;
      e.preventDefault();
      if (!me()) { toast('Log in to save items.'); return; }
      const id = b.getAttribute('data-save'), on = toggleSave(id);
      b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', (on ? 'Remove from saved' : 'Save'));
      toast(on ? 'Saved. Find it on your dashboard.' : 'Removed from saved.');
      if (onChange) onChange(id, on);
    });
  }

  /* ---------- rendering helpers ---------- */
  const NOIMG = '<div class="noimg" role="img" aria-label="No photo">No photo</div>';
  const media = (url, alt) => '<div class="media">' + (url ? '<img src="' + esc(url) + '" alt="' + esc(alt || '') + '" loading="lazy">' : NOIMG) + '</div>';
  const badge = (s) => '<span class="badge b-' + esc(s) + '">' + cap(s) + '</span>';
  const initials = (n) => String(n).trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase();
  const avatar = (p, cls) => '<span class="avatar ' + (cls || '') + '" aria-hidden="true">' + (p.avatar_url ? '<img src="' + esc(p.avatar_url) + '" alt="">' : esc(initials(p.full_name))) + '</span>';
  const priceHTML = (l, withUnit) => l.is_free
    ? '<span class="chip chip-free">FREE</span>'
    : 'EGP ' + fmtPrice(l.price) + (withUnit ? ' <small>/ ' + UNIT_ONE[l.unit] + '</small>' : '');

  function fillSelect(sel, options, placeholder, labelFn) {
    sel.innerHTML = (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') +
      options.map((o) => { const v = typeof o === 'object' ? o.id : o; const t = typeof o === 'object' ? o.name : (labelFn ? labelFn(o) : o); return '<option value="' + esc(v) + '">' + esc(t) + '</option>'; }).join('');
  }

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function flash(msg) { try { sessionStorage.setItem('fwm_flash', msg); } catch (e) { /* ignore */ } }
  function takeFlash() { try { const m = sessionStorage.getItem('fwm_flash'); if (m) sessionStorage.removeItem('fwm_flash'); return m; } catch (e) { return null; } }

  function resizeImage(file, max, q) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error('read'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('image'));
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
          try {
            let k2 = q, out = c.toDataURL('image/jpeg', k2);
            while (out.length > 330000 && k2 > 0.3) { k2 -= 0.15; out = c.toDataURL('image/jpeg', k2); } // keep each picture small enough to upload
            resolve(out);
          } catch (e) { reject(e); }
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* ---------- navigation ---------- */
  const ICON = {
    browse: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    ai: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    impact: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c2-4 5-7 9-9"/>',
    dash: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="4" rx="1.5"/><rect x="13" y="10" width="7" height="10" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/>',
    sell: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    mine: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    saved: '<path d="M12 20s-7-4.4-9-9.2C1.8 7.6 3.7 5 6.5 5c1.8 0 3.1 1 3.9 2.3h.2C11.4 6 12.7 5 14.5 5c2.8 0 4.7 2.6 3.5 5.8C19 15.6 12 20 12 20z"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    login: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l4 4-4 4M14 12H4"/>',
    logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H10"/>',
    wa: '<path d="M21 12a9 9 0 0 1-13.4 7.8L3 21l1.3-4.4A9 9 0 1 1 21 12z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>'
  };
  const svg = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>';

  async function logout() {
    try { await api('POST', '/auth/logout'); } catch (e) { /* the cookie may already be gone */ }
    flash('You are logged out.');
    location.href = 'index.html';
  }

  function openMenu(trigger, user, active) {
    const ov = document.createElement('div');
    ov.className = 'overlay sheet-wrap';
    const link = (k, href, label, key) => '<a href="' + href + '"' + (active === key ? ' aria-current="page"' : '') + '>' + svg(k) + '<span>' + label + '</span></a>';
    ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="More">' +
      '<div class="sheet-head"><strong>More</strong><button type="button" class="sheet-close" aria-label="Close menu">×</button></div>' +
      link('impact', 'impact.html', 'Sustainability impact', 'impact') +
      (!user || user.role === 'seller' ? link('mine', 'my-listings.html', 'My listings', 'mine') : '') +
      (!user ? link('saved', 'dashboard.html#saved', 'Saved items', 'saved') : '') +
      link('profile', 'profile.html', 'Profile', 'profile') +
      (user ? '<button type="button" data-logout>' + svg('logout') + '<span>Log out</span></button>' : link('login', 'auth.html', 'Log in or sign up', 'auth')) + '</div>';
    document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); if (trigger) trigger.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.sheet-close').addEventListener('click', close);
    const lo = ov.querySelector('[data-logout]'); if (lo) lo.addEventListener('click', logout);
    ov.querySelector('.sheet-close').focus();
  }

  function renderNav(active) {
    const el = document.getElementById('nav');
    if (!el) return;
    const user = me(), pending = user ? pendingFor(user.id) : 0;
    const items = [['browse', 'index.html', 'Browse', 'browse'], ['ai', 'ai-studio.html', 'AI Studio', 'ai'], ['impact', 'impact.html', 'Impact', 'impact'], ['dash', 'dashboard.html', 'Dashboard', 'dash'], ['sell', 'create.html', 'Sell', 'create']];
    const link = (it) => '<a href="' + it[1] + '"' + (active === it[3] ? ' aria-current="page"' : '') + '>' + svg(it[0]) + '<span>' + it[2] + '</span>' + (it[3] === 'dash' && pending ? '<span class="count" aria-label="' + pending + ' new requests">' + pending + '</span>' : '') + '</a>';
    const isBuyer = !!user && user.role === 'buyer', isSeller = !!user && user.role === 'seller';
    // Buyers do not see Sell; sellers do. Visitors see both so they know what the site offers.
    const navItems = isBuyer ? items.filter((it) => it[3] !== 'create') : items;
    const tabThird = isBuyer ? ['saved', 'dashboard.html#saved', 'Saved', 'saved'] : items[4];
    const tabItems = [items[0], items[1], tabThird, items[3]];
    const authTop = user
      ? '<a href="profile.html"' + (active === 'profile' ? ' aria-current="page"' : '') + '>' + svg('profile') + '<span>Profile</span></a><button type="button" data-logout>' + svg('logout') + '<span>Log out</span></button>'
      : '<a class="cta" href="auth.html"' + (active === 'auth' ? ' aria-current="page"' : '') + '>' + svg('login') + '<span>Log in</span></a>';
    const moreActive = ['impact', 'mine', 'profile', 'auth'].concat(isBuyer ? [] : ['saved']).indexOf(active) !== -1;
    el.innerHTML =
      '<div class="announce">Textile surplus from across Egypt · Contact sellers directly on WhatsApp</div>' +
      '<header class="topbar"><div class="wrap gutter bar">' +
      '<a class="brand" href="index.html"><span class="brand-mark"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg></span><span class="brand-name">Fashion Waste Marketplace</span></a>' +
      '<nav class="toplinks" aria-label="Main">' + navItems.map(link).join('') + authTop + '</nav>' +
      (user ? '<div class="whoami">' + avatar(user) + '<span>' + esc(user.full_name.split(' ')[0]) + '</span></div>' : '') +
      '</div></header>' +
      '<nav class="tabbar" aria-label="Main"><div class="wrap gutter tabs">' + tabItems.map(link).join('') +
      '<button type="button" id="menu-btn" aria-haspopup="dialog"' + (moreActive ? ' class="on"' : '') + '>' + svg('menu') + '<span>More</span></button></div></nav>';
    el.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', logout));
    document.getElementById('menu-btn').addEventListener('click', (e) => openMenu(e.currentTarget, user, active));
    decoratePage(active);
    const note = takeFlash(); if (note) toast(note);
  }

  /* Decorative imagery for inner pages: a fabric-swatch banner under the nav, or a split image panel on the log-in page. */
  const BANNERS = {
    ai: 'Smart tools for every offcut.', impact: 'Every metre kept in use counts.', dash: 'Your marketplace at a glance.',
    create: 'Give your surplus a second life.', mine: 'Your materials, ready for new owners.', profile: 'Your details, one place.', saved: 'Pieces you want to come back to.'
  };
  const TILES = [['twill', '#4C6E99', '#243A5A'], ['satin', '#F3ECDD', '#D9CCAF'], ['weave', '#E5DCC8', '#A89A78'], ['floral', '#F7EEE8', '#D99A8F'], ['weave', '#2B3F5E', '#0F1B2E'], ['stripes', '#EAF0E5', '#6D9A74']];
  function decoratePage(active) {
    const main = document.querySelector('main.page'); if (!main || main.querySelector('.pagebanner, .auth-art')) return;
    if (active === 'auth') {
      main.classList.add('auth-split');
      const a = document.createElement('aside'); a.className = 'auth-art'; a.setAttribute('aria-hidden', 'true');
      a.innerHTML = '<div class="auth-tiles">' + [['dress', '#EADBC8', '#B4553D'], ['twill', '#4C6E99', '#243A5A'], ['roll', '#F7F7F5', '#C9CFD1'], ['satin', '#F3ECDD', '#D9CCAF']].map((t) => '<img alt="" src="' + art(t[0], t[1], t[2]) + '">').join('') + '</div><p>Fabric with a past.<br><em>Fashion with a future.</em></p>';
      main.insertBefore(a, main.firstChild); return;
    }
    const line = BANNERS[active]; if (!line) return;
    const d = document.createElement('div'); d.className = 'pagebanner'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML = TILES.map((t) => '<img alt="" src="' + art(t[0], t[1], t[2]) + '">').join('') + '<p>' + line + '</p>';
    main.insertBefore(d, main.firstChild);
  }

  function footer() {
    const el = document.getElementById('foot');
    if (!el) return;
    const u = me(), buyer = u && u.role === 'buyer';
    el.className = 'sitefoot';
    el.innerHTML = '<div class="sf-grid"><div class="sf-brand"><strong>Fashion Waste Marketplace</strong><p>A marketplace for leftover fabric, unsold stock and pre-loved garments across Egypt.</p></div>' +
      '<nav aria-label="Marketplace"><h3>Marketplace</h3><a href="index.html#browse">Browse materials</a><a href="ai-studio.html">AI Studio</a><a href="impact.html">Impact</a></nav>' +
      '<nav aria-label="Account"><h3>Your account</h3>' + (u ? '<a href="dashboard.html">Dashboard</a>' : '<a href="auth.html">Log in or sign up</a>') + (u && u.role === 'seller' ? '<a href="my-listings.html">My listings</a>' : '') + (buyer ? '' : '<a href="create.html">Sell materials</a>') + (u ? '<a href="profile.html">Profile</a>' : '') + '</nav></div>' +
      '<div class="sf-note"><span>Buyers and sellers arrange payment and pickup directly on WhatsApp. No payments are taken on this site.</span></div>';
  }

  /* Shows a message instead of the page when the visitor must log in or must be a seller. Returns true when allowed. */
  function gate(container, needSeller) {
    const user = me();
    if (!user) {
      container.innerHTML = '<div class="narrow"><div class="panel stack"><h1>Log in to continue</h1><p class="muted">You need an account to use this page. Logging in or signing up takes a few seconds.</p><a class="btn btn-primary" href="auth.html">Log in or sign up</a></div></div>';
      return false;
    }
    if (needSeller && user.role !== 'seller') {
      container.innerHTML = '<div class="narrow"><div class="panel stack"><h1>Selling is off for your account</h1><p class="muted">Your role is Buyer, and only Seller accounts can post and manage listings. You can switch to Seller in your profile.</p><a class="btn btn-primary" href="profile.html">Switch to Seller in profile</a></div></div>';
      return false;
    }
    return true;
  }

  window.App = {
    CITIES, UNITS, CONDITIONS, STATUSES, ROLES, UNIT_ONE, ORDER_LABEL,
    get state() { return state; },
    save, me, profile, category, listing, photosOf, coverOf, uid, art,
    esc, cap, timeAgo, monthYear, fmtPrice, waShow, waNormalize, art,
    media, badge, orderBadge, avatar, priceHTML, fillSelect, toast, flash, resizeImage, fabricName,
    isSaved, savesOf, toggleSave, ordersWhere, createOrder, setOrderStatus, pendingFor, cardHTML, bindSave,
    renderNav, footer, gate, logout, svg,
    api, whenReady, createListing, updateListing, deleteListing, saveProfile, savePrefs, signIn, signUp
  };
})();
