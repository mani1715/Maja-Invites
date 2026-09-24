/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ['class'],
    content: [
        './src/**/*.{js,jsx,ts,tsx}',
        './public/index.html'
    ],
    theme: {
        extend: {
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)'
            },
            colors: {
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))'
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))'
                },
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))'
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))'
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))'
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))'
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))'
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                
                // Design 1: Traditional South Indian Temple
                temple: {
                    primary: 'hsl(var(--temple-primary))',
                    secondary: 'hsl(var(--temple-secondary))',
                    accent: 'hsl(var(--temple-accent))',
                    background: 'hsl(var(--temple-background))',
                    text: 'hsl(var(--temple-text))'
                },
                
                // Design 2: Royal Classic Indian
                royal: {
                    primary: 'hsl(var(--royal-primary))',
                    secondary: 'hsl(var(--royal-secondary))',
                    accent: 'hsl(var(--royal-accent))',
                    background: 'hsl(var(--royal-background))',
                    text: 'hsl(var(--royal-text))'
                },
                
                // Design 3: Floral Elegance
                floral: {
                    primary: 'hsl(var(--floral-primary))',
                    secondary: 'hsl(var(--floral-secondary))',
                    accent: 'hsl(var(--floral-accent))',
                    background: 'hsl(var(--floral-background))',
                    text: 'hsl(var(--floral-text))'
                },
                
                // Design 4: Divine Minimal
                divine: {
                    primary: 'hsl(var(--divine-primary))',
                    secondary: 'hsl(var(--divine-secondary))',
                    accent: 'hsl(var(--divine-accent))',
                    background: 'hsl(var(--divine-background))',
                    text: 'hsl(var(--divine-text))'
                },
                
                // Design 5: Cinematic
                cinematic: {
                    primary: 'hsl(var(--cinematic-primary))',
                    secondary: 'hsl(var(--cinematic-secondary))',
                    accent: 'hsl(var(--cinematic-accent))',
                    background: 'hsl(var(--cinematic-background))',
                    text: 'hsl(var(--cinematic-text))'
                },
                
                // Design 6: Classic Scroll
                scroll: {
                    primary: 'hsl(var(--scroll-primary))',
                    secondary: 'hsl(var(--scroll-secondary))',
                    accent: 'hsl(var(--scroll-accent))',
                    background: 'hsl(var(--scroll-background))',
                    text: 'hsl(var(--scroll-text))'
                },
                
                // Design 7: Cultural Art
                art: {
                    primary: 'hsl(var(--art-primary))',
                    secondary: 'hsl(var(--art-secondary))',
                    accent: 'hsl(var(--art-accent))',
                    background: 'hsl(var(--art-background))',
                    text: 'hsl(var(--art-text))'
                },
                
                // Design 8: Universal Modern
                modern: {
                    primary: 'hsl(var(--modern-primary))',
                    secondary: 'hsl(var(--modern-secondary))',
                    accent: 'hsl(var(--modern-accent))',
                    background: 'hsl(var(--modern-background))',
                    text: 'hsl(var(--modern-text))'
                }
            },
            keyframes: {
                'accordion-down': {
                    from: {
                        height: '0'
                    },
                    to: {
                        height: 'var(--radix-accordion-content-height)'
                    }
                },
                'accordion-up': {
                    from: {
                        height: 'var(--radix-accordion-content-height)'
                    },
                    to: {
                        height: '0'
                    }
                },
                'fade-in-up': {
                    '0%': {
                        opacity: '0',
                        transform: 'translateY(40px)'
                    },
                    '100%': {
                        opacity: '1',
                        transform: 'translateY(0)'
                    }
                },
                'fade-in': {
                    '0%': {
                        opacity: '0'
                    },
                    '100%': {
                        opacity: '1'
                    }
                },
                'float-petal': {
                    '0%, 100%': {
                        transform: 'translateY(0) rotate(0deg)'
                    },
                    '50%': {
                        transform: 'translateY(-20px) rotate(180deg)'
                    }
                },
                'shimmer': {
                    '0%': {
                        backgroundPosition: '-1000px 0'
                    },
                    '100%': {
                        backgroundPosition: '1000px 0'
                    }
                },
                'pulse-soft': {
                    '0%, 100%': {
                        opacity: '1'
                    },
                    '50%': {
                        opacity: '0.7'
                    }
                },
                'slide-in-top': {
                    '0%': {
                        opacity: '0',
                        transform: 'translateY(-100px)'
                    },
                    '100%': {
                        opacity: '1',
                        transform: 'translateY(0)'
                    }
                },
                'scale-in': {
                    '0%': {
                        opacity: '0',
                        transform: 'scale(0.9)'
                    },
                    '100%': {
                        opacity: '1',
                        transform: 'scale(1)'
                    }
                }
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                'fade-in-up': 'fade-in-up 0.8s ease-out',
                'fade-in': 'fade-in 1.2s ease-in-out',
                'float-petal': 'float-petal 6s ease-in-out infinite',
                'shimmer': 'shimmer 2s linear infinite',
                'pulse-soft': 'pulse-soft 3s ease-in-out infinite',
                'slide-in-top': 'slide-in-top 0.6s ease-out',
                'scale-in': 'scale-in 0.6s ease-out'
            }
        }
    },
    plugins: [require('tailwindcss-animate')]
};
