/* Shared prototype logic: sample data (mirrors the 4-table ERD), fake session, navigation, helpers.
   No Supabase, no real login. State lives in this browser only. */
(function () {
  'use strict';

  const KEY = 'fwm_proto_v2';
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

  /* ---------- sample data: profiles, categories, listings, listing_photos ---------- */
  function seed() {
    const categories = [[1, 'Fabric'], [2, 'New clothing'], [3, 'Used clothing'], [4, 'Trims & accessories']]
      .map((c) => ({ id: sid(100 + c[0]), created_at: ago(60), name: c[1] }));
    const cid = (n) => sid(100 + n);

    const P = [
      [1, 'Mona Hassan', 'seller', 'Cairo', 'mona@example.com', 90],
      [2, 'Karim Adel', 'buyer', 'Giza', 'karim@example.com', 70],
      [3, 'Nour El-Din Textiles', 'seller', 'El Mahalla El Kubra', 'nour@example.com', 80],
      [4, 'Hoda Mostafa', 'seller', 'Alexandria', 'hoda@example.com', 55],
      [5, 'Farouk Denim Works', 'seller', 'Shubra El Kheima', 'farouk@example.com', 75],
      [6, 'Salma Ibrahim', 'seller', '10th of Ramadan City', 'salma@example.com', 40],
      [7, 'Reem Knitwear', 'seller', 'Mansoura', 'reem@example.com', 35],
      [8, 'Canal Garments', 'seller', 'Port Said', 'canal@example.com', 30],
      [9, 'Layla Samir', 'buyer', 'Cairo', 'layla@example.com', 60],
      [10, 'Studio Nakheel', 'buyer', 'Alexandria', 'nakheel@example.com', 45]
    ];
    const profiles = P.map((p) => ({
      id: sid(p[0]), created_at: ago(p[5]), full_name: p[1], role: p[2],
      phone: '+20100000' + ('0000' + p[0]).slice(-4), whatsapp_number: '+20100000' + ('0000' + p[0]).slice(-4),
      city: p[3], avatar_url: null
    }));
    const authUsers = P.map((p) => ({ id: sid(p[0]), email: p[4] }));

    // [n, seller, category, title, description, qty, unit, price|null(free), condition, city, status, daysAgo, photos]
    const L = [
      [1, 3, 1, 'Cotton poplin rolls, off-white', 'Leftover rolls from a shirt order that was cancelled. 150 cm width, about 120 g/m². Sold by the meter, minimum 10 meters.', 120, 'meters', 38, 'new', 'El Mahalla El Kubra', 'available', 2, [['roll', '#F2EEE3', '#B9B09A'], ['weave', '#F2EEE3', '#9C9378']]],
      [2, 5, 1, 'Denim offcuts, mixed washes', 'Clean offcuts from jeans production, pieces of 30 to 60 cm. Good for patchwork, bags and fibre recycling.', 250, 'kg', 22, 'new', 'Shubra El Kheima', 'available', 3, [['twill', '#3E5F8A', '#1E2F4A'], ['twill', '#6C8DB5', '#2F4A70'], ['weave', '#2B3F5E', '#0F1B2E']]],
      [3, 6, 2, 'Unsold summer linen dresses', 'Last season collection, tags on. Sizes S to XL in mixed colours. Better price for 10 pieces or more.', 40, 'pieces', 320, 'new', '10th of Ramadan City', 'available', 1, [['dress', '#F6E9DC', '#D17A5B'], ['dress', '#E4EEF0', '#4C8A94']]],
      [4, 4, 1, 'Ivory wedding satin remnants', 'Remnants from bridal orders, 1 to 3 meter lengths. Smooth, with a soft sheen. Ideal for lining and small projects.', 18, 'meters', 55, 'like new', 'Alexandria', 'available', 5, [['satin', '#F3ECDD', '#D9CCAF'], ['satin', '#EFE6D2', '#CBBD9C']]],
      [5, 1, 2, 'School uniform shirts, light blue', 'Sealed packs from a school supplier that changed its design. Mixed sizes for ages 6 to 14.', 60, 'pieces', 85, 'new', 'Cairo', 'reserved', 6, [['shirt', '#E7F0F7', '#7FA9CF'], ['stripes', '#DCE9F4', '#8FB4D8']]],
      [6, 3, 1, 'Polyester lining offcuts', 'Mixed colours, pieces of 40 to 100 cm. Free to anyone who collects from our factory gate in El Mahalla.', 80, 'kg', null, 'new', 'El Mahalla El Kubra', 'available', 1, [['weave', '#C9D8E8', '#7C93AD'], ['weave', '#E3D2D9', '#A87D8C']]],
      [7, 1, 3, 'Used abayas, good condition', 'Black and navy abayas, worn a few times. Mixed sizes, freshly cleaned. Sold as a lot or individually.', 12, 'pieces', 150, 'used', 'Giza', 'available', 4, [['dress', '#E9EDEC', '#1F2A2E'], ['dress', '#EEF0F3', '#26344D']]],
      [8, 5, 4, 'Assorted zippers and shirt buttons', 'Boxed metal and plastic zippers (15 to 20 cm) and shirt buttons in several sizes. Leftover from a closed production line.', 500, 'pieces', 2, 'new', 'Shubra El Kheima', 'available', 7, [['buttons', '#F4EFE6', '#2C5F5B'], ['zip', '#EDEFF0', '#6B7C86']]],
      [9, 6, 1, 'Heather grey cotton jersey rolls', 'Single jersey, 180 g/m². Two full rolls, minimum purchase 20 meters.', 65, 'meters', 48, 'new', '10th of Ramadan City', 'sold', 9, [['roll', '#C7CCCB', '#8B9491'], ['weave', '#C7CCCB', '#8B9491']]],
      [10, 4, 2, 'Men\'s wool-blend winter coats', 'Unsold winter stock from last year, sizes 48 to 56. Navy and charcoal. Original labels.', 14, 'pieces', 650, 'new', 'Alexandria', 'available', 2, [['coat', '#E8ECEF', '#2E3E57'], ['coat', '#ECEDEF', '#4A4F57']]],
      [11, 1, 1, 'Embroidered tulle offcuts', 'Small pieces of embroidered tulle left from evening wear. Free for designers and students.', 9, 'kg', null, 'like new', 'Cairo', 'available', 3, [['dots', '#F7E7EC', '#D89AB0'], ['floral', '#F7EEE8', '#D99A8F']]],
      [12, 3, 1, 'Printed viscose, floral', 'Soft viscose with a small floral print. One roll with 95 meters left, 140 cm width.', 95, 'meters', 42, 'new', 'El Mahalla El Kubra', 'available', 8, [['floral', '#F3E3D6', '#C9674F'], ['roll', '#F3E3D6', '#C9674F']]],
      [13, 5, 3, 'Damaged jeans for upcycling', 'Jeans with small tears or stains, sorted by wash. Good raw material for upcyclers.', 30, 'pieces', 25, 'damaged', 'Shubra El Kheima', 'available', 5, [['twill', '#4C6E99', '#243A5A'], ['plaid', '#7C9BC0', '#3A5680']]],
      [14, 6, 4, 'Leather belts, unsold stock', 'Genuine leather belts in black and brown, sizes 90 to 115 cm. Sold in lots of 10 or more.', 70, 'pieces', 60, 'new', '10th of Ramadan City', 'reserved', 6, [['belt', '#EFE9E1', '#5B3A29'], ['belt', '#E7E7E7', '#1E1E1E']]],
      [15, 7, 2, 'Knit sweaters, factory seconds', 'Cotton-blend sweaters with tiny stitching flaws that do not affect wear. Mixed colours, sizes M to XL.', 25, 'pieces', 180, 'like new', 'Mansoura', 'available', 4, [['stripes', '#EAF0E5', '#6D9A74'], ['shirt', '#F1ECE4', '#9A6D4F']]],
      [16, 8, 1, 'Terry towel fabric, white', 'Heavy terry cloth rolls from a hotel linen order. 50 meters available.', 50, 'meters', 60, 'new', 'Port Said', 'available', 1, [['roll', '#F7F7F5', '#C9CFD1'], ['weave', '#F7F7F5', '#BFC6C8']]]
    ];
    const FAB = { 1: 'cotton', 2: 'denim', 3: 'linen', 4: 'satin', 5: 'cotton', 6: 'polyester', 7: 'polyester', 8: 'other', 9: 'jersey', 10: 'wool', 11: 'polyester', 12: 'viscose', 13: 'denim', 14: 'leather', 15: 'cotton', 16: 'terry' };
    // Older sold lots: give the dashboards and the impact page some history to show.
    // [n, seller, category, title, description, qty, unit, price, condition, city, status, daysAgo, photos, fabric]
    const H = [
      [17, 3, 1, 'Cotton drill offcuts', 'Bulk offcuts from a uniform factory, sold by the kilo.', 300, 'kg', 18, 'new', 'El Mahalla El Kubra', 'sold', 170, [['weave', '#D9CDB4', '#8E7F5E']], 'cotton'],
      [18, 5, 1, 'Indigo denim rolls', 'Full rolls of 11 oz denim from a cancelled order.', 140, 'meters', 55, 'new', 'Shubra El Kheima', 'sold', 140, [['twill', '#3A5780', '#1B2B47']], 'denim'],
      [19, 6, 2, 'Unsold poplin shirts', 'Boxed shirts from last season, mixed sizes.', 80, 'pieces', 140, 'new', '10th of Ramadan City', 'sold', 120, [['shirt', '#EDF1F6', '#7C9AC4']], 'cotton'],
      [20, 4, 1, 'Champagne satin remnants', 'Remnants from evening wear orders.', 25, 'meters', 50, 'like new', 'Alexandria', 'sold', 100, [['satin', '#F0E6D2', '#CDBA95']], 'satin'],
      [21, 3, 1, 'Viscose challis end of roll', 'Printed viscose, two rolls.', 210, 'meters', 35, 'new', 'El Mahalla El Kubra', 'sold', 90, [['floral', '#EAD8E0', '#B4607E']], 'viscose'],
      [22, 1, 3, 'Used winter jackets', 'Gently used jackets, cleaned and sorted.', 20, 'pieces', 120, 'used', 'Cairo', 'sold', 75, [['coat', '#E9ECEE', '#4A5568']], 'other'],
      [23, 5, 1, 'Jersey offcuts, assorted colours', 'Soft offcuts for kids\' clothing and headbands.', 180, 'kg', 14, 'new', 'Shubra El Kheima', 'sold', 55, [['stripes', '#E6EEF1', '#6A9AA8']], 'jersey'],
      [24, 7, 2, 'Cotton knit sweaters', 'First-quality sweaters, unsold stock.', 40, 'pieces', 150, 'new', 'Mansoura', 'sold', 45, [['shirt', '#F3EEE6', '#8A7E6A']], 'cotton'],
      [25, 8, 2, 'Terry towels, factory seconds', 'Small colour flaws, fully usable.', 60, 'pieces', 40, 'like new', 'Port Said', 'sold', 30, [['weave', '#F2F4F4', '#B9C3C6']], 'terry'],
      [26, 6, 1, 'Natural linen offcuts', 'Washed linen pieces from a resort-wear brand.', 90, 'kg', 28, 'new', '10th of Ramadan City', 'sold', 20, [['weave', '#E5DCC8', '#A89A78']], 'linen']
    ];
    H.forEach((h) => { L.push(h); FAB[h[0]] = h[13]; });
    const listings = [], photos = [];
    L.forEach((l) => {
      listings.push({
        id: sid(200 + l[0]), created_at: ago(l[11], l[0]), seller_id: sid(l[1]), category_id: cid(l[2]),
        title: l[3], description: l[4], quantity: l[5], unit: l[6], price: l[7], is_free: l[7] === null,
        condition: l[8], city: l[9], status: l[10], fabric_type: FAB[l[0]] || 'other'
      });
      l[12].forEach((p, i) => photos.push({ id: sid(1000 + l[0] * 10 + i), created_at: ago(l[11], l[0]), listing_id: sid(200 + l[0]), image_url: art(p[0], p[1], p[2]), position: i }));
    });

    // [listing n, buyer profile n, quantity, status, created days ago, updated days ago]
    const O = [
      [17, 2, 300, 'completed', 155, 150], [18, 9, 140, 'completed', 130, 120], [19, 2, 80, 'completed', 110, 100], [20, 9, 25, 'completed', 92, 85],
      [21, 2, 210, 'completed', 78, 70], [22, 10, 20, 'completed', 66, 60], [23, 2, 180, 'completed', 48, 40], [24, 9, 40, 'completed', 36, 30],
      [25, 2, 60, 'completed', 24, 18], [26, 9, 90, 'completed', 14, 9], [9, 2, 65, 'completed', 6, 3],
      [7, 2, 6, 'requested', 2, 2], [11, 2, 3, 'requested', 1, 1], [5, 2, 60, 'accepted', 3, 1], [1, 2, 30, 'requested', 1, 1], [14, 2, 70, 'accepted', 5, 2], [3, 10, 10, 'requested', 1, 1]
    ];
    const orders = O.map((o, i) => {
      const l = listings.find((x) => x.id === sid(200 + o[0])), price = l.price || 0;
      return { id: sid(3000 + i), created_at: ago(o[4]), updated_at: ago(o[5]), listing_id: l.id, buyer_id: sid(o[1]), seller_id: l.seller_id, quantity: o[2], unit_price: price, total: price * o[2], status: o[3], note: '' };
    });
    const saved = [[2, 1], [2, 2], [2, 12], [2, 16], [9, 2], [9, 4], [10, 6]].map((s, i) => ({ id: sid(4000 + i), created_at: ago(2 + i), user_id: sid(s[0]), listing_id: sid(200 + s[1]) }));
    return { v: 2, authUsers, profiles, categories, listings, photos, orders, saved, prefs: {}, aiMode: 'auto', session: { userId: null }, flash: null };
  }

  /* ---------- storage: localStorage with a window.name fallback (survives page-to-page navigation) ---------- */
  function load() {
    let s = null;
    try { if (window.name && window.name.indexOf('{"fwm":') === 0) s = JSON.parse(window.name).fwm; } catch (e) { s = null; }
    if (!s) { try { const r = localStorage.getItem(KEY); if (r) s = JSON.parse(r); } catch (e) { s = null; } }
    return s && s.v === 2 ? s : null;
  }
  function save() {
    let str, ok = true;
    try { str = JSON.stringify(state); } catch (e) { return false; }
    try { localStorage.setItem(KEY, str); } catch (e) { ok = false; }
    try { window.name = '{"fwm":' + str + '}'; } catch (e) { /* ignore */ }
    return ok;
  }
  state = load() || seed();
  // Every account has exactly one role: buyer or seller. Older saved data may still hold "both":
  // an account that owns listings becomes a seller, any other becomes a buyer.
  state.profiles.forEach((p) => {
    if (p.role !== 'buyer' && p.role !== 'seller') p.role = state.listings.some((l) => l.seller_id === p.id) ? 'seller' : 'buyer';
  });
  save();

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
    if (i >= 0) state.saved.splice(i, 1); else state.saved.push({ id: uid(), created_at: new Date().toISOString(), user_id: u.id, listing_id: listingId });
    save(); return i < 0;
  }
  const ordersWhere = (fn) => state.orders.filter(fn).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  function createOrder(listingId, qty, note) {
    const u = me(), l = listing(listingId); if (!u || !l) return null;
    const now = new Date().toISOString(), price = l.is_free ? 0 : Number(l.price);
    const o = { id: uid(), created_at: now, updated_at: now, listing_id: l.id, buyer_id: u.id, seller_id: l.seller_id, quantity: qty, unit_price: price, total: price * qty, status: 'requested', note: note || '' };
    state.orders.push(o); save(); return o;
  }
  function setOrderStatus(id, status) {
    const o = state.orders.find((x) => x.id === id); if (!o) return;
    const l = listing(o.listing_id); o.status = status; o.updated_at = new Date().toISOString();
    if (l) {
      if (status === 'accepted' && o.quantity >= l.quantity && l.status === 'available') l.status = 'reserved';
      if (status === 'completed') { if (o.quantity >= l.quantity) l.status = 'sold'; else { l.quantity -= o.quantity; if (l.status === 'reserved') l.status = 'available'; } }
      if ((status === 'declined' || status === 'cancelled') && l.status === 'reserved' && !state.orders.some((x) => x.id !== o.id && x.listing_id === l.id && x.status === 'accepted')) l.status = 'available';
    }
    save();
  }
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
  function flash(msg) { state.flash = msg; save(); }

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
          try { resolve(c.toDataURL('image/jpeg', q)); } catch (e) { reject(e); }
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

  function logout() {
    state.session.userId = null; state.flash = 'You are logged out.'; save();
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
    if (state.flash) { toast(state.flash); state.flash = null; save(); }
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
      '<div class="sf-note"><span>Prototype with sample data stored in this browser. No real accounts, payments or WhatsApp messages.</span><button type="button" class="linkbtn" id="reset-demo">Reset sample data</button></div>';
    document.getElementById('reset-demo').addEventListener('click', () => { state = seed(); save(); location.href = 'index.html'; });
  }

  /* Shows a message instead of the page when the visitor must log in or must be a seller. Returns true when allowed. */
  function gate(container, needSeller) {
    const user = me();
    if (!user) {
      container.innerHTML = '<div class="narrow"><div class="panel stack"><h1>Log in to continue</h1><p class="muted">You need an account to use this page. Logging in takes a few seconds in this prototype.</p><a class="btn btn-primary" href="auth.html">Log in or sign up</a></div></div>';
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
    login(id) { state.session.userId = id; save(); }
  };
})();
