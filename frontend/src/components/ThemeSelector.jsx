import React, { useState, useEffect } from 'react';
import { Check, Sparkles } from 'lucide-react';
import axios from 'axios';
import { MASTER_THEMES, getCategoryLabel } from '../themes/masterThemes';
import { usePricing } from '../hooks/usePricing';

// Origin only — the '/api' prefix is added per-request, as everywhere else.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

/**
 * PHASE 34: Theme Selector Component
 * Visual grid for selecting master themes with plan-based gating
 */
const ThemeSelector = ({
  profileId,
  currentThemeId = 'royal_heritage',
  userPlan = 'FREE',
  onThemeSelect,
  onPreview
}) => {
  const [themes, setThemes] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState(currentThemeId);
  const [loading, setLoading] = useState(true);
  const pricing = usePricing('normal_user');

  useEffect(() => {
    fetchThemes();
  }, [userPlan]);

  const fetchThemes = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/themes`, {
        params: { plan_type: userPlan }
      });
      // The API returns colors but no `typography`; the fonts live in the local
      // theme canon. Merge them in, or the preview crashes on theme.typography.
      setThemes((response.data.themes || []).map((t) => ({
        ...MASTER_THEMES[t.id],
        ...t,
        typography: t.typography || MASTER_THEMES[t.id]?.typography || {},
      })));
    } catch (error) {
      console.error('Error fetching themes:', error);
      // Fallback to local themes
      setThemes(Object.values(MASTER_THEMES));
    } finally {
      setLoading(false);
    }
  };

  const handleThemeClick = (theme) => {
    // Credit-based access: every theme is selectable. Actual payment happens
    // at purchase/confirm time via the credit system.
    setSelectedTheme(theme.id);
    if (onThemeSelect) {
      onThemeSelect(theme.id);
    }
  };

  const handlePreview = (theme, e) => {
    e.stopPropagation();
    if (onPreview) {
      onPreview(theme);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  // Group themes by category
  const themesByCategory = themes.reduce((acc, theme) => {
    if (!acc[theme.category]) {
      acc[theme.category] = [];
    }
    acc[theme.category].push(theme);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {Object.entries(themesByCategory).map(([category, categoryThemes]) => (
        <div key={category}>
          <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-rose-600" />
            {getCategoryLabel(category)}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {categoryThemes.map((theme) => {
              // Credit-based: every theme is accessible.
              const isAccessible = true;
              
              const isSelected = selectedTheme === theme.id;

              return (
                <div
                  key={theme.id}
                  onClick={() => handleThemeClick(theme)}
                  className={`
                    relative cursor-pointer rounded-xl overflow-hidden
                    border-2 transition-all duration-300
                    ${isSelected
                      ? 'border-rose-600 shadow-xl scale-105'
                      : isAccessible
                        ? 'border-gray-200 hover:border-rose-400 hover:shadow-lg'
                        : 'border-gray-200 opacity-60 cursor-not-allowed'
                    }
                  `}
                >
                  {/* Preview Image / Color Gradient */}
                  <div
                    className="h-32 flex items-center justify-center relative"
                    style={{
                      background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.accent} 100%)`
                    }}
                  >
                    {/* Selected Badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-lg">
                        <Check className="w-4 h-4 text-rose-600" />
                      </div>
                    )}

                    {/* Locked Badge — never shown under credit-based access. */}

                    {/* Typography Preview */}
                    <div
                      className="text-white text-center p-4"
                      style={{ fontFamily: theme.typography.heading }}
                    >
                      <div className="text-2xl font-bold drop-shadow-lg">Aa</div>
                      <div className="text-sm opacity-90" style={{ fontFamily: theme.typography.body }}>Wedding</div>
                    </div>
                  </div>

                  {/* Theme Info */}
                  <div className="p-4 bg-white">
                    <h4 className="font-semibold text-gray-900 mb-1">{theme.name}</h4>
                    <p className="text-sm text-gray-600 mb-3">{theme.description}</p>

                    {/* Credit cost badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800" data-testid={`theme-selector-credits-${theme.id}`}>
                        {(() => {
                          const c = pricing.themeCost(theme.id, theme.creditCost ?? 1);
                          return `${c} credit${c === 1 ? '' : 's'}`;
                        })()}
                      </span>

                      {/* Preview Button */}
                      <button
                        onClick={(e) => handlePreview(theme, e)}
                        className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Credit balance notice (replaces legacy "Current Plan" banner) */}
      <div className="bg-gradient-to-r from-amber-50 to-rose-50 rounded-xl p-6 border border-amber-200">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-gray-900 mb-1">Pay with credits</h4>
            <p className="text-sm text-gray-600">
              Every theme is available. Buy credits to unlock the designs you love.
            </p>
          </div>
          <a
            href="/credits"
            className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium"
            data-testid="buy-credits-link"
          >
            Buy credits
          </a>
        </div>
      </div>
    </div>
  );
};

export default ThemeSelector;
