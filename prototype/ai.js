/* AI layer for the prototype.
   Every feature has two engines and every result says which one produced it:
   - "live":      Claude, called through the preview's `sample` capability (only when the viewer allows it)
   - "simulated": fixed rules, sample price tables and simple image statistics that run in the browser
   Nothing here is a trained model of our own. */
(function () {
  'use strict';

  const FABRICS = [['cotton', 'Cotton'], ['polyester', 'Polyester'], ['denim', 'Denim'], ['linen', 'Linen'], ['viscose', 'Viscose'], ['wool', 'Wool blend'], ['satin', 'Satin / silk'], ['jersey', 'Jersey knit'], ['leather', 'Leather'], ['terry', 'Terry'], ['other', 'Mixed / other']];
  const FABRIC_LABEL = {}; FABRICS.forEach((f) => { FABRIC_LABEL[f[0]] = f[1]; });
  const fabricLabel = (v) => FABRIC_LABEL[v] || 'Mixed / other';

  /* ---------- impact factors (placeholders, shown to users as assumptions) ---------- */
  const FACTORS = { metersToKg: 0.22, pieceKg: { 'New clothing': 0.35, 'Used clothing': 0.4, 'Trims & accessories': 0.02, 'Fabric': 0.3 }, co2PerKg: 10, waterPerKg: 5000, tshirtKg: 0.2 };
  const catName = (id) => { const c = App.category(id); return c ? c.name : 'Fabric'; };
  function kgOf(qty, unit, categoryName) {
    const q = Number(qty) || 0;
    if (unit === 'kg') return q;
    if (unit === 'meters') return q * FACTORS.metersToKg;
    return q * (FACTORS.pieceKg[categoryName] || 0.3);
  }
  const listingKg = (l, qty) => kgOf(qty == null ? l.quantity : qty, l.unit, catName(l.category_id));
  const impactOf = (kg) => ({ kg: kg, co2: kg * FACTORS.co2PerKg, water: kg * FACTORS.waterPerKg, tshirts: kg / FACTORS.tshirtKg });
  const orderKg = (o) => { const l = App.listing(o.listing_id); return l ? kgOf(o.quantity, l.unit, catName(l.category_id)) : 0; };
  const sumKg = (orders) => orders.reduce((a, o) => a + orderKg(o), 0);
  const availableKg = () => App.state.listings.filter((l) => l.status === 'available').reduce((a, l) => a + listingKg(l), 0);
  const fmt = (n, d) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d });

  /* ---------- engine availability ---------- */
  let samplePromise = null;
  function getSample() {
    if (!samplePromise) {
      samplePromise = (async () => {
        try {
          if (!window.claude || typeof window.claude.use !== 'function') return null;
          const s = await Promise.race([window.claude.use('sample'), new Promise((r) => setTimeout(() => r(null), 4000))]);
          if (!s) return null;
          let lim = null; try { lim = await s.limits(); } catch (e) { lim = null; }
          return { fn: s, images: !!(lim && lim.images) };
        } catch (e) { return null; }
      })();
    }
    return samplePromise;
  }
  const getMode = () => (App.state.aiMode === 'sim' ? 'sim' : 'auto');
  function setMode(m) { App.state.aiMode = m === 'sim' ? 'sim' : 'auto'; App.save(); }

  /* Runs one live call. Never throws; returns {ok, data} or {ok:false, reason}. */
  async function live(prompt, opts) {
    if (getMode() === 'sim') return { ok: false, reason: 'mode' };
    const s = await getSample();
    if (!s) return { ok: false, reason: 'unavailable' };
    const o = { modelTier: (opts && opts.tier) || 'quick' };
    if (opts && opts.images) { if (!s.images) return { ok: false, reason: 'images_unavailable' }; o.images = opts.images; }
    try { return { ok: true, data: await s.fn.json(prompt, o) }; }
    catch (e) { return { ok: false, reason: (e && e.code) || 'error' }; }
  }
  function reasonText(r) {
    if (r === 'mode') return 'You chose the simulated engine.';
    if (r === 'not_granted' || r === 'capability_disabled' || r === 'sampling_disabled') return 'Claude was not allowed for this page, so the simulated engine answered.';
    if (r === 'rate_limited') return 'Claude is busy or a usage limit was reached, so the simulated engine answered.';
    if (r === 'images_unavailable') return 'Image analysis is not available in this view, so the simulated engine answered.';
    if (r === 'invalid_json' || r === 'bad_shape') return 'Claude returned an answer this page could not read, so the simulated engine answered.';
    return 'Claude is not available in this view, so the simulated engine answered.';
  }
  const engineChip = (engine) => engine === 'live'
    ? '<span class="engine live" title="Answered by Claude through the preview">Live AI · Claude</span>'
    : '<span class="engine sim" title="Fixed rules and sample data. No AI model was called.">Simulated · rules</span>';
  const engineNote = (res) => (res.engine === 'sim' && res.reason ? '<p class="hint">' + App.esc(reasonText(res.reason)) + '</p>' : '');

  /* =====================================================================
     1. AI SEARCH ASSISTANT
     ===================================================================== */
  const CITY_ALIASES = {
    'Cairo': ['cairo', 'القاهرة', 'القاهره'], 'Giza': ['giza', 'الجيزة', 'الجيزه'], 'Alexandria': ['alexandria', 'alex', 'اسكندرية', 'الإسكندرية', 'الاسكندرية'],
    'El Mahalla El Kubra': ['el mahalla', 'mahalla', 'المحلة', 'المحله'], 'Shubra El Kheima': ['shubra el kheima', 'shubra', 'شبرا'],
    '10th of Ramadan City': ['10th of ramadan', '10th ramadan', 'tenth of ramadan', 'ramadan city', 'العاشر'], 'Port Said': ['port said', 'بورسعيد'], 'Mansoura': ['mansoura', 'المنصورة', 'المنصوره']
  };
  const FABRIC_ALIASES = {
    cotton: ['cotton', 'poplin', 'drill', 'قطن'], polyester: ['polyester', 'lining', 'tulle', 'بوليستر'], denim: ['denim', 'jeans', 'جينز'], linen: ['linen', 'كتان'],
    viscose: ['viscose', 'rayon', 'challis', 'فسكوز'], wool: ['wool', 'woollen', 'coat', 'coats', 'صوف'], satin: ['satin', 'silk', 'ساتان', 'حرير'],
    jersey: ['jersey', 'knit', 'knitted', 'knitwear'], leather: ['leather', 'جلد'], terry: ['terry', 'towel', 'towels']
  };
  const STOP = 'i we need want looking look for find show me some any a an the of in from near with and or to please are is available buy get around about have has that this it my our can could would like items item stock clothes clothing garments material materials textile textiles supplies lot lots good best cheap price priced under over than less more least at on by'.split(' ');
  const UNIT_WORDS = { meter: 'meters', meters: 'meters', metre: 'meters', metres: 'meters', m: 'meters', mtr: 'meters', mtrs: 'meters', 'متر': 'meters', kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', 'كيلو': 'kg', piece: 'pieces', pieces: 'pieces', pc: 'pieces', pcs: 'pieces', unit: 'pieces', units: 'pieces', 'قطعة': 'pieces', 'قطع': 'pieces' };

  function emptyFilters() { return { q: '', cat: '', fabric: '', city: '', cond: '', unit: '', min: '', max: '', minQty: '', free: false, sort: 'new' }; }

  function parseQuery(text) {
    const f = emptyFilters(), chips = [], ignored = [];
    let t = ' ' + String(text || '').toLowerCase().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,،]/g, '') + ' ';
    const unitRx = '(meters?|metres?|mtrs?|kgs?|kilos?|kilograms?|pieces?|pcs?|units?|m|متر|كيلو|قطعة|قطع)';
    const num = '(\\d+(?:\\.\\d+)?)';
    const cur = '(?:egp|le|pounds?|جنيه|£)';
    const take = (rx, fn) => { t = t.replace(rx, function () { const r = fn.apply(null, arguments); return r === false ? arguments[0] : ' '; }); };

    take(new RegExp('between\\s+' + num + '\\s*(?:and|to|-)\\s*' + num + '\\s*' + cur + '?', 'g'), (m, a, b) => { f.min = String(Math.min(+a, +b)); f.max = String(Math.max(+a, +b)); chips.push('EGP ' + f.min + ' to ' + f.max); });
    take(new RegExp('(?:under|below|less than|max(?:imum)?|up to|cheaper than|within|<)\\s*' + cur + '?\\s*' + num + '\\s*' + cur + '?(?!\\s*' + unitRx + '\\b)', 'g'), (m, n) => { f.max = n; chips.push('Under EGP ' + n); });
    take(new RegExp('(?:at least|min(?:imum)?|more than|over|above|from|\\+)\\s*' + num + '\\s*' + unitRx + '?\\b', 'g'), (m, n, u) => { f.minQty = n; if (u && UNIT_WORDS[u]) f.unit = UNIT_WORDS[u]; chips.push('At least ' + n + (f.unit ? ' ' + f.unit : '')); });
    take(new RegExp(num + '\\s*' + unitRx + '\\b', 'g'), (m, n, u) => { if (f.minQty === '') { f.minQty = n; chips.push('About ' + n + ' ' + (UNIT_WORDS[u] || u)); } if (UNIT_WORDS[u]) f.unit = UNIT_WORDS[u]; });
    take(new RegExp('(?:' + cur + '\\s*' + num + '|' + num + '\\s*' + cur + ')', 'g'), (m, a, b) => { if (f.max === '') { f.max = a || b; chips.push('Under EGP ' + f.max); } });
    take(/\b(free|giveaway|for nothing|مجانا|مجاني)\b/g, () => { f.free = true; chips.push('Free'); });

    take(/\blike new\b/g, () => { f.cond = 'like new'; chips.push('Like new'); });
    take(/\b(damaged|torn|stained|defective|faulty)\b/g, () => { f.cond = 'damaged'; chips.push('Damaged'); });
    take(/\b(second[- ]?hand|pre-?loved|used|worn)\b/g, () => { f.cond = 'used'; chips.push('Used'); });
    take(/\b(brand new|unsold|new)\b/g, () => { if (!f.cond) { f.cond = 'new'; chips.push('New'); } });

    Object.keys(CITY_ALIASES).forEach((city) => CITY_ALIASES[city].forEach((a) => { if (!f.city && t.indexOf(' ' + a + ' ') !== -1) { f.city = city; chips.push(city); t = t.split(' ' + a + ' ').join('  '); } }));
    Object.keys(FABRIC_ALIASES).forEach((k) => FABRIC_ALIASES[k].forEach((a) => { if (!f.fabric && t.indexOf(' ' + a + ' ') !== -1) { f.fabric = k; chips.push(fabricLabel(k)); t = t.split(' ' + a + ' ').join('  '); } }));

    const cats = App.state.categories, byName = (n) => cats.find((c) => c.name === n);
    const catRules = [['Fabric', ['fabric', 'fabrics', 'roll', 'rolls', 'offcut', 'offcuts', 'remnant', 'remnants', 'قماش']], ['Trims & accessories', ['trim', 'trims', 'zipper', 'zippers', 'button', 'buttons', 'belt', 'belts', 'accessory', 'accessories']]];
    catRules.forEach((r) => r[1].forEach((a) => { if (!f.cat && byName(r[0]) && t.indexOf(' ' + a + ' ') !== -1) { f.cat = byName(r[0]).id; chips.push(r[0]); t = t.split(' ' + a + ' ').join('  '); } }));

    const hay = App.state.listings.filter((l) => l.status === 'available').map((l) => (l.title + ' ' + l.description).toLowerCase()).join(' ');
    const words = t.split(/[^a-z0-9؀-ۿ'-]+/).filter(Boolean);
    const keep = [];
    words.forEach((w) => {
      if (STOP.indexOf(w) !== -1 || /^\d/.test(w) || w.length < 3) return;
      const stem = w.replace(/(es|s)$/, '');
      if (hay.indexOf(w) !== -1 || (stem.length > 2 && hay.indexOf(stem) !== -1)) keep.push(stem.length > 2 ? stem : w); else ignored.push(w);
    });
    if (keep.length) { f.q = keep.join(' '); chips.push('Keywords: ' + keep.join(', ')); }
    return { filters: f, chips: chips, ignored: ignored };
  }

  function sanitizeLive(d) {
    if (!d || typeof d !== 'object') return null;
    const f = emptyFilters(), chips = [], cats = App.state.categories;
    if (typeof d.category === 'string') { const c = cats.find((x) => x.name.toLowerCase() === d.category.toLowerCase()); if (c) { f.cat = c.id; chips.push(c.name); } }
    if (typeof d.fabric_type === 'string' && FABRIC_LABEL[d.fabric_type.toLowerCase()]) { f.fabric = d.fabric_type.toLowerCase(); chips.push(fabricLabel(f.fabric)); }
    if (typeof d.city === 'string') { const c = App.CITIES.find((x) => x.toLowerCase() === d.city.toLowerCase()); if (c) { f.city = c; chips.push(c); } }
    if (typeof d.condition === 'string' && App.CONDITIONS.indexOf(d.condition.toLowerCase()) !== -1) { f.cond = d.condition.toLowerCase(); chips.push(App.cap(f.cond)); }
    if (typeof d.unit === 'string' && App.UNITS.indexOf(d.unit.toLowerCase()) !== -1) { f.unit = d.unit.toLowerCase(); }
    if (Number.isFinite(Number(d.max_price)) && d.max_price !== null && d.max_price !== '') { f.max = String(Number(d.max_price)); chips.push('Under EGP ' + f.max); }
    if (Number.isFinite(Number(d.min_price)) && d.min_price !== null && d.min_price !== '' && Number(d.min_price) > 0) { f.min = String(Number(d.min_price)); chips.push('From EGP ' + f.min); }
    if (Number.isFinite(Number(d.min_quantity)) && d.min_quantity !== null && d.min_quantity !== '' && Number(d.min_quantity) > 0) { f.minQty = String(Number(d.min_quantity)); chips.push('At least ' + f.minQty + (f.unit ? ' ' + f.unit : '')); }
    if (d.free === true) { f.free = true; chips.push('Free'); }
    if (Array.isArray(d.keywords)) { const k = d.keywords.filter((x) => typeof x === 'string' && x.length > 2).slice(0, 3).map((x) => x.toLowerCase()); if (k.length) { f.q = k.join(' '); chips.push('Keywords: ' + k.join(', ')); } }
    return { filters: f, chips: chips, message: typeof d.summary === 'string' ? d.summary.slice(0, 220) : '' };
  }

  async function assistant(text) {
    const cats = App.state.categories.map((c) => c.name);
    const prompt = 'You turn a shopper\'s request on an Egyptian textile-waste marketplace into search filters.\n' +
      'Allowed categories: ' + JSON.stringify(cats) + '. Allowed fabric_type values: ' + JSON.stringify(FABRICS.map((f) => f[0])) + '. Allowed cities: ' + JSON.stringify(App.CITIES) +
      '. Allowed condition values: ["new","like new","used","damaged"]. Allowed unit values: ["meters","kg","pieces"]. Prices are in EGP per unit.\n' +
      'Reply with only one JSON object: {"category":string|null,"fabric_type":string|null,"city":string|null,"condition":string|null,"unit":string|null,"max_price":number|null,"min_price":number|null,"min_quantity":number|null,"free":boolean,"keywords":string[],"summary":string}. ' +
      'Use null when the request does not say. "summary" is one short friendly sentence describing what you searched for. Do not invent values.\nRequest: ' + JSON.stringify(String(text).slice(0, 300));
    const r = await live(prompt, { tier: 'quick' });
    if (r.ok) { const s = sanitizeLive(r.data); if (s) return { engine: 'live', filters: s.filters, chips: s.chips, ignored: [], message: s.message }; r.reason = 'bad_shape'; }
    const p = parseQuery(text);
    return { engine: 'sim', filters: p.filters, chips: p.chips, ignored: p.ignored, message: '', reason: r.reason };
  }

  /* =====================================================================
     2. AI FABRIC RECOGNITION
     ===================================================================== */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      let url = null;
      const img = new Image();
      img.onload = () => { if (url) URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { if (url) URL.revokeObjectURL(url); reject(new Error('image')); };
      if (typeof src === 'string') img.src = src; else { url = URL.createObjectURL(src); img.src = url; }
    });
  }
  function drawTo(img, max) {
    const k = Math.min(1, max / Math.max(img.width || max, img.height || max));
    const c = document.createElement('canvas'); c.width = Math.max(8, Math.round((img.width || max) * k)); c.height = Math.max(8, Math.round((img.height || max) * k));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); return c;
  }
  function features(c) {
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, n = w * h, lum = new Float32Array(n);
    let sr = 0, sg = 0, sb = 0, sat = 0;
    for (let i = 0; i < n; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; sr += r; sg += g; sb += b; lum[i] = 0.299 * r + 0.587 * g + 0.114 * b; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx ? (mx - mn) / mx : 0; }
    const meanL = lum.reduce((a, b) => a + b, 0) / n; let v = 0; for (let i = 0; i < n; i++) v += (lum[i] - meanL) * (lum[i] - meanL);
    const std = Math.sqrt(v / n); let gx = 0, gy = 0, g1 = 0, g2 = 0, hi = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; gx += Math.abs(lum[i + 1] - lum[i - 1]); gy += Math.abs(lum[i + w] - lum[i - w]); g1 += Math.abs(lum[i + w + 1] - lum[i - w - 1]); g2 += Math.abs(lum[i + w - 1] - lum[i - w + 1]);
      if (lum[i] > meanL + 1.5 * std) hi++;
    }
    const m = (w - 2) * (h - 2), tot = gx + gy + g1 + g2 + 1e-6;
    return { r: sr / n, g: sg / n, b: sb / n, meanL: meanL, std: std, sat: sat / n, edge: (gx + gy) / 2 / m, diag: Math.max(g1, g2) / tot * 2, sheen: hi / m };
  }
  function scoreFabrics(f) {
    const blue = (f.b - f.r) / 255, light = f.meanL > 185, dark = f.meanL < 95, brown = f.r > f.g && f.g > f.b && f.r - f.b > 30;
    const S = { cotton: 15, polyester: 12, denim: 5, linen: 8, viscose: 10, wool: 6, satin: 6, jersey: 10, leather: 4, terry: 5, other: 14 }, why = {};
    const add = (k, p, t) => { S[k] += p; (why[k] = why[k] || []).push(t); };
    if (blue > 0.08 && f.sat > 0.12) add('denim', 38, 'blue tone'); if (f.diag > 0.55 && f.edge > 3) add('denim', 16, 'diagonal twill-like texture'); if (blue > 0.08 && !light && !dark) add('denim', 8, 'mid-dark indigo range');
    if (f.sheen > 0.1) add('satin', 30, 'bright highlights suggest sheen'); if (f.edge < 4 && f.sheen > 0.06) add('satin', 20, 'very smooth surface');
    if (light && f.edge >= 2 && f.edge < 12) add('cotton', 24, 'light, matte, even weave'); if (f.sat < 0.25 && f.edge < 12) add('cotton', 10, 'low colour saturation');
    if (f.edge > 10 && f.sat < 0.3) add('linen', 30, 'uneven, slubby texture'); if (brown && light) add('linen', 8, 'natural beige tone');
    if (f.edge >= 5 && f.edge < 13 && f.diag < 0.55) add('jersey', 18, 'fine regular knit-like texture');
    if (!light && f.edge > 11 && f.sat < 0.3) add('wool', 32, 'dense, fuzzy texture in a darker tone');
    if (f.sat > 0.35 && f.edge < 6) add('polyester', 28, 'saturated colour on a smooth surface');
    if (f.sat > 0.22 && f.edge >= 3 && f.edge < 11) add('viscose', 18, 'soft colour with gentle texture');
    if (brown && f.meanL < 150 && f.edge < 8) add('leather', 34, 'brown tone on a fairly smooth surface');
    if (f.edge > 15 && light) add('terry', 40, 'high-frequency loop texture');
    return { S: S, why: why };
  }
  function simRecognize(c) {
    const f = features(c), r = scoreFabrics(f), keys = Object.keys(r.S).sort((a, b) => r.S[b] - r.S[a]).slice(0, 3), sum = keys.reduce((a, k) => a + r.S[k], 0);
    const results = keys.map((k, i) => ({ type: k, confidence: Math.round(Math.min(70, (r.S[k] / sum) * 100 * (i === 0 ? 1 : 0.85))), reason: (r.why[k] || ['no strong visual cue']).join(', ') }));
    return results;
  }
  async function recognize(src) {
    let img;
    try { img = await loadImage(src); } catch (e) { return { engine: 'sim', error: 'That image could not be read. Try a JPG or PNG photo.', results: [] }; }
    const small = drawTo(img, 96);
    const mode = getMode(), sam = mode === 'sim' ? null : await getSample();
    let reason = mode === 'sim' ? 'mode' : 'unavailable';
    if (sam && sam.images) {
      const big = drawTo(img, 768);
      const blob = await new Promise((res) => big.toBlob(res, 'image/jpeg', 0.85));
      if (blob) {
        const prompt = 'This is a photo of leftover textile material (fabric, offcuts or garments) listed on a marketplace in Egypt. Judge the most likely fabric type from the photo only. ' +
          'Allowed types: ' + JSON.stringify(FABRICS.map((f) => f[0])) + '. Reply with only one JSON object: {"candidates":[{"type":string,"confidence":number,"reason":string}],"note":string}. ' +
          'Give up to 3 candidates, confidence 0-100 (be honest: a photo cannot confirm fibre content, so stay under 85), a reason of at most 12 words, and one short note about what to check physically (burn test is not allowed, suggest label or supplier info instead).';
        const r = await live(prompt, { tier: 'default', images: [blob] });
        if (r.ok && r.data && Array.isArray(r.data.candidates)) {
          const results = r.data.candidates.filter((x) => x && FABRIC_LABEL[String(x.type).toLowerCase()]).slice(0, 3).map((x) => ({ type: String(x.type).toLowerCase(), confidence: Math.max(0, Math.min(85, Math.round(Number(x.confidence) || 0))), reason: String(x.reason || '').slice(0, 120) }));
          if (results.length) return { engine: 'live', results: results, note: String(r.data.note || '').slice(0, 220) };
          reason = 'bad_shape';
        } else if (!r.ok) reason = r.reason; else reason = 'bad_shape';
      }
    } else if (sam && !sam.images) reason = 'images_unavailable';
    return { engine: 'sim', results: simRecognize(small), note: 'This is a simple colour-and-texture check on a tiny copy of your photo. It cannot see fibre content, so confirm the fabric with the supplier or its label.', reason: reason };
  }

  /* =====================================================================
     3. WASTE VALUE ESTIMATION
     ===================================================================== */
  const PRICE_M = { cotton: 40, polyester: 28, denim: 55, linen: 70, viscose: 42, wool: 120, satin: 60, jersey: 45, leather: 150, terry: 55, other: 30 };
  const PRICE_KG = { cotton: 55, polyester: 25, denim: 30, linen: 70, viscose: 40, wool: 90, satin: 90, jersey: 38, leather: 120, terry: 35, other: 20 };
  const PIECE_BASE = { 'New clothing': 200, 'Used clothing': 80, 'Trims & accessories': 3, 'Fabric': 60 };
  const PIECE_MULT = { cotton: 1, polyester: 0.8, denim: 1.1, linen: 1.3, viscose: 0.9, wool: 2.8, satin: 1.4, jersey: 0.9, leather: 2.2, terry: 0.8, other: 1 };
  const COND_MULT = { 'new': 1, 'like new': 0.8, 'used': 0.5, 'damaged': 0.25 };

  function estimate(i) {
    const qty = Number(i.qty) || 0, fabric = i.fabric || 'other', unit = i.unit || 'meters', cond = i.condition || 'new', cat = i.category || 'Fabric';
    const base = unit === 'meters' ? PRICE_M[fabric] : unit === 'kg' ? PRICE_KG[fabric] : (PIECE_BASE[cat] || 60) * (cat === 'Trims & accessories' ? 1 : PIECE_MULT[fabric] || 1);
    const cm = COND_MULT[cond] == null ? 1 : COND_MULT[cond], bulk = qty >= 200 ? 0.85 : qty >= 50 ? 0.92 : 1;
    const mid = base * cm * bulk;
    const e = { unit: unit, base: base, condMult: cm, bulkMult: bulk, perUnit: { low: mid * 0.85, mid: mid, high: mid * 1.15 }, qty: qty };
    e.total = { low: e.perUnit.low * qty, mid: mid * qty, high: e.perUnit.high * qty };
    e.factors = ['Base price for ' + fabricLabel(fabric).toLowerCase() + ' per ' + App.UNIT_ONE[unit] + ': EGP ' + fmt(base, 1), 'Condition (' + cond + '): x' + cm, 'Quantity (' + fmt(qty) + ' ' + unit + '): ' + (bulk < 1 ? 'bulk factor x' + bulk : 'no bulk factor')];
    if (i.asking != null && i.asking !== '') {
      const a = Number(i.asking);
      e.verdict = a < e.perUnit.low ? { tag: 'below', text: 'The asking price is below the estimated range. You may be leaving money on the table.' } : a > e.perUnit.high ? { tag: 'above', text: 'The asking price is above the estimated range. Buyers may compare it with cheaper lots.' } : { tag: 'in', text: 'The asking price is inside the estimated range.' };
    }
    return e;
  }
  async function valueOpinion(i, e) {
    const prompt = 'You are a pricing sense-checker for a textile-waste marketplace in Egypt. A rule-based table estimated EGP ' + fmt(e.perUnit.low, 1) + ' to ' + fmt(e.perUnit.high, 1) + ' per ' + App.UNIT_ONE[e.unit] +
      ' for this lot: ' + JSON.stringify({ fabric: fabricLabel(i.fabric), quantity: i.qty, unit: e.unit, condition: i.condition, category: i.category, asking_price_per_unit: i.asking === '' ? null : i.asking }) +
      '. You have no market data or internet, so give a short qualitative sense-check only. Reply with only one JSON object: {"opinion":string,"things_to_check":string[]} where opinion is at most 40 words and things_to_check has at most 3 short items.';
    const r = await live(prompt, { tier: 'quick' });
    if (r.ok && r.data && typeof r.data.opinion === 'string') return { engine: 'live', opinion: r.data.opinion.slice(0, 300), checks: (Array.isArray(r.data.things_to_check) ? r.data.things_to_check : []).slice(0, 3).map((x) => String(x).slice(0, 100)) };
    return { engine: 'sim', reason: r.reason };
  }

  /* =====================================================================
     4. UPCYCLING SUGGESTIONS
     ===================================================================== */
  const IDEAS = {
    denim: [['Tote and shopper bags', 'Easy', 0.6, 'Craft markets and brand merchandise'], ['Patchwork jackets', 'Hard', 2.0, 'Local fashion labels'], ['Laptop and tablet sleeves', 'Medium', 0.3, 'University and corporate gifts'], ['Aprons for cafes', 'Easy', 0.8, 'Cafes and restaurants'], ['Pet beds', 'Easy', 1.0, 'Pet shops']],
    cotton: [['Reusable shopping bags', 'Easy', 0.5, 'Supermarkets and shops'], ['Cushion covers', 'Easy', 0.6, 'Home decor sellers'], ['Children\'s clothing', 'Medium', 1.2, 'Local kids\' brands'], ['Napkins and handkerchiefs', 'Easy', 0.25, 'Restaurants and gift shops'], ['Quilts', 'Medium', 6, 'Home textile makers']],
    linen: [['Table linen sets', 'Medium', 1.5, 'Restaurants and hotels'], ['Relaxed shirts', 'Medium', 2.2, 'Resort wear labels'], ['Aprons', 'Easy', 0.9, 'Cafes and workshops'], ['Wall hangings', 'Easy', 0.5, 'Interior designers']],
    polyester: [['Garment lining', 'Easy', 1.2, 'Tailors and coat makers'], ['Garment covers', 'Easy', 1.5, 'Boutiques and dry cleaners'], ['Hair accessories', 'Easy', 0.15, 'Accessory sellers'], ['Fibre fill for cushions', 'Easy', 0.5, 'Home decor makers']],
    viscose: [['Scarves', 'Easy', 1.0, 'Accessory shops'], ['Summer tops', 'Medium', 1.5, 'Boutique labels'], ['Head wraps', 'Easy', 0.8, 'Online sellers']],
    wool: [['Winter hats and scarves', 'Easy', 0.5, 'Winter markets'], ['Felted slippers', 'Medium', 0.4, 'Craft sellers'], ['Blankets', 'Medium', 3, 'Home textile makers'], ['Pet mats', 'Easy', 0.7, 'Pet shops']],
    satin: [['Scrunchies and hair ties', 'Easy', 0.1, 'Accessory sellers'], ['Gift pouches', 'Easy', 0.3, 'Wedding planners'], ['Sleep masks', 'Easy', 0.1, 'Online shops'], ['Bridal accessories', 'Medium', 0.8, 'Bridal designers']],
    jersey: [['T-shirts', 'Medium', 1.2, 'Streetwear labels'], ['Headbands', 'Easy', 0.2, 'Sports shops'], ['Baby wraps', 'Medium', 1.6, 'Baby brands'], ['Yoga mat bags', 'Easy', 0.7, 'Studios']],
    leather: [['Wallets and card holders', 'Medium', 0.15, 'Gift shops'], ['Belts and straps', 'Medium', 0.2, 'Fashion accessories'], ['Key holders', 'Easy', 0.05, 'Souvenir shops'], ['Patches and labels', 'Easy', 0.02, 'Denim and bag makers']],
    terry: [['Hand towels', 'Easy', 0.6, 'Hotels and spas'], ['Bathrobes', 'Hard', 3.2, 'Hotels'], ['Cleaning cloths', 'Easy', 0.3, 'Cleaning companies'], ['Baby bibs', 'Easy', 0.2, 'Baby shops']],
    other: [['Rag rugs', 'Easy', 1.5, 'Home decor'], ['Patchwork bags', 'Medium', 0.7, 'Craft markets'], ['Stuffing for cushions and toys', 'Easy', 0.4, 'Toy and cushion makers']]
  };
  const GARMENT_IDEAS = {
    'New clothing': [['Resell in bundles to boutiques', 'Easy', 0, 'Boutiques and market traders'], ['Re-label and rebrand for a new line', 'Medium', 0, 'Small fashion brands'], ['Offer to uniform and corporate buyers', 'Medium', 0, 'Businesses and schools']],
    'Used clothing': [['Remake into patchwork pieces', 'Hard', 0, 'Upcycling designers'], ['Cut into bags and accessories', 'Medium', 0, 'Craft sellers'], ['Send damaged pieces to fibre recycling', 'Easy', 0, 'Recyclers']],
    'Trims & accessories': [['Repair kits for tailors', 'Easy', 0, 'Tailors and alteration shops'], ['Craft bundles for makers', 'Easy', 0, 'Craft sellers'], ['Reuse on new production runs', 'Easy', 0, 'Small factories']]
  };
  function upcycleSim(i) {
    const cat = i.category || 'Fabric', unit = i.unit || 'meters', qty = Number(i.qty) || 0;
    const garment = unit === 'pieces' && GARMENT_IDEAS[cat];
    const list = garment ? GARMENT_IDEAS[cat] : (IDEAS[i.fabric] || IDEAS.other);
    return list.map((x) => {
      const needM = x[2], out = { name: x[0], difficulty: x[1], market: x[3], count: null };
      if (!garment && needM > 0) { const meters = unit === 'meters' ? qty : unit === 'kg' ? qty / FACTORS.metersToKg : 0; out.count = meters ? Math.floor(meters / needM) : null; }
      return out;
    });
  }
  async function upcycle(i) {
    const prompt = 'Suggest 5 creative upcycling or reuse products for this leftover textile lot, for makers in Egypt: ' + JSON.stringify({ fabric: fabricLabel(i.fabric), quantity: i.qty, unit: i.unit, category: i.category, condition: i.condition }) +
      '. Reply with only one JSON array of objects {"name":string,"difficulty":"Easy"|"Medium"|"Hard","who_buys":string,"tip":string}. Keep name under 6 words, who_buys under 8 words and tip under 16 words. No brand names.';
    const r = await live(prompt, { tier: 'quick' });
    if (r.ok && Array.isArray(r.data) && r.data.length) {
      const items = r.data.slice(0, 6).filter((x) => x && typeof x.name === 'string').map((x) => ({ name: String(x.name).slice(0, 60), difficulty: ['Easy', 'Medium', 'Hard'].indexOf(x.difficulty) !== -1 ? x.difficulty : 'Medium', market: String(x.who_buys || '').slice(0, 80), tip: String(x.tip || '').slice(0, 120), count: null }));
      if (items.length) return { engine: 'live', items: items };
    }
    return { engine: 'sim', items: upcycleSim(i), reason: r.reason };
  }

  /* =====================================================================
     5. SMART MATCHING
     ===================================================================== */
  const PROJECTS = {
    garments: { label: 'Garment production', fabrics: ['cotton', 'linen', 'viscose', 'satin', 'jersey', 'wool', 'polyester', 'denim'], cats: ['Fabric'] },
    accessories: { label: 'Bags and accessories', fabrics: ['denim', 'leather', 'satin', 'cotton', 'polyester'], cats: ['Fabric', 'Trims & accessories'] },
    home: { label: 'Home textiles', fabrics: ['cotton', 'linen', 'terry', 'jersey', 'viscose'], cats: ['Fabric'] },
    patchwork: { label: 'Upcycled and patchwork', fabrics: ['denim', 'cotton', 'viscose', 'polyester', 'other'], cats: ['Fabric', 'Used clothing'] },
    recycling: { label: 'Recycling and fibre', fabrics: FABRICS.map((f) => f[0]), cats: ['Fabric', 'Used clothing', 'New clothing'] },
    resale: { label: 'Resale and retail', fabrics: FABRICS.map((f) => f[0]), cats: ['New clothing', 'Used clothing'] }
  };
  const GREATER_CAIRO = ['Cairo', 'Giza', 'Shubra El Kheima'];
  function defaultPrefs() { return { project: 'garments', fabrics: [], maxPrice: '', minQty: '', city: '', conditions: ['new', 'like new'] }; }

  function matchSim(prefs, listings, meId) {
    const P = PROJECTS[prefs.project] || PROJECTS.garments;
    const out = [];
    listings.forEach((l) => {
      if (l.status !== 'available' || l.seller_id === meId) return;
      let s = 0; const why = [], cname = catName(l.category_id);
      if (prefs.fabrics.length) { if (prefs.fabrics.indexOf(l.fabric_type) !== -1) { s += 35; why.push('Fabric you asked for (' + fabricLabel(l.fabric_type) + ')'); } } else if (P.fabrics.indexOf(l.fabric_type) !== -1) { s += 22; why.push(fabricLabel(l.fabric_type) + ' suits ' + P.label.toLowerCase()); }
      if (P.cats.indexOf(cname) !== -1) { s += 12; why.push(cname + ' fits the project'); }
      if (prefs.maxPrice !== '' && prefs.maxPrice != null) { if (l.is_free || Number(l.price) <= Number(prefs.maxPrice)) { s += 18; why.push(l.is_free ? 'Free' : 'Within your budget'); } else s -= 12; } else s += 8;
      if (prefs.minQty !== '' && prefs.minQty != null) { if (Number(l.quantity) >= Number(prefs.minQty)) { s += 14; why.push('Enough quantity (' + l.quantity + ' ' + l.unit + ')'); } else s -= 10; } else s += 6;
      if (prefs.city) { if (l.city === prefs.city) { s += 10; why.push('In ' + l.city); } else if (GREATER_CAIRO.indexOf(l.city) !== -1 && GREATER_CAIRO.indexOf(prefs.city) !== -1) { s += 6; why.push('Greater Cairo area'); } } else s += 4;
      if (prefs.conditions.length) { if (prefs.conditions.indexOf(l.condition) !== -1) { s += 9; why.push('Condition: ' + l.condition); } else s -= 8; } else s += 4;
      out.push({ listing: l, score: Math.max(0, Math.min(99, Math.round(s))), reasons: why.slice(0, 4) });
    });
    return out.sort((a, b) => b.score - a.score);
  }
  async function match(prefs, meId) {
    const base = matchSim(prefs, App.state.listings, meId), top = base.slice(0, 8);
    if (top.length < 2) return { engine: 'sim', items: base.slice(0, 6) };
    const brief = { project: (PROJECTS[prefs.project] || PROJECTS.garments).label, wanted_fabrics: prefs.fabrics, max_price_per_unit_egp: prefs.maxPrice === '' ? null : Number(prefs.maxPrice), min_quantity: prefs.minQty === '' ? null : Number(prefs.minQty), city: prefs.city || null, acceptable_conditions: prefs.conditions };
    const cand = top.map((m) => ({ id: m.listing.id, title: m.listing.title, fabric: m.listing.fabric_type, price_egp_per_unit: m.listing.is_free ? 0 : m.listing.price, quantity: m.listing.quantity, unit: m.listing.unit, condition: m.listing.condition, city: m.listing.city }));
    const prompt = 'You rank textile-waste listings for a buyer on an Egyptian marketplace. Buyer brief: ' + JSON.stringify(brief) + '. Candidate listings: ' + JSON.stringify(cand) +
      '. Pick the 5 best, best first. Reply with only one JSON array of {"id":string,"score":number,"reason":string} using ids exactly as given, score 0-99, reason at most 14 words explaining the fit.';
    const r = await live(prompt, { tier: 'default' });
    if (r.ok && Array.isArray(r.data)) {
      const items = [];
      r.data.forEach((x) => { const m = top.find((t) => t.listing.id === x.id); if (m && !items.some((i) => i.listing.id === m.listing.id)) items.push({ listing: m.listing, score: Math.max(0, Math.min(99, Math.round(Number(x.score) || 0))), reasons: [String(x.reason || '').slice(0, 120)].filter(Boolean) }); });
      if (items.length) return { engine: 'live', items: items.slice(0, 6) };
    }
    return { engine: 'sim', items: base.slice(0, 6), reason: r.reason };
  }
  function prefsFor(userId) { const p = (App.state.prefs || {})[userId]; return p ? Object.assign(defaultPrefs(), p) : defaultPrefs(); }
  function savePrefs(userId, p) { App.state.prefs = App.state.prefs || {}; App.state.prefs[userId] = p; App.save(); }

  window.AI = {
    FABRICS, fabricLabel, FACTORS, kgOf, listingKg, orderKg, sumKg, availableKg, impactOf, fmt, catName,
    getMode, setMode, getSample, engineChip, engineNote, reasonText,
    emptyFilters, parseQuery, assistant,
    recognize, estimate, valueOpinion, upcycle, upcycleSim,
    PROJECTS, defaultPrefs, matchSim, match, prefsFor, savePrefs
  };
})();
