import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * PHASE 29E: Auto-save hook for admin forms
 * 
 * Automatically saves form data to localStorage every 30 seconds
 * Restores saved data on component mount
 * 
 * @param {string} storageKey - Unique key for localStorage
 * @param {Object} formData - Current form data to save
 * @param {Function} onRestore - Callback to restore saved data
 * @param {boolean} enabled - Enable/disable auto-save (default: true)
 * @param {number} interval - Save interval in milliseconds (default: 30000)
 */
export function useAutoSave(
  storageKey,
  formData,
  onRestore,
  enabled = true,
  interval = 30000
) {
  const [lastSaved, setLastSaved] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const hasRestoredRef = useRef(false);
  const saveTimeoutRef = useRef(null);

  // Restore saved data on mount
  useEffect(() => {
    if (!hasRestoredRef.current && enabled && storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const { data, timestamp } = JSON.parse(saved);
          // Only restore if saved within last 24 hours
          const age = Date.now() - timestamp;
          if (age < 24 * 60 * 60 * 1000) {
            onRestore(data);
            setLastSaved(new Date(timestamp));
            console.log(`[Auto-save] Restored draft from ${new Date(timestamp).toLocaleString()}`);
          } else {
            // Clear old draft
            localStorage.removeItem(storageKey);
          }
        }
      } catch (error) {
        console.error('[Auto-save] Failed to restore draft:', error);
      }
      hasRestoredRef.current = true;
    }
  }, [storageKey, enabled, onRestore]);

  // Auto-save effect
  useEffect(() => {
    if (!enabled || !storageKey) return;

    const saveToLocalStorage = () => {
      setIsSaving(true);
      
      // Use timeout to show saving indicator briefly
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        try {
          const dataToSave = {
            data: formData,
            timestamp: Date.now(),
          };
          localStorage.setItem(storageKey, JSON.stringify(dataToSave));
          const now = new Date();
          setLastSaved(now);
          setIsSaving(false);
          console.log('[Auto-save] Draft saved at', now.toLocaleTimeString());
        } catch (error) {
          console.error('[Auto-save] Failed to save draft:', error);
          setIsSaving(false);
        }
      }, 500); // Brief delay to show saving indicator
    };

    const timer = setInterval(saveToLocalStorage, interval);

    return () => {
      clearInterval(timer);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [storageKey, formData, enabled, interval]);

  // Clear saved draft
  const clearAutoSave = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(storageKey);
      setLastSaved(null);
      console.log('[Auto-save] Draft cleared');
    }
  }, [storageKey]);

  return {
    clearAutoSave,
    lastSaved,
    isSaving,
  };
}

export default useAutoSave;
