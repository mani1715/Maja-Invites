import { useEffect, useState, useRef, useId } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { NAV_PANELS } from './navigation';
import './nav.css';

export default function MobileNav({ panel = 'studio', active = '', breakpoint = 900 }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(() => window.innerWidth < breakpoint);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const config = NAV_PANELS[panel] || NAV_PANELS.studio;
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const resize = () => { setShown(mq.matches); if (!mq.matches) setOpen(false); };
    resize(); mq.addEventListener('change', resize);
    return () => mq.removeEventListener('change', resize);
  }, [breakpoint]);
  useEffect(() => { setOpen(false); setQuery(''); }, [location.pathname, location.search]);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (!open || !shown) { if (el.open) el.close(); return; }
    const overflow = document.body.style.overflow;
    el.showModal(); document.body.style.overflow = 'hidden';
    return () => { if (el.open) el.close(); document.body.style.overflow = overflow; };
  }, [open, shown]);
  if (!shown) return null;
  const groups = config.groups.map(group => ({...group, items: group.items.filter(([label]) => label.toLowerCase().includes(query.toLowerCase()))})).filter(group => group.items.length);
  return <div className="px-mobile-nav">
    <header className="px-mobile-bar">
      <button ref={trigger} aria-label="Open menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}><span aria-hidden="true">☰</span></button>
      <Link to={config.home}><b className="px-nav-mark">P</b>{config.brand}</Link><span>{active}</span>
    </header>
    <dialog id={id} ref={dialog} className="px-nav-dialog" aria-label={`${config.brand} navigation`} onKeyDownCapture={e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }} onCancel={() => setOpen(false)} onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="px-nav-drawer">
        <header><Link to={config.home}>{config.brand}</Link><button aria-label="Close menu" onClick={() => setOpen(false)}>×</button></header>
        <label className="px-nav-search">Find a tool<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search navigation" /></label>
        <nav aria-label={config.brand}>{groups.map(group => <section key={group.title}><h2>{group.title}</h2>{group.items.map(([label, href]) => <NavLink end key={href} to={href} onClick={() => setOpen(false)}>{label}</NavLink>)}</section>)}{!groups.length && <p>No matching tools. Try another name.</p>}</nav>
        <button className="px-nav-logout" onClick={async () => { setOpen(false); await logout(); navigate('/auth', {replace:true}); }}>Log out</button>
      </div>
    </dialog>
  </div>;
}
