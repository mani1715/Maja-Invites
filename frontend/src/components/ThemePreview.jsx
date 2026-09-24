import React, { useState } from 'react';
import { X, Monitor, Smartphone } from 'lucide-react';
import { getThemeById } from '../themes/masterThemes';
import GlassCard from './GlassCard';
import AnimatedSection from './AnimatedSection';

/**
 * PHASE 34: Theme Preview Modal
 * Live preview of themes before applying
 */
const ThemePreview = ({
  themeId,
  onClose,
  onApply
}) => {
  const [deviceView, setDeviceView] = useState('desktop'); // 'desktop' or 'mobile'
  const [animationLevel, setAnimationLevel] = useState('subtle');
  const [glassmorphism, setGlassmorphism] = useState(true);

  const theme = getThemeById(themeId);

  if (!theme) return null;

  const handleApply = () => {
    if (onApply) {
      onApply({
        theme_id: themeId,
        animation_level: animationLevel,
        glassmorphism_enabled: glassmorphism
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{theme.name}</h2>
            <p className="text-sm text-gray-600 mt-1">{theme.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Device Toggle */}
            <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-gray-300">
              <button
                onClick={() => setDeviceView('desktop')}
                className={`
                  px-4 py-2 rounded-md flex items-center gap-2 transition-colors text-sm font-medium
                  ${deviceView === 'desktop'
                    ? 'bg-rose-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <Monitor className="w-4 h-4" />
                Desktop
              </button>
              <button
                onClick={() => setDeviceView('mobile')}
                className={`
                  px-4 py-2 rounded-md flex items-center gap-2 transition-colors text-sm font-medium
                  ${deviceView === 'mobile'
                    ? 'bg-rose-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <Smartphone className="w-4 h-4" />
                Mobile
              </button>
            </div>

            {/* Animation Level */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Animations:</label>
              <select
                value={animationLevel}
                onChange={(e) => setAnimationLevel(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              >
                <option value="none">None</option>
                <option value="subtle">Subtle</option>
                <option value="festive">Festive</option>
              </select>
            </div>

            {/* Glassmorphism Toggle */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Glass Effect:</label>
              <button
                onClick={() => setGlassmorphism(!glassmorphism)}
                className={`
                  w-12 h-6 rounded-full transition-colors relative
                  ${glassmorphism ? 'bg-rose-600' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform
                    ${glassmorphism ? 'translate-x-6' : ''}
                  `}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Preview Area */}
        <div className="flex-1 overflow-auto p-6 bg-gray-100">
          <div
            className={`
              mx-auto transition-all duration-300
              ${deviceView === 'desktop' ? 'max-w-5xl' : 'max-w-sm'}
            `}
          >
            {/* Theme Preview Content */}
            <div
              className="rounded-2xl shadow-2xl overflow-hidden"
              style={{
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                fontFamily: theme.typography.body
              }}
            >
              {/* Hero Section Preview */}
              <div
                className="h-64 flex items-center justify-center relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})`
                }}
              >
                <AnimatedSection animationLevel={animationLevel}>
                  <div className="text-center text-white p-8">
                    <h1
                      className="text-4xl md:text-5xl font-bold mb-4"
                      style={{ fontFamily: theme.typography.heading }}
                    >
                      Priya & Rahul
                    </h1>
                    <p className="text-lg opacity-90">February 14, 2026</p>
                  </div>
                </AnimatedSection>
              </div>

              {/* Content Sections Preview */}
              <div className="p-8 space-y-8">
                <AnimatedSection animationLevel={animationLevel} delay={0.1}>
                  <GlassCard enabled={glassmorphism}>
                    <h3
                      className="text-2xl font-bold mb-3"
                      style={{
                        fontFamily: theme.typography.heading,
                        color: theme.colors.primary
                      }}
                    >
                      Wedding Events
                    </h3>
                    <p className="text-gray-700">
                      Join us as we celebrate our special day with a series of beautiful ceremonies.
                    </p>
                  </GlassCard>
                </AnimatedSection>

                <AnimatedSection animationLevel={animationLevel} delay={0.2}>
                  <GlassCard enabled={glassmorphism}>
                    <h3
                      className="text-2xl font-bold mb-3"
                      style={{
                        fontFamily: theme.typography.heading,
                        color: theme.colors.primary
                      }}
                    >
                      RSVP
                    </h3>
                    <p className="text-gray-700 mb-4">
                      Please confirm your attendance by filling out the form below.
                    </p>
                    <button
                      className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
                      style={{
                        backgroundColor: theme.colors.primary,
                        color: theme.colors.background
                      }}
                    >
                      Confirm Attendance
                    </button>
                  </GlassCard>
                </AnimatedSection>
              </div>

              {/* Color Palette Display */}
              <div className="p-8 bg-white border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">Color Palette</h4>
                <div className="flex gap-2">
                  {Object.entries(theme.colors).map(([name, color]) => (
                    <div key={name} className="flex flex-col items-center">
                      <div
                        className="w-12 h-12 rounded-lg shadow-md border border-gray-200"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs text-gray-600 mt-1">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-6 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium"
          >
            Apply Theme
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThemePreview;
