"""
Super Admin Management Service
Handles design pricing, theme packages and user/photographer management.

The credit-package CRUD this module opened with is deleted — credits are
retired, so there is nothing to price in them.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pg_adapter import Database as AsyncIOMotorDatabase
import logging

from pricing_models import (
    DesignPricingUpdate, ThemePackage,
    ThemePackageCreate, ThemePackageUpdate, FeaturePricingUpdate,
)

logger = logging.getLogger(__name__)


def build_super_admin_router(db: AsyncIOMotorDatabase, get_current_admin,
                             require_super_admin, credit_service=None) -> APIRouter:
    """Build Super Admin management router"""
    router = APIRouter(prefix="/api/super-admin", tags=["super_admin"])
    
    
    
    
    
    
    
    
    
    # =====================================================================
    # DESIGN PRICING MANAGEMENT
    # =====================================================================
    
    @router.get("/design-pricing")
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
            
            designs = await db.design_pricing.find(query, {"_id": 0}).to_list(1000)
            return {
                "success": True,
                "designs": designs,
                "count": len(designs)
            }
        except Exception as e:
            logger.error(f"Error listing design pricing: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/design-pricing/batch")
    async def update_design_pricing_batch(
        updates: List[DesignPricingUpdate],
        current_admin: dict = Depends(require_super_admin)
    ):
        """Update multiple design pricings at once"""
        try:
            updated_count = 0
            for update in updates:
                result = await db.design_pricing.update_one(
                    {"design_id": update.design_id},
                    {
                        "$set": {
                            "credits_required": update.credits_required,
                            "is_premium": update.is_premium,
                            "updated_at": datetime.now(timezone.utc)
                        }
                    },
                    upsert=True
                )
                if result.modified_count > 0 or result.upserted_id:
                    updated_count += 1
            
            return {
                "success": True,
                "message": f"Updated {updated_count} design pricings",
                "updated_count": updated_count
            }
        except Exception as e:
            logger.error(f"Error updating design pricing: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    # =====================================================================
    # THEME PACKAGE MANAGEMENT
    # =====================================================================
    
    @router.get("/theme-packages")
    async def list_theme_packages(
        active_only: bool = False,
        current_admin: dict = Depends(require_super_admin)
    ):
        """List all theme packages"""
        try:
            query = {}
            if active_only:
                query["is_active"] = True
            
            packages = await db.theme_packages.find(query, {"_id": 0}).sort("display_order", 1).to_list(100)
            return {
                "success": True,
                "packages": packages,
                "count": len(packages)
            }
        except Exception as e:
            logger.error(f"Error listing theme packages: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/theme-packages")
    async def create_theme_package(
        package: ThemePackageCreate,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Create theme package with selected designs"""
        try:
            # Calculate individual credit sum
            design_credits = await db.design_pricing.find(
                {"design_id": {"$in": package.included_design_ids}},
                {"_id": 0, "credits_required": 1}
            ).to_list(1000)
            
            individual_sum = sum(d.get("credits_required", 0) for d in design_credits)
            
            package_data = ThemePackage(
                **package.dict(),
                individual_credit_sum=individual_sum,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            
            await db.theme_packages.insert_one(package_data.dict())
            
            return {
                "success": True,
                "message": "Theme package created successfully",
                "package_id": package_data.package_id,
                "savings": individual_sum - package.total_credits
            }
        except Exception as e:
            logger.error(f"Error creating theme package: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.put("/theme-packages/{package_id}")
    async def update_theme_package(
        package_id: str,
        update: ThemePackageUpdate,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Update theme package"""
        try:
            existing = await db.theme_packages.find_one({"package_id": package_id})
            if not existing:
                raise HTTPException(status_code=404, detail="Package not found")
            
            update_data = {k: v for k, v in update.dict().items() if v is not None}
            update_data["updated_at"] = datetime.now(timezone.utc)
            
            # Recalculate individual sum if designs changed
            if update.included_design_ids:
                design_credits = await db.design_pricing.find(
                    {"design_id": {"$in": update.included_design_ids}},
                    {"_id": 0, "credits_required": 1}
                ).to_list(1000)
                update_data["individual_credit_sum"] = sum(d.get("credits_required", 0) for d in design_credits)
            
            await db.theme_packages.update_one(
                {"package_id": package_id},
                {"$set": update_data}
            )
            
            return {
                "success": True,
                "message": "Theme package updated successfully"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating theme package: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    # =====================================================================
    # FEATURE PRICING MANAGEMENT
    # =====================================================================
    
    @router.get("/feature-pricing")
    async def list_feature_pricing(
        current_admin: dict = Depends(require_super_admin)
    ):
        """List all feature pricing"""
        try:
            features = await db.feature_pricing.find({}, {"_id": 0}).to_list(100)
            return {
                "success": True,
                "features": features,
                "count": len(features)
            }
        except Exception as e:
            logger.error(f"Error listing feature pricing: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.put("/feature-pricing")
    async def update_feature_pricing(
        update: FeaturePricingUpdate,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Update feature pricing"""
        try:
            await db.feature_pricing.update_one(
                {"feature_id": update.feature_id},
                {
                    "$set": {
                        "credits_required": update.credits_required,
                        "is_active": update.is_active,
                        "updated_at": datetime.now(timezone.utc)
                    }
                },
                upsert=True
            )
            
            return {
                "success": True,
                "message": "Feature pricing updated successfully"
            }
        except Exception as e:
            logger.error(f"Error updating feature pricing: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    # =====================================================================
    # USER/PHOTOGRAPHER MANAGEMENT
    # =====================================================================
    
    @router.get("/photographers")
    async def list_photographers(
        current_admin: dict = Depends(require_super_admin)
    ):
        """List all photographers with statistics"""
        try:
            # Get all photographers (admins with role = admin)
            photographers = await db.admins.find(
                {"role": "admin"},
                {"_id": 0}
            ).to_list(1000)
            
            # Enhance with statistics
            for photographer in photographers:
                admin_id = photographer.get("id")
                
                # Count invitation links
                invitation_count = await db.profiles.count_documents({"admin_id": admin_id})
                photographer["invitation_count"] = invitation_count
                
                # Get credit balance
                photographer["credit_balance"] = photographer.get("total_credits", 0) - photographer.get("used_credits", 0)
            
            return {
                "success": True,
                "photographers": photographers,
                "count": len(photographers)
            }
        except Exception as e:
            logger.error(f"Error listing photographers: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.get("/photographers/{photographer_id}/invitations")
    async def get_photographer_invitations(
        photographer_id: str,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Get all invitations created by a photographer"""
        try:
            invitations = await db.profiles.find(
                {"admin_id": photographer_id},
                {"_id": 0}
            ).to_list(1000)
            
            return {
                "success": True,
                "invitations": invitations,
                "count": len(invitations)
            }
        except Exception as e:
            logger.error(f"Error getting photographer invitations: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/photographers/{photographer_id}/block")
    async def block_photographer(
        photographer_id: str,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Block a photographer"""
        try:
            result = await db.admins.update_one(
                {"id": photographer_id},
                {"$set": {"status": "blocked", "updated_at": datetime.now(timezone.utc)}}
            )
            
            if result.modified_count == 0:
                raise HTTPException(status_code=404, detail="Photographer not found")
            
            return {
                "success": True,
                "message": "Photographer blocked successfully"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error blocking photographer: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.post("/photographers/{photographer_id}/unblock")
    async def unblock_photographer(
        photographer_id: str,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Unblock a photographer"""
        try:
            result = await db.admins.update_one(
                {"id": photographer_id},
                {"$set": {"status": "active", "updated_at": datetime.now(timezone.utc)}}
            )
            
            if result.modified_count == 0:
                raise HTTPException(status_code=404, detail="Photographer not found")
            
            return {
                "success": True,
                "message": "Photographer unblocked successfully"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error unblocking photographer: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.delete("/invitations/{invitation_id}")
    async def delete_invitation(
        invitation_id: str,
        current_admin: dict = Depends(require_super_admin)
    ):
        """Delete an invitation link"""
        try:
            result = await db.profiles.delete_one({"id": invitation_id})
            
            if result.deleted_count == 0:
                raise HTTPException(status_code=404, detail="Invitation not found")
            
            return {
                "success": True,
                "message": "Invitation deleted successfully"
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting invitation: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    @router.get("/invitations/{invitation_id}")
    async def view_invitation(
        invitation_id: str,
        current_admin: dict = Depends(require_super_admin)
    ):
        """View full invitation details (Super Admin only)"""
        try:
            invitation = await db.profiles.find_one({"id": invitation_id}, {"_id": 0})
            
            if not invitation:
                raise HTTPException(status_code=404, detail="Invitation not found")
            
            # Get media files
            media = await db.profile_media.find(
                {"profile_id": invitation_id},
                {"_id": 0}
            ).to_list(1000)
            
            # Get greetings/wishes
            greetings = await db.greetings.find(
                {"profile_id": invitation_id},
                {"_id": 0}
            ).to_list(1000)
            
            # Get RSVP responses
            rsvps = await db.rsvp.find(
                {"profile_id": invitation_id},
                {"_id": 0}
            ).to_list(1000)
            
            # Get analytics
            analytics = await db.analytics.find_one(
                {"profile_id": invitation_id},
                {"_id": 0}
            )
            
            return {
                "success": True,
                "invitation": invitation,
                "media": media,
                "greetings": greetings,
                "rsvps": rsvps,
                "analytics": analytics or {},
                "media_count": len(media),
                "greetings_count": len(greetings),
                "rsvps_count": len(rsvps)
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error viewing invitation: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    
    return router
