"""
PHASE 36: Feature Registry - Credit-Based Feature Gating

Central source of truth for all features and their credit costs.
This registry defines what features exist and how much they cost.
"""

from typing import Dict, List, Optional
from models import FeatureConfig, FeatureCategory, FeatureTier


# ==========================================
# THEME DESIGNS - Credit Costs
# ==========================================

THEME_FEATURES = [
    # FREE THEMES (from Phase 34)
    FeatureConfig(
        feature_key="theme_royal_heritage",
        name="Royal Heritage Theme",
        description="Crimson and gold traditional theme",
        category=FeatureCategory.DESIGN,
        tier=FeatureTier.NORMAL,
        credit_cost=5,
        enabled=True,
        metadata={"theme_id": "royal_heritage", "plan_required": "FREE"}
    ),
    FeatureConfig(
        feature_key="theme_temple_gold",
        name="Temple Gold Theme",
        description="Gold and brown temple-inspired theme",
        category=FeatureCategory.DESIGN,
        tier=FeatureTier.NORMAL,
        credit_cost=5,
        enabled=True,
        metadata={"theme_id": "temple_gold", "plan_required": "FREE"}
    ),
    
    # SILVER THEMES
    FeatureConfig(
        feature_key="theme_peacock_dream",
        name="Peacock Dream Theme",
        description="Teal and emerald vibrant theme",
        category=FeatureCategory.DESIGN,
        tier=FeatureTier.NORMAL,
        credit_cost=8,
        enabled=True,
        metadata={"theme_id": "peacock_dream", "plan_required": "SILVER"}
    ),
    FeatureConfig(
        feature_key="theme_modern_lotus",
        name="Modern Lotus Theme",
        description="Pink and lavender modern theme",
        category=FeatureCategory.DESIGN,
        tier=FeatureTier.NORMAL,
        credit_cost=8,
        enabled=True,
        metadata={"theme_id": "modern_lotus", "plan_required": "SILVER"}
    ),
    
    # GOLD THEMES
    FeatureConfig(
        feature_key="theme_modern_pastel",
        name="Modern Pastel Theme",
        description="Rose, sage, and sand minimalist theme",
        category=FeatureCategory.DESIGN,
        tier=FeatureTier.PREMIUM,
        credit_cost=12,
        enabled=True,
        metadata={"theme_id": "modern_pastel", "plan_required": "GOLD"}
    ),
    FeatureConfig(
        feature_key="theme_midnight_sangeet",
        name="Midnight Sangeet Theme",
        description="Indigo and silver festive theme",
        category=FeatureCategory.DESIGN,
        tier=FeatureTier.PREMIUM,
        credit_cost=12,
        enabled=True,
        metadata={"theme_id": "midnight_sangeet", "plan_required": "GOLD"}
    ),
    
    # PLATINUM THEMES (GOD TIER)
    FeatureConfig(
        feature_key="theme_ivory_elegance",
        name="Ivory Elegance Theme",
        description="Ivory and champagne luxury theme",
        category=FeatureCategory.DESIGN,
        tier=FeatureTier.GOD,
        credit_cost=20,
        enabled=True,
        metadata={"theme_id": "ivory_elegance", "plan_required": "PLATINUM"}
    ),
    FeatureConfig(
        feature_key="theme_dark_royal",
        name="Dark Royal Theme",
        description="Purple and gold regal theme",
        category=FeatureCategory.DESIGN,
        tier=FeatureTier.GOD,
        credit_cost=20,
        enabled=True,
        metadata={"theme_id": "dark_royal", "plan_required": "PLATINUM"}
    ),
]


# ==========================================
# ADD-ON FEATURES - Credit Costs
# ==========================================

ADDON_FEATURES = [
    FeatureConfig(
        feature_key="addon_rsvp",
        name="RSVP System",
        description="Guest RSVP collection and management",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.NORMAL,
        credit_cost=3,
        enabled=True,
        metadata={"includes": ["guest_responses", "attendance_tracking", "meal_preferences"]}
    ),
    FeatureConfig(
        feature_key="addon_guest_wishes",
        name="Guest Wishes & Greetings",
        description="Interactive guest message board",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.NORMAL,
        credit_cost=2,
        enabled=True,
        metadata={"includes": ["wish_collection", "reactions", "moderation"]}
    ),
    FeatureConfig(
        feature_key="addon_analytics",
        name="Analytics Dashboard",
        description="Detailed view and engagement analytics",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.PREMIUM,
        credit_cost=5,
        enabled=True,
        metadata={"includes": ["view_tracking", "device_analytics", "location_data", "engagement_metrics"]}
    ),
    FeatureConfig(
        feature_key="addon_live_gallery",
        name="Live Wedding Gallery",
        description="Post-wedding photo album with upload",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.PREMIUM,
        credit_cost=4,
        enabled=True,
        metadata={"includes": ["photo_upload", "gallery_view", "download_option"]}
    ),
    FeatureConfig(
        feature_key="addon_qr_code",
        name="QR Code Generation",
        description="Shareable QR code for invitation",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.NORMAL,
        credit_cost=1,
        enabled=True,
        metadata={"includes": ["qr_generation", "print_ready"]}
    ),
    FeatureConfig(
        feature_key="addon_ai_translation",
        name="AI Translation",
        description="Multi-language support with AI",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.PREMIUM,
        credit_cost=3,
        enabled=True,
        metadata={"includes": ["english", "hindi", "telugu", "tamil"]}
    ),
    FeatureConfig(
        feature_key="addon_background_music",
        name="Background Music",
        description="Custom background music for invitation",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.NORMAL,
        credit_cost=2,
        enabled=True,
        metadata={"includes": ["music_playback", "autoplay_option"]}
    ),
    FeatureConfig(
        feature_key="addon_video_intro",
        name="Video Introduction",
        description="Video hero section for invitation",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.PREMIUM,
        credit_cost=4,
        enabled=True,
        metadata={"includes": ["video_upload", "autoplay", "mobile_optimization"]}
    ),
    FeatureConfig(
        feature_key="addon_glassmorphism",
        name="Glassmorphism Effects",
        description="Premium glass-blur card effects",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.PREMIUM,
        credit_cost=2,
        enabled=True,
        metadata={"includes": ["glass_cards", "blur_effects", "transparency"]}
    ),
    FeatureConfig(
        feature_key="addon_animations",
        name="Advanced Animations",
        description="Festive micro-animations and transitions",
        category=FeatureCategory.ADDON,
        tier=FeatureTier.NORMAL,
        credit_cost=2,
        enabled=True,
        metadata={"includes": ["scroll_animations", "entrance_effects", "button_interactions"]}
    ),
]


# ==========================================
# FEATURE REGISTRY - In-Memory Cache
# ==========================================

class FeatureRegistry:
    """Central registry for all features and their credit costs"""
    
    def __init__(self):
        self._features: Dict[str, FeatureConfig] = {}
        self._load_default_features()
    
    def _load_default_features(self):
        """Load default features into registry"""
        all_features = THEME_FEATURES + ADDON_FEATURES
        for feature in all_features:
            self._features[feature.feature_key] = feature
    
    def get_feature(self, feature_key: str) -> Optional[FeatureConfig]:
        """Get feature by key"""
        return self._features.get(feature_key)
    
    def get_all_features(self) -> List[FeatureConfig]:
        """Get all features"""
        return list(self._features.values())
    
    def get_features_by_category(self, category: FeatureCategory) -> List[FeatureConfig]:
        """Get features by category"""
        return [f for f in self._features.values() if f.category == category]
    
    def get_features_by_tier(self, tier: FeatureTier) -> List[FeatureConfig]:
        """Get features by tier"""
        return [f for f in self._features.values() if f.tier == tier]
    
    def get_enabled_features(self) -> List[FeatureConfig]:
        """Get only enabled features"""
        return [f for f in self._features.values() if f.enabled]
    
    def update_feature(self, feature_key: str, **updates) -> bool:
        """Update feature configuration (Super Admin only)"""
        if feature_key not in self._features:
            return False
        
        feature = self._features[feature_key]
        
        # Update allowed fields
        if 'credit_cost' in updates:
            feature.credit_cost = updates['credit_cost']
        if 'enabled' in updates:
            feature.enabled = updates['enabled']
        if 'name' in updates:
            feature.name = updates['name']
        if 'description' in updates:
            feature.description = updates['description']
        
        feature.updated_at = datetime.now(timezone.utc)
        return True
    
    def calculate_cost(self, feature_keys: List[str]) -> int:
        """Calculate total credit cost for given features"""
        total = 0
        for key in feature_keys:
            feature = self.get_feature(key)
            if feature and feature.enabled:
                total += feature.credit_cost
        return total
    
    def get_theme_cost(self, theme_feature_key: Optional[str]) -> int:
        """Get cost of a specific theme"""
        if not theme_feature_key:
            return 0
        feature = self.get_feature(theme_feature_key)
        return feature.credit_cost if feature and feature.enabled else 0
    
    def get_addon_costs(self, addon_keys: List[str]) -> Dict[str, int]:
        """Get individual costs of add-ons"""
        costs = {}
        for key in addon_keys:
            feature = self.get_feature(key)
            if feature and feature.enabled:
                costs[key] = feature.credit_cost
        return costs


# ==========================================
# GLOBAL REGISTRY INSTANCE
# ==========================================

# Singleton instance
feature_registry = FeatureRegistry()


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def get_feature_registry() -> FeatureRegistry:
    """Get global feature registry instance"""
    return feature_registry


def calculate_total_cost(
    theme_feature_key: Optional[str],
    addon_feature_keys: List[str]
) -> int:
    """Calculate total credit cost for theme + add-ons"""
    registry = get_feature_registry()
    theme_cost = registry.get_theme_cost(theme_feature_key)
    addon_cost = registry.calculate_cost(addon_feature_keys)
    return theme_cost + addon_cost


def calculate_upgrade_cost(
    current_theme_key: Optional[str],
    current_addon_keys: List[str],
    new_theme_key: Optional[str],
    new_addon_keys: List[str]
) -> int:
    """
    Calculate ONLY the difference in credits for upgrade.
    
    Rules:
    - If upgrading to higher tier theme: charge difference
    - If downgrading theme: NO REFUND (charge 0)
    - Add-ons: charge only for NEW add-ons not in current list
    - Removing add-ons: NO REFUND
    """
    registry = get_feature_registry()
    
    # Calculate theme difference
    current_theme_cost = registry.get_theme_cost(current_theme_key) if current_theme_key else 0
    new_theme_cost = registry.get_theme_cost(new_theme_key) if new_theme_key else 0
    
    theme_difference = max(0, new_theme_cost - current_theme_cost)  # No refunds
    
    # Calculate add-on difference (only NEW add-ons)
    current_addon_set = set(current_addon_keys)
    new_addon_set = set(new_addon_keys)
    
    newly_added_addons = new_addon_set - current_addon_set
    addon_cost = registry.calculate_cost(list(newly_added_addons))
    
    return theme_difference + addon_cost


from datetime import datetime, timezone
