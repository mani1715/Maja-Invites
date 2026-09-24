import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Invitation3DScene — real WebGL (three.js) cinematic backdrop for the invite hero (Phase 9).
 *
 * A slow-rotating gold "monogram halo" (torus) inside a field of drifting gold dust,
 * with pointer / device-orientation parallax. Absolutely positioned behind hero content.
 *
 * Deliberately restrained: DPR-capped, pauses when offscreen, honours
 * prefers-reduced-motion, and fully disposes GL resources on unmount. Falls back to
 * nothing (renders an empty div) if WebGL is unavailable — the CSS hero still shows.
 *
 * Props: accent (hex ring colour), density (0.4–1.4 particle multiplier).
 */
export default function Invitation3DScene({ accent = '#D4AF37', density = 1 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (e) {
      return; // no WebGL → silent fallback
    }
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || 520;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.z = 6;

    const gold = new THREE.Color(accent);

    // Monogram halo — a thin torus ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.03, 16, 160),
      new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.55 }),
    );
    ring.rotation.x = Math.PI / 2.6;
    scene.add(ring);

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.015, 16, 160),
      new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.3 }),
    );
    ring2.rotation.x = Math.PI / 2.6;
    scene.add(ring2);

    // Gold dust field
    const COUNT = Math.max(30, Math.round(220 * density));
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dustMat = new THREE.PointsMaterial({ color: gold, size: 0.045, transparent: true, opacity: 0.8, sizeAttenuation: true });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // Pointer / gyro parallax
    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    const onPointer = (e) => {
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) / window.innerWidth - 0.5;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) / window.innerHeight - 0.5;
      targetX = cx * 0.6; targetY = cy * 0.4;
    };
    const onOrient = (e) => {
      if (e.gamma == null) return;
      targetX = (e.gamma / 45) * 0.5; targetY = (e.beta / 90) * 0.4;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('deviceorientation', onOrient, { passive: true });

    // Pause when offscreen
    let visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.01 });
    io.observe(mount);

    const onResize = () => {
      const nw = mount.clientWidth || window.innerWidth;
      const nh = mount.clientHeight || 520;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf, t = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      t += reduce ? 0 : 0.0025;
      ring.rotation.z = t * 0.8;
      ring2.rotation.z = -t * 1.1;
      dust.rotation.y = t * 0.3;
      curX += (targetX - curX) * 0.05;
      curY += (targetY - curY) * 0.05;
      camera.position.x = curX;
      camera.position.y = -curY;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('resize', onResize);
      ring.geometry.dispose(); ring.material.dispose();
      ring2.geometry.dispose(); ring2.material.dispose();
      dustGeo.dispose(); dustMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [accent, density]);

  return <div ref={mountRef} aria-hidden="true" data-testid="invitation-3d-scene" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} />;
}
