import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useMotionDefaults';
import { EASE, VIEWPORT, wordStagger, charStagger } from './presets';

/**
 * TextReveal — splits `text` into words or characters and reveals each with
 * a staggered rise + fade, triggered whileInView. Falls back to plain text
 * when the user prefers reduced motion. The wrapper carries aria-label with
 * the full string and the split spans are aria-hidden, so screen readers
 * announce the sentence once instead of word-by-word / letter-by-letter.
 */
const TextReveal = ({ text = '', as: Wrapper = 'span', mode = 'word', className = '', delay = 0 }) => {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <Wrapper className={className} aria-label={text}>
        {text}
      </Wrapper>
    );
  }

  const isChar = mode === 'char';
  const items = isChar ? charStagger(text) : wordStagger(text);
  const step = isChar ? 0.04 : 0.07;

  return (
    <Wrapper className={className} aria-label={text}>
      {items.map((item, i) => (
        <React.Fragment key={item.key}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              overflow: 'hidden',
              whiteSpace: isChar ? 'pre' : 'normal',
            }}
          >
            <motion.span
              style={{ display: 'inline-block' }}
              initial={{ y: '0.6em', opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={VIEWPORT.once}
              transition={{ duration: 0.5, ease: EASE.cinema, delay: delay + i * step }}
            >
              {isChar ? item.char : item.text}
            </motion.span>
          </span>
          {/* Joining space lives OUTSIDE the overflow-hidden inline-block —
              trailing whitespace inside one is trimmed by CSS, and words
              would render concatenated. */}
          {!isChar && i < items.length - 1 ? ' ' : ''}
        </React.Fragment>
      ))}
    </Wrapper>
  );
};

TextReveal.displayName = 'TextReveal';

export default TextReveal;
