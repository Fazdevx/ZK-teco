// Genera un icon.ico profesional para "Asistencias Galileo" (electron-builder).
// Dibujo: huella dactilar con arcos concéntricos + reloj integrado,
// sobre fondo degradado naranja con brillo. Sin dependencias externas.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const W = SIZE, H = SIZE;
const cx = W / 2, cy = H / 2;

// Colores de marca Galileo
const C_DARK  = [0xEB, 0x58, 0x0C];
const C_MID   = [0xF9, 0x73, 0x16];
const C_LIGHT = [0xFD, 0xBA, 0x74];
const C_WARM  = [0xFF, 0xE0, 0xB2];

const px = new Uint8Array(W * H * 4);

function setPx(x, y, r, g, b, a) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
}

function blend(x, y, r, g, b, alpha) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  const ea = px[i + 3] / 255;
  const na = alpha * (1 - ea);
  const oa = ea + na;
  if (oa <= 0) return;
  px[i]     = Math.round((px[i]     * ea + r * na) / oa);
  px[i + 1] = Math.round((px[i + 1] * ea + g * na) / oa);
  px[i + 2] = Math.round((px[i + 2] * ea + b * na) / oa);
  px[i + 3] = Math.round(oa * 255);
}

function mix(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

// -- 1. Fondo degradado radial naranja con esquinas redondeadas ----------------
const outerR = SIZE * 0.52;
const cornerR = SIZE * 0.18;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const t = Math.min(dist / outerR, 1);
    let col;
    if (t < 0.6) col = mix(C_WARM, C_MID, t / 0.6);
    else col = mix(C_MID, C_DARK, (t - 0.6) / 0.4);

    const inCorner =
      (x < cornerR && y < cornerR && Math.sqrt((cornerR - x) ** 2 + (cornerR - y) ** 2) > cornerR) ||
      (x >= W - cornerR && y < cornerR && Math.sqrt((x - W + cornerR) ** 2 + (cornerR - y) ** 2) > cornerR) ||
      (x < cornerR && y >= H - cornerR && Math.sqrt((cornerR - x) ** 2 + (y - H + cornerR) ** 2) > cornerR) ||
      (x >= W - cornerR && y >= H - cornerR && Math.sqrt((x - W + cornerR) ** 2 + (y - H + cornerR) ** 2) > cornerR);

    if (inCorner) { setPx(x, y, 0, 0, 0, 0); }
    else {
      const hl = Math.max(0, 1 - dist / (outerR * 0.5)) * 0.25;
      setPx(x, y, Math.min(255, col[0] + hl * 255), Math.min(255, col[1] + hl * 255), Math.min(255, col[2] + hl * 255), 255);
    }
  }
}

// -- 2. Huella dactilar: arcos concentricos blancos ---------------------------
function drawArc(ax, ay, radius, a0, a1, thick, alpha) {
  const steps = Math.ceil(radius * (a1 - a0) * 0.03);
  for (let s = 0; s <= steps; s++) {
    const ang = (a0 + (a1 - a0) * (s / steps)) * Math.PI / 180;
    for (let t = -thick / 2; t <= thick / 2; t++) {
      blend(Math.round(ax + (radius + t) * Math.cos(ang)), Math.round(ay + (radius + t) * Math.sin(ang)), 255, 255, 255, alpha);
    }
  }
}

const fpCy = cy + 4;
const arcs = [
  { r: 85, s: 200, e: 340, t: 4 }, { r: 70, s: 210, e: 330, t: 3.5 },
  { r: 55, s: 215, e: 320, t: 3 }, { r: 42, s: 220, e: 310, t: 3 },
  { r: 30, s: 225, e: 295, t: 2.5 }, { r: 20, s: 230, e: 280, t: 2 },
  { r: 60, s: 160, e: 210, t: 3 }, { r: 60, s: 330, e: 380, t: 3 },
  { r: 45, s: 150, e: 205, t: 2.5 }, { r: 45, s: 335, e: 385, t: 2.5 },
];
for (const a of arcs) drawArc(cx, fpCy, a.r, a.s, a.e, a.t, 0.75);

// -- 3. Circulo del reloj (centro de la huella) -------------------------------
const clockR = 28;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (Math.abs(d - clockR) < 2.5) blend(x, y, 255, 255, 255, 0.9);
  if (d < clockR - 2) blend(x, y, 255, 240, 220, 0.15 + Math.max(0, 1 - d / clockR) * 0.15);
}
// Marcas de hora
for (let h = 0; h < 12; h++) {
  const ang = (h * 30 - 90) * Math.PI / 180;
  const main = h % 3 === 0;
  const ir = main ? clockR - 10 : clockR - 6;
  const or2 = clockR - 2;
  const tk = main ? 2.5 : 1.5;
  for (let t = -tk / 2; t <= tk / 2; t++) {
    blend(Math.round(cx + (ir + t) * Math.cos(ang)), Math.round(cy + (ir + t) * Math.sin(ang)), 255, 255, 255, 0.8);
    blend(Math.round(cx + (or2 + t) * Math.cos(ang)), Math.round(cy + (or2 + t) * Math.sin(ang)), 255, 255, 255, 0.8);
  }
}

// Manecillas (8:20)
function hand(deg, len, thick, alpha) {
  const a = (deg - 90) * Math.PI / 180;
  const st = Math.ceil(len * 2);
  for (let s = 0; s <= st; s++) {
    const dist = (s / st) * len;
    for (let t = -thick / 2; t <= thick / 2; t++) {
      const pa = a + Math.PI / 2;
      blend(Math.round(cx + dist * Math.cos(a) + t * Math.cos(pa)), Math.round(cy + dist * Math.sin(a) + t * Math.sin(pa)), 255, 255, 255, alpha);
    }
  }
}
hand(250, 14, 3, 0.9);
hand(120, 20, 2.5, 0.9);
for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 9) blend(cx + x, cy + y, 255, 255, 255, 1);

// -- 4. Marca "G" sutil (esquina inferior derecha) -----------------------------
const gCx = W - 38, gCy = H - 34, gSz = 16;
drawArc(gCx, gCy, gSz, 45, 360, 3, 0.3);
for (let dx = -2; dx <= gSz * 0.7; dx++) for (let t = -1.5; t <= 1.5; t++)
  blend(gCx + Math.round(dx * 0.3) + Math.round(gSz * 0.5), gCy + Math.round(t), 255, 255, 255, 0.3);

// -- 5. PNG + ICO --------------------------------------------------------------
function makePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw);
  const crcTbl = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTbl[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTbl[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length, 0); const tb = Buffer.from(t, 'ascii'); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([tb, d])) >>> 0, 0); return Buffer.concat([l, tb, d, c]); };
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const png = makePNG(W, H, px);
const icoHdr = Buffer.alloc(6);
icoHdr.writeUInt16LE(0, 0); icoHdr.writeUInt16LE(1, 2); icoHdr.writeUInt16LE(1, 4);
const dir = Buffer.alloc(16);
dir[0] = 0; dir[1] = 0; dir[2] = 0; dir[3] = 0;
dir.writeUInt16LE(1, 4); dir.writeUInt32LE(png.length, 8); dir.writeUInt32LE(22, 12);
const ico = Buffer.concat([icoHdr, dir, png]);

const outPath = path.join(__dirname, 'icon.ico');
fs.writeFileSync(outPath, ico);
console.log('Asistencias Galileo icon.ico creado:', outPath, '(' + ico.length + ' bytes)');