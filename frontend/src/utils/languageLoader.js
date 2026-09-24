/**
 * Language Loader with Lazy Loading and Caching
 * 
 * Loads language JSON files on-demand and caches them in memory.
 * Provides fallback to English if translation key is missing.
 */

// In-memory cache for loaded language files
const languageCache = {};

// Language metadata
export const LANGUAGES = [
  { code: 'english', name: 'English', nativeName: 'English', file: 'en.json' },
  { code: 'telugu', name: 'Telugu', nativeName: 'తెలుగు', file: 'te.json' },
  { code: 'hindi', name: 'Hindi', nativeName: 'हिन्दी', file: 'hi.json' },
  { code: 'tamil', name: 'Tamil', nativeName: 'தமிழ்', file: 'ta.json' },
  { code: 'kannada', name: 'Kannada', nativeName: 'ಕನ್ನಡ', file: 'kn.json' },
  { code: 'malayalam', name: 'Malayalam', nativeName: 'മലയാളം', file: 'ml.json' }
];

/**
 * Get language metadata by code
 */
export const getLanguageMetadata = (code) => {
  return LANGUAGES.find(lang => lang.code === code);
};

/**
 * Load language file (lazy loading with caching)
 */
export const loadLanguage = async (languageCode) => {
  // Check cache first
  if (languageCache[languageCode]) {
    return languageCache[languageCode];
  }

  // Find language metadata
  const langMeta = getLanguageMetadata(languageCode);
  if (!langMeta) {
    console.warn(`Language ${languageCode} not found, falling back to English`);
    return loadLanguage('english');
  }

  try {
    // Fetch JSON file
    const response = await fetch(`/lang/${langMeta.file}`);
    if (!response.ok) {
      throw new Error(`Failed to load ${langMeta.file}`);
    }

    const languageData = await response.json();
    
    // Cache the loaded language
    languageCache[languageCode] = languageData;
    
    return languageData;
  } catch (error) {
    console.error(`Error loading language ${languageCode}:`, error);
    
    // Fallback to English
    if (languageCode !== 'english') {
      return loadLanguage('english');
    }
    
    // Return empty object if even English fails
    return {};
  }
};

/**
 * Get text from language data with fallback
 * 
 * @param {string} languageCode - Current language code
 * @param {string} section - Section name (e.g., 'opening', 'couple')
 * @param {string} key - Text key (e.g., 'title', 'groomLabel')
 * @param {object} customText - Optional custom text overrides
 * @returns {Promise<string>} - Translated text
 */
export const getText = async (languageCode, section, key, customText = {}) => {
  // Check custom text first
  if (customText[languageCode]?.[`${section}.${key}`]) {
    return customText[languageCode][`${section}.${key}`];
  }

  // Load language data
  const langData = await loadLanguage(languageCode);
  
  // Get text from section
  if (langData[section]?.[key]) {
    return langData[section][key];
  }

  // Fallback to English
  if (languageCode !== 'english') {
    const englishData = await loadLanguage('english');
    return englishData[section]?.[key] || key;
  }

  // Return key as fallback
  return key;
};

/**
 * Get all text for a section
 * 
 * @param {string} languageCode - Current language code
 * @param {string} section - Section name
 * @param {object} customText - Optional custom text overrides
 * @returns {Promise<object>} - Section text object
 */
export const getSectionText = async (languageCode, section, customText = {}) => {
  // Load language data
  const langData = await loadLanguage(languageCode);
  
  // Get section data
  const sectionData = langData[section] || {};
  
  // Merge with custom text
  const result = { ...sectionData };
  
  if (customText[languageCode]) {
    Object.keys(customText[languageCode]).forEach(customKey => {
      if (customKey.startsWith(`${section}.`)) {
        const key = customKey.replace(`${section}.`, '');
        result[key] = customText[languageCode][customKey];
      }
    });
  }
  
  return result;
};

/**
 * Preload languages (optional optimization)
 */
export const preloadLanguages = async (languageCodes) => {
  const promises = languageCodes.map(code => loadLanguage(code));
  await Promise.all(promises);
};

/**
 * Clear language cache (useful for testing)
 */
export const clearLanguageCache = () => {
  Object.keys(languageCache).forEach(key => delete languageCache[key]);
};
