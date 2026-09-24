import React from 'react';
import SkeletonLoader from '@/components/SkeletonLoader';

const LoadingFallback = ({ variant = 'page' }) => {
  // Full page loading skeleton
  if (variant === 'page') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 p-4">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Hero Section Skeleton */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <SkeletonLoader variant="image" width="100%" height="400px" />
            <div className="p-8 space-y-4">
              <SkeletonLoader variant="title" width="60%" height="32px" />
              <SkeletonLoader variant="text" width="80%" height="20px" />
              <SkeletonLoader variant="text" width="70%" height="20px" />
            </div>
          </div>

          {/* Content Skeleton */}
          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-4">
            <SkeletonLoader variant="title" width="40%" height="28px" />
            <SkeletonLoader variant="text" width="100%" height="16px" count={3} />
          </div>

          {/* Gallery Skeleton */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <SkeletonLoader variant="title" width="30%" height="24px" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
              <SkeletonLoader variant="image" width="100%" height="200px" />
              <SkeletonLoader variant="image" width="100%" height="200px" />
              <SkeletonLoader variant="image" width="100%" height="200px" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Card loading skeleton
  if (variant === 'card') {
    return (
      <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
        <SkeletonLoader variant="title" width="50%" height="24px" />
        <SkeletonLoader variant="text" width="100%" height="16px" count={2} />
      </div>
    );
  }

  // Gallery loading skeleton
  if (variant === 'gallery') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <SkeletonLoader key={i} variant="image" width="100%" height="200px" />
        ))}
      </div>
    );
  }

  // Simple spinner fallback
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin mx-auto" />
        <p className="text-gray-600 font-medium">Loading invitation...</p>
      </div>
    </div>
  );
};

export default LoadingFallback;
