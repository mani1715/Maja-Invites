"""
Initialize Default Pricing Data
Sets up default features, durations, and configurations
"""
import asyncio
from pg_adapter import Database
import os
from dotenv import load_dotenv
import uuid


load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")


async def initialize_default_pricing():
    """Initialize default pricing configurations"""
    
    db = await Database.connect(os.environ["SUPABASE_DB_URL"])
    
    print("🚀 Initializing default pricing data...")
    
    # =====================================================================
    # 1. FEATURE PRICING
    # =====================================================================
    
    default_features = [
        {
            "feature_id": "qr_code",
            "feature_type": "qr_code",
            "feature_name": "QR Code for Photos",
            "description": "Generate QR code for easy photo sharing",
            "user_credits": 5,
            "photographer_credits": 3,
            "is_free": False,
            "available_for_events": ["engagement", "marriage", "reception", "haldi", "mehendi"],
            "enabled_by_default": True,
            "info_text": "QR codes allow guests to quickly access and upload photos to your wedding gallery. Simply scan the QR code with any smartphone camera to open the photo upload page.",
            "tutorial_video_url": "https://www.youtube.com/watch?v=example_qr_tutorial",
            "is_active": True
        },
        {
            "feature_id": "ai_compression",
            "feature_type": "ai_compression",
            "feature_name": "AI Image Compression",
            "description": "Compress images automatically for faster loading",
            "user_credits": 2,
            "photographer_credits": 1,
            "is_free": False,
            "available_for_events": [],  # Available for all
            "enabled_by_default": True,
            "info_text": "AI-powered compression reduces image file sizes by up to 70% while maintaining quality, ensuring faster page loads for your guests.",
            "tutorial_video_url": None,
            "is_active": True
        },
        {
            "feature_id": "face_comparison",
            "feature_type": "face_comparison",
            "feature_name": "Face Recognition Matching",
            "description": "Match and organize photos by faces",
            "user_credits": 10,
            "photographer_credits": 6,
            "is_free": False,
            "available_for_events": ["marriage", "reception", "engagement"],
            "enabled_by_default": False,
            "info_text": "Advanced AI recognizes faces in photos and automatically groups them, making it easy for guests to find photos they're in.",
            "tutorial_video_url": None,
            "is_active": True
        },
        {
            "feature_id": "digital_shagun",
            "feature_type": "digital_shagun",
            "feature_name": "Digital Shagun (Gifts)",
            "description": "Accept digital gifts via UPI",
            "user_credits": 3,
            "photographer_credits": 2,
            "is_free": False,
            "available_for_events": ["marriage", "reception", "engagement"],
            "enabled_by_default": True,
            "info_text": "Enable guests to send wedding gifts digitally via UPI/PhonePe. Display your UPI ID or QR code on the invitation.",
            "tutorial_video_url": None,
            "is_active": True
        },
        {
            "feature_id": "live_gallery",
            "feature_type": "live_gallery",
            "feature_name": "Live Photo Gallery",
            "description": "Real-time photo gallery for guests",
            "user_credits": 8,
            "photographer_credits": 5,
            "is_free": False,
            "available_for_events": [],  # All events
            "enabled_by_default": True,
            "info_text": "Guests can upload photos in real-time during your event. All photos appear instantly in a beautiful gallery.",
            "tutorial_video_url": None,
            "is_active": True
        },
        {
            "feature_id": "guest_upload",
            "feature_type": "guest_upload",
            "feature_name": "Guest Photo Upload",
            "description": "Allow guests to upload photos",
            "user_credits": 4,
            "photographer_credits": 2,
            "is_free": False,
            "available_for_events": [],
            "enabled_by_default": True,
            "info_text": "Enable your guests to upload and share their favorite moments from your wedding.",
            "tutorial_video_url": None,
            "is_active": True
        },
        {
            "feature_id": "rsvp",
            "feature_type": "rsvp",
            "feature_name": "RSVP Management",
            "description": "Track guest responses",
            "user_credits": 0,
            "photographer_credits": 0,
            "is_free": True,
            "available_for_events": [],
            "enabled_by_default": True,
            "info_text": "FREE - Track who's attending your event with built-in RSVP functionality.",
            "tutorial_video_url": None,
            "is_active": True
        },
        {
            "feature_id": "sms_invites",
            "feature_type": "sms_invites",
            "feature_name": "SMS Invitations",
            "description": "Send invitations via SMS",
            "user_credits": 15,
            "photographer_credits": 10,
            "is_free": False,
            "available_for_events": [],
            "enabled_by_default": False,
            "info_text": "Send your invitation link directly to guests via SMS. Charges apply per SMS sent.",
            "tutorial_video_url": None,
            "is_active": True
        }
    ]
    
    # Insert features
    for feature in default_features:
        await db.feature_pricing_enhanced.update_one(
            {"feature_id": feature["feature_id"]},
            {"$set": feature},
            upsert=True
        )
    
    print(f"✅ Initialized {len(default_features)} features")
    
    # =====================================================================
    # 2. DURATION OPTIONS
    # =====================================================================
    
    default_durations = [
        {
            "duration_id": "1_day",
            "label": "1 Day",
            "days": 1,
            "user_credits": 2,
            "photographer_credits": 1,
            "is_active": True
        },
        {
            "duration_id": "7_days",
            "label": "7 Days",
            "days": 7,
            "user_credits": 5,
            "photographer_credits": 3,
            "is_active": True
        },
        {
            "duration_id": "30_days",
            "label": "30 Days (1 Month)",
            "days": 30,
            "user_credits": 15,
            "photographer_credits": 10,
            "is_active": True
        },
        {
            "duration_id": "90_days",
            "label": "90 Days (3 Months)",
            "days": 90,
            "user_credits": 30,
            "photographer_credits": 20,
            "is_active": True
        },
        {
            "duration_id": "180_days",
            "label": "180 Days (6 Months)",
            "days": 180,
            "user_credits": 50,
            "photographer_credits": 35,
            "is_active": True
        },
        {
            "duration_id": "365_days",
            "label": "365 Days (1 Year)",
            "days": 365,
            "user_credits": 80,
            "photographer_credits": 55,
            "is_active": True
        },
        {
            "duration_id": "unlimited",
            "label": "Unlimited",
            "days": None,
            "user_credits": 150,
            "photographer_credits": 100,
            "is_active": True
        }
    ]
    
    for duration in default_durations:
        await db.duration_options.update_one(
            {"duration_id": duration["duration_id"]},
            {"$set": duration},
            upsert=True
        )
    
    print(f"✅ Initialized {len(default_durations)} duration options")
    
    # =====================================================================
    # 3. MIXED THEME PRICING
    # =====================================================================
    
    mixed_theme = {
        "pricing_id": str(uuid.uuid4()),
        "name": "Mixed Theme Selection",
        "description": "Select different designs from different themes",
        "user_additional_credits": 50,
        "photographer_additional_credits": 30
    }
    
    await db.mixed_theme_pricing.update_one(
        {},
        {"$set": mixed_theme},
        upsert=True
    )
    
    print("✅ Initialized mixed theme pricing")
    
    # =====================================================================
    # 4. SAMPLE CREDIT PACKAGES
    # =====================================================================
    
    sample_packages = [
        {
            "package_id": str(uuid.uuid4()),
            "name": "Starter Pack - Users",
            "description": "Perfect for getting started",
            "credits": 50,
            "price": 499.0,
            "discounted_price": None,
            "discount_percentage": None,
            "user_type": "user",
            "is_active": True,
            "is_featured": False,
            "display_order": 1
        },
        {
            "package_id": str(uuid.uuid4()),
            "name": "Pro Pack - Users",
            "description": "Most popular choice",
            "credits": 200,
            "price": 1799.0,
            "discounted_price": 1499.0,
            "discount_percentage": 17,
            "user_type": "user",
            "is_active": True,
            "is_featured": True,
            "display_order": 2
        },
        {
            "package_id": str(uuid.uuid4()),
            "name": "Starter Pack - Photographers",
            "description": "For professional photographers",
            "credits": 100,
            "price": 699.0,
            "discounted_price": None,
            "discount_percentage": None,
            "user_type": "photographer",
            "is_active": True,
            "is_featured": False,
            "display_order": 1
        },
        {
            "package_id": str(uuid.uuid4()),
            "name": "Pro Pack - Photographers",
            "description": "Best value for professionals",
            "credits": 500,
            "price": 2999.0,
            "discounted_price": 2499.0,
            "discount_percentage": 17,
            "user_type": "photographer",
            "is_active": True,
            "is_featured": True,
            "display_order": 2
        }
    ]
    
    for package in sample_packages:
        await db.credit_packages.insert_one(package)
    
    print(f"✅ Initialized {len(sample_packages)} sample credit packages")
    
    print("\n🎉 Default pricing initialization complete!")
    print("\nNext steps:")
    print("1. Configure design pricing via admin panel")
    print("2. Set up theme packages")
    print("3. Create monthly packs for photographers")
    
    await db.close()


if __name__ == "__main__":
    asyncio.run(initialize_default_pricing())
