/* Minimal QR encoder — byte mode, EC level L, versions 1-6, mask 0.
 * Ported verbatim from the design export's assets/qr.js (self-contained, no
 * deps) so the engagement invitation can draw its own face-match QR without a
 * runtime library or a server round-trip. drawQr(canvas, text, opts?) -> bool.
 */
const SPEC = [null,
  { dc: 19, ec: 7, nb: 1 },
  { dc: 34, ec: 10, nb: 1 },
  { dc: 55, ec: 15, nb: 1 },
  { dc: 80, ec: 20, nb: 1 },
  { dc: 108, ec: 26, nb: 1 },
  { dc: 136, ec: 18, nb: 2 }];
const FMT_L0 = '111011111000100'; // format info, EC L, mask 0 (MSB first)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function () {
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
})();
function gmul(a, b) { return (a && b) ? EXP[LOG[a] + LOG[b]] : 0; }

function matrix(text) {
  const bytes = new TextEncoder().encode(text);
  let ver = 0;
  for (let v = 1; v <= 6; v++) { if (bytes.length + 2 <= SPEC[v].dc) { ver = v; break; } }
  if (!ver) return null;
  const spec = SPEC[ver];
  const cap = spec.dc * 8;

  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, 8);
  for (let i = 0; i < bytes.length; i++) put(bytes[i], 8);
  for (let t = 0; t < 4 && bits.length < cap; t++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let b = 0; b < bits.length; b += 8) { let n = 0; for (let k = 0; k < 8; k++) n = (n << 1) | bits[b + k]; data.push(n); }
  const pads = [0xEC, 0x11];
  let pi = 0;
  while (data.length < spec.dc) data.push(pads[pi++ % 2]);

  let g = [1];
  for (let e = 0; e < spec.ec; e++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j2 = 0; j2 < g.length; j2++) { ng[j2] ^= g[j2]; ng[j2 + 1] ^= gmul(g[j2], EXP[e]); }
    g = ng;
  }
  const per = spec.dc / spec.nb;
  const dblocks = [];
  const eblocks = [];
  for (let bl = 0; bl < spec.nb; bl++) {
    const block = data.slice(bl * per, (bl + 1) * per);
    const r = block.concat(new Array(spec.ec).fill(0));
    for (let ii = 0; ii < block.length; ii++) {
      const c0 = r[ii]; if (!c0) continue;
      for (let jj = 1; jj < g.length; jj++) r[ii + jj] ^= gmul(g[jj], c0);
    }
    dblocks.push(block); eblocks.push(r.slice(block.length));
  }
  const final = [];
  for (let q = 0; q < per; q++) for (let w = 0; w < spec.nb; w++) final.push(dblocks[w][q]);
  for (let q2 = 0; q2 < spec.ec; q2++) for (let w2 = 0; w2 < spec.nb; w2++) final.push(eblocks[w2][q2]);

  const size = 17 + 4 * ver;
  const mod = [];
  const fn = [];
  for (let r1 = 0; r1 < size; r1++) { mod.push(new Array(size).fill(null)); fn.push(new Array(size).fill(false)); }
  const set = (r, c, val) => { if (r < 0 || c < 0 || r >= size || c >= size) return; mod[r][c] = val; fn[r][c] = true; };

  [[0, 0], [0, size - 7], [size - 7, 0]].forEach((p) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      set(p[0] + r, p[1] + c, on ? 1 : 0);
    }
  });
  if (ver >= 2) {
    const R = size - 7;
    const C = size - 7;
    for (let ar = -2; ar <= 2; ar++) for (let ac = -2; ac <= 2; ac++)
      set(R + ar, C + ac, Math.max(Math.abs(ar), Math.abs(ac)) !== 1 ? 1 : 0);
  }
  for (let ti = 8; ti < size - 8; ti++) { const on2 = ti % 2 === 0 ? 1 : 0; set(6, ti, on2); set(ti, 6, on2); }
  set(size - 8, 8, 1);
  for (let f = 0; f < 15; f++) {
    const bit = FMT_L0.charCodeAt(14 - f) === 49 ? 1 : 0;
    if (f < 6) set(f, 8, bit); else if (f < 8) set(f + 1, 8, bit); else set(size - 15 + f, 8, bit);
    if (f < 8) set(8, size - f - 1, bit); else if (f < 9) set(8, 15 - f, bit); else set(8, 15 - f - 1, bit);
  }

  let inc = -1;
  let row = size - 1;
  let bitIndex = 7;
  let byteIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let cc = 0; cc < 2; cc++) {
        if (mod[row][col - cc] === null) {
          let dark = byteIndex < final.length ? ((final[byteIndex] >>> bitIndex) & 1) === 1 : false;
          if ((row + col - cc) % 2 === 0) dark = !dark;
          mod[row][col - cc] = dark ? 1 : 0;
          bitIndex--;
          if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
        }
      }
      row += inc;
      if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
    }
  }
  return mod;
}

export function drawQr(canvas, text, opts = {}) {
  const m = matrix(text);
  if (!m || !canvas) return false;
  const n = m.length;
  const px = canvas.width / n;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = opts.light || '#FFFCF4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = opts.dark || '#3A2A1E';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (m[r][c]) ctx.fillRect(Math.round(c * px), Math.round(r * px), Math.ceil(px), Math.ceil(px));
  return true;
}
