import React from 'react';
import { motion } from 'framer-motion';
import { getAnimationVariants } from '../themes/masterThemes';

/**
 * PHASE 34: Animated Section Component
 * Wraps content with entrance animations based on theme settings
 */
const AnimatedSection = ({
  children,
  animationLevel = 'subtle',
  delay = 0,
  className = '',
  ...props
}) => {
  const variants = getAnimationVariants(animationLevel);

  // If animations are disabled
  if (animationLevel === 'none') {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px', amount: 0.1 }}
      variants={{
        ...variants,
        visible: {
          ...variants.visible,
          transition: {
            ...variants.visible.transition,
            delay
          }
        }
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedSection;
