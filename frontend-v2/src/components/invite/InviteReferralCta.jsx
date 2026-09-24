import { useEffect, useState } from 'react';
import { publicCodeBySlug } from '@/api/referrals';

// The guest-facing end of the referral system: a visitor who liked this
// invitation gets a code that credits the studio who made it.
//
// The code usually arrives inside /api/invite/{slug}/full, so this renders with
// no extra request. When it is absent the fallback calls
// /api/public/referral-code-by-slug/{slug}, which MINTS one — deliberately not
// done in the /full render, because that response is cached for 15s and a
// cached read must not write.
//
// If both fail, this renders nothing. An invitation is the couple's page; a
// broken marketing strip on it is worse than no strip.

export default function InviteReferralCta({ slug, code: initial }) {
  const [code, setCode] = useState(initial || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initial) { setCode(initial); return undefined; }
    let alive = true;
    publicCodeBySlug(slug)
      .then(({ data }) => { if (alive) setCode(data?.referral_code || ''); })
      .catch(() => {});
    return () => { alive = false; };
  }, [slug, initial]);

  if (!code) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (_e) { /* clipboard blocked — the code is on screen anyway */ }
  };

  return (
    <section className="gi-refcta" aria-label="Make your own invitation">
      <p className="gi-refcta-lead">Planning your own celebration?</p>
      <p className="gi-refcta-body">
        Use this code when you start, and MAJA knows this invitation is what
        brought you.
      </p>
      <div className="gi-refcta-row">
        <button type="button" className="gi-refcta-code" onClick={copy} title="Copy this code">
          {code}
        </button>
        <a className="gi-refcta-btn" href={`/?ref=${encodeURIComponent(code)}`}>
          Start yours
        </a>
      </div>
      <p className="gi-refcta-note" role="status">
        {copied ? 'Code copied.' : ' '}
      </p>
    </section>
  );
}
