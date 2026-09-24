#!/usr/bin/env node
/* Audits all theme configs for /designs/all/... paths missing in image-manifest.json. */
const fs = require('fs');
const path = require('path');
const m = require(path.resolve(__dirname, '../src/themes/image-manifest.json'));
const manifestKeys = new Set(Object.keys(m));

const dirs = [
  path.resolve(__dirname, '../src/themes/configs'),
  path.resolve(__dirname, '../src/themes/kerala_backwaters'),
];

const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.(js|jsx)$/.test(e.name)) acc.push(full);
  }
  return acc;
};

// Match the path inside string literals: starts with /designs/all/ and runs
// until the next unescaped quote, backtick, or template-expression boundary.
// Path can contain spaces, parentheses, commas — anything except the
// surrounding string delimiter.
const findPaths = (text) => {
  const out = [];
  const rx = /(['"`])(\/designs\/all\/[^\1]*?)\1/g;
  let m;
  while ((m = rx.exec(text))) {
    const p = m[2];
    if (!p.includes('${')) out.push(p); // skip template literals with vars
  }
  // Also handle template-literal cases like `${b}/Engagement/foo.jpg`
  // by reconstructing common prefixes is non-trivial — those go through
  // BASE('Theme') which is /designs/all/<Theme>. We grep separately.
  const tplRx = /\$\{b\}\/([A-Za-z]+)\/([^`'"\s]+(?: [^`'"]*?)?)(?=`|'|")/g;
  while ((m = tplRx.exec(text))) {
    // We do not know which theme `b` resolves to here — left to caller.
  }
  return out;
};

const all = new Set();
const byFile = {};
for (const d of dirs) {
  for (const f of walk(d)) {
    const txt = fs.readFileSync(f, 'utf8');
    const paths = findPaths(txt);
    if (paths.length) {
      byFile[f] = [...new Set(paths)];
      paths.forEach((p) => all.add(p));
    }
  }
}

const missing = [...all].filter((p) => !manifestKeys.has(p));
console.log(`total unique paths: ${all.size}`);
console.log(`missing in manifest: ${missing.length}`);
for (const p of missing) {
  const files = Object.entries(byFile).filter(([_, ps]) => ps.includes(p)).map(([f]) => path.relative(path.resolve(__dirname, '..'), f));
  console.log(`MISSING ${p}  (used in: ${files.join(', ')})`);
}
