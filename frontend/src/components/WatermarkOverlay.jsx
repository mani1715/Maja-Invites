import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * PHASE 33: Watermark Overlay for FREE Plan
 * Always shown on FREE plan invitations
 * Never shown on paid plans
 */
const WatermarkOverlay = ({ position = 'bottom-right' }) => {
  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4'
  };

  return (
    <>
      {/* Watermark Badge */}
      <div 
        className={`
          fixed ${positionClasses[position]} z-50 
          bg-white/95 backdrop-blur-sm shadow-lg rounded-full 
          px-4 py-2 border border-gray-200
          hover:shadow-xl transition-all duration-300
        `}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <span className="text-xs font-semibold text-gray-700">
            Made with <span className="text-purple-600">WeddingInvite</span>
          </span>
        </div>
      </div>

      {/* Optional: Subtle background watermark */}
      <div className="fixed bottom-0 left-0 right-0 pointer-events-none z-40">
        <div className="max-w-7xl mx-auto px-4 pb-2">
          <p className="text-center text-xs text-gray-400/60 font-medium">
            Powered by WeddingInvite.com
          </p>
        </div>
      </div>
    </>
  );
};

export default WatermarkOverlay;
