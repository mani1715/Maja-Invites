import { Component } from 'react';
import { Link, useLocation } from 'react-router-dom';
import '@/styles/experience.css';

export function pageFamily(path) {
  if (path === '/') return 'home';
  // Customer-authored surfaces retain their own typography and theme tokens.
  if (/^\/(invite|i|e|save-the-date|photographer|gallery|preview|portfolio-samples)(\/|$)/.test(path)) return 'customer';
  if (/^\/admin(\/|$)/.test(path)) return 'admin';
  if (/^\/(studio|events|live)(\/|$)/.test(path)) return 'studio';
  if (/^\/auth(\/|$)/.test(path)) return 'auth';
  if (/^\/(community|p|photographers|vendors)(\/|$)/.test(path)) return 'community';
  return 'public';
}

class PageBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Page rendering failed', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="px-recovery" tabIndex={-1}>
      <p className="px-kicker">A little interruption</p><h1>This page couldn’t open.</h1>
      <p>Try loading it again. If the problem continues, contact support with the page you were opening.</p>
      <div><button onClick={() => window.location.reload()}>Reload page</button><Link to="/support">Contact support</Link><Link to="/">Back to Pixora</Link></div>
    </main>;
  }
}

export function SkipContent() {
  return <a className="mj-skip-link" href="#main-content" onClick={event => {
    const content = document.querySelector('main, [role="main"], #main-content') || document.querySelector('.px-experience');
    if (!content) return;
    event.preventDefault();
    if (!content.hasAttribute('tabindex')) content.setAttribute('tabindex', '-1');
    content.focus({ preventScroll: true });
    content.scrollIntoView({ block: 'start', behavior: 'instant' });
  }}>Skip to content</a>;
}

export default function PageExperience({ children }) {
  const { pathname } = useLocation();
  return <div className={`px-experience px-experience--${pageFamily(pathname)}`}>
    <PageBoundary key={pathname}>{children}</PageBoundary>
  </div>;
}
