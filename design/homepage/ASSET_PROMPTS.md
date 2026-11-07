# Original homepage artwork — prompts and provenance

Built-in `image_gen` was used for both images. The user's attached design served as visual direction; it was not sliced into production artwork. No CLI or external image service was used.

## Desktop generation prompt

Create an original premium website background art asset, wide landscape 1536x1024 or wider. A luminous, serene lavender wisteria garden meets a still violet lake at blue hour, subtle aurora ribbons and soft drifting cloud mist in a pale lilac sky. Photorealistic cinematic botanical art direction, delicate detailed hanging wisteria blossoms frame ONLY extreme upper left and upper right edges, fine natural branching, not cartoon. A low horizon at 68 percent height, reflective water occupies lower third, delicate concentric circular ripples and shimmering silver-lavender highlights, atmospheric distant low hills at extreme edges. Central 65 percent of sky is beautifully clean pale pearl lavender with very little detail, intentionally clear space for dark headline text added separately by website code. Restrained lilac, amethyst, dusty violet and warm pearl palette, sophisticated editorial luxury, magical but believable light, exquisite fine photography texture. No people, no buildings, no typography, no text, no logo, no UI, no frames, no watermark, no collage. Compose one continuous immersive environment. This is a decorative landscape asset for Pixora photographer community homepage.

Generated original: `exec-3c74867b-05da-461c-9736-ff62202771e3.png`.
Project asset: `frontend-v2/public/home/wisteria-world.webp`.

## Mobile recomposition prompt

Create a PORTRAIT 9:16 mobile website background, 1024x1792 or closest portrait. The attached image is the reference for the same environment and palette, recompose it for a narrow phone screen. A luminous lavender wisteria garden reflected in a still violet lake, soft aurora and drifting pale clouds. Delicate realistic hanging purple wisteria flowers visible at the two very TOP CORNERS only, slender trailing blossom branches stay in outermost 10 percent of frame and end by 27 percent height. Center and middle 80 percent of frame must stay clear, bright pearly lavender and soft peach mist for readable dark headline text added separately. Lake horizon at 73 percent height, beautiful subtle circular ripples at lower 20 percent, small distant hills. Cinematic detailed botanical photography meets exquisite subtle fantasy art, restrained lavender and amethyst, no people no buildings no letters no words no UI no logo no watermark. Single continuous landscape, not a mockup. Preserve a pale calm center and frame with airy flowers at both top edges. Portrait composition essential.

Reference: the generated desktop landscape above.
Generated original: `exec-27018c67-8a3d-45a3-9a1b-b9238a4443bd.png`.
Project asset: `frontend-v2/public/home/wisteria-world-mobile.webp`.

Optimized derivatives retain the composition and are converted to WebP for serving. Petals, cloud motion and lake refraction are implemented separately in React/CSS/canvas. The images themselves contain no text or UI.
