"""
Restructured Admin Panel Service
Implements hierarchical pricing management
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pg_adapter import Database as AsyncIOMotorDatabase
import logging

from restructured_pricing_models import (
    UserTypeCategory, PackType,
    UpdateDesignPriceRequest,
    CreateThemePackRequest, CreateDesignPackRequest,
    CreateCreditPlanRequest, UpdateCreditPlanRequest,
    CreateMonthlyPlanRequest, UpdateMonthlyPlanRequest,
    ThemePackConfig, DesignPackConfig,
    CreditPlan, MonthlyPlan
)

logger = logging.getLogger(__name__)


def build_restructured_admin_router(
    db: AsyncIOMotorDatabase,
    require_super_admin
) -> APIRouter:
    """Build restructured admin panel router"""
    router = APIRouter(prefix="/api/admin/restructured", tags=["admin_restructured"])
    
    # =====================================================================
    # DESIGN PRICING (User / Photographer)
    # =====================================================================
    
    @router.get("/design-pricing/{user_type}")
    async def get_design_pricing(
        user_type: UserTypeCategory,
        theme: Optional[str] = None,
        event_type: Optional[str] = None,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Get design pricing for user type"""
        try:
            query = {"user_type": user_type.value}
            if theme:
                query["theme"] = theme
            if event_type:
                query["event_type"] = event_type
            
            designs = await db.design_pricing_by_user_type.find(
                query,
                {"_id": 0}
            ).to_list(1000)
            
            return {
                "success": True,
                "user_type": user_type.value,
                "designs": designs,
                "count": len(designs)
            }
        except Exception as e:
            logger.error(f"Error getting design pricing: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/design-pricing/{user_type}/batch")
    async def update_design_pricing_batch(
        user_type: UserTypeCategory,
        updates: List[UpdateDesignPriceRequest],
        current_admin: dict = Depends(require_super_admin)
    ):
        """Batch update design pricing for user type"""
        try:
            updated_count = 0
            
            for update in updates:
                result = await db.design_pricing_by_user_type.update_one(
                    {
                        "design_id": update.design_id,
                        "user_type": user_type.value
                    },
                    {
                        "$set": {
                            "credits": update.credits,
                            "updated_at": datetime.now(timezone.utc)
                        }
                    },
                    upsert=True
                )
                
                if result.modified_count > 0 or result.upserted_id:
                    updated_count += 1
            
            return {
                "success": True,
                "message": f"Updated {updated_count} designs for {user_type.value}",
                "updated_count": updated_count
            }
        except Exception as e:
            logger.error(f"Error updating design pricing: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    
    
    
    
    
    
    # =====================================================================
    # PLANS & PRICING
    # =====================================================================
    
    @router.get("/plans-pricing/user")
    async def get_user_plans(
        current_admin: dict = Depends(require_super_admin)
    ):
        """Get all user credit plans"""
        try:
            plans = await db.credit_plans.find(
                {"user_type": UserTypeCategory.USER.value},
                {"_id": 0}
            ).sort("display_order", 1).to_list(100)
            
            return {
                "success": True,
                "user_type": "user",
                "plans": plans,
                "count": len(plans)
            }
        except Exception as e:
            logger.error(f"Error getting user plans: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/plans-pricing/user")
    async def create_user_plan(
        request: CreateCreditPlanRequest,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Credits are retired — writes 410. GETs above stay for history."""
        raise HTTPException(
            status_code=410,
            detail="CREDITS_RETIRED — credit plans are read-only history; "
                   "live pricing is managed in the Pricing Hub (/admin/pricing)",
        )
    
    
    @router.put("/plans-pricing/user/{plan_id}")
    async def update_user_plan(
        plan_id: str,
        request: UpdateCreditPlanRequest,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Credits are retired — writes 410. GETs above stay for history."""
        raise HTTPException(
            status_code=410,
            detail="CREDITS_RETIRED — credit plans are read-only history; "
                   "live pricing is managed in the Pricing Hub (/admin/pricing)",
        )
    @router.get("/plans-pricing/photographer/monthly")
    async def get_photographer_monthly_plans(
        current_admin: dict = Depends(require_super_admin)
    ):
        """Get photographer monthly plans"""
        try:
            plans = await db.monthly_plans.find(
                {},
                {"_id": 0}
            ).sort("display_order", 1).to_list(100)
            
            return {
                "success": True,
                "plan_type": "monthly",
                "plans": plans,
                "count": len(plans)
            }
        except Exception as e:
            logger.error(f"Error getting monthly plans: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/plans-pricing/photographer/monthly")
    async def create_monthly_plan(
        request: CreateMonthlyPlanRequest,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Legacy monthly plans are superseded by subscription_plans — writes 410."""
        raise HTTPException(
            status_code=410,
            detail="LEGACY_PLANS_RETIRED — photographer plans are managed as "
                   "subscription plans in the Pricing Hub (/admin/pricing)",
        )

    @router.put("/plans-pricing/photographer/monthly/{plan_id}")
    async def update_monthly_plan(
        plan_id: str,
        request: UpdateMonthlyPlanRequest,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Legacy monthly plans are superseded by subscription_plans — writes 410."""
        raise HTTPException(
            status_code=410,
            detail="LEGACY_PLANS_RETIRED — photographer plans are managed as "
                   "subscription plans in the Pricing Hub (/admin/pricing)",
        )
    
    
    
    
    
    
    return router
