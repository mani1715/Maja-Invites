/**
 * TouchParticles - Interactive particle system that spawns theme-specific particles on touch/scroll
 * 
 * Features:
 * - Temple theme: Marigold flowers and jasmine petals
 * - Beach theme: Water droplets and bubbles
 * - Muslim theme: Golden sparkles and stars
 * - Mughal theme: Rose petals and gold dust
 * - Responds to mouse movement, touch, and scroll events
 */

import React, { useEffect, useRef, useState } from 'react';

const PARTICLE_CONFIGS = {
  temple: {
    colors: ['#FFD700', '#FF6B35', '#FFA500', '#FFE4B5'], // Marigold, orange, gold
    emojis: ['🌸', '🌺', '🏵️', '💐'],
    size: { min: 20, max: 40 },
    count: 8,
    gravity: 0.3,
    lifetime: 2000
  },
  beach: {
    colors: ['#4A90E2', '#87CEEB', '#00CED1', '#B0E0E6'], // Blue, cyan, aqua
    emojis: ['💧', '💦', '🌊', '🫧'],
    size: { min: 15, max: 35 },
    count: 10,
    gravity: 0.5,
    lifetime: 1800
  },
  muslim: {
    colors: ['#FFD700', '#F0E68C', '#FFFACD', '#DAA520'], // Gold, sparkle
    emojis: ['✨', '⭐', '💫', '🌟'],
    size: { min: 18, max: 38 },
    count: 12,
    gravity: 0.2,
    lifetime: 2200
  },
  mughal: {
    colors: ['#DC143C', '#FFB6C1', '#FFD700', '#DDA0DD'], // Rose, gold, purple
    emojis: ['🌹', '🥀', '✨', '💐'],
    size: { min: 22, max: 42 },
    count: 9,
    gravity: 0.35,
    lifetime: 2100
  },
  christian: {
    colors: ['#FFFFFF', '#F0F8FF', '#E6E6FA', '#FFE4E1'], // White, lavender
    emojis: ['🕊️', '💒', '✨', '🤍'],
    size: { min: 20, max: 38 },
    count: 8,
    gravity: 0.25,
    lifetime: 2000
  },
  punjabi: {
    colors: ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF'], // Colorful
    emojis: ['🎵', '🥁', '💃', '🎊'],
    size: { min: 20, max: 40 },
    count: 10,
    gravity: 0.3,
    lifetime: 1900
  },
  bengali: {
    colors: ['#FF69B4', '#FFD700', '#FFA500', '#FF6347'], // Pink, gold, orange
    emojis: ['🌺', '🥭', '🍬', '✨'],
    size: { min: 18, max: 36 },
    count: 9,
    gravity: 0.32,
    lifetime: 2000
  },
  default: {
    colors: ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4'],
    emojis: ['✨', '💫', '⭐', '🌟'],
    size: { min: 20, max: 40 },
    count: 8,
    gravity: 0.3,
    lifetime: 2000
  },

  /* ── NON-WEDDING CATEGORIES — interactive touch/click particle bursts.
       Same culturally-resonant motifs as ThemeAnimatedBackground so the
       ambient + on-tap experiences feel like one cohesive layer. */
  baby_birthday: {
    colors: ['#FF69B4', '#FFB6C1', '#FFD27D', '#87CEEB', '#FFC4E1'],
    emojis: ['🎈', '🎂', '⭐', '💝', '🎀', '🧸', '🍭'],
    size: { min: 22, max: 44 },
    count: 12,
    gravity: 0.28,
    lifetime: 2200
  },
  half_saree: {
    colors: ['#C71585', '#FF1493', '#D4AF37', '#FFD700', '#FFE4B5'],
    emojis: ['🌸', '🪷', '🌺', '🔔', '🦚', '🌷', '✨'],
    size: { min: 20, max: 40 },
    count: 10,
    gravity: 0.32,
    lifetime: 2000
  },
  puberty: {
    colors: ['#FF8C00', '#FFA500', '#C0392B', '#DAA520', '#FFD27D'],
    emojis: ['🌼', '🌻', '🪔', '🌹', '🍃', '🧡', '✨'],
    size: { min: 20, max: 38 },
    count: 10,
    gravity: 0.3,
    lifetime: 2000
  },
  dhoti: {
    colors: ['#FFFFFF', '#FFF8DC', '#D4AF37', '#8FBC8F', '#E8C766'],
    emojis: ['🌴', '🥥', '🍃', '🪔', '🤍', '🌸', '✨'],
    size: { min: 20, max: 40 },
    count: 10,
    gravity: 0.3,
    lifetime: 2100
  }
};

class Particle {
  constructor(x, y, config) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 6;
    this.vy = (Math.random() - 0.5) * 6 - 2;
    this.gravity = config.gravity;
    this.lifetime = config.lifetime;
    this.createdAt = Date.now();
    this.size = config.size.min + Math.random() * (config.size.max - config.size.min);
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 10;
    this.emoji = config.emojis[Math.floor(Math.random() * config.emojis.length)];
    this.color = config.colors[Math.floor(Math.random() * config.colors.length)];
  }

  update() {
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    this.vx *= 0.98; // Air resistance
  }

  isAlive() {
    return Date.now() - this.createdAt < this.lifetime;
  }

  getOpacity() {
    const age = Date.now() - this.createdAt;
    const progress = age / this.lifetime;
    return Math.max(0, 1 - progress);
  }
}

// DISABLED 2026-06: the touch/pointer particle effect spawned 8-12 DOM/canvas
// particles on every mousemove + scroll, causing heavy lag on lower-end devices.
// Stubbed to a no-op (returns null) so all existing mount points keep working
// without the performance cost. Delete the dead body below when convenient.
const TouchParticles = () => null;

// eslint-disable-next-line no-unused-vars
const _TouchParticlesLegacy = ({ theme = 'default', enabled = true }) => {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef(null);
  const lastTouchRef = useRef({ x: 0, y: 0, time: 0 });

  const config = PARTICLE_CONFIGS[theme] || PARTICLE_CONFIGS.default;

  const spawnParticles = (x, y) => {
    if (!enabled) return;
    
    const now = Date.now();
    // Throttle particle spawning to avoid performance issues
    if (now - lastTouchRef.current.time < 100) return;
    lastTouchRef.current = { x, y, time: now };

    for (let i = 0; i < config.count; i++) {
      particlesRef.current.push(new Particle(x, y, config));
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };

    const handleInteraction = (e) => {
      const x = e.clientX || e.touches?.[0]?.clientX;
      const y = e.clientY || e.touches?.[0]?.clientY;
      if (x !== undefined && y !== undefined) {
        spawnParticles(x, y);
      }
    };

    const handleScroll = () => {
      // Spawn particles at random positions during scroll
      const x = Math.random() * w;
      const y = window.scrollY + Math.random() * h;
      spawnParticles(x, y);
    };

    let scrollTimeout;
    const throttledScroll = () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        handleScroll();
        scrollTimeout = null;
      }, 200);
    };

    const animate = () => {
      ctx.clearRect(0, 0, w, h);

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter(p => {
        p.update();
        
        if (!p.isAlive() || p.y > h + 100 || p.x < -100 || p.x > w + 100) {
          return false;
        }

        const opacity = p.getOpacity();
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        
        // Draw emoji
        ctx.font = `${p.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add glow effect
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fillText(p.emoji, 0, 0);
        
        ctx.restore();
        return true;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleInteraction);
    window.addEventListener('touchmove', handleInteraction, { passive: true });
    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction, { passive: true });
    window.addEventListener('scroll', throttledScroll, { passive: true });

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('touchmove', handleInteraction);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('scroll', throttledScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [theme, enabled, config]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
      aria-hidden="true"
    />
  );
};

export default TouchParticles;
