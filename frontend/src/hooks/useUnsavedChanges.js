import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * PHASE 29E: Unsaved changes warning hook
 * 
 * Warns user before navigating away from page with unsaved changes
 * Blocks browser navigation (back/forward/close) and React Router navigation
 * 
 * @param {boolean} hasUnsavedChanges - Whether there are unsaved changes
 * @param {string} message - Warning message to display
 */
export function useUnsavedChanges(
  hasUnsavedChanges,
  message = 'You have unsaved changes. Are you sure you want to leave?'
) {
  const navigate = useNavigate();
  const location = useLocation();

  // Block browser navigation (reload, close, back/forward)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = message; // Required for Chrome
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges, message]);

  // Custom navigation with confirmation
  const navigateWithConfirmation = useCallback(
    (to, options = {}) => {
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(message);
        if (!confirmed) {
          return false;
        }
      }
      navigate(to, options);
      return true;
    },
    [hasUnsavedChanges, message, navigate]
  );

  return {
    navigateWithConfirmation,
    hasUnsavedChanges,
  };
}

export default useUnsavedChanges;
