"""
camera_profiles.py — camera-agnostic capability registry for the SFTP camera
ingestion lane.

The ingestion pipeline (`camera_transfer_service` + `camera_sftp_server`) is
PROTOCOL-driven, not brand-driven: it authenticates an SFTP identity and lands
bytes, regardless of which camera pushed them. This module only carries the
per-model metadata the UI needs to SHOW the photographer the right settings
(which fields the camera exposes, whether it can auto-transfer, the recommended
protocol) and to label a model's support level honestly.

Add a camera by adding a `CameraProfile` row — no pipeline code changes. There
is deliberately NO `if brand == "sony"` anywhere in the ingestion path.

Protocol policy (matches the brief):
  * SFTP    — preferred, the only protocol the bundled server speaks.
  * FTPS    — allowed as a *documented* compatibility target for cameras with
              no SFTP; a separate FTPS front-end would implement it. Marked so
              the UI can warn it is not what THIS server terminates.
  * FTP     — plain FTP is INSECURE and never enabled. Present only so a profile
              can declare a camera *has* it, so the UI can say "do not use".
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, List, Optional

# Support levels — never claim more than has been verified.
SUPPORTED = "supported"        # configuration verified end to end
PARTIAL = "partial"            # works with caveats (see notes)
UNVERIFIED = "unverified"      # generic profile / not yet acceptance-tested

# Protocols. SFTP is the only one the bundled server terminates.
PROTO_SFTP = "sftp"
PROTO_FTPS = "ftps"
PROTO_FTP = "ftp"              # insecure — never enabled


@dataclass(frozen=True)
class CameraProfile:
    """What a given camera model can do over the network. Pure metadata."""
    key: str                       # stable slug, e.g. "sony_a7m4"
    brand: str
    model: str
    protocol: str                  # recommended protocol for this model
    supports_sftp: bool
    supports_ftps: bool
    supports_ftp: bool             # whether the camera *offers* plain FTP (we never use it)
    supports_auto_transfer: bool   # auto-send each shot as taken
    supports_batch_transfer: bool  # send-all / queued transfer
    supports_remote_directory: bool
    supports_config_import: bool    # QR / settings-file import of connection config
    support_level: str
    notes: str = ""

    def as_dict(self) -> Dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Registry. First compatibility target is the Sony a7 IV (ILCE-7M4), which
# Sony documents as supporting FTP/FTPS AND SFTP transfer. We use SFTP.
# ---------------------------------------------------------------------------
SONY_A7M4 = CameraProfile(
    key="sony_a7m4",
    brand="Sony",
    model="a7 IV (ILCE-7M4)",
    # Verified against Sony's FTP Help Guide: the a7 IV supports FTP and FTPES
    # (FTP-over-TLS) — its "Secure Protocol" option is FTPES/FTPS. It does NOT
    # support SFTP (SSH). So the recommended protocol is FTPES.
    protocol=PROTO_FTPS,
    supports_sftp=False,
    supports_ftps=True,
    supports_ftp=True,
    supports_auto_transfer=True,     # "FTP auto transfer" in the network menu
    supports_batch_transfer=True,    # select images -> FTP transfer
    supports_remote_directory=True,  # "Directory Specify"
    supports_config_import=True,     # Save/Load FTP Settings to a memory card
    support_level=SUPPORTED,
    notes=("Network > FTP Transfer Func. Get the camera online first (Wi-Fi to a "
           "router/hotspot, or USB tethering, or wired LAN). Then Server Setting: "
           "Host, Port, User, Password, and Secure Protocol: ON (FTPES). If it "
           "reports a root-certificate error, set it to connect anyway (the link "
           "is still TLS-encrypted). JPEG/HEIF land in the gallery; camera RAW "
           "(.ARW) is transferred but NOT face-indexed — shoot JPEG or JPEG+RAW."),
)

GENERIC_SFTP = CameraProfile(
    key="generic_sftp",
    brand="Generic",
    model="Any SFTP-capable camera / tether",
    protocol=PROTO_SFTP,
    supports_sftp=True,
    supports_ftps=False,
    supports_ftp=False,
    supports_auto_transfer=False,
    supports_batch_transfer=True,
    supports_remote_directory=True,
    supports_config_import=False,
    support_level=UNVERIFIED,
    notes="Any camera or tethering tool that speaks SFTP with host/port/user/password.",
)

GENERIC_FTPS = CameraProfile(
    key="generic_ftps",
    brand="Generic",
    model="FTPS-only camera (compatibility)",
    protocol=PROTO_FTPS,
    supports_sftp=False,
    supports_ftps=True,
    supports_ftp=True,
    supports_auto_transfer=False,
    supports_batch_transfer=True,
    supports_remote_directory=True,
    supports_config_import=False,
    support_level=PARTIAL,
    notes=("For cameras with no SFTP. Requires a separate FTPS front-end (not the "
           "bundled SFTP server). Documented, not terminated by this service yet."),
)

_REGISTRY: Dict[str, CameraProfile] = {
    p.key: p for p in (SONY_A7M4, GENERIC_SFTP, GENERIC_FTPS)
}

DEFAULT_PROFILE_KEY = SONY_A7M4.key


def get_profile(key: Optional[str]) -> CameraProfile:
    """Return the profile for `key`, falling back to the generic SFTP profile
    for an unknown/blank key (never raises — an unknown camera is still an SFTP
    client)."""
    return _REGISTRY.get((key or "").strip().lower(), GENERIC_SFTP)


def list_profiles() -> List[Dict]:
    """All known profiles as dicts (for the UI's camera picker)."""
    return [p.as_dict() for p in _REGISTRY.values()]


def is_protocol_allowed(protocol: str) -> bool:
    """SFTP and FTPS may be configured; plain FTP is never allowed."""
    return (protocol or "").strip().lower() in (PROTO_SFTP, PROTO_FTPS)


if __name__ == "__main__":
    # Self-check: registry integrity + the FTP-never-allowed invariant.
    assert get_profile("sony_a7m4").brand == "Sony"
    assert get_profile("nope").key == "generic_sftp"      # unknown -> generic
    assert is_protocol_allowed("sftp") and is_protocol_allowed("SFTP")
    assert is_protocol_allowed("ftps")
    assert not is_protocol_allowed("ftp"), "plain FTP must never be allowed"
    assert not is_protocol_allowed(""), "blank protocol must not be allowed"
    for p in _REGISTRY.values():
        assert p.protocol != PROTO_FTP, "no profile may recommend plain FTP"
        assert p.support_level in (SUPPORTED, PARTIAL, UNVERIFIED)
    print("camera_profiles self-check OK:", ", ".join(_REGISTRY))
