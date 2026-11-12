import * as THREE from 'three';
import { PRACTICE as P, COLORS } from '../config.js';
import { Surface } from './surface.js';
import { FONT, roundRect } from '../util.js';
import { IMG, drawCover } from '../world/images.js';

// Painted at high resolution and applied to the pack's document meshes (glTF UVs: flipY = false).
// Everything is fictional and visibly marked PRACTICE ONLY; the codes are decorative, never scannable.

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const T = (ctx, text, x, y, font, color, align = 'left') => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y); ctx.textAlign = 'left'; };
const spaced = (ctx, text, x, y, px, color, track = 3) => { ctx.font = `700 ${px}px ${FONT}`; if ('letterSpacing' in ctx) ctx.letterSpacing = track + 'px'; ctx.fillStyle = color; ctx.fillText(text.toUpperCase(), x, y); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; };

function paper(ctx, w, h, tint = '#f6f2e8') {
  ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h);
  const r = rng(7);
  for (let i = 0; i < w * h / 900; i++) { ctx.fillStyle = `rgba(120,110,90,${0.015 + r() * 0.03})`; ctx.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
  // security guilloche
  ctx.strokeStyle = 'rgba(27,138,134,0.07)'; ctx.lineWidth = 2;
  for (let k = 0; k < 14; k++) { ctx.beginPath(); for (let x = 0; x <= w; x += 24) ctx.lineTo(x, h * (0.25 + k * 0.045) + Math.sin(x / 90 + k) * 18); ctx.stroke(); }
}

function logo(ctx, x, y, s, light = true) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = light ? '#fff' : COLORS.teal; ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = light ? COLORS.teal : '#fff'; ctx.beginPath();
  ctx.moveTo(s * 0.22, s * 0.58); ctx.lineTo(s * 0.78, s * 0.3); ctx.lineTo(s * 0.62, s * 0.74); ctx.lineTo(s * 0.5, s * 0.58); ctx.lineTo(s * 0.4, s * 0.7); ctx.lineTo(s * 0.38, s * 0.52); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** The Practice Air logo on a white pill (works on any header colour). Returns the pill's right edge. */
function brand(ctx, x, y, h) {
  const im = IMG['logo-practice-air'];
  if (!im) { logo(ctx, x, y, h * 0.8); T(ctx, 'PRACTICE AIR', x + h, y + h * 0.62, `800 ${Math.round(h * 0.5)}px ${FONT}`, '#fff'); return x + h * 4; }
  const w = h * (im.width / im.height) * 0.78;
  ctx.fillStyle = '#fff'; roundRect(ctx, x, y, w + h * 0.5, h, h / 2); ctx.fill();
  ctx.drawImage(im, x + h * 0.25, y + h * 0.12, w, h * 0.76);
  return x + w + h * 0.5;
}

/** One of the four practice portraits, chosen from the learner's name so it stays the same every time. */
function facePhoto() {
  let hsh = 0; for (const ch of P.passenger) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return IMG['face-' + ((hsh % 4) + 1)];
}

/** Decorative QR-like block, crossed out so it can never be mistaken for a valid code. */
function sampleCode(ctx, x, y, s, seed = 3) {
  const n = 25, m = s / n, r = rng(seed);
  ctx.fillStyle = '#fff'; ctx.fillRect(x - m, y - m, s + 2 * m, s + 2 * m);
  ctx.fillStyle = COLORS.navy;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const finder = (i < 7 && j < 7) || (i > n - 8 && j < 7) || (i < 7 && j > n - 8);
    if (finder) continue;
    if (r() > 0.52) ctx.fillRect(x + i * m, y + j * m, m * 0.96, m * 0.96);
  }
  for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    ctx.fillRect(x + fx * m, y + fy * m, 7 * m, 7 * m); ctx.fillStyle = '#fff'; ctx.fillRect(x + (fx + 1) * m, y + (fy + 1) * m, 5 * m, 5 * m);
    ctx.fillStyle = COLORS.navy; ctx.fillRect(x + (fx + 2) * m, y + (fy + 2) * m, 3 * m, 3 * m);
  }
  ctx.strokeStyle = 'rgba(212,52,79,0.9)'; ctx.lineWidth = s * 0.03;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y); ctx.lineTo(x, y + s); ctx.stroke();
}

function barcode(ctx, x, y, w, h, seed = 11) {
  const r = rng(seed); let cx = x; ctx.fillStyle = COLORS.navy;
  while (cx < x + w) { const bw = 3 + Math.floor(r() * 9); if (r() > 0.4) ctx.fillRect(cx, y, bw, h); cx += bw + 3 + Math.floor(r() * 5); }
}

/** Boarding pass: 2800 x 1240 (matches the 0.21 x 0.093 m mesh). `gate` is what was PRINTED. */
export function boardingPassCanvas({ gate = P.gateOriginal } = {}) {
  const W = 2800, H = 1240, [c, ctx] = mk(W, H);
  paper(ctx, W, H);
  const main = 2060;
  // header band
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#146e6b'); g.addColorStop(1, '#1b8a86');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 200);
  const bx = brand(ctx, 50, 26, 148);
  T(ctx, 'BOARDING PASS', bx + 40, 118, `700 48px ${FONT}`, 'rgba(255,255,255,0.92)');
  T(ctx, 'ECONOMY', main - 70, 112, `800 64px ${FONT}`, '#fff', 'right');
  T(ctx, 'BOARDING PASS', W - 60, 112, `800 50px ${FONT}`, '#fff', 'right');
  T(ctx, 'PA101 · 12 AUG', W - 60, 166, `600 38px ${FONT}`, 'rgba(255,255,255,0.85)', 'right');
  // perforation + notches
  ctx.setLineDash([16, 14]); ctx.strokeStyle = 'rgba(15,34,54,0.35)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(main, 200); ctx.lineTo(main, H); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#cfd8d8'; for (const yy of [200, H]) { ctx.beginPath(); ctx.arc(main, yy, 34, 0, Math.PI * 2); ctx.fill(); }

  // passenger
  spaced(ctx, 'Passenger', 70, 262, 32, COLORS.muted);
  let name = P.passengerUpper; ctx.font = `800 104px ${FONT}`;
  while (ctx.measureText(name).width > main - 160 && name.length > 4) name = name.slice(0, -1);
  T(ctx, name, 70, 360, `800 104px ${FONT}`, COLORS.navy);
  // route
  spaced(ctx, 'From', 70, 450, 32, COLORS.muted); spaced(ctx, 'To', 1000, 450, 32, COLORS.muted);
  T(ctx, P.from.code, 70, 590, `800 170px ${FONT}`, COLORS.navy);
  T(ctx, P.from.city.toUpperCase(), 78, 640, `600 44px ${FONT}`, COLORS.muted);
  T(ctx, P.to.code, 1000, 590, `800 170px ${FONT}`, COLORS.navy);
  T(ctx, P.to.city.toUpperCase(), 1008, 640, `600 44px ${FONT}`, COLORS.muted);
  ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(560, 540); ctx.lineTo(900, 540); ctx.stroke();
  logo(ctx, 680, 480, 120, false);
  // flight facts
  const cols = [[70, 'Flight', P.flight], [400, 'Date', 'PRACTICE DAY'], [1010, 'Boarding', P.boarding], [1370, 'Departs', P.departure], [1730, 'Terminal', P.terminal]];
  cols.forEach(([x, k, v]) => { spaced(ctx, k, x, 740, 30, COLORS.muted); T(ctx, v, x, 820, `800 70px ${FONT}`, COLORS.navy); });
  // gate + seat emphasis
  const box = (x, label, val, hi) => {
    ctx.fillStyle = hi ? COLORS.teal : '#e8efef'; roundRect(ctx, x, 880, 440, 230, 30); ctx.fill();
    spaced(ctx, label, x + 34, 940, 32, hi ? 'rgba(255,255,255,0.85)' : COLORS.muted);
    T(ctx, val, x + 34, 1070, `800 150px ${FONT}`, hi ? '#fff' : COLORS.navy);
  };
  box(70, 'Gate', gate, false); box(540, 'Seat', P.seat, true);
  spaced(ctx, 'Check-in', 1030, 940, 30, COLORS.muted); T(ctx, P.checkin, 1030, 1020, `800 70px ${FONT}`, COLORS.navy);
  spaced(ctx, 'Zone', 1030, 1085, 30, COLORS.muted); T(ctx, '2', 1180, 1085, `800 44px ${FONT}`, COLORS.navy);
  spaced(ctx, 'Seq', 1330, 940, 30, COLORS.muted); T(ctx, '047', 1330, 1020, `800 70px ${FONT}`, COLORS.navy);
  T(ctx, 'Gates can change. Check the screens.', 1330, 1085, `600 32px ${FONT}`, COLORS.muted);
  // code zone (face +Z; the scanner reads this side)
  sampleCode(ctx, 1640, 880, 330, 5);
  T(ctx, 'SAMPLE · NOT A VALID CODE', 1640, 1180, `800 30px ${FONT}`, COLORS.warn);
  barcode(ctx, 70, 1160, 1450, 54, 9);
  // stub
  const sx = main + 60;
  T(ctx, name.length > 16 ? name.slice(0, 16) : name, sx, 280, `800 54px ${FONT}`, COLORS.navy);
  [['Flight', P.flight], ['From → To', `${P.from.code} → ${P.to.code}`], ['Gate', gate], ['Seat', P.seat], ['Boarding', P.boarding]].forEach(([k, v], i) => {
    spaced(ctx, k, sx, 380 + i * 118, 28, COLORS.muted); T(ctx, v, sx, 432 + i * 118, `800 56px ${FONT}`, COLORS.navy);
  });
  sampleCode(ctx, sx + 20, 960, 200, 8);
  // practice stamp
  ctx.save(); ctx.translate(1720, 470); ctx.rotate(-0.14); ctx.strokeStyle = 'rgba(212,52,79,0.6)'; ctx.lineWidth = 8; roundRect(ctx, -270, -52, 540, 104, 20); ctx.stroke();
  T(ctx, 'PRACTICE ONLY', 0, 24, `800 62px ${FONT}`, 'rgba(212,52,79,0.6)', 'center'); ctx.restore();
  return c;
}

/** Booking confirmation: 2000 x 2828 (A4, 0.21 x 0.297 m). */
export function bookingCanvas() {
  const W = 2000, H = 2828, [c, ctx] = mk(W, H);
  paper(ctx, W, H, '#fbfaf6');
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#146e6b'); g.addColorStop(1, '#1b8a86');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 300);
  const bx = brand(ctx, 90, 70, 160); T(ctx, 'Booking confirmation', bx + 50, 190, `700 62px ${FONT}`, 'rgba(255,255,255,0.94)');
  T(ctx, 'PRACTICE ONLY', W - 110, 178, `800 54px ${FONT}`, '#fff', 'right');
  T(ctx, `Thank you for choosing Practice Air, ${P.passenger.split(' ')[0]}.`, 110, 420, `600 60px ${FONT}`, COLORS.navy);
  T(ctx, 'Here are your flight details. Keep this email; you will need it at check-in.', 110, 490, `500 42px ${FONT}`, COLORS.muted);
  // reference block
  ctx.fillStyle = '#e8f3f2'; roundRect(ctx, 110, 560, W - 220, 230, 30); ctx.fill();
  spaced(ctx, 'Booking reference', 160, 640, 34, COLORS.muted); T(ctx, P.ref, 160, 750, `800 120px ${FONT}`, COLORS.navy);
  spaced(ctx, 'Passenger', 900, 640, 34, COLORS.muted); T(ctx, P.passengerUpper, 900, 740, `800 62px ${FONT}`, COLORS.navy);
  // flight card
  ctx.fillStyle = '#fff'; roundRect(ctx, 110, 850, W - 220, 760, 36); ctx.fill(); ctx.strokeStyle = 'rgba(15,34,54,0.12)'; ctx.lineWidth = 4; roundRect(ctx, 110, 850, W - 220, 760, 36); ctx.stroke();
  T(ctx, `${P.airline} · ${P.flight}`, 170, 950, `800 64px ${FONT}`, COLORS.navy);
  T(ctx, 'PRACTICE DAY', W - 170, 950, `700 50px ${FONT}`, COLORS.muted, 'right');
  T(ctx, P.from.code, 170, 1180, `800 190px ${FONT}`, COLORS.navy); T(ctx, P.from.city, 176, 1250, `600 54px ${FONT}`, COLORS.muted);
  T(ctx, P.to.code, 1180, 1180, `800 190px ${FONT}`, COLORS.navy); T(ctx, P.to.city, 1186, 1250, `600 54px ${FONT}`, COLORS.muted);
  ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(780, 1110); ctx.lineTo(1100, 1110); ctx.stroke(); logo(ctx, 880, 1050, 120, false);
  [['Departure', P.departure, 170], ['Boarding', P.boarding, 620], ['Terminal', `Terminal ${P.terminal}`, 1070], ['Class', 'Economy', 1530]].forEach(([k, v, x]) => { spaced(ctx, k, x, 1390, 32, COLORS.muted); T(ctx, v, x, 1470, `800 56px ${FONT}`, COLORS.navy); });
  // extras
  T(ctx, 'Baggage', 110, 1760, `800 50px ${FONT}`, COLORS.navy);
  T(ctx, 'Cabin bag 7 kg included · Checked bag 15 kg included', 110, 1830, `500 44px ${FONT}`, COLORS.ink);
  T(ctx, 'Check-in', 110, 1960, `800 50px ${FONT}`, COLORS.navy);
  T(ctx, 'Online check-in opens 24 hours before departure. At the airport, go to desk ' + P.checkin + '.', 110, 2030, `500 44px ${FONT}`, COLORS.ink);
  T(ctx, 'Your boarding pass is issued after check-in, online or at the airport.', 110, 2100, `600 44px ${FONT}`, COLORS.tealDark);
  T(ctx, 'Bring', 110, 2230, `800 50px ${FONT}`, COLORS.navy);
  T(ctx, 'This confirmation and a photo ID.', 110, 2300, `500 44px ${FONT}`, COLORS.ink);
  sampleCode(ctx, W - 520, 2150, 330, 12);
  ctx.fillStyle = 'rgba(212,52,79,0.1)'; roundRect(ctx, 110, 2480, W - 220, 190, 28); ctx.fill();
  T(ctx, 'PRACTICE DOCUMENT — fictional flight, name and codes. Not valid for travel.', 150, 2590, `700 46px ${FONT}`, COLORS.warn);
  return c;
}

/** Photo ID card: 1720 x 1080 (0.086 x 0.054 m). */
export function idCanvas() {
  const W = 1720, H = 1080, [c, ctx] = mk(W, H);
  paper(ctx, W, H, '#eef4f2');
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#146e6b'); g.addColorStop(1, '#2aa39d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 170);
  const bx = brand(ctx, 36, 18, 134); T(ctx, 'PRACTICE ID CARD', bx + 30, 92, `800 60px ${FONT}`, '#fff'); T(ctx, 'Sample document · not an official ID', bx + 30, 142, `600 30px ${FONT}`, 'rgba(255,255,255,0.88)');
  // photo
  ctx.fillStyle = '#d3e2e0'; roundRect(ctx, 60, 230, 420, 540, 28); ctx.fill();
  const face = facePhoto();
  if (face) { ctx.save(); roundRect(ctx, 60, 230, 420, 540, 28); ctx.clip(); drawCover(ctx, face, 60, 230, 420, 540, 1.0); ctx.restore(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; roundRect(ctx, 60, 230, 420, 540, 28); ctx.stroke(); }
  else { ctx.fillStyle = '#9db9b6'; ctx.beginPath(); ctx.arc(270, 440, 104, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(270, 700, 190, 150, 0, Math.PI, 0); ctx.fill(); }
  let name = P.passengerUpper; ctx.font = `800 78px ${FONT}`; while (ctx.measureText(name).width > 1100 && name.length > 4) name = name.slice(0, -1);
  spaced(ctx, 'Name', 540, 262, 30, COLORS.muted); T(ctx, name, 540, 345, `800 78px ${FONT}`, COLORS.navy);
  [['Date of birth', '01 JAN 1955'], ['ID number', 'PRC-000-1234'], ['Valid until', 'PRACTICE'], ['Nationality', 'SAMPLE']].forEach(([k, v], i) => {
    const x = 540 + (i % 2) * 560, y = 440 + Math.floor(i / 2) * 150;
    spaced(ctx, k, x, y, 28, COLORS.muted); T(ctx, v, x, y + 62, `700 50px ${FONT}`, COLORS.navy);
  });
  barcode(ctx, 60, 850, 760, 110, 21);
  T(ctx, 'PRACTICE ONLY', W - 60, 1010, `800 70px ${FONT}`, 'rgba(212,52,79,0.6)', 'right');
  return c;
}

/** Texture a pack document mesh ("DocumentFace") with one of the painted canvases. */
export function applyDocument(root, canvas) {
  const mesh = root.getObjectByName('DocumentFace');
  if (!mesh) return;
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Surface.maxAnisotropy;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  mesh.material.map = tex; mesh.material.emissiveMap = null; mesh.material.color?.set(0xffffff);
  if ('roughness' in mesh.material) mesh.material.roughness = 0.85;
  mesh.material.needsUpdate = true;
  mesh.material.userData.ownedMap = true;
}

/** The e-ticket PDF as it looks on the phone: 720 x 1500, with big, readable lines for the important facts. */
export function phonePdfCanvas() {
  const W = 720, H = 1500, [c, ctx] = mk(W, H);
  ctx.fillStyle = '#dde5e8'; ctx.fillRect(0, 0, W, H);
  T(ctx, '9:41', 34, 52, `700 34px ${FONT}`, COLORS.navy); T(ctx, '5G  ▮▮▮▮', W - 34, 52, `600 28px ${FONT}`, COLORS.navy, 'right');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 70, W, 96);
  T(ctx, '‹', 30, 140, `500 64px ${FONT}`, COLORS.navy); T(ctx, `${P.flight}-e-ticket.pdf`, 90, 134, `700 34px ${FONT}`, COLORS.navy); T(ctx, '1 / 1', W - 30, 134, `600 30px ${FONT}`, COLORS.muted, 'right');
  const x = 22, y = 190, w = W - 44, h = H - 190 - 24;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; ctx.fillStyle = '#fffefb'; roundRect(ctx, x, y, w, h, 14); ctx.fill(); ctx.restore();
  const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#146e6b'); g.addColorStop(1, '#1b8a86'); ctx.fillStyle = g; ctx.fillRect(x, y, w, 118);
  logo(ctx, x + 26, y + 20, 78, true); T(ctx, P.airline, x + 124, y + 62, `800 40px ${FONT}`, '#fff'); T(ctx, 'e-ticket', x + 124, y + 100, `600 30px ${FONT}`, 'rgba(255,255,255,0.92)');
  let yy = y + 188;
  T(ctx, `Hello, ${P.passenger.split(' ')[0]}`, x + 30, yy, `800 52px ${FONT}`, COLORS.navy); yy += 46;
  T(ctx, P.passengerUpper, x + 30, yy, `600 30px ${FONT}`, COLORS.muted); yy += 32;
  T(ctx, 'Booking reference ' + P.ref, x + 30, yy, `600 30px ${FONT}`, COLORS.muted); yy += 120;
  T(ctx, P.from.code, x + 30, yy, `800 130px ${FONT}`, COLORS.navy); T(ctx, P.to.code, x + w - 30, yy, `800 130px ${FONT}`, COLORS.navy, 'right');
  ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 250, yy - 46); ctx.lineTo(x + w - 270, yy - 46); ctx.stroke(); logo(ctx, x + w / 2 - 36, yy - 84, 72, false);
  yy += 54; T(ctx, P.from.city, x + 30, yy, `600 36px ${FONT}`, COLORS.muted); T(ctx, P.to.city, x + w - 30, yy, `600 36px ${FONT}`, COLORS.muted, 'right'); yy += 70;
  ctx.fillStyle = '#e8f3f2'; roundRect(ctx, x + 24, yy, w - 48, 120, 22); ctx.fill();
  T(ctx, P.flight, x + 50, yy + 76, `800 60px ${FONT}`, COLORS.navy); T(ctx, `Departs ${P.departure}`, x + w - 50, yy + 50, `800 40px ${FONT}`, COLORS.navy, 'right'); T(ctx, `Boarding ${P.boarding}`, x + w - 50, yy + 96, `600 32px ${FONT}`, COLORS.muted, 'right'); yy += 160;
  const bw = (w - 48 - 24) / 3;
  [['Terminal', P.terminal], ['Seat', P.seat], ['Check-in', P.checkin]].forEach(([k, v], i) => {
    const bx = x + 24 + i * (bw + 12); ctx.fillStyle = '#fff'; roundRect(ctx, bx, yy, bw, 150, 20); ctx.fill(); ctx.strokeStyle = 'rgba(15,34,54,0.14)'; ctx.lineWidth = 3; roundRect(ctx, bx, yy, bw, 150, 20); ctx.stroke();
    spaced(ctx, k, bx + 20, yy + 40, 24, COLORS.muted, 2); T(ctx, String(v), bx + 20, yy + 112, `800 64px ${FONT}`, COLORS.navy);
  }); yy += 200;
  T(ctx, 'Baggage', x + 30, yy, `800 36px ${FONT}`, COLORS.navy); yy += 46;
  T(ctx, 'Cabin bag up to 7 kg', x + 30, yy, `500 34px ${FONT}`, COLORS.ink); yy += 44; T(ctx, 'Checked bag up to 15 kg', x + 30, yy, `500 34px ${FONT}`, COLORS.ink); yy += 70;
  T(ctx, 'Bring', x + 30, yy, `800 36px ${FONT}`, COLORS.navy); yy += 46;
  T(ctx, 'This ticket and a photo ID', x + 30, yy, `500 34px ${FONT}`, COLORS.ink); yy += 74;
  ctx.fillStyle = 'rgba(212,52,79,0.1)'; roundRect(ctx, x + 24, yy, w - 48, 92, 18); ctx.fill();
  T(ctx, 'PRACTICE ONLY · fictional flight', x + w / 2, yy + 58, `700 30px ${FONT}`, COLORS.warn, 'center');
  return c;
}
