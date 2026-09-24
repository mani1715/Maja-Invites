"""
PHASE 37: Wedding Lifecycle Service
Handles draft, publish, archive workflow with credit estimation and deduction
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
import logging
from models import WeddingStatus
from feature_registry import FeatureRegistry

# 2026-09 — Non-wedding categories (baby_birthday / half_saree / puberty /
# dhoti) use a different pricing source than wedding themes. They are NOT
# in the wedding `feature_registry`. So we resolve pricing from the same
# overrides + defaults used by /api/event-categories/{cat}/pricing.
from invitation_categories import (
    get_category_pricing as _ic_default_pricing,
)


class WeddingLifecycleService:
    """Service for managing wedding lifecycle and credit estimation"""
    
    def __init__(self, db):
        self.db = db
        self.profiles_collection = db['profiles']
        self.admins_collection = db['admins']
        self.feature_registry = FeatureRegistry()
        self.logger = logging.getLogger(__name__)
    
    def calculate_credit_cost(
        self,
        design_key: str,
        selected_features: List[str],
        expiry_tier_credits: int = 0,
    ) -> Dict[str, any]:
        """
        Calculate total credit cost for a wedding.

        Cost = design_cost + features_cost + expiry_tier_credits
        """
        breakdown = []
        design_cost = 0
        features_cost = 0
        
        # Calculate design cost
        design_feature_key = f"theme_{design_key}"
        design_feature = self.feature_registry.get_feature(design_feature_key)
        if design_feature:
            design_cost = design_feature.credit_cost
            breakdown.append({
                'item': design_feature.name,
                'type': 'design',
                'cost': design_cost
            })
        
        # Calculate features cost
        for feature_key in selected_features:
            feature = self.feature_registry.get_feature(feature_key)
            if feature and feature.enabled:
                features_cost += feature.credit_cost
                breakdown.append({
                    'item': feature.name,
                    'type': 'addon',
                    'cost': feature.credit_cost
                })

        # Expiry-tier add-on
        if expiry_tier_credits and expiry_tier_credits > 0:
            breakdown.append({
                'item': 'Link Expiry Tier',
                'type': 'expiry',
                'cost': int(expiry_tier_credits),
            })

        total_cost = design_cost + features_cost + int(expiry_tier_credits or 0)
        
        return {
            'total': total_cost,
            'design_cost': design_cost,
            'features_cost': features_cost,
            'expiry_cost': int(expiry_tier_credits or 0),
            'breakdown': breakdown,
        }

    async def _resolve_category_pricing(
        self,
        category: str,
        user_type: str = "photographer",
    ) -> Dict[str, any]:
        """Mirror the /api/event-categories/{cat}/pricing endpoint:
        DB overrides win, otherwise fall back to in-memory defaults."""
        defaults = _ic_default_pricing(category, user_type)
        try:
            override = await self.db['event_category_pricing'].find_one(
                {"category_id": category, "user_type": user_type},
                {"_id": 0, "category_id": 0, "user_type": 0},
            )
        except Exception:
            override = None
        if not override:
            return defaults
        return {
            "design_credits": override.get("design_credits", defaults.get("design_credits", 1)),
            "feature_credits": {
                **(defaults.get("feature_credits") or {}),
                **(override.get("feature_credits") or {}),
            },
        }

    def calculate_credit_cost_from_category_pricing(
        self,
        design_key: str,
        selected_features: List[str],
        category: str,
        category_pricing: Dict[str, any],
        expiry_tier_credits: int = 0,
    ) -> Dict[str, any]:
        """Non-wedding cost calculator.

        Uses the category's own pricing block (design_credits +
        feature_credits map) so a photographer publishing a baby_birthday /
        half_saree / puberty / dhoti invitation pays credits the SAME WAY a
        wedding photographer does — design credit + per-feature credits +
        expiry-tier credits.
        """
        breakdown: List[Dict[str, any]] = []
        feature_credits_map = (category_pricing or {}).get('feature_credits') or {}
        design_cost = int((category_pricing or {}).get('design_credits') or 0)
        if design_cost > 0:
            breakdown.append({
                'item': f'{category.replace("_", " ").title()} · {design_key}',
                'type': 'design',
                'cost': design_cost,
            })

        features_cost = 0
        for feature_key in selected_features or []:
            cost = int(feature_credits_map.get(feature_key, 0) or 0)
            if cost > 0:
                features_cost += cost
                breakdown.append({
                    'item': feature_key.replace('_', ' ').title(),
                    'type': 'addon',
                    'cost': cost,
                })

        if expiry_tier_credits and expiry_tier_credits > 0:
            breakdown.append({
                'item': 'Link Expiry Tier',
                'type': 'expiry',
                'cost': int(expiry_tier_credits),
            })

        total_cost = design_cost + features_cost + int(expiry_tier_credits or 0)
        return {
            'total': total_cost,
            'design_cost': design_cost,
            'features_cost': features_cost,
            'expiry_cost': int(expiry_tier_credits or 0),
            'breakdown': breakdown,
        }

    async def calculate_cost_for_wedding(
        self,
        wedding: Dict[str, any],
        expiry_tier_credits: int = 0,
        user_type: str = "photographer",
    ) -> Dict[str, any]:
        """Category-aware cost calculator. Picks the right pricing source
        based on `wedding['invitation_category']`:
            • 'wedding'  → wedding feature_registry (existing logic)
            • else       → event_category_pricing (override) → defaults
        """
        category = (wedding.get('invitation_category') or 'wedding').lower()
        design_key = wedding.get('selected_design_key', wedding.get('design_id', '')) or ''
        selected_features = wedding.get('selected_features') or []

        if category == 'wedding':
            return self.calculate_credit_cost(design_key, selected_features, expiry_tier_credits)

        pricing = await self._resolve_category_pricing(category, user_type)
        return self.calculate_credit_cost_from_category_pricing(
            design_key=design_key,
            selected_features=selected_features,
            category=category,
            category_pricing=pricing,
            expiry_tier_credits=expiry_tier_credits,
        )
    
    async def validate_slug_uniqueness(
        self,
        slug: str,
        exclude_wedding_id: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if slug is globally unique
        
        Returns:
            (is_unique: bool, error_message: Optional[str])
        """
        # D1 fix (Phase-2 audit): soft-deleted profiles must not block slug
        # reuse. Trash items have `deleted_at` set; legitimately-active rows
        # either don't have the field at all (legacy) or have it set to None.
        query: Dict[str, any] = {
            'slug': slug,
            '$or': [
                {'deleted_at': None},
                {'deleted_at': {'$exists': False}},
            ],
        }
        if exclude_wedding_id:
            query['id'] = {'$ne': exclude_wedding_id}
        
        existing = await self.profiles_collection.find_one(query)
        if existing:
            return False, f"Slug '{slug}' is already taken. Please choose a different one."
        return True, None
    
    async def check_ready_status(
        self,
        wedding: Dict
    ) -> Tuple[bool, List[str]]:
        """
        Check if wedding has all required fields to be marked READY
        
        Returns:
            (is_ready: bool, missing_fields: List[str])
        """
        missing_fields = []
        
        # Required fields
        required_fields = {
            'title': 'Wedding title',
            'slug': 'Unique slug',
            'groom_name': 'Groom name',
            'bride_name': 'Bride name',
            'event_date': 'Event date',
            'venue': 'Venue',
            'selected_design_key': 'Design selection'
        }
        
        for field, display_name in required_fields.items():
            if not wedding.get(field):
                missing_fields.append(display_name)
        
        # Check slug uniqueness
        is_unique, error = await self.validate_slug_uniqueness(
            wedding.get('slug', ''),
            exclude_wedding_id=wedding.get('id')
        )
        if not is_unique:
            missing_fields.append('Unique slug (current one is taken)')
        
        return len(missing_fields) == 0, missing_fields
    
    async def publish_wedding(
        self,
        wedding_id: str,
        admin_id: str
    ) -> Dict[str, any]:
        """
        Publish a wedding with atomic credit deduction.

        Race-safety design:
          1. Atomically *claim* the wedding row with find_one_and_update,
             setting `_publish_lock=True` only when the wedding is not
             already published, archived, or being published. This is the
             single point of mutual exclusion — only ONE concurrent caller
             passes this step, every other parallel publish attempt fails
             fast with "already published or being published".
          2. Atomically deduct credits with $inc, guarded by a
             `used_credits <= total_credits - total_cost` condition (so
             a wallet that races toward empty is detected even after the
             lock is acquired).
          3. Insert ledger + flip status to PUBLISHED + release the lock.
          4. On ANY exception after step 1, release the lock so the row
             is not stuck.

        Returns:
            Dict with publication result, or raises ValueError.
        """
        # ── STEP 1: Atomic claim ─────────────────────────────────────────
        # Match status both lowercase ("published") and uppercase ("PUBLISHED")
        # because the codebase has historically written both.
        try:
            wedding = await self.profiles_collection.find_one_and_update(
                {
                    'id': wedding_id,
                    'admin_id': admin_id,
                    'status': {'$nin': ['published', 'PUBLISHED', 'archived', 'ARCHIVED']},
                    '$or': [
                        {'_publish_lock': {'$exists': False}},
                        {'_publish_lock': False},
                    ],
                },
                {
                    '$set': {
                        '_publish_lock': True,
                        '_publish_lock_at': datetime.now(timezone.utc),
                    }
                },
                return_document=True,
            )
        except Exception as e:
            self.logger.error(f"Failed to acquire publish lock for {wedding_id}: {e}")
            wedding = None

        if not wedding:
            # Distinguish causes for a clearer message.
            existing = await self.profiles_collection.find_one({
                'id': wedding_id, 'admin_id': admin_id,
            })
            if not existing:
                raise ValueError("Wedding not found or you don't have permission to publish it")
            if existing.get('status') in ('published', 'PUBLISHED'):
                raise ValueError("Wedding is already published")
            if existing.get('status') in ('archived', 'ARCHIVED'):
                raise ValueError("Wedding is archived and cannot be published")
            raise ValueError("Another publish request is in progress. Please try again.")

        try:
            # ── STEP 2a: Auto-derive `title` from couple names if missing.
            # The frontend (LuxuryProfileForm, CelebrationProfileForm, …)
            # never asks for a wedding title — the natural label is just
            # "<groom> & <bride>".  Falling back here means the readiness
            # check never blocks publish on a field the user can't actually
            # fill in.  We also persist the derived title so the admin
            # dashboard's "title" column shows something useful.
            if not wedding.get('title'):
                groom = (wedding.get('groom_name') or '').strip()
                bride = (wedding.get('bride_name') or '').strip()
                derived_title = None
                if groom and bride:
                    derived_title = f"{groom} & {bride}"
                elif groom or bride:
                    derived_title = groom or bride
                if derived_title:
                    wedding['title'] = derived_title
                    await self.profiles_collection.update_one(
                        {'id': wedding_id},
                        {'$set': {'title': derived_title}},
                    )

            # ── STEP 2b: Validate ready ──────────────────────────────────
            is_ready, missing_fields = await self.check_ready_status(wedding)
            if not is_ready:
                raise ValueError(f"Wedding not ready to publish. Missing: {', '.join(missing_fields)}")

            # ── STEP 3: Calculate cost (incl. expiry-tier add-on) ───────
            design_key = wedding.get('selected_design_key', wedding.get('design_id', ''))
            selected_features = wedding.get('selected_features', [])

            ts_maja = (wedding.get('theme_settings') or {}).get('maja') or {}
            expiry_tier_id = (
                ts_maja.get('expiry_tier')
                or wedding.get('expiry_tier')
                or '6_months'
            )
            expiry_tier_credits = 0
            expiry_tier_days = 0
            try:
                tier_doc = await self.db['expiry_tiers'].find_one({'id': expiry_tier_id})
                if tier_doc and isinstance(tier_doc.get('credits'), (int, float)):
                    expiry_tier_credits = int(tier_doc['credits'])
                if tier_doc and isinstance(tier_doc.get('days'), (int, float)):
                    expiry_tier_days = int(tier_doc['days'])
            except Exception:
                expiry_tier_credits = 0
                expiry_tier_days = 0

            cost_breakdown = await self.calculate_cost_for_wedding(
                wedding,
                expiry_tier_credits=expiry_tier_credits,
                user_type="photographer",
            )
            total_cost = cost_breakdown['total']

            # ── STEP 4: Admin lookup + super-admin bypass ───────────────
            admin = await self.admins_collection.find_one({'id': admin_id})
            if not admin:
                raise ValueError("Admin not found")

            is_super_admin = admin.get('role') == 'super_admin'

            # Phase 1d: credits removed. Publishing is no longer gated by a credit
            # wallet — access is governed by the studio's subscription (enforced at
            # the marketplace/checkout layer). No deduction, no credit ledger.
            total_cost = 0
            cost_breakdown['total'] = 0
            cost_breakdown['note'] = (
                "Super Admin - Free publishing" if is_super_admin
                else "Included in subscription"
            )
            new_used_credits = 0

            # ── STEP 8: Flip status to PUBLISHED + release lock ──────────
            published_at = datetime.now(timezone.utc)

            # FIX (Bug 2): write expires_at / link_expiry_date based on the
            # purchased expiry tier. Counted from the publish date (since the
            # photographer is paying for "how long after publishing the link
            # stays live"). If we can't resolve tier days, fall back to the
            # existing expires_at on the wedding.
            if expiry_tier_days and expiry_tier_days > 0:
                new_expires_at = published_at + timedelta(days=expiry_tier_days)
            else:
                new_expires_at = wedding.get('expires_at') or wedding.get('link_expiry_date')

            set_block = {
                'status': WeddingStatus.PUBLISHED.value,
                'total_credit_cost': total_cost,
                'published_at': published_at,
                'updated_at': datetime.now(timezone.utc),
                'expiry_tier': expiry_tier_id,
                'expiry_tier_days': expiry_tier_days,
            }
            if new_expires_at is not None:
                set_block['expires_at'] = new_expires_at
                set_block['link_expiry_date'] = new_expires_at  # legacy field used by check_profile_active

            await self.profiles_collection.update_one(
                {'id': wedding_id},
                {
                    '$set': set_block,
                    '$unset': {'_publish_lock': '', '_publish_lock_at': ''},
                },
            )

            remaining_credits = (
                "Unlimited (Super Admin)" if is_super_admin
                else admin.get('total_credits', 0) - new_used_credits
            )

            return {
                'success': True,
                'wedding_id': wedding_id,
                'credits_deducted': total_cost,
                'remaining_credits': remaining_credits,
                'published_at': published_at.isoformat(),
                'cost_breakdown': cost_breakdown,
                'is_super_admin': is_super_admin,
            }

        except Exception:
            # Always release the lock so the row is not stuck.
            try:
                await self.profiles_collection.update_one(
                    {'id': wedding_id},
                    {'$unset': {'_publish_lock': '', '_publish_lock_at': ''}},
                )
            except Exception as unlock_err:
                self.logger.error(f"Failed to release publish lock on error: {unlock_err}")
            raise
    
    async def upgrade_wedding_features(
        self,
        wedding_id: str,
        admin_id: str,
        new_design_key: Optional[str] = None,
        new_features: Optional[List[str]] = None
    ) -> Dict[str, any]:
        """
        Upgrade published wedding with additional features
        Deducts only the difference in cost
        
        Returns:
            Dict with result
        """
        # Get wedding
        wedding = await self.profiles_collection.find_one({
            'id': wedding_id,
            'admin_id': admin_id
        })
        
        if not wedding:
            raise ValueError("Wedding not found or you don't have permission")
        
        if wedding.get('status') != WeddingStatus.PUBLISHED.value:
            raise ValueError("Can only upgrade published weddings")
        
        # Calculate current cost (category-aware)
        current_design = wedding.get('selected_design_key', wedding.get('design_id', ''))
        current_features = wedding.get('selected_features', [])
        current_cost_breakdown = await self.calculate_cost_for_wedding(
            {**wedding, 'selected_design_key': current_design, 'selected_features': current_features},
            expiry_tier_credits=0,
            user_type="photographer",
        )
        current_cost = current_cost_breakdown['total']

        # Calculate new cost (category-aware)
        final_design = new_design_key if new_design_key else current_design
        final_features = new_features if new_features is not None else current_features
        new_cost_breakdown = await self.calculate_cost_for_wedding(
            {**wedding, 'selected_design_key': final_design, 'selected_features': final_features},
            expiry_tier_credits=0,
            user_type="photographer",
        )
        new_cost = new_cost_breakdown['total']
        
        # Calculate difference
        cost_difference = new_cost - current_cost
        
        # If downgrade or same, no credit operation needed
        if cost_difference <= 0:
            # Update wedding without credit deduction
            await self.profiles_collection.update_one(
                {'id': wedding_id},
                {
                    '$set': {
                        'selected_design_key': final_design,
                        'design_id': final_design,  # Keep in sync
                        'selected_features': final_features,
                        'total_credit_cost': new_cost,
                        'updated_at': datetime.now(timezone.utc)
                    }
                }
            )
            
            return {
                'success': True,
                'wedding_id': wedding_id,
                'credits_deducted': 0,
                'message': 'Downgrade successful. No credits deducted.',
                'new_total_cost': new_cost
            }
        
        # Credits removed — upgrades apply for free.
        await self.profiles_collection.update_one(
            {'id': wedding_id},
            {
                '$set': {
                    'selected_design_key': final_design,
                    'design_id': final_design,
                    'selected_features': final_features,
                    'total_credit_cost': new_cost,
                    'updated_at': datetime.now(timezone.utc)
                }
            }
        )

        return {
            'success': True,
            'wedding_id': wedding_id,
            'credits_deducted': 0,
            'new_total_cost': new_cost,
            'upgrade_breakdown': new_cost_breakdown
        }
    
    async def archive_wedding(
        self,
        wedding_id: str,
        admin_id: str
    ) -> Dict[str, any]:
        """
        Archive a wedding (no credit refund)
        
        Returns:
            Dict with result
        """
        wedding = await self.profiles_collection.find_one({
            'id': wedding_id,
            'admin_id': admin_id
        })
        
        if not wedding:
            raise ValueError("Wedding not found or you don't have permission")
        
        if wedding.get('status') == WeddingStatus.ARCHIVED.value:
            raise ValueError("Wedding is already archived")
        
        # Update status
        await self.profiles_collection.update_one(
            {'id': wedding_id},
            {
                '$set': {
                    'status': WeddingStatus.ARCHIVED.value,
                    'is_active': False,
                    'updated_at': datetime.now(timezone.utc)
                }
            }
        )
        
        return {
            'success': True,
            'wedding_id': wedding_id,
            'message': 'Wedding archived successfully. Public link is now disabled.'
        }
    
    async def create_wedding(
        self,
        admin_id: str,
        title: str,
        slug: str,
        description: Optional[str] = None,
        wedding_date: Optional[datetime] = None
    ) -> Dict[str, any]:
        """
        Create a new wedding in DRAFT status
        
        Args:
            admin_id: Owner admin ID
            title: Wedding title
            slug: Unique slug for public URL
            description: Optional description
            wedding_date: Optional wedding date
        
        Returns:
            Dict with created wedding data
        """
        import uuid
        
        # Validate slug uniqueness
        is_unique, error = await self.validate_slug_uniqueness(slug)
        if not is_unique:
            raise ValueError(error)
        
        # Create wedding document
        wedding_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        wedding_data = {
            'id': wedding_id,
            'admin_id': admin_id,
            'title': title.strip(),
            'slug': slug.strip(),
            'status': WeddingStatus.DRAFT.value,
            'selected_design_key': None,
            'selected_features': [],
            'total_credit_cost': 0,
            'published_at': None,
            'created_at': now,
            'updated_at': now,
            'profile_id': None,
            'description': description.strip() if description else None,
            'wedding_date': wedding_date,
            # Additional fields to ensure compatibility with existing Profile model
            'groom_name': '',
            'bride_name': '',
            'event_date': None,
            'venue': '',
            'is_active': True
        }
        
        await self.profiles_collection.insert_one(wedding_data)
        
        return {
            'success': True,
            'wedding_id': wedding_id,
            'wedding': wedding_data,
            'message': 'Wedding created successfully in DRAFT status'
        }
    
    async def update_wedding(
        self,
        wedding_id: str,
        admin_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        wedding_date: Optional[datetime] = None,
        selected_design_key: Optional[str] = None,
        selected_features: Optional[List[str]] = None,
        groom_name: Optional[str] = None,
        bride_name: Optional[str] = None,
        event_date: Optional[datetime] = None,
        venue: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Update wedding details (only allowed in DRAFT or READY status)
        
        Args:
            wedding_id: Wedding ID to update
            admin_id: Owner admin ID
            Various optional fields to update
        
        Returns:
            Dict with updated wedding data
        """
        # Get wedding
        wedding = await self.profiles_collection.find_one({
            'id': wedding_id,
            'admin_id': admin_id
        })
        
        if not wedding:
            raise ValueError("Wedding not found or you don't have permission")
        
        current_status = wedding.get('status', 'draft')
        
        # Allow edits for DRAFT, READY, and PUBLISHED
        # For PUBLISHED, only certain fields can be updated
        if current_status == WeddingStatus.ARCHIVED.value:
            raise ValueError("Cannot edit archived weddings")
        
        # Build update document
        update_fields = {
            'updated_at': datetime.now(timezone.utc)
        }
        
        if title is not None:
            update_fields['title'] = title.strip()
        if description is not None:
            update_fields['description'] = description.strip() if description else None
        if wedding_date is not None:
            update_fields['wedding_date'] = wedding_date
        if selected_design_key is not None:
            update_fields['selected_design_key'] = selected_design_key
            update_fields['design_id'] = selected_design_key  # Keep in sync
        if selected_features is not None:
            update_fields['selected_features'] = selected_features
        if groom_name is not None:
            update_fields['groom_name'] = groom_name.strip()
        if bride_name is not None:
            update_fields['bride_name'] = bride_name.strip()
        if event_date is not None:
            update_fields['event_date'] = event_date
        if venue is not None:
            update_fields['venue'] = venue.strip()
        
        # Update wedding
        await self.profiles_collection.update_one(
            {'id': wedding_id},
            {'$set': update_fields}
        )
        
        # Get updated wedding
        updated_wedding = await self.profiles_collection.find_one({'id': wedding_id})
        
        # Calculate new cost estimate (category-aware)
        design_key = updated_wedding.get('selected_design_key', '')
        cost_breakdown = (
            await self.calculate_cost_for_wedding(updated_wedding, expiry_tier_credits=0, user_type="photographer")
            if design_key else {'total': 0}
        )
        
        return {
            'success': True,
            'wedding_id': wedding_id,
            'wedding': updated_wedding,
            'estimated_cost': cost_breakdown.get('total', 0),
            'cost_breakdown': cost_breakdown,
            'message': 'Wedding updated successfully'
        }
