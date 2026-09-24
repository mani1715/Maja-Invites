"""Canonical RSVP status vocabulary.

The submit path (GuestInvitation.jsx) writes 'yes'/'no'/'maybe', but two older
analytics endpoints counted 'confirmed/declined/pending' and
'accepted/declined/pending' — vocabularies nothing ever wrote, so those
dashboards silently showed zero. Every aggregation must go through this.
Standalone module (no server.py import) so tests don't need a booted app.
"""


def normalize_rsvp_status(value) -> str:
    """Collapse every RSVP status spelling to the canonical yes/no/maybe."""
    v = str(value or "").strip().lower()
    if v in ("yes", "confirmed", "accepted", "attending"):
        return "yes"
    if v in ("no", "declined", "not_attending", "rejected"):
        return "no"
    return "maybe"  # maybe / pending / tentative / unknown legacy values
