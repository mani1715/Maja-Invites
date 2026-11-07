# Netlify Deployment & Operations Guide — MAJA Invites / Pixora (`frontend-v2`)

This document specifies the exact configuration, environment variables, authentication contracts, and verification procedures for deploying the React Vite frontend (`frontend-v2`) to Netlify.

---

## 1. Project Overview & Architecture

- **Active Frontend**: `frontend-v2` (React 18.3.1, Vite 5.4.11, React Router 6.28.1).
- **Legacy Frontend**: `frontend/` (Deprecated CRA application). **Do NOT deploy this.**
- **Backend Service**: FastAPI running on Python 3.10+ (typically port 8001 in dev / behind reverse proxy or separate domain in prod).
- **Static Assets**:
  - Bundled design artwork in `public/designs/` (393 WebP images across Mughal, Floral, Temple, Modern, Beach, Palace, Royal collections).
  - Public branding, icons, and hero art in `public/assets/`, `public/home/`, `public/portfolio-reference/`.
- **Operating Modes**:
  - **Demo Mode (`VITE_APP_MODE=demo`)**: Frontend-only interactive mode with synthetic fixtures, browser-local persistence (safe against Safari private browsing and storage quotas), simulated payments, uploads, and role switchers (Studio, Admin, Couple, Visitor).
  - **Production Mode (`VITE_APP_MODE=production`)**: Full live integration with the FastAPI backend. Failing requests display clear error/retry states and never fallback to synthetic data.

---

## 2. Exact Netlify Import Settings

When importing the Git repository (`https://github.com/mani1715/Maja-Invites.git`) in Netlify:

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Base directory** | `frontend-v2` | Netlify will execute commands relative to `frontend-v2` |
| **Package directory** | `frontend-v2` | (Defaulted from Base directory) |
| **Build command** | `yarn build` | Runs `vite build` using the frozen lockfile |
| **Publish directory** | `dist` | Relative to `frontend-v2` (`frontend-v2/dist`) |
| **Node Version** | `20.18.0` | Node 20 LTS pinned in `netlify.toml` |
| **Yarn Version** | `1.22.22` | Pinned in `netlify.toml` (`YARN_VERSION = "1.22.22"`) |

These settings are pre-configured in the repository's root [`netlify.toml`](file:///c:/my%20projects/maja%20invites/maja_invites-main/netlify.toml).

---

## 3. Environment Variables Configuration

Set these variables in Netlify under: **Site configuration > Environment variables**.

> [!WARNING]
> Vite embeds all `VITE_*` variables into client-side JavaScript bundles at build time. Never place API private keys, database passwords, or JWT secrets in `VITE_*` variables. Any change to environment variables requires triggering a new Netlify build.

### A. Demo Deployment (Zero Backend Required)

To deploy an interactive preview that allows investors, clients, and testers to explore every screen and interaction:

```env
VITE_APP_MODE=demo
NODE_VERSION=20.18.0
YARN_VERSION=1.22.22
```

*(Note: If `VITE_BACKEND_URL` is omitted, the frontend automatically defaults to demo mode).*

### B. Production Deployment (Connected to FastAPI Backend)

```env
VITE_APP_MODE=production
VITE_BACKEND_URL=https://api.majainvites.com
VITE_DESIGN_CDN=https://assets.majainvites.com
VITE_WHATSAPP_SUPPORT=+919876543210
NODE_VERSION=20.18.0
YARN_VERSION=1.22.22
```

### Environment Variable Format Guidelines

- **`VITE_BACKEND_URL`**:
  - Must be the origin of the backend API (e.g., `https://api.majainvites.com`).
  - Do **not** append a trailing slash (e.g. `https://api.majainvites.com/`).
  - Do **not** append `/api` (the frontend client automatically appends `/api`).
  - Correct: `https://api.majainvites.com`
  - Incorrect: `https://api.majainvites.com/api` or `https://api.majainvites.com/api/`
- **`VITE_DESIGN_CDN`** *(Optional)*:
  - If using an external Cloudflare/CloudFront CDN for high-resolution design templates.
  - If omitted or empty, the frontend automatically serves designs directly from the bundled local origin `/designs/...`.

---

## 4. Netlify Routing, Redirects, and SPA Fallbacks

The deployment contains two layers of routing rules in `netlify.toml` and `public/_redirects`:

1. **API / Uploads 404 Guards (Rules 1 & 2)**:
   ```toml
   [[redirects]]
     from = "/api/*"
     to = "/404.html"
     status = 404
     force = false

   [[redirects]]
     from = "/uploads/*"
     to = "/404.html"
     status = 404
     force = false
   ```
   *Why this matters*: Without this guard, if an API endpoint is requested against the static frontend domain, Netlify's SPA fallback would return `index.html` with HTTP 200. Axios then fails with `SyntaxError: Unexpected token '<'` when attempting to parse JSON, and blob downloads write HTML content instead of media.
2. **SPA Catch-All Rewrite (Rule 3)**:
   ```toml
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```
   Direct links (e.g. `/pricing`, `/community`, `/studio/dashboard`, `/couple/aarav-ananya`) and page reloads are routed to `/index.html` while preserving URL parameters.

---

## 5. Production Backend Integration Requirements

When connecting this frontend to your live FastAPI backend, ensure the backend is configured with:

### A. CORS Configuration
In FastAPI `CORSMiddleware`:
```python
origins = [
    "https://your-site.netlify.app",
    "https://majainvites.com",
    "https://www.majainvites.com",
    "http://localhost:5173",
    "http://localhost:4173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### B. Cookie Configuration (Couple Identity & Refresh Tokens)
- Set cookies with `SameSite="None"` and `Secure=True` when the frontend and backend are hosted on separate domains (e.g., `majainvites.netlify.app` and `api.majainvites.com`).
- Recommended domain setup: Host backend on `api.majainvites.com` and frontend on `majainvites.com` or `app.majainvites.com` to avoid third-party cookie restrictions in Safari / iOS.
- **Studio/Admin Token**: Bearer token transmitted in `Authorization: Bearer <admin_token>`.
- **Couple Token**: `client_token` in `localStorage` or `user_session_token` cookie.

---

## 6. Verification and Smoke Checklist

After deployment on Netlify:

1. [ ] **Homepage & Metechq Footer**: Load root URL, verify hero, designs showcase, and footer branding "Powered by Metechq".
2. [ ] **Pricing Page**: Toggle between *Done-for-you invites* and *For studios & photographers*, verify pricing tier cards.
3. [ ] **Portfolio Samples**: Navigate to `/portfolio-samples`, verify portfolio preview tiles load, verify top logo links back to `/`.
4. [ ] **Community Page**: Verify community feed items and interaction buttons.
5. [ ] **Browse Designs**: Verify WebP artwork loads without 404s.
6. [ ] **Demo Mode Banner**: If deployed in demo mode, verify the top toolbar is present, toggle between **Studio**, **Admin**, and **Couple** roles.
7. [ ] **SPA Direct Reload**: Navigate directly to `/pricing` and refresh browser; ensure page loads without 404 or blank screen.
8. [ ] **API Protection**: Attempt fetching `/api/nonexistent`; ensure HTTP 404 is returned instead of HTML `index.html`.
