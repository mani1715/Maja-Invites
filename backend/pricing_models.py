"""
Credit Package Management System
Design, theme and feature pricing models.

Renamed from credit_packages.py: the credit-package models are deleted and
nothing here prices in credits any more.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from enum import Enum
import uuid


class UserType(str, Enum):
    """User type for pricing differentiation"""
    PHOTOGRAPHER = "photographer"  # Admin/photographer creating for clients
    USER = "user"  # Self-service customer




class DesignPricing(BaseModel):
    """Individual design credit pricing"""
    design_id: str  # Unique design identifier
    design_name: str  # Display name
    theme: str  # Theme name (e.g., "Temple", "Beach", "Mughal")
    event_type: str  # Event type (engagement, marriage, haldi, etc.)
    credits_required: int  # Credits needed to use this design
    is_premium: bool = False  # Premium designs cost more
    
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ThemePackage(BaseModel):
    """Customizable theme package with selected designs"""
    package_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g., "Temple Complete Package"
    description: Optional[str] = None
    theme: str  # Theme name (e.g., "Temple", "Beach")
    
    # Selected designs included in package
    included_design_ids: List[str] = []  # List of design IDs included
    
    # Package pricing
    total_credits: int  # Total credits for the package
    individual_credit_sum: int  # Sum if bought individually (for showing savings)
    
    # Package metadata
    is_active: bool = True
    is_featured: bool = False
    display_order: int = 0
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FeaturePricing(BaseModel):
    """Credit pricing for features"""
    feature_id: str
    feature_name: str  # e.g., "QR Code Generation", "AI Image Compression"
    description: Optional[str] = None
    credits_required: int
    is_active: bool = True
    
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))






class DesignPricingUpdate(BaseModel):
    """Request to update design pricing"""
    design_id: str
    credits_required: int
    is_premium: bool = False


class ThemePackageCreate(BaseModel):
    """Request to create theme package"""
    name: str
    description: Optional[str] = None
    theme: str
    included_design_ids: List[str]
    total_credits: int
    is_featured: bool = False
    display_order: int = 0


class ThemePackageUpdate(BaseModel):
    """Request to update theme package"""
    name: Optional[str] = None
    description: Optional[str] = None
    included_design_ids: Optional[List[str]] = None
    total_credits: Optional[int] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    display_order: Optional[int] = None


class FeaturePricingUpdate(BaseModel):
    """Request to update feature pricing"""
    feature_id: str
    credits_required: int
    is_active: bool = True


class GiftCreditsRequest(BaseModel):
    """Request to gift credits to a user/photographer"""
    target_user_id: str  # User/photographer ID to gift credits to
    credits: int  # Number of credits to gift
    reason: str  # Reason for gifting (for audit trail)


class PurchaseCreditPackageRequest(BaseModel):
    """Request to purchase a credit package"""
    package_id: str
    user_type: UserType  # photographer or user
