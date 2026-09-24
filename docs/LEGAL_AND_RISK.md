# MAJA Invites - Legal & Ops Risk Memo

Status: DRAFT working memo, not legal advice. Written for the founder/CTO to
work through before public launch and Razorpay go-live. Every [PLACEHOLDER]
needs an owner decision or a real value before launch. Get final sign-off on
Terms/Privacy/Refund content and this memo's conclusions from a qualified
Indian lawyer (data protection + consumer/e-commerce) and a CA (GST), not
from this document alone.

Operator entity: [LEGAL ENTITY NAME, e.g. "MAJA Creations"], sole
proprietorship, details TBD (registered address, PAN, GSTIN, bank account
for Razorpay settlement all still placeholders in the codebase - see
Section 3).

Scope note: findings below are grounded in the current backend
(`backend/`) as of this memo's date, not aspiration - each item says what
exists today vs. what's missing.

**Product pivot 2026-08-11 note (owner-decided, final) — simplifies, does
not eliminate, DPDP exposure.** Normal-user (couple/buyer) accounts are
retired; photographers/studios are now the only account holders
(`backend/user_auth.py`, `user_features.py` answer `410
NORMAL_USERS_RETIRED`; 34/34 in `backend/tests/test_users_retired.py`; see
`docs/ARCHITECTURE_MIGRATION_MAP.md` §6b for full evidence). Effect on this
memo:

- **Lighter consumer-account DPDP surface.** There is no longer a
  self-serve couple/consumer account to build "download my data"/"delete my
  account" tooling for (item 1's data-principal-rights bullet, item 3's
  placeholder consent tooling) - the only account holders left are business
  users (photographers), so that specific consumer-account-rights UI is no
  longer a launch requirement. Buyers now transact under their own studio
  admin identity (`store_features.py`'s `_require_studio_buyer`), not as an
  anonymous consumer checking a box at a one-off checkout - item 1's
  "log checkbox agreed to Terms + Privacy at checkout" recommendation should
  now be read as photographer-account-level acceptance, not a couple's.
- **Unchanged: couples and guests remain data principals under DPDP**
  regardless of who holds the account. Every existing obligation tied to
  their data - face-match consent (item 1, item 6), guest-list processing,
  gallery photos, RSVP data, minors in photos (item 11), takedown requests
  (item 12) - is untouched by this pivot; a couple's invitation/gallery data
  still needs the same consent, access, and deletion handling whether or
  not the couple ever had a login of their own. Nothing in this memo's P0/P1
  items is resolved or downgraded by the pivot - only the account-management
  surface around them shrank.
- **Couple Access portal is unaffected.** The event_client-JWT portal
  (`photographer_clients.py`, `/couple/access/:slug`) a photographer hands a
  couple was never a normal-user account and is explicitly untouched by the
  pivot - it remains the couple's only in-product touchpoint, read-mostly,
  issued and revocable by the studio.

---

## Priority key

- **P0** - blocks legal go-live or creates acute regulatory/financial exposure. Fix before public launch.
- **P1** - real exposure, fix in the first weeks after launch.
- **P2** - lower urgency, track and schedule.

---

## P0 - Blocks launch

### 1. DPDP Act 2023 obligations

The Digital Personal Data Protection Act, 2023 makes MAJA a "Data
Fiduciary" the moment it processes an identifiable Indian individual's
data (couples, guests, photographers all count). Concretely:

- **Consent records.** The face-match flow already does this right:
  `backend/face_consent.py` records an explicit `agreed=True` row per
  (gallery, guest IP-hash) before any selfie is processed, valid 90 days,
  with a public withdraw endpoint
  (`POST /api/public/gallery/{slug}/face-consent/withdraw`). Nothing
  equivalent exists yet for the *other* consents the Act expects a Data
  Fiduciary to be able to show on demand - e.g. a couple's consent to us
  processing their guest list, or a guest's consent to receiving WhatsApp
  messages. Recommendation: at minimum, log "checkbox agreed to Terms +
  Privacy at checkout, timestamp X" for buyers, the same way face-consent
  already does for guests.
- **Biometric data = higher bar.** Face data is treated as sensitive
  personal data in practice even though DPDP doesn't have a separate
  "sensitive" tier like GDPR. The current design already does the right
  things structurally: opt-in only, 90-day validity, AWS Rekognition in
  `ap-south-1` (see `backend/aws_service.py`), and deletion on withdrawal
  or link expiry. Keep this as the reference pattern - do not add a
  biometric feature elsewhere in the product without the same
  consent-before-processing gate.
- **Data-principal rights tooling.** The Act gives individuals rights to
  access, correct, and erase their data, and to have a way to complain.
  Today there is no self-serve "download my data" or "delete my account"
  button anywhere in the product - Privacy.jsx promises a 30-day response
  to a written request, but that request currently has to be handled
  manually by whoever reads the support inbox. Fine for launch volume;
  build a real tool once request volume makes manual handling slow.
- **Grievance officer.** DPDP requires a published grievance officer.
  Privacy.jsx has a placeholder block for this
  (`frontend-v2/src/pages/legal/Privacy.jsx`, Section 7) - name, address,
  and email need to be filled in before launch.

### 2. CERT-In 6-hour breach reporting

CERT-In's 2022 directions require reporting specified cyber security
incidents to CERT-In **within 6 hours of noticing them** - this is far
tighter than DPDP's own "without undue delay" breach language, and it's
the one that actually has teeth (non-compliance is a criminal offence
under the IT Act). A data breach involving guest face data or payment
references would qualify. There is currently no documented incident
response runbook naming who declares an incident, who calls CERT-In, and
within what internal SLA (needs to be well under 6 hours to leave room to
actually investigate and report in time). Recommendation: a one-page
runbook with names/numbers, not a policy essay - this is the kind of thing
that's useless if it's not immediately actionable at 2 AM.

### 3. Razorpay KYC requires linked Terms/Privacy/Refund pages

Razorpay's onboarding checklist requires a live website with publicly
linked Terms of Service, Privacy Policy, and Refund/Cancellation policy
pages before it will activate full payment collection. These now exist:

- `frontend-v2/src/pages/legal/Terms.jsx` -> `/terms`
- `frontend-v2/src/pages/legal/Privacy.jsx` -> `/privacy`
- `frontend-v2/src/pages/legal/RefundPolicy.jsx` -> `/refund`

They are cross-linked to each other and to `/contact` in each page's
footer, and are routed in `App.jsx`. **Keep them reachable from the
site's real footer** (not just from each other) once a global footer
exists - Razorpay's reviewers, and DPDP audits, expect to find these from
the homepage without hunting. Do not gate any of these three routes
behind login.

All three pages currently carry [BRACKETED] placeholders (legal entity
name, registered address, jurisdiction city, grievance officer). Razorpay
KYC will also want the entity name/address on the pages to match the KYC
documents submitted - fill placeholders from the same source of truth.

---

## P1 - Fix soon after launch

### 4. GST registration threshold + invoicing

Good news: GST-compliant invoicing already exists in code -
`backend/invoice_service.py` generates CGST/SGST/IGST-split invoices and
PDFs, reading seller details from env
(`INVOICE_SELLER_GSTIN`, `INVOICE_SELLER_ADDRESS`, `INVOICE_SELLER_STATE`,
`GST_RATE=18`, HSN/SAC `998431` - see `backend/.env.example`). Every one
of those env vars is currently blank.

What's still an owner decision, not a code task:

- Confirm whether MAJA's aggregate turnover has crossed (or is expected to
  cross) the GST registration threshold - generally Rs. 20 lakh/year for
  services (Rs. 10 lakh in special-category states) under Section 22 CGST
  Act. Register before crossing it, not after; there are exceptions and
  edge cases (e.g. rules around suppliers selling via e-commerce
  operators) a CA should confirm against MAJA's actual sales model.
- Once GSTIN is issued, fill `INVOICE_SELLER_GSTIN` /
  `INVOICE_SELLER_ADDRESS` / `INVOICE_SELLER_STATE` and confirm the HSN/SAC
  code `998431` is the right classification for a done-for-you digital
  invitation-building service with a CA - a wrong SAC code on every
  invoice is a paper-trail problem waiting to surface at audit time.
- Decide who reconciles GST returns against Razorpay settlement reports
  (Razorpay's own fee is itself a taxable supply to MAJA - don't forget
  input tax credit on that side).

### 5. Photographer-vs-couple copyright in uploaded photos

No licence or attribution capture exists today between a photographer/
studio account and the couple whose event they shot -
`backend/portfolio_service.py` and `backend/gallery_features.py` were
grepped for `copyright`/`licens`/`ownership` language and found none. In
practice this means: when a professional photographer's photos end up in
a MAJA gallery, nobody has a record of whether the couple has the right
to redistribute those photos to 200 guests, or whether the photographer
retains copyright and only licensed delivery-to-couple, not
onward-sharing. Terms.jsx Section 4 puts the warranty on the couple ("you
have the right to share every photo you upload"), which covers MAJA
contractually, but does nothing to actually prevent a photographer
dispute. Recommendation: when a studio account is linked to a couple's
event (the "for photographers" flow), capture a simple explicit checkbox
- "I grant the couple a licence to display these photos in their MAJA
gallery" - at upload time, the same pattern already used for face-match
consent.

### 6. Guests appearing in other guests' face-match results without consenting - document the current gate

This was flagged as a risk to watch, but the code already has the right
shape - documenting it here so it isn't accidentally weakened later.
`backend/gallery_features.py` (`public_face_search`, around line 534-540)
checks `has_valid_consent(db, profile_id, ip_hash)` and returns
**HTTP 428 `CONSENT_REQUIRED`** if the requesting guest hasn't opted in,
before any selfie is processed against the gallery's indexed faces. Two
things to keep true as the product evolves:

- **Consent gates the searcher, not the searched-for.** A guest who
  never consents cannot run a face search - but their own face, if it
  appears in *someone else's* uploaded photo, can still be indexed into
  the collection and matched against by a consenting guest. If that's not
  the intended privacy posture, the fix is a per-gallery "opt out of being
  indexed" control, distinct from today's "opt in to searching" control -
  worth a product decision, not just an engineering one.
- **Consent is IP-hash-scoped, not guest-identity-scoped**
  (`face_consent.py: compute_ip_hash`). Everyone behind the same NAT/venue
  Wi-Fi shares a consent record. This is a reasonable trade-off for an
  anonymous public endpoint (there's no login to key consent off instead),
  but means one guest's opt-in can silently cover another device on the
  same network, and the same guest gets asked again from a new network.
  Acceptable for launch; note it if this ever needs to withstand a formal
  DPDP audit of "explicit, per-individual consent."

### 7. Refund and chargeback ops

`RefundPolicy.jsx` states the policy; nothing enforces it operationally
yet. Before relying on it in a Razorpay dispute:

- Decide who actually executes an approved refund in the Razorpay
  dashboard/API and within what internal SLA (the policy promises 5-7
  business days to the customer - that clock includes bank processing
  time, so the internal "approve and initiate" step needs to happen
  quickly).
- Log the "work started" event (first design touch on an order) somewhere
  queryable, since the 50%-refund line in Section 3 of the refund policy
  hinges on it and support will need to check it per-order.
- When a chargeback lands, someone needs to pull the delivery timestamp
  and the order's face-consent/RSVP activity as evidence the invitation
  was live and used - decide who owns assembling that evidence packet
  before the first real chargeback forces the question.

### 8. Terms versioning + change notice

Both Terms.jsx and Privacy.jsx promise a new "Last updated" date and,
for material changes, direct notice to active customers. There is
currently no changelog or version history for these pages, and no email
hook wired to "Terms changed" the way there presumably is for order
confirmations. A future material change (e.g. adding a new AWS
sub-processor, or changing the refund window) needs a real notification
path, not just an edited date on the page. Low cost to add now: keep a
one-line dated changelog at the bottom of this memo or in
`docs/` each time either page changes materially.

---

## P2 - Track, schedule later

### 9. TRAI/DLT rules if SMS is ever added

MAJA currently delivers invitation links via WhatsApp, not SMS (per
Privacy.jsx's third-party table). If SMS delivery or SMS-based OTP is
added later, it falls under TRAI's Telecom Commercial Communications
Customer Preference Regulations (TCCCPR) - sender IDs and message
templates must be pre-registered on a DLT platform before any commercial/
transactional SMS can be sent to Indian numbers, or the message is
silently blocked by the telecom carrier. Not urgent today; becomes a P0
the day SMS is scoped in, because DLT registration has lead time and
can't be done same-day.

### 10. WhatsApp Business opt-in rules

WhatsApp's Business Platform requires the recipient to have opted in
before MAJA sends a business-initiated (template) message, and every
message template needs Meta's pre-approval. Confirm the current
WhatsApp-delivery integration is opted in appropriately (a couple buying
an invitation for their own event is one thing; sending guests an
unsolicited WhatsApp message before they've interacted with MAJA at all
is a different, riskier case) and that templates in use are the approved
versions, not free-text.

### 11. Minors in photos

Terms/Privacy already state buyers must be 18+, and guests of any age may
appear in gallery photos "at the couple's discretion" (Privacy.jsx
Section 9). This is a reasonable default for a wedding context (children
routinely appear in wedding photos with family consent implied by
attendance), but if MAJA ever adds a feature that runs face-match
specifically *of* a minor (not just a minor appearing incidentally in a
group photo), that needs its own explicit-guardian-consent gate before
launch, not the current guest self-consent flow.

### 12. Takedown request flow

There is a general moderation queue (`backend/auto_moderation.py`,
`pixora_reports` collection - auto- and human-flagged content, resolved
by admin tools) and a couple-facing delete-photo endpoint
(`DELETE /admin/profiles/{profile_id}/gallery/photos/{photo_id}` in
`backend/gallery_features.py`). Neither is wired for the specific case of
"a guest who appears in a photo, uploaded by someone else, wants it taken
down" - that guest has no account and no obvious path to request removal
today besides emailing support. For launch, document the manual path
(support inbox -> confirm identity loosely -> couple or admin deletes via
the existing endpoint) as the interim process; build a lightweight public
"report this photo" link on the gallery only if volume justifies it.

---

## Placeholders the owner must fill before launch

- [ ] Legal entity name and registered address (used across Terms,
      Privacy, and this memo)
- [ ] Jurisdiction city for governing-law clause (Terms.jsx Section 11)
- [ ] Grievance officer name, address, email (Privacy.jsx Section 7)
- [ ] `INVOICE_SELLER_GSTIN`, `INVOICE_SELLER_ADDRESS`,
      `INVOICE_SELLER_STATE` in the real `.env` (see `.env.example`)
- [ ] Confirm HSN/SAC `998431` with a CA
- [ ] Confirm GST registration status/timing against actual turnover
- [ ] Support email inbox owner and response-time SLA (currently
      `SUPPORT_EMAIL` in `frontend-v2/src/lib/marketingLinks.js`)
- [ ] CERT-In incident response runbook: names, numbers, internal SLA
- [ ] Razorpay KYC document set matching the legal entity name/address
      used on the legal pages

---

## 10-item pre-launch legal checklist

1. [ ] Legal entity, address, and jurisdiction city filled in on all
       three legal pages (Terms.jsx, Privacy.jsx, RefundPolicy.jsx) -
       no `[BRACKETED]` text left visible in production.
2. [ ] Grievance officer named and reachable at the published email
       (Privacy.jsx Section 7); 30-day response process actually staffed.
3. [ ] `/terms`, `/privacy`, `/refund` linked from the site's real global
       footer, not only from each other - reachable without login.
4. [ ] Razorpay KYC submitted with documents matching the entity name/
       address on the legal pages; Razorpay account fully activated
       (not test mode) before accepting real payments.
5. [ ] GST registration decision made (register or documented reason not
       yet required) and, if registered, `INVOICE_SELLER_GSTIN` /
       `_ADDRESS` / `_STATE` set in production env.
6. [ ] CERT-In breach-reporting runbook written and the on-call
       person(s) know they own the 6-hour clock.
7. [ ] Photographer-couple photo licence checkbox added to the studio
       upload flow (or explicitly deferred with a documented reason).
8. [ ] Face-match consent gate (`has_valid_consent` /
       `HTTP 428 CONSENT_REQUIRED`) verified live in production, not just
       staging - this is the single control the Face Match section of
       Privacy.jsx relies on being true.
9. [ ] Refund-policy operational steps assigned: who marks "work
       started," who executes approved Razorpay refunds, who assembles
       chargeback evidence.
10. [ ] This memo and all three legal pages reviewed by a qualified
        Indian lawyer (data protection + consumer/e-commerce) and a CA
        (GST) - sign-off recorded before public launch.
