/**
 * Religious Assets Configuration
 * 
 * Manages deity images and background assets for invitations.
 * Includes progressive loading (thumbnail, mobile, desktop) and fallbacks.
 */

export const DEITY_OPTIONS = [
  {
    id: 'none',
    name: 'No Religious Theme',
    description: 'Secular invitation without deity imagery',
    thumbnail: '/assets/deities/none.svg',
    images: null
  },
  {
    id: 'ganesha',
    name: 'Lord Ganesha',
    description: 'Remover of obstacles, auspicious beginning',
    thumbnail: '/assets/deities/ganesha_thumb.webp',
    images: {
      thumbnail: '/assets/deities/ganesha_thumb.webp',
      mobile: '/assets/deities/ganesha_mobile.webp',
      desktop: '/assets/deities/ganesha_desktop.webp'
    },
    fallback: '/assets/deities/ganesha_desktop.jpg'
  },
  {
    id: 'venkateswara_padmavati',
    name: 'Lord Venkateswara & Padmavati',
    description: 'Divine couple symbolizing eternal love',
    thumbnail: '/assets/deities/venkateswara_padmavati_thumb.webp',
    images: {
      thumbnail: '/assets/deities/venkateswara_padmavati_thumb.webp',
      mobile: '/assets/deities/venkateswara_padmavati_mobile.webp',
      desktop: '/assets/deities/venkateswara_padmavati_desktop.webp'
    },
    fallback: '/assets/deities/venkateswara_padmavati_desktop.jpg'
  },
  {
    id: 'shiva_parvati',
    name: 'Lord Shiva & Parvati',
    description: 'Perfect union of masculine and feminine energy',
    thumbnail: '/assets/deities/shiva_parvati_thumb.webp',
    images: {
      thumbnail: '/assets/deities/shiva_parvati_thumb.webp',
      mobile: '/assets/deities/shiva_parvati_mobile.webp',
      desktop: '/assets/deities/shiva_parvati_desktop.webp'
    },
    fallback: '/assets/deities/shiva_parvati_desktop.jpg'
  },
  {
    id: 'lakshmi_vishnu',
    name: 'Lakshmi & Vishnu',
    description: 'Wealth, prosperity, and harmony',
    thumbnail: '/assets/deities/lakshmi_vishnu_thumb.webp',
    images: {
      thumbnail: '/assets/deities/lakshmi_vishnu_thumb.webp',
      mobile: '/assets/deities/lakshmi_vishnu_mobile.webp',
      desktop: '/assets/deities/lakshmi_vishnu_desktop.webp'
    },
    fallback: '/assets/deities/lakshmi_vishnu_desktop.jpg'
  }
];

/**
 * Get deity configuration by ID
 * @param {string} deityId - Deity identifier
 * @returns {object|null} Deity configuration or null if not found
 */
export const getDeity = (deityId) => {
  if (!deityId) return DEITY_OPTIONS[0]; // Return 'none' as default
  return DEITY_OPTIONS.find(deity => deity.id === deityId) || DEITY_OPTIONS[0];
};

/**
 * Get responsive image source for deity
 * @param {string} deityId - Deity identifier
 * @param {string} size - Image size: 'thumbnail', 'mobile', or 'desktop'
 * @returns {string|null} Image URL or null
 */
export const getDeityImage = (deityId, size = 'desktop') => {
  const deity = getDeity(deityId);
  
  if (!deity || !deity.images) {
    return null;
  }
  
  return deity.images[size] || deity.images.desktop;
};

/**
 * Get all deity IDs
 * @returns {string[]} Array of deity IDs
 */
export const getDeityIds = () => {
  return DEITY_OPTIONS.map(deity => deity.id);
};
