/**
 * LegalPage — generic renderer for policy pages (Terms / Privacy / Refund / Contact).
 * Content comes from src/config/legalContent.js. Route usage:
 *   <Route path="/terms"   element={<LegalPage docKey="terms" />} />
 *   <Route path="/privacy" element={<LegalPage docKey="privacy" />} />
 *   <Route path="/refund"  element={<LegalPage docKey="refund" />} />
 *   <Route path="/contact" element={<LegalPage docKey="contact" />} />
 */
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { LEGAL_DOCS, BUSINESS } from '../config/legalContent';

const LegalPage = ({ docKey }) => {
  const doc = LEGAL_DOCS[docKey];

  useEffect(() => {
    if (doc) document.title = `${doc.title} · ${BUSINESS.name}`;
  }, [doc]);

  if (!doc) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)', color: 'var(--lux-text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Document not found.</p>
      </div>
    );
  }

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)', color: 'var(--lux-text)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 20px 80px' }}>
        <Link
          to="/"
          className="hover:text-[var(--lux-gold)] transition-colors"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
            color: 'var(--lux-text-muted)', fontSize: 14, textDecoration: 'none' }}
        >
          <ArrowLeft size={16} /> Back to home
        </Link>

        {/* Draft banner — remove once a lawyer has finalised the copy. */}
        <div style={{ marginTop: 20, marginBottom: 28, padding: '10px 14px',
          borderRadius: 8, fontSize: 13, lineHeight: 1.5,
          background: 'rgba(201,168,76,0.10)', border: '1px solid rgba(201,168,76,0.35)',
          color: '#E8D5A3' }}>
          Draft policy — review with a lawyer before public launch.
        </div>

        <h1 className="font-display" style={{ fontSize: 34, margin: '0 0 6px', color: 'var(--lux-text)' }}>
          {doc.title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--lux-text-muted)', margin: '0 0 24px' }}>
          Effective: {BUSINESS.effectiveDate}
        </p>

        {doc.intro && (
          <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--lux-text)', margin: '0 0 28px' }}>
            {doc.intro}
          </p>
        )}

        {doc.sections.map((s, i) => (
          <section key={i} style={{ marginBottom: 24 }}>
            <h2 className="font-heading" style={{ fontSize: 20, margin: '0 0 8px', color: '#E8D5A3' }}>
              {s.heading}
            </h2>
            {s.body.map((para, j) => (
              <p key={j} style={{ fontSize: 15, lineHeight: 1.7,
                color: 'var(--lux-text-muted)', margin: '0 0 10px' }}>
                {para}
              </p>
            ))}
          </section>
        ))}

        <footer style={{ marginTop: 48, paddingTop: 20, fontSize: 13,
          color: 'var(--lux-text-muted)', borderTop: '1px solid var(--lux-border)' }}>
          © {new Date().getFullYear()} {BUSINESS.name} · Made in India ·{' '}
          <Link to="/terms" style={{ color: 'inherit' }}>Terms</Link> ·{' '}
          <Link to="/privacy" style={{ color: 'inherit' }}>Privacy</Link> ·{' '}
          <Link to="/refund" style={{ color: 'inherit' }}>Refund</Link> ·{' '}
          <Link to="/contact" style={{ color: 'inherit' }}>Contact</Link>
        </footer>
      </div>
    </div>
  );
};

export default LegalPage;
