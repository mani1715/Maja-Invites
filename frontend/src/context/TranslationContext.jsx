import React, { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

/**
 * PHASE 26: Translation Context
 * Manages language state and translation caching throughout the app
 */
const TranslationContext = createContext();

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within TranslationProvider');
  }
  return context;
};

export const TranslationProvider = ({ children, defaultLanguage = 'en' }) => {
  const [currentLanguage, setCurrentLanguage] = useState(defaultLanguage);
  const [translationCache, setTranslationCache] = useState({});
  const [isTranslating, setIsTranslating] = useState(false);

  /**
   * Translate content to target language
   * Uses cache if available
   */
  const translateContent = useCallback(async (content, targetLanguage, context = 'wedding invitation') => {
    // Return original if translating to English or content is empty
    if (!content || targetLanguage === 'en') {
      return content;
    }

    // Check cache first
    const cacheKey = `${content}_${targetLanguage}`;
    if (translationCache[cacheKey]) {
      return translationCache[cacheKey];
    }

    setIsTranslating(true);

    try {
      const response = await axios.post(`${BACKEND_URL}/api/translate`, {
        content,
        target_language: targetLanguage,
        context
      });

      const translatedText = response.data.translated_content;

      // Cache the translation
      setTranslationCache(prev => ({
        ...prev,
        [cacheKey]: translatedText
      }));

      return translatedText;
    } catch (error) {
      console.error('Translation error:', error);
      // Return original content on error
      return content;
    } finally {
      setIsTranslating(false);
    }
  }, [translationCache]);

  /**
   * Translate multiple fields at once
   * Returns object with translated fields
   */
  const translateFields = useCallback(async (fields, targetLanguage) => {
    if (targetLanguage === 'en') {
      return fields;
    }

    const translatedFields = {};

    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        translatedFields[key] = await translateContent(value, targetLanguage);
      } else {
        translatedFields[key] = value;
      }
    }

    return translatedFields;
  }, [translateContent]);

  /**
   * Change language and trigger re-translation
   */
  const changeLanguage = useCallback((languageCode) => {
    setCurrentLanguage(languageCode);
    // Language change will trigger component re-renders
    // Components using useTranslatedContent will automatically re-translate
  }, []);

  /**
   * Get translated text with fallback
   */
  const t = useCallback((text, fallback = text) => {
    if (!text) return fallback;
    if (currentLanguage === 'en') return text;

    const cacheKey = `${text}_${currentLanguage}`;
    return translationCache[cacheKey] || fallback;
  }, [currentLanguage, translationCache]);

  const value = {
    currentLanguage,
    changeLanguage,
    translateContent,
    translateFields,
    translationCache,
    isTranslating,
    t
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};

/**
 * Hook to get translated content
 * Automatically translates when language changes
 */
export const useTranslatedContent = (content, context = 'wedding invitation') => {
  const { currentLanguage, translateContent, t } = useTranslation();
  const [translatedText, setTranslatedText] = useState(content);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    const translate = async () => {
      if (!content || currentLanguage === 'en') {
        setTranslatedText(content);
        return;
      }

      setIsLoading(true);
      try {
        const translated = await translateContent(content, currentLanguage, context);
        setTranslatedText(translated);
      } catch (error) {
        console.error('Translation error:', error);
        setTranslatedText(content); // Fallback to original
      } finally {
        setIsLoading(false);
      }
    };

    translate();
  }, [content, currentLanguage, context, translateContent]);

  return { translatedText, isLoading };
};

export default TranslationContext;
