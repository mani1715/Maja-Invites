"""
PHASE 32: Access Control System
Handles invitation visibility modes and passcode protection
"""

from datetime import datetime, timezone, timedelta
from typing import Optional, Dict
import hashlib
import re
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# PASSCODE MANAGEMENT
# ============================================================================

def hash_passcode(passcode: str) -> str:
    """
    Hash passcode using SHA-256
    
    Args:
        passcode: 4-6 digit numeric passcode
    
    Returns:
        Hashed passcode string
    """
    if not passcode:
        return None
    
    # Convert to string and hash
    passcode_str = str(passcode)
    return hashlib.sha256(passcode_str.encode()).hexdigest()


def validate_passcode_format(passcode: str) -> bool:
    """
    Validate passcode format
    Rules:
    - 4-6 digits
    - Numeric only
    
    Args:
        passcode: Passcode to validate
    
    Returns:
        True if valid, False otherwise
    """
    if not passcode:
        return False
    
    # Check if numeric and 4-6 digits
    if not re.match(r'^\d{4,6}$', str(passcode)):
        return False
    
    return True


def verify_passcode(provided_passcode: str, stored_hash: str) -> bool:
    """
    Verify provided passcode against stored hash
    
    Args:
        provided_passcode: Passcode provided by user
        stored_hash: Stored hashed passcode
    
    Returns:
        True if match, False otherwise
    """
    if not provided_passcode or not stored_hash:
        return False
    
    provided_hash = hash_passcode(provided_passcode)
    return provided_hash == stored_hash


# ============================================================================
# ACCESS ATTEMPT TRACKING
# ============================================================================

# In-memory tracking of access attempts
# Format: {event_id_ip_combination: {"attempts": count, "last_attempt": timestamp, "blocked_until": timestamp}}
access_attempts = {}


def get_attempt_key(event_id: str, ip_address: str) -> str:
    """Generate key for attempt tracking"""
    return f"{event_id}:{ip_address}"


def track_failed_attempt(event_id: str, ip_address: str) -> Dict:
    """
    Track failed passcode attempt
    
    Args:
        event_id: Event ID
        ip_address: Client IP address
    
    Returns:
        {
            "attempts": int,
            "remaining": int,
            "blocked": bool,
            "blocked_until": datetime or None
        }
    """
    key = get_attempt_key(event_id, ip_address)
    now = datetime.now(timezone.utc)
    
    if key not in access_attempts:
        access_attempts[key] = {
            "attempts": 1,
            "last_attempt": now,
            "blocked_until": None
        }
    else:
        access_attempts[key]["attempts"] += 1
        access_attempts[key]["last_attempt"] = now
    
    attempts = access_attempts[key]["attempts"]
    max_attempts = 5
    remaining = max(0, max_attempts - attempts)
    
    # Block after 5 failed attempts for 1 hour
    if attempts >= max_attempts:
        block_until = now + timedelta(hours=1)
        access_attempts[key]["blocked_until"] = block_until
        
        logger.warning(f"IP {ip_address} blocked for event {event_id} after {attempts} failed attempts until {block_until}")
        
        return {
            "attempts": attempts,
            "remaining": 0,
            "blocked": True,
            "blocked_until": block_until
        }
    
    return {
        "attempts": attempts,
        "remaining": remaining,
        "blocked": False,
        "blocked_until": None
    }


def reset_attempts(event_id: str, ip_address: str):
    """Reset access attempts for successful access"""
    key = get_attempt_key(event_id, ip_address)
    if key in access_attempts:
        del access_attempts[key]


def is_access_blocked(event_id: str, ip_address: str) -> Optional[datetime]:
    """
    Check if access is blocked for this event/IP combination
    
    Returns:
        Blocked until timestamp if blocked, None otherwise
    """
    key = get_attempt_key(event_id, ip_address)
    
    if key not in access_attempts:
        return None
    
    blocked_until = access_attempts[key].get("blocked_until")
    
    if blocked_until:
        now = datetime.now(timezone.utc)
        if blocked_until > now:
            return blocked_until
        else:
            # Block expired, reset
            del access_attempts[key]
            return None
    
    return None


def get_remaining_attempts(event_id: str, ip_address: str) -> int:
    """Get remaining attempts before block"""
    key = get_attempt_key(event_id, ip_address)
    
    if key not in access_attempts:
        return 5
    
    attempts = access_attempts[key].get("attempts", 0)
    return max(0, 5 - attempts)


def clean_old_attempts():
    """Clean up old attempt records (older than 24 hours)"""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)
    
    for key in list(access_attempts.keys()):
        last_attempt = access_attempts[key].get("last_attempt")
        blocked_until = access_attempts[key].get("blocked_until")
        
        # Remove if last attempt was > 24h ago and not currently blocked
        if last_attempt and last_attempt < cutoff:
            if not blocked_until or blocked_until < now:
                del access_attempts[key]


# ============================================================================
# VISIBILITY MODE CHECKS
# ============================================================================

def check_event_access(
    event: dict,
    provided_passcode: Optional[str] = None,
    ip_address: str = "unknown"
) -> Dict:
    """
    Check if access is allowed to event based on visibility mode
    
    Args:
        event: Event dictionary with visibility_mode and access_passcode_hash
        provided_passcode: Passcode provided by user (if any)
        ip_address: Client IP address
    
    Returns:
        {
            "allowed": bool,
            "reason": str (if not allowed),
            "requires_passcode": bool,
            "blocked_until": datetime or None,
            "remaining_attempts": int
        }
    """
    visibility_mode = event.get("visibility_mode", "public")
    event_id = event.get("event_id", "unknown")
    
    # Clean old attempts periodically
    if len(access_attempts) > 1000:
        clean_old_attempts()
    
    # PUBLIC: Always allow access
    if visibility_mode == "public":
        return {
            "allowed": True,
            "reason": None,
            "requires_passcode": False,
            "blocked_until": None,
            "remaining_attempts": 5
        }
    
    # UNLISTED: Allow access (not indexed by search engines, but no passcode)
    if visibility_mode == "unlisted":
        return {
            "allowed": True,
            "reason": None,
            "requires_passcode": False,
            "blocked_until": None,
            "remaining_attempts": 5
        }
    
    # PRIVATE: Requires passcode
    if visibility_mode == "private":
        # Check if IP is blocked
        blocked_until = is_access_blocked(event_id, ip_address)
        if blocked_until:
            return {
                "allowed": False,
                "reason": "Too many failed attempts. Access temporarily blocked.",
                "requires_passcode": True,
                "blocked_until": blocked_until,
                "remaining_attempts": 0
            }
        
        # Check if passcode provided
        if not provided_passcode:
            return {
                "allowed": False,
                "reason": "This event is private. Please enter the passcode.",
                "requires_passcode": True,
                "blocked_until": None,
                "remaining_attempts": get_remaining_attempts(event_id, ip_address)
            }
        
        # Verify passcode
        stored_hash = event.get("access_passcode_hash")
        if not stored_hash:
            # No passcode set, treat as public (fallback)
            logger.warning(f"Event {event_id} is private but has no passcode hash. Allowing access.")
            return {
                "allowed": True,
                "reason": None,
                "requires_passcode": False,
                "blocked_until": None,
                "remaining_attempts": 5
            }
        
        if verify_passcode(provided_passcode, stored_hash):
            # Correct passcode, reset attempts
            reset_attempts(event_id, ip_address)
            return {
                "allowed": True,
                "reason": None,
                "requires_passcode": False,
                "blocked_until": None,
                "remaining_attempts": 5
            }
        else:
            # Wrong passcode, track attempt
            attempt_result = track_failed_attempt(event_id, ip_address)
            return {
                "allowed": False,
                "reason": f"Incorrect passcode. {attempt_result['remaining']} attempts remaining.",
                "requires_passcode": True,
                "blocked_until": attempt_result.get("blocked_until"),
                "remaining_attempts": attempt_result["remaining"]
            }
    
    # Unknown visibility mode, default to public
    logger.warning(f"Unknown visibility mode '{visibility_mode}' for event {event_id}. Defaulting to public.")
    return {
        "allowed": True,
        "reason": None,
        "requires_passcode": False,
        "blocked_until": None,
        "remaining_attempts": 5
    }
