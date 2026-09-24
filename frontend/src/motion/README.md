# Motion module

Shared motion language: `EASE`, `DUR`, `SPRING` constants (mirroring
`luxury.css`), and variant factories `fadeUp`, `fadeIn`, `scaleIn`,
`maskReveal`, `staggerParent`. All accept optional overrides and return
framer-motion `variants` objects (`visible` is index-callback friendly, so
pass `custom={i}` on the `motion.*` element for stagger).

```jsx
import { motion } from 'framer-motion';
import { fadeUp, VIEWPORT } from '../motion/presets';

<motion.div custom={i} variants={fadeUp()} initial="hidden" whileInView="visible" viewport={VIEWPORT.once} />
```

`MagneticButton` wraps any element and nudges it toward the cursor
(springy, disabled on touch/reduced-motion). `TextReveal` staggers a string
by word or char with `whileInView`, degrading to plain text under reduced
motion. Both reuse `useReducedMotion` from `hooks/useMotionDefaults.js` —
don't add a second reduced-motion check.
