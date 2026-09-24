"""
Initialize admin user in database
Run this script once to create the default admin user
"""
import asyncio
from pg_adapter import Database
from auth import get_password_hash
from models import Admin
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def init_admin():
    # Migration leftover: MONGO_URL is unused but raised KeyError and made this
    # script unrunnable. Postgres is the only backing store now.
    db = await Database.connect(os.environ["SUPABASE_DB_URL"])
    
    # Check if admin already exists
    existing_admin = await db.admins.find_one({"email": "admin@wedding.com"})
    
    if existing_admin:
        print("Admin user already exists!")
        return
    
    # Create admin user
    admin = Admin(
        email="admin@wedding.com",
        name="Demo Photographer",
        password_hash=get_password_hash("admin123")
    )
    
    doc = admin.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.admins.insert_one(doc)
    
    print("✅ Admin user created successfully!")
    print("Email: admin@wedding.com")
    print("Password: admin123")
    print("\n⚠️  IMPORTANT: Change this password in production!")
    
    await db.close()

if __name__ == "__main__":
    asyncio.run(init_admin())
