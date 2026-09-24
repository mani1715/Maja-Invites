import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCartItem, updateCartItem, clearCart } from '@/lib/cart';
import { catalog as fetchCatalog, quote as fetchQuote } from '@/api/store';
import { useAuth } from '@/context/AuthContext';
import './buyer-shared.css';
import DiscountCode from '@/components/pricing/DiscountCode';
import './Cart.css';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Ported from "MAJA Cart.dc.html". Cart holds exactly one design (legacy
// `maja_cart_v1` contract via src/lib/cart.js); the buyer tunes features and
// languages here, the server re-prices on every change, and "Proceed to
// checkout" hands off to /checkout which re-quotes fresh right before payment.
// Ordering is photographer-only (product pivot) — a signed-out visitor can
// still configure the design here but can't proceed without a studio session.
export default function Cart() {
  const navigate = useNavigate();
  const { admin } = useAuth();
  const signedIn = !!admin;
  const [item, setItem] = useState(() => getCartItem());

  const [cat, setCat] = useState({ included_features: [], paid_features: [], languages: [] });
  const [catState, setCatState] = useState('loading'); // loading | ready | error

  const [quoteData, setQuoteData] = useState(null);
  const [quoteState, setQuoteState] = useState('idle'); // idle | loading | ready | error
  // The server's discount quote, or null. Never computed here — pricing_features
  // owns every rule (expiry, usage cap, scope) and returns the arithmetic.
  const [discount, setDiscount] = useState(null);

  useEffect(() => {
    if (!item) { setCatState('ready'); return; }
    let alive = true;
    setCatState('loading');
    fetchCatalog({ design_id: item.design_id, theme_id: item.theme_id || undefined })
      .then(({ data }) => {
        if (!alive) return;
        setCat(data);
        setCatState('ready');
        // First load with no language chosen yet — default to the catalog's own default.
        if (!item.main_language && data.default_main_language) {
          setItem((prev) => prev && updateCartItem({ main_language: data.default_main_language }));
        }
      })
      .catch(() => { if (alive) setCatState('error'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.design_id, item?.theme_id]);

  const refreshQuote = useCallback(() => {
    if (!item || !item.main_language) return;
    setQuoteState('loading');
    fetchQuote({
      design_id: item.design_id, theme_id: item.theme_id,
      features: item.features, main_language: item.main_language, extra_languages: item.extra_languages,
      esign_agreed: true,
    }).then(({ data }) => { setQuoteData(data); setQuoteState('ready'); })
      .catch(() => { setQuoteData(null); setQuoteState('error'); });
  }, [item]);

  useEffect(() => { refreshQuote(); }, [refreshQuote]);

  const toggleFeature = (key) => {
    const next = item.features.includes(key) ? item.features.filter((k) => k !== key) : [...item.features, key];
    setItem(updateCartItem({ features: next }));
  };

  // Picking a main language drops it from the paid extras — otherwise the
  // buyer would be charged for the language already included with the design.
  const pickMain = (key) => {
    setItem(updateCartItem({ main_language: key, extra_languages: item.extra_languages.filter((k) => k !== key) }));
  };
  const toggleExtraLanguage = (key) => {
    if (key === item.main_language) return;
    const next = item.extra_languages.includes(key) ? item.extra_languages.filter((k) => k !== key) : [...item.extra_languages, key];
    setItem(updateCartItem({ extra_languages: next }));
  };

  const removeDesign = () => { clearCart(); setItem(null); };

  return (
    <div className="mjWashLite mj-buyer-page" data-testid="cart-page">
      <div className="mjRipple" aria-hidden="true" style={{ zIndex: -1 }} />

      <nav className="mjGlass mj-buyer-nav">
        <Link to="/" className="mj-buyer-brand">
          <span className="mj-buyer-brand-mark">M</span>
          <span className="mj-buyer-brand-name">MAJA Invites</span>
        </Link>
        <Link to="/pricing" data-mj-link className="mj-buyer-navlink">Continue browsing</Link>
      </nav>

      {!item ? (
        <div className="cart-empty-wrap">
          <div className="mj-buyer-card cart-empty-card">
            <p className="cart-empty-copy">Your cart is empty.</p>
            <Link to="/pricing" className="mj-buyer-btn-primary cart-empty-cta">Browse designs</Link>
          </div>
        </div>
      ) : (
        <div className="cart-body">
          <div>
            <h1 className="mj-buyer-h1">Your <span style={{ color: 'var(--mj-primary)' }}>cart</span></h1>

            <div className="mj-buyer-card" data-testid={`cart-item-${item.design_id}`}>
              <div className="cart-item-head">
                <div>
                  <p className="mj-buyer-eyebrow" style={{ marginBottom: 8 }}>This design</p>
                  <h3 className="cart-item-name">{item.name || item.design_id}</h3>
                </div>
                <button type="button" onClick={removeDesign} className="mj-buyer-btn-secondary cart-remove-btn" data-testid="cart-remove">Remove</button>
              </div>

              {catState === 'loading' && <p className="mj-buyer-loading">Loading options…</p>}
              {catState === 'error' && <p className="mj-buyer-error">Couldn't load features for this design. <button type="button" className="cart-retry" onClick={() => setItem({ ...item })}>Retry</button></p>}

              {catState === 'ready' && (
                <>
                  {cat.included_features.length > 0 && (
                    <div className="cart-included">
                      <p className="mj-buyer-field-label" style={{ marginBottom: 6 }}>Included with this design</p>
                      <div className="cart-included-grid">
                        {cat.included_features.map((f) => (
                          <span key={f.key} className="cart-included-item" data-testid={`included-${f.key}`}>✓ {f.label}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="mj-buyer-field-label" style={{ textTransform: 'uppercase', letterSpacing: '.1em', fontSize: 12.5, color: 'var(--mj-muted)', marginBottom: 10 }}>Add the features you want</p>
                  <div className="cart-feature-list">
                    {cat.paid_features.length === 0 && <p className="mj-buyer-loading">No optional features for this design.</p>}
                    {cat.paid_features.map((f) => (
                      <label key={f.key} data-mj-opt className="cart-feature-opt" data-testid={`feature-${f.key}`}>
                        <input type="checkbox" checked={item.features.includes(f.key)} onChange={() => toggleFeature(f.key)} className="cart-feature-check" />
                        {f.label} <span className="cart-feature-price">&mdash; {inr(f.price)}</span>
                      </label>
                    ))}
                  </div>

                  <div className="cart-lang-grid">
                    <div style={{ minWidth: 0 }}>
                      <p className="mj-buyer-field-label">Main language</p>
                      <select data-mj-field className="mj-buyer-select" value={item.main_language} onChange={(e) => pickMain(e.target.value)} data-testid="cart-main-language">
                        {cat.languages.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                      </select>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p className="mj-buyer-field-label">Other languages (optional)</p>
                      <div className="cart-extra-langs">
                        {cat.languages.filter((l) => l.key !== item.main_language).length === 0 && (
                          <span className="mj-buyer-loading" style={{ padding: 0 }}>None available</span>
                        )}
                        {cat.languages.filter((l) => l.key !== item.main_language).map((l) => {
                          const on = item.extra_languages.includes(l.key);
                          return (
                            <button key={l.key} type="button" onClick={() => toggleExtraLanguage(l.key)}
                              className={`cart-lang-pill${on ? ' is-on' : ''}`} data-testid={`extra-lang-${l.key}`}>
                              {l.label} <span className="cart-lang-pill-price">+{inr(l.price)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div>
            <div className="mjGlass cart-summary" data-testid="cart-summary">
              <h3 className="cart-summary-title">Order summary</h3>

              {quoteState === 'loading' && <p className="mj-buyer-loading">Calculating…</p>}
              {quoteState === 'error' && <p className="mj-buyer-error">Couldn't calculate your total. <button type="button" className="cart-retry" onClick={refreshQuote}>Try again</button></p>}

              {quoteState === 'ready' && quoteData && (
                <>
                  <div className="mj-buyer-row" style={{ borderTop: 'none' }}>
                    <span>{item.name || 'Design'}{quoteData.main_language_label ? ` · ${quoteData.main_language_label}` : ''}</span>
                    <span>{inr(quoteData.design_price_inr)}</span>
                  </div>
                  {(quoteData.features || []).map((f) => (
                    <div key={f.key} className="mj-buyer-row"><span>{f.label}</span><span>+{inr(f.price)}</span></div>
                  ))}
                  {(quoteData.extra_languages || []).map((l) => (
                    <div key={l.key} className="mj-buyer-row"><span>{l.label} version</span><span>+{inr(l.price)}</span></div>
                  ))}
                  <div className="mj-buyer-row cart-total-row">
                    <span>Total</span><span data-testid="cart-total">{inr(quoteData.total_inr)}</span>
                  </div>

                  {/* A quote, not a charge. /checkout re-quotes immediately
                      before payment, so the code is carried there and
                      re-validated rather than trusted from this screen. */}
                  <DiscountCode
                    amountInr={quoteData.total_inr}
                    appliesTo="design"
                    targetId={item?.design_id}
                    onApplied={setDiscount}
                  />
                  {discount && (
                    <div className="mj-buyer-row cart-total-row">
                      <span>After discount</span>
                      <span data-testid="cart-total-discounted">{inr(discount.final_inr)}</span>
                    </div>
                  )}
                </>
              )}

              <button type="button" className="mj-buyer-btn-primary cart-checkout-cta"
                disabled={quoteState !== 'ready' || !signedIn} onClick={() => {
                  try {
                    if (discount?.code) sessionStorage.setItem('maja_discount_code', discount.code);
                    else sessionStorage.removeItem('maja_discount_code');
                  } catch (_e) { /* private mode */ }
                  navigate('/checkout');
                }} data-testid="cart-checkout">
                Proceed to checkout
              </button>
              <button type="button" className="mj-buyer-btn-secondary" style={{ marginBottom: 16 }} onClick={removeDesign} data-testid="cart-clear">Clear</button>
              {!signedIn && (
                <p className="mj-buyer-hint" data-testid="cart-gate" style={{ marginBottom: 12 }}>
                  Ordering is for partner photographers — <Link to="/auth" data-mj-link>sign in as a studio</Link>, or connect with your photographer to get this design.
                </p>
              )}
              <p className="mj-buyer-hint">
                By continuing you agree to our <a href="/terms" data-mj-link style={{ color: 'var(--mj-muted)' }}>Terms</a> and <a href="/refund" data-mj-link style={{ color: 'var(--mj-muted)' }}>Refund Policy</a>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
