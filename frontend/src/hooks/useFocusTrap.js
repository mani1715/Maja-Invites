import { useEffect, useRef } from 'react';

/**
 * PHASE 29D: Focus Trap Hook
 * 
 * Traps keyboard focus within a modal or dialog when open.
 * Automatically restores focus to the triggering element when closed.
 * 
 * WCAG 2.4.3 - Focus Order (Level A)
 * WCAG 2.1.2 - No Keyboard Trap (Level A)
 * 
 * @param {boolean} isOpen - Whether the modal is open
 * @param {function} onClose - Function to call when ESC is pressed
 * @returns {object} - Ref to attach to the modal container
 */
const useFocusTrap = (isOpen, onClose) => {
  const containerRef = useRef(null);
  const previousActiveElement = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Store the element that opened the modal
    previousActiveElement.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Get all focusable elements within the container
    const getFocusableElements = () => {
      return container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
    };

    // Focus first element
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Handle Tab key navigation
    const handleTab = (e) => {
      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    // Handle ESC key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    container.addEventListener('keydown', handleTab);
    document.addEventListener('keydown', handleEscape);

    // Cleanup
    return () => {
      container.removeEventListener('keydown', handleTab);
      document.removeEventListener('keydown', handleEscape);

      // Restore focus to the element that opened the modal
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  return containerRef;
};

export default useFocusTrap;
