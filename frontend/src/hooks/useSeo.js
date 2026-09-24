// useSeo (Phase 9, SEO) — sets document title, meta description, Open Graph,
// Twitter Cards and JSON-LD structured data imperatively. No provider needed, so
// it's safe to drop into any page. (A crawler that executes JS — Google, and most
// social scrapers for OG — reads these; full SSR/prerender is a later infra step.)
import { useEffect } from 'react';

function upsertMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export default function useSeo({ title, description, image, url, type = 'website', jsonLd } = {}) {
  useEffect(() => {
    if (title) document.title = title;
    upsertMeta('name', 'description', description);
    // Open Graph
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:image', image);
    upsertMeta('property', 'og:url', url || (typeof window !== 'undefined' ? window.location.href : ''));
    // Twitter
    upsertMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', image);
    // JSON-LD structured data
    let script = document.getElementById('seo-jsonld');
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'seo-jsonld';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) {
      script.remove();
    }
  }, [title, description, image, url, type, jsonLd]);
}
