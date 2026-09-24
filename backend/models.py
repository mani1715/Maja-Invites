from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from typing import Optional, List, Dict, Literal, Any
from datetime import datetime, timezone, timedelta
from enum import Enum
import uuid
import re
from theme_constants import THEME_IDS, DEFAULT_THEME, is_valid_theme


def _allowed_design_ids_for_category(category: Optional[str]) -> set:
    """Return the set of valid design_ids for a given invitation category.

    Wedding (default) → THEME_IDS allowlist.
    Non-wedding categories → category-specific design ids (from
    invitation_categories.get_designs) UNION the wedding THEME_IDS (back-compat:
    the frontend currently sends a wedding theme + a separate
    design_selections[category] mapping for non-wedding flows).
    """
    cat = (category or 'wedding').lower()
    if cat == 'wedding':
        return set(THEME_IDS)
    try:
        from invitation_categories import get_category_designs  # local import — avoid cycle
        category_ids = {d.get('design_id') or d.get('id') for d in get_category_designs(cat)}
        category_ids.discard(None)
    except Exception:
        category_ids = set()
    return category_ids | set(THEME_IDS)


class EventType(str, Enum):
    """PHASE 13: Marriage-specific event types only"""
    ENGAGEMENT = "engagement"
    HALDI = "haldi"
    MEHENDI = "mehendi"
    SANGEET = "sangeet"
    MARRIAGE = "marriage"
    RECEPTION = "reception"


class EventBackgroundConfig(BaseModel):
    """Event-specific background configuration with dual-layer support"""
    hero_background_id: Optional[str] = None  # Hero/Top section background
    scroll_background_id: Optional[str] = None  # Scroll/Body section background
    background_type: Optional[str] = None  # lord, trendy, royal (legacy field)
    background_id: Optional[str] = None  # Specific background identifier (legacy field)


class DesignConfig(BaseModel):
    """PHASE 22: Premium background design configuration"""
    design_id: str  # Unique identifier (e.g., "design_1", "design_2")
    name: str  # Display name (e.g., "Royal Temple Gold")
    description: Optional[str] = None  # Short description
    event_types: List[EventType]  # Which event types support this design
    supports_lord: bool  # Whether design works with lord decorations
    background_type: Literal["css", "image", "hybrid"]  # Rendering type
    default_colors: Dict[str, str]  # Default color palette {primary, secondary, accent}
    preview_image: str  # Thumbnail/preview image URL
    css_class: Optional[str] = None  # CSS class for css/hybrid types
    background_image: Optional[str] = None  # Background image URL for image/hybrid types
    gradient: Optional[str] = None  # CSS gradient for css types
    pattern: Optional[str] = None  # Pattern overlay for hybrid types
    is_default: bool = False  # Whether this is the default for an event type
    order: int = 0  # Display order


class DesignConfigResponse(BaseModel):
    """Response model for design configurations"""
    designs: List[DesignConfig]
    total: int


class UpdateEventBackgroundRequest(BaseModel):
    """PHASE 22: Request to update event background design"""
    background_design_id: str
    background_type: Literal["css", "image", "hybrid"]
    color_palette: Dict[str, str]  # {primary, secondary, accent}


class LordLibrary(BaseModel):
    """PHASE 23: Lord Image Library
    
    Centralized library of lord/deity images with metadata.
    Defines which events can use each lord image.
    """
    lord_id: str  # Unique identifier (e.g., 'ganesha', 'venkateswara_padmavati')
    name: str  # Display name (e.g., 'Lord Ganesha')
    description: Optional[str] = None  # Short description of the deity
    image_webp: str  # Path to WebP image (desktop)
    image_webp_mobile: str  # Path to WebP image (mobile)
    image_png_fallback: str  # Path to PNG fallback image
    thumbnail: str  # Path to thumbnail image
    allowed_events: List[EventType]  # Events where this lord can be displayed
    default_position: str = "center"  # Default positioning (center, top-center, etc.)
    is_default: bool = False  # Whether this is the default lord (Ganesha)
    order: int = 0  # Display order in admin selection


class LordLibraryResponse(BaseModel):
    """Response model for lord library"""
    lords: List[LordLibrary]
    total: int


class UpdateEventLordSettingsRequest(BaseModel):
    """PHASE 23: Request to update event lord settings"""
    lord_enabled: bool
    lord_id: Optional[str] = None  # Lord ID from LordLibrary
    lord_display_mode: Literal["hero_only", "section_based"] = "hero_only"
    lord_visibility_duration: int = 2  # Duration in seconds (1-10)
    
    @field_validator('lord_visibility_duration')
    def validate_duration(cls, v):
        """Validate duration is between 1 and 10 seconds"""
        if v < 1 or v > 10:
            raise ValueError('lord_visibility_duration must be between 1 and 10 seconds')
        return v


# ==========================================
# PHASE 34: DESIGN SYSTEM & THEME ENGINE
# ==========================================

class ThemeSettings(BaseModel):
    """
    PHASE 34: Premium theme settings for design system
    Controlled customization within locked master themes
    """
    theme_id: str = "royal_heritage"  # Selected master theme
    animation_level: Literal["none", "subtle", "festive"] = "subtle"  # Animation intensity
    glassmorphism_enabled: bool = True  # Glass effect for cards
    color_overrides: Dict[str, str] = Field(default_factory=dict)  # Optional color customization (limited)
    hero_type: Literal["static", "video", "animated"] = "static"  # Hero section type
    
    @field_validator('theme_id')
    def validate_theme_id(cls, v):
        """Validate theme_id is valid"""
        if not is_valid_theme(v):
            raise ValueError(f'Invalid theme_id. Must be one of: {", ".join(THEME_IDS)}')
        return v


class ThemeUpdateRequest(BaseModel):
    """Request model for updating theme settings"""
    theme_id: str
    animation_level: Optional[Literal["none", "subtle", "festive"]] = None
    glassmorphism_enabled: Optional[bool] = None
    color_overrides: Optional[Dict[str, str]] = None
    hero_type: Optional[Literal["static", "video", "animated"]] = None


class ThemePreviewRequest(BaseModel):
    """Request model for theme preview"""
    theme_id: str
    animation_level: Literal["none", "subtle", "festive"] = "subtle"
    glassmorphism_enabled: bool = True


# ==========================================
    
    
class WeddingEvent(BaseModel):
    """Model for individual wedding event - PHASE 13: Marriage-focused events
    PHASE 17: Enhanced with event-level CMS structure & validation
    """
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: EventType  # PHASE 13: Restricted to marriage events only
    name: str  # Display name (can be custom)
    
    # PHASE 17: Event-Level CMS Structure
    slug: str = Field(default="")  # Unique slug for event (auto-generated if empty)
    enabled: bool = True  # PHASE 17: Enable/disable event (soft delete)
    language_enabled: List[str] = Field(default=["english", "hindi"])  # PHASE 17: Languages enabled for this event
    
    date: str  # yyyy-mm-dd format
    start_time: str  # hh:mm format
    end_time: Optional[str] = None  # hh:mm format
    venue_name: str
    venue_address: str
    map_link: str
    description: Optional[str] = Field(None, max_length=500)  # PHASE 13: custom_message
    theme_id: Optional[str] = None  # PHASE 17: Event-specific theme (royal_red, temple_gold, etc.)
    design_preset_id: Optional[str] = None  # PHASE 13: Event-specific design (legacy, use theme_id instead)
    background_config: Optional[EventBackgroundConfig] = None  # PHASE 13 PART 2: Event-specific background
    background_id: Optional[str] = None  # PHASE 17: Primary background identifier
    event_content: Optional[Dict[str, Any]] = {}  # PHASE 17: Event-type specific content fields (validated)
    
    # PHASE 14: Event-specific mandatory fields
    muhurtham_time: Optional[str] = None  # Mandatory for Marriage events (hh:mm format)
    dress_code: Optional[str] = None  # Optional for Reception events
    
    # PHASE 14: Video invitation placeholders (not implemented yet)
    video_invitation_url: Optional[str] = None
    video_invitation_thumbnail: Optional[str] = None
    video_invitation_duration: Optional[int] = None  # Duration in seconds
    
    # PHASE 15: Event Design & Color System
    design_type: Optional[str] = None  # royal_temple, traditional_floral, minimal_divine, etc.
    color_variant: Optional[str] = None  # red, maroon, yellow, gold, orange, cream, pastelPink, royalBlue, deepGreen
    
    # PHASE 18: Event Design System
    phase18_design_id: Optional[str] = None  # design_1 through design_8 from DESIGN_REGISTRY

    # Sprint 8: Smart Venue (per-event)
    latitude: Optional[float] = None         # Drop-pin latitude
    longitude: Optional[float] = None        # Drop-pin longitude
    what3words: Optional[str] = None         # e.g. "filled.count.soap"
    parking_info: Optional[str] = None       # Free-form parking guidance
    # Enhanced Parking Features
    parking_enabled: bool = False            # Enable parking information section
    parking_type: Literal["description", "map_link"] = "description"  # Type of parking info
    parking_description: Optional[str] = None  # Text description for nearby parking
    parking_map_link: Optional[str] = None   # Google Maps link for parking location
    
    # Divine decoration flags - Multi-event requirement
    show_lord: Optional[bool] = True  # Show lord/deity images (showLord)
    show_gantalu: Optional[bool] = True  # Show temple bells (showGantalu)
    show_fire: Optional[bool] = True  # Show fire lamps - dheepalu (showFire)
    
    # PHASE 20: Event-Wise Background Music System
    music_enabled: bool = False  # Enable/disable background music for this event
    music_file: Optional[str] = None  # Path to uploaded music file (mp3 only)
    
    # PHASE 21: Event-Wise Photo Gallery System
    gallery_enabled: bool = False  # Enable/disable photo gallery for this event
    gallery_images: List[Dict[str, Any]] = Field(default_factory=list)  # List of gallery images [{id, image_url, order}]
    
    # PHASE 22: Event-Wise Background & Design Engine
    background_design_id: Optional[str] = None  # Selected premium design ID
    background_type: Optional[Literal["css", "image", "hybrid"]] = None  # Background rendering type
    color_palette: Optional[Dict[str, str]] = None  # {primary, secondary, accent} color values
    
    # PHASE 23: Lord Image Engine & Placement Rules
    lord_enabled: bool = True  # Enable/disable lord image for this event
    lord_id: Optional[str] = None  # Selected lord from LordLibrary (e.g., 'ganesha', 'venkateswara_padmavati')
    lord_display_mode: Literal["hero_only", "section_based"] = "hero_only"  # Display mode: hero_only or section_based (hero + event details)
    lord_visibility_duration: int = 2  # Duration in seconds to show lord in hero section (default: 2)
    
    # PHASE 24: Video & Music Experience
    hero_video_enabled: bool = False  # Enable/disable hero background video
    hero_video_url: Optional[str] = None  # Path to uploaded hero video (MP4/WebM)
    hero_video_thumbnail: Optional[str] = None  # Auto-generated thumbnail from first frame
    message_video_enabled: bool = False  # Enable/disable message video (bride/groom video)
    message_video_url: Optional[str] = None  # Path to uploaded message video (MP4/WebM, max 30s recommended)
    background_music_enabled: bool = False  # Enable/disable background music
    background_music_url: Optional[str] = None  # Path to uploaded background music (MP3, max 5MB)
    
    # PHASE 25: Guest Engagement Engine
    wishes_enabled: bool = True  # Enable/disable guest wishes for this event
    reactions_enabled: bool = True  # Enable/disable guest reactions for this event
    countdown_enabled: bool = True  # Enable/disable countdown widget for this event
    
    # PHASE 32: Security & Access Control
    visibility_mode: Literal["public", "unlisted", "private"] = "public"  # Event visibility mode
    access_passcode_hash: Optional[str] = None  # Hashed passcode for private events (4-6 digits)
    
    visible: bool = True
    order: int = 0
    
    @field_validator('slug')
    def validate_slug(cls, v, info):
        """PHASE 17: Auto-generate slug if not provided"""
        if not v or v.strip() == "":
            # Auto-generate slug from event_type and short uuid
            event_type = info.data.get('event_type', '')
            event_id = info.data.get('event_id', str(uuid.uuid4()))
            # Use event_type + first 8 chars of event_id
            short_id = event_id[:8] if isinstance(event_id, str) else str(event_id)[:8]
            v = f"{event_type}-{short_id}".lower()
        
        # Validate slug format (lowercase, alphanumeric, hyphens only)
        if not re.match(r'^[a-z0-9-]+$', v):
            raise ValueError('Slug must contain only lowercase letters, numbers, and hyphens')
        
        return v
    
    @field_validator('language_enabled')
    def validate_language_enabled(cls, v):
        """PHASE 17: Validate language_enabled contains valid language codes"""
        if not v or len(v) == 0:
            raise ValueError('At least one language must be enabled for the event')
        
        # Allowed languages: english, hindi, telugu, tamil, kannada, malayalam
        allowed_languages = ['english', 'hindi', 'telugu', 'tamil', 'kannada', 'malayalam']
        
        for lang in v:
            if lang not in allowed_languages:
                raise ValueError(f'Invalid language code: {lang}. Must be one of: {", ".join(allowed_languages)}')
        
        # English is mandatory as fallback
        if 'english' not in v:
            raise ValueError('English is mandatory and must be included in language_enabled')
        
        return v
    
    @field_validator('description')
    def validate_description(cls, v):
        """Validate description max length"""
        if v and len(v) > 500:
            raise ValueError('Description must be 500 characters or less')
        return v
    
    @field_validator('event_type', mode='before')
    def validate_event_type(cls, v):
        """Ensure event_type is valid"""
        if isinstance(v, str):
            v = v.lower()
            if v not in ['engagement', 'haldi', 'mehendi', 'marriage', 'reception']:
                raise ValueError(f'Event type must be one of: engagement, haldi, mehendi, marriage, reception')
        return v
    
    @field_validator('show_lord', 'show_gantalu', 'show_fire')
    def validate_decorations(cls, v, info):
        """Validate decoration flags based on event type
        
        Rules:
        - Engagement, Marriage, Reception: Can have all decorations
        - Haldi, Mehendi: Cannot have lord, gantalu, or fire decorations
        """
        event_type = info.data.get('event_type')
        field_name = info.field_name
        
        if event_type:
            # Handle both enum and string
            if hasattr(event_type, 'value'):
                event_type_lower = event_type.value.lower()
            else:
                event_type_lower = str(event_type).lower()
            
            # Haldi and Mehendi cannot have divine decorations
            if event_type_lower in ['haldi', 'mehendi']:
                if v is True:
                    # Force to False for Haldi/Mehendi
                    return False
        
        return v
    
    @field_validator('lord_enabled', 'lord_id')
    def validate_lord_settings(cls, v, info):
        """PHASE 23: Validate lord settings based on event type
        
        Rules:
        - Engagement, Marriage, Reception: Lord allowed
        - Haldi, Mehendi: Lord forced disabled
        - Auto-disable if event changes to haldi/mehendi
        """
        event_type = info.data.get('event_type')
        field_name = info.field_name
        
        if event_type:
            # Handle both enum and string
            if hasattr(event_type, 'value'):
                event_type_lower = event_type.value.lower()
            else:
                event_type_lower = str(event_type).lower()
            
            # Haldi and Mehendi cannot have lord images
            if event_type_lower in ['haldi', 'mehendi']:
                if field_name == 'lord_enabled' and v is True:
                    # Force to False for Haldi/Mehendi
                    return False
                elif field_name == 'lord_id' and v is not None:
                    # Force to None for Haldi/Mehendi
                    return None
        
        return v
    
    @field_validator('lord_visibility_duration')
    def validate_lord_duration(cls, v):
        """PHASE 23: Validate lord visibility duration"""
        if v < 1 or v > 10:
            raise ValueError('lord_visibility_duration must be between 1 and 10 seconds')
        return v
    
    @field_validator('muhurtham_time')
    def validate_muhurtham_time(cls, v, info):
        """PHASE 14: Muhurtham time is mandatory for Marriage events"""
        event_type = info.data.get('event_type')
        
        if event_type:
            # Handle both enum and string
            if hasattr(event_type, 'value'):
                event_type_lower = event_type.value.lower()
            else:
                event_type_lower = str(event_type).lower()
            
            # Muhurtham time is mandatory for Marriage events
            if event_type_lower == 'marriage' and not v:
                raise ValueError('Muhurtham time is mandatory for Marriage events')
        
        # Validate time format if provided
        if v:
            import re
            if not re.match(r'^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$', v):
                raise ValueError('Muhurtham time must be in HH:MM format')
        
        return v
    
    @field_validator('event_content')
    def validate_event_content(cls, v, info):
        """PHASE 17: Enhanced validation for event-type specific mandatory fields"""
        event_type = info.data.get('event_type')
        
        if not event_type or not isinstance(v, dict):
            return v
        
        event_type_lower = event_type.lower() if isinstance(event_type, str) else str(event_type).lower()
        
        # PHASE 17: Comprehensive validation rules based on event type
        if event_type_lower == 'engagement':
            # Engagement: Bride & Groom names mandatory
            if not v.get('bride_name') or not v.get('groom_name'):
                raise ValueError('Engagement events must have both bride_name and groom_name in event_content')
            
            # Optional fields for engagement: parents_blessing, ring_ceremony_time
            if 'ring_ceremony_time' in v and v['ring_ceremony_time']:
                # Validate time format if provided
                if not re.match(r'^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$', v['ring_ceremony_time']):
                    raise ValueError('ring_ceremony_time must be in HH:MM format')
        
        elif event_type_lower == 'haldi':
            # Haldi: Bride side & Groom side names mandatory
            if not v.get('bride_side_name') or not v.get('groom_side_name'):
                raise ValueError('Haldi events must have both bride_side_name and groom_side_name in event_content')
            
            # Optional fields for haldi: ceremony_details, traditional_customs
        
        elif event_type_lower == 'mehendi':
            # Mehendi: Bride name mandatory
            if not v.get('bride_name'):
                raise ValueError('Mehendi events must have bride_name in event_content')
            
            # Optional fields for mehendi: artist_name, design_style
        
        elif event_type_lower == 'marriage':
            # Marriage: Both bride and groom names mandatory
            if not v.get('bride_full_name') or not v.get('groom_full_name'):
                raise ValueError('Marriage events must have both bride_full_name and groom_full_name in event_content')
            
            # Muhurtham time validation is handled by separate validator
            # Optional fields: vedic_ceremony_details, mantras, rituals
        
        elif event_type_lower == 'reception':
            # Reception: Host names mandatory (can be couple or families)
            if not v.get('hosted_by'):
                raise ValueError('Reception events must have hosted_by field in event_content')
            
            # Optional fields for reception: dinner_menu, entertainment_schedule
        
        return v


class EventInvitation(BaseModel):
    """Model for event-specific invitation links
    
    Allows ONE profile to create MULTIPLE event-specific invitation links.
    Each event type (Engagement, Haldi, Mehendi, Marriage, Reception) gets its own invitation page.
    """
    model_config = ConfigDict(extra="ignore", use_enum_values=True)
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str  # Reference to parent profile
    event_type: EventType  # One of: engagement, haldi, mehendi, marriage, reception
    design_id: str = DEFAULT_THEME  # Design theme for this event invitation
    deity_id: Optional[str] = None  # Deity background (null for Haldi/Mehendi as per rules)
    enabled: bool = True  # Can disable without deleting
    # Expiry / lifecycle
    expires_at: Optional[datetime] = None  # When this link auto-disables (default: event_date + 7d on the parent profile)
    expired: bool = False  # True after the cleanup job has processed expiry
    media_purged: bool = False  # True once associated photos/QR have been deleted
    purged_at: Optional[datetime] = None  # Timestamp of media purge
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_validator('deity_id')
    def validate_deity_id(cls, v, info):
        """Validate deity_id based on event_type rules"""
        if v is not None:
            allowed_deities = ['ganesha', 'venkateswara_padmavati', 'shiva_parvati', 'lakshmi_vishnu', 'none']
            if v not in allowed_deities:
                raise ValueError(f'deity_id must be one of: {", ".join(allowed_deities)} or null')
        return v
    
    @field_validator('design_id')
    def validate_design_id(cls, v):
        """Validate design_id is one of the allowed theme IDs"""
        if v not in THEME_IDS:
            raise ValueError(f'design_id must be one of: {", ".join(THEME_IDS)}')
        return v


class EventInvitationCreate(BaseModel):
    """Request model for creating event invitation"""
    event_type: EventType
    design_id: str = DEFAULT_THEME
    deity_id: Optional[str] = None
    expires_at: Optional[datetime] = None  # Optional explicit expiry; backend defaults to event_date + 7d
    
    @field_validator('deity_id')
    def validate_deity_for_event_type(cls, v, info):
        """Validate deity_id based on event_type
        
        Rules:
        - Engagement/Marriage/Reception: Allow lord backgrounds
        - Haldi/Mehendi: Disable lord selection (must be null)
        """
        event_type = info.data.get('event_type')
        if event_type in ['haldi', 'mehendi']:
            if v is not None and v != 'none':
                raise ValueError(f'Deity backgrounds not allowed for {event_type} events')
        return v


class EventInvitationUpdate(BaseModel):
    """Request model for updating event invitation"""
    design_id: Optional[str] = None
    deity_id: Optional[str] = None
    enabled: Optional[bool] = None
    expires_at: Optional[datetime] = None


class EventInvitationResponse(BaseModel):
    """Response model for event invitation"""
    id: str
    profile_id: str
    event_type: str
    design_id: str
    deity_id: Optional[str] = None
    enabled: bool
    invitation_link: str  # Generated link: /invite/{slug}/{event_type}
    qr_url: Optional[str] = None  # Public URL the QR code encodes
    qr_image: Optional[str] = None  # data:image/png;base64 PNG payload
    rekognition_collection_id: Optional[str] = None  # AI face-match collection for guest selfies
    expires_at: Optional[datetime] = None
    expired: bool = False
    media_purged: bool = False
    created_at: datetime
    updated_at: datetime


# ==========================================
# PHASE 35: SUPER ADMIN & CREDIT SYSTEM
# ==========================================

class AdminRole(str, Enum):
    """Admin roles for role-based access control"""
    SUPER_ADMIN = "super_admin"  # Platform owner - full control
    ADMIN = "admin"  # Photographer - limited to own data


class AdminStatus(str, Enum):
    """Admin account status"""
    ACTIVE = "active"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"


class WeddingStatus(str, Enum):
    """PHASE 37: Wedding project lifecycle status"""
    DRAFT = "draft"  # Unlimited edits, no credit consumption
    READY = "ready"  # All required fields filled, ready to publish
    PUBLISHED = "published"  # Credits consumed, publicly accessible
    ARCHIVED = "archived"  # Public link disabled, no refunds


class Admin(BaseModel):
    """Enhanced Admin model with role and credit fields"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    password_hash: str
    name: str  # PHASE 35: Admin name
    role: AdminRole = AdminRole.ADMIN  # PHASE 35: Role (super_admin or admin)
    status: AdminStatus = AdminStatus.ACTIVE  # PHASE 35: Account status
    total_credits: int = 0  # PHASE 35: Total credits assigned
    used_credits: int = 0  # PHASE 35: Credits used
    # Loyalty tier — incremented every time the photographer publishes a
    # paid wedding link. Drives the 4-tier discount ladder (Starter/Pro/
    # Elite/Partner) via /api/photographer/me/tier.
    paid_links_count: int = 0
    # Photographer self-signup fields
    username: Optional[str] = None  # Unique handle used for login
    phone: Optional[str] = None  # E.164 phone number (e.g. +919876543210)
    phone_verified: bool = False  # Whether phone OTP has been verified
    self_signup: bool = False  # True if account was created via photographer self-signup
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None  # PHASE 35: Super admin who created this account
    
    @property
    def available_credits(self) -> int:
        """Calculate available credits"""
        return self.total_credits - self.used_credits


class AdminLogin(BaseModel):
    # Accepts either an email or a username in the "email" field for backward compat,
    # OR a dedicated "username_or_email" field when provided by newer clients.
    email: Optional[str] = None
    username_or_email: Optional[str] = None
    password: str
    totp_code: Optional[str] = None


class AdminResponse(BaseModel):
    """Response model for Admin data"""
    id: str
    email: str
    name: str
    role: AdminRole
    status: AdminStatus
    # LEGACY-ROW COMPATIBILITY: the credits system is retired (subscriptions
    # replaced it), but these fields stay in the response shape because old
    # frontend code still reads available_credits. Admin rows inserted as raw
    # dicts (demo-studio seeder, manual/legacy inserts) may LACK these keys —
    # requiring them made /api/auth/me 500 with "Field required" for any such
    # account. Defaults make every consumer of AdminResponse tolerant of
    # pre-credits rows; the /auth/me endpoint additionally backfills the row.
    total_credits: int = 0
    used_credits: int = 0
    available_credits: int = 0
    username: Optional[str] = None
    phone: Optional[str] = None
    phone_verified: bool = False
    created_at: datetime
    created_by: Optional[str] = None


# ==========================================
# Photographer Self-Signup Models
# ==========================================

class PhotographerSignupRequest(BaseModel):
    """Photographer self-signup form"""
    name: str
    username: str
    email: str
    phone: str
    password: str

    @field_validator('email')
    def validate_email(cls, v):
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(pattern, v):
            raise ValueError('Invalid email format')
        return v.lower().strip()

    @field_validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v

    @field_validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()

    @field_validator('username')
    def validate_username(cls, v):
        v = (v or '').strip().lower()
        if not v:
            raise ValueError('Username cannot be empty')
        if not re.match(r'^[a-z0-9_.]{3,30}$', v):
            raise ValueError('Username must be 3-30 chars: lowercase letters, digits, dot, underscore only')
        return v

    @field_validator('phone')
    def validate_phone(cls, v):
        v = (v or '').strip()
        if not re.match(r'^\+[1-9]\d{6,14}$', v):
            raise ValueError('Phone must be E.164 format e.g. +919876543210')
        return v


class OTPSendRequest(BaseModel):
    phone: str
    # Channel-agnostic OTP: 'phone' (SMS) or 'email'. Email is the fallback when
    # SMS can't be delivered, so signup is never a dead-end.
    channel: str = 'phone'
    email: Optional[str] = None

    @field_validator('phone')
    def validate_phone(cls, v):
        v = (v or '').strip()
        if not re.match(r'^\+[1-9]\d{6,14}$', v):
            raise ValueError('Phone must be E.164 format e.g. +919876543210')
        return v


class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str
    channel: str = 'phone'
    email: Optional[str] = None

    @field_validator('otp')
    def validate_otp(cls, v):
        v = (v or '').strip()
        if not re.match(r'^\d{4,8}$', v):
            raise ValueError('OTP must be 4-8 digits')
        return v


class AdminRegister(BaseModel):
    """PHASE 35: Request to create a new Admin (only by Super Admin)"""
    email: str
    password: str
    name: str
    initial_credits: int = 0
    
    @field_validator('email')
    def validate_email(cls, v):
        """Validate email format"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(pattern, v):
            raise ValueError('Invalid email format')
        return v
    
    @field_validator('password')
    def validate_password(cls, v):
        """Validate password strength"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v
    
    @field_validator('name')
    def validate_name(cls, v):
        """Validate name is not empty"""
        if not v or not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()
    
    @field_validator('initial_credits')
    def validate_initial_credits(cls, v):
        """Validate initial credits is non-negative"""
        if v < 0:
            raise ValueError('Initial credits cannot be negative')
        return v


# The super-admin credit ledger lived here: CreditActionType, CreditLedger,
# CreditLedgerResponse, AddCreditsRequest, DeductCreditsRequest and
# CreditBalanceResponse. Every route that used them was deleted with the
# credit system; the classes stayed only because server.py still named them
# in an import list, and an unused model never fails a test.


class SectionsEnabled(BaseModel):
    opening: bool = True
    welcome: bool = True
    couple: bool = True
    about: bool = False  # About couple section
    family: bool = False  # Family details section
    love_story: bool = False  # Love story section
    photos: bool = True
    video: bool = False
    events: bool = True
    rsvp: bool = False  # RSVP section (default DISABLED)
    greetings: bool = True  # Greetings/Wishes wall (default ENABLED)
    footer: bool = True
    contact: bool = False  # PHASE 11: Contact information section
    calendar: bool = False  # PHASE 11: Add to calendar feature
    countdown: bool = False  # PHASE 11: Event countdown
    qr: bool = False  # PHASE 11: QR code display
    decorative_effects: bool = True  # PHASE 17: Master toggle for all decorative effects (lord, bells, lamps, flowers)
    guest_rooms: bool = True  # Find My Room (Guest accommodation lookup)
    pre_wedding: bool = True  # Pre-wedding shoot links section
    # Bucket 1A — new guest-engagement sections
    live_stream: bool = False  # Live stream link / embed
    live_timeline: bool = False  # Live event timeline (NOW / NEXT badges)
    song_requests: bool = False  # Guest song requests form
    dress_code: bool = False  # Dress code carousel
    check_in: bool = False  # Guest check-in
    closing: bool = True  # Closing sign-off (custom text + signature + animation)


class GuestRoom(BaseModel):
    """Guest accommodation/room assignment for the wedding."""
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    guest_name: str  # Required, used for partial search
    phone: Optional[str] = None  # Optional phone for additional matching
    room_number: Optional[str] = None  # e.g., "201", "Suite A"
    building: Optional[str] = None  # e.g., "Block B", "Hotel Taj"
    floor: Optional[str] = None  # e.g., "2nd Floor"
    address: Optional[str] = None  # Address for map embed
    map_link: Optional[str] = None  # Optional Google Maps link override
    check_in: Optional[str] = None  # e.g., "25 Dec, 2 PM" - free-text
    check_out: Optional[str] = None  # e.g., "27 Dec, 11 AM"
    notes: Optional[str] = None  # e.g., "Breakfast at 8 AM"

    @field_validator('guest_name')
    def _trim_name(cls, v):
        if v is None or not str(v).strip():
            raise ValueError('guest_name is required')
        return str(v).strip()


class PreWeddingLink(BaseModel):
    """Pre-wedding shoot link (Google Drive / YouTube / etc.)"""
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str  # e.g., "Pre-Wedding Video", "Drive Photos"
    url: str  # The actual URL
    # 'video' (YouTube/Vimeo to embed) | 'link' (button card) | 'auto' (detect)
    kind: Optional[str] = "auto"

    @field_validator('label')
    def _trim_label(cls, v):
        if v is None or not str(v).strip():
            raise ValueError('label is required')
        return str(v).strip()[:80]

    @field_validator('url')
    def _validate_url(cls, v):
        if not v or not str(v).strip():
            raise ValueError('url is required')
        s = str(v).strip()
        if not (s.startswith('http://') or s.startswith('https://')):
            raise ValueError('url must start with http:// or https://')
        return s


class SEOSettings(BaseModel):
    """PHASE 31: SEO and Social Sharing settings"""
    seo_enabled: bool = True  # Enable SEO indexing
    social_sharing_enabled: bool = True  # Enable social sharing buttons
    custom_description: Optional[str] = None  # Custom SEO description (max 160 chars)
    
    @field_validator('custom_description')
    def validate_custom_description(cls, v):
        """Validate custom description max length"""
        if v and len(v) > 160:
            raise ValueError('Custom SEO description must be 160 characters or less')
        return v


class BackgroundMusic(BaseModel):
    enabled: bool = False
    file_url: Optional[str] = None


class MapSettings(BaseModel):
    embed_enabled: bool = False  # Default OFF (safe default)
    # Sprint 8: Smart Venue (main venue level)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    map_link: Optional[str] = None
    what3words: Optional[str] = None
    parking_info: Optional[str] = None


class ContactInfo(BaseModel):
    """PHASE 11: Contact information for the wedding"""
    groom_phone: Optional[str] = None  # Groom family phone
    bride_phone: Optional[str] = None  # Bride family phone
    emergency_phone: Optional[str] = None  # Emergency contact
    email: Optional[str] = None  # Contact email
    
    @field_validator('groom_phone', 'bride_phone', 'emergency_phone')
    def validate_phone(cls, v):
        """Validate phone number is in E.164 format"""
        if v is not None and v.strip():
            pattern = r'^\+[1-9]\d{1,14}$'
            if not re.match(pattern, v):
                raise ValueError('Phone number must be in E.164 format (e.g., +919876543210)')
        return v


# Phase 1C — RSVP Settings (couple controls which fields show on guest RSVP form)
class RSVPSettings(BaseModel):
    """Granular toggles for the public RSVP form fields."""
    model_config = ConfigDict(extra="ignore")

    # Dietary preferences
    dietary_enabled: bool = False
    dietary_show_veg: bool = True
    dietary_show_nonveg: bool = True
    dietary_show_vegan: bool = True
    dietary_show_jain: bool = True
    # Allergies text field
    allergies_enabled: bool = False
    # Plus-one toggle
    plus_one_enabled: bool = False
    # Kids attending field
    kids_enabled: bool = False


# Phase 1H — Honeymoon Fund (simple UPI/QR display, no Razorpay charge)
class HoneymoonFund(BaseModel):
    """Honeymoon fund — display UPI ID and/or QR image for direct contributions."""
    model_config = ConfigDict(extra="ignore")

    enabled: bool = False
    title: str = "Honeymoon Fund"
    message: str = "If you wish to bless our new beginnings, you may contribute below."
    upi_id: Optional[str] = None  # e.g. couple@upi
    payee_name: Optional[str] = None  # Name shown in UPI app
    qr_image_url: Optional[str] = None  # Optional custom QR image URL
    show_progress: bool = False  # Toggle progress bar
    goal_amount: Optional[int] = None  # Goal in INR (for progress bar)
    raised_amount: int = 0  # Amount raised so far (manual update by couple)


# Bucket 1A — Live Stream (YouTube/Zoom/Meet link)
class LiveStreamSettings(BaseModel):
    """Live streaming link for remote guests."""
    model_config = ConfigDict(extra="ignore")

    enabled: bool = False
    url: Optional[str] = None              # YouTube / Zoom / Meet URL
    platform: Optional[str] = None         # youtube | zoom | meet | facebook | other
    scheduled_at: Optional[datetime] = None  # When the stream begins (optional)
    message: Optional[str] = None          # Optional couple's note ("Join us from anywhere")
    embed_enabled: bool = True             # If true, attempt to inline-embed (YouTube)


# Bucket 1A — Song Request settings (whether guests can submit songs)
class SongRequestSettings(BaseModel):
    """Toggle and limits for guest song requests."""
    model_config = ConfigDict(extra="ignore")

    enabled: bool = False
    max_per_guest: int = 3                 # Max requests per guest_name+phone
    default_provider: Optional[str] = None  # spotify | youtube | apple | none
    intro_message: Optional[str] = "Help us build the night's playlist."


# Bucket 1A — Dress Code carousel (per-event or general)
class DressCodeItem(BaseModel):
    """Single dress-code card."""
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str                              # e.g. "Mehendi — Yellow"
    color: Optional[str] = None             # Hex / colour name
    image_url: Optional[str] = None         # Optional outfit reference image
    event_type: Optional[str] = None        # haldi | mehendi | marriage | reception | engagement
    notes: Optional[str] = None             # Short note (max 200 chars)

    @field_validator('notes')
    def _validate_notes(cls, v):
        if v is not None and len(v) > 200:
            raise ValueError('Notes must be 200 characters or less')
        return v


class DressCodeSettings(BaseModel):
    """Carousel of dress codes per event."""
    model_config = ConfigDict(extra="ignore")

    enabled: bool = False
    title: str = "Dress Code"
    items: List[DressCodeItem] = Field(default_factory=list)


# Bucket 1A — Song Request document (per-guest submission)
class SongRequest(BaseModel):
    """A single song suggestion submitted by a guest."""
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    guest_name: str
    guest_phone: Optional[str] = None
    song_title: str
    artist: Optional[str] = None
    provider_url: Optional[str] = None      # Optional Spotify/YT link
    message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator('song_title')
    def _validate_song_title(cls, v):
        if not v or not v.strip():
            raise ValueError('song_title is required')
        if len(v) > 120:
            raise ValueError('song_title must be 120 characters or less')
        return v.strip()

    @field_validator('artist')
    def _validate_artist(cls, v):
        if v is not None and len(v) > 80:
            raise ValueError('artist must be 80 characters or less')
        return v

    @field_validator('message')
    def _validate_msg(cls, v):
        if v is not None and len(v) > 200:
            raise ValueError('message must be 200 characters or less')
        return v


class SongRequestCreate(BaseModel):
    guest_name: str
    guest_phone: Optional[str] = None
    song_title: str
    artist: Optional[str] = None
    provider_url: Optional[str] = None
    message: Optional[str] = None

    @field_validator('guest_name')
    def _validate_guest_name(cls, v):
        if not v or not v.strip():
            raise ValueError('guest_name is required')
        return v.strip()

    @field_validator('song_title')
    def _validate_song_title(cls, v):
        if not v or not v.strip():
            raise ValueError('song_title is required')
        if len(v) > 120:
            raise ValueError('song_title must be 120 characters or less')
        return v.strip()

    @field_validator('provider_url')
    def _validate_url(cls, v):
        if v is None or not str(v).strip():
            return None
        s = str(v).strip()
        if not (s.startswith('http://') or s.startswith('https://')):
            raise ValueError('provider_url must start with http:// or https://')
        return s


class SongRequestResponse(BaseModel):
    id: str
    guest_name: str
    song_title: str
    artist: Optional[str] = None
    provider_url: Optional[str] = None
    message: Optional[str] = None
    created_at: datetime


# Bucket 1A — Guest Check-In (event arrival log)
class CheckIn(BaseModel):
    """A guest's check-in at the venue (or per event)."""
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    event_id: Optional[str] = None          # Optional WeddingEvent.event_id
    guest_name: str
    guest_phone: Optional[str] = None
    note: Optional[str] = None
    source: str = "web"                     # web | qr | manual
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator('guest_name')
    def _vn(cls, v):
        if not v or not v.strip():
            raise ValueError('guest_name is required')
        return v.strip()[:80]


class CheckInCreate(BaseModel):
    guest_name: str
    guest_phone: Optional[str] = None
    event_id: Optional[str] = None
    note: Optional[str] = None
    source: Optional[str] = "web"

    @field_validator('guest_name')
    def _v(cls, v):
        if not v or not v.strip():
            raise ValueError('guest_name is required')
        return v.strip()


class CheckInResponse(BaseModel):
    id: str
    guest_name: str
    event_id: Optional[str] = None
    created_at: datetime


class CheckInStats(BaseModel):
    total_check_ins: int
    per_event: Dict[str, int] = Field(default_factory=dict)


class Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    admin_id: str  # PHASE 35: Owner admin/photographer ID (for data isolation)
    slug: str  # Unique link identifier (legacy random slug; still the internal key)
    # Sequential PUBLIC invitation number (1, 2, 3, …) rendered zero-padded in the
    # canonical URL /invite/00001/<name>. Assigned atomically at creation; Optional
    # so legacy rows without it still validate. It is a PUBLIC id — never used to
    # gate access (the resolver enforces published+active).
    invite_no: Optional[int] = None
    name_slug: Optional[str] = None  # cosmetic URL slug of the event name; nothing resolves on it
    groom_name: str
    bride_name: str
    event_type: str  # marriage, engagement, birthday
    event_date: datetime
    venue: str
    city: Optional[str] = None  # City/location
    invitation_message: Optional[str] = None  # Short welcome message (max 200 chars)
    language: List[str]  # telugu, hindi, tamil, english - multiple languages supported
    design_id: str = DEFAULT_THEME  # Selected design theme
    deity_id: Optional[str] = None  # Selected deity: ganesha, venkateswara_padmavati, shiva_parvati, lakshmi_vishnu, none
    whatsapp_groom: Optional[str] = None  # Groom WhatsApp number in E.164 format
    whatsapp_bride: Optional[str] = None  # Bride WhatsApp number in E.164 format
    enabled_languages: List[str] = Field(default=["english"])  # Languages enabled for this invitation
    custom_text: Dict[str, Dict[str, Any]] = Field(default_factory=dict)  # Custom text overrides {language: {section: text}}
    translations: Dict[str, Dict[str, Any]] = Field(default_factory=dict)  # AI translations {language: {field: text}} — must be declared or extra="ignore" drops it
    about_couple: Optional[str] = None  # Rich text HTML for about couple section
    family_details: Optional[str] = None  # Rich text HTML for family details
    love_story: Optional[str] = None  # Rich text HTML for love story
    # Bride & Groom individual sections (rendered as photo+info on public page)
    bride_photo_url: Optional[str] = None
    groom_photo_url: Optional[str] = None
    bride_about: Optional[str] = None  # Short bio (~ 1 paragraph)
    groom_about: Optional[str] = None
    couple_about: Optional[str] = None  # Joint couple story
    nakshatram: Optional[str] = None
    muhurtam: Optional[str] = None
    couple_photo_url: Optional[str] = None  # Optional explicit couple photo override
    show_couple_photo: bool = True
    show_bride_photo: bool = True
    show_groom_photo: bool = True
    cover_photo_id: Optional[str] = None  # ID of media item to use as cover photo
    # QR / invitation background customization
    use_couple_photo_as_qr_bg: bool = True  # When True, QR uses cover_photo_id as background
    use_couple_photo_as_invitation_bg: bool = True  # When True, invitation uses cover_photo_id as page background
    qr_background_media_id: Optional[str] = None  # Optional override media id for QR background (when toggle is off)
    invitation_background_media_id: Optional[str] = None  # Optional override media id for invitation page background
    # Opening (link-open) animation background — Feb 2026
    use_couple_photo_as_opening_bg: bool = True  # When True, opening zoom-in uses couple_photo_url
    opening_bg_source: Optional[str] = 'couple'  # 'couple' | 'bride' | 'groom' | 'custom'
    opening_photo_url: Optional[str] = None  # Custom upload when opening_bg_source == 'custom'
    sections_enabled: SectionsEnabled = Field(default_factory=SectionsEnabled)
    # Host-editable presentation overrides. The design template supplies the
    # defaults; these let a host personalise without commissioning a new design
    # (the previous product had them and the rebuild dropped them).
    accent_color: Optional[str] = Field(default=None, max_length=32)
    closing_text: Optional[str] = Field(default=None, max_length=600)
    closing_signature: Optional[str] = Field(default=None, max_length=160)
    closing_animation_id: Optional[str] = Field(default=None, max_length=64)
    seo_settings: SEOSettings = Field(default_factory=SEOSettings)  # PHASE 31: SEO and social sharing settings
    background_music: BackgroundMusic = Field(default_factory=BackgroundMusic)  # Optional background music
    map_settings: MapSettings = Field(default_factory=MapSettings)  # Map embed settings
    contact_info: ContactInfo = Field(default_factory=ContactInfo)  # PHASE 11: Contact information
    rsvp_settings: RSVPSettings = Field(default_factory=RSVPSettings)  # Phase 1C: RSVP form field toggles
    honeymoon_fund: HoneymoonFund = Field(default_factory=HoneymoonFund)  # Phase 1H: Honeymoon fund
    # Bucket 1A — guest engagement settings
    live_stream: LiveStreamSettings = Field(default_factory=LiveStreamSettings)
    song_requests_settings: SongRequestSettings = Field(default_factory=SongRequestSettings)
    dress_code_settings: DressCodeSettings = Field(default_factory=DressCodeSettings)
    events: List[WeddingEvent] = Field(default_factory=list)  # Wedding events schedule
    # Guest Accommodation & Pre-wedding Shoot
    guest_rooms: List[GuestRoom] = Field(default_factory=list)  # Guest room assignments
    pre_wedding_links: List[PreWeddingLink] = Field(default_factory=list)  # Pre-wedding shoot links
    link_expiry_type: str  # hours, days, permanent
    link_expiry_value: Optional[int] = None  # number of hours/days
    link_expiry_date: Optional[datetime] = None  # calculated expiry date
    expires_at: Optional[datetime] = None  # PHASE 12: Invitation expiry date (default: event_date + 7 days)
    # Enhanced Link Expiry & Lifecycle
    expiry_days: Optional[int] = None  # Number of days before link expires
    auto_delete_photos: bool = False  # Auto-delete photos after expiry
    # Digital Shagun (Wedding Gift)
    digital_shagun_enabled: bool = False  # Enable digital gift collection
    phonepe_upi_id: Optional[str] = None  # PhonePe UPI ID
    phonepe_qr_code: Optional[str] = None  # PhonePe QR code image URL
    # Audit & Analytics
    view_count: int = 0  # Total number of views
    unique_visitors: int = 0  # Unique visitors count
    last_viewed_at: Optional[datetime] = None  # Last view timestamp
    is_template: bool = False  # Template flag - indicates if this profile is a reusable template
    is_active: bool = True
    # PHASE 33: Monetization & Premium Plans
    plan_type: str = "FREE"  # FREE, SILVER, GOLD, PLATINUM
    plan_expires_at: Optional[datetime] = None  # Plan expiry date (None for FREE or permanent)
    # PHASE 34: Design System & Theme Engine
    theme_settings: ThemeSettings = Field(default_factory=ThemeSettings)  # Premium theme configuration
    # PHASE 37: Wedding Ownership, Draft System & Publish Workflow
    title: str = ""  # Wedding title for admin dashboard
    status: WeddingStatus = WeddingStatus.DRAFT  # Lifecycle status
    selected_design_key: str = DEFAULT_THEME  # Same as design_id, for consistency
    selected_features: List[str] = Field(default_factory=list)  # Enabled feature keys
    total_credit_cost: int = 0  # Calculated credit cost (set on publish)
    published_at: Optional[datetime] = None  # Timestamp when published
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # ============================================================
    # 2026 — Universal Invitation Categories
    # ------------------------------------------------------------
    # `invitation_category` lets a single profile represent any of:
    #   wedding | baby_birthday | half_saree | puberty | dhoti
    # Wedding (default) keeps all existing logic untouched.
    # For non-wedding categories the photographer also supplies a
    # `celebrant_info` dict (baby/girl/boy name, parents, story…).
    # ============================================================
    invitation_category: str = "wedding"
    celebrant_info: Optional[Dict[str, Any]] = None
    # Guest FAQ accordion. The cart collects the buyer's Q&A in
    # order.info.extra.faq and the invitation has had a FaqSection component all
    # along, but nothing ever carried one to the other: Profile had no field, so
    # `Profile(**data)` dropped it, and InvitationPublicView never exposed it —
    # the accordion could not render for ANY invitation. Shape:
    #   {"enabled": bool, "title": str, "items": [{"q": str, "a": str}]}
    faq_settings: Optional[Dict[str, Any]] = None
    # Per-event design pick from the master catalogue, e.g.
    # {"hero": "temple_engagement_2"} — the design the BUYER chose and paid for.
    # This field was missing while ProfileCreate, ProfileUpdate and
    # InvitationPublicView all carried it, so `Profile(**data)` silently dropped
    # it (model_config extra="ignore"): the create route passed design_selections
    # in, it never persisted, and the public page fell back to the theme's first
    # design for EVERY invitation. Defaults to {} so existing profiles are
    # unaffected and keep resolving exactly as before.
    design_selections: Dict[str, str] = Field(default_factory=dict)

    @field_validator('invitation_message')
    def validate_invitation_message(cls, v):
        """Validate invitation message max length"""
        if v and len(v) > 200:
            raise ValueError('Invitation message must be 200 characters or less')
        return v
    
    @field_validator('events')
    def validate_events(cls, v):
        """PHASE 17: Enhanced validation for events list"""
        if v is not None:
            if len(v) > 7:
                raise ValueError('Maximum 7 events allowed')
            
            # Check at least one visible event
            visible_events = [e for e in v if e.visible]
            if len(v) > 0 and len(visible_events) == 0:
                raise ValueError('At least one event must be visible')
            
            # PHASE 17: Prevent duplicate event types per profile
            event_types_seen = set()
            for event in v:
                event_type = event.event_type
                if isinstance(event_type, str):
                    event_type_lower = event_type.lower()
                else:
                    event_type_lower = str(event_type).lower()
                
                if event_type_lower in event_types_seen:
                    raise ValueError(f'Duplicate event type detected: {event_type}. Each profile can only have one event of each type.')
                
                event_types_seen.add(event_type_lower)
        
        return v
    
    @field_validator('whatsapp_groom', 'whatsapp_bride')
    def validate_whatsapp_number(cls, v):
        """Validate WhatsApp number is in E.164 format"""
        if v is not None and v.strip():
            pattern = r'^\+[1-9]\d{1,14}$'
            if not re.match(pattern, v):
                raise ValueError('WhatsApp number must be in E.164 format (e.g., +919876543210)')
        return v
    
    @model_validator(mode='after')
    def validate_design_id(self):
        """Validate design_id against this profile's invitation_category."""
        allowed = _allowed_design_ids_for_category(self.invitation_category)
        if self.design_id not in allowed:
            raise ValueError(
                f'design_id "{self.design_id}" is not valid for category '
                f'"{self.invitation_category or "wedding"}".'
            )
        return self
    
    @field_validator('deity_id')
    def validate_deity_id(cls, v):
        """Validate deity_id is one of the allowed values"""
        if v is not None:
            allowed_deities = ['ganesha', 'venkateswara_padmavati', 'shiva_parvati', 'lakshmi_vishnu', 'none']
            if v not in allowed_deities:
                raise ValueError(f'deity_id must be one of: {", ".join(allowed_deities)} or null')
        return v
    
    @field_validator('enabled_languages')
    def validate_enabled_languages(cls, v):
        """Validate at least one language is enabled and English is always included"""
        if not v or len(v) == 0:
            raise ValueError('At least one language must be enabled')
        
        # English is mandatory
        if 'english' not in v:
            raise ValueError('English is mandatory and must be included in enabled languages')
        
        allowed_languages = ['english', 'hindi', 'tamil', 'telugu', 'bengali', 'punjabi', 'hinglish', 'marathi', 'gujarati', 'kannada', 'malayalam']
        for lang in v:
            if lang not in allowed_languages:
                raise ValueError(f'Language must be one of: {", ".join(allowed_languages)}')
        return v


class ProfileCreate(BaseModel):
    groom_name: str
    bride_name: str
    event_type: str
    event_date: datetime
    venue: str
    city: Optional[str] = None
    invitation_message: Optional[str] = None
    language: List[str] = ["english"]
    design_id: str = DEFAULT_THEME
    deity_id: Optional[str] = None
    whatsapp_groom: Optional[str] = None
    whatsapp_bride: Optional[str] = None
    enabled_languages: List[str] = Field(default=["english"])
    custom_text: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    translations: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    about_couple: Optional[str] = None
    family_details: Optional[str] = None
    love_story: Optional[str] = None
    bride_photo_url: Optional[str] = None
    groom_photo_url: Optional[str] = None
    bride_about: Optional[str] = None
    groom_about: Optional[str] = None
    couple_about: Optional[str] = None  # Joint couple story
    nakshatram: Optional[str] = None
    muhurtam: Optional[str] = None
    couple_photo_url: Optional[str] = None
    cover_photo_id: Optional[str] = None
    # Per-photo enable/disable toggles — used by haldi/mehendi forms
    # where one or more photo slots are typically not needed.
    show_couple_photo: bool = True
    show_bride_photo: bool = True
    show_groom_photo: bool = True
    use_couple_photo_as_qr_bg: bool = True
    use_couple_photo_as_invitation_bg: bool = True
    qr_background_media_id: Optional[str] = None
    invitation_background_media_id: Optional[str] = None
    # Opening animation background — Feb 2026
    use_couple_photo_as_opening_bg: bool = True
    opening_bg_source: Optional[str] = 'couple'
    opening_photo_url: Optional[str] = None
    sections_enabled: SectionsEnabled = Field(default_factory=SectionsEnabled)
    # Host-editable presentation overrides. The design template supplies the
    # defaults; these let a host personalise without commissioning a new design
    # (the previous product had them and the rebuild dropped them).
    accent_color: Optional[str] = Field(default=None, max_length=32)
    closing_text: Optional[str] = Field(default=None, max_length=600)
    closing_signature: Optional[str] = Field(default=None, max_length=160)
    closing_animation_id: Optional[str] = Field(default=None, max_length=64)
    seo_settings: SEOSettings = Field(default_factory=SEOSettings)  # PHASE 31: SEO and social sharing settings
    background_music: BackgroundMusic = Field(default_factory=BackgroundMusic)
    map_settings: MapSettings = Field(default_factory=MapSettings)
    contact_info: ContactInfo = Field(default_factory=ContactInfo)  # PHASE 11: Contact information
    rsvp_settings: RSVPSettings = Field(default_factory=RSVPSettings)  # Phase 1C
    honeymoon_fund: HoneymoonFund = Field(default_factory=HoneymoonFund)  # Phase 1H
    events: List[WeddingEvent] = Field(default_factory=list)
    pre_wedding_links: List[PreWeddingLink] = Field(default_factory=list)  # Pre-wedding shoot links
    # July 2025 — guest_rooms was already on `Profile` but missing here, which
    # broke /admin/profiles create with a 500 AttributeError once the photog
    # panel started sending Find-My-Room data. Default to empty list.
    guest_rooms: List[GuestRoom] = Field(default_factory=list)
    # Free-form parking guidance for the venue card. Persisted on the
    # profile doc so the public render & user wizard see the same thing.
    parking_info: Optional[str] = None
    # YouTube live-stream URL displayed on the public invitation.
    youtube_live_url: Optional[str] = None
    # Gallery / AI Face-Match privacy code. The frontend posts the raw
    # code along with the on/off flags; sanitisation happens server-side.
    gallery_privacy: Optional[Dict[str, Any]] = None
    link_expiry_type: str = "days"
    link_expiry_value: Optional[int] = 30
    expires_at: Optional[datetime] = None  # PHASE 12: Invitation expiry date (default: event_date + 7 days)
    design_selections: Dict[str, str] = Field(default_factory=dict)  # Per-event design id picker (event_name → design_id from master catalogue)
    # 2026 — Universal Invitation Categories
    invitation_category: str = "wedding"
    celebrant_info: Optional[Dict[str, Any]] = None
    
    @field_validator('events')
    def validate_events(cls, v):
        """PHASE 17: Enhanced validation for events list"""
        if v is not None:
            if len(v) > 7:
                raise ValueError('Maximum 7 events allowed')
            
            # Check at least one visible event if events exist
            if len(v) > 0:
                visible_events = [e for e in v if e.visible]
                if len(visible_events) == 0:
                    raise ValueError('At least one event must be visible')
            
            # PHASE 17: Prevent duplicate event types per profile
            event_types_seen = set()
            for event in v:
                event_type = event.event_type
                if isinstance(event_type, str):
                    event_type_lower = event_type.lower()
                else:
                    event_type_lower = str(event_type).lower()
                
                if event_type_lower in event_types_seen:
                    raise ValueError(f'Duplicate event type detected: {event_type}. Each profile can only have one event of each type.')
                
                event_types_seen.add(event_type_lower)
        
        return v
    
    @field_validator('whatsapp_groom', 'whatsapp_bride')
    def validate_whatsapp_number(cls, v):
        """Validate WhatsApp number is in E.164 format"""
        if v is not None and v.strip():
            pattern = r'^\+[1-9]\d{1,14}$'
            if not re.match(pattern, v):
                raise ValueError('WhatsApp number must be in E.164 format (e.g., +919876543210)')
        return v
    
    @model_validator(mode='after')
    def validate_design_id(self):
        """Validate design_id against this profile's invitation_category."""
        allowed = _allowed_design_ids_for_category(self.invitation_category)
        if self.design_id not in allowed:
            raise ValueError(
                f'design_id "{self.design_id}" is not valid for category '
                f'"{self.invitation_category or "wedding"}".'
            )
        return self
    
    @field_validator('deity_id')
    def validate_deity_id(cls, v):
        """Validate deity_id is one of the allowed values"""
        if v is not None:
            allowed_deities = ['ganesha', 'venkateswara_padmavati', 'shiva_parvati', 'lakshmi_vishnu', 'none']
            if v not in allowed_deities:
                raise ValueError(f'deity_id must be one of: {", ".join(allowed_deities)} or null')
        return v
    
    @field_validator('enabled_languages')
    def validate_enabled_languages(cls, v):
        """Validate at least one language is enabled and English is always included"""
        if not v or len(v) == 0:
            raise ValueError('At least one language must be enabled')
        
        # English is mandatory
        if 'english' not in v:
            raise ValueError('English is mandatory and must be included in enabled languages')
        
        allowed_languages = ['english', 'hindi', 'tamil', 'telugu', 'bengali', 'punjabi', 'hinglish', 'marathi', 'gujarati', 'kannada', 'malayalam']
        for lang in v:
            if lang not in allowed_languages:
                raise ValueError(f'Language must be one of: {", ".join(allowed_languages)}')
        return v


class ProfileUpdate(BaseModel):
    # Host-editable presentation overrides (see Profile).
    accent_color: Optional[str] = Field(default=None, max_length=32)
    closing_text: Optional[str] = Field(default=None, max_length=600)
    closing_signature: Optional[str] = Field(default=None, max_length=160)
    closing_animation_id: Optional[str] = Field(default=None, max_length=64)
    groom_name: Optional[str] = None
    bride_name: Optional[str] = None
    event_type: Optional[str] = None
    event_date: Optional[datetime] = None
    venue: Optional[str] = None
    city: Optional[str] = None
    invitation_message: Optional[str] = None
    language: Optional[List[str]] = None
    design_id: Optional[str] = None
    deity_id: Optional[str] = None
    whatsapp_groom: Optional[str] = None
    whatsapp_bride: Optional[str] = None
    enabled_languages: Optional[List[str]] = None
    custom_text: Optional[Dict[str, Dict[str, Any]]] = None
    translations: Optional[Dict[str, Dict[str, Any]]] = None
    about_couple: Optional[str] = None
    family_details: Optional[str] = None
    love_story: Optional[str] = None
    bride_photo_url: Optional[str] = None
    groom_photo_url: Optional[str] = None
    bride_about: Optional[str] = None
    groom_about: Optional[str] = None
    couple_about: Optional[str] = None  # Joint couple story
    nakshatram: Optional[str] = None
    muhurtam: Optional[str] = None
    couple_photo_url: Optional[str] = None
    cover_photo_id: Optional[str] = None
    show_couple_photo: Optional[bool] = None
    show_bride_photo: Optional[bool] = None
    show_groom_photo: Optional[bool] = None
    use_couple_photo_as_qr_bg: Optional[bool] = None
    use_couple_photo_as_invitation_bg: Optional[bool] = None
    qr_background_media_id: Optional[str] = None
    invitation_background_media_id: Optional[str] = None
    use_couple_photo_as_opening_bg: Optional[bool] = None
    opening_bg_source: Optional[str] = None
    opening_photo_url: Optional[str] = None
    sections_enabled: Optional[SectionsEnabled] = None
    seo_settings: Optional[SEOSettings] = None  # PHASE 31: SEO and social sharing settings
    background_music: Optional[BackgroundMusic] = None
    map_settings: Optional[MapSettings] = None
    contact_info: Optional[ContactInfo] = None  # PHASE 11: Contact information
    rsvp_settings: Optional[RSVPSettings] = None  # Phase 1C
    honeymoon_fund: Optional[HoneymoonFund] = None  # Phase 1H
    # Bucket 1A
    live_stream: Optional[LiveStreamSettings] = None
    song_requests_settings: Optional[SongRequestSettings] = None
    dress_code_settings: Optional[DressCodeSettings] = None
    events: Optional[List[WeddingEvent]] = None
    guest_rooms: Optional[List[GuestRoom]] = None  # Guest accommodation list
    pre_wedding_links: Optional[List[PreWeddingLink]] = None  # Pre-wedding shoot links
    link_expiry_type: Optional[str] = None
    link_expiry_value: Optional[int] = None
    expires_at: Optional[datetime] = None  # PHASE 12: Invitation expiry date
    is_active: Optional[bool] = None
    design_selections: Optional[Dict[str, str]] = None  # Per-event design id picker
    # 2026 — Universal Invitation Categories
    invitation_category: Optional[str] = None
    celebrant_info: Optional[Dict[str, Any]] = None
    
    @field_validator('events')
    def validate_events(cls, v):
        """PHASE 17: Enhanced validation for events list"""
        if v is not None:
            if len(v) > 7:
                raise ValueError('Maximum 7 events allowed')
            
            # Check at least one visible event if events exist
            if len(v) > 0:
                visible_events = [e for e in v if e.visible]
                if len(visible_events) == 0:
                    raise ValueError('At least one event must be visible')
            
            # PHASE 17: Prevent duplicate event types per profile
            event_types_seen = set()
            for event in v:
                event_type = event.event_type
                if isinstance(event_type, str):
                    event_type_lower = event_type.lower()
                else:
                    event_type_lower = str(event_type).lower()
                
                if event_type_lower in event_types_seen:
                    raise ValueError(f'Duplicate event type detected: {event_type}. Each profile can only have one event of each type.')
                
                event_types_seen.add(event_type_lower)
        
        return v
    
    @field_validator('whatsapp_groom', 'whatsapp_bride')
    def validate_whatsapp_number(cls, v):
        """Validate WhatsApp number is in E.164 format"""
        if v is not None and v.strip():
            pattern = r'^\+[1-9]\d{1,14}$'
            if not re.match(pattern, v):
                raise ValueError('WhatsApp number must be in E.164 format (e.g., +919876543210)')
        return v
    
    @model_validator(mode='after')
    def validate_design_id(self):
        """Validate design_id against this profile's invitation_category (optional update)."""
        if self.design_id is not None:
            allowed = _allowed_design_ids_for_category(self.invitation_category)
            if self.design_id not in allowed:
                raise ValueError(
                    f'design_id "{self.design_id}" is not valid for category '
                    f'"{self.invitation_category or "wedding"}".'
                )
        return self
    
    @field_validator('deity_id')
    def validate_deity_id(cls, v):
        """Validate deity_id is one of the allowed values"""
        if v is not None and v != "":
            allowed_deities = ['ganesha', 'venkateswara_padmavati', 'shiva_parvati', 'lakshmi_vishnu', 'none']
            if v not in allowed_deities:
                raise ValueError(f'deity_id must be one of: {", ".join(allowed_deities)} or null')
        return v
    
    @field_validator('enabled_languages')
    def validate_enabled_languages(cls, v):
        """Validate at least one language is enabled and English is always included"""
        if v is not None:
            if len(v) == 0:
                raise ValueError('At least one language must be enabled')
            
            # English is mandatory
            if 'english' not in v:
                raise ValueError('English is mandatory and must be included in enabled languages')
            
            allowed_languages = ['english', 'hindi', 'tamil', 'telugu', 'bengali', 'punjabi', 'hinglish', 'marathi', 'gujarati', 'kannada', 'malayalam']
            for lang in v:
                if lang not in allowed_languages:
                    raise ValueError(f'Language must be one of: {", ".join(allowed_languages)}')
        return v


class ProfileResponse(BaseModel):
    id: str
    slug: str
    invite_no: Optional[int] = None
    invite_code: Optional[str] = None
    name_slug: Optional[str] = None
    groom_name: str = ""
    bride_name: str = ""
    event_type: str = "wedding"
    event_date: Optional[datetime] = None
    venue: str = ""
    city: Optional[str] = None
    invitation_message: Optional[str] = None
    language: List[str] = Field(default_factory=lambda: ["en"])
    design_id: str = "default"
    deity_id: Optional[str] = None
    whatsapp_groom: Optional[str] = None
    whatsapp_bride: Optional[str] = None
    enabled_languages: List[str] = Field(default_factory=lambda: ["en"])
    custom_text: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    translations: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    accent_color: Optional[str] = None
    closing_text: Optional[str] = None
    closing_signature: Optional[str] = None
    closing_animation_id: Optional[str] = None
    about_couple: Optional[str] = None
    family_details: Optional[str] = None
    love_story: Optional[str] = None
    bride_photo_url: Optional[str] = None
    groom_photo_url: Optional[str] = None
    bride_about: Optional[str] = None
    groom_about: Optional[str] = None
    couple_about: Optional[str] = None
    nakshatram: Optional[str] = None
    muhurtam: Optional[str] = None
    couple_photo_url: Optional[str] = None
    show_couple_photo: bool = True
    show_bride_photo: bool = True
    show_groom_photo: bool = True
    cover_photo_id: Optional[str] = None
    use_couple_photo_as_qr_bg: bool = True
    use_couple_photo_as_invitation_bg: bool = True
    qr_background_media_id: Optional[str] = None
    invitation_background_media_id: Optional[str] = None
    use_couple_photo_as_opening_bg: bool = True
    opening_bg_source: Optional[str] = 'couple'
    opening_photo_url: Optional[str] = None
    sections_enabled: SectionsEnabled = Field(default_factory=SectionsEnabled)
    background_music: BackgroundMusic = Field(default_factory=BackgroundMusic)
    map_settings: MapSettings = Field(default_factory=MapSettings)
    contact_info: ContactInfo = Field(default_factory=ContactInfo)
    rsvp_settings: RSVPSettings = Field(default_factory=RSVPSettings)
    honeymoon_fund: HoneymoonFund = Field(default_factory=HoneymoonFund)
    live_stream: LiveStreamSettings = Field(default_factory=LiveStreamSettings)
    song_requests_settings: SongRequestSettings = Field(default_factory=SongRequestSettings)
    dress_code_settings: DressCodeSettings = Field(default_factory=DressCodeSettings)
    events: List[WeddingEvent] = Field(default_factory=list)
    guest_rooms: List[GuestRoom] = Field(default_factory=list)
    pre_wedding_links: List[PreWeddingLink] = Field(default_factory=list)
    link_expiry_type: str = "none"
    link_expiry_value: Optional[int] = None
    link_expiry_date: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_template: bool = False
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    invitation_link: str = ""
    event_links: Optional[Any] = None
    invitation_category: str = "wedding"
    celebrant_info: Optional[Dict[str, Any]] = None


class ProfileMedia(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    media_type: str  # photo, video
    media_url: str
    caption: Optional[str] = None
    order: int = 0
    is_cover: bool = False  # Mark as cover photo
    file_size: Optional[int] = None  # Size in bytes
    original_filename: Optional[str] = None  # Original upload name
    # Mobile-perf: optional responsive-image variants generated at upload time.
    # Shape: { small, medium, large, original, width, height, size }
    # Frontend renders <picture srcset> when present, falls back to media_url otherwise.
    media_variants: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProfileMediaCreate(BaseModel):
    media_type: str
    media_url: str
    caption: Optional[str] = None
    order: int = 0
    is_cover: bool = False
    file_size: Optional[int] = None
    original_filename: Optional[str] = None


class Greeting(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    guest_name: str
    message: str
    approval_status: str = "pending"  # PHASE 11: pending, approved, rejected
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_validator('approval_status')
    def validate_approval_status(cls, v):
        """Validate approval status"""
        if v not in ['pending', 'approved', 'rejected']:
            raise ValueError('Approval status must be one of: pending, approved, rejected')
        return v
    
    @field_validator('message')
    def validate_message(cls, v):
        """Validate message length and sanitize emoji spam"""
        if len(v) > 250:
            raise ValueError('Message must be 250 characters or less')
        # Check for excessive emoji spam (more than 10 emojis)
        emoji_count = sum(1 for char in v if ord(char) > 0x1F300)
        if emoji_count > 10:
            raise ValueError('Too many emojis in message')
        return v


class GreetingCreate(BaseModel):
    guest_name: str
    message: str
    
    @field_validator('message')
    def validate_message(cls, v):
        """Validate message length and sanitize emoji spam"""
        if len(v) > 250:
            raise ValueError('Message must be 250 characters or less')
        # Check for excessive emoji spam (more than 10 emojis)
        emoji_count = sum(1 for char in v if ord(char) > 0x1F300)
        if emoji_count > 10:
            raise ValueError('Too many emojis in message')
        return v


class GreetingResponse(BaseModel):
    id: str
    guest_name: str
    message: str
    approval_status: str  # PHASE 11: Include approval status
    created_at: datetime


class InvitationPublicView(BaseModel):
    slug: str
    # Canonical public URL parts (Optional → legacy rows without a number still validate).
    invite_no: Optional[int] = None
    invite_code: Optional[str] = None     # zero-padded display code, e.g. "00001"
    name_slug: Optional[str] = None
    canonical_url: Optional[str] = None   # e.g. https://majainvites.com/invite/00001/<name>
    face_match_url: Optional[str] = None  # e.g. https://majainvites.com/invite/00001/find-my-photos
    public_base: Optional[str] = None     # canonical origin so the client never reads window.location
    groom_name: str
    bride_name: str
    event_type: str
    event_date: datetime
    venue: str
    city: Optional[str]
    invitation_message: Optional[str]
    language: List[str]
    design_id: str
    deity_id: Optional[str]
    whatsapp_groom: Optional[str]
    whatsapp_bride: Optional[str]
    enabled_languages: List[str]
    custom_text: Dict[str, Dict[str, Any]]
    translations: Dict[str, Dict[str, Any]] = {}
    accent_color: Optional[str] = None
    closing_text: Optional[str] = None
    closing_signature: Optional[str] = None
    closing_animation_id: Optional[str] = None
    about_couple: Optional[str]
    family_details: Optional[str]
    love_story: Optional[str]
    bride_photo_url: Optional[str] = None
    groom_photo_url: Optional[str] = None
    bride_about: Optional[str] = None
    groom_about: Optional[str] = None
    couple_about: Optional[str] = None  # Joint couple story
    nakshatram: Optional[str] = None
    muhurtam: Optional[str] = None
    couple_photo_url: Optional[str] = None
    show_couple_photo: bool = True
    show_bride_photo: bool = True
    show_groom_photo: bool = True
    cover_photo_id: Optional[str]
    use_couple_photo_as_qr_bg: bool = True
    use_couple_photo_as_invitation_bg: bool = True
    qr_background_media_id: Optional[str] = None
    invitation_background_media_id: Optional[str] = None
    use_couple_photo_as_opening_bg: bool = True
    opening_bg_source: Optional[str] = 'couple'
    opening_photo_url: Optional[str] = None
    sections_enabled: SectionsEnabled
    background_music: BackgroundMusic
    map_settings: MapSettings
    contact_info: ContactInfo  # PHASE 11: Contact information
    rsvp_settings: RSVPSettings = Field(default_factory=RSVPSettings)  # Phase 1C: RSVP toggles for public form
    honeymoon_fund: HoneymoonFund = Field(default_factory=HoneymoonFund)  # Phase 1H: Honeymoon fund section
    # Bucket 1A — guest engagement public fields
    live_stream: LiveStreamSettings = Field(default_factory=LiveStreamSettings)
    song_requests_settings: SongRequestSettings = Field(default_factory=SongRequestSettings)
    dress_code_settings: DressCodeSettings = Field(default_factory=DressCodeSettings)
    events: List[WeddingEvent]
    media: List[ProfileMedia]
    greetings: List[GreetingResponse]
    guest_rooms: List[GuestRoom] = Field(default_factory=list)  # Guest room directory (for Find My Room)
    pre_wedding_links: List[PreWeddingLink] = Field(default_factory=list)  # Pre-wedding shoot links
    is_expired: bool = False  # PHASE 12: Indicates if invitation has expired
    decorative_effects: bool = True  # PHASE 17: Master toggle for decorative effects
    seo_settings: SEOSettings = Field(default_factory=SEOSettings)  # PHASE 31: SEO and social sharing settings
    design_selections: Dict[str, str] = Field(default_factory=dict)  # Per-event design id from master 180-design catalogue
    faq_settings: Optional[Dict[str, Any]] = None  # Guest FAQ accordion (see Profile.faq_settings)
    # 2026 — Universal Invitation Categories
    invitation_category: str = "wedding"
    celebrant_info: Optional[Dict[str, Any]] = None
    # Phase 3 P1 — watermark exposed publicly so client renders the overlay
    # based on admin override + user setting (computed via feature_gating).
    requires_watermark: bool = False
    admin_watermark_override: Optional[str] = None  # "on" | "off" | "user"
    # Unified Pricing Engine — the feature-pack entitlement the buyer purchased.
    # None => ungated (legacy link, grandfathered, or new_pricing_enabled OFF) and the
    # renderer shows every feature. A list => the renderer only shows packable features
    # present in it. Written by pricing_activation on delivery; never removes base features.
    granted_features: Optional[List[str]] = None
    # "Managed by <Studio>" footer credit → the studio's portfolio. Present only
    # when the building studio holds a PREMIUM portfolio subscription with a
    # published portfolio; None otherwise (no credit rendered). See studio_credit.
    managed_by: Optional[Dict[str, Any]] = None


class RSVP(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    guest_name: str
    guest_phone: str
    status: str  # yes, no, maybe
    guest_count: int = 1
    message: Optional[str] = None
    # Phase 1C — Dietary preferences & RSVP extras
    dietary_preference: Optional[str] = None  # veg | nonveg | vegan | jain
    allergies: Optional[str] = None  # Free-text allergy info
    plus_one: bool = False  # True if bringing a plus-one
    kids_count: int = 0  # Number of kids attending
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_validator('guest_name')
    def validate_guest_name(cls, v):
        """Validate guest name length"""
        if v is not None and len(v) > 120:
            raise ValueError('Guest name must be 120 characters or less')
        return v

    @field_validator('guest_phone')
    def validate_phone(cls, v):
        """Validate phone number is in E.164 format"""
        pattern = r'^\+[1-9]\d{1,14}$'
        if not re.match(pattern, v):
            raise ValueError('Phone number must be in E.164 format (e.g., +919876543210)')
        return v

    @field_validator('status')
    def validate_status(cls, v):
        """Validate RSVP status"""
        if v not in ['yes', 'no', 'maybe']:
            raise ValueError('Status must be one of: yes, no, maybe')
        return v

    @field_validator('guest_count')
    def validate_guest_count(cls, v):
        """Validate guest count is between 1 and 10"""
        if v < 1 or v > 10:
            raise ValueError('Guest count must be between 1 and 10')
        return v

    @field_validator('message')
    def validate_message(cls, v):
        """Validate message length"""
        if v is not None and len(v) > 250:
            raise ValueError('Message must be 250 characters or less')
        return v


class RSVPCreate(BaseModel):
    guest_name: str
    guest_phone: str
    status: str
    guest_count: int = 1
    message: Optional[str] = None
    # Phase 1C — Dietary & extras (optional; backend ignores when not enabled)
    dietary_preference: Optional[str] = None
    allergies: Optional[str] = None
    plus_one: bool = False
    kids_count: int = 0

    @field_validator('guest_name')
    def validate_guest_name(cls, v):
        """Validate guest name length"""
        if v is not None and len(v) > 120:
            raise ValueError('Guest name must be 120 characters or less')
        return v

    @field_validator('dietary_preference')
    def validate_dietary(cls, v):
        if v is None or v == '':
            return None
        allowed = ['veg', 'nonveg', 'vegan', 'jain']
        if v not in allowed:
            raise ValueError(f'dietary_preference must be one of: {", ".join(allowed)}')
        return v

    @field_validator('allergies')
    def validate_allergies(cls, v):
        if v is not None and len(v) > 250:
            raise ValueError('Allergies note must be 250 characters or less')
        return v

    @field_validator('kids_count')
    def validate_kids_count(cls, v):
        if v < 0 or v > 20:
            raise ValueError('Kids count must be between 0 and 20')
        return v
    
    @field_validator('guest_phone')
    def validate_phone(cls, v):
        """Validate phone number is in E.164 format"""
        pattern = r'^\+[1-9]\d{1,14}$'
        if not re.match(pattern, v):
            raise ValueError('Phone number must be in E.164 format (e.g., +919876543210)')
        return v
    
    @field_validator('status')
    def validate_status(cls, v):
        """Validate RSVP status"""
        if v not in ['yes', 'no', 'maybe']:
            raise ValueError('Status must be one of: yes, no, maybe')
        return v
    
    @field_validator('guest_count')
    def validate_guest_count(cls, v):
        """Validate guest count is between 1 and 10"""
        if v < 1 or v > 10:
            raise ValueError('Guest count must be between 1 and 10')
        return v
    
    @field_validator('message')
    def validate_message(cls, v):
        """Validate message length"""
        if v is not None and len(v) > 250:
            raise ValueError('Message must be 250 characters or less')
        return v


class RSVPResponse(BaseModel):
    id: str
    guest_name: str
    guest_phone: str
    status: str
    guest_count: int
    message: Optional[str]
    dietary_preference: Optional[str] = None
    allergies: Optional[str] = None
    plus_one: bool = False
    kids_count: int = 0
    created_at: datetime


class RSVPStats(BaseModel):
    total_rsvps: int
    attending_count: int
    not_attending_count: int
    maybe_count: int
    total_guest_count: int



# PHASE 7 - Analytics Models (Enhanced in Phase 9)
class DailyView(BaseModel):
    """Model for daily view count"""
    date: str  # yyyy-mm-dd format
    count: int = 0

class Analytics(BaseModel):
    """Model for invitation view tracking with enhanced insights (Phase 9)"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str  # Reference to Profile
    
    # View counts
    total_views: int = 0  # Total page opens (including repeats)
    unique_views: int = 0  # Unique visitors (session-based, 24-hour window)
    
    # Device breakdown
    mobile_views: int = 0
    desktop_views: int = 0
    tablet_views: int = 0
    
    # Time tracking
    first_viewed_at: Optional[datetime] = None
    last_viewed_at: Optional[datetime] = None
    
    # Daily views (last 30 days)
    daily_views: List[DailyView] = Field(default_factory=list)
    
    # Hourly distribution (0-23)
    hourly_distribution: Dict[str, int] = Field(default_factory=dict)  # {"0": 5, "13": 12, ...}
    
    # Language usage
    language_views: Dict[str, int] = Field(default_factory=dict)  # {"english": 10, "telugu": 5, ...}
    
    # Interaction tracking
    map_clicks: int = 0
    rsvp_clicks: int = 0
    music_plays: int = 0
    music_pauses: int = 0
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ViewSession(BaseModel):
    """Model for tracking unique visitor sessions (24-hour window)"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str  # Client-generated session identifier
    profile_id: str  # Reference to Profile
    device_type: str  # mobile, desktop, or tablet
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime  # Session expires after 24 hours


class ViewTrackingRequest(BaseModel):
    """Request model for tracking a view"""
    session_id: str  # Client-generated session identifier
    device_type: str  # mobile, desktop, or tablet
    
    @field_validator('device_type')
    def validate_device_type(cls, v):
        """Validate device type"""
        if v not in ['mobile', 'desktop', 'tablet']:
            raise ValueError('device_type must be either "mobile", "desktop", or "tablet"')
        return v


class InteractionTrackingRequest(BaseModel):
    """Request model for tracking interactions"""
    session_id: str  # Client-generated session identifier
    interaction_type: str  # map_click, rsvp_click, music_play, music_pause
    
    @field_validator('interaction_type')
    def validate_interaction_type(cls, v):
        """Validate interaction type"""
        if v not in ['map_click', 'rsvp_click', 'music_play', 'music_pause']:
            raise ValueError('interaction_type must be one of: map_click, rsvp_click, music_play, music_pause')
        return v


class LanguageTrackingRequest(BaseModel):
    """Request model for tracking language switches"""
    session_id: str  # Client-generated session identifier
    language_code: str  # english, telugu, tamil, kannada, malayalam
    
    @field_validator('language_code')
    def validate_language_code(cls, v):
        """Validate language code"""
        if v not in ['english', 'telugu', 'tamil', 'kannada', 'malayalam']:
            raise ValueError('language_code must be one of: english, telugu, tamil, kannada, malayalam')
        return v


class AnalyticsResponse(BaseModel):
    """Response model for analytics data"""
    profile_id: str
    total_views: int
    unique_views: int
    mobile_views: int
    desktop_views: int
    tablet_views: int
    first_viewed_at: Optional[datetime]
    last_viewed_at: Optional[datetime]
    daily_views: List[DailyView]
    hourly_distribution: Dict[str, int]
    language_views: Dict[str, int]
    map_clicks: int
    rsvp_clicks: int
    music_plays: int
    music_pauses: int


class AnalyticsSummary(BaseModel):
    """Summary analytics for admin dashboard"""
    total_views: int
    unique_visitors: int
    most_viewed_language: Optional[str]
    peak_hour: Optional[int]  # Hour of day (0-23)
    device_breakdown: Dict[str, int]  # {"mobile": 10, "desktop": 5, "tablet": 2}


class RateLimit(BaseModel):
    """Rate limiting tracker for spam prevention"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ip_address: str
    endpoint: str  # "rsvp" or "wishes"
    date: str  # yyyy-mm-dd format
    count: int = 0
    failed_attempts: int = 0  # PHASE 32: Track failed attempts separately
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CaptchaChallenge(BaseModel):
    """PHASE 32: Simple math CAPTCHA challenge"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    challenge: str  # Math question (e.g., "3 + 5")
    answer: str  # Correct answer (hashed)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(minutes=5))


class CaptchaVerifyRequest(BaseModel):
    """PHASE 32: Request to verify CAPTCHA"""
    challenge_id: str
    answer: str


class SubmissionAttempt(BaseModel):
    """PHASE 32: Track submission attempts for RSVP/wishes"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ip_address: str
    device_id: Optional[str] = None  # Frontend-generated device fingerprint
    endpoint: str  # "rsvp" or "wishes"
    slug: str  # Profile slug
    success: bool  # Whether submission was successful
    requires_captcha: bool = False  # Whether CAPTCHA is now required
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLog(BaseModel):
    """Audit log for tracking admin actions"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action: str  # "profile_create", "profile_update", "profile_delete", "profile_duplicate", "template_save"
    admin_id: str
    profile_id: Optional[str] = None
    profile_slug: Optional[str] = None
    details: Optional[Dict] = None  # Additional context like profile names
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLogResponse(BaseModel):
    """Response model for audit logs"""
    # July 2025 — `extra="ignore"` so newer audit rows that carry extra
    # metadata (target_id, target_type, actor_role …) don't crash the
    # endpoint while older code paths still see only the canonical fields.
    model_config = ConfigDict(extra="ignore")

    id: str
    action: str
    admin_id: str
    profile_id: Optional[str] = None
    profile_slug: Optional[str] = None
    # Accept BOTH legacy dict shape and free-form string `details`, so the
    # endpoint never crashes if a writer used a different shape.
    details: Optional[Any] = None
    timestamp: datetime



# ==================== PHASE 25: GUEST ENGAGEMENT ENGINE ====================

class GuestWish(BaseModel):
    """PHASE 25: Guest wishes/messages for events"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str  # Reference to WeddingEvent
    profile_id: str  # Reference to Profile
    guest_name: str  # Guest name (or "Anonymous")
    message: str  # Wish message (max 200 characters)
    emoji: Optional[str] = None  # Optional emoji reaction (❤️, 🙏, 🎉)
    ip_address: str  # For spam protection
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_validator('message')
    def validate_message(cls, v):
        """Validate message length and basic content"""
        if not v or len(v.strip()) == 0:
            raise ValueError('Message cannot be empty')
        if len(v) > 200:
            raise ValueError('Message must be 200 characters or less')
        return v.strip()
    
    @field_validator('guest_name')
    def validate_guest_name(cls, v):
        """Validate guest name"""
        if not v or len(v.strip()) == 0:
            return "Anonymous"
        if len(v) > 50:
            raise ValueError('Guest name must be 50 characters or less')
        return v.strip()
    
    @field_validator('emoji')
    def validate_emoji(cls, v):
        """Validate emoji is one of allowed values"""
        if v is not None:
            allowed_emojis = ['❤️', '🙏', '🎉', '💐', '🌟', '✨']
            if v not in allowed_emojis:
                raise ValueError(f'Emoji must be one of: {", ".join(allowed_emojis)} or null')
        return v


class GuestWishCreate(BaseModel):
    """Request model for creating guest wish"""
    guest_name: str = "Anonymous"
    message: str
    emoji: Optional[str] = None
    
    @field_validator('message')
    def validate_message(cls, v):
        """Validate message length"""
        if not v or len(v.strip()) == 0:
            raise ValueError('Message cannot be empty')
        if len(v) > 200:
            raise ValueError('Message must be 200 characters or less')
        return v.strip()
    
    @field_validator('guest_name')
    def validate_guest_name(cls, v):
        """Validate guest name"""
        if not v or len(v.strip()) == 0:
            return "Anonymous"
        if len(v) > 50:
            raise ValueError('Guest name must be 50 characters or less')
        return v.strip()
    
    @field_validator('emoji')
    def validate_emoji(cls, v):
        """Validate emoji"""
        if v is not None:
            allowed_emojis = ['❤️', '🙏', '🎉', '💐', '🌟', '✨']
            if v not in allowed_emojis:
                raise ValueError(f'Emoji must be one of: {", ".join(allowed_emojis)} or null')
        return v


class GuestWishResponse(BaseModel):
    """Response model for guest wish"""
    id: str
    event_id: str
    profile_id: str
    guest_name: str
    message: str
    emoji: Optional[str]
    created_at: datetime


class GuestReaction(BaseModel):
    """PHASE 25: Guest reactions for events (lightweight, aggregate only)"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str  # Reference to WeddingEvent
    profile_id: str  # Reference to Profile
    reaction_type: Literal["love", "blessings", "excited"]  # ❤️ Love it, 🙏 Blessings, 🎉 Excited
    ip_address: str  # For one reaction per device tracking
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GuestReactionCreate(BaseModel):
    """Request model for creating guest reaction"""
    reaction_type: Literal["love", "blessings", "excited"]
    
    @field_validator('reaction_type')
    def validate_reaction_type(cls, v):
        """Validate reaction type"""
        if v not in ['love', 'blessings', 'excited']:
            raise ValueError('reaction_type must be one of: love, blessings, excited')
        return v


class GuestReactionStats(BaseModel):
    """Response model for reaction statistics"""
    event_id: str
    love_count: int = 0
    blessings_count: int = 0
    excited_count: int = 0
    total_reactions: int = 0


class UpdateEventEngagementSettingsRequest(BaseModel):
    """PHASE 25: Request to update event engagement settings"""
    wishes_enabled: Optional[bool] = None
    reactions_enabled: Optional[bool] = None
    countdown_enabled: Optional[bool] = None




# ==========================================
# PHASE 26: AI-POWERED PERSONALIZATION
# ==========================================

class TranslationCache(BaseModel):
    """Cache for AI-translated content"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str  # Reference to Profile
    event_id: Optional[str] = None  # Optional event reference
    content_hash: str  # Hash of original content for cache lookup
    original_language: str = "en"  # Source language
    target_language: str  # Target language (en, te, hi, ta)
    original_content: str  # Original text
    translated_content: str  # Translated text
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime  # Cache expiry (default: 7 days)
    
    @field_validator('target_language')
    def validate_target_language(cls, v):
        """Validate target language"""
        if v not in ['en', 'te', 'hi', 'ta']:
            raise ValueError('target_language must be one of: en, te, hi, ta')
        return v


class TranslationRequest(BaseModel):
    """Request model for content translation"""
    content: str
    target_language: str  # en, te, hi, ta
    context: Optional[str] = "wedding invitation"  # Context for better translation
    
    @field_validator('content')
    def validate_content(cls, v):
        """Validate content is not empty"""
        if not v or len(v.strip()) == 0:
            raise ValueError('Content cannot be empty')
        if len(v) > 5000:
            raise ValueError('Content must be 5000 characters or less')
        return v.strip()
    
    @field_validator('target_language')
    def validate_target_language(cls, v):
        """Validate target language"""
        if v not in ['en', 'te', 'hi', 'ta']:
            raise ValueError('target_language must be one of: en (English), te (Telugu), hi (Hindi), ta (Tamil)')
        return v


class TranslationResponse(BaseModel):
    """Response model for translation"""
    original_content: str
    translated_content: str
    source_language: str
    target_language: str
    cached: bool  # Whether result was from cache


class GenerateDescriptionRequest(BaseModel):
    """Request model for AI event description generation"""
    event_type: str
    couple_names: Optional[str] = None
    date: Optional[str] = None
    venue: Optional[str] = None
    
    @field_validator('event_type')
    def validate_event_type(cls, v):
        """Validate event type"""
        if v not in ['engagement', 'haldi', 'mehendi', 'marriage', 'reception']:
            raise ValueError('event_type must be one of: engagement, haldi, mehendi, marriage, reception')
        return v


class GenerateDescriptionResponse(BaseModel):
    """Response model for generated description"""
    description: str
    event_type: str


class RSVPSuggestionsRequest(BaseModel):
    """Request model for RSVP message suggestions"""
    event_type: Optional[str] = "marriage"
    guest_name: Optional[str] = None
    
    @field_validator('event_type')
    def validate_event_type(cls, v):
        """Validate event type"""
        if v and v not in ['engagement', 'haldi', 'mehendi', 'marriage', 'reception']:
            raise ValueError('event_type must be one of: engagement, haldi, mehendi, marriage, reception')
        return v


class RSVPSuggestionsResponse(BaseModel):
    """Response model for RSVP suggestions"""
    suggestions: List[str]  # List of 3 suggested messages


class GuestInsightsRequest(BaseModel):
    """Request model for guest segment insights"""
    profile_id: str


class GuestInsightsResponse(BaseModel):
    """Response model for guest insights"""
    profile_id: str
    total_rsvps: int
    confirmed: int
    declined: int
    pending: int
    early_responses: int  # Within 24 hours
    late_responses: int  # After 3 days
    with_messages: int  # RSVPs with personal messages
    insights_text: str  # AI-generated insights
    generated_at: datetime


class AIRateLimitStatus(BaseModel):
    """Response model for rate limit status"""
    allowed: bool
    remaining: int
    reset_at: Optional[datetime] = None
    message: Optional[str] = None


# ==================== PHASE 27: POST-WEDDING VALUE (COMBINED) ====================

class ThankYouMessage(BaseModel):
    """PHASE 27: Thank you message system
    
    Couple can send thank-you message after wedding.
    Same message delivered to all guests via same invitation URL.
    """
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str  # Reference to Profile
    enabled: bool = False  # Enable/disable thank you message
    message_type: Literal["text", "video"] = "text"  # Text or video message
    message_text: Optional[str] = None  # Thank you text (max 1000 characters)
    video_url: Optional[str] = None  # Thank you video URL
    video_thumbnail: Optional[str] = None  # Video thumbnail
    scheduled_date: Optional[datetime] = None  # Optional scheduled delivery date
    is_published: bool = False  # Whether message is visible to guests
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_validator('message_text')
    def validate_message_text(cls, v, info):
        """Validate message text based on message type"""
        message_type = info.data.get('message_type')
        if message_type == 'text':
            if not v or len(v.strip()) == 0:
                raise ValueError('Message text is required for text type')
            if len(v) > 1000:
                raise ValueError('Message text must be 1000 characters or less')
        return v
    
    @field_validator('video_url')
    def validate_video_url(cls, v, info):
        """Validate video URL based on message type"""
        message_type = info.data.get('message_type')
        if message_type == 'video' and not v:
            raise ValueError('Video URL is required for video type')
        return v


class ThankYouMessageCreate(BaseModel):
    """Request model for creating/updating thank you message"""
    enabled: bool = False
    message_type: Literal["text", "video"] = "text"
    message_text: Optional[str] = None
    video_url: Optional[str] = None
    video_thumbnail: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    
    @field_validator('message_text')
    def validate_message_text(cls, v, info):
        """Validate message text"""
        message_type = info.data.get('message_type')
        if message_type == 'text' and info.data.get('enabled'):
            if not v or len(v.strip()) == 0:
                raise ValueError('Message text is required for text type')
            if len(v) > 1000:
                raise ValueError('Message text must be 1000 characters or less')
        return v


class ThankYouMessageResponse(BaseModel):
    """Response model for thank you message"""
    id: str
    profile_id: str
    enabled: bool
    message_type: Literal["text", "video"]
    message_text: Optional[str]
    video_url: Optional[str]
    video_thumbnail: Optional[str]
    scheduled_date: Optional[datetime]
    is_published: bool
    created_at: datetime
    updated_at: datetime


class WeddingAlbumMedia(BaseModel):
    """PHASE 27: Wedding album media item
    
    Final wedding photos/videos uploaded after the wedding.
    Read-only for guests, lifetime access.
    """
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str  # Reference to Profile
    media_type: Literal["photo", "video"] = "photo"  # Photo or video
    media_url: str  # URL to media file
    thumbnail_url: Optional[str] = None  # Thumbnail for videos
    caption: Optional[str] = None  # Optional caption (max 200 characters)
    order: int = 0  # Display order
    file_size: Optional[int] = None  # File size in bytes
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_validator('caption')
    def validate_caption(cls, v):
        """Validate caption length"""
        if v and len(v) > 200:
            raise ValueError('Caption must be 200 characters or less')
        return v


class WeddingAlbumMediaCreate(BaseModel):
    """Request model for creating wedding album media"""
    media_type: Literal["photo", "video"] = "photo"
    media_url: str
    thumbnail_url: Optional[str] = None
    caption: Optional[str] = None
    order: int = 0
    file_size: Optional[int] = None
    
    @field_validator('caption')
    def validate_caption(cls, v):
        """Validate caption length"""
        if v and len(v) > 200:
            raise ValueError('Caption must be 200 characters or less')
        return v


class WeddingAlbumMediaResponse(BaseModel):
    """Response model for wedding album media"""
    id: str
    profile_id: str
    media_type: Literal["photo", "video"]
    media_url: str
    thumbnail_url: Optional[str]
    caption: Optional[str]
    order: int
    file_size: Optional[int]
    created_at: datetime


class MemoryModeStatus(BaseModel):
    """PHASE 27: Memory mode status
    
    Indicates if the wedding invitation should be in memory mode.
    Automatically activates after all wedding events have passed.
    """
    is_memory_mode: bool  # True if wedding date(s) have passed
    wedding_completed_date: Optional[datetime] = None  # Date of last event
    days_since_wedding: Optional[int] = None  # Days since wedding
    message: str  # Descriptive message about status



# ============================================
# PHASE 28: VIRAL SHARING & GROWTH ENGINE
# ============================================

class ShareMetadata(BaseModel):
    """PHASE 28: Metadata for social sharing preview
    
    Used to generate rich preview when sharing on social platforms.
    """
    title: str  # Share title (e.g., "Join us for Wedding of Bride & Groom")
    description: str  # Short description
    url: str  # Full URL to share
    image_url: Optional[str] = None  # Preview image URL
    event_type: Optional[str] = None  # If sharing specific event
    event_date: Optional[str] = None  # Human-readable event date


class QRCodeRequest(BaseModel):
    """PHASE 28: Request to generate QR code"""
    size: int = 300  # QR code size in pixels (default 300x300)
    
    @field_validator('size')
    def validate_size(cls, v):
        """Validate QR code size"""
        if v < 100 or v > 1000:
            raise ValueError('QR code size must be between 100 and 1000 pixels')
        return v


class QRCodeResponse(BaseModel):
    """PHASE 28: Response with QR code data"""
    qr_code_base64: str  # Base64 encoded PNG image
    download_filename: str  # Suggested filename for download
    url: str  # The URL encoded in the QR code


# ==================== PHASE 29E: ADMIN SAFETY NETS & RECOVERY ====================

class ProfileVersion(BaseModel):
    """PHASE 29E: Profile version history for rollback capability
    
    Stores snapshots of profile data at key save points.
    Maintains last 5 versions per profile for admin recovery.
    """
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str  # Reference to Profile
    version_number: int  # Sequential version number (1, 2, 3...)
    snapshot_data: Dict[str, Any]  # Full profile data snapshot
    admin_id: str  # Admin who created this version
    version_type: Literal["manual_save", "publish", "auto_save"]  # Type of save
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_validator('version_number')
    def validate_version_number(cls, v):
        """Validate version number is positive"""
        if v < 1:
            raise ValueError('version_number must be positive')
        return v


class ProfileVersionResponse(BaseModel):
    """Response model for profile version"""
    id: str
    profile_id: str
    version_number: int
    version_type: str
    created_at: datetime
    admin_id: str


class ProfileVersionListResponse(BaseModel):
    """Response model for profile version list"""
    versions: List[ProfileVersionResponse]
    total: int
    current_version: int


class RestoreVersionRequest(BaseModel):
    """Request to restore a profile from a version"""
    version_id: str  # ID of the version to restore




# ============================================
# PHASE 30: ANALYTICS, INSIGHTS & GUEST INTELLIGENCE
# ============================================

class DeviceType(str, Enum):
    """Device type for analytics tracking"""
    MOBILE = "mobile"
    DESKTOP = "desktop"
    TABLET = "tablet"
    UNKNOWN = "unknown"


class AnalyticsEventType(str, Enum):
    """Types of analytics events to track"""
    PAGE_VIEW = "page_view"
    GALLERY_OPENED = "gallery_opened"
    VIDEO_PLAYED = "video_played"
    MUSIC_UNMUTED = "music_unmuted"
    MAP_OPENED = "map_opened"
    RSVP_SUBMITTED = "rsvp_submitted"
    SCROLL_25 = "scroll_25"
    SCROLL_50 = "scroll_50"
    SCROLL_75 = "scroll_75"
    SCROLL_100 = "scroll_100"


class IPLocationCache(BaseModel):
    """Cache for IP geolocation lookups to reduce API calls"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ip_address: str
    country: Optional[str] = None
    city: Optional[str] = None
    cached_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    model_config = ConfigDict(from_attributes=True)


class ViewAnalytics(BaseModel):
    """Track page views and visitor metrics"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str  # Which wedding invitation
    event_id: Optional[str] = None  # Which specific event (if event page)
    session_id: str  # Unique session identifier
    ip_address: str  # For location tracking
    country: Optional[str] = None
    city: Optional[str] = None
    device_type: DeviceType
    user_agent: Optional[str] = None
    viewed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_unique_visitor: bool = True  # First time visitor
    
    model_config = ConfigDict(from_attributes=True)


class EngagementAnalytics(BaseModel):
    """Track user engagement and interactions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    event_id: Optional[str] = None
    session_id: str
    event_type: AnalyticsEventType
    event_metadata: Optional[Dict[str, Any]] = None  # Additional context
    time_spent_seconds: Optional[int] = None  # Time spent on page
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    model_config = ConfigDict(from_attributes=True)


class AnalyticsTrackRequest(BaseModel):
    """Request model for tracking analytics events"""
    profile_id: str
    event_id: Optional[str] = None
    session_id: str
    event_type: AnalyticsEventType
    device_type: DeviceType = DeviceType.UNKNOWN
    user_agent: Optional[str] = None
    event_metadata: Optional[Dict[str, Any]] = None
    time_spent_seconds: Optional[int] = None


class AnalyticsSummaryRequest(BaseModel):
    """Request filters for analytics summary"""
    profile_id: str
    event_id: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ViewAnalyticsData(BaseModel):
    """Summary of view analytics"""
    total_views: int
    unique_visitors: int
    repeat_visitors: int
    mobile_views: int
    desktop_views: int
    tablet_views: int
    top_countries: List[Dict[str, Any]]  # [{"country": "India", "count": 50}]
    top_cities: List[Dict[str, Any]]  # [{"city": "Mumbai", "count": 20}]
    views_by_date: List[Dict[str, Any]]  # [{"date": "2025-01-01", "count": 10}]


class EngagementAnalyticsData(BaseModel):
    """Summary of engagement analytics"""
    gallery_opens: int
    video_plays: int
    music_unmutes: int
    map_opens: int
    rsvp_submissions: int
    scroll_25_percent: int
    scroll_50_percent: int
    scroll_75_percent: int
    scroll_100_percent: int
    avg_time_spent_seconds: Optional[float] = None


class RSVPAnalyticsData(BaseModel):
    """Summary of RSVP conversion analytics"""
    total_views: int
    total_rsvps: int
    conversion_rate: float  # Percentage
    accepted_count: int
    declined_count: int
    pending_count: int
    rsvp_by_event: List[Dict[str, Any]]  # [{"event_id": "...", "event_name": "...", "accepted": 10}]
    peak_rsvp_time: Optional[Dict[str, Any]] = None  # {"date": "2025-01-15", "hour": 18, "count": 5}


class AnalyticsSummaryResponse(BaseModel):
    """Complete analytics summary for admin dashboard"""
    profile_id: str
    date_range: Dict[str, Optional[str]]  # {"start": "2025-01-01", "end": "2025-01-31"}
    views: ViewAnalyticsData
    engagement: EngagementAnalyticsData
    rsvp: RSVPAnalyticsData



# ==================== PHASE 33: MONETIZATION & PREMIUM PLANS ====================

class UpdatePlanRequest(BaseModel):
    """Request model for admin to update profile plan"""
    plan_type: Literal["FREE", "SILVER", "GOLD", "PLATINUM"]
    plan_expires_at: Optional[datetime] = None  # None for FREE or permanent plans
    
    @field_validator('plan_expires_at')
    def validate_plan_expiry(cls, v, info):
        """Validate plan expiry date"""
        plan_type = info.data.get('plan_type')
        
        # FREE plan should not have expiry date
        if plan_type == 'FREE' and v is not None:
            raise ValueError('FREE plan cannot have an expiry date')
        
        # Paid plans should have future expiry date
        if plan_type != 'FREE' and v is not None:
            if v < datetime.now(timezone.utc):
                raise ValueError('Plan expiry date must be in the future')
        
        return v


class PlanInfoResponse(BaseModel):
    """Response model for plan information"""
    current_plan: str
    plan_expires_at: Optional[datetime]
    days_remaining: Optional[int]
    is_expired: bool
    features: List[str]
    limitations: List[str]
    upgrade_available: bool
    
    
class FeatureFlagsResponse(BaseModel):
    """Response model for feature flags"""
    plan_type: str
    feature_flags: Dict[str, bool]
    gallery_limit: Optional[int]  # None = unlimited, 0 = no gallery
    requires_watermark: bool


# ============================================================================
# PHASE 35: REFERRAL, CREDITS & VIRAL GROWTH ENGINE
# ============================================================================

class ReferralStatus(str, Enum):
    """Referral status enum"""
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Referral(BaseModel):
    """Referral tracking model"""
    referral_id: str = Field(default_factory=lambda: f"ref_{uuid.uuid4().hex[:16]}")
    referrer_profile_id: str  # Profile that shared the referral
    referrer_admin_id: str  # Admin who owns the referrer profile
    referred_profile_id: Optional[str] = None  # Profile created via referral
    referral_code: str  # Unique referral code
    status: ReferralStatus = ReferralStatus.PENDING
    # `reward_credits` was here. Nothing writes it any more — a referral records
    # who referred whom and pays nothing, because the currency is deleted.
    # Existing rows keep the column; the model no longer claims it means
    # anything.
    
    # Tracking & fraud prevention
    referred_user_ip: Optional[str] = None
    referred_user_device_fingerprint: Optional[str] = None
    referral_source: Optional[str] = None  # 'whatsapp', 'copy', 'qr', 'direct'
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "referrer_profile_id": "prof_abc123",
                "referral_code": "WEDDING2025",
                "status": "pending"
            }
        }
    )


# The credit wallet, its transaction ledger and the transaction-type enum used
# to live here. Credits are deleted, not retired — see SESSION_CONTEXT §0.0.50.
# Nothing imported these except server.py's import list, which is why they
# survived the route sweep: an unused Pydantic model costs nothing at runtime
# and so never fails anything. It still describes a currency that no longer
# exists, which is the reason to remove it.

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "profile_id": "prof_abc123",
                "balance": 500,
                "earned_total": 1000,
                "spent_total": 500
            }
        }
    )


class ReferralCodeResponse(BaseModel):
    """Response for referral code.

    `total_credits_earned` was dropped with the credit system. It was being
    filled with a hardcoded 0 "so the response shape holds" — a field that is
    always zero is not a shape worth holding, it is a promise of a payout the
    platform no longer makes."""
    referral_code: str
    referral_url: str
    referral_link_short: str
    total_referrals: int
    completed_referrals: int
    pending_referrals: int


class ReferralStatsResponse(BaseModel):
    """Response for referral statistics"""
    total_referrals: int
    completed_referrals: int
    pending_referrals: int
    recent_referrals: List[Dict[str, Any]]


class ApplyReferralRequest(BaseModel):
    """Request to apply referral code"""
    referral_code: str
    profile_id: str  # New profile being created
    user_ip: Optional[str] = None
    device_fingerprint: Optional[str] = None


class AdminReferralOverrideRequest(BaseModel):
    """Admin override for referrals.

    `grant_credits` / `revoke_credits` are gone: the handler already ignored
    them, so sending either was accepted, changed nothing, and still wrote a
    success line into the audit log. Rejecting them at the boundary is the
    honest behaviour."""
    referral_id: str
    action: Literal["approve", "reject"]
    reason: str



# ==========================================
# PHASE 36: TEMPLATE MARKETPLACE & CREATOR ECOSYSTEM
# ==========================================

class TemplateCategory(str, Enum):
    """Cultural and regional categories for templates"""
    NORTH_INDIAN = "north_indian"
    SOUTH_INDIAN = "south_indian"
    MUSLIM = "muslim"
    CHRISTIAN = "christian"
    SIKH = "sikh"
    BENGALI = "bengali"
    GUJARATI = "gujarati"
    PUNJABI = "punjabi"
    MARATHI = "marathi"
    MODERN = "modern"
    TRADITIONAL = "traditional"
    MINIMALIST = "minimalist"
    ROYAL = "royal"
    FLORAL = "floral"
    OTHER = "other"


class TemplateStatus(str, Enum):
    """Template approval status"""
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class CreatorStatus(str, Enum):
    """Creator account status"""
    ACTIVE = "active"
    SUSPENDED = "suspended"
    BANNED = "banned"


class Template(BaseModel):
    """Template marketplace item"""
    model_config = ConfigDict(extra="ignore")
    
    template_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    preview_images: List[str] = []  # URLs to preview images
    demo_url: Optional[str] = None  # URL to live demo
    thumbnail: Optional[str] = None  # Main thumbnail image
    
    # Pricing
    price: int = 0  # Price in INR (0 for free)
    discounted_price: Optional[int] = None  # Sale price if any
    
    # Creator info
    creator_id: str
    creator_name: Optional[str] = None  # Cached for display
    
    # Categorization
    category: TemplateCategory
    event_types: List[EventType] = []  # Which events this template supports
    tags: List[str] = []  # Searchable tags
    
    # Template data
    design_config: Dict[str, Any] = {}  # Complete design configuration
    theme_config: Dict[str, Any] = {}  # Theme settings
    layout_structure: Dict[str, Any] = {}  # Layout structure
    
    # Status & Moderation
    status: TemplateStatus = TemplateStatus.DRAFT
    rejection_reason: Optional[str] = None
    is_featured: bool = False
    featured_order: int = 0
    
    # Performance & Quality
    performance_score: Optional[int] = None  # Lighthouse score (0-100)
    file_size_kb: Optional[int] = None  # Total file size
    has_passed_security: bool = False  # Security validation flag
    
    # Stats
    view_count: int = 0
    purchase_count: int = 0
    rating_average: float = 0.0
    rating_count: int = 0
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None  # Admin ID who approved
    
    @field_validator('name')
    def validate_name(cls, v):
        """Validate template name"""
        if not v or len(v.strip()) < 3:
            raise ValueError('Template name must be at least 3 characters')
        if len(v) > 100:
            raise ValueError('Template name must be 100 characters or less')
        return v.strip()
    
    @field_validator('price')
    def validate_price(cls, v):
        """Validate price is reasonable"""
        if v < 0:
            raise ValueError('Price cannot be negative')
        if v > 10000:
            raise ValueError('Price cannot exceed ₹10,000')
        return v
    
    @field_validator('tags')
    def validate_tags(cls, v):
        """Validate tags"""
        if len(v) > 20:
            raise ValueError('Maximum 20 tags allowed')
        return [tag.strip().lower() for tag in v if tag.strip()]


class TemplateCreate(BaseModel):
    """Request to create a new template"""
    name: str
    description: Optional[str] = None
    preview_images: List[str] = []
    demo_url: Optional[str] = None
    thumbnail: Optional[str] = None
    price: int = 0
    category: TemplateCategory
    event_types: List[EventType] = []
    tags: List[str] = []
    design_config: Dict[str, Any] = {}
    theme_config: Dict[str, Any] = {}
    layout_structure: Dict[str, Any] = {}


class TemplateUpdate(BaseModel):
    """Request to update template"""
    name: Optional[str] = None
    description: Optional[str] = None
    preview_images: Optional[List[str]] = None
    demo_url: Optional[str] = None
    thumbnail: Optional[str] = None
    price: Optional[int] = None
    discounted_price: Optional[int] = None
    category: Optional[TemplateCategory] = None
    event_types: Optional[List[EventType]] = None
    tags: Optional[List[str]] = None
    design_config: Optional[Dict[str, Any]] = None
    theme_config: Optional[Dict[str, Any]] = None
    layout_structure: Optional[Dict[str, Any]] = None


class TemplateResponse(BaseModel):
    """Response with template details"""
    template: Template
    is_purchased: bool = False
    creator: Optional[Dict[str, Any]] = None


class TemplateListResponse(BaseModel):
    """Response for template list"""
    templates: List[Template]
    total: int
    page: int
    page_size: int
    has_more: bool


class CreatorProfile(BaseModel):
    """Creator profile for template marketplace"""
    model_config = ConfigDict(extra="ignore")
    
    creator_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    admin_id: str  # Linked to admin account
    
    # Display info
    display_name: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    website_url: Optional[str] = None
    social_links: Dict[str, str] = {}  # {instagram: url, facebook: url, etc.}
    
    # Payout info
    payout_percentage: int = 70  # Default 70% to creator, 30% to platform
    total_earnings: int = 0  # Total earnings in INR
    pending_payout: int = 0  # Pending payout amount
    
    # Bank details (for payouts)
    bank_account_number: Optional[str] = None
    bank_ifsc_code: Optional[str] = None
    bank_account_name: Optional[str] = None
    upi_id: Optional[str] = None
    
    # Stats
    total_templates: int = 0
    approved_templates: int = 0
    total_sales: int = 0
    average_rating: float = 0.0
    
    # Status
    status: CreatorStatus = CreatorStatus.ACTIVE
    suspension_reason: Optional[str] = None
    
    # Verification
    is_verified: bool = False
    verification_badge: Optional[str] = None  # "verified", "top_creator", etc.
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_validator('display_name')
    def validate_display_name(cls, v):
        """Validate display name"""
        if not v or len(v.strip()) < 2:
            raise ValueError('Display name must be at least 2 characters')
        if len(v) > 50:
            raise ValueError('Display name must be 50 characters or less')
        return v.strip()
    
    @field_validator('payout_percentage')
    def validate_payout_percentage(cls, v):
        """Validate payout percentage"""
        if v < 0 or v > 100:
            raise ValueError('Payout percentage must be between 0 and 100')
        return v


class CreatorProfileCreate(BaseModel):
    """Request to create creator profile"""
    display_name: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    website_url: Optional[str] = None
    social_links: Dict[str, str] = {}


class CreatorProfileUpdate(BaseModel):
    """Request to update creator profile"""
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    website_url: Optional[str] = None
    social_links: Optional[Dict[str, str]] = None
    bank_account_number: Optional[str] = None
    bank_ifsc_code: Optional[str] = None
    bank_account_name: Optional[str] = None
    upi_id: Optional[str] = None


class CreatorProfileResponse(BaseModel):
    """Response with creator profile"""
    creator: CreatorProfile
    templates: List[Template] = []


class TemplatePurchase(BaseModel):
    """Record of template purchase"""
    model_config = ConfigDict(extra="ignore")
    
    purchase_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    template_id: str
    profile_id: str  # Profile that purchased the template
    
    # Pricing at time of purchase
    original_price: int
    credits_used: int = 0
    amount_paid: int = 0  # Actual amount paid in INR
    
    # Creator earnings
    creator_id: str
    creator_earnings: int = 0  # Amount creator will receive
    platform_fee: int = 0  # Platform commission
    
    # Metadata
    purchased_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payment_method: Optional[str] = None  # "credits", "razorpay", "hybrid"
    transaction_id: Optional[str] = None


class TemplatePurchaseRequest(BaseModel):
    """Request to purchase a template"""
    template_id: str
    profile_id: str
    use_credits: bool = False
    credits_to_use: int = 0


class TemplatePurchaseResponse(BaseModel):
    """Response after template purchase"""
    success: bool
    message: str
    purchase: Optional[TemplatePurchase] = None
    remaining_amount: int = 0
    payment_required: bool = False
    payment_order_id: Optional[str] = None


class TemplateReview(BaseModel):
    """Template rating and review"""
    model_config = ConfigDict(extra="ignore")
    
    review_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    template_id: str
    profile_id: str
    rating: int  # 1-5 stars
    comment: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_validator('rating')
    def validate_rating(cls, v):
        """Validate rating is 1-5"""
        if v < 1 or v > 5:
            raise ValueError('Rating must be between 1 and 5')
        return v


class TemplateReviewRequest(BaseModel):
    """Request to submit template review"""
    template_id: str
    rating: int
    comment: Optional[str] = None


class AdminTemplateReviewRequest(BaseModel):
    """Admin request to review template"""
    action: Literal["approve", "reject", "suspend"]
    rejection_reason: Optional[str] = None


class AdminCreatorActionRequest(BaseModel):
    """Admin action on creator"""
    action: Literal["suspend", "ban", "activate", "verify"]
    reason: Optional[str] = None


class TemplateEarnings(BaseModel):
    """Creator earnings analytics"""
    total_earnings: int
    pending_payout: int
    this_month_earnings: int
    last_month_earnings: int
    total_sales: int
    earnings_by_template: List[Dict[str, Any]] = []
    earnings_trend: List[Dict[str, Any]] = []  # Monthly trend


class TemplateStats(BaseModel):
    """Template performance statistics"""
    template_id: str
    template_name: str
    view_count: int
    purchase_count: int
    conversion_rate: float
    total_earnings: int
    rating_average: float
    rating_count: int


class MarketplaceFilters(BaseModel):
    """Filters for marketplace browsing"""
    category: Optional[TemplateCategory] = None
    event_type: Optional[EventType] = None
    min_price: Optional[int] = None
    max_price: Optional[int] = None
    is_free: Optional[bool] = None
    is_featured: Optional[bool] = None
    search: Optional[str] = None  # Search in name, description, tags
    sort_by: Literal["popular", "newest", "price_low", "price_high", "rating"] = "popular"
    page: int = 1
    page_size: int = 20



# ==========================================
# PHASE 36: CREDIT-BASED FEATURE GATING & CONSUMPTION ENGINE
# ==========================================

class FeatureCategory(str, Enum):
    """Feature category for credit consumption"""
    DESIGN = "design"
    ADDON = "addon"


class FeatureTier(str, Enum):
    """Feature tier for pricing"""
    NORMAL = "normal"
    GOD = "god"
    PREMIUM = "premium"


class FeatureConfig(BaseModel):
    """Feature configuration for credit-based gating"""
    feature_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    feature_key: str  # Unique identifier (e.g., "theme_royal_heritage", "addon_rsvp")
    name: str  # Display name
    description: Optional[str] = None
    category: FeatureCategory
    tier: FeatureTier
    credit_cost: int  # Credits required
    enabled: bool = True
    metadata: Dict[str, Any] = {}  # Additional config
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FeatureConfigResponse(BaseModel):
    """Response model for feature config"""
    features: List[FeatureConfig]
    total: int


class UpdateFeatureConfigRequest(BaseModel):
    """Request to update feature config (Super Admin only)"""
    credit_cost: Optional[int] = None
    enabled: Optional[bool] = None
    name: Optional[str] = None
    description: Optional[str] = None


class WeddingFeatureSelection(BaseModel):
    """Features selected for a wedding/profile (stored before publish)"""
    profile_id: str
    theme_feature_key: Optional[str] = None  # Selected theme
    addon_feature_keys: List[str] = []  # Selected add-ons
    estimated_credits: int = 0  # Calculated total
    is_published: bool = False
    published_at: Optional[datetime] = None
    credits_consumed: int = 0  # Actual credits deducted on publish
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PublishRequest(BaseModel):
    """Request to publish wedding with credit deduction"""
    profile_id: str
    confirm_credit_deduction: bool = True


class PublishResponse(BaseModel):
    """Response after publishing"""
    success: bool
    message: str
    credits_consumed: int
    remaining_credits: int
    profile_id: str
    published_at: datetime


class UpgradeRequest(BaseModel):
    """Request to upgrade wedding features post-publish"""
    profile_id: str
    new_theme_feature_key: Optional[str] = None
    new_addon_feature_keys: Optional[List[str]] = None
    confirm_credit_deduction: bool = True


class UpgradeResponse(BaseModel):
    """Response after upgrade"""
    success: bool
    message: str
    credits_consumed: int  # Difference charged
    remaining_credits: int
    profile_id: str
    upgraded_at: datetime


class CreditEstimateRequest(BaseModel):
    """Request to estimate credit cost"""
    theme_feature_key: Optional[str] = None
    addon_feature_keys: List[str] = []


class CreditEstimateResponse(BaseModel):
    """Response with credit estimate"""
    theme_cost: int
    addon_costs: Dict[str, int]
    total_cost: int
    available_credits: int
    can_afford: bool
    shortfall: int  # If can_afford is False


class FeatureUsageRecord(BaseModel):
    """Record of feature usage per wedding (for analytics)"""
    usage_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    admin_id: str
    feature_key: str
    category: FeatureCategory
    tier: FeatureTier
    credits_paid: int
    action: Literal["publish", "upgrade"]  # How credits were consumed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))




# ==========================================
# PHASE 37: WEDDING OWNERSHIP & LIFECYCLE
# ==========================================

class Wedding(BaseModel):
    """PHASE 37: Wedding Project entity with ownership and lifecycle management"""
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    admin_id: str  # Owner, mandatory
    title: str
    slug: str  # Unique, public URL identifier
    status: WeddingStatus = WeddingStatus.DRAFT
    selected_design_key: Optional[str] = None
    selected_features: List[str] = []  # Array of feature keys
    total_credit_cost: int = 0  # Calculated, not manually entered
    published_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Additional metadata
    profile_id: Optional[str] = None  # Link to existing Profile if needed
    description: Optional[str] = None
    wedding_date: Optional[datetime] = None
    

class WeddingCreate(BaseModel):
    """Request to create a new wedding"""
    title: str
    slug: str
    description: Optional[str] = None
    wedding_date: Optional[datetime] = None
    
    @field_validator('title')
    def validate_title(cls, v):
        """Validate title is not empty"""
        if not v or not v.strip():
            raise ValueError('Title cannot be empty')
        return v.strip()
    
    @field_validator('slug')
    def validate_slug(cls, v):
        """Validate slug format"""
        if not v or not v.strip():
            raise ValueError('Slug cannot be empty')
        # Slug must be lowercase alphanumeric with hyphens only
        pattern = r'^[a-z0-9]+(?:-[a-z0-9]+)*$'
        if not re.match(pattern, v.strip()):
            raise ValueError('Slug must contain only lowercase letters, numbers, and hyphens')
        return v.strip()


class WeddingUpdate(BaseModel):
    """Request to update wedding details"""
    title: Optional[str] = None
    description: Optional[str] = None
    wedding_date: Optional[datetime] = None
    selected_design_key: Optional[str] = None
    selected_features: Optional[List[str]] = None
    
    @field_validator('title')
    def validate_title(cls, v):
        """Validate title if provided"""
        if v is not None and (not v or not v.strip()):
            raise ValueError('Title cannot be empty')
        return v.strip() if v else v


class WeddingResponse(BaseModel):
    """Response model for Wedding data"""
    id: str
    admin_id: str
    title: str
    slug: str
    status: WeddingStatus
    selected_design_key: Optional[str]
    selected_features: List[str]
    total_credit_cost: int
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    profile_id: Optional[str]
    description: Optional[str]
    wedding_date: Optional[datetime]


class WeddingListResponse(BaseModel):
    """Response for listing weddings"""
    weddings: List[WeddingResponse]
    total: int


class WeddingCreditEstimateRequest(BaseModel):
    """Request to estimate credit cost for a wedding"""
    wedding_id: str
    design_key: Optional[str] = None
    feature_keys: List[str] = []


class WeddingCreditEstimateResponse(BaseModel):
    """Response with credit estimate for wedding"""
    wedding_id: str
    design_cost: int
    feature_costs: Dict[str, int]
    total_cost: int
    current_cost: int  # Current committed cost
    additional_cost: int  # Additional cost if changes applied
    available_credits: int
    can_afford: bool
    shortfall: int


class WeddingPublishRequest(BaseModel):
    """Request to publish a wedding"""
    wedding_id: str
    confirm_credit_deduction: bool = True


class WeddingPublishResponse(BaseModel):
    """Response after publishing wedding"""
    success: bool
    message: str
    wedding_id: str
    credits_consumed: int
    remaining_credits: int
    published_at: datetime
    public_url: str


class WeddingUpgradeRequest(BaseModel):
    """Request to upgrade wedding features post-publish"""
    wedding_id: str
    new_design_key: Optional[str] = None
    new_feature_keys: Optional[List[str]] = None
    confirm_credit_deduction: bool = True


class WeddingUpgradeResponse(BaseModel):
    """Response after upgrading wedding"""
    success: bool
    message: str
    wedding_id: str
    credits_consumed: int  # Difference charged
    remaining_credits: int
    upgraded_at: datetime


class WeddingArchiveRequest(BaseModel):
    """Request to archive a wedding"""
    wedding_id: str
    confirm_archive: bool = True


class WeddingArchiveResponse(BaseModel):
    """Response after archiving wedding"""
    success: bool
    message: str
    wedding_id: str
    archived_at: datetime


class WeddingStatusChangeRequest(BaseModel):
    """Request to change wedding status"""
    wedding_id: str
    new_status: WeddingStatus


class DesignPricing(BaseModel):
    """Pricing configuration for designs"""
    design_key: str
    design_name: str
    credit_cost: int
    description: Optional[str] = None


class FeaturePricing(BaseModel):
    """Pricing configuration for features"""
    feature_key: str
    feature_name: str
    credit_cost: int
    description: Optional[str] = None
    category: Optional[str] = None


class CreditPricingConfiguration(BaseModel):
    """Complete credit pricing configuration"""
    designs: List[DesignPricing]
    features: List[FeaturePricing]
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

