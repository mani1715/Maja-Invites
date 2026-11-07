# Local review

Open `index.html` directly, or serve this directory and open the local URL.
The review board links four interactive compositions, full-page desktop/mobile captures, sparse variants and the specification.

- `REVIEW.md` / `review.html`: verified critique, comparison, section specs, tokens, field mapping, existing gates, publishing/migration plan and decisions.
- `concept.html?concept=cinematic|editorial|gallery|studio`: isolated prototype. Add `&sparse=1` for reduced content.
- `previews/comparison.jpg`: compact side-by-side visual board.
- `previews/*-desktop.png` / `*-mobile.png`: full page captures.
- `previews/qa.json`: 12 successful browser checks at 1440, 768 and 390px; images, overflow, JS exceptions, viewer, local form.
- `credits.html` / `assets/sources.json`: reference image provenance.
- `capture.py`: browser screenshot/check script using the repository's installed Python Playwright.

No build step, production imports, backend calls or browser storage. Forms do not send anything. The stock photographs are reference material, not the fictional studio's work. No reviews, prices, team members or awards were fabricated to fill empty modules.

QA is limited to Chromium on this machine. Device Safari/Android, real leads, actual plan APIs, screen-reader behavior and production performance remain implementation checks. Screenshots force image loading to capture all lower-page content; runtime pages lazy-load below the fold. The viewer demonstrates a five-photo set rather than project-scoped requests. No external fonts are required.

Production files and the original context document were left unchanged; this directory is the entire deliverable.
