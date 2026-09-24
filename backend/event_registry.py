"""
event_registry.py — MAJA Invites Dynamic Event Engine: the registry.
====================================================================

Purpose
    The single source of truth for WHICH event types exist and WHAT each one is
    made of. The Builder, renderer, lifecycle, pricing and storage layers all read
    this — none of them hardcode "Ganesh". Adding a future event type
    (Gruhapravesam, Satyanarayana Vratham, Birthday, …) is a registry entry, not a
    code change (Master Guide §Configuration over Hardcoding).

Inputs      a db handle (pg_adapter or the in-memory test FakeDB)
Outputs     event-type configs (category, modules, ordered sections, layouts,
            supported languages, durations, publish requirements)
Dependencies  app_settings (feature flag), design_catalog (optional thumbnails)
Side effects  seeds db.event_registry + the `ganesh_module_enabled` flag (OFF),
            both idempotent
Future extension  add another dict to EVENT_TYPES; nothing else changes.

Section `store` tells the lifecycle WHERE a section's data lives:
    "event"              → profile.data[section_key]         (bounded, in the root)
    "collection:<name>"  → a child collection keyed by event_id (unbounded)
    "system"             → builder mechanics only (preview/validate/save/publish)
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import event_templates

MODULE_FLAG = "ganesh_module_enabled"        # rollout flag — default OFF

# Child collections the engine owns (kept out of the event root — Master Guide
# §Database Philosophy). Each row carries event_id + the section's payload.
CHILD_COLLECTIONS = (
    "event_committee", "event_days", "event_media", "event_members",
    "event_donations", "event_sponsors", "event_expenses",
    "event_promised_donations", "event_edits",
    # v2 additions
    "celebration_journey", "highlights", "prasadam_menu", "event_blessings",
)

REGISTRY_COLLECTION = "event_registry"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _field(key: str, label: str, ftype: str = "text", *, required: bool = False,
           options: Optional[List[Dict[str, str]]] = None, placeholder: str = "",
           help: str = "", max_length: Optional[int] = None) -> Dict[str, Any]:
    """A single Builder input definition (Doc 06 §Form Management — config-driven).
    ftype ∈ text|textarea|select|color|date|url|tel|email|number|toggle."""
    return {"key": key, "label": label, "type": ftype, "required": required,
            "options": options or [], "placeholder": placeholder, "help": help,
            "max_length": max_length}


def _sec(key: str, title: str, *, store: str = "event", module: Optional[str] = None,
         repeatable: bool = False, translatable: bool = False,
         required_fields: Optional[List[str]] = None,
         fields: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    fields = fields or []
    # required_fields is derived from the schema unless explicitly overridden, so the
    # (registry-driven) publish validation and the rendered form never drift apart.
    if required_fields is None:
        required_fields = [f["key"] for f in fields if f.get("required")]
    return {"key": key, "title": title, "store": store, "module": module,
            "repeatable": repeatable, "translatable": translatable,
            "required_fields": required_fields, "fields": fields}


# --------------------------------------------------------------------------- #
# GANESH CHATURTHI — the first configuration.
# Builder sections follow Spec 03 (14 sections); `store` maps each section to its
# Spec-04 destination: "event" (events root), "root_obj:<field>" (a 1:1 object on
# the root), "one:<collection>" (a 1:1 child doc), "collection:<name>" (a child
# collection with its own CRUD — Spec 05), or "system" (builder mechanics).
# --------------------------------------------------------------------------- #
_LANG_OPTIONS = [{"value": "en", "label": "English"},
                 {"value": "te", "label": "Telugu"},
                 {"value": "hi", "label": "Hindi"}]

GANESH_SECTIONS: List[Dict[str, Any]] = [
    _sec("event_information", "Event Information", store="event", fields=[
        _field("event_name", "Event Name", "text", required=True, placeholder="Sri Vinayaka Chaturthi Mahotsavam 2026"),
        _field("festival_year", "Festival Year", "number", placeholder="2026"),
        _field("festival_edition", "Which Year of Celebration", "number", placeholder="9",
               help="e.g. 9 → shows \"9th Year Celebration\"."),
        _field("since_year", "Celebrating Since", "number", placeholder="2018"),
        _field("theme_label", "Theme (optional)", "text"),
        _field("start_date", "Start Date", "date", required=True),
        _field("end_date", "End Date", "date", required=True),
        _field("description", "About the Event", "textarea", max_length=1000,
               help="A short description shown on the invitation."),
    ]),
    _sec("languages", "Languages", store="root_obj:languages", fields=[
        _field("main_language", "Main Language", "select", options=_LANG_OPTIONS,
               help="The primary language of the invitation (defaults to English)."),
        _field("enabled_languages", "Also Available In", "multiselect", options=_LANG_OPTIONS,
               help="Guests can switch between these at the top of the link (max 3)."),
    ]),
    _sec("organizer_information", "Organizer Information", store="one:organizers", fields=[
        _field("name", "Organizer / Family / Committee Name", "text", placeholder="The Sharma Family"),
        _field("hosted_by_label", "Hosted By Label", "text", placeholder="Hosted by"),
        _field("phone", "Contact Phone", "tel", required=True, placeholder="9876543210"),
        _field("whatsapp", "WhatsApp Number", "tel"),
        _field("email", "Contact Email", "email"),
        _field("temple_name", "Temple / Mandap Name", "text"),
    ]),
    _sec("venue_details", "Venue & Parking", store="one:venues", fields=[
        _field("venue_name", "Venue Name", "text", placeholder="Community Hall"),
        _field("address", "Full Address", "textarea"),
        _field("google_map_url", "Google Maps Link", "url", required=True,
               placeholder="https://maps.google.com/…", help="Paste the share link from Google Maps."),
        _field("landmark", "Nearby Landmark", "text"),
        _field("parking_available", "Parking Available", "toggle"),
        _field("parking_map_url", "Parking Map Link", "url"),
        _field("entry_gate", "Entry Gate", "text", placeholder="Gate 2"),
    ]),
    _sec("theme_selection", "Theme Selection", store="root_obj:theme", fields=[
        _field("template", "Template", "template",   # rendered as the visual picker
               options=event_templates.template_options("ganesh_chaturthi"),
               help="Pick an approved invitation design — your details fill the centre."),
        _field("primary_color", "Primary Color", "color"),
        _field("secondary_color", "Secondary Color", "color"),
        _field("accent_color", "Accent Color", "color"),
    ]),
    _sec("invitation_content", "Invitation Content", store="root_obj:content", translatable=True, fields=[
        _field("heading", "Invitation Heading", "text", placeholder="You are cordially invited"),
        _field("subheading", "Subheading", "text"),
        _field("welcome_message", "Welcome Message", "textarea", max_length=1500,
               placeholder=("Every year, Lord Ganesha fills our home with wisdom, happiness and prosperity. "
                            "With immense gratitude we are blessed to celebrate another year of our Vinayaka "
                            "Chaturthi. Your presence and blessings have been an inseparable part of this "
                            "beautiful journey — we would be honoured to welcome you once again."),
               help="A starter is shown — edit it in your language."),
        _field("invitation_note", "Closing Blessing", "textarea", max_length=800,
               placeholder=("May Lord Ganesha remove every obstacle from your life and bless your family with "
                            "wisdom, prosperity, good health and endless happiness."),
               help="Shown at the very end of the invitation."),
    ]),
    _sec("about_festival", "About & Meaning", store="root_obj:about", translatable=True, fields=[
        _field("story_option", "Story Style", "select", options=[
            {"value": "devotional", "label": "Devotional"},
            {"value": "traditional", "label": "Traditional"}],
            help="Pick a starter text, then edit it in your language."),
        _field("about_text", "About Ganesh Chaturthi", "textarea", max_length=2000,
               placeholder=("Lord Ganesha is worshipped as the remover of obstacles and the giver of wisdom, "
                            "prosperity and new beginnings. Ganesh Chaturthi marks his arrival into our homes — "
                            "a time of prayer, music, prasad and togetherness.")),
        _field("meaning_text", "Meaning of This Celebration", "textarea", max_length=2000,
               placeholder=("This celebration is not merely an annual tradition — it is our family's expression "
                            "of gratitude to Lord Ganesha for His countless blessings. Every year strengthens "
                            "our faith and brings our loved ones closer together.")),
    ]),
    _sec("celebration_journey", "Celebration Journey", store="collection:celebration_journey",
         module="journey", repeatable=True),
    _sec("festival_schedule", "Festival Schedule (per day)", store="collection:festival_schedule",
         module="schedule", repeatable=True),
    _sec("special_highlights", "Special Highlights", store="collection:highlights",
         module="highlights", repeatable=True),
    _sec("dress_code", "Dress Code", store="root_obj:dress_code", fields=[
        _field("enabled", "Show Dress Code", "toggle"),
        _field("attire", "Attire", "text", placeholder="Traditional Indian Attire"),
        _field("colors", "Suggested Colors", "text", placeholder="White, Cream, Yellow, Orange"),
    ]),
    _sec("prasadam_menu", "Prasadam Menu", store="collection:prasadam_menu",
         module="prasadam", repeatable=True),
    _sec("gallery", "Gallery", store="collection:gallery", module="gallery"),
    _sec("blessings_wall", "Blessings Wall", store="root_obj:blessings_config", fields=[
        _field("enabled", "Enable Blessings Wall", "toggle"),
        _field("moderation", "Approve Before Showing", "toggle",
               help="Blessings appear only after you approve them."),
    ]),
    _sec("donation_config", "Donations Setup", store="root_obj:donation_config", fields=[
        _field("enabled", "Enable Donations", "toggle"),
        _field("upi_id", "UPI ID", "text", placeholder="name@upi"),
        _field("qr_image_url", "Payment QR Image", "url"),
        _field("causes", "Causes", "text",
               placeholder="Annadanam, Prasadam, Flowers, Mandap",
               help="Comma-separated list guests can donate towards."),
        _field("show_top_donors", "Show Top Donors", "toggle"),
        _field("top_donors_count", "Top Donors to Show", "number", placeholder="3"),
        _field("show_spending", "Show Where the Money Went", "toggle",
               help="Publishes a category-wise spending summary (mandap, food, decoration…) "
                    "on the invitation. Amounts only — never who spent it."),
    ]),
    _sec("donations", "Donations Received", store="collection:donations", module="finance"),
    _sec("committee_members", "Committee Members", store="collection:committee_members",
         module="members", repeatable=True),
    _sec("sponsors", "Sponsors", store="collection:sponsors", module="finance", repeatable=True),
    _sec("finance", "Expenses / Spending", store="collection:expenses", module="finance"),
    _sec("countdown", "Countdown", store="root_obj:countdown", fields=[
        _field("enabled", "Show Countdown", "toggle"),
        _field("label", "Countdown Label", "text", placeholder="Until Ganapathi Sthapana"),
    ]),
    _sec("seo", "SEO & Sharing", store="root_obj:seo", fields=[
        _field("meta_title", "Share Title", "text", max_length=120,
               placeholder="Ganesh Chaturthi 2026 — You're Invited"),
        _field("meta_description", "Share Description", "textarea", max_length=200,
               help="Shown when the invitation link is shared on WhatsApp / social."),
        _field("share_image_url", "Share Image URL", "url"),
    ]),
    _sec("preview", "Preview", store="system"),
    _sec("publish", "Publish", store="system"),
]

# Feature keys used by the plan/feature-pack gate (owner maps these to plans + prices
# in the Pricing Hub; the public renderer shows a feature only if the plan grants it).
GANESH_FEATURE_KEYS: List[str] = [
    "journey", "per_day_schedule", "per_day_photos", "blessings_wall", "donations",
    "money_portal", "spending_folders", "extra_languages", "countdown", "prasadam_menu",
    "previous_year_gallery", "pdf_download", "money_report", "whatsapp_share",
]

GANESH: Dict[str, Any] = {
    # Spec-04 §4 registry fields
    "event_type_id": "ganesh_chaturthi",
    "event_type": "ganesh_chaturthi",         # kept as the working key used everywhere
    "event_name": "Ganesh Chaturthi",
    "name": "Ganesh Chaturthi",
    "slug": "ganesh-chaturthi",
    "category": "religious",
    "icon": "ganesha",
    "status": "active",
    "default_template": event_templates.default_template("ganesh_chaturthi"),
    "supported_languages": ["en", "te", "hi"],
    "languages": ["en", "te", "hi"],
    # engine config
    "modules": ["gallery", "schedule", "members", "finance", "reports",
                "templates", "translation", "plans", "donations", "sponsors"],
    "layouts": event_templates.template_ids("ganesh_chaturthi"),
    "durations": [1, 3, 5, 7, 9, 11, "custom"],
    "member_roles": ["event_admin", "treasurer", "gallery_manager",
                     "volunteer_manager", "decoration_manager", "food_manager"],
    "sections": GANESH_SECTIONS,
    "builder_config": {"sections": GANESH_SECTIONS},
    "feature_keys": GANESH_FEATURE_KEYS,      # plan/feature-pack mapping (Pricing Hub)
    "free_edits": 15,                         # publishes before extra-edit pricing (admin-editable)
}

EVENT_TYPES: Dict[str, Dict[str, Any]] = {
    GANESH["event_type"]: GANESH,
}


# --------------------------------------------------------------------------- #
# accessors
# --------------------------------------------------------------------------- #
def get_config(event_type: str) -> Optional[Dict[str, Any]]:
    return EVENT_TYPES.get(event_type)


def data_sections(event_type: str) -> List[Dict[str, Any]]:
    """Sections whose data is stored in the event root (profile.data)."""
    cfg = get_config(event_type) or {}
    return [s for s in cfg.get("sections", []) if s.get("store") == "event"]


def publish_requirements(event_type: str) -> List[Dict[str, str]]:
    """Flattened (section_key, field) pairs that must be present to publish."""
    cfg = get_config(event_type) or {}
    out: List[Dict[str, str]] = []
    for s in cfg.get("sections", []):
        for f in s.get("required_fields", []):
            out.append({"section": s["key"], "field": f})
    return out


# --------------------------------------------------------------------------- #
# seed (idempotent) — mirrors the pricing/storage seed pattern
# --------------------------------------------------------------------------- #
async def seed_event_registry(db) -> Dict[str, Any]:
    ensure = getattr(db, "ensure_table", None)
    if ensure:
        for name in CHILD_COLLECTIONS + (REGISTRY_COLLECTION,):
            await ensure(name)

    created = skipped = 0
    for et, cfg in EVENT_TYPES.items():
        if await db.event_registry.find_one({"event_type": et}):
            await db.event_registry.update_one(
                {"event_type": et}, {"$set": {**cfg, "updated_at": _now()}})
            skipped += 1
        else:
            await db.event_registry.insert_one({**cfg, "created_at": _now(), "updated_at": _now()})
            created += 1

    # rollout flag. Precedence:
    #   1. env GANESH_MODULE_ENABLED ("1"/"true"/"on" → ON, "0"/"false"/"off" → OFF)
    #      — lets the owner enable/disable at deploy time via .env, honoured every boot.
    #   2. otherwise keep any value an admin already set (never flip their choice).
    #   3. otherwise default OFF on first seed.
    import os
    env = os.environ.get("GANESH_MODULE_ENABLED")
    if env is not None and env.strip() != "":
        on = env.strip().lower() in ("1", "true", "yes", "on")
        await db.app_settings.update_one(
            {"key": MODULE_FLAG},
            {"$set": {"key": MODULE_FLAG, "value": on, "updated_at": _now()}}, upsert=True)
    elif await db.app_settings.find_one({"key": MODULE_FLAG}) is None:
        await db.app_settings.update_one(
            {"key": MODULE_FLAG},
            {"$set": {"key": MODULE_FLAG, "value": False, "updated_at": _now()}}, upsert=True)
    return {"registry_created": created, "registry_updated": skipped, "flag": MODULE_FLAG}


async def module_enabled(db) -> bool:
    try:
        doc = await db.app_settings.find_one({"key": MODULE_FLAG})
        return bool(doc and doc.get("value") is True)
    except Exception:
        return False
