/**
 * cart.js — single-design cart, localStorage `maja_cart_v1` (legacy contract,
 * see frontend/src/context/CartContext.js). Only ONE design is ever in the
 * cart, stored as a 1-item array for wire compatibility with the legacy shape.
 *
 * The item also carries the buyer's in-progress selections (features / main
 * language / extra languages) so the Cart and Checkout pages share one source
 * of truth instead of a second sessionStorage channel between them — money is
 * still always recomputed server-side from these selections, never read back
 * out of this object.
 *
 * Design/pricing pages (a different lane) hand off the chosen design by
 * writing it to sessionStorage under `maja_selected_design` as
 * { design_id, theme_id?, event_type?, name?, image? } then navigating here;
 * this module consumes and clears that key once, on first read.
 */
const STORAGE_KEY = 'maja_cart_v1';
const HANDOFF_KEY = 'maja_selected_design';

function readRaw() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (_e) { return []; }
}

function writeRaw(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (_e) { /* quota / private mode */ }
}

// Every reader (Cart/Checkout) assumes these three arrays/strings exist —
// normalize once here rather than defending against `undefined` everywhere.
function normalize(item) {
  if (!item) return item;
  return {
    ...item,
    features: item.features || [],
    main_language: item.main_language || '',
    extra_languages: item.extra_languages || [],
  };
}

function consumeHandoff() {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    const d = JSON.parse(raw);
    if (!d?.design_id) return null;
    return {
      design_id: d.design_id, theme_id: d.theme_id || '', event_type: d.event_type || '',
      name: d.name || '', image: d.image || '',
      features: [], main_language: '', extra_languages: [],
    };
  } catch (_e) { return null; }
}

/** Current cart item, or null. Hydrates from the sessionStorage handoff once
 * if the cart is otherwise empty. */
export function getCartItem() {
  const items = readRaw();
  if (items[0]) return normalize(items[0]);
  const handed = consumeHandoff();
  if (handed) { writeRaw([handed]); return handed; }
  return null;
}

export function updateCartItem(patch) {
  const item = getCartItem();
  if (!item) return null;
  const next = normalize({ ...item, ...patch });
  writeRaw([next]);
  return next;
}

export function clearCart() {
  writeRaw([]);
}
