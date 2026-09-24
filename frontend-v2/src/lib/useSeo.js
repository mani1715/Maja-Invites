import { useEffect } from 'react';

// Per-route document head. frontend-v2 shipped a single static <title> for all
// 43 routes, no meta description, no canonical, and no Open Graph — so every
// page shared on WhatsApp looked identical and search engines had one snippet
// for the whole site. The legacy app used react-helmet on 7 pages.
//
// No dependency added: there are only a handful of tags and React can own them
// directly. Tags this hook creates are marked data-mj-seo so it can clean up
// after itself on unmount and never fight a tag someone else set.
//
// NOTE: this is client-side, so it does not help a crawler that does not run
// JS. Caddy already routes real crawlers on /invite/* and /photographer/* to
// the backend's server-rendered head (_render_og_for_slug). This hook covers
// the marketing routes, which those rules do not match, plus every social
// scraper that does execute JS.

const SITE = 'MAJA Invites';
const DEFAULT_IMAGE = '/sample-wedding/couple.jpg';

function upsert(selector, create) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    el.setAttribute('data-mj-seo', '');
    document.head.appendChild(el);
  }
  return el;
}

function setMeta(attr, key, content) {
  if (!content) return;
  const el = upsert(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement('meta');
    m.setAttribute(attr, key);
    return m;
  });
  el.setAttribute('content', content);
}

function setLink(rel, href) {
  if (!href) return;
  const el = upsert(`link[rel="${rel}"]`, () => {
    const l = document.createElement('link');
    l.setAttribute('rel', rel);
    return l;
  });
  el.setAttribute('href', href);
}

/**
 * @param {object} o
 * @param {string} o.title      Page title, without the site suffix.
 * @param {string} o.description  ~155 chars.
 * @param {string} [o.image]    Absolute or root-relative OG image.
 * @param {string} [o.type]     og:type, default "website".
 * @param {boolean} [o.noindex] Set on thin or private pages.
 */
export default function useSeo({ title, description, image, type = 'website', noindex = false }) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE}` : SITE;
    document.title = fullTitle;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}${window.location.pathname}`;
    const img = image ? (image.startsWith('http') ? image : `${origin}${image}`) : `${origin}${DEFAULT_IMAGE}`;

    setMeta('name', 'description', description);
    setLink('canonical', url);

    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:site_name', SITE);
    setMeta('property', 'og:image', img);

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', img);

    // Only ever ADD a robots tag; never remove one the server set.
    if (noindex) setMeta('name', 'robots', 'noindex, follow');

    return () => {
      if (!noindex) return;
      const r = document.head.querySelector('meta[name="robots"][data-mj-seo]');
      if (r) r.remove();
    };
  }, [title, description, image, type, noindex]);
}
