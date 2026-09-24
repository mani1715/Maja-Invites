import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { installErrorReporting } from './lib/reportError';
import './styles/global.css';

// Global handlers first, so an error thrown during the initial render is
// already being captured by the time React calls componentDidCatch.
installErrorReporting();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
