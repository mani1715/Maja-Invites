"""
Enhanced Admin Panel Service
Manages all pricing configurations, features, durations, packs, and monthly subscriptions
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pg_adapter import Database as AsyncIOMotorDatabase
import logging

from enhanced_pricing_models import (
    FeaturePricing, FeaturePricingUpdate,
    DesignPricingUpdate, DurationOption,
    DurationOptionUpdate, ThemePricing,
    ThemePricingUpdate, MixedThemePricing,
    MonthlyPack,
    MonthlyPackCreate, MonthlyPackUpdate
)

logger = logging.getLogger(__name__)


def build_enhanced_admin_router(
    db: AsyncIOMotorDatabase,
    require_super_admin
) -> APIRouter:
    """Build enhanced admin router for comprehensive pricing management"""
    router = APIRouter(prefix="/api/admin/pricing", tags=["admin_pricing"])
    
    # =====================================================================
    # FEATURE PRICING MANAGEMENT
    # =====================================================================
    
    @router.get("/features")
    async def list_feature_pricing(
        current_admin: dict = Depends(require_super_admin)
    ):
        """List all feature pricing configurations"""
        try:
            features = await db.feature_pricing_enhanced.find(
                {},
                {"_id": 0}
            ).to_list(100)
            
            return {
                "success": True,
                "features": features,
                "count": len(features)
            }
        except Exception as e:
            logger.error(f"Error listing features: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/features")
    async def create_feature_pricing(
        feature: FeaturePricing,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Create new feature pricing"""
        try:
            await db.feature_pricing_enhanced.insert_one(feature.dict())
            
            return {
                "success": True,
                "message": "Feature pricing created",
                "feature_id": feature.feature_id
            }
        except Exception as e:
            logger.error(f"Error creating feature: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.put("/features/{feature_id}")
    async def update_feature_pricing(
        feature_id: str,
        update: FeaturePricingUpdate,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Update feature pricing"""
        try:
            update_data = {k: v for k, v in update.dict().items() if v is not None}
            update_data["updated_at"] = datetime.now(timezone.utc)
            
            result = await db.feature_pricing_enhanced.update_one(
                {"feature_id": feature_id},
                {"$set": update_data}
            )
            
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Feature not found")
            
            return {
                "success": True,
                "message": "Feature pricing updated"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating feature: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    # =====================================================================
    # DESIGN PRICING MANAGEMENT
    # =====================================================================
    
    # Was "/designs" (-> /api/admin/pricing/designs), registered ahead of
    # pricing_hub_service.py's canonical GET at the SAME path (server.py:
    # enhanced_admin_router included ~line 15862, build_pricing_hub_router
    # ~line 16478) — FastAPI matches route order, so this one always won and
    # the canonical resolver-backed endpoint (db.pricing_design_prices) was
    # unreachable. Renamed rather than deleted: frontend/ (legacy CRA, not
    # deployed — PricingEngineHub.jsx) still calls this exact db.
    # design_pricing_enhanced-backed shape; frontend-v2 has no caller of
    # either path (grepped src/api/*.js before this change).
    @router.get("/designs-enhanced")
    async def list_design_pricing(
        theme: Optional[str] = None,
        event_type: Optional[str] = None,
        current_admin: dict = Depends(require_super_admin)
    ):
        """List all design pricing"""
        try:
            query = {}
            if theme:
                query["theme"] = theme
            if event_type:
                query["event_type"] = event_type
            
            designs = await db.design_pricing_enhanced.find(
                query,
                {"_id": 0}
            ).to_list(1000)
            
            return {
                "success": True,
                "designs": designs,
                "count": len(designs)
            }
        except Exception as e:
            logger.error(f"Error listing designs: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/designs/batch")
    async def update_designs_batch(
        updates: List[DesignPricingUpdate],
        current_admin: dict = Depends(require_super_admin)
    ):
        """Batch update design pricing"""
        try:
            updated_count = 0
            
            for update in updates:
                update_data = {k: v for k, v in update.dict().items() if v is not None and k != "design_id"}
                update_data["updated_at"] = datetime.now(timezone.utc)
                
                result = await db.design_pricing_enhanced.update_one(
                    {"design_id": update.design_id},
                    {"$set": update_data},
                    upsert=True
                )
                
                if result.modified_count > 0 or result.upserted_id:
                    updated_count += 1
            
            return {
                "success": True,
                "message": f"Updated {updated_count} designs",
                "updated_count": updated_count
            }
        except Exception as e:
            logger.error(f"Error batch updating designs: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    # =====================================================================
    # DURATION OPTIONS MANAGEMENT
    # =====================================================================
    
    @router.get("/durations")
    async def list_duration_options(
        current_admin: dict = Depends(require_super_admin)
    ):
        """List all duration options"""
        try:
            durations = await db.duration_options.find(
                {},
                {"_id": 0}
            ).to_list(100)
            
            return {
                "success": True,
                "durations": durations,
                "count": len(durations)
            }
        except Exception as e:
            logger.error(f"Error listing durations: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/durations")
    async def create_duration_option(
        duration: DurationOption,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Create new duration option"""
        try:
            await db.duration_options.insert_one(duration.dict())
            
            return {
                "success": True,
                "message": "Duration option created",
                "duration_id": duration.duration_id
            }
        except Exception as e:
            logger.error(f"Error creating duration: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.put("/durations/{duration_id}")
    async def update_duration_option(
        duration_id: str,
        update: DurationOptionUpdate,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Update duration option"""
        try:
            update_data = {k: v for k, v in update.dict().items() if v is not None}
            
            result = await db.duration_options.update_one(
                {"duration_id": duration_id},
                {"$set": update_data}
            )
            
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Duration not found")
            
            return {
                "success": True,
                "message": "Duration updated"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating duration: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    # =====================================================================
    # THEME PRICING MANAGEMENT
    # =====================================================================
    
    @router.get("/themes")
    async def list_theme_pricing(
        current_admin: dict = Depends(require_super_admin)
    ):
        """List all theme package pricing"""
        try:
            themes = await db.theme_pricing_enhanced.find(
                {},
                {"_id": 0}
            ).to_list(100)
            
            return {
                "success": True,
                "themes": themes,
                "count": len(themes)
            }
        except Exception as e:
            logger.error(f"Error listing themes: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/themes")
    async def create_theme_pricing(
        theme: ThemePricing,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Create theme package pricing"""
        try:
            await db.theme_pricing_enhanced.insert_one(theme.dict())
            
            return {
                "success": True,
                "message": "Theme pricing created",
                "theme_id": theme.theme_id
            }
        except Exception as e:
            logger.error(f"Error creating theme: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.put("/themes/{theme_id}")
    async def update_theme_pricing(
        theme_id: str,
        update: ThemePricingUpdate,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Update theme pricing"""
        try:
            update_data = {k: v for k, v in update.dict().items() if v is not None}
            update_data["updated_at"] = datetime.now(timezone.utc)
            
            result = await db.theme_pricing_enhanced.update_one(
                {"theme_id": theme_id},
                {"$set": update_data}
            )
            
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Theme not found")
            
            return {
                "success": True,
                "message": "Theme pricing updated"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating theme: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    # =====================================================================
    # MIXED THEME PRICING
    # =====================================================================
    
    @router.get("/mixed-theme")
    async def get_mixed_theme_pricing(
        current_admin: dict = Depends(require_super_admin)
    ):
        """Get mixed theme pricing"""
        try:
            mixed = await db.mixed_theme_pricing.find_one({}, {"_id": 0})
            
            if not mixed:
                # Create default
                mixed = MixedThemePricing(
                    user_additional_credits=50,
                    photographer_additional_credits=30
                ).dict()
                await db.mixed_theme_pricing.insert_one(mixed)
            
            return {
                "success": True,
                "mixed_theme_pricing": mixed
            }
        except Exception as e:
            logger.error(f"Error getting mixed theme pricing: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.put("/mixed-theme")
    async def update_mixed_theme_pricing(
        user_additional_credits: int,
        photographer_additional_credits: int,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Update mixed theme pricing"""
        try:
            await db.mixed_theme_pricing.update_one(
                {},
                {
                    "$set": {
                        "user_additional_credits": user_additional_credits,
                        "photographer_additional_credits": photographer_additional_credits,
                        "updated_at": datetime.now(timezone.utc)
                    }
                },
                upsert=True
            )
            
            return {
                "success": True,
                "message": "Mixed theme pricing updated"
            }
        except Exception as e:
            logger.error(f"Error updating mixed theme: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    # =====================================================================
    # MONTHLY PACKS (PHOTOGRAPHER SUBSCRIPTIONS)
    # =====================================================================
    
    @router.get("/monthly-packs")
    async def list_monthly_packs(
        current_admin: dict = Depends(require_super_admin)
    ):
        """List all monthly subscription packs"""
        try:
            packs = await db.monthly_packs.find(
                {},
                {"_id": 0}
            ).to_list(100)
            
            return {
                "success": True,
                "packs": packs,
                "count": len(packs)
            }
        except Exception as e:
            logger.error(f"Error listing monthly packs: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/monthly-packs")
    async def create_monthly_pack(
        pack: MonthlyPackCreate,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Create new monthly pack"""
        try:
            pack_data = MonthlyPack(**pack.dict())
            await db.monthly_packs.insert_one(pack_data.dict())
            
            return {
                "success": True,
                "message": "Monthly pack created",
                "pack_id": pack_data.pack_id
            }
        except Exception as e:
            logger.error(f"Error creating monthly pack: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.put("/monthly-packs/{pack_id}")
    async def update_monthly_pack(
        pack_id: str,
        update: MonthlyPackUpdate,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Update monthly pack"""
        try:
            update_data = {k: v for k, v in update.dict().items() if v is not None and k != "pack_id"}
            update_data["updated_at"] = datetime.now(timezone.utc)
            
            result = await db.monthly_packs.update_one(
                {"pack_id": pack_id},
                {"$set": update_data}
            )
            
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Pack not found")
            
            return {
                "success": True,
                "message": "Monthly pack updated"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating monthly pack: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.delete("/monthly-packs/{pack_id}")
    async def delete_monthly_pack(
        pack_id: str,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Delete monthly pack"""
        try:
            result = await db.monthly_packs.delete_one({"pack_id": pack_id})
            
            if result.deleted_count == 0:
                raise HTTPException(status_code=404, detail="Pack not found")
            
            return {
                "success": True,
                "message": "Monthly pack deleted"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting monthly pack: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    return router
