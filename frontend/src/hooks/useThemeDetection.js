import { useState, useEffect } from 'react';

/**
 * useThemeDetection - Detects current theme based on page content
 * Returns: { theme, setTheme }
 */
export const useThemeDetection = () => {
  const [theme, setTheme] = useState('temple');

  useEffect(() => {
    // Detect theme from URL, page content, or user selection
    const detectTheme = () => {
      const path = window.location.pathname.toLowerCase();
      const body = document.body.textContent.toLowerCase();

      // Theme keywords detection
      if (path.includes('beach') || body.includes('beach') || body.includes('ocean')) {
        return 'beach';
      } else if (path.includes('mughal') || body.includes('mughal') || body.includes('royal')) {
        return 'mughal';
      } else if (path.includes('nature') || body.includes('garden') || body.includes('outdoor')) {
        return 'nature';
      } else if (path.includes('minimal') || body.includes('modern') || body.includes('simple')) {
        return 'minimal';
      } else {
        return 'temple'; // Default
      }
    };

    setTheme(detectTheme());
  }, []);

  return { theme, setTheme };
};

/**
 * getThemeFromInvitation - Extract theme from invitation data
 */
export const getThemeFromInvitation = (invitation) => {
  if (!invitation) return 'temple';

  const themeMap = {
    'temple': 'temple',
    'beach': 'beach',
    'mughal': 'mughal',
    'nature': 'nature',
    'minimal': 'minimal',
    'traditional': 'temple',
    'royal': 'mughal',
    'outdoor': 'nature',
    'modern': 'minimal'
  };

  const invitationTheme = invitation.theme?.toLowerCase() || '';
  return themeMap[invitationTheme] || 'temple';
};
