"""
Restructured Admin Panel Models
Hierarchical pricing structure: User/Photographer → Theme/Design → Features
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from enum import Enum
import uuid


class UserTypeCategory(str, Enum):
    """Main user type categories"""
    USER = "user"
    PHOTOGRAPHER = "photographer"


class PackType(str, Enum):
    """Pack type for credit packs"""
    FULL_THEME = "full_theme"  # Entire theme package
    RANDOM_DESIGN = "random_design"  # Individual designs


class PlanType(str, Enum):
    """Plan types for photographers"""
    MONTHLY = "monthly"  # Monthly subscription
    CREDITS = "credits"  # Credit purchase


# =====================================================================
# DESIGN PRICING (Hierarchical: User/Photographer → Design)
# =====================================================================

class DesignPrice(BaseModel):
    """Design pricing for user or photographer"""
    design_id: str
    design_name: str
    theme: str
    event_type: str
    credits: int  # Credits for this user type
    is_premium: bool = False
    preview_image_url: Optional[str] = None


class UserDesignPricing(BaseModel):
    """Collection of design prices for normal users"""
    user_type: UserTypeCategory = UserTypeCategory.USER
    designs: List[DesignPrice] = []
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PhotographerDesignPricing(BaseModel):
    """Collection of design prices for photographers"""
    user_type: UserTypeCategory = UserTypeCategory.PHOTOGRAPHER
    designs: List[DesignPrice] = []
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# =====================================================================
# CREDIT PACKS (User/Photographer → Full Theme / Random Design)
# =====================================================================

class ThemePackConfig(BaseModel):
    """Full theme pack configuration"""
    pack_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    theme_name: str  # "Temple", "Beach", "Mughal", etc.
    credits: int  # Credits for entire theme
    description: Optional[str] = None
    included_design_count: int = 0
    is_active: bool = True


class DesignPackConfig(BaseModel):
    """Random design pack configuration"""
    pack_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pack_name: str  # "5 Designs Pack", "10 Designs Pack"
    design_count: int  # Number of designs included
    credits_per_design: int  # Credits per design in pack
    total_credits: int  # Total credits for pack
    description: Optional[str] = None
    is_active: bool = True


class CreditPackCategory(BaseModel):
    """Credit pack category for user type"""
    category_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_type: UserTypeCategory
    pack_type: PackType  # full_theme or random_design
    
    # Theme packs (if pack_type = full_theme)
    theme_packs: List[ThemePackConfig] = []
    
    # Design packs (if pack_type = random_design)
    design_packs: List[DesignPackConfig] = []
    
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# =====================================================================
# PLANS & PRICING (User: Credits | Photographer: Monthly + Credits)
# =====================================================================

class CreditPlan(BaseModel):
    """Credit purchase plan (for users and photographers)"""
    plan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # "Starter Pack", "Pro Pack"
    description: Optional[str] = None
    credits: int
    price: float  # Regular price in INR
    
    # Discount
    discount_enabled: bool = False
    discounted_price: Optional[float] = None
    discount_percentage: Optional[int] = None
    
    user_type: UserTypeCategory
    is_active: bool = True
    is_featured: bool = False
    display_order: int = 0
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MonthlyPlan(BaseModel):
    """Monthly subscription plan (photographers only)"""
    plan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # "30 Days Plan", "90 Days Plan"
    description: Optional[str] = None
    
    # Duration
    days: int  # 30, 60, 90, etc.
    
    # Included credits
    included_credits: int
    price: float  # Monthly price in INR
    
    # Overflow credits (when monthly credits exhausted)
    overflow_credits_enabled: bool = True
    overflow_price_per_100_credits: Optional[float] = None  # Different price for extra credits
    
    # Discount
    discount_enabled: bool = False
    discounted_price: Optional[float] = None
    discount_percentage: Optional[int] = None
    
    is_active: bool = True
    is_featured: bool = False
    display_order: int = 0
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PlansAndPricing(BaseModel):
    """Complete plans and pricing structure"""
    pricing_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # User plans (credit purchases only)
    user_credit_plans: List[CreditPlan] = []
    
    # Photographer plans (monthly + credits)
    photographer_monthly_plans: List[MonthlyPlan] = []
    photographer_credit_plans: List[CreditPlan] = []
    
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# =====================================================================
# DEFAULT DESIGN PRICING
# =====================================================================

class DefaultDesignPrice(BaseModel):
    """Default pricing for designs when user opens page"""
    design_id: str
    design_name: str
    theme: str
    event_type: str
    default_user_credits: int = 50  # Default for users
    default_photographer_credits: int = 30  # Default for photographers


# =====================================================================
# ADMIN PANEL REQUEST MODELS
# =====================================================================

class UpdateDesignPriceRequest(BaseModel):
    """Update design price for specific user type"""
    design_id: str
    credits: int


class CreateThemePackRequest(BaseModel):
    """Create theme pack"""
    theme_name: str
    credits: int
    description: Optional[str] = None


class CreateDesignPackRequest(BaseModel):
    """Create design pack"""
    pack_name: str
    design_count: int
    credits_per_design: int
    description: Optional[str] = None


class CreateCreditPlanRequest(BaseModel):
    """Create credit plan"""
    name: str
    description: Optional[str] = None
    credits: int
    price: float
    user_type: UserTypeCategory
    discount_enabled: bool = False
    discounted_price: Optional[float] = None
    is_featured: bool = False


class UpdateCreditPlanRequest(BaseModel):
    """Update credit plan"""
    plan_id: str
    name: Optional[str] = None
    credits: Optional[int] = None
    price: Optional[float] = None
    discount_enabled: Optional[bool] = None
    discounted_price: Optional[float] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None


class CreateMonthlyPlanRequest(BaseModel):
    """Create monthly plan"""
    name: str
    description: Optional[str] = None
    days: int
    included_credits: int
    price: float
    overflow_credits_enabled: bool = True
    overflow_price_per_100_credits: Optional[float] = None
    discount_enabled: bool = False
    discounted_price: Optional[float] = None
    is_featured: bool = False


class UpdateMonthlyPlanRequest(BaseModel):
    """Update monthly plan"""
    plan_id: str
    name: Optional[str] = None
    days: Optional[int] = None
    included_credits: Optional[int] = None
    price: Optional[float] = None
    overflow_price_per_100_credits: Optional[float] = None
    discount_enabled: Optional[bool] = None
    discounted_price: Optional[float] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
