import React, { useMemo } from 'react';
import { getDesignById } from '../config/designRegistry';

/**
 * DesignRenderer Component
 * Renders the selected design with gradients, textures, and decorations
 * Mobile-first, performance-optimized
 */
const DesignRenderer = ({ designId, className = '' }) => {
  const design = useMemo(() => getDesignById(designId), [designId]);

  // Generate texture pattern as data URI
  const textureDataUri = useMemo(() => {
    if (!design || !design.texture || !design.texture.pattern) return null;
    const encoded = btoa(design.texture.pattern);
    return `data:image/svg+xml;base64,${encoded}`;
  }, [design]);

  if (!design) {
    return null;
  }

  return (
    <div
      className={`design-renderer fixed inset-0 -z-10 ${className}`}
      style={{
        pointerEvents: 'none'
      }}
    >
      {/* Base Gradient Layer */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: design.background.base,
          opacity: 1
        }}
      />

      {/* Overlay Gradient Layer */}
      {design.background.overlay && (
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: design.background.overlay,
            opacity: 0.8
          }}
        />
      )}

      {/* Texture Pattern Layer */}
      {textureDataUri && design.texture && (
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            backgroundImage: `url("${textureDataUri}")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '100px 100px',
            opacity: design.texture.opacity || 0.1,
            mixBlendMode: 'multiply'
          }}
        />
      )}

      {/* SVG Flower Decorations */}
      {design.decorations.flowers.enabled && (
        <FlowerDecorations
          type={design.decorations.flowers.type}
          colors={design.decorations.flowers.colors}
          positions={design.decorations.flowers.positions}
        />
      )}
    </div>
  );
};

/**
 * FlowerDecorations Component
 * Renders SVG flowers based on type and positions
 */
const FlowerDecorations = ({ type, colors, positions }) => {
  const renderFlower = (color, x, y, size = 40, rotation = 0) => {
    switch (type) {
      case 'rose':
        return (
          <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
            <circle cx="0" cy="0" r={size * 0.4} fill={color} opacity="0.3" />
            <circle cx={-size * 0.2} cy={-size * 0.2} r={size * 0.25} fill={color} opacity="0.4" />
            <circle cx={size * 0.2} cy={-size * 0.2} r={size * 0.25} fill={color} opacity="0.4" />
            <circle cx={-size * 0.2} cy={size * 0.2} r={size * 0.25} fill={color} opacity="0.4" />
            <circle cx={size * 0.2} cy={size * 0.2} r={size * 0.25} fill={color} opacity="0.4" />
          </g>
        );
      
      case 'marigold':
        return (
          <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
              <ellipse
                key={i}
                cx={Math.cos((angle * Math.PI) / 180) * size * 0.3}
                cy={Math.sin((angle * Math.PI) / 180) * size * 0.3}
                rx={size * 0.15}
                ry={size * 0.3}
                fill={color}
                opacity="0.35"
              />
            ))}
            <circle cx="0" cy="0" r={size * 0.2} fill={colors[1] || color} opacity="0.5" />
          </g>
        );
      
      case 'lotus':
        return (
          <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
            {[0, 60, 120, 180, 240, 300].map((angle, i) => (
              <ellipse
                key={i}
                cx={Math.cos((angle * Math.PI) / 180) * size * 0.25}
                cy={Math.sin((angle * Math.PI) / 180) * size * 0.25}
                rx={size * 0.2}
                ry={size * 0.4}
                fill={color}
                opacity="0.4"
              />
            ))}
            <circle cx="0" cy="0" r={size * 0.15} fill={colors[1] || color} opacity="0.6" />
          </g>
        );
      
      default:
        return (
          <circle cx={x} cy={y} r={size * 0.3} fill={color} opacity="0.3" />
        );
    }
  };

  const getFlowerPositions = () => {
    const flowerPositions = [];
    const colorIndex = (i) => colors[i % colors.length];

    positions.forEach(pos => {
      switch (pos) {
        case 'top-left':
          flowerPositions.push({ x: 80, y: 80, color: colorIndex(0), size: 50, rotation: -30 });
          flowerPositions.push({ x: 120, y: 120, color: colorIndex(1), size: 40, rotation: 15 });
          break;
        
        case 'top-right':
          flowerPositions.push({ x: window.innerWidth - 80, y: 80, color: colorIndex(0), size: 50, rotation: 30 });
          flowerPositions.push({ x: window.innerWidth - 120, y: 120, color: colorIndex(1), size: 40, rotation: -15 });
          break;
        
        case 'bottom-left':
          flowerPositions.push({ x: 80, y: window.innerHeight - 80, color: colorIndex(2), size: 50, rotation: 30 });
          flowerPositions.push({ x: 120, y: window.innerHeight - 120, color: colorIndex(1), size: 40, rotation: -15 });
          break;
        
        case 'bottom-right':
          flowerPositions.push({ x: window.innerWidth - 80, y: window.innerHeight - 80, color: colorIndex(2), size: 50, rotation: -30 });
          flowerPositions.push({ x: window.innerWidth - 120, y: window.innerHeight - 120, color: colorIndex(1), size: 40, rotation: 15 });
          break;
        
        case 'top-corners':
          flowerPositions.push({ x: 60, y: 60, color: colorIndex(0), size: 45, rotation: -20 });
          flowerPositions.push({ x: window.innerWidth - 60, y: 60, color: colorIndex(0), size: 45, rotation: 20 });
          break;
        
        case 'all-corners':
          flowerPositions.push({ x: 70, y: 70, color: colorIndex(0), size: 50, rotation: -25 });
          flowerPositions.push({ x: window.innerWidth - 70, y: 70, color: colorIndex(1), size: 50, rotation: 25 });
          flowerPositions.push({ x: 70, y: window.innerHeight - 70, color: colorIndex(2), size: 50, rotation: 25 });
          flowerPositions.push({ x: window.innerWidth - 70, y: window.innerHeight - 70, color: colorIndex(0), size: 50, rotation: -25 });
          break;
        
        case 'scattered':
          // Random scattered flowers for Haldi
          for (let i = 0; i < 12; i++) {
            flowerPositions.push({
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              color: colorIndex(i),
              size: 30 + Math.random() * 20,
              rotation: Math.random() * 360
            });
          }
          break;
        
        default:
          break;
      }
    });

    return flowerPositions;
  };

  const flowerPositions = getFlowerPositions();

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', opacity: 0.6 }}
    >
      {flowerPositions.map((flower, index) => (
        <React.Fragment key={index}>
          {renderFlower(flower.color, flower.x, flower.y, flower.size, flower.rotation)}
        </React.Fragment>
      ))}
    </svg>
  );
};

export default DesignRenderer;
