"""
PHASE 22: Premium Background Design Registry
8 premium designs with event-specific support and lord decoration compatibility
"""

from models import DesignConfig, EventType

# Design Registry: 8 Premium Designs
DESIGN_REGISTRY = [
    # Design 1: Royal Temple Gold - Lord-supported, traditional
    DesignConfig(
        design_id="design_1",
        name="Royal Temple Gold",
        description="Traditional temple theme with golden accents",
        event_types=[EventType.ENGAGEMENT, EventType.MARRIAGE, EventType.RECEPTION],
        supports_lord=True,
        background_type="hybrid",
        default_colors={
            "primary": "#D4AF37",  # Gold
            "secondary": "#8B0000",  # Dark Red
            "accent": "#FFD700"  # Bright Gold
        },
        preview_image="/designs/preview/design_1.jpg",
        css_class="royal-temple-gold",
        background_image="/designs/backgrounds/temple-pattern.png",
        gradient="linear-gradient(135deg, rgba(212,175,55,0.1) 0%, rgba(139,0,0,0.1) 100%)",
        pattern="temple-motif",
        is_default=True,  # Default for Marriage
        order=1
    ),
    
    # Design 2: Vibrant Haldi Yellow - No lord, perfect for Haldi
    DesignConfig(
        design_id="design_2",
        name="Vibrant Haldi Celebration",
        description="Bright and cheerful yellow theme for Haldi ceremonies",
        event_types=[EventType.HALDI],
        supports_lord=False,
        background_type="css",
        default_colors={
            "primary": "#FFD700",  # Bright Yellow
            "secondary": "#FF8C00",  # Dark Orange
            "accent": "#FFA500"  # Orange
        },
        preview_image="/designs/preview/design_2.jpg",
        css_class="vibrant-haldi",
        gradient="linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)",
        is_default=True,  # Default for Haldi
        order=2
    ),
    
    # Design 3: Mehendi Green Magic - No lord, floral patterns
    DesignConfig(
        design_id="design_3",
        name="Mehendi Green Magic",
        description="Elegant green with floral mehendi patterns",
        event_types=[EventType.MEHENDI],
        supports_lord=False,
        background_type="hybrid",
        default_colors={
            "primary": "#228B22",  # Forest Green
            "secondary": "#9ACD32",  # Yellow Green
            "accent": "#3CB371"  # Medium Sea Green
        },
        preview_image="/designs/preview/design_3.jpg",
        css_class="mehendi-green",
        background_image="/designs/backgrounds/mehendi-pattern.png",
        gradient="linear-gradient(135deg, rgba(34,139,34,0.2) 0%, rgba(60,179,113,0.2) 100%)",
        pattern="mehendi-floral",
        is_default=True,  # Default for Mehendi
        order=3
    ),
    
    # Design 4: Elegant Royal Maroon - Lord-supported
    DesignConfig(
        design_id="design_4",
        name="Elegant Royal Maroon",
        description="Rich maroon with golden divine elements",
        event_types=[EventType.ENGAGEMENT, EventType.MARRIAGE, EventType.RECEPTION],
        supports_lord=True,
        background_type="image",
        default_colors={
            "primary": "#800000",  # Maroon
            "secondary": "#B8860B",  # Dark Goldenrod
            "accent": "#CD853F"  # Peru
        },
        preview_image="/designs/preview/design_4.jpg",
        background_image="/designs/backgrounds/royal-maroon-texture.jpg",
        is_default=False,
        order=4
    ),
    
    # Design 5: Pastel Pink Romance - Lord-supported, soft theme
    DesignConfig(
        design_id="design_5",
        name="Pastel Pink Romance",
        description="Soft pink with romantic floral touches",
        event_types=[EventType.ENGAGEMENT, EventType.RECEPTION],
        supports_lord=True,
        background_type="css",
        default_colors={
            "primary": "#FFB6C1",  # Light Pink
            "secondary": "#FF69B4",  # Hot Pink
            "accent": "#FFC0CB"  # Pink
        },
        preview_image="/designs/preview/design_5.jpg",
        css_class="pastel-pink-romance",
        gradient="linear-gradient(135deg, #FFB6C1 0%, #FFC0CB 50%, #FF69B4 100%)",
        is_default=True,  # Default for Engagement
        order=5
    ),
    
    # Design 6: Deep Royal Blue - Lord-supported, regal theme
    DesignConfig(
        design_id="design_6",
        name="Deep Royal Blue",
        description="Majestic blue with silver accents",
        event_types=[EventType.ENGAGEMENT, EventType.MARRIAGE, EventType.RECEPTION],
        supports_lord=True,
        background_type="hybrid",
        default_colors={
            "primary": "#000080",  # Navy Blue
            "secondary": "#4169E1",  # Royal Blue
            "accent": "#C0C0C0"  # Silver
        },
        preview_image="/designs/preview/design_6.jpg",
        css_class="deep-royal-blue",
        background_image="/designs/backgrounds/royal-pattern.png",
        gradient="linear-gradient(135deg, rgba(0,0,128,0.3) 0%, rgba(65,105,225,0.3) 100%)",
        pattern="royal-motif",
        is_default=True,  # Default for Reception
        order=6
    ),
    
    # Design 7: Sunset Orange Glow - No lord support (trendy)
    DesignConfig(
        design_id="design_7",
        name="Sunset Orange Glow",
        description="Warm sunset gradient for modern celebrations",
        event_types=[EventType.HALDI, EventType.MEHENDI, EventType.RECEPTION],
        supports_lord=False,
        background_type="css",
        default_colors={
            "primary": "#FF4500",  # Orange Red
            "secondary": "#FF8C00",  # Dark Orange
            "accent": "#FFD700"  # Gold
        },
        preview_image="/designs/preview/design_7.jpg",
        css_class="sunset-orange",
        gradient="linear-gradient(135deg, #FF4500 0%, #FF8C00 50%, #FFD700 100%)",
        is_default=False,
        order=7
    ),
    
    # Design 8: Emerald Green Elegance - Lord-supported
    DesignConfig(
        design_id="design_8",
        name="Emerald Green Elegance",
        description="Deep emerald with golden divine touches",
        event_types=[EventType.ENGAGEMENT, EventType.MARRIAGE, EventType.RECEPTION],
        supports_lord=True,
        background_type="hybrid",
        default_colors={
            "primary": "#046307",  # Dark Green
            "secondary": "#50C878",  # Emerald
            "accent": "#FFD700"  # Gold
        },
        preview_image="/designs/preview/design_8.jpg",
        css_class="emerald-elegance",
        background_image="/designs/backgrounds/emerald-texture.png",
        gradient="linear-gradient(135deg, rgba(4,99,7,0.2) 0%, rgba(80,200,120,0.2) 100%)",
        pattern="divine-pattern",
        is_default=False,
        order=8
    )
]


def get_all_designs():
    """Get all design configurations"""
    return DESIGN_REGISTRY


def get_designs_by_event_type(event_type: EventType):
    """Get designs filtered by event type"""
    return [design for design in DESIGN_REGISTRY if event_type in design.event_types]


def get_design_by_id(design_id: str):
    """Get specific design by ID"""
    for design in DESIGN_REGISTRY:
        if design.design_id == design_id:
            return design
    return None


def get_default_design_for_event(event_type: EventType):
    """Get the default design for a specific event type"""
    # First, try to find a design marked as default for this event type
    for design in DESIGN_REGISTRY:
        if design.is_default and event_type in design.event_types:
            return design
    
    # Fallback: Return first design that supports this event type
    for design in DESIGN_REGISTRY:
        if event_type in design.event_types:
            return design
    
    # Ultimate fallback: Return first design (should never happen)
    return DESIGN_REGISTRY[0] if DESIGN_REGISTRY else None


def validate_design_for_event(design_id: str, event_type: EventType, show_lord: bool = False):
    """
    Validate if a design is compatible with an event
    
    Rules:
    - Haldi/Mehendi cannot use lord-supported designs if show_lord is True
    - Design must support the event type
    """
    design = get_design_by_id(design_id)
    
    if not design:
        return False, "Design not found"
    
    # Check if design supports this event type
    if event_type not in design.event_types:
        return False, f"Design '{design.name}' does not support {event_type.value} events"
    
    # Check lord decoration compatibility
    if event_type in [EventType.HALDI, EventType.MEHENDI]:
        if show_lord and design.supports_lord:
            return False, f"Design '{design.name}' cannot be used with lord decorations for {event_type.value} events"
    
    return True, "Valid"


# Event type to default design mapping (for quick lookup)
DEFAULT_DESIGNS_MAP = {
    EventType.ENGAGEMENT: "design_5",  # Pastel Pink Romance
    EventType.HALDI: "design_2",  # Vibrant Haldi Yellow
    EventType.MEHENDI: "design_3",  # Mehendi Green Magic
    EventType.MARRIAGE: "design_1",  # Royal Temple Gold
    EventType.RECEPTION: "design_6"  # Deep Royal Blue
}
