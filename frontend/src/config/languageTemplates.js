/**
 * Language Templates Configuration
 * 
 * Default text templates for each supported language.
 * Custom text in profile overrides these defaults.
 * 
 * Fallback order: Custom → Default Template → English
 */

export const LANGUAGE_TEMPLATES = {
  english: {
    opening: {
      title: "Wedding Invitation",
      subtitle: "Join us in celebrating our special day"
    },
    welcome: {
      message: "With great joy, we invite you to witness the beginning of our journey together"
    },
    couple: {
      groomLabel: "Groom",
      brideLabel: "Bride"
    },
    events: {
      title: "Event Details",
      dateLabel: "Date",
      venueLabel: "Venue"
    },
    photos: {
      title: "Our Moments"
    },
    video: {
      title: "Our Story"
    },
    greetings: {
      title: "Wedding Wishes",
      nameLabel: "Your Name",
      messagePlaceholder: "Write your wishes here...",
      submitButton: "Send Wishes"
    },
    whatsapp: {
      groomButton: "Message Groom",
      brideButton: "Message Bride",
      defaultMessage: "Congratulations on your wedding! Wishing you both a lifetime of love and happiness."
    },
    footer: {
      thankyou: "Thank you for being part of our celebration"
    }
  },
  
  telugu: {
    opening: {
      title: "వివాహ ఆహ్వానం",
      subtitle: "మా ప్రత్యేక రోజును జరుపుకోవడానికి మాతో చేరండి"
    },
    welcome: {
      message: "చాలా సంతోషంతో, మా ప్రయాణ ప్రారంభానికి సాక్షిగా ఉండమని మిమ్మల్ని ఆహ్వానిస్తున్నాము"
    },
    couple: {
      groomLabel: "వరుడు",
      brideLabel: "వధువు"
    },
    events: {
      title: "కార్యక్రమ వివరాలు",
      dateLabel: "తేదీ",
      venueLabel: "స్థలం"
    },
    photos: {
      title: "మా జ్ఞాపకాలు"
    },
    video: {
      title: "మా కథ"
    },
    greetings: {
      title: "శుభాకాంక్షలు",
      nameLabel: "మీ పేరు",
      messagePlaceholder: "మీ శుభాకాంక్షలు ఇక్కడ రాయండి...",
      submitButton: "శుభాకాంక్షలు పంపండి"
    },
    whatsapp: {
      groomButton: "వరుడికి సందేశం పంపండి",
      brideButton: "వధువుకు సందేశం పంపండి",
      defaultMessage: "మీ వివాహానికి శుభాకాంక్షలు! మీ ఇద్దరికీ ప్రేమ మరియు సంతోషంతో నిండిన జీవితం కోరుకుంటున్నాను."
    },
    footer: {
      thankyou: "మా వేడుకలో భాగం అయినందుకు ధన్యవాదాలు"
    }
  },
  
  hindi: {
    opening: {
      title: "विवाह निमंत्रण",
      subtitle: "हमारे खास दिन को मनाने के लिए हमसे जुड़ें"
    },
    welcome: {
      message: "बहुत खुशी के साथ, हम आपको हमारी यात्रा की शुरुआत का गवाह बनने के लिए आमंत्रित करते हैं"
    },
    couple: {
      groomLabel: "वर",
      brideLabel: "वधू"
    },
    events: {
      title: "कार्यक्रम विवरण",
      dateLabel: "तारीख",
      venueLabel: "स्थान"
    },
    photos: {
      title: "हमारी यादें"
    },
    video: {
      title: "हमारी कहानी"
    },
    greetings: {
      title: "शुभकामनाएं",
      nameLabel: "आपका नाम",
      messagePlaceholder: "यहां अपनी शुभकामनाएं लिखें...",
      submitButton: "शुभकामनाएं भेजें"
    },
    whatsapp: {
      groomButton: "वर को संदेश भेजें",
      brideButton: "वधू को संदेश भेजें",
      defaultMessage: "आपकी शादी की बधाई! आप दोनों को प्यार और खुशियों से भरी जिंदगी की शुभकामनाएं।"
    },
    footer: {
      thankyou: "हमारे उत्सव का हिस्सा बनने के लिए धन्यवाद"
    }
  },
  
  tamil: {
    opening: {
      title: "திருமண அழைப்பிதழ்",
      subtitle: "எங்கள் சிறப்பு நாளை கொண்டாட எங்களுடன் சேருங்கள்"
    },
    welcome: {
      message: "மிகுந்த மகிழ்ச்சியுடன், எங்கள் பயணத்தின் தொடக்கத்திற்கு சாட்சியாக உங்களை அழைக்கிறோம்"
    },
    couple: {
      groomLabel: "மாப்பிள்ளை",
      brideLabel: "மணமகள்"
    },
    events: {
      title: "நிகழ்வு விவரங்கள்",
      dateLabel: "தேதி",
      venueLabel: "இடம்"
    },
    photos: {
      title: "எங்கள் நினைவுகள்"
    },
    video: {
      title: "எங்கள் கதை"
    },
    greetings: {
      title: "திருமண வாழ்த்துக்கள்",
      nameLabel: "உங்கள் பெயர்",
      messagePlaceholder: "உங்கள் வாழ்த்துக்களை இங்கே எழுதுங்கள்...",
      submitButton: "வாழ்த்துக்களை அனுப்பவும்"
    },
    whatsapp: {
      groomButton: "மாப்பிள்ளைக்கு செய்தி அனுப்பவும்",
      brideButton: "மணமகளுக்கு செய்தி அனுப்பவும்",
      defaultMessage: "உங்கள் திருமணத்திற்கு வாழ்த்துக்கள்! நீங்கள் இருவருக்கும் அன்பும் மகிழ்ச்சியும் நிறைந்த வாழ்க்கை வாழ வாழ்த்துகிறேன்."
    },
    footer: {
      thankyou: "எங்கள் கொண்டாட்டத்தில் பங்கேற்றதற்கு நன்றி"
    }
  },
  
  kannada: {
    opening: {
      title: "ಮದುವೆಯ ಆಹ್ವಾನ",
      subtitle: "ನಮ್ಮ ವಿಶೇಷ ದಿನವನ್ನು ಆಚರಿಸಲು ನಮ್ಮೊಂದಿಗೆ ಸೇರಿ"
    },
    welcome: {
      message: "ಅಪಾರ ಸಂತೋಷದಿಂದ, ನಮ್ಮ ಪ್ರಯಾಣದ ಪ್ರಾರಂಭಕ್ಕೆ ಸಾಕ್ಷಿಯಾಗಲು ನಿಮ್ಮನ್ನು ಆಹ್ವಾನಿಸುತ್ತೇವೆ"
    },
    couple: {
      groomLabel: "ವರ",
      brideLabel: "ವಧು"
    },
    events: {
      title: "ಕಾರ್ಯಕ್ರಮ ವಿವರಗಳು",
      dateLabel: "ದಿನಾಂಕ",
      venueLabel: "ಸ್ಥಳ"
    },
    photos: {
      title: "ನಮ್ಮ ನೆನಪುಗಳು"
    },
    video: {
      title: "ನಮ್ಮ ಕಥೆ"
    },
    greetings: {
      title: "ಮದುವೆಯ ಶುಭಾಶಯಗಳು",
      nameLabel: "ನಿಮ್ಮ ಹೆಸರು",
      messagePlaceholder: "ನಿಮ್ಮ ಶುಭಾಶಯಗಳನ್ನು ಇಲ್ಲಿ ಬರೆಯಿರಿ...",
      submitButton: "ಶುಭಾಶಯಗಳನ್ನು ಕಳುಹಿಸಿ"
    },
    whatsapp: {
      groomButton: "ವರನಿಗೆ ಸಂದೇಶ ಕಳುಹಿಸಿ",
      brideButton: "ವಧುವಿಗೆ ಸಂದೇಶ ಕಳುಹಿಸಿ",
      defaultMessage: "ನಿಮ್ಮ ಮದುವೆಗೆ ಶುಭಾಶಯಗಳು! ನೀವಿಬ್ಬರಿಗೂ ಪ್ರೀತಿ ಮತ್ತು ಸಂತೋಷದಿಂದ ತುಂಬಿದ ಜೀವನವನ್ನು ಹಾರೈಸುತ್ತೇನೆ."
    },
    footer: {
      thankyou: "ನಮ್ಮ ಆಚರಣೆಯಲ್ಲಿ ಭಾಗವಹಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು"
    }
  },
  
  malayalam: {
    opening: {
      title: "വിവാഹ ക്ഷണം",
      subtitle: "ഞങ്ങളുടെ പ്രത്യേക ദിവസം ആഘോഷിക്കാൻ ഞങ്ങളോടൊപ്പം ചേരുക"
    },
    welcome: {
      message: "അതിയായ സന്തോഷത്തോടെ, ഞങ്ങളുടെ യാത്രയുടെ തുടക്കത്തിന് സാക്ഷ്യം വഹിക്കാൻ നിങ്ങളെ ക്ഷണിക്കുന്നു"
    },
    couple: {
      groomLabel: "വരൻ",
      brideLabel: "വധു"
    },
    events: {
      title: "പരിപാടി വിശദാംശങ്ങൾ",
      dateLabel: "തീയതി",
      venueLabel: "സ്ഥലം"
    },
    photos: {
      title: "ഞങ്ങളുടെ സ്മരണകൾ"
    },
    video: {
      title: "ഞങ്ങളുടെ കഥ"
    },
    greetings: {
      title: "വിവാഹ ആശംസകൾ",
      nameLabel: "നിങ്ങളുടെ പേര്",
      messagePlaceholder: "നിങ്ങളുടെ ആശംസകൾ ഇവിടെ എഴുതുക...",
      submitButton: "ആശംസകൾ അയയ്ക്കുക"
    },
    whatsapp: {
      groomButton: "വരന് സന്ദേശം അയയ്ക്കുക",
      brideButton: "വധുവിന് സന്ദേശം അയയ്ക്കുക",
      defaultMessage: "നിങ്ങളുടെ വിവാഹത്തിന് അഭിനന്ദനങ്ങൾ! നിങ്ങൾ രണ്ടുപേർക്കും സ്നേഹവും സന്തോഷവും നിറഞ്ഞ ജീവിതം ആശംസിക്കുന്നു."
    },
    footer: {
      thankyou: "ഞങ്ങളുടെ ആഘോഷത്തിൽ പങ്കാളികളായതിന് നന്ദി"
    }
  }
};

/**
 * Language metadata
 */
export const LANGUAGES = [
  {
    code: 'english',
    name: 'English',
    nativeName: 'English',
    rtl: false
  },
  {
    code: 'telugu',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    rtl: false
  },
  {
    code: 'hindi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    rtl: false
  },
  {
    code: 'tamil',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    rtl: false
  },
  {
    code: 'kannada',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    rtl: false
  },
  {
    code: 'malayalam',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    rtl: false
  }
];

/**
 * Get text for a specific section and language
 * @param {string} language - Language code
 * @param {string} section - Section name
 * @param {string} key - Text key
 * @param {object} customText - Custom text overrides from profile
 * @returns {string} Text content with fallback
 */
export const getText = (language, section, key, customText = {}) => {
  // Check custom text first
  if (customText[language] && customText[language][`${section}_${key}`]) {
    return customText[language][`${section}_${key}`];
  }
  
  // Check language template
  if (LANGUAGE_TEMPLATES[language] && 
      LANGUAGE_TEMPLATES[language][section] && 
      LANGUAGE_TEMPLATES[language][section][key]) {
    return LANGUAGE_TEMPLATES[language][section][key];
  }
  
  // Fallback to English
  if (LANGUAGE_TEMPLATES.english[section] && 
      LANGUAGE_TEMPLATES.english[section][key]) {
    return LANGUAGE_TEMPLATES.english[section][key];
  }
  
  return '';
};

/**
 * Get all text for a section in a language
 * @param {string} language - Language code
 * @param {string} section - Section name
 * @param {object} customText - Custom text overrides from profile
 * @returns {object} Section text with fallback
 */
export const getSectionText = (language, section, customText = {}) => {
  const template = LANGUAGE_TEMPLATES[language]?.[section] || LANGUAGE_TEMPLATES.english[section];
  
  if (!template) return {};
  
  const result = { ...template };
  
  // Apply custom overrides
  if (customText[language]) {
    Object.keys(result).forEach(key => {
      const customKey = `${section}_${key}`;
      if (customText[language][customKey]) {
        result[key] = customText[language][customKey];
      }
    });
  }
  
  return result;
};

/**
 * Get language metadata by code
 * @param {string} code - Language code
 * @returns {object|null} Language metadata
 */
export const getLanguage = (code) => {
  return LANGUAGES.find(lang => lang.code === code);
};
