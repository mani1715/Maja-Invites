import React from 'react';
import { cn } from '@/lib/utils';

/**
 * PHASE 29A: SkeletonLoader Component
 * 
 * Features:
 * - Prevents CLS with placeholder that matches final content
 * - Configurable dimensions
 * - Lightweight CSS animation
 * - Multiple variants (text, image, card)
 */

const SkeletonLoader = ({
  variant = 'default',
  width = '100%',
  height = '20px',
  className = '',
  count = 1,
  style = {},
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'text':
        return 'rounded h-4';
      case 'title':
        return 'rounded h-8';
      case 'image':
        return 'rounded-lg';
      case 'circle':
        return 'rounded-full';
      case 'card':
        return 'rounded-xl';
      default:
        return 'rounded-md';
    }
  };

  const skeletons = Array.from({ length: count }, (_, index) => (
    <div
      key={index}
      className={cn(
        'animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%]',
        getVariantClasses(),
        className
      )}
      style={{
        width,
        height,
        animation: 'shimmer 2s infinite',
        ...style,
      }}
    />
  ));

  return (
    <>
      <style>
        {`
          @keyframes shimmer {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
        `}
      </style>
      {count === 1 ? skeletons[0] : <div className="space-y-3">{skeletons}</div>}
    </>
  );
};

export default SkeletonLoader;
