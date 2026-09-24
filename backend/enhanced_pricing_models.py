"""
Enhanced Pricing Models for Dynamic Feature-Based Credit System
Supports time-based expiry, per-feature pricing, theme packs, and user/photographer differentiation
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from enum import Enum
import uuid


class UserTypeEnum(str, Enum):
    """User type for pricing differentiation"""
    USER = "user"  # Normal user (higher prices)
    PHOTOGRAPHER = "photographer"  # Photographer (lower prices, bulk discounts)


class FeatureType(str, Enum):
    """Available features for invitations"""
    QR_CODE = "qr_code"
    AI_COMPRESSION = "ai_compression"
    FACE_COMPARISON = "face_comparison"
    DIGITAL_SHAGUN = "digital_shagun"
    LIVE_GALLERY = "live_gallery"
    GUEST_UPLOAD = "guest_upload"
    RSVP = "rsvp"
    SMS_INVITES = "sms_invites"
    CUSTOM_DOMAIN = "custom_domain"


class DurationOption(BaseModel):
    """Time duration options for link expiry"""
    duration_id: str
    label: str  # "1 Day", "7 Days", "30 Days", "Unlimited"
    days: Optional[int] = None  # None = unlimited
    user_credits: int  # Credits for normal users
    photographer_credits: int  # Credits for photographers
    is_active: bool = True


class FeaturePricing(BaseModel):
    """Dynamic feature pricing with enable/disable per event"""
    feature_id: str
    feature_type: FeatureType
    feature_name: str
    description: Optional[str] = None
    
    # Pricing for different user types
    user_credits: int  # Credits for normal users
    photographer_credits: int  # Credits for photographers
    is_free: bool = False  # Toggle for free feature
    
    # Event-specific availability
    available_for_events: List[str] = []  # ["engagement", "marriage", "haldi", etc.]
    enabled_by_default: bool = True
    
    # Educational content (for features like QR)
    info_text: Optional[str] = None
    tutorial_video_url: Optional[str] = None
    
    is_active: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DesignPricing(BaseModel):
    """Individual design pricing with base cost"""
    design_id: str
    design_name: str
    theme: str  # "Temple", "Beach", "Mughal", etc.
    event_type: str  # "engagement", "marriage", "haldi", etc.
    
    # Base pricing (before features)
    base_user_credits: int
    base_photographer_credits: int
    
    is_premium: bool = False
    preview_image_url: Optional[str] = None
    
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ThemePricing(BaseModel):
    """Theme package pricing (all designs in a theme)"""
    theme_id: str
    theme_name: str
    description: Optional[str] = None
    
    # Base theme package price
    user_credits: int
    photographer_credits: int
    
    # Designs included in theme
    included_design_ids: List[str] = []
    
    # Discount for pack vs individual
    savings_percentage: int = 0  # e.g., 20% savings
    
    is_active: bool = True
    is_featured: bool = False
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MixedThemePricing(BaseModel):
    """Pricing for selecting designs from multiple themes"""
    pricing_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Mixed Theme Selection"
    description: str = "Select different designs from different themes"
    
    # Additional charge for mixed themes
    user_additional_credits: int  # Extra credits for users
    photographer_additional_credits: int  # Extra credits for photographers
    
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MonthlyPack(BaseModel):
    """Monthly subscription pack for photographers"""
    pack_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    
    # Pricing
    monthly_price: float  # Price in currency
    credits_included: int  # Credits per month
    
    # Benefits
    unlimited_designs: bool = False
    discount_percentage: int = 0  # Additional discount on credit purchases
    
    is_active: bool = True
    is_featured: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PurchaseRequest(BaseModel):
    """Request to purchase a design with selected features"""
    design_id: str
    user_type: UserTypeEnum
    
    # Selected features
    selected_features: List[str] = []  # List of feature_ids
    
    # Duration selection
    duration_id: str
    
    # Mixed theme flag
    is_mixed_theme: bool = False
    
    # Event type
    event_type: str


class PurchaseCalculation(BaseModel):
    """Calculated pricing breakdown"""
    base_credits: int
    feature_credits: Dict[str, int] = {}
    duration_credits: int
    mixed_theme_credits: int = 0
    total_credits: int
    
    # Breakdown details
    breakdown: List[Dict[str, Any]] = []


class CreditPackageEnhanced(BaseModel):
    """Enhanced credit package with discount support"""
    package_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    credits: int
    
    # Pricing
    price: float  # Regular price
    discounted_price: Optional[float] = None
    discount_percentage: Optional[int] = None
    
    # User type specific
    user_type: UserTypeEnum
    
    is_active: bool = True
    is_featured: bool = False
    display_order: int = 0
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# =====================================================================
# Admin Panel Request/Response Models
# =====================================================================

class FeaturePricingUpdate(BaseModel):
    """Admin update for feature pricing"""
    feature_id: str
    user_credits: Optional[int] = None
    photographer_credits: Optional[int] = None
    is_free: Optional[bool] = None
    available_for_events: Optional[List[str]] = None
    enabled_by_default: Optional[bool] = None
    info_text: Optional[str] = None
    tutorial_video_url: Optional[str] = None
    is_active: Optional[bool] = None


class DesignPricingUpdate(BaseModel):
    """Admin update for design pricing"""
    design_id: str
    base_user_credits: Optional[int] = None
    base_photographer_credits: Optional[int] = None
    is_premium: Optional[bool] = None


class DurationOptionUpdate(BaseModel):
    """Admin update for duration options"""
    duration_id: str
    user_credits: Optional[int] = None
    photographer_credits: Optional[int] = None
    is_active: Optional[bool] = None


class ThemePricingUpdate(BaseModel):
    """Admin update for theme pricing"""
    theme_id: str
    user_credits: Optional[int] = None
    photographer_credits: Optional[int] = None
    included_design_ids: Optional[List[str]] = None
    savings_percentage: Optional[int] = None
    is_active: Optional[bool] = None


class MonthlyPackCreate(BaseModel):
    """Create monthly pack for photographers"""
    name: str
    description: Optional[str] = None
    monthly_price: float
    credits_included: int
    unlimited_designs: bool = False
    discount_percentage: int = 0
    is_featured: bool = False


class MonthlyPackUpdate(BaseModel):
    """Update monthly pack"""
    pack_id: str
    name: Optional[str] = None
    description: Optional[str] = None
    monthly_price: Optional[float] = None
    credits_included: Optional[int] = None
    unlimited_designs: Optional[bool] = None
    discount_percentage: Optional[int] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
