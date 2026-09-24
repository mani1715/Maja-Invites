#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * build-image-manifest.js — Phase 1 of the perf overhaul.
 *
 * Walks /public/designs/all/**, and for every JPG/PNG produces:
 *   • AVIF + WebP + JPG variants at 480/720/960/1280/1600 widths
 *     (output → /public/designs/opt/<relative path>/<basename>-<w>.<ext>)
 *   • A 24-px LQIP base64 (data URI) — tiny blurred placeholder
 *   • Dominant colour (#hex) — paints the card instantly with a unique tint
 *     while the artwork downloads.
 *   • Source width/height (for aspect-ratio attributes / layout-shift prevention)
 *
 * All metadata is written to /src/themes/image-manifest.json, keyed by the
 * ORIGINAL public path (`/designs/all/<Theme>/<Event>/<file>.<ext>`). The
 * `<DesignImage>` component looks up that path at render time.
 *
 * The script is IDEMPOTENT — re-running it skips images whose outputs are
 * already up-to-date (compares source mtime). Pass `--force` to rebuild.
 *
 *   yarn build:images        # idempotent
 *   yarn build:images --force # full rebuild
 *
 * Output bytes are committed to /public/designs/opt so production builds
 * don't have to re-encode at deploy time.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'public', 'designs', 'all');
const OUT_DIR = path.join(ROOT, 'public', 'designs', 'opt');
const MANIFEST_PATH = path.join(ROOT, 'src', 'themes', 'image-manifest.json');

const WIDTHS = [480, 960, 1440];
const FORMATS = [
  // AVIF is intentionally OFF in default builds — its encoder is ~8x slower
  // than WebP and WebP already covers >96% of users (caniuse 2026-05). Set
  // env BUILD_AVIF=1 to re-enable for a long, parallel-friendly build.
  ...(process.env.BUILD_AVIF ? [{ ext: 'avif', quality: 50, effort: 0 }] : []),
  { ext: 'webp', quality: 74, effort: 4 },
  { ext: 'jpg',  quality: 78 },
];
const FORCE = process.argv.includes('--force');

const crypto = require('crypto');

const log = (...a) => console.log('[img]', ...a);

const walk = async (dir, acc = []) => {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, acc);
    else acc.push(full);
  }
  return acc;
};

const isSourceImage = (p) => /\.(jpe?g|png)$/i.test(p);

const ensureDir = async (d) => fsp.mkdir(d, { recursive: true });

const publicPath = (absPath) =>
  '/' + path.relative(path.join(ROOT, 'public'), absPath).split(path.sep).join('/');

// Hash very long filenames so the output path stays under the 255-byte
// POSIX limit (heif/avif refuses to write paths that overflow).
const safeBase = (name) => {
  if (name.length <= 80) return name;
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  const hash = crypto.createHash('sha1').update(stem).digest('hex').slice(0, 10);
  return `${stem.slice(0, 50).replace(/[^a-zA-Z0-9_-]/g, '_')}-${hash}${ext}`;
};

const variantPath = (srcAbs, width, ext) => {
  const rel = path.relative(SRC_DIR, srcAbs);
  const parsed = path.parse(rel);
  const safeName = safeBase(`${parsed.name}${parsed.ext}`);
  const safeStem = path.parse(safeName).name;
  return path.join(OUT_DIR, parsed.dir, `${safeStem}-${width}.${ext}`);
};

/* Tiny 24-px base64 LQIP — blurred webp; fades into the real image. */
const buildLqip = async (img) => {
  const buf = await img
    .clone()
    .resize({ width: 24 })
    .webp({ quality: 35 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString('base64')}`;
};

/* Dominant colour — sharp's average is good enough and very cheap. */
const buildDominant = async (img) => {
  const { dominant } = await img.clone().stats();
  const { r, g, b } = dominant;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
};

const variantsOutdated = async (srcAbs) => {
  if (FORCE) return true;
  const srcStat = await fsp.stat(srcAbs);
  for (const w of WIDTHS) {
    for (const f of FORMATS) {
      const vp = variantPath(srcAbs, w, f.ext);
      try {
        const st = await fsp.stat(vp);
        if (st.mtimeMs < srcStat.mtimeMs) return true;
      } catch {
        return true; // missing → outdated
      }
    }
  }
  return false;
};

const processOne = async (srcAbs) => {
  const pubPath = publicPath(srcAbs);
  const img = sharp(srcAbs, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  const srcWidth = meta.width || 0;
  const srcHeight = meta.height || 0;

  const outdated = await variantsOutdated(srcAbs);

  // Always recompute LQIP + dominant — they're tiny (a few ms).
  const [lqip, dominant] = await Promise.all([
    buildLqip(img),
    buildDominant(img),
  ]);

  const entry = {
    avif: {},
    webp: {},
    jpg: {},
    lqip,
    dominant,
    width: srcWidth,
    height: srcHeight,
  };

  for (const w of WIDTHS) {
    if (srcWidth && w > srcWidth) continue; // never upscale
    const resized = img.clone().resize({ width: w, withoutEnlargement: true });
    for (const f of FORMATS) {
      const outAbs = variantPath(srcAbs, w, f.ext);
      await ensureDir(path.dirname(outAbs));
      const should = outdated || !fs.existsSync(outAbs);
      if (should) {
        const pipeline = (() => {
          if (f.ext === 'avif') return resized.clone().avif({ quality: f.quality, effort: f.effort ?? 4 });
          if (f.ext === 'webp') return resized.clone().webp({ quality: f.quality, effort: f.effort ?? 4 });
          return resized.clone().jpeg({ quality: f.quality, mozjpeg: true });
        })();
        await pipeline.toFile(outAbs);
      }
      entry[f.ext][w] = publicPath(outAbs);
    }
  }

  return { key: pubPath, entry, outdated };
};

const main = async () => {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Source dir not found: ${SRC_DIR}`);
    process.exit(1);
  }
  await ensureDir(OUT_DIR);

  log('scanning', SRC_DIR);
  const all = (await walk(SRC_DIR)).filter(isSourceImage);
  log(`found ${all.length} source images${FORCE ? ' (force rebuild)' : ''}`);

  const manifest = {};
  let processed = 0;
  let regenerated = 0;
  const t0 = Date.now();

  // Process serially — sharp is heavy and parallel runs blow the heap on
  // 200-image batches. Each image takes ~150-400ms so the whole run is ~60s.
  for (const src of all) {
    try {
      const { key, entry, outdated } = await processOne(src);
      manifest[key] = entry;
      processed += 1;
      if (outdated) regenerated += 1;
      if (processed % 25 === 0) {
        log(`progress ${processed}/${all.length} (${Date.now() - t0}ms)`);
      }
    } catch (e) {
      console.error(`[img] FAILED ${src}:`, e.message);
    }
  }

  // Sort keys for stable diffs.
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  await ensureDir(path.dirname(MANIFEST_PATH));
  await fsp.writeFile(MANIFEST_PATH, JSON.stringify(sorted, null, 2));

  log(`✓ done — ${processed} images, ${regenerated} regenerated, ${Date.now() - t0}ms`);
  log(`✓ manifest → ${path.relative(ROOT, MANIFEST_PATH)}`);
  log(`✓ variants → ${path.relative(ROOT, OUT_DIR)}/<theme>/<event>/<file>-<w>.<ext>`);
};

main().catch((e) => { console.error(e); process.exit(1); });
