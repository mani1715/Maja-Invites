import React from 'react';
import { motion } from 'framer-motion';

/**
 * PHASE 34: Glassmorphism Card Component
 * Semi-transparent cards with blur effect
 * Auto contrast for text readability
 */
const GlassCard = ({
  children,
  className = '',
  enabled = true,
  intensity = 'medium',
  animate = true,
  ...props
}) => {
  // Intensity levels
  const intensityStyles = {
    light: 'bg-white/10 backdrop-blur-sm border border-white/20',
    medium: 'bg-white/20 backdrop-blur-md border border-white/30',
    strong: 'bg-white/30 backdrop-blur-lg border border-white/40'
  };

  // If glassmorphism is disabled, render standard card
  if (!enabled) {
    return (
      <div
        className={`bg-white rounded-xl shadow-lg p-6 ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }

  // Animation variants
  const variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: 'easeOut' }
    }
  };

  const CardContent = (
    <div
      className={`
        ${intensityStyles[intensity]}
        rounded-xl
        shadow-xl shadow-black/10
        p-6
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );

  // Return animated or static card
  if (animate) {
    return (
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-50px', amount: 0.1 }}
        variants={variants}
      >
        {CardContent}
      </motion.div>
    );
  }

  return CardContent;
};

export default GlassCard;
