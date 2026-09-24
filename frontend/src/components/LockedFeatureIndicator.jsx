import React from 'react';
import { Lock } from 'lucide-react';

/**
 * PHASE 33: Locked Feature Indicator
 * Shows when a feature is locked due to plan restrictions
 */
const LockedFeatureIndicator = ({ 
  feature, 
  currentPlan = 'FREE', 
  onClick,
  variant = 'overlay', // 'overlay', 'badge', 'inline'
  size = 'md'
}) => {
  const requiredPlans = {
    background_music: 'SILVER',
    hero_video: 'GOLD',
    gallery: 'SILVER',
    analytics: 'SILVER',
    analytics_advanced: 'GOLD',
    passcode_protection: 'GOLD',
    ai_features: 'PLATINUM',
    unlimited_gallery: 'PLATINUM'
  };

  const requiredPlan = requiredPlans[feature] || 'SILVER';

  if (variant === 'overlay') {
    return (
      <div 
        className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg z-10 cursor-pointer group hover:bg-white/95 transition-all"
        onClick={onClick}
      >
        <div className="p-4 text-center">
          <div className="mb-3 inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 group-hover:from-purple-200 group-hover:to-purple-300 transition-all">
            <Lock className="w-7 h-7 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Feature Locked
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Upgrade to <span className="font-semibold text-purple-600">{requiredPlan}</span> to unlock
          </p>
          <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-sm font-medium hover:from-purple-700 hover:to-pink-700 transition-all shadow-md hover:shadow-lg">
            Upgrade Now
          </button>
        </div>
      </div>
    );
  }

  if (variant === 'badge') {
    return (
      <div 
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-sm font-medium cursor-pointer hover:bg-purple-100 transition-colors"
        onClick={onClick}
      >
        <Lock className="w-3.5 h-3.5" />
        <span>Requires {requiredPlan}</span>
      </div>
    );
  }

  // Inline variant
  return (
    <span 
      className="inline-flex items-center gap-1 text-xs text-purple-600 font-medium cursor-pointer hover:text-purple-700"
      onClick={onClick}
    >
      <Lock className="w-3 h-3" />
      {requiredPlan}
    </span>
  );
};

export default LockedFeatureIndicator;
