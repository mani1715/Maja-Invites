"""
Dynamic Pricing Calculation Service
Calculates credits based on design, features, duration, and user type
"""
from typing import Dict, List
from pg_adapter import Database as AsyncIOMotorDatabase
import logging

from enhanced_pricing_models import (
    UserTypeEnum, PurchaseRequest, PurchaseCalculation
)

logger = logging.getLogger(__name__)


class PricingCalculationService:
    """Service to calculate dynamic pricing based on selections"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def calculate_purchase_price(
        self,
        request: PurchaseRequest
    ) -> PurchaseCalculation:
        """
        Calculate total credits for a design purchase
        
        Args:
            request: Purchase request with design, features, duration
        
        Returns:
            PurchaseCalculation with breakdown
        """
        breakdown = []
        
        # 1. Get base design pricing
        design = await self.db.design_pricing_enhanced.find_one(
            {"design_id": request.design_id}
        )
        
        if not design:
            raise ValueError(f"Design {request.design_id} not found")
        
        if request.user_type == UserTypeEnum.USER:
            base_credits = design.get("base_user_credits", 0)
        else:
            base_credits = design.get("base_photographer_credits", 0)
        
        breakdown.append({
            "item": f"{design['design_name']} (Base)",
            "credits": base_credits,
            "type": "base"
        })
        
        # 2. Calculate feature credits
        feature_credits = {}
        total_feature_credits = 0
        
        for feature_id in request.selected_features:
            feature = await self.db.feature_pricing_enhanced.find_one(
                {"feature_id": feature_id}
            )
            
            if not feature:
                continue
            
            # Check if feature is available for this event type
            if feature.get("available_for_events") and \
               request.event_type not in feature.get("available_for_events", []):
                continue
            
            if feature.get("is_free", False):
                credits = 0
            else:
                if request.user_type == UserTypeEnum.USER:
                    credits = feature.get("user_credits", 0)
                else:
                    credits = feature.get("photographer_credits", 0)
            
            feature_credits[feature_id] = credits
            total_feature_credits += credits
            
            breakdown.append({
                "item": feature.get("feature_name", "Feature"),
                "credits": credits,
                "type": "feature",
                "feature_id": feature_id
            })
        
        # 3. Calculate duration credits
        duration = await self.db.duration_options.find_one(
            {"duration_id": request.duration_id}
        )
        
        if not duration:
            raise ValueError(f"Duration {request.duration_id} not found")
        
        if request.user_type == UserTypeEnum.USER:
            duration_credits = duration.get("user_credits", 0)
        else:
            duration_credits = duration.get("photographer_credits", 0)
        
        breakdown.append({
            "item": f"Duration: {duration.get('label', 'Unknown')}",
            "credits": duration_credits,
            "type": "duration"
        })
        
        # 4. Calculate mixed theme surcharge (if applicable)
        mixed_theme_credits = 0
        if request.is_mixed_theme:
            mixed_pricing = await self.db.mixed_theme_pricing.find_one({})
            
            if mixed_pricing:
                if request.user_type == UserTypeEnum.USER:
                    mixed_theme_credits = mixed_pricing.get("user_additional_credits", 0)
                else:
                    mixed_theme_credits = mixed_pricing.get("photographer_additional_credits", 0)
                
                breakdown.append({
                    "item": "Mixed Theme Selection",
                    "credits": mixed_theme_credits,
                    "type": "mixed_theme"
                })
        
        # 5. Calculate total
        total_credits = base_credits + total_feature_credits + duration_credits + mixed_theme_credits
        
        return PurchaseCalculation(
            base_credits=base_credits,
            feature_credits=feature_credits,
            duration_credits=duration_credits,
            mixed_theme_credits=mixed_theme_credits,
            total_credits=total_credits,
            breakdown=breakdown
        )
    
    async def calculate_theme_pack_price(
        self,
        theme_id: str,
        user_type: UserTypeEnum,
        event_features: Dict[str, List[str]],  # {"engagement": ["qr_code"], "marriage": ["ai_compression"]}
        duration_id: str
    ) -> PurchaseCalculation:
        """
        Calculate theme pack price with per-event feature selection
        
        Args:
            theme_id: Theme package ID
            user_type: USER or PHOTOGRAPHER
            event_features: Dict of event_type -> list of feature_ids
            duration_id: Duration option ID
        
        Returns:
            PurchaseCalculation with full breakdown
        """
        breakdown = []
        
        # 1. Get base theme pricing
        theme = await self.db.theme_pricing_enhanced.find_one(
            {"theme_id": theme_id}
        )
        
        if not theme:
            raise ValueError(f"Theme {theme_id} not found")
        
        if user_type == UserTypeEnum.USER:
            base_credits = theme.get("user_credits", 0)
        else:
            base_credits = theme.get("photographer_credits", 0)
        
        breakdown.append({
            "item": f"{theme['theme_name']} Pack (Base)",
            "credits": base_credits,
            "type": "theme_base"
        })
        
        # 2. Calculate feature credits per event
        total_feature_credits = 0
        feature_credits = {}
        
        for event_type, feature_ids in event_features.items():
            for feature_id in feature_ids:
                feature = await self.db.feature_pricing_enhanced.find_one(
                    {"feature_id": feature_id}
                )
                
                if not feature:
                    continue
                
                # Pack features have reduced pricing (check if pack_discount exists)
                if user_type == UserTypeEnum.USER:
                    credits = feature.get("user_credits", 0)
                else:
                    credits = feature.get("photographer_credits", 0)
                
                # Apply pack discount (20% off features in packs)
                pack_discount = 0.8
                credits = int(credits * pack_discount)
                
                feature_key = f"{event_type}_{feature_id}"
                feature_credits[feature_key] = credits
                total_feature_credits += credits
                
                breakdown.append({
                    "item": f"{event_type.title()}: {feature.get('feature_name', 'Feature')}",
                    "credits": credits,
                    "type": "pack_feature",
                    "event_type": event_type,
                    "feature_id": feature_id
                })
        
        # 3. Duration credits
        duration = await self.db.duration_options.find_one(
            {"duration_id": duration_id}
        )
        
        if duration:
            if user_type == UserTypeEnum.USER:
                duration_credits = duration.get("user_credits", 0)
            else:
                duration_credits = duration.get("photographer_credits", 0)
            
            breakdown.append({
                "item": f"Duration: {duration.get('label', 'Unknown')}",
                "credits": duration_credits,
                "type": "duration"
            })
        else:
            duration_credits = 0
        
        # 4. Calculate total
        total_credits = base_credits + total_feature_credits + duration_credits
        
        return PurchaseCalculation(
            base_credits=base_credits,
            feature_credits=feature_credits,
            duration_credits=duration_credits,
            mixed_theme_credits=0,
            total_credits=total_credits,
            breakdown=breakdown
        )
    
    async def get_available_features_for_event(
        self,
        event_type: str
    ) -> List[Dict]:
        """Get all available features for a specific event type"""
        features = await self.db.feature_pricing_enhanced.find(
            {
                "is_active": True,
                "$or": [
                    {"available_for_events": event_type},
                    {"available_for_events": {"$size": 0}}  # Available for all
                ]
            },
            {"_id": 0}
        ).to_list(100)
        
        return features
    
    async def get_duration_options(self) -> List[Dict]:
        """Get all available duration options"""
        durations = await self.db.duration_options.find(
            {"is_active": True},
            {"_id": 0}
        ).to_list(100)
        
        return durations
