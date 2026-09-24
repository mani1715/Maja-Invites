// Minimal QR Code encoder — BYTE mode only, auto version selection.
//
// Why this exists: the Upload Methods panel needs a scannable QR for the
// phone-live-mode URL, but the brief forbids adding a QR npm package, and no
// backend QR endpoint accepts an arbitrary target URL (the ones in server.py
// all derive the payload from the wedding's own slug, never a query-stringed
// live-upload token). So this is a small, dependency-free encoder vendored
// straight from the algorithm in the MIT-licensed `qrcode` package
// (soldair/node-qrcode, itself derived from Kazuhiko Arase's qrcode-generator) —
// every constant table below (codeword counts, EC codeword/block tables, GF(256)
// generation, BCH generator polynomials) was copied from that package's
// lib/core/*.js sources, not re-derived from memory, and cross-checked against
// it cell-for-cell (see qrEncode.selftest.mjs) so the QR this renders is
// actually scannable, not just plausible-looking.
//
// ponytail: byte mode only, no numeric/alphanumeric/kanji segmentation -- every
// payload here is a URL, byte mode always applies. Add segmentation only if a
// non-URL use case shows up.

// Two distinct encodings for the same 4 levels -- easy to conflate, so kept as
// two separate tables. EC_LEVEL_INDEX is the row offset into the EC codeword/
// block tables below. EC_LEVEL_FORMAT_BIT is the unrelated 2-bit field value
// baked into the format-info BCH codeword (spec-defined, not a table index).
const EC_LEVEL_INDEX = { L: 0, M: 1, Q: 2, H: 3 };
const EC_LEVEL_FORMAT_BIT = { L: 1, M: 0, Q: 3, H: 2 };

// Total codewords (data + EC) per version 1..40. Index 0 unused.
const CODEWORDS_COUNT = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
];

// EC codewords per version/level, ordered [L, M, Q, H] per row (one row per version).
const EC_CODEWORDS_TABLE = [
  7, 10, 13, 17, 10, 16, 22, 28, 15, 26, 36, 44, 20, 36, 52, 64, 26, 48, 72, 88,
  36, 64, 96, 112, 40, 72, 108, 130, 48, 88, 132, 156, 60, 110, 160, 192, 72, 130, 192, 224,
  80, 150, 224, 264, 96, 176, 260, 308, 104, 198, 288, 352, 120, 216, 320, 384, 132, 240, 360, 432,
  144, 280, 408, 480, 168, 308, 448, 532, 180, 338, 504, 588, 196, 364, 546, 650, 224, 416, 600, 700,
  224, 442, 644, 750, 252, 476, 690, 816, 270, 504, 750, 900, 300, 560, 810, 960, 312, 588, 870, 1050,
  336, 644, 952, 1110, 360, 700, 1020, 1200, 390, 728, 1050, 1260, 420, 784, 1140, 1350, 450, 812, 1200, 1440,
  480, 868, 1290, 1530, 510, 924, 1350, 1620, 540, 980, 1440, 1710, 570, 1036, 1530, 1800, 570, 1064, 1590, 1890,
  600, 1120, 1680, 1980, 630, 1204, 1770, 2100, 660, 1260, 1860, 2220, 720, 1316, 1950, 2310, 750, 1372, 2040, 2430,
];

// Number of EC blocks per version/level, ordered [L, M, Q, H] per row.
const EC_BLOCKS_TABLE = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 4, 1, 2, 4, 4,
  2, 4, 4, 4, 2, 4, 6, 5, 2, 4, 6, 6, 2, 5, 8, 8, 4, 5, 8, 8,
  4, 5, 8, 11, 4, 8, 10, 11, 4, 9, 12, 16, 4, 9, 16, 16, 6, 10, 12, 18,
  6, 10, 17, 16, 6, 11, 16, 19, 6, 13, 18, 21, 7, 14, 21, 25, 8, 16, 20, 25,
  8, 17, 23, 25, 9, 17, 23, 34, 9, 18, 25, 30, 10, 20, 27, 32, 12, 21, 29, 35,
  12, 23, 34, 37, 12, 25, 34, 40, 13, 26, 35, 42, 14, 28, 38, 45, 15, 29, 40, 48,
  16, 31, 43, 51, 17, 33, 45, 54, 18, 35, 48, 57, 19, 37, 51, 60, 19, 38, 53, 63,
  20, 40, 56, 66, 21, 43, 59, 70, 22, 45, 62, 74, 24, 47, 65, 77, 25, 49, 68, 81,
];

const getSymbolSize = (version) => version * 4 + 17;
const charCountBits = (version) => (version < 10 ? 8 : 16); // BYTE mode only

// ---- GF(256) tables + Reed-Solomon --------------------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (x, y) => (x === 0 || y === 0 ? 0 : EXP[LOG[x] + LOG[y]]);

function polyMul(p1, p2) {
  const out = new Uint8Array(p1.length + p2.length - 1);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) out[i + j] ^= gfMul(p1[i], p2[j]);
  }
  return out;
}
function polyMod(dividend, divisor) {
  let result = new Uint8Array(dividend);
  while (result.length - divisor.length >= 0) {
    const coeff = result[0];
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], coeff);
    let offset = 0;
    while (offset < result.length && result[offset] === 0) offset++;
    result = result.slice(offset);
  }
  return result;
}
function genECPolynomial(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) poly = polyMul(poly, new Uint8Array([1, EXP[i]]));
  return poly;
}
function rsEncode(data, degree) {
  const genPoly = genECPolynomial(degree);
  const padded = new Uint8Array(data.length + degree);
  padded.set(data);
  const remainder = polyMod(padded, genPoly);
  const start = degree - remainder.length;
  if (start > 0) {
    const buf = new Uint8Array(degree);
    buf.set(remainder, start);
    return buf;
  }
  return remainder;
}

// ---- Bit buffer -----------------------------------------------------------
class BitBuffer {
  constructor() { this.buffer = []; this.length = 0; }
  put(num, len) { for (let i = 0; i < len; i++) this.putBit(((num >>> (len - i - 1)) & 1) === 1); }
  putBit(bit) {
    const idx = Math.floor(this.length / 8);
    if (this.buffer.length <= idx) this.buffer.push(0);
    if (bit) this.buffer[idx] |= (0x80 >>> (this.length % 8));
    this.length++;
  }
}

// ---- Capacity / version selection -----------------------------------------
function getCapacityBytes(version, ecIndex) {
  const total = CODEWORDS_COUNT[version];
  const ec = EC_CODEWORDS_TABLE[(version - 1) * 4 + ecIndex];
  const dataBits = (total - ec) * 8;
  const reserved = 4 + charCountBits(version); // mode indicator + char-count indicator
  return Math.floor((dataBits - reserved) / 8);
}
function pickVersion(byteLen, ecIndex) {
  for (let v = 1; v <= 40; v++) {
    if (byteLen <= getCapacityBytes(v, ecIndex)) return v;
  }
  return null;
}

// ---- Data codeword construction (bitstream + RS interleave) --------------
function createDataCodewords(bytes, version, ecIndex) {
  const buffer = new BitBuffer();
  buffer.put(0b0100, 4); // BYTE mode indicator
  buffer.put(bytes.length, charCountBits(version));
  for (let i = 0; i < bytes.length; i++) buffer.put(bytes[i], 8);

  const total = CODEWORDS_COUNT[version];
  const ecTotal = EC_CODEWORDS_TABLE[(version - 1) * 4 + ecIndex];
  const dataTotalBits = (total - ecTotal) * 8;

  if (buffer.length + 4 <= dataTotalBits) buffer.put(0, 4);
  while (buffer.length % 8 !== 0) buffer.putBit(0);
  const remainingBytes = (dataTotalBits - buffer.length) / 8;
  for (let i = 0; i < remainingBytes; i++) buffer.put(i % 2 ? 0x11 : 0xec, 8);

  const dataTotalCodewords = total - ecTotal;
  const numBlocks = EC_BLOCKS_TABLE[(version - 1) * 4 + ecIndex];
  const blocksInGroup2 = total % numBlocks;
  const blocksInGroup1 = numBlocks - blocksInGroup2;
  const dataCwG1 = Math.floor(dataTotalCodewords / numBlocks);
  const dataCwG2 = dataCwG1 + 1;
  const totalCwG1 = Math.floor(total / numBlocks);
  const ecCount = totalCwG1 - dataCwG1;

  const raw = new Uint8Array(buffer.buffer);
  const dc = new Array(numBlocks);
  const ec = new Array(numBlocks);
  let offset = 0;
  let maxDataSize = 0;
  for (let b = 0; b < numBlocks; b++) {
    const size = b < blocksInGroup1 ? dataCwG1 : dataCwG2;
    dc[b] = raw.slice(offset, offset + size);
    ec[b] = rsEncode(dc[b], ecCount);
    offset += size;
    maxDataSize = Math.max(maxDataSize, size);
  }

  const out = new Uint8Array(total);
  let idx = 0;
  for (let i = 0; i < maxDataSize; i++) {
    for (let b = 0; b < numBlocks; b++) if (i < dc[b].length) out[idx++] = dc[b][i];
  }
  for (let i = 0; i < ecCount; i++) {
    for (let b = 0; b < numBlocks; b++) out[idx++] = ec[b][i];
  }
  return out;
}

// ---- Matrix (module grid) --------------------------------------------------
function makeMatrix(size) {
  return { size, data: new Uint8Array(size * size), reserved: new Uint8Array(size * size) };
}
const mIdx = (m, row, col) => row * m.size + col;
const mGet = (m, row, col) => m.data[mIdx(m, row, col)];
const mSet = (m, row, col, value, isReserved) => {
  const i = mIdx(m, row, col);
  m.data[i] = value ? 1 : 0;
  if (isReserved) m.reserved[i] = 1;
};
const mXor = (m, row, col, value) => { m.data[mIdx(m, row, col)] ^= value ? 1 : 0; };
const mIsReserved = (m, row, col) => m.reserved[mIdx(m, row, col)] === 1;

function setupFinderPattern(matrix, version) {
  const size = matrix.size;
  const positions = [[0, 0], [size - 7, 0], [0, size - 7]];
  for (const [row, col] of positions) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || size <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || size <= col + c) continue;
        const dark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        mSet(matrix, row + r, col + c, dark, true);
      }
    }
  }
}
function setupTimingPattern(matrix) {
  const size = matrix.size;
  for (let r = 8; r < size - 8; r++) {
    const value = r % 2 === 0;
    mSet(matrix, r, 6, value, true);
    mSet(matrix, 6, r, value, true);
  }
}
function getRowColCoords(version) {
  if (version === 1) return [];
  const posCount = Math.floor(version / 7) + 2;
  const size = getSymbolSize(version);
  const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
  const positions = [size - 7];
  for (let i = 1; i < posCount - 1; i++) positions[i] = positions[i - 1] - intervals;
  positions.push(6);
  return positions.reverse();
}
function getAlignmentPositions(version) {
  const coords = [];
  const pos = getRowColCoords(version);
  const n = pos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      coords.push([pos[i], pos[j]]);
    }
  }
  return coords;
}
function setupAlignmentPattern(matrix, version) {
  for (const [row, col] of getAlignmentPositions(version)) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const dark = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
        mSet(matrix, row + r, col + c, dark, true);
      }
    }
  }
}

const getBCHDigit = (data) => { let d = 0, v = data; while (v !== 0) { d++; v >>>= 1; } return d; };

const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
const G15_BCH = getBCHDigit(G15);
const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
const G18_BCH = getBCHDigit(G18);

function formatEncodedBits(ecBit, mask) {
  const data = (ecBit << 3) | mask;
  let d = data << 10;
  while (getBCHDigit(d) - G15_BCH >= 0) d ^= (G15 << (getBCHDigit(d) - G15_BCH));
  return ((data << 10) | d) ^ G15_MASK;
}
function versionEncodedBits(version) {
  let d = version << 12;
  while (getBCHDigit(d) - G18_BCH >= 0) d ^= (G18 << (getBCHDigit(d) - G18_BCH));
  return (version << 12) | d;
}

function setupVersionInfo(matrix, version) {
  const size = matrix.size;
  const bits = versionEncodedBits(version);
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 3);
    const col = (i % 3) + size - 8 - 3;
    const mod = ((bits >> i) & 1) === 1;
    mSet(matrix, row, col, mod, true);
    mSet(matrix, col, row, mod, true);
  }
}
function setupFormatInfo(matrix, ecBit, maskPattern) {
  const size = matrix.size;
  const bits = formatEncodedBits(ecBit, maskPattern);
  for (let i = 0; i < 15; i++) {
    const mod = ((bits >> i) & 1) === 1;
    if (i < 6) mSet(matrix, i, 8, mod, true);
    else if (i < 8) mSet(matrix, i + 1, 8, mod, true);
    else mSet(matrix, size - 15 + i, 8, mod, true);

    if (i < 8) mSet(matrix, 8, size - i - 1, mod, true);
    else if (i < 9) mSet(matrix, 8, 15 - i - 1 + 1, mod, true);
    else mSet(matrix, 8, 15 - i - 1, mod, true);
  }
  mSet(matrix, size - 8, 8, true, true);
}
function setupData(matrix, data) {
  const size = matrix.size;
  let inc = -1;
  let row = size - 1;
  let bitIndex = 7;
  let byteIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        if (!mIsReserved(matrix, row, col - c)) {
          let dark = false;
          if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
          mSet(matrix, row, col - c, dark, false);
          bitIndex--;
          if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
        }
      }
      row += inc;
      if (row < 0 || size <= row) { row -= inc; inc = -inc; break; }
    }
  }
}

// ---- Masking ---------------------------------------------------------------
const PENALTY = { N1: 3, N2: 3, N3: 40, N4: 10 };
function getMaskAt(pattern, i, j) {
  switch (pattern) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    default: throw new Error(`bad mask pattern: ${pattern}`);
  }
}
function applyMask(pattern, matrix) {
  const size = matrix.size;
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size; row++) {
      if (mIsReserved(matrix, row, col)) continue;
      mXor(matrix, row, col, getMaskAt(pattern, row, col));
    }
  }
}
function penaltyN1(m) {
  const size = m.size;
  let points = 0;
  for (let row = 0; row < size; row++) {
    let sameCountCol = 0, sameCountRow = 0, lastCol = null, lastRow = null;
    for (let col = 0; col < size; col++) {
      let mod = mGet(m, row, col);
      if (mod === lastCol) sameCountCol++;
      else { if (sameCountCol >= 5) points += PENALTY.N1 + (sameCountCol - 5); lastCol = mod; sameCountCol = 1; }
      mod = mGet(m, col, row);
      if (mod === lastRow) sameCountRow++;
      else { if (sameCountRow >= 5) points += PENALTY.N1 + (sameCountRow - 5); lastRow = mod; sameCountRow = 1; }
    }
    if (sameCountCol >= 5) points += PENALTY.N1 + (sameCountCol - 5);
    if (sameCountRow >= 5) points += PENALTY.N1 + (sameCountRow - 5);
  }
  return points;
}
function penaltyN2(m) {
  const size = m.size;
  let points = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const last = mGet(m, row, col) + mGet(m, row, col + 1) + mGet(m, row + 1, col) + mGet(m, row + 1, col + 1);
      if (last === 4 || last === 0) points++;
    }
  }
  return points * PENALTY.N2;
}
function penaltyN3(m) {
  const size = m.size;
  let points = 0;
  for (let row = 0; row < size; row++) {
    let bitsCol = 0, bitsRow = 0;
    for (let col = 0; col < size; col++) {
      bitsCol = ((bitsCol << 1) & 0x7ff) | mGet(m, row, col);
      if (col >= 10 && (bitsCol === 0x5d0 || bitsCol === 0x05d)) points++;
      bitsRow = ((bitsRow << 1) & 0x7ff) | mGet(m, col, row);
      if (col >= 10 && (bitsRow === 0x5d0 || bitsRow === 0x05d)) points++;
    }
  }
  return points * PENALTY.N3;
}
function penaltyN4(m) {
  let darkCount = 0;
  for (let i = 0; i < m.data.length; i++) darkCount += m.data[i];
  const k = Math.abs(Math.ceil(((darkCount * 100) / m.data.length) / 5) - 10);
  return k * PENALTY.N4;
}
function getBestMask(matrix, ecBit) {
  let bestPattern = 0;
  let lowestPenalty = Infinity;
  for (let p = 0; p < 8; p++) {
    setupFormatInfo(matrix, ecBit, p);
    applyMask(p, matrix);
    const penalty = penaltyN1(matrix) + penaltyN2(matrix) + penaltyN3(matrix) + penaltyN4(matrix);
    applyMask(p, matrix); // undo (xor is its own inverse)
    if (penalty < lowestPenalty) { lowestPenalty = penalty; bestPattern = p; }
  }
  return bestPattern;
}

/**
 * Encode `text` (UTF-8 byte mode) into a QR module matrix.
 * Returns { size, get(row, col) } — get() returns 1 for a dark module.
 * Throws if the text is too long even at version 40.
 */
export function encodeQr(text, ecLevelName = 'M') {
  const level = ecLevelName in EC_LEVEL_INDEX ? ecLevelName : 'M';
  const ecIndex = EC_LEVEL_INDEX[level];       // table row offset (L=0,M=1,Q=2,H=3)
  const ecFormatBit = EC_LEVEL_FORMAT_BIT[level]; // format-info field value (L=1,M=0,Q=3,H=2)

  const bytes = new TextEncoder().encode(String(text));
  const version = pickVersion(bytes.length, ecIndex);
  if (!version) throw new Error('Data too long for a QR code');

  const dataCodewords = createDataCodewords(bytes, version, ecIndex);
  const size = getSymbolSize(version);
  const matrix = makeMatrix(size);

  setupFinderPattern(matrix, version);
  setupTimingPattern(matrix);
  setupAlignmentPattern(matrix, version);
  setupFormatInfo(matrix, ecFormatBit, 0); // reserve format-info cells before data placement
  if (version >= 7) setupVersionInfo(matrix, version);
  setupData(matrix, dataCodewords);

  const maskPattern = getBestMask(matrix, ecFormatBit);
  applyMask(maskPattern, matrix);
  setupFormatInfo(matrix, ecFormatBit, maskPattern);

  return { size, get: (row, col) => mGet(matrix, row, col) };
}
