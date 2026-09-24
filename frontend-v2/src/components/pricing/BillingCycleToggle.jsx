import { useRef } from 'react';
import './billingCycleToggle.css';

// Shared accessible tablist pill toggle for "which billing cycle" — used by
// StudioPlanPicker and the new pricing sections. Native tablist keyboard
// convention: arrow keys move + select (roving tabindex), Home/End jump to
// the ends. `options[].save` is the server-sent pct_off for that cycle; 0/
// undefined just renders no chip.
export default function BillingCycleToggle({ options, value, onChange, ariaLabel = 'Billing cycle' }) {
  const refs = useRef([]);

  const move = (e, idx) => {
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    onChange(options[next].key);
    refs.current[next]?.focus();
  };

  return (
    <div className="bct" role="tablist" aria-label={ariaLabel}>
      {options.map((o, i) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={`bct-opt ${on ? 'is-on' : ''}`}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => move(e, i)}
          >
            <span>{o.label}</span>
            {o.save > 0 && <span className="bct-chip">SAVE {o.save}%</span>}
          </button>
        );
      })}
    </div>
  );
}
