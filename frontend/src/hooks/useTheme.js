import { useState, useEffect, useCallback } from 'react';
import { getThemeById, applyTheme, isValidThemeId, THEME_METADATA } from '../config/themeSystem';

/**
 * useTheme Hook - Production-Ready Theme Management
 * 
 * Provides theme state management and utilities for React components.
 * Supports dynamic theme switching with automatic CSS variable application.
 * 
 * @param {string} initialThemeId - Initial theme ID (default: temple_divine)
 * @returns {object} Theme utilities and state
 * 
 * Usage:
 * const { theme, themeId, switchTheme, features } = useTheme('royal_classic');
 */
export const useTheme = (initialThemeId = THEME_METADATA.defaultTheme) => {
  // Validate and set initial theme
  const validInitialTheme = isValidThemeId(initialThemeId) 
    ? initialThemeId 
    : THEME_METADATA.defaultTheme;
  
  const [themeId, setThemeId] = useState(validInitialTheme);
  const [theme, setTheme] = useState(() => getThemeById(validInitialTheme));
  
  /**
   * Switch to a new theme
   * @param {string} newThemeId - The theme ID to switch to
   * @returns {boolean} True if switch was successful
   */
  const switchTheme = useCallback((newThemeId) => {
    if (!isValidThemeId(newThemeId)) {
      console.warn(`Invalid theme ID: ${newThemeId}. Using default theme.`);
      return false;
    }
    
    const newTheme = getThemeById(newThemeId);
    setThemeId(newThemeId);
    setTheme(newTheme);
    
    // Apply theme CSS variables
    applyTheme(newThemeId);
    
    return true;
  }, []);
  
  /**
   * Apply current theme on mount and when themeId changes
   */
  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);
  
  /**
   * Get theme features (hasLord, hasGantalu, hasFire)
   */
  const features = {
    hasLord: theme.hasLord,
    hasGantalu: theme.hasGantalu,
    hasFire: theme.hasFire
  };
  
  /**
   * Get specific accent color by index
   */
  const getAccent = useCallback((index = 0) => {
    return theme.accentColors[index] || theme.accentColors[0];
  }, [theme]);
  
  /**
   * Check if current theme supports a feature
   */
  const supportsFeature = useCallback((feature) => {
    return theme[feature] === true;
  }, [theme]);
  
  return {
    theme,
    themeId,
    switchTheme,
    features,
    getAccent,
    supportsFeature,
    // Direct access to theme properties
    colors: theme.colors,
    fonts: theme.fonts,
    spacing: theme.spacing,
    card: theme.card,
    image: theme.image,
    accentColors: theme.accentColors,
    backgroundColor: theme.backgroundColor,
    name: theme.name
  };
};

export default useTheme;
