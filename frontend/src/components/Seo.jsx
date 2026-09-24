import React from 'react';
import { Helmet } from 'react-helmet-async';

/**
 * Per-route SEO head for public MARKETING pages (home, pricing, features, …).
 * Public invitations / portfolios are re-rendered server-side for crawlers
 * (Caddy @crawler → server.py _render_og_*), so they do NOT use this — this is
 * for the JS-rendered marketing routes that otherwise all shared one title.
 *
 * Emits a unique <title>, meta description, absolute canonical, and OG/Twitter
 * overrides (over the brand-level defaults baked into public/index.html).
 */
const SITE = 'https://majainvites.com';
const DEFAULT_IMG = `${SITE}/logo512.png`; // replace with /og-image.jpg (1200×630) when added

export default function Seo({ title, description, path = '/', image = DEFAULT_IMG, noindex = false }) {
  const url = `${SITE}${path}`;
  return (
    <Helmet>
      {title && <title>{title}</title>}
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,follow" />}
      {title && <meta property="og:title" content={title} />}
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      {title && <meta name="twitter:title" content={title} />}
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
