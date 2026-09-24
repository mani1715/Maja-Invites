// Design themes configuration
export const themes = {
  temple_divine: {
    name: 'Temple Divine',
    colors: {
      primary: '#8B7355',
      secondary: '#D4AF37',
      background: '#FFF8E7',
      card: '#FFFDF7',
      text: '#4A3728',
      accent: '#C9A961'
    },
    fonts: {
      heading: "'Cinzel', serif",
      body: "'Lora', serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(139, 115, 85, 0.15)',
      border: '1px solid #E8D9C5',
      radius: '12px'
    },
    image: {
      border: '4px solid #D4AF37',
      radius: '8px'
    }
  },
  
  royal_classic: {
    name: 'Royal Classic',
    colors: {
      primary: '#8B0000',
      secondary: '#FFD700',
      background: '#FFF5E6',
      card: '#FFFEFA',
      text: '#4A1A1A',
      accent: '#B8860B'
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Libre Baskerville', serif"
    },
    spacing: {
      section: '3.5rem',
      card: '2rem'
    },
    card: {
      shadow: '0 6px 16px rgba(139, 0, 0, 0.2)',
      border: '2px solid #FFD700',
      radius: '16px'
    },
    image: {
      border: '6px solid #8B0000',
      radius: '12px'
    }
  },
  
  floral_soft: {
    name: 'Floral Soft',
    colors: {
      primary: '#FFB6C1',
      secondary: '#FFDAB9',
      background: '#FFF0F5',
      card: '#FFFFFF',
      text: '#6B4E71',
      accent: '#E6A8D7'
    },
    fonts: {
      heading: "'Quicksand', sans-serif",
      body: "'Nunito', sans-serif"
    },
    spacing: {
      section: '2.5rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(255, 182, 193, 0.25)',
      border: '1px solid #FFE4E1',
      radius: '20px'
    },
    image: {
      border: '3px solid #FFB6C1',
      radius: '16px'
    }
  },
  
  cinematic_luxury: {
    name: 'Cinematic Luxury',
    colors: {
      primary: '#1A1A1A',
      secondary: '#D4AF37',
      background: 'linear-gradient(135deg, #2C2C2C 0%, #1A1A1A 100%)',
      card: '#2A2A2A',
      text: '#F5F5F5',
      accent: '#C9A961'
    },
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Montserrat', sans-serif"
    },
    spacing: {
      section: '4rem',
      card: '2rem'
    },
    card: {
      shadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
      border: '1px solid #D4AF37',
      radius: '8px'
    },
    image: {
      border: '2px solid #D4AF37',
      radius: '4px'
    }
  },
  
  heritage_scroll: {
    name: 'Heritage Scroll',
    colors: {
      primary: '#8B4513',
      secondary: '#D2691E',
      background: '#F5E6D3',
      card: '#FAF0E6',
      text: '#3E2723',
      accent: '#A0522D'
    },
    fonts: {
      heading: "'UnifrakturMaguntia', cursive",
      body: "'Merriweather', serif"
    },
    spacing: {
      section: '3rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(139, 69, 19, 0.2)',
      border: '2px solid #8B4513',
      radius: '4px'
    },
    image: {
      border: '4px double #8B4513',
      radius: '0px'
    }
  },
  
  minimal_elegant: {
    name: 'Minimal Elegant',
    colors: {
      primary: '#000000',
      secondary: '#808080',
      background: '#FFFFFF',
      card: '#FAFAFA',
      text: '#1A1A1A',
      accent: '#606060'
    },
    fonts: {
      heading: "'Raleway', sans-serif",
      body: "'Inter', sans-serif"
    },
    spacing: {
      section: '4rem',
      card: '2rem'
    },
    card: {
      shadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
      border: '1px solid #E0E0E0',
      radius: '4px'
    },
    image: {
      border: '1px solid #CCCCCC',
      radius: '2px'
    }
  },
  
  modern_premium: {
    name: 'Modern Premium',
    colors: {
      primary: '#2C3E50',
      secondary: '#16A085',
      background: '#ECF0F1',
      card: '#FFFFFF',
      text: '#2C3E50',
      accent: '#D4AF37'
    },
    fonts: {
      heading: "'Poppins', sans-serif",
      body: "'Open Sans', sans-serif"
    },
    spacing: {
      section: '3.5rem',
      card: '2rem'
    },
    card: {
      shadow: '0 4px 16px rgba(44, 62, 80, 0.15)',
      border: 'none',
      radius: '12px'
    },
    image: {
      border: 'none',
      radius: '8px'
    }
  },
  
  artistic_handcrafted: {
    name: 'Artistic Handcrafted',
    colors: {
      primary: '#8B7D6B',
      secondary: '#C19A6B',
      background: '#FAF8F3',
      card: '#FFFFFF',
      text: '#4A4A4A',
      accent: '#B8A78F'
    },
    fonts: {
      heading: "'Indie Flower', cursive",
      body: "'Architects Daughter', cursive"
    },
    spacing: {
      section: '2.5rem',
      card: '1.5rem'
    },
    card: {
      shadow: '0 4px 12px rgba(139, 125, 107, 0.15)',
      border: '1px solid #E8DED0',
      radius: '24px'
    },
    image: {
      border: '3px solid #C19A6B',
      radius: '20px'
    }
  }
};

// Helper function to get theme
export const getTheme = (designId) => {
  return themes[designId] || themes.temple_divine;
};

// Helper function to apply theme CSS variables
export const applyThemeVariables = (theme) => {
  const root = document.documentElement;
  
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-secondary', theme.colors.secondary);
  root.style.setProperty('--color-background', theme.colors.background);
  root.style.setProperty('--color-card', theme.colors.card);
  root.style.setProperty('--color-text', theme.colors.text);
  root.style.setProperty('--color-accent', theme.colors.accent);
  
  root.style.setProperty('--font-heading', theme.fonts.heading);
  root.style.setProperty('--font-body', theme.fonts.body);
  
  root.style.setProperty('--spacing-section', theme.spacing.section);
  root.style.setProperty('--spacing-card', theme.spacing.card);
  
  root.style.setProperty('--card-shadow', theme.card.shadow);
  root.style.setProperty('--card-border', theme.card.border);
  root.style.setProperty('--card-radius', theme.card.radius);
  
  root.style.setProperty('--image-border', theme.image.border);
  root.style.setProperty('--image-radius', theme.image.radius);
};
