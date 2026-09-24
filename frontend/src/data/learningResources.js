// Learning Hub curated content (Phase 5). Static, curated data — NO backend,
// storage, auth or payment. Every entry is a pointer to an external resource,
// marked "Recommended by Pixora" where appropriate. Categories, difficulty and
// cost drive the Learning Hub filters/search.
//
// Categories: photography · editing · ai_tools · business · marketing · gear

// --- AI TOOLS DIRECTORY (grouped, per the spec) ---------------------------
// Each tool: name, desc, pricing, useCases, link, recommended.
export const AI_TOOL_GROUPS = [
  {
    group: 'Editing AI',
    tools: [
      { name: 'Adobe Firefly', desc: 'Generative image + fill from Adobe.', pricing: 'Free tier · paid credits', useCases: 'Generative fill, backgrounds, expand', link: 'https://firefly.adobe.com', recommended: true },
      { name: 'Photoshop Generative Fill', desc: 'AI fill inside Photoshop.', pricing: 'Included with Photoshop', useCases: 'Object removal, extend, replace', link: 'https://www.adobe.com/products/photoshop.html', recommended: true },
      { name: 'Luminar Neo', desc: 'AI photo editor for portraits & landscapes.', pricing: 'Paid (one-time / sub)', useCases: 'Sky replace, skin, relight', link: 'https://skylum.com/luminar', recommended: false },
      { name: 'Topaz Photo AI', desc: 'Sharpen, denoise, upscale.', pricing: 'Paid (one-time)', useCases: 'Denoise, sharpen, recover detail', link: 'https://www.topazlabs.com/topaz-photo-ai', recommended: true },
      { name: 'Topaz Gigapixel', desc: 'AI upscaling to large prints.', pricing: 'Paid (one-time)', useCases: 'Upscale for albums & prints', link: 'https://www.topazlabs.com/gigapixel', recommended: false },
      { name: 'Remove.bg', desc: 'One-click background removal.', pricing: 'Free + paid API', useCases: 'Cutouts, product, headshots', link: 'https://www.remove.bg', recommended: false },
      { name: 'Cleanup.pictures', desc: 'Remove objects from photos.', pricing: 'Free + paid', useCases: 'Remove distractions', link: 'https://cleanup.pictures', recommended: false },
      { name: 'Fotor AI', desc: 'Online AI photo enhancer.', pricing: 'Free + paid', useCases: 'Enhance, retouch, effects', link: 'https://www.fotor.com', recommended: false },
    ],
  },
  {
    group: 'Culling AI',
    tools: [
      { name: 'Aftershoot', desc: 'AI culling + editing for photographers.', pricing: 'Paid (sub)', useCases: 'Cull thousands, duplicate/blink detect', link: 'https://aftershoot.com', recommended: true },
      { name: 'Narrative Select', desc: 'Fast culling with focus/closed-eye checks.', pricing: 'Free + paid', useCases: 'Select best frames fast', link: 'https://narrative.so/select', recommended: true },
      { name: 'FilterPixel', desc: 'AI culling assistant.', pricing: 'Paid (sub)', useCases: 'Cull, rate, tag', link: 'https://filterpixel.com', recommended: false },
    ],
  },
  {
    group: 'Video AI',
    tools: [
      { name: 'Runway', desc: 'Generative video + editing.', pricing: 'Free tier · paid', useCases: 'Gen video, green-screen, motion', link: 'https://runwayml.com', recommended: true },
      { name: 'Kling', desc: 'Text/image-to-video.', pricing: 'Free + paid', useCases: 'Cinematic clips from prompts', link: 'https://klingai.com', recommended: false },
      { name: 'Pika', desc: 'AI video generation.', pricing: 'Free + paid', useCases: 'Short teasers, effects', link: 'https://pika.art', recommended: false },
      { name: 'Veo', desc: "Google's video generation model.", pricing: 'Varies', useCases: 'High-quality gen video', link: 'https://deepmind.google/technologies/veo/', recommended: false },
      { name: 'Descript', desc: 'Edit video by editing text.', pricing: 'Free + paid', useCases: 'Reels, podcasts, subtitles', link: 'https://www.descript.com', recommended: true },
      { name: 'Wisecut', desc: 'Auto-cut & subtitle videos.', pricing: 'Free + paid', useCases: 'Auto edits for social', link: 'https://www.wisecut.video', recommended: false },
    ],
  },
  {
    group: 'Voice AI',
    tools: [
      { name: 'ElevenLabs', desc: 'Realistic AI voiceover.', pricing: 'Free + paid', useCases: 'Reel voiceovers, narration', link: 'https://elevenlabs.io', recommended: true },
      { name: 'PlayHT', desc: 'AI text-to-speech voices.', pricing: 'Free + paid', useCases: 'Voiceovers, ads', link: 'https://play.ht', recommended: false },
    ],
  },
  {
    group: 'Writing AI',
    tools: [
      { name: 'ChatGPT', desc: 'General-purpose AI assistant.', pricing: 'Free + paid', useCases: 'Captions, emails, proposals', link: 'https://chat.openai.com', recommended: true },
      { name: 'Claude', desc: 'AI assistant for long-form & analysis.', pricing: 'Free + paid', useCases: 'Contracts, blogs, planning', link: 'https://claude.ai', recommended: true },
      { name: 'Gemini', desc: "Google's AI assistant.", pricing: 'Free + paid', useCases: 'Research, drafting', link: 'https://gemini.google.com', recommended: false },
    ],
  },
  {
    group: 'Marketing AI',
    tools: [
      { name: 'Canva AI', desc: 'Design + Magic Studio AI.', pricing: 'Free + paid', useCases: 'Social posts, decks, reels', link: 'https://www.canva.com', recommended: true },
      { name: 'Adobe Express AI', desc: 'Quick social design + gen AI.', pricing: 'Free + paid', useCases: 'Posts, flyers, quick edits', link: 'https://www.adobe.com/express/', recommended: false },
      { name: 'Buffer AI', desc: 'AI captions + scheduling.', pricing: 'Free + paid', useCases: 'Plan & schedule posts', link: 'https://buffer.com', recommended: false },
      { name: 'Hootsuite AI', desc: 'Social management + AI.', pricing: 'Paid', useCases: 'Manage multiple channels', link: 'https://www.hootsuite.com', recommended: false },
    ],
  },
  {
    group: 'Business AI',
    tools: [
      { name: 'Notion AI', desc: 'AI inside your workspace/docs.', pricing: 'Free + paid', useCases: 'SOPs, notes, planning', link: 'https://www.notion.so/product/ai', recommended: true },
      { name: 'ClickUp AI', desc: 'AI in project management.', pricing: 'Paid add-on', useCases: 'Tasks, docs, summaries', link: 'https://clickup.com/ai', recommended: false },
    ],
  },
];

// --- LEARNING RESOURCES (topics/guides) ------------------------------------
// difficulty: beginner | intermediate | advanced ; cost: free | paid
const R = (title, category, difficulty, cost, link, recommended = false, desc = '') =>
  ({ id: `${category}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title, category, difficulty, cost, link, recommended, desc });

export const LEARNING_RESOURCES = [
  // Photography
  R('Wedding Photography', 'photography', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=wedding+photography+tutorial', true, 'Shooting full Indian weddings end-to-end.'),
  R('Candid Photography', 'photography', 'beginner', 'free', 'https://www.youtube.com/results?search_query=candid+photography', false),
  R('Portrait Photography', 'photography', 'beginner', 'free', 'https://www.youtube.com/results?search_query=portrait+photography', true),
  R('Fashion Photography', 'photography', 'advanced', 'free', 'https://www.youtube.com/results?search_query=fashion+photography', false),
  R('Event Photography', 'photography', 'beginner', 'free', 'https://www.youtube.com/results?search_query=event+photography', false),
  R('Product Photography', 'photography', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=product+photography', false),
  R('Drone Photography', 'photography', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=drone+photography', false),
  R('Mobile Photography', 'photography', 'beginner', 'free', 'https://www.youtube.com/results?search_query=mobile+photography', false),
  R('Studio Photography', 'photography', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=studio+photography+lighting', false),
  R('Composition', 'photography', 'beginner', 'free', 'https://www.youtube.com/results?search_query=photography+composition', true),
  R('Storytelling', 'photography', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=visual+storytelling+photography', false),
  R('Lighting', 'photography', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=photography+lighting', true),
  R('Camera Settings', 'photography', 'beginner', 'free', 'https://www.youtube.com/results?search_query=camera+settings+explained', false),
  R('Color Theory', 'photography', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=color+theory+photography', false),
  // Editing
  R('Lightroom — Beginner', 'editing', 'beginner', 'free', 'https://www.youtube.com/results?search_query=lightroom+beginner', true),
  R('Lightroom — Advanced', 'editing', 'advanced', 'free', 'https://www.youtube.com/results?search_query=lightroom+advanced', false),
  R('Photoshop — Beginner', 'editing', 'beginner', 'free', 'https://www.youtube.com/results?search_query=photoshop+beginner', true),
  R('Photoshop — Advanced', 'editing', 'advanced', 'free', 'https://www.youtube.com/results?search_query=photoshop+advanced+retouching', false),
  R('Premiere Pro — Intermediate', 'editing', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=premiere+pro+wedding+edit', false),
  R('DaVinci Resolve — Beginner', 'editing', 'beginner', 'free', 'https://www.youtube.com/results?search_query=davinci+resolve+beginner', true),
  R('DaVinci Resolve — Color Grading', 'editing', 'advanced', 'free', 'https://www.youtube.com/results?search_query=davinci+resolve+color+grading', false),
  // Business
  R('Starting a Photography Business', 'business', 'beginner', 'free', 'https://www.youtube.com/results?search_query=starting+a+photography+business', true),
  R('Pricing Strategy', 'business', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=photography+pricing+strategy', true),
  R('Wedding Packages', 'business', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=wedding+photography+packages', false),
  R('Client Contracts', 'business', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=photography+client+contract', false),
  R('Team Building', 'business', 'advanced', 'free', 'https://www.youtube.com/results?search_query=building+a+photography+team', false),
  R('GST Basics (India)', 'business', 'beginner', 'free', 'https://www.gst.gov.in/', true),
  R('Invoicing', 'business', 'beginner', 'free', 'https://www.youtube.com/results?search_query=invoicing+for+photographers', false),
  R('Financial Planning', 'business', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=financial+planning+small+business', false),
  // Marketing
  R('Instagram Growth', 'marketing', 'beginner', 'free', 'https://www.youtube.com/results?search_query=instagram+growth+for+photographers', true),
  R('Reels Strategy', 'marketing', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=instagram+reels+strategy', true),
  R('Facebook Ads', 'marketing', 'intermediate', 'paid', 'https://www.facebook.com/business/ads', false),
  R('Google Business Profile', 'marketing', 'beginner', 'free', 'https://www.google.com/business/', true),
  R('SEO for Photographers', 'marketing', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=seo+for+photographers', false),
  R('WhatsApp Marketing', 'marketing', 'beginner', 'free', 'https://business.whatsapp.com/', false),
  R('YouTube Growth', 'marketing', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=youtube+growth+for+creators', false),
  // Gear reviews
  R('Best Wedding Cameras', 'gear', 'beginner', 'free', 'https://www.youtube.com/results?search_query=best+wedding+cameras', true),
  R('Prime vs Zoom Lenses', 'gear', 'beginner', 'free', 'https://www.youtube.com/results?search_query=prime+vs+zoom+lens', false),
  R('Lighting Kits', 'gear', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=off+camera+flash+wedding', false),
  R('Gimbals & Stabilizers', 'gear', 'intermediate', 'free', 'https://www.youtube.com/results?search_query=best+gimbal+for+video', false),
  R('Drones for Weddings', 'gear', 'intermediate', 'paid', 'https://www.youtube.com/results?search_query=best+drone+for+wedding', false),
];

export const LEARNING_CATEGORIES = [
  { key: 'photography', label: 'Photography' },
  { key: 'editing', label: 'Editing' },
  { key: 'business', label: 'Business' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'ai_tools', label: 'AI Tools' },
  { key: 'gear', label: 'Gear Reviews' },
];
