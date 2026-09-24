# API_SURFACE.md — every backend route

> **GENERATED — do not hand-edit.** `cd backend && python scripts/dump_api_surface.py`

> Extracted 2026-08-06 · **1182 routes** across 181 namespaces.

> This is the contract a rewritten frontend has to satisfy. Auth is inferred from the dependency used; see the caveats in the generator's docstring before treating `PUBLIC` as safe.


## Auth guards

| Guard | Routes | Meaning |
|---|---:|---|
| `require_admin` | 344 | Photographer (studio) session. |
| `require_super_admin` | 281 | Super-admin only (the owner). |
| `PUBLIC` | 263 | No recognised auth dependency — verify before trusting. |
| `get_current_admin` | 208 | Photographer (studio) session. **Returns a STRING id, not a dict.** |
| `get_current_buyer` | 55 | Either buyer identity (studio bearer OR user cookie). |
| `get_current_public_user` | 18 | Normal user (couple) cookie session. |
| `current_admin_dep` | 10 | Photographer (studio) session — injected dep. |
| `get_current_admin_with_role` | 3 | Photographer/admin, role inspected. |

## Namespaces by size

| Namespace | Routes |
|---|---:|
| [`/api/pixora`](#apipixora) | 182 |
| [`/api/admin/profiles`](#apiadminprofiles) | 107 |
| [`/api/events`](#apievents) | 60 |
| [`/api/public`](#apipublic) | 59 |
| [`/api/admin/pricing`](#apiadminpricing) | 40 |
| [`/api/admin/events`](#apiadminevents) | 37 |
| [`/api/invite`](#apiinvite) | 34 |
| [`/api/super-admin/pricing`](#apisuperadminpricing) | 26 |
| [`/api/studio`](#apistudio) | 23 |
| [`/api/portfolio`](#apiportfolio) | 23 |
| [`/api/super-admin/v2`](#apisuperadminv2) | 23 |
| [`/api/users`](#apiusers) | 21 |
| [`/api/super-admin/storage`](#apisuperadminstorage) | 21 |
| [`/admin`](#admin) | 18 |
| [`/api/client`](#apiclient) | 17 |
| [`/api/auth`](#apiauth) | 14 |
| [`/api/cloud-backup`](#apicloudbackup) | 13 |
| [`/api/admin/restructured`](#apiadminrestructured) | 13 |
| [`/api/profiles`](#apiprofiles) | 12 |
| [`/api/store`](#apistore) | 12 |
| [`/api/admin/fulfillment`](#apiadminfulfillment) | 11 |
| [`/api/calendar`](#apicalendar) | 10 |
| [`/api/weddings`](#apiweddings) | 10 |
| [`/api/v2`](#apiv2) | 9 |
| [`/api/event-money`](#apieventmoney) | 7 |
| [`/api/admin/pixora`](#apiadminpixora) | 7 |
| [`/api/creator`](#apicreator) | 7 |
| [`/super-admin`](#superadmin) | 7 |
| [`/api/subscriptions`](#apisubscriptions) | 7 |
| [`/api/admin/support`](#apiadminsupport) | 7 |
| [`/api/user`](#apiuser) | 7 |
| [`/api/account`](#apiaccount) | 6 |
| [`/api/admin/moderation`](#apiadminmoderation) | 6 |
| [`/api/admin/disputes`](#apiadmindisputes) | 6 |
| [`/api/drafts`](#apidrafts) | 6 |
| [`/api/oauth`](#apioauth) | 6 |
| [`/music`](#music) | 6 |
| [`/api/super-admin/users`](#apisuperadminusers) | 6 |
| [`/api/admin/account`](#apiadminaccount) | 5 |
| [`/api/admin/event-pricing`](#apiadmineventpricing) | 5 |
| [`/api/super-admin/gift-codes`](#apisuperadmingiftcodes) | 5 |
| [`/api/payments`](#apipayments) | 5 |
| [`/api/super-admin/photographers`](#apisuperadminphotographers) | 5 |
| [`/api/admin/ai`](#apiadminai) | 5 |
| [`/api/event-categories`](#apieventcategories) | 5 |
| [`/api/admin/event-invitations`](#apiadmineventinvitations) | 5 |
| [`/api/og`](#apiog) | 5 |
| [`/api/super-admin/design-pricing`](#apisuperadmindesignpricing) | 5 |
| [`/api/admin/mfa`](#apiadminmfa) | 4 |
| [`/api/super-admin/founding`](#apisuperadminfounding) | 4 |
| [`/api/admin/map`](#apiadminmap) | 4 |
| [`/api/super-admin/credit-packs`](#apisuperadmincreditpacks) | 4 |
| [`/api/admin/photographer`](#apiadminphotographer) | 4 |
| [`/api/super-admin/discount-codes`](#apisuperadmindiscountcodes) | 4 |
| [`/api/admin/templates`](#apiadmintemplates) | 4 |
| [`/api/themes`](#apithemes) | 4 |
| [`/api/super-admin/credit-packages`](#apisuperadmincreditpackages) | 4 |
| [`/api/support`](#apisupport) | 4 |
| [`/api/admin/rbac`](#apiadminrbac) | 3 |
| [`/api/event-requests`](#apieventrequests) | 3 |
| [`/api/admin/feature-flags`](#apiadminfeatureflags) | 3 |
| [`/api/admin/feature-wishes`](#apiadminfeaturewishes) | 3 |
| [`/api/admin/food-donation`](#apiadminfooddonation) | 3 |
| [`/api/admin/photo-requests`](#apiadminphotorequests) | 3 |
| [`/api/admin/credits`](#apiadmincredits) | 3 |
| [`/api/monetization`](#apimonetization) | 3 |
| [`/api/super-admin/referrals`](#apisuperadminreferrals) | 3 |
| [`/api/admin/vendor-categories`](#apiadminvendorcategories) | 3 |
| [`/api/admin/vendors`](#apiadminvendors) | 3 |
| [`/api/push`](#apipush) | 3 |
| [`/api/admin/whatsapp`](#apiadminwhatsapp) | 3 |
| [`/api/super-admin/theme-bundle-pricing`](#apisuperadminthemebundlepricing) | 3 |
| [`/api/pricing`](#apipricing) | 3 |
| [`/api/super-admin/admins`](#apisuperadminadmins) | 3 |
| [`/api/admin/media`](#apiadminmedia) | 3 |
| [`/api/admin/greetings`](#apiadmingreetings) | 3 |
| [`/api/config`](#apiconfig) | 3 |
| [`/api/analytics`](#apianalytics) | 3 |
| [`/api/photographers`](#apiphotographers) | 3 |
| [`/api/templates`](#apitemplates) | 3 |
| [`/api/admin/build-queue`](#apiadminbuildqueue) | 3 |
| [`/api/super-admin/theme-packages`](#apisuperadminthemepackages) | 3 |
| [`/api/admin/notifications`](#apiadminnotifications) | 2 |
| [`/api/admin/delivery`](#apiadmindelivery) | 2 |
| [`/api/admin/event-requests`](#apiadmineventrequests) | 2 |
| [`/api/admin/face-ops`](#apiadminfaceops) | 2 |
| [`/api/feature-wishes`](#apifeaturewishes) | 2 |
| [`/api/live-upload`](#apiliveupload) | 2 |
| [`/uploads`](#uploads) | 2 |
| [`/api/uploads`](#apiuploads) | 2 |
| [`/api/marketplace`](#apimarketplace) | 2 |
| [`/api/admin/monetization`](#apiadminmonetization) | 2 |
| [`/api/admin/photographer-reviews`](#apiadminphotographerreviews) | 2 |
| [`/api/admin/analytics`](#apiadminanalytics) | 2 |
| [`/api/admin/workspaces`](#apiadminworkspaces) | 2 |
| [`/api/admin/talent`](#apiadmintalent) | 2 |
| [`/api/admin/currency`](#apiadmincurrency) | 2 |
| [`/api/admin/storage`](#apiadminstorage) | 2 |
| [`/api/admin/marketplace`](#apiadminmarketplace) | 2 |
| [`/api/admin/campaigns`](#apiadmincampaigns) | 2 |
| [`/api/admin/portfolio-build-requests`](#apiadminportfoliobuildrequests) | 2 |
| [`/api/admin/live-gallery`](#apiadminlivegallery) | 2 |
| [`/api/super-admin/event-categories`](#apisuperadmineventcategories) | 2 |
| [`/api/rsvp`](#apirsvp) | 2 |
| [`/api/designs`](#apidesigns) | 2 |
| [`/api/lords`](#apilords) | 2 |
| [`/api/captcha`](#apicaptcha) | 2 |
| [`/api/admin/expiry-tiers`](#apiadminexpirytiers) | 2 |
| [`/api/admin/user-addons`](#apiadminuseraddons) | 2 |
| [`/api/super-admin/gallery-uploads`](#apisuperadmingalleryuploads) | 2 |
| [`/api/admin/store-packages`](#apiadminstorepackages) | 2 |
| [`/api/admin/subscription-plans`](#apiadminsubscriptionplans) | 2 |
| [`/api/admin/billing-cycles`](#apiadminbillingcycles) | 2 |
| [`/api/super-admin/feature-pricing`](#apisuperadminfeaturepricing) | 2 |
| [`/api/super-admin/invitations`](#apisuperadmininvitations) | 2 |
| [`/api/admin/investigation`](#apiadmininvestigation) | 2 |
| [`/api/admin/white-label`](#apiadminwhitelabel) | 2 |
| [`/api/admin/tags`](#apiadmintags) | 1 |
| [`/api/admin/impersonate`](#apiadminimpersonate) | 1 |
| [`/api/admin/bi`](#apiadminbi) | 1 |
| [`/api/webhooks`](#apiwebhooks) | 1 |
| [`/api/event-meta`](#apieventmeta) | 1 |
| [`/api/feature-flags`](#apifeatureflags) | 1 |
| [`/api/fulfillment`](#apifulfillment) | 1 |
| [`/api/admin/gallery`](#apiadmingallery) | 1 |
| [`/api/gifts`](#apigifts) | 1 |
| [`/invite`](#invite) | 1 |
| [`/api/invoices`](#apiinvoices) | 1 |
| [`/api/ws`](#apiws) | 1 |
| [`/api/admin/credit-packs`](#apiadmincreditpacks) | 1 |
| [`/api/super-admin/credit-purchases`](#apisuperadmincreditpurchases) | 1 |
| [`/api/track`](#apitrack) | 1 |
| [`/api/admin/bookings`](#apiadminbookings) | 1 |
| [`/api/admin/industry-analytics`](#apiadminindustryanalytics) | 1 |
| [`/api/admin/vendor-reviews`](#apiadminvendorreviews) | 1 |
| [`/api/currency`](#apicurrency) | 1 |
| [`/api/admin/push`](#apiadminpush) | 1 |
| [`/api/admin/brands`](#apiadminbrands) | 1 |
| [`/api/plan-purchase-details`](#apiplanpurchasedetails) | 1 |
| [`/api/admin/plan-purchase-details`](#apiadminplanpurchasedetails) | 1 |
| [`/api/live-gallery`](#apilivegallery) | 1 |
| [`/api/campaigns`](#apicampaigns) | 1 |
| [`/api/admin/profitability`](#apiadminprofitability) | 1 |
| [`/api/admin/providers`](#apiadminproviders) | 1 |
| [`/api/admin/qr-analytics`](#apiadminqranalytics) | 1 |
| [`/api/health`](#apihealth) | 1 |
| [`/api/admin/logout`](#apiadminlogout) | 1 |
| [`/api/super-admin/profiles`](#apisuperadminprofiles) | 1 |
| [`/api/admin/audit-logs`](#apiadminauditlogs) | 1 |
| [`/api/admin/upload-image`](#apiadminuploadimage) | 1 |
| [`/api/admin/upload-video`](#apiadminuploadvideo) | 1 |
| [`/api/save-the-date`](#apisavethedate) | 1 |
| [`/api/admin/song-requests`](#apiadminsongrequests) | 1 |
| [`/api/admin/wishes`](#apiadminwishes) | 1 |
| [`/api/translate`](#apitranslate) | 1 |
| [`/api/admin/generate-event-description`](#apiadmingenerateeventdescription) | 1 |
| [`/api/rsvp-suggestions`](#apirsvpsuggestions) | 1 |
| [`/api/admin/guest-insights`](#apiadminguestinsights) | 1 |
| [`/api/languages`](#apilanguages) | 1 |
| [`/api/robots.txt`](#apirobots.txt) | 1 |
| [`/api/csp-report`](#apicspreport) | 1 |
| [`/api/photographer`](#apiphotographer) | 1 |
| [`/api/sitemap.xml`](#apisitemap.xml) | 1 |
| [`/api/event`](#apievent) | 1 |
| [`/api/check-captcha-required`](#apicheckcaptcharequired) | 1 |
| [`/api/plans`](#apiplans) | 1 |
| [`/api/referrals`](#apireferrals) | 1 |
| [`/api/admin/referrals`](#apiadminreferrals) | 1 |
| [`/api/admin/creators`](#apiadmincreators) | 1 |
| [`/api/features`](#apifeatures) | 1 |
| [`/api/ai`](#apiai) | 1 |
| [`/api/generate-love-story`](#apigeneratelovestory) | 1 |
| [`/api/generate-event-description`](#apigenerateeventdescription) | 1 |
| [`/api/storage-pool`](#apistoragepool) | 1 |
| [`/api/media`](#apimedia) | 1 |
| [`/api/admin/store-addons`](#apiadminstoreaddons) | 1 |
| [`/api/admin/store-alacarte`](#apiadminstorealacarte) | 1 |
| [`/api/admin/store-features`](#apiadminstorefeatures) | 1 |
| [`/api/admin/store-languages`](#apiadminstorelanguages) | 1 |
| [`/api/subscription-center`](#apisubscriptioncenter) | 1 |
| [`/api/admin/system`](#apiadminsystem) | 1 |

---

## Routes


### <a id="apipixora"></a>`/api/pixora` — 182 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/pixora/analytics` | `require_super_admin` | `pixora_service.py` |
| POST | `/api/pixora/applications/{application_id}/decision` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/applications/{application_id}/deliverables` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/awards` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/awards/nominate` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/benefits` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/bookings/mine` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/bookings/{booking_id}/history` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/bookings/{booking_id}/status` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/brands` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/brands` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/brands/me` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/budget` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/budget/items` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/budget/items/{item_id}` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/budget/items/{item_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/business-assistant` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/business-assistant/generate` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/business/quote` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/campaigns` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/campaigns` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/campaigns/mine` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/campaigns/{campaign_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/campaigns/{campaign_id}/applications` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/campaigns/{campaign_id}/apply` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/campaigns/{campaign_id}/close` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/campaigns/{campaign_id}/deliverables` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/campaigns/{campaign_id}/payments` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/campaigns/{campaign_id}/report` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/capabilities` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/career` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/career/generate` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/certifications` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/challenges` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/challenges/submit` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/chapters` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/chapters/{chapter}/join` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/checkin` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/collections` | — | `pixora_service.py` |
| POST | `/api/pixora/collections` | — | `pixora_service.py` |
| DELETE | `/api/pixora/collections/{collection_id}` | — | `pixora_service.py` |
| DELETE | `/api/pixora/comments/{comment_id}` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/comments/{comment_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/connections` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/connections/request` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/connections/{cid}/respond` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/content-analytics` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/creators/featured` | — | `pixora_service.py` |
| GET | `/api/pixora/creators/suggested` | — | `pixora_service.py` |
| GET | `/api/pixora/crm/clients` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/crm/clients` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/crm/clients/{client_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/crm/clients/{client_id}` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/crm/clients/{client_id}` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/crm/clients/{client_id}/timeline` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/crm/followups` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/crm/meta` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/crm/timeline/{event_id}` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/deliverables/{deliverable_id}/review` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/discover` | — | `pixora_service.py` |
| POST | `/api/pixora/dm/send` | `get_current_admin` | `pixora_dm.py` |
| GET | `/api/pixora/dm/threads` | `get_current_admin` | `pixora_dm.py` |
| GET | `/api/pixora/dm/threads/{thread_id}` | `get_current_admin` | `pixora_dm.py` |
| POST | `/api/pixora/dm/threads/{thread_id}/read` | `get_current_admin` | `pixora_dm.py` |
| GET | `/api/pixora/dm/unread` | `get_current_admin` | `pixora_dm.py` |
| DELETE | `/api/pixora/documents/{doc_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/events` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/events` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/events/{event_id}/rsvp` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/feed` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/finance` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/finance` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/finance/{entry_id}` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/follow/{studio_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/following` | — | `pixora_service.py` |
| GET | `/api/pixora/gigs` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/gigs` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/gigs/{gig_id}` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/gigs/{gig_id}` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/gigs/{gig_id}/apply` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/guests/{guest_id}` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/guests/{guest_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/highlights` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/highlights` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/highlights/{highlight_id}` | `require_admin` | `pixora_service.py` |
| PATCH | `/api/pixora/highlights/{highlight_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/insights` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/leaderboard` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/learn` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/learn/{content_id}/complete` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/marketplace` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/marketplace` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/marketplace/creator/{studio_id}` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/pixora/marketplace/purchases` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/marketplace/{listing_id}/buy` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/marketplace/{listing_id}/review` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/marketplace/{listing_id}/reviews` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/me` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/media/upload` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/mentors` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/mentors` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/mentors/request` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/milestones/{milestone_id}` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/milestones/{milestone_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/network` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/notifications` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/notifications/read` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/notifications/unread-count` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/packages` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/packages` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/packages/{package_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/portfolio-review` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/portfolio-review/generate` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/post-meta` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/posts` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/posts/{post_id}` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/posts/{post_id}` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/posts/{post_id}/comment` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/posts/{post_id}/comments` | — | `pixora_service.py` |
| POST | `/api/pixora/posts/{post_id}/critique` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/posts/{post_id}/critiques` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/posts/{post_id}/like` | — | `pixora_service.py` |
| POST | `/api/pixora/posts/{post_id}/save` | — | `pixora_service.py` |
| POST | `/api/pixora/posts/{post_id}/share` | — | `pixora_service.py` |
| POST | `/api/pixora/posts/{post_id}/view` | — | `pixora_service.py` |
| GET | `/api/pixora/pricing-intelligence` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/reels` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/reels` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/reels/{reel_id}` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/report` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/revenue` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/saved` | — | `pixora_service.py` |
| GET | `/api/pixora/score-history` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/search` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/settings` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/settings` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/storage` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/stories` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/stories` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/stories/{story_id}` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/submissions/{sub_id}` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/submissions/{sub_id}/vote` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/talent` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/talent` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/talent/me` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/tasks/{task_id}` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/tasks/{task_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/team` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/team` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/team/{member_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/testimonial-videos` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/testimonial-videos` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/trending` | — | `pixora_service.py` |
| POST | `/api/pixora/vendor` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/vendor-categories` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/vendor-reviews/{review_id}/respond` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/pixora/vendor/me` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/vendors` | — | `pixora_service.py` |
| GET | `/api/pixora/vendors/{vendor_id}` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/vendors/{vendor_id}/reviews` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/verification/apply` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/verification/me` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/verification/status/{studio_id}` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/pixora/wedding-bi` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/pixora/workspaces` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/workspaces` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/workspaces/{workspace_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/workspaces/{workspace_id}` | `require_admin` | `pixora_service.py` |
| PUT | `/api/pixora/workspaces/{workspace_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/workspaces/{workspace_id}/activity` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/workspaces/{workspace_id}/analytics` | `require_super_admin` | `pixora_service.py` |
| POST | `/api/pixora/workspaces/{workspace_id}/bookings` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/workspaces/{workspace_id}/comment` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/workspaces/{workspace_id}/documents` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/workspaces/{workspace_id}/documents` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/workspaces/{workspace_id}/guests` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/workspaces/{workspace_id}/guests` | `require_admin` | `pixora_service.py` |
| GET | `/api/pixora/workspaces/{workspace_id}/milestones` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/workspaces/{workspace_id}/milestones` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/workspaces/{workspace_id}/tasks` | `require_admin` | `pixora_service.py` |
| POST | `/api/pixora/workspaces/{workspace_id}/team` | `require_admin` | `pixora_service.py` |
| DELETE | `/api/pixora/workspaces/{workspace_id}/team/{member_id}` | `require_admin` | `pixora_service.py` |

### <a id="apiadminprofiles"></a>`/api/admin/profiles` — 107 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/profiles` | `require_admin` | `server.py` |
| POST | `/api/admin/profiles` | `require_admin` | `server.py` |
| POST | `/api/admin/profiles/bulk-action` | `require_admin` | `admin_dashboard_v2.py` |
| GET | `/api/admin/profiles/export.csv` | `require_admin` | `admin_dashboard_v2.py` |
| POST | `/api/admin/profiles/from-template/{template_id}` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/paginated` | `require_admin` | `admin_dashboard_v2.py` |
| GET | `/api/admin/profiles/trash` | `require_admin` | `admin_dashboard_v2.py` |
| DELETE | `/api/admin/profiles/{profile_id}` | `require_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}` | `require_admin` | `server.py` |
| PUT | `/api/admin/profiles/{profile_id}` | `require_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/album-media` | `require_admin` | `server.py` |
| DELETE | `/api/admin/profiles/{profile_id}/album-media/{media_id}` | `require_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/analytics` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/analytics/ai-insights` | `require_admin` | `analytics_extras.py` |
| GET | `/api/admin/profiles/{profile_id}/analytics/funnel` | `require_admin` | `analytics_extras.py` |
| GET | `/api/admin/profiles/{profile_id}/analytics/geography` | `require_admin` | `analytics_extras.py` |
| GET | `/api/admin/profiles/{profile_id}/analytics/heatmap` | `require_admin` | `analytics_extras.py` |
| GET | `/api/admin/profiles/{profile_id}/analytics/summary` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/analytics/v2` | `require_admin` | `premium_features.py` |
| GET | `/api/admin/profiles/{profile_id}/audit-logs` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/budget` | `get_current_admin` | `client_budget.py` |
| PUT | `/api/admin/profiles/{profile_id}/budget` | `get_current_admin` | `client_budget.py` |
| POST | `/api/admin/profiles/{profile_id}/budget/payments` | `get_current_admin` | `client_budget.py` |
| DELETE | `/api/admin/profiles/{profile_id}/budget/payments/{payment_id}` | `get_current_admin` | `client_budget.py` |
| GET | `/api/admin/profiles/{profile_id}/check-ins` | `get_current_admin` | `server.py` |
| DELETE | `/api/admin/profiles/{profile_id}/client-access` | `get_current_admin` | `photographer_clients.py` |
| GET | `/api/admin/profiles/{profile_id}/client-access` | `get_current_admin` | `photographer_clients.py` |
| PATCH | `/api/admin/profiles/{profile_id}/client-access` | `get_current_admin` | `photographer_clients.py` |
| POST | `/api/admin/profiles/{profile_id}/client-access` | `get_current_admin` | `photographer_clients.py` |
| POST | `/api/admin/profiles/{profile_id}/client-access/regenerate` | `get_current_admin` | `photographer_clients.py` |
| POST | `/api/admin/profiles/{profile_id}/digital-shagun` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/profiles/{profile_id}/disable` | `require_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/download-pdf` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/duplicate` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/profiles/{profile_id}/enable` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/event-invitations` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/event-invitations` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/events` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/events` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/profiles/{profile_id}/events/{event_id}/venue` | `get_current_admin` | `map_features.py` |
| PUT | `/api/admin/profiles/{profile_id}/expire` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/gallery/bulk-upload` | `get_current_admin` | `gallery_features.py` |
| GET | `/api/admin/profiles/{profile_id}/gallery/credentials` | `get_current_admin` | `gallery_features.py` |
| GET | `/api/admin/profiles/{profile_id}/gallery/download-all` | `get_current_admin` | `gallery_features.py` |
| POST | `/api/admin/profiles/{profile_id}/gallery/enable` | `get_current_admin` | `gallery_features.py` |
| GET | `/api/admin/profiles/{profile_id}/gallery/photos` | `get_current_admin` | `gallery_features.py` |
| DELETE | `/api/admin/profiles/{profile_id}/gallery/photos/{photo_id}` | `get_current_admin` | `gallery_features.py` |
| GET | `/api/admin/profiles/{profile_id}/gallery/privacy` | `get_current_admin` | `gallery_privacy.py` |
| PUT | `/api/admin/profiles/{profile_id}/gallery/privacy` | `get_current_admin` | `gallery_privacy.py` |
| GET | `/api/admin/profiles/{profile_id}/gallery/privacy/analytics` | `get_current_admin` | `gallery_privacy.py` |
| POST | `/api/admin/profiles/{profile_id}/gallery/privacy/logout-all` | `get_current_admin` | `gallery_privacy.py` |
| POST | `/api/admin/profiles/{profile_id}/gallery/privacy/reset-code` | `get_current_admin` | `gallery_privacy.py` |
| POST | `/api/admin/profiles/{profile_id}/gallery/regenerate-token` | `get_current_admin` | `gallery_features.py` |
| GET | `/api/admin/profiles/{profile_id}/gallery/stats` | `get_current_admin` | `gallery_features.py` |
| PATCH | `/api/admin/profiles/{profile_id}/gallery/upload-methods` | `get_current_admin` | `gallery_features.py` |
| GET | `/api/admin/profiles/{profile_id}/gifts` | `get_current_admin` | `gift_registry.py` |
| PUT | `/api/admin/profiles/{profile_id}/gifts` | `get_current_admin` | `gift_registry.py` |
| GET | `/api/admin/profiles/{profile_id}/greetings` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/live-gallery` | `require_admin` | `premium_features.py` |
| GET | `/api/admin/profiles/{profile_id}/live-gallery/photos` | `require_admin` | `live_gallery_features.py` |
| GET | `/api/admin/profiles/{profile_id}/live-gallery/settings` | `require_admin` | `premium_features.py` |
| PUT | `/api/admin/profiles/{profile_id}/live-gallery/settings` | `require_admin` | `premium_features.py` |
| POST | `/api/admin/profiles/{profile_id}/live-gallery/upload` | `require_admin` | `live_gallery_features.py` |
| POST | `/api/admin/profiles/{profile_id}/live-gallery/uploader-token` | `require_admin` | `premium_features.py` |
| POST | `/api/admin/profiles/{profile_id}/live-gallery/uploader-token/revoke` | `require_admin` | `premium_features.py` |
| DELETE | `/api/admin/profiles/{profile_id}/live-gallery/{photo_id}` | `require_admin` | `live_gallery_features.py` |
| PUT | `/api/admin/profiles/{profile_id}/main-venue` | `get_current_admin` | `map_features.py` |
| GET | `/api/admin/profiles/{profile_id}/media` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/media` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/plan` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/plan` | `get_current_admin` | `server.py` |
| DELETE | `/api/admin/profiles/{profile_id}/purge` | `require_admin` | `admin_dashboard_v2.py` |
| PATCH | `/api/admin/profiles/{profile_id}/quick` | `require_admin` | `admin_dashboard_v2.py` |
| GET | `/api/admin/profiles/{profile_id}/quick-stats` | `require_admin` | `admin_dashboard_v2.py` |
| POST | `/api/admin/profiles/{profile_id}/reactivate/checkout` | `require_admin` | `link_reactivation.py` |
| GET | `/api/admin/profiles/{profile_id}/reactivate/quote` | `require_admin` | `link_reactivation.py` |
| POST | `/api/admin/profiles/{profile_id}/reactivate/verify` | `require_admin` | `link_reactivation.py` |
| POST | `/api/admin/profiles/{profile_id}/regenerate-all-qrs` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/reorder-media` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/restore` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/restore-trash` | `require_admin` | `admin_dashboard_v2.py` |
| GET | `/api/admin/profiles/{profile_id}/rsvps` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/rsvps/export` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/rsvps/export-smart` | `require_admin` | `premium_features.py` |
| GET | `/api/admin/profiles/{profile_id}/rsvps/stats` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/save-as-template` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/shagun` | `require_admin` | `premium_features.py` |
| PUT | `/api/admin/profiles/{profile_id}/shagun` | `require_admin` | `premium_features.py` |
| GET | `/api/admin/profiles/{profile_id}/shagun/dashboard` | `require_admin` | `premium_features.py` |
| GET | `/api/admin/profiles/{profile_id}/song-requests` | `get_current_admin` | `server.py` |
| PATCH | `/api/admin/profiles/{profile_id}/tags` | `require_admin` | `admin_dashboard_v2.py` |
| GET | `/api/admin/profiles/{profile_id}/thank-you` | `require_admin` | `server.py` |
| PUT | `/api/admin/profiles/{profile_id}/thank-you` | `require_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/translate` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/translations` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/profiles/{profile_id}/unexpire` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/upload-album-media` | `require_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/upload-photo` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/versions` | `get_current_admin` | `server.py` |
| POST | `/api/admin/profiles/{profile_id}/versions` | `get_current_admin` | `server.py` |
| GET | `/api/admin/profiles/{profile_id}/whatsapp/logs` | `require_admin` | `premium_features.py` |
| GET | `/api/admin/profiles/{profile_id}/wishes` | `require_admin` | `wishes_features.py` |
| POST | `/api/admin/profiles/{profile_id}/wishes/bulk-approve` | `require_admin` | `wishes_features.py` |
| DELETE | `/api/admin/profiles/{profile_id}/wishes/{wish_id}` | `require_admin` | `wishes_features.py` |
| POST | `/api/admin/profiles/{profile_id}/wishes/{wish_id}/approve` | `require_admin` | `wishes_features.py` |
| POST | `/api/admin/profiles/{profile_id}/wishes/{wish_id}/feature` | `require_admin` | `wishes_features.py` |
| POST | `/api/admin/profiles/{profile_id}/wishes/{wish_id}/reject` | `require_admin` | `wishes_features.py` |

### <a id="apievents"></a>`/api/events` — 60 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/events` | `get_current_buyer` | `event_lifecycle_service.py` |
| POST | `/api/events` | `get_current_buyer` | `event_lifecycle_service.py` |
| GET | `/api/events/design-offer/{event_type}/{template_id}` | `require_super_admin` | `event_pricing.py` |
| POST | `/api/events/invitations/{member_id}/accept` | `get_current_buyer` | `event_members_service.py` |
| POST | `/api/events/invitations/{member_id}/reject` | `get_current_buyer` | `event_members_service.py` |
| GET | `/api/events/plans/{event_type}` | `get_current_buyer` | `event_purchase_service.py` |
| POST | `/api/events/pricing/quote` | `require_super_admin` | `event_pricing.py` |
| GET | `/api/events/pricing/{event_type}` | `require_super_admin` | `event_pricing.py` |
| POST | `/api/events/purchase` | `get_current_buyer` | `event_purchase_service.py` |
| POST | `/api/events/purchase/verify` | `get_current_buyer` | `event_purchase_service.py` |
| POST | `/api/events/purchase/webhook` | — | `event_purchase_service.py` |
| GET | `/api/events/registry` | — | `event_lifecycle_service.py` |
| GET | `/api/events/registry/{event_type}` | `get_current_buyer` | `event_lifecycle_service.py` |
| GET | `/api/events/starter-content/{event_type}` | — | `event_starter_content.py` |
| GET | `/api/events/templates/{event_type}` | `get_current_buyer` | `event_lifecycle_service.py` |
| DELETE | `/api/events/{event_id}` | `get_current_buyer` | `event_lifecycle_service.py` |
| GET | `/api/events/{event_id}` | `get_current_buyer` | `event_lifecycle_service.py` |
| POST | `/api/events/{event_id}/archive` | `get_current_buyer` | `event_lifecycle_service.py` |
| PATCH | `/api/events/{event_id}/autosave` | `get_current_buyer` | `event_lifecycle_service.py` |
| GET | `/api/events/{event_id}/days/{festival_day}/photo-status` | `get_current_buyer` | `event_media_service.py` |
| GET | `/api/events/{event_id}/finance/budget` | `get_current_buyer` | `event_finance_service.py` |
| PUT | `/api/events/{event_id}/finance/budget` | `get_current_buyer` | `event_finance_service.py` |
| GET | `/api/events/{event_id}/finance/config` | `get_current_buyer` | `event_finance_service.py` |
| GET | `/api/events/{event_id}/finance/dashboard` | `get_current_buyer` | `event_finance_service.py` |
| GET | `/api/events/{event_id}/finance/donations/{donation_id}/receipt` | `get_current_buyer` | `event_finance_service.py` |
| POST | `/api/events/{event_id}/finance/donations/{donation_id}/verify` | `get_current_buyer` | `event_finance_service.py` |
| POST | `/api/events/{event_id}/finance/expenses/{expense_id}/transition` | `get_current_buyer` | `event_finance_service.py` |
| GET | `/api/events/{event_id}/finance/report/{kind}` | `get_current_buyer` | `event_finance_service.py` |
| GET | `/api/events/{event_id}/gallery-usage` | `get_current_buyer` | `event_media_service.py` |
| POST | `/api/events/{event_id}/gallery/upload` | `get_current_buyer` | `event_media_service.py` |
| DELETE | `/api/events/{event_id}/gallery/{media_id}` | `get_current_buyer` | `event_media_service.py` |
| GET | `/api/events/{event_id}/members` | `get_current_buyer` | `event_members_service.py` |
| POST | `/api/events/{event_id}/members` | `get_current_buyer` | `event_members_service.py` |
| DELETE | `/api/events/{event_id}/members/{member_id}` | `get_current_buyer` | `event_members_service.py` |
| PATCH | `/api/events/{event_id}/members/{member_id}` | `get_current_buyer` | `event_members_service.py` |
| GET | `/api/events/{event_id}/money-members` | `get_current_buyer` | `event_money_service.py` |
| POST | `/api/events/{event_id}/money-members` | `get_current_buyer` | `event_money_service.py` |
| DELETE | `/api/events/{event_id}/money-members/{member_id}` | `get_current_buyer` | `event_money_service.py` |
| GET | `/api/events/{event_id}/money-report.csv` | `get_current_buyer` | `event_money_service.py` |
| GET | `/api/events/{event_id}/notifications` | `get_current_buyer` | `event_notifications_service.py` |
| POST | `/api/events/{event_id}/notifications` | `get_current_buyer` | `event_notifications_service.py` |
| GET | `/api/events/{event_id}/notifications/channels` | `get_current_buyer` | `event_notifications_service.py` |
| POST | `/api/events/{event_id}/publish` | `get_current_buyer` | `event_lifecycle_service.py` |
| GET | `/api/events/{event_id}/qr-code` | — | `server.py` |
| GET | `/api/events/{event_id}/reactions` | — | `server.py` |
| POST | `/api/events/{event_id}/reactions` | — | `server.py` |
| POST | `/api/events/{event_id}/restore` | `get_current_buyer` | `event_lifecycle_service.py` |
| GET | `/api/events/{event_id}/share-metadata` | — | `server.py` |
| POST | `/api/events/{event_id}/transfer-ownership` | `get_current_buyer` | `event_members_service.py` |
| POST | `/api/events/{event_id}/translate` | `get_current_buyer` | `event_translation_service.py` |
| GET | `/api/events/{event_id}/translations` | `get_current_buyer` | `event_translation_service.py` |
| POST | `/api/events/{event_id}/validate` | `get_current_buyer` | `event_lifecycle_service.py` |
| POST | `/api/events/{event_id}/wishes` | — | `server.py` |
| GET | `/api/events/{event_id}/{collection}` | `get_current_buyer` | `event_children_service.py` |
| POST | `/api/events/{event_id}/{collection}` | `get_current_buyer` | `event_children_service.py` |
| POST | `/api/events/{event_id}/{collection}/reorder` | `get_current_buyer` | `event_children_service.py` |
| DELETE | `/api/events/{event_id}/{collection}/{child_id}` | `get_current_buyer` | `event_children_service.py` |
| GET | `/api/events/{event_id}/{collection}/{child_id}` | `get_current_buyer` | `event_children_service.py` |
| PATCH | `/api/events/{event_id}/{collection}/{child_id}` | `get_current_buyer` | `event_children_service.py` |
| POST | `/api/events/{event_id}/{collection}/{child_id}/{action}` | `get_current_buyer` | `event_children_service.py` |

### <a id="apipublic"></a>`/api/public` — 59 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/public/addons` | `get_current_public_user` | `user_features.py` |
| POST | `/api/public/cookie-consent` | — | `consent_routes.py` |
| GET | `/api/public/credit-packs` | — | `monetization_features.py` |
| GET | `/api/public/design-pricing` | — | `user_features.py` |
| POST | `/api/public/discount/validate` | — | `pricing_features.py` |
| GET | `/api/public/discovery/{city_seg}/{service_seg}` | — | `photographer_directory.py` |
| GET | `/api/public/discovery/{segment}` | — | `photographer_directory.py` |
| POST | `/api/public/events/donate/verify` | — | `event_finance_service.py` |
| GET | `/api/public/events/{slug}` | — | `event_lifecycle_service.py` |
| GET | `/api/public/events/{slug}/blessings` | `get_current_buyer` | `event_money_service.py` |
| POST | `/api/public/events/{slug}/blessings` | `get_current_buyer` | `event_money_service.py` |
| POST | `/api/public/events/{slug}/donate` | — | `event_finance_service.py` |
| POST | `/api/public/events/{slug}/donate/order` | — | `event_finance_service.py` |
| GET | `/api/public/events/{slug}/leaderboard` | — | `event_money_service.py` |
| POST | `/api/public/events/{slug}/rsvp` | — | `event_lifecycle_service.py` |
| GET | `/api/public/expiry-tiers` | `get_current_public_user` | `user_features.py` |
| GET | `/api/public/food-donation` | `require_super_admin` | `food_features.py` |
| GET | `/api/public/gallery/{slug}/download-zip` | — | `gallery_features.py` |
| POST | `/api/public/gallery/{slug}/face-consent` | — | `face_consent.py` |
| POST | `/api/public/gallery/{slug}/face-search` | — | `gallery_features.py` |
| GET | `/api/public/gallery/{slug}/info` | — | `gallery_features.py` |
| POST | `/api/public/gallery/{slug}/photo-request` | — | `gallery_features.py` |
| GET | `/api/public/gallery/{slug}/photos` | — | `gallery_features.py` |
| GET | `/api/public/gallery/{slug}/photos` | `require_admin` | `live_gallery_features.py` |
| GET | `/api/public/gallery/{slug}/privacy` | — | `gallery_privacy.py` |
| POST | `/api/public/gallery/{slug}/unlock` | — | `gallery_privacy.py` |
| GET | `/api/public/invite/{slug}/wishes` | `require_admin` | `wishes_features.py` |
| GET | `/api/public/p/{username}` | — | `pixora_service.py` |
| GET | `/api/public/photographer-stats` | — | `server.py` |
| GET | `/api/public/photographer/{studio_id}/availability` | — | `calendar_service.py` |
| POST | `/api/public/photographer/{studio_id}/enquiry` | — | `portfolio_leads.py` |
| GET | `/api/public/photographer/{studio_id}/portfolio` | — | `portfolio_service.py` |
| GET | `/api/public/photographer/{studio_id}/works/{work_id}` | — | `portfolio_service.py` |
| GET | `/api/public/photographers` | — | `photographer_directory.py` |
| GET | `/api/public/photographers/{photographer_id}` | — | `photographer_directory.py` |
| POST | `/api/public/photographers/{photographer_id}/reviews` | — | `photographer_directory.py` |
| GET | `/api/public/pixora/feed` | — | `pixora_service.py` |
| GET | `/api/public/pixora/foryou` | — | `pixora_service.py` |
| GET | `/api/public/pixora/hashtag/{tag}` | — | `pixora_service.py` |
| GET | `/api/public/pixora/hashtags/trending` | — | `pixora_service.py` |
| GET | `/api/public/pixora/highlight/{highlight_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/public/pixora/highlights/{studio_id}` | `require_admin` | `pixora_service.py` |
| GET | `/api/public/pixora/nearby` | — | `pixora_service.py` |
| GET | `/api/public/pixora/packages/{studio_id}` | `require_admin` | `pixora_service.py` |
| POST | `/api/public/pixora/reels/feed` | — | `pixora_service.py` |
| POST | `/api/public/pixora/reels/{reel_id}/view` | — | `pixora_service.py` |
| GET | `/api/public/pixora/search` | — | `pixora_service.py` |
| GET | `/api/public/pixora/stories` | — | `pixora_service.py` |
| POST | `/api/public/pixora/stories/{story_id}/vote` | — | `pixora_service.py` |
| GET | `/api/public/pricing/designs` | — | `pricing_public.py` |
| GET | `/api/public/pricing/founding-status` | — | `pricing_public.py` |
| GET | `/api/public/pricing/invitations` | — | `pricing_public.py` |
| GET | `/api/public/pricing/portfolio` | — | `pricing_public.py` |
| GET | `/api/public/pricing/storage` | — | `pricing_public.py` |
| POST | `/api/public/qr-scan/{slug}` | `require_admin` | `qr_analytics.py` |
| GET | `/api/public/referral-code-by-slug/{slug}` | — | `premium_features.py` |
| GET | `/api/public/referral-code/{profile_id}` | — | `server.py` |
| GET | `/api/public/studio/{studio_id}/white-label` | `require_super_admin` | `white_label_service.py` |
| GET | `/api/public/theme-bundle-pricing` | `require_super_admin` | `pricing_features.py` |

### <a id="apiadminpricing"></a>`/api/admin/pricing` — 40 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/pricing/campaigns` | `require_super_admin` | `pricing_hub_service.py` |
| POST | `/api/admin/pricing/campaigns` | `require_super_admin` | `pricing_hub_service.py` |
| DELETE | `/api/admin/pricing/campaigns/{camp_id}` | `require_super_admin` | `pricing_hub_service.py` |
| PUT | `/api/admin/pricing/campaigns/{camp_id}` | `require_super_admin` | `pricing_hub_service.py` |
| POST | `/api/admin/pricing/campaigns/{camp_id}/toggle` | `require_super_admin` | `pricing_hub_service.py` |
| GET | `/api/admin/pricing/categories` | `require_super_admin` | `pricing_hub_service.py` |
| POST | `/api/admin/pricing/categories` | `require_super_admin` | `pricing_hub_service.py` |
| DELETE | `/api/admin/pricing/categories/{cat_id}` | `require_super_admin` | `pricing_hub_service.py` |
| PUT | `/api/admin/pricing/categories/{cat_id}` | `require_super_admin` | `pricing_hub_service.py` |
| GET | `/api/admin/pricing/community` | `require_super_admin` | `pricing_hub_service.py` |
| PUT | `/api/admin/pricing/community` | `require_super_admin` | `pricing_hub_service.py` |
| GET | `/api/admin/pricing/designs` | `require_super_admin` | `enhanced_admin_service.py` |
| GET | `/api/admin/pricing/designs` | `require_super_admin` | `pricing_hub_service.py` |
| POST | `/api/admin/pricing/designs/batch` | `require_super_admin` | `enhanced_admin_service.py` |
| PUT | `/api/admin/pricing/designs/{design_id}` | `require_super_admin` | `pricing_hub_service.py` |
| GET | `/api/admin/pricing/durations` | `require_super_admin` | `enhanced_admin_service.py` |
| POST | `/api/admin/pricing/durations` | `require_super_admin` | `enhanced_admin_service.py` |
| PUT | `/api/admin/pricing/durations/{duration_id}` | `require_super_admin` | `enhanced_admin_service.py` |
| GET | `/api/admin/pricing/feature-packs` | `require_super_admin` | `pricing_hub_service.py` |
| POST | `/api/admin/pricing/feature-packs` | `require_super_admin` | `pricing_hub_service.py` |
| PUT | `/api/admin/pricing/feature-packs/{pack_id}` | `require_super_admin` | `pricing_hub_service.py` |
| GET | `/api/admin/pricing/features` | `require_super_admin` | `enhanced_admin_service.py` |
| POST | `/api/admin/pricing/features` | `require_super_admin` | `enhanced_admin_service.py` |
| PUT | `/api/admin/pricing/features/{feature_id}` | `require_super_admin` | `enhanced_admin_service.py` |
| GET | `/api/admin/pricing/link-durations` | `require_super_admin` | `pricing_hub_service.py` |
| POST | `/api/admin/pricing/link-durations` | `require_super_admin` | `pricing_hub_service.py` |
| DELETE | `/api/admin/pricing/link-durations/{dur_id}` | `require_super_admin` | `pricing_hub_service.py` |
| PUT | `/api/admin/pricing/link-durations/{dur_id}` | `require_super_admin` | `pricing_hub_service.py` |
| GET | `/api/admin/pricing/mixed-theme` | `require_super_admin` | `enhanced_admin_service.py` |
| PUT | `/api/admin/pricing/mixed-theme` | `require_super_admin` | `enhanced_admin_service.py` |
| GET | `/api/admin/pricing/monthly-packs` | `require_super_admin` | `enhanced_admin_service.py` |
| POST | `/api/admin/pricing/monthly-packs` | `require_super_admin` | `enhanced_admin_service.py` |
| DELETE | `/api/admin/pricing/monthly-packs/{pack_id}` | `require_super_admin` | `enhanced_admin_service.py` |
| PUT | `/api/admin/pricing/monthly-packs/{pack_id}` | `require_super_admin` | `enhanced_admin_service.py` |
| GET | `/api/admin/pricing/plans` | `require_super_admin` | `pricing_hub_service.py` |
| PUT | `/api/admin/pricing/plans/{plan_id}` | `require_super_admin` | `pricing_hub_service.py` |
| POST | `/api/admin/pricing/simulate` | `require_super_admin` | `pricing_hub_service.py` |
| GET | `/api/admin/pricing/themes` | `require_super_admin` | `enhanced_admin_service.py` |
| POST | `/api/admin/pricing/themes` | `require_super_admin` | `enhanced_admin_service.py` |
| PUT | `/api/admin/pricing/themes/{theme_id}` | `require_super_admin` | `enhanced_admin_service.py` |

### <a id="apiadminevents"></a>`/api/admin/events` — 37 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/events` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/admin/events/audit-logs` | `require_super_admin` | `event_admin_service.py` |
| GET | `/api/admin/events/config/categories` | `require_super_admin` | `event_admin_service.py` |
| GET | `/api/admin/events/config/flags` | `require_super_admin` | `event_admin_service.py` |
| PUT | `/api/admin/events/config/flags/{key}` | `require_super_admin` | `event_admin_service.py` |
| GET | `/api/admin/events/dashboard` | `require_super_admin` | `event_admin_service.py` |
| GET | `/api/admin/events/search` | `require_super_admin` | `event_admin_service.py` |
| DELETE | `/api/admin/events/{event_id}` | `require_super_admin` | `event_admin_service.py` |
| DELETE | `/api/admin/events/{event_id}` | `require_super_admin` | `pixora_service.py` |
| DELETE | `/api/admin/events/{event_id}` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/events/{event_id}` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/events/{event_id}/background` | `get_current_admin` | `server.py` |
| POST | `/api/admin/events/{event_id}/clone` | `require_super_admin` | `event_admin_service.py` |
| GET | `/api/admin/events/{event_id}/default-design` | `get_current_admin` | `server.py` |
| GET | `/api/admin/events/{event_id}/default-lord` | `get_current_admin` | `server.py` |
| PATCH | `/api/admin/events/{event_id}/engagement-settings` | `get_current_admin` | `server.py` |
| DELETE | `/api/admin/events/{event_id}/gallery-images/{image_id}` | `get_current_admin` | `server.py` |
| PATCH | `/api/admin/events/{event_id}/gallery-toggle` | `get_current_admin` | `server.py` |
| DELETE | `/api/admin/events/{event_id}/hero-video` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/events/{event_id}/lord-settings` | `get_current_admin` | `server.py` |
| DELETE | `/api/admin/events/{event_id}/message-video` | `get_current_admin` | `server.py` |
| POST | `/api/admin/events/{event_id}/moderate` | `require_super_admin` | `event_admin_service.py` |
| DELETE | `/api/admin/events/{event_id}/music` | `get_current_admin` | `server.py` |
| DELETE | `/api/admin/events/{event_id}/music` | `get_current_admin` | `server.py` |
| PATCH | `/api/admin/events/{event_id}/music-toggle` | `get_current_admin` | `server.py` |
| PATCH | `/api/admin/events/{event_id}/reorder-gallery` | `get_current_admin` | `server.py` |
| POST | `/api/admin/events/{event_id}/restore-deleted` | `require_super_admin` | `event_admin_service.py` |
| PATCH | `/api/admin/events/{event_id}/toggle-hero-video` | `get_current_admin` | `server.py` |
| PATCH | `/api/admin/events/{event_id}/toggle-message-video` | `get_current_admin` | `server.py` |
| PATCH | `/api/admin/events/{event_id}/toggle-music` | `get_current_admin` | `server.py` |
| POST | `/api/admin/events/{event_id}/transfer` | `require_super_admin` | `event_admin_service.py` |
| POST | `/api/admin/events/{event_id}/upload-gallery-images` | `get_current_admin` | `server.py` |
| POST | `/api/admin/events/{event_id}/upload-hero-video` | `get_current_admin` | `server.py` |
| POST | `/api/admin/events/{event_id}/upload-message-video` | `get_current_admin` | `server.py` |
| POST | `/api/admin/events/{event_id}/upload-music` | `get_current_admin` | `server.py` |
| POST | `/api/admin/events/{event_id}/upload-music` | `get_current_admin` | `server.py` |
| GET | `/api/admin/events/{event_id}/wishes` | `get_current_admin` | `server.py` |

### <a id="apiinvite"></a>`/api/invite` — 34 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/invite/{slug}` | — | `server.py` |
| GET | `/api/invite/{slug}` | — | `server.py` |
| GET | `/api/invite/{slug}/blessings` | — | `premium_features.py` |
| GET | `/api/invite/{slug}/calendar` | — | `server.py` |
| GET | `/api/invite/{slug}/calendar` | — | `server.py` |
| POST | `/api/invite/{slug}/check-in` | — | `server.py` |
| GET | `/api/invite/{slug}/eta` | — | `map_features.py` |
| GET | `/api/invite/{slug}/event/{event_slug}` | — | `server.py` |
| GET | `/api/invite/{slug}/full` | — | `server.py` |
| POST | `/api/invite/{slug}/gallery/guest-upload` | — | `live_gallery_features.py` |
| GET | `/api/invite/{slug}/gifts` | — | `gift_registry.py` |
| POST | `/api/invite/{slug}/greetings` | — | `server.py` |
| GET | `/api/invite/{slug}/itinerary` | — | `premium_features.py` |
| GET | `/api/invite/{slug}/live-gallery` | — | `premium_features.py` |
| POST | `/api/invite/{slug}/live-gallery/favorite` | — | `premium_features.py` |
| POST | `/api/invite/{slug}/live-gallery/guest-upload` | — | `premium_features.py` |
| GET | `/api/invite/{slug}/qr` | — | `server.py` |
| GET | `/api/invite/{slug}/room-lookup` | — | `server.py` |
| POST | `/api/invite/{slug}/rsvp-smart` | — | `premium_features.py` |
| GET | `/api/invite/{slug}/rsvp/check` | — | `server.py` |
| GET | `/api/invite/{slug}/shagun` | — | `premium_features.py` |
| POST | `/api/invite/{slug}/shagun/razorpay/order` | — | `premium_features.py` |
| POST | `/api/invite/{slug}/shagun/razorpay/verify` | — | `premium_features.py` |
| POST | `/api/invite/{slug}/shagun/record` | — | `premium_features.py` |
| GET | `/api/invite/{slug}/song-requests` | — | `server.py` |
| POST | `/api/invite/{slug}/song-requests` | — | `server.py` |
| GET | `/api/invite/{slug}/songs` | — | `server.py` |
| POST | `/api/invite/{slug}/track-interaction` | — | `server.py` |
| POST | `/api/invite/{slug}/track-language` | — | `server.py` |
| GET | `/api/invite/{slug}/travel` | — | `premium_features.py` |
| GET | `/api/invite/{slug}/venues` | — | `map_features.py` |
| POST | `/api/invite/{slug}/view` | — | `server.py` |
| POST | `/api/invite/{slug}/wishes` | — | `wishes_features.py` |
| GET | `/api/invite/{slug}/{event_type}` | — | `server.py` |

### <a id="apisuperadminpricing"></a>`/api/super-admin/pricing` — 26 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/pricing/catalog` | `require_super_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/credit-packs` | `require_super_admin` | `super_admin_pricing.py` |
| POST | `/api/super-admin/pricing/credit-packs` | `require_super_admin` | `super_admin_pricing.py` |
| DELETE | `/api/super-admin/pricing/credit-packs/{pack_id}` | `require_super_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/designs` | `require_super_admin` | `super_admin_pricing.py` |
| POST | `/api/super-admin/pricing/designs` | `require_super_admin` | `super_admin_pricing.py` |
| POST | `/api/super-admin/pricing/designs/bulk-theme` | `require_super_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/designs/catalog` | `require_super_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/effective` | — | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/feature-packs` | `require_super_admin` | `super_admin_pricing.py` |
| POST | `/api/super-admin/pricing/feature-packs` | `require_super_admin` | `super_admin_pricing.py` |
| DELETE | `/api/super-admin/pricing/feature-packs/{pack_id}` | `require_super_admin` | `super_admin_pricing.py` |
| PUT | `/api/super-admin/pricing/feature-packs/{pack_id}` | `require_super_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/me/tier` | `get_current_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/me/tier-history` | `get_current_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/options` | `require_super_admin` | `super_admin_pricing.py` |
| POST | `/api/super-admin/pricing/options` | `require_super_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/photographer-tiers` | `require_super_admin` | `super_admin_pricing.py` |
| PUT | `/api/super-admin/pricing/photographer-tiers` | `require_super_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/post-sub` | `require_super_admin` | `super_admin_pricing.py` |
| PUT | `/api/super-admin/pricing/post-sub` | `require_super_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/subscriptions` | `require_super_admin` | `super_admin_pricing.py` |
| POST | `/api/super-admin/pricing/subscriptions` | `require_super_admin` | `super_admin_pricing.py` |
| DELETE | `/api/super-admin/pricing/subscriptions/{plan_id}` | `require_super_admin` | `super_admin_pricing.py` |
| GET | `/api/super-admin/pricing/themes` | `require_super_admin` | `super_admin_pricing.py` |
| POST | `/api/super-admin/pricing/themes` | `require_super_admin` | `super_admin_pricing.py` |

### <a id="apistudio"></a>`/api/studio` — 23 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/studio/contracts` | `get_current_admin` | `client_studio_service.py` |
| POST | `/api/studio/contracts` | `get_current_admin` | `client_studio_service.py` |
| POST | `/api/studio/contracts/{contract_id}/send` | `get_current_admin` | `client_studio_service.py` |
| POST | `/api/studio/contracts/{contract_id}/void` | `get_current_admin` | `client_studio_service.py` |
| GET | `/api/studio/earnings` | `get_current_admin` | `studio_earnings.py` |
| GET | `/api/studio/insights` | `get_current_admin` | `studio_insights.py` |
| GET | `/api/studio/my-weddings` | `require_admin` | `studio_weddings.py` |
| GET | `/api/studio/print-orders` | `get_current_admin` | `client_studio_service.py` |
| POST | `/api/studio/print-orders/{order_id}/status` | `get_current_admin` | `client_studio_service.py` |
| GET | `/api/studio/proofing` | `get_current_admin` | `client_studio_service.py` |
| POST | `/api/studio/proofing` | `get_current_admin` | `client_studio_service.py` |
| GET | `/api/studio/proofing/{gallery_id}/photos` | `get_current_admin` | `client_studio_service.py` |
| POST | `/api/studio/proofing/{gallery_id}/photos` | `get_current_admin` | `client_studio_service.py` |
| GET | `/api/studio/staff` | `get_current_admin` | `studio_staff.py` |
| POST | `/api/studio/staff/accept` | `get_current_admin` | `studio_staff.py` |
| POST | `/api/studio/staff/invite` | `get_current_admin` | `studio_staff.py` |
| GET | `/api/studio/staff/memberships` | `get_current_admin` | `studio_staff.py` |
| POST | `/api/studio/staff/transfer-ownership` | `get_current_admin` | `studio_staff.py` |
| DELETE | `/api/studio/staff/{staff_id}` | `get_current_admin` | `studio_staff.py` |
| PATCH | `/api/studio/staff/{staff_id}` | `get_current_admin` | `studio_staff.py` |
| GET | `/api/studio/wedding/{profile_id}` | `require_admin` | `studio_weddings.py` |
| GET | `/api/studio/white-label` | `require_super_admin` | `white_label_service.py` |
| PUT | `/api/studio/white-label` | `require_super_admin` | `white_label_service.py` |

### <a id="apiportfolio"></a>`/api/portfolio` — 23 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/portfolio/albums` | `require_admin` | `portfolio_service.py` |
| POST | `/api/portfolio/albums` | `require_admin` | `portfolio_service.py` |
| DELETE | `/api/portfolio/albums/{album_id}` | `require_admin` | `portfolio_service.py` |
| GET | `/api/portfolio/build-help` | `require_admin` | `portfolio_service.py` |
| POST | `/api/portfolio/build-help/order` | `require_admin` | `portfolio_service.py` |
| POST | `/api/portfolio/build-help/verify` | `require_admin` | `portfolio_service.py` |
| GET | `/api/portfolio/build-request` | `require_super_admin` | `portfolio_service.py` |
| POST | `/api/portfolio/build-request` | `require_super_admin` | `portfolio_service.py` |
| POST | `/api/portfolio/design` | `require_admin` | `portfolio_service.py` |
| GET | `/api/portfolio/meta` | `require_admin` | `portfolio_service.py` |
| GET | `/api/portfolio/profile` | `require_admin` | `portfolio_service.py` |
| PUT | `/api/portfolio/profile` | `require_admin` | `portfolio_service.py` |
| GET | `/api/portfolio/team` | `require_admin` | `portfolio_service.py` |
| PUT | `/api/portfolio/team` | `require_admin` | `portfolio_service.py` |
| GET | `/api/portfolio/testimonials` | `require_admin` | `portfolio_service.py` |
| POST | `/api/portfolio/testimonials` | `require_admin` | `portfolio_service.py` |
| DELETE | `/api/portfolio/testimonials/{tid}` | `require_admin` | `portfolio_service.py` |
| GET | `/api/portfolio/tier` | `require_admin` | `portfolio_service.py` |
| POST | `/api/portfolio/upload` | `require_admin` | `portfolio_service.py` |
| GET | `/api/portfolio/works` | `require_admin` | `portfolio_service.py` |
| POST | `/api/portfolio/works` | `require_admin` | `portfolio_service.py` |
| DELETE | `/api/portfolio/works/{work_id}` | `require_admin` | `portfolio_service.py` |
| PUT | `/api/portfolio/works/{work_id}` | `require_admin` | `portfolio_service.py` |

### <a id="apisuperadminv2"></a>`/api/super-admin/v2` — 23 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/v2/broadcast` | `require_admin` | `super_admin_v2.py` |
| POST | `/api/super-admin/v2/broadcast` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/broadcast/active` | `require_admin` | `super_admin_v2.py` |
| DELETE | `/api/super-admin/v2/broadcast/{broadcast_id}` | `require_admin` | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/cms/homepage` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/cms/homepage` | — | `super_admin_v2.py` |
| PUT | `/api/super-admin/v2/cms/homepage` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/coupons` | — | `super_admin_v2.py` |
| POST | `/api/super-admin/v2/coupons` | — | `super_admin_v2.py` |
| DELETE | `/api/super-admin/v2/coupons/{coupon_id}` | — | `super_admin_v2.py` |
| PATCH | `/api/super-admin/v2/coupons/{coupon_id}` | — | `super_admin_v2.py` |
| POST | `/api/super-admin/v2/impersonate/{target_admin_id}` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/leaderboard/photographers` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/login-history/{admin_id}` | — | `super_admin_v2.py` |
| POST | `/api/super-admin/v2/refund` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/revenue/summary` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/revenue/timeseries` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/settings` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/settings` | — | `super_admin_v2.py` |
| PUT | `/api/super-admin/v2/settings` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/themes/rollout` | — | `super_admin_v2.py` |
| GET | `/api/super-admin/v2/themes/rollout` | — | `super_admin_v2.py` |
| PUT | `/api/super-admin/v2/themes/rollout` | — | `super_admin_v2.py` |

### <a id="apiusers"></a>`/api/users` — 21 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/users/auth/google/callback` | — | `user_auth.py` |
| GET | `/api/users/auth/google/login` | — | `user_auth.py` |
| GET | `/api/users/credits/ledger` | `get_current_public_user` | `user_features.py` |
| POST | `/api/users/credits/purchase/create-order` | `get_current_public_user` | `user_features.py` |
| POST | `/api/users/credits/purchase/verify` | `get_current_public_user` | `user_features.py` |
| GET | `/api/users/credits/purchases` | `get_current_public_user` | `user_features.py` |
| POST | `/api/users/login` | — | `user_auth.py` |
| POST | `/api/users/logout` | — | `user_auth.py` |
| GET | `/api/users/me` | — | `user_auth.py` |
| GET | `/api/users/profiles` | `get_current_public_user` | `user_features.py` |
| POST | `/api/users/profiles` | `get_current_public_user` | `user_features.py` |
| DELETE | `/api/users/profiles/{profile_id}` | `get_current_public_user` | `user_features.py` |
| GET | `/api/users/profiles/{profile_id}` | `get_current_public_user` | `user_features.py` |
| PATCH | `/api/users/profiles/{profile_id}` | `get_current_public_user` | `user_features.py` |
| POST | `/api/users/profiles/{profile_id}/buy-addon` | `get_current_public_user` | `user_features.py` |
| GET | `/api/users/profiles/{profile_id}/insights` | `get_current_public_user` | `user_features.py` |
| GET | `/api/users/profiles/{profile_id}/live-gallery/photos` | — | `live_gallery_features.py` |
| POST | `/api/users/profiles/{profile_id}/live-gallery/upload` | — | `live_gallery_features.py` |
| DELETE | `/api/users/profiles/{profile_id}/live-gallery/{photo_id}` | — | `live_gallery_features.py` |
| POST | `/api/users/register` | — | `user_auth.py` |
| POST | `/api/users/upload-image` | `get_current_public_user` | `user_features.py` |

### <a id="apisuperadminstorage"></a>`/api/super-admin/storage` — 21 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/storage/accounts` | `require_super_admin` | `storage_pool_service.py` |
| GET | `/api/super-admin/storage/accounts/connect` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/accounts/{account_id}/check` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/accounts/{account_id}/config` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/accounts/{account_id}/disable` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/accounts/{account_id}/enable` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/accounts/{account_id}/make-current` | `require_super_admin` | `storage_pool_service.py` |
| GET | `/api/super-admin/storage/alerts` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/alerts/{alert_id}/ack` | `require_super_admin` | `storage_pool_service.py` |
| GET | `/api/super-admin/storage/by-event` | `require_super_admin` | `storage_pool_service.py` |
| GET | `/api/super-admin/storage/by-photographer` | `require_super_admin` | `storage_pool_service.py` |
| GET | `/api/super-admin/storage/dashboard` | `require_super_admin` | `storage_pool_service.py` |
| GET | `/api/super-admin/storage/deleted-events` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/deleted-events/{event_id}/purge-now` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/deleted-events/{event_id}/restore` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/events/{event_id}/soft-delete` | `require_super_admin` | `storage_pool_service.py` |
| GET | `/api/super-admin/storage/failures` | `require_super_admin` | `storage_pool_service.py` |
| POST | `/api/super-admin/storage/failures/retry` | `require_super_admin` | `storage_pool_service.py` |
| GET | `/api/super-admin/storage/overview` | `require_super_admin` | `storage_pool_service.py` |
| GET | `/api/super-admin/storage/settings` | `require_super_admin` | `storage_pool_service.py` |
| PUT | `/api/super-admin/storage/settings` | `require_super_admin` | `storage_pool_service.py` |

### <a id="admin"></a>`/admin` — 18 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/admin/profiles/{profile_id}/guests` | `require_admin` | `guest_features.py` |
| POST | `/admin/profiles/{profile_id}/guests` | `require_admin` | `guest_features.py` |
| POST | `/admin/profiles/{profile_id}/guests/bulk-delete` | `require_admin` | `guest_features.py` |
| POST | `/admin/profiles/{profile_id}/guests/import` | `require_admin` | `guest_features.py` |
| GET | `/admin/profiles/{profile_id}/guests/template` | `require_admin` | `guest_features.py` |
| POST | `/admin/profiles/{profile_id}/guests/whatsapp-links` | `require_admin` | `guest_features.py` |
| DELETE | `/admin/profiles/{profile_id}/guests/{guest_id}` | `require_admin` | `guest_features.py` |
| PUT | `/admin/profiles/{profile_id}/guests/{guest_id}` | `require_admin` | `guest_features.py` |
| DELETE | `/admin/profiles/{profile_id}/guests/{guest_id}/voice` | `require_admin` | `guest_features.py` |
| POST | `/admin/profiles/{profile_id}/guests/{guest_id}/voice` | `require_admin` | `guest_features.py` |
| GET | `/admin/studio-storage/files` | `current_admin_dep` | `studio_storage.py` |
| DELETE | `/admin/studio-storage/files/{file_id}` | `current_admin_dep` | `studio_storage.py` |
| GET | `/admin/studio-storage/my-plan` | `current_admin_dep` | `studio_storage.py` |
| GET | `/admin/studio-storage/plans` | `current_admin_dep` | `studio_storage.py` |
| GET | `/admin/studio-storage/status` | `current_admin_dep` | `studio_storage.py` |
| POST | `/admin/studio-storage/subscribe` | `current_admin_dep` | `studio_storage.py` |
| POST | `/admin/studio-storage/upload` | `current_admin_dep` | `studio_storage.py` |
| POST | `/admin/studio-storage/verify-payment` | `current_admin_dep` | `studio_storage.py` |

### <a id="apiclient"></a>`/api/client` — 17 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/client/analytics` | — | `photographer_clients.py` |
| GET | `/api/client/contracts` | — | `client_studio_service.py` |
| POST | `/api/client/contracts/{contract_id}/sign` | — | `client_studio_service.py` |
| POST | `/api/client/login` | — | `photographer_clients.py` |
| GET | `/api/client/overview` | — | `photographer_clients.py` |
| POST | `/api/client/print-orders` | — | `client_studio_service.py` |
| GET | `/api/client/proofing` | — | `client_studio_service.py` |
| POST | `/api/client/proofing/photos/{photo_id}/select` | — | `client_studio_service.py` |
| GET | `/api/client/rsvps` | — | `photographer_clients.py` |
| GET | `/api/client/rsvps/export` | — | `photographer_clients.py` |
| GET | `/api/client/rsvps/stats` | — | `photographer_clients.py` |
| GET | `/api/client/wishes` | — | `photographer_clients.py` |
| POST | `/api/client/wishes` | — | `photographer_clients.py` |
| DELETE | `/api/client/wishes/{wish_id}` | — | `photographer_clients.py` |
| POST | `/api/client/wishes/{wish_id}/approve` | — | `photographer_clients.py` |
| POST | `/api/client/wishes/{wish_id}/feature` | — | `photographer_clients.py` |
| POST | `/api/client/wishes/{wish_id}/reject` | — | `photographer_clients.py` |

### <a id="apiauth"></a>`/api/auth` — 14 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/auth/forgot-password` | — | `server.py` |
| POST | `/api/auth/login` | — | `server.py` |
| POST | `/api/auth/logout` | `get_current_admin_with_role` | `auth_sessions.py` |
| POST | `/api/auth/logout-all` | `get_current_admin_with_role` | `auth_sessions.py` |
| GET | `/api/auth/me` | `get_current_admin` | `server.py` |
| GET | `/api/auth/me-supabase` | `get_current_admin` | `server.py` |
| POST | `/api/auth/refresh` | — | `auth_sessions.py` |
| POST | `/api/auth/register` | — | `server.py` |
| POST | `/api/auth/reset-password` | — | `server.py` |
| POST | `/api/auth/send-otp` | — | `server.py` |
| GET | `/api/auth/sessions` | `get_current_admin_with_role` | `auth_sessions.py` |
| GET | `/api/auth/sms-status` | — | `server.py` |
| POST | `/api/auth/sync-supabase-user` | — | `server.py` |
| POST | `/api/auth/verify-otp` | — | `server.py` |

### <a id="apicloudbackup"></a>`/api/cloud-backup` — 13 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/cloud-backup/download-zip` | `require_admin` | `cloud_backup_service.py` |
| GET | `/api/cloud-backup/files` | `require_admin` | `cloud_backup_service.py` |
| POST | `/api/cloud-backup/files` | `require_admin` | `cloud_backup_service.py` |
| DELETE | `/api/cloud-backup/files/{fid}` | `require_admin` | `cloud_backup_service.py` |
| GET | `/api/cloud-backup/files/{fid}/download` | `require_admin` | `cloud_backup_service.py` |
| DELETE | `/api/cloud-backup/files/{fid}/purge` | `require_admin` | `cloud_backup_service.py` |
| POST | `/api/cloud-backup/files/{fid}/restore` | `require_admin` | `cloud_backup_service.py` |
| GET | `/api/cloud-backup/folders` | `require_admin` | `cloud_backup_service.py` |
| POST | `/api/cloud-backup/folders` | `require_admin` | `cloud_backup_service.py` |
| DELETE | `/api/cloud-backup/folders/{fid}` | `require_admin` | `cloud_backup_service.py` |
| GET | `/api/cloud-backup/history` | `require_admin` | `cloud_backup_service.py` |
| GET | `/api/cloud-backup/recycle-bin` | `require_admin` | `cloud_backup_service.py` |
| GET | `/api/cloud-backup/storage` | `require_admin` | `cloud_backup_service.py` |

### <a id="apiadminrestructured"></a>`/api/admin/restructured` — 13 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/restructured/credit-packs/{user_type}/full-theme` | `require_super_admin` | `restructured_admin_service.py` |
| POST | `/api/admin/restructured/credit-packs/{user_type}/random-design` | `require_super_admin` | `restructured_admin_service.py` |
| GET | `/api/admin/restructured/credit-packs/{user_type}/{pack_type}` | `require_super_admin` | `restructured_admin_service.py` |
| GET | `/api/admin/restructured/design-pricing/{user_type}` | `require_super_admin` | `restructured_admin_service.py` |
| POST | `/api/admin/restructured/design-pricing/{user_type}/batch` | `require_super_admin` | `restructured_admin_service.py` |
| GET | `/api/admin/restructured/plans-pricing/photographer/credits` | `require_super_admin` | `restructured_admin_service.py` |
| POST | `/api/admin/restructured/plans-pricing/photographer/credits` | `require_super_admin` | `restructured_admin_service.py` |
| GET | `/api/admin/restructured/plans-pricing/photographer/monthly` | `require_super_admin` | `restructured_admin_service.py` |
| POST | `/api/admin/restructured/plans-pricing/photographer/monthly` | `require_super_admin` | `restructured_admin_service.py` |
| PUT | `/api/admin/restructured/plans-pricing/photographer/monthly/{plan_id}` | `require_super_admin` | `restructured_admin_service.py` |
| GET | `/api/admin/restructured/plans-pricing/user` | `require_super_admin` | `restructured_admin_service.py` |
| POST | `/api/admin/restructured/plans-pricing/user` | `require_super_admin` | `restructured_admin_service.py` |
| PUT | `/api/admin/restructured/plans-pricing/user/{plan_id}` | `require_super_admin` | `restructured_admin_service.py` |

### <a id="apiprofiles"></a>`/api/profiles` — 12 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/profiles/{profile_id}/features` | — | `server.py` |
| GET | `/api/profiles/{profile_id}/referral-code` | `get_current_admin` | `server.py` |
| POST | `/api/profiles/{profile_id}/referral-code` | `get_current_admin` | `server.py` |
| GET | `/api/profiles/{profile_id}/referrals` | `get_current_admin` | `server.py` |
| GET | `/api/profiles/{profile_id}/templates` | — | `server.py` |
| GET | `/api/profiles/{profile_id}/theme` | `get_current_admin` | `server.py` |
| PUT | `/api/profiles/{profile_id}/theme` | `get_current_admin` | `server.py` |
| GET | `/api/profiles/{slug_url}/album-media` | — | `server.py` |
| GET | `/api/profiles/{slug_url}/memory-mode` | — | `server.py` |
| GET | `/api/profiles/{slug_url}/qr-code` | — | `server.py` |
| GET | `/api/profiles/{slug_url}/share-metadata` | — | `server.py` |
| GET | `/api/profiles/{slug_url}/thank-you` | — | `server.py` |

### <a id="apistore"></a>`/api/store` — 12 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/store/catalog` | — | `store_features.py` |
| GET | `/api/store/design-offer/{design_id}` | — | `store_features.py` |
| GET | `/api/store/design/{design_id}/price` | — | `store_features.py` |
| GET | `/api/store/my-orders` | `require_admin` | `store_features.py` |
| POST | `/api/store/order/create` | `get_current_public_user` | `store_features.py` |
| POST | `/api/store/order/verify` | `get_current_public_user` | `store_features.py` |
| GET | `/api/store/order/{order_id}` | `require_super_admin` | `store_features.py` |
| GET | `/api/store/order/{order_id}/edit-state` | `get_current_public_user` | `store_features.py` |
| POST | `/api/store/order/{order_id}/info` | `get_current_public_user` | `store_features.py` |
| PUT | `/api/store/order/{order_id}/info-draft` | `require_super_admin` | `store_features.py` |
| GET | `/api/store/packages` | — | `store_features.py` |
| POST | `/api/store/quote` | `require_super_admin` | `store_features.py` |

### <a id="apiadminfulfillment"></a>`/api/admin/fulfillment` — 11 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/fulfillment/events` | `require_super_admin` | `fulfillment_service.py` |
| GET | `/api/admin/fulfillment/links` | `require_super_admin` | `fulfillment_service.py` |
| GET | `/api/admin/fulfillment/requests` | `require_super_admin` | `fulfillment_service.py` |
| GET | `/api/admin/fulfillment/requests/{code}` | `require_super_admin` | `fulfillment_service.py` |
| POST | `/api/admin/fulfillment/requests/{code}/build-invitation` | `require_super_admin` | `fulfillment_service.py` |
| POST | `/api/admin/fulfillment/requests/{code}/deliver` | `require_super_admin` | `fulfillment_service.py` |
| POST | `/api/admin/fulfillment/requests/{code}/drive` | `require_super_admin` | `fulfillment_service.py` |
| POST | `/api/admin/fulfillment/requests/{code}/edit-lock` | `require_super_admin` | `store_features.py` |
| GET | `/api/admin/fulfillment/settings` | `require_super_admin` | `store_features.py` |
| PUT | `/api/admin/fulfillment/settings` | `require_super_admin` | `store_features.py` |
| GET | `/api/admin/fulfillment/{code}/face-match` | `require_super_admin` | `fulfillment_service.py` |

### <a id="apicalendar"></a>`/api/calendar` — 10 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/calendar/blocks` | `require_admin` | `calendar_service.py` |
| DELETE | `/api/calendar/blocks/{blk}` | `require_admin` | `calendar_service.py` |
| GET | `/api/calendar/bookings` | `require_admin` | `calendar_service.py` |
| POST | `/api/calendar/bookings` | `require_admin` | `calendar_service.py` |
| DELETE | `/api/calendar/bookings/{bid}` | `require_admin` | `calendar_service.py` |
| PUT | `/api/calendar/bookings/{bid}` | `require_admin` | `calendar_service.py` |
| GET | `/api/calendar/config` | `require_admin` | `calendar_service.py` |
| PUT | `/api/calendar/config` | `require_admin` | `calendar_service.py` |
| GET | `/api/calendar/meta` | `require_admin` | `calendar_service.py` |
| GET | `/api/calendar/month` | `require_admin` | `calendar_service.py` |

### <a id="apiweddings"></a>`/api/weddings` — 10 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/weddings` | `get_current_admin` | `server.py` |
| POST | `/api/weddings` | `get_current_admin` | `server.py` |
| POST | `/api/weddings/estimate-cost` | `get_current_admin` | `server.py` |
| GET | `/api/weddings/{wedding_id}` | `get_current_admin` | `server.py` |
| PUT | `/api/weddings/{wedding_id}` | `get_current_admin` | `server.py` |
| POST | `/api/weddings/{wedding_id}/archive` | `get_current_admin` | `server.py` |
| POST | `/api/weddings/{wedding_id}/publish` | `get_current_admin` | `server.py` |
| POST | `/api/weddings/{wedding_id}/slug/validate` | `get_current_admin` | `server.py` |
| PUT | `/api/weddings/{wedding_id}/status` | `get_current_admin` | `server.py` |
| POST | `/api/weddings/{wedding_id}/upgrade` | `get_current_admin` | `server.py` |

### <a id="apiv2"></a>`/api/v2` — 9 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| DELETE | `/api/v2/admin/comments/{comment_id}` | `get_current_admin` | `invitation_v2.py` |
| GET | `/api/v2/admin/profiles/{profile_id}/comments` | `get_current_admin` | `invitation_v2.py` |
| GET | `/api/v2/admin/profiles/{profile_id}/viewer-config` | `get_current_admin` | `invitation_v2.py` |
| PUT | `/api/v2/admin/profiles/{profile_id}/viewer-config` | `get_current_admin` | `invitation_v2.py` |
| POST | `/api/v2/admin/profiles/{profile_id}/viewer-config/section-toggle` | `get_current_admin` | `invitation_v2.py` |
| GET | `/api/v2/invitations/{slug}` | — | `invitation_v2.py` |
| GET | `/api/v2/invitations/{slug}/comments` | `get_current_admin` | `invitation_v2.py` |
| POST | `/api/v2/invitations/{slug}/comments` | — | `invitation_v2.py` |
| GET | `/api/v2/invitations/{slug}/stay-lookup` | — | `invitation_v2.py` |

### <a id="apieventmoney"></a>`/api/event-money` — 7 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/event-money/donations` | — | `event_money_service.py` |
| POST | `/api/event-money/donations` | — | `event_money_service.py` |
| PATCH | `/api/event-money/donations/{don_id}` | — | `event_money_service.py` |
| POST | `/api/event-money/expenses` | — | `event_money_service.py` |
| POST | `/api/event-money/login` | — | `event_money_service.py` |
| GET | `/api/event-money/overview` | — | `event_money_service.py` |
| GET | `/api/event-money/report.csv` | — | `event_money_service.py` |

### <a id="apiadminpixora"></a>`/api/admin/pixora` — 7 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/pixora/audit-log` | `require_super_admin` | `pixora_service.py` |
| DELETE | `/api/admin/pixora/content/{target_type}/{target_id}` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/admin/pixora/members` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/admin/pixora/reports` | `require_super_admin` | `pixora_service.py` |
| POST | `/api/admin/pixora/reports/{report_id}/resolve` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/admin/pixora/verifications` | `require_super_admin` | `pixora_service.py` |
| POST | `/api/admin/pixora/verifications/{studio_id}/review` | `require_super_admin` | `pixora_service.py` |

### <a id="apicreator"></a>`/api/creator` — 7 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/creator/earnings` | `get_current_admin` | `server.py` |
| GET | `/api/creator/profile` | `get_current_admin` | `server.py` |
| POST | `/api/creator/register` | `get_current_admin` | `server.py` |
| GET | `/api/creator/templates` | `get_current_admin` | `server.py` |
| POST | `/api/creator/templates` | `get_current_admin` | `server.py` |
| PUT | `/api/creator/templates/{template_id}` | `get_current_admin` | `server.py` |
| PUT | `/api/creator/templates/{template_id}/submit` | `get_current_admin` | `server.py` |

### <a id="superadmin"></a>`/super-admin` — 7 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/super-admin/studio-storage/plans` | — | `studio_storage.py` |
| POST | `/super-admin/studio-storage/plans` | — | `studio_storage.py` |
| DELETE | `/super-admin/studio-storage/plans/{plan_id}` | — | `studio_storage.py` |
| PUT | `/super-admin/studio-storage/plans/{plan_id}` | — | `studio_storage.py` |
| GET | `/super-admin/studio-storage/settings` | — | `studio_storage.py` |
| PUT | `/super-admin/studio-storage/settings` | `current_admin_dep` | `studio_storage.py` |
| GET | `/super-admin/studio-storage/subscriptions` | `current_admin_dep` | `studio_storage.py` |

### <a id="apisubscriptions"></a>`/api/subscriptions` — 7 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/subscriptions/create` | `require_admin` | `subscription_service.py` |
| GET | `/api/subscriptions/mine` | `require_admin` | `subscription_service.py` |
| GET | `/api/subscriptions/plans` | — | `subscription_service.py` |
| POST | `/api/subscriptions/quote` | `require_admin` | `subscription_service.py` |
| POST | `/api/subscriptions/verify` | `require_admin` | `subscription_service.py` |
| POST | `/api/subscriptions/{subscription_id}/cancel` | `require_admin` | `subscription_service.py` |
| POST | `/api/subscriptions/{subscription_id}/change` | `require_admin` | `subscription_service.py` |

### <a id="apiadminsupport"></a>`/api/admin/support` — 7 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/support/stats` | `require_admin` | `support_tickets.py` |
| GET | `/api/admin/support/tickets` | `require_admin` | `support_tickets.py` |
| GET | `/api/admin/support/tickets/{ticket_id}` | `require_admin` | `support_tickets.py` |
| PATCH | `/api/admin/support/tickets/{ticket_id}` | `require_admin` | `support_tickets.py` |
| POST | `/api/admin/support/tickets/{ticket_id}/merge` | `require_admin` | `support_tickets.py` |
| POST | `/api/admin/support/tickets/{ticket_id}/messages` | `require_admin` | `support_tickets.py` |
| POST | `/api/admin/support/tickets/{ticket_id}/reopen` | `require_admin` | `support_tickets.py` |

### <a id="apiuser"></a>`/api/user` — 7 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/user/purchase/calculate` | `get_current_admin` | `user_purchase_service.py` |
| POST | `/api/user/purchase/confirm` | `get_current_admin` | `user_purchase_service.py` |
| GET | `/api/user/purchase/designs` | `get_current_admin` | `user_purchase_service.py` |
| GET | `/api/user/purchase/durations` | `get_current_admin` | `user_purchase_service.py` |
| GET | `/api/user/purchase/features/{event_type}` | `get_current_admin` | `user_purchase_service.py` |
| GET | `/api/user/purchase/my-purchases` | `get_current_admin` | `user_purchase_service.py` |
| GET | `/api/user/purchase/themes` | `get_current_admin` | `user_purchase_service.py` |

### <a id="apiaccount"></a>`/api/account` — 6 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/account/delete-request` | — | `account_data.py` |
| GET | `/api/account/export` | — | `account_data.py` |
| POST | `/api/account/redeem-code` | `get_current_admin` | `gift_code_routes.py` |
| POST | `/api/account/redeem-referral` | `get_current_admin` | `photographer_referrals.py` |
| GET | `/api/account/referral-code` | `get_current_admin` | `photographer_referrals.py` |
| POST | `/api/account/referral-code/regenerate` | `get_current_admin` | `photographer_referrals.py` |

### <a id="apiadminmoderation"></a>`/api/admin/moderation` — 6 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/moderation/auto/rescreen` | `require_admin` | `auto_moderation.py` |
| GET | `/api/admin/moderation/auto/status` | `require_admin` | `auto_moderation.py` |
| POST | `/api/admin/moderation/bulk-account-status` | `require_admin` | `moderation_bulk.py` |
| POST | `/api/admin/moderation/bulk-delete` | `require_admin` | `moderation_bulk.py` |
| POST | `/api/admin/moderation/bulk-resolve-reports` | `require_admin` | `moderation_bulk.py` |
| GET | `/api/admin/moderation/reports` | `require_admin` | `moderation_bulk.py` |

### <a id="apiadmindisputes"></a>`/api/admin/disputes` — 6 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/disputes` | `require_admin` | `disputes.py` |
| POST | `/api/admin/disputes` | `require_admin` | `disputes.py` |
| GET | `/api/admin/disputes/stats` | `require_admin` | `disputes.py` |
| GET | `/api/admin/disputes/{dispute_id}` | `require_admin` | `disputes.py` |
| PATCH | `/api/admin/disputes/{dispute_id}` | `require_admin` | `disputes.py` |
| POST | `/api/admin/disputes/{dispute_id}/evidence` | `require_admin` | `disputes.py` |

### <a id="apidrafts"></a>`/api/drafts` — 6 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/drafts` | `require_admin` | `drafts_service.py` |
| DELETE | `/api/drafts/{form_key}` | `require_admin` | `drafts_service.py` |
| GET | `/api/drafts/{form_key}` | `require_admin` | `drafts_service.py` |
| PUT | `/api/drafts/{form_key}` | `require_admin` | `drafts_service.py` |
| POST | `/api/drafts/{form_key}/restore/{version}` | `require_admin` | `drafts_service.py` |
| GET | `/api/drafts/{form_key}/versions` | `require_admin` | `drafts_service.py` |

### <a id="apioauth"></a>`/api/oauth` — 6 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/oauth/drive/callback` | — | `drive_archive.py` |
| GET | `/api/oauth/drive/connect` | `require_admin` | `drive_archive.py` |
| POST | `/api/oauth/drive/disconnect` | `require_admin` | `drive_archive.py` |
| GET | `/api/oauth/drive/jobs` | `require_admin` | `drive_archive.py` |
| GET | `/api/oauth/drive/status` | `require_admin` | `drive_archive.py` |
| POST | `/api/oauth/drive/sync/{profile_id}` | `require_admin` | `drive_archive.py` |

### <a id="music"></a>`/music` — 6 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/music/library` | — | `music_library.py` |
| GET | `/music/library/by-category/{category}` | — | `music_library.py` |
| GET | `/music/library/by-mood/{mood}` | — | `music_library.py` |
| GET | `/music/library/random` | — | `music_library.py` |
| GET | `/music/library/search` | — | `music_library.py` |
| GET | `/music/presets` | — | `music_library.py` |

### <a id="apisuperadminusers"></a>`/api/super-admin/users` — 6 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/users` | `require_super_admin` | `user_features.py` |
| GET | `/api/super-admin/users/{user_id}` | `require_super_admin` | `user_features.py` |
| POST | `/api/super-admin/users/{user_id}/credits` | `require_super_admin` | `user_features.py` |
| POST | `/api/super-admin/users/{user_id}/credits/adjust` | `require_super_admin` | `user_features.py` |
| GET | `/api/super-admin/users/{user_id}/credits/ledger` | `require_super_admin` | `user_features.py` |
| PUT | `/api/super-admin/users/{user_id}/status` | `require_super_admin` | `user_features.py` |

### <a id="apiadminaccount"></a>`/api/admin/account` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/account/change-email` | `get_current_admin` | `account_security.py` |
| POST | `/api/admin/account/change-password` | `get_current_admin` | `account_security.py` |
| POST | `/api/admin/account/change-phone` | `get_current_admin` | `account_security.py` |
| POST | `/api/admin/account/revoke-device` | `get_current_admin` | `account_security.py` |
| GET | `/api/admin/account/summary` | `get_current_admin` | `account_security.py` |

### <a id="apiadmineventpricing"></a>`/api/admin/event-pricing` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/event-pricing/{event_type}` | `require_super_admin` | `event_pricing.py` |
| POST | `/api/admin/event-pricing/{event_type}/design` | `require_super_admin` | `event_pricing.py` |
| POST | `/api/admin/event-pricing/{event_type}/design/bulk` | `require_super_admin` | `event_pricing.py` |
| POST | `/api/admin/event-pricing/{event_type}/feature` | `require_super_admin` | `event_pricing.py` |
| POST | `/api/admin/event-pricing/{event_type}/plan` | `require_super_admin` | `event_pricing.py` |

### <a id="apisuperadmingiftcodes"></a>`/api/super-admin/gift-codes` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/gift-codes` | `require_super_admin` | `gift_code_routes.py` |
| POST | `/api/super-admin/gift-codes` | `require_super_admin` | `gift_code_routes.py` |
| DELETE | `/api/super-admin/gift-codes/{code}` | `require_super_admin` | `gift_code_routes.py` |
| PATCH | `/api/super-admin/gift-codes/{code}` | `require_super_admin` | `gift_code_routes.py` |
| GET | `/api/super-admin/gift-codes/{code}/redemptions` | `require_super_admin` | `gift_code_routes.py` |

### <a id="apipayments"></a>`/api/payments` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/payments/create-order` | `get_current_admin` | `server.py` |
| GET | `/api/payments/history/{profile_id}` | `get_current_admin` | `server.py` |
| POST | `/api/payments/razorpay-webhook` | — | `monetization_features.py` |
| POST | `/api/payments/verify` | `get_current_admin` | `server.py` |
| GET | `/api/payments/{payment_id}` | `get_current_admin` | `server.py` |

### <a id="apisuperadminphotographers"></a>`/api/super-admin/photographers` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/photographers` | `require_super_admin` | `super_admin_service.py` |
| GET | `/api/super-admin/photographers/{admin_id}/detail` | `require_super_admin` | `monetization_features.py` |
| POST | `/api/super-admin/photographers/{photographer_id}/block` | `require_super_admin` | `super_admin_service.py` |
| GET | `/api/super-admin/photographers/{photographer_id}/invitations` | `require_super_admin` | `super_admin_service.py` |
| POST | `/api/super-admin/photographers/{photographer_id}/unblock` | `require_super_admin` | `super_admin_service.py` |

### <a id="apiadminai"></a>`/api/admin/ai` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/ai/enhance-image` | `get_current_admin` | `premium_features.py` |
| POST | `/api/admin/ai/greeting-personalize` | `get_current_admin` | `premium_features.py` |
| POST | `/api/admin/ai/story` | `get_current_admin` | `server.py` |
| POST | `/api/admin/ai/story-v2` | `get_current_admin` | `premium_features.py` |
| POST | `/api/admin/ai/translate-bulk` | `get_current_admin` | `premium_features.py` |

### <a id="apieventcategories"></a>`/api/event-categories` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/event-categories` | — | `server.py` |
| GET | `/api/event-categories/{category_id}` | — | `server.py` |
| GET | `/api/event-categories/{category_id}/designs` | — | `server.py` |
| GET | `/api/event-categories/{category_id}/features` | — | `server.py` |
| GET | `/api/event-categories/{category_id}/pricing` | — | `server.py` |

### <a id="apiadmineventinvitations"></a>`/api/admin/event-invitations` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/event-invitations/sweep-expired` | `require_super_admin` | `server.py` |
| DELETE | `/api/admin/event-invitations/{invitation_id}` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/event-invitations/{invitation_id}` | `get_current_admin` | `server.py` |
| POST | `/api/admin/event-invitations/{invitation_id}/regenerate-qr` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/event-invitations/{invitation_id}/security` | `get_current_admin` | `server.py` |

### <a id="apiog"></a>`/api/og` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/og/invite/{slug}` | — | `server.py` |
| GET | `/api/og/photographer/{slug}` | — | `server.py` |
| GET | `/api/og/photographers` | — | `server.py` |
| GET | `/api/og/photographers/{a}` | — | `server.py` |
| GET | `/api/og/photographers/{a}/{b}` | — | `server.py` |

### <a id="apisuperadmindesignpricing"></a>`/api/super-admin/design-pricing` — 5 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/design-pricing` | `require_super_admin` | `super_admin_service.py` |
| GET | `/api/super-admin/design-pricing` | `require_super_admin` | `user_features.py` |
| POST | `/api/super-admin/design-pricing/batch` | `require_super_admin` | `super_admin_service.py` |
| DELETE | `/api/super-admin/design-pricing/{design_id}` | `require_super_admin` | `user_features.py` |
| PUT | `/api/super-admin/design-pricing/{design_id}` | `require_super_admin` | `user_features.py` |

### <a id="apiadminmfa"></a>`/api/admin/mfa` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/mfa/disable` | `require_super_admin` | `admin_security.py` |
| POST | `/api/admin/mfa/enroll/start` | `require_admin` | `admin_security.py` |
| POST | `/api/admin/mfa/enroll/verify` | `require_admin` | `admin_security.py` |
| GET | `/api/admin/mfa/status` | `require_admin` | `admin_security.py` |

### <a id="apisuperadminfounding"></a>`/api/super-admin/founding` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/super-admin/founding/apply-catalogue` | `require_super_admin` | `founding_admin.py` |
| PATCH | `/api/super-admin/founding/portfolio/{tier}` | `require_super_admin` | `founding_admin.py` |
| PATCH | `/api/super-admin/founding/settings` | `require_super_admin` | `founding_admin.py` |
| GET | `/api/super-admin/founding/status` | `require_super_admin` | `founding_admin.py` |

### <a id="apiadminmap"></a>`/api/admin/map` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/map/expand` | `get_current_admin` | `map_features.py` |
| POST | `/api/admin/map/from-3wa` | `get_current_admin` | `map_features.py` |
| GET | `/api/admin/map/search` | `get_current_admin` | `map_features.py` |
| POST | `/api/admin/map/what3words` | `get_current_admin` | `map_features.py` |

### <a id="apisuperadmincreditpacks"></a>`/api/super-admin/credit-packs` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/credit-packs` | `require_super_admin` | `monetization_features.py` |
| POST | `/api/super-admin/credit-packs` | `require_super_admin` | `monetization_features.py` |
| DELETE | `/api/super-admin/credit-packs/{pack_id}` | `require_super_admin` | `monetization_features.py` |
| PUT | `/api/super-admin/credit-packs/{pack_id}` | `require_super_admin` | `monetization_features.py` |

### <a id="apiadminphotographer"></a>`/api/admin/photographer` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/photographer/availability` | `get_current_admin` | `photographer_directory.py` |
| GET | `/api/admin/photographer/profile` | `get_current_admin` | `photographer_directory.py` |
| POST | `/api/admin/photographer/profile` | `get_current_admin` | `photographer_directory.py` |
| GET | `/api/admin/photographer/reviews` | `get_current_admin` | `photographer_directory.py` |

### <a id="apisuperadmindiscountcodes"></a>`/api/super-admin/discount-codes` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/discount-codes` | `require_super_admin` | `pricing_features.py` |
| POST | `/api/super-admin/discount-codes` | `require_super_admin` | `pricing_features.py` |
| DELETE | `/api/super-admin/discount-codes/{code_id}` | `require_super_admin` | `pricing_features.py` |
| PUT | `/api/super-admin/discount-codes/{code_id}` | `require_super_admin` | `pricing_features.py` |

### <a id="apiadmintemplates"></a>`/api/admin/templates` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/templates` | `get_current_admin` | `server.py` |
| GET | `/api/admin/templates` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/templates/{template_id}/featured` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/templates/{template_id}/review` | `get_current_admin` | `server.py` |

### <a id="apithemes"></a>`/api/themes` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/themes` | — | `server.py` |
| GET | `/api/themes/accessible/{profile_id}` | — | `server.py` |
| POST | `/api/themes/preview` | — | `server.py` |
| GET | `/api/themes/{theme_id}` | — | `server.py` |

### <a id="apisuperadmincreditpackages"></a>`/api/super-admin/credit-packages` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/credit-packages` | `require_super_admin` | `super_admin_service.py` |
| POST | `/api/super-admin/credit-packages` | `require_super_admin` | `super_admin_service.py` |
| DELETE | `/api/super-admin/credit-packages/{package_id}` | `require_super_admin` | `super_admin_service.py` |
| PUT | `/api/super-admin/credit-packages/{package_id}` | `require_super_admin` | `super_admin_service.py` |

### <a id="apisupport"></a>`/api/support` — 4 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/support/tickets` | `get_current_buyer` | `support_tickets.py` |
| GET | `/api/support/tickets/mine` | `get_current_buyer` | `support_tickets.py` |
| GET | `/api/support/tickets/{ticket_id}` | `get_current_buyer` | `support_tickets.py` |
| POST | `/api/support/tickets/{ticket_id}/messages` | `require_admin` | `support_tickets.py` |

### <a id="apiadminrbac"></a>`/api/admin/rbac` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/rbac/assign` | `require_super_admin` | `admin_security.py` |
| GET | `/api/admin/rbac/catalogue` | `require_super_admin` | `admin_security.py` |
| GET | `/api/admin/rbac/me` | `require_super_admin` | `admin_security.py` |

### <a id="apieventrequests"></a>`/api/event-requests` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/event-requests/catalog/{event_type}` | `require_super_admin` | `event_feature_requests.py` |
| GET | `/api/event-requests/{event_id}` | `require_super_admin` | `event_feature_requests.py` |
| POST | `/api/event-requests/{event_id}` | `require_super_admin` | `event_feature_requests.py` |

### <a id="apiadminfeatureflags"></a>`/api/admin/feature-flags` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/feature-flags` | `require_super_admin` | `feature_flags_service.py` |
| POST | `/api/admin/feature-flags` | `require_super_admin` | `feature_flags_service.py` |
| DELETE | `/api/admin/feature-flags/{key}` | `require_super_admin` | `feature_flags_service.py` |

### <a id="apiadminfeaturewishes"></a>`/api/admin/feature-wishes` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/feature-wishes` | `require_super_admin` | `feature_wishes.py` |
| GET | `/api/admin/feature-wishes/summary` | `require_super_admin` | `feature_wishes.py` |
| PATCH | `/api/admin/feature-wishes/{wish_id}` | `require_super_admin` | `feature_wishes.py` |

### <a id="apiadminfooddonation"></a>`/api/admin/food-donation` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/food-donation` | `require_super_admin` | `food_features.py` |
| POST | `/api/admin/food-donation` | `require_super_admin` | `food_features.py` |
| DELETE | `/api/admin/food-donation/{center_id}` | `require_super_admin` | `food_features.py` |

### <a id="apiadminphotorequests"></a>`/api/admin/photo-requests` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/photo-requests` | `get_current_admin` | `gallery_features.py` |
| GET | `/api/admin/photo-requests/all` | `get_current_admin` | `gallery_features.py` |
| POST | `/api/admin/photo-requests/{req_id}/status` | `get_current_admin` | `gallery_features.py` |

### <a id="apiadmincredits"></a>`/api/admin/credits` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/credits/purchase/create-order` | `require_admin` | `monetization_features.py` |
| POST | `/api/admin/credits/purchase/verify` | `require_admin` | `monetization_features.py` |
| GET | `/api/admin/credits/purchases` | `require_super_admin` | `monetization_features.py` |

### <a id="apimonetization"></a>`/api/monetization` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/monetization/catalog` | `require_admin` | `monetization_service.py` |
| GET | `/api/monetization/my` | `require_super_admin` | `monetization_service.py` |
| POST | `/api/monetization/purchase` | `require_admin` | `monetization_service.py` |

### <a id="apisuperadminreferrals"></a>`/api/super-admin/referrals` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/referrals` | `require_super_admin` | `photographer_referrals.py` |
| GET | `/api/super-admin/referrals/{admin_id}` | `require_super_admin` | `photographer_referrals.py` |
| PATCH | `/api/super-admin/referrals/{admin_id}` | `require_super_admin` | `photographer_referrals.py` |

### <a id="apiadminvendorcategories"></a>`/api/admin/vendor-categories` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/vendor-categories` | `require_super_admin` | `pixora_service.py` |
| POST | `/api/admin/vendor-categories` | `require_super_admin` | `pixora_service.py` |
| DELETE | `/api/admin/vendor-categories/{cat_id}` | `require_super_admin` | `pixora_service.py` |

### <a id="apiadminvendors"></a>`/api/admin/vendors` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/vendors` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/admin/vendors/analytics` | `require_super_admin` | `pixora_service.py` |
| POST | `/api/admin/vendors/{vendor_id}/action` | `require_super_admin` | `pixora_service.py` |

### <a id="apipush"></a>`/api/push` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/push/preferences` | `require_super_admin` | `pixora_service.py` |
| PUT | `/api/push/preferences` | `require_super_admin` | `pixora_service.py` |
| POST | `/api/push/register` | `require_admin` | `pixora_service.py` |

### <a id="apiadminwhatsapp"></a>`/api/admin/whatsapp` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/whatsapp/send-invitation` | `require_admin` | `premium_features.py` |
| POST | `/api/admin/whatsapp/send-reminder` | `require_admin` | `premium_features.py` |
| GET | `/api/admin/whatsapp/status` | `require_admin` | `premium_features.py` |

### <a id="apisuperadminthemebundlepricing"></a>`/api/super-admin/theme-bundle-pricing` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/theme-bundle-pricing` | `require_super_admin` | `pricing_features.py` |
| POST | `/api/super-admin/theme-bundle-pricing` | `require_super_admin` | `pricing_features.py` |
| DELETE | `/api/super-admin/theme-bundle-pricing/{theme_id}` | `require_super_admin` | `pricing_features.py` |

### <a id="apipricing"></a>`/api/pricing` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/pricing/catalog` | — | `pricing_hub_service.py` |
| POST | `/api/pricing/plan-quote` | — | `pricing_hub_service.py` |
| POST | `/api/pricing/quote` | — | `pricing_hub_service.py` |

### <a id="apisuperadminadmins"></a>`/api/super-admin/admins` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/admins` | `require_super_admin` | `server.py` |
| POST | `/api/super-admin/admins` | `require_super_admin` | `server.py` |
| PUT | `/api/super-admin/admins/{admin_id}/status` | `require_super_admin` | `server.py` |

### <a id="apiadminmedia"></a>`/api/admin/media` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| DELETE | `/api/admin/media/{media_id}` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/media/{media_id}/caption` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/media/{media_id}/set-cover` | `get_current_admin` | `server.py` |

### <a id="apiadmingreetings"></a>`/api/admin/greetings` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| DELETE | `/api/admin/greetings/{greeting_id}` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/greetings/{greeting_id}/approve` | `get_current_admin` | `server.py` |
| PUT | `/api/admin/greetings/{greeting_id}/reject` | `get_current_admin` | `server.py` |

### <a id="apiconfig"></a>`/api/config` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/config/deities` | — | `server.py` |
| GET | `/api/config/designs` | — | `server.py` |
| GET | `/api/config/languages` | — | `server.py` |

### <a id="apianalytics"></a>`/api/analytics` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/analytics/export` | `get_current_admin` | `server.py` |
| GET | `/api/analytics/summary` | `get_current_admin` | `server.py` |
| POST | `/api/analytics/track` | — | `server.py` |

### <a id="apiphotographers"></a>`/api/photographers` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/photographers` | — | `server.py` |
| GET | `/api/photographers/{a}` | — | `server.py` |
| GET | `/api/photographers/{a}/{b}` | — | `server.py` |

### <a id="apitemplates"></a>`/api/templates` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/templates` | — | `server.py` |
| GET | `/api/templates/{template_id}` | — | `server.py` |
| POST | `/api/templates/{template_id}/purchase` | — | `server.py` |

### <a id="apiadminbuildqueue"></a>`/api/admin/build-queue` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/build-queue` | `require_admin` | `store_features.py` |
| POST | `/api/admin/build-queue/{order_id}/deliver` | `require_admin` | `store_features.py` |
| POST | `/api/admin/build-queue/{order_id}/edit-applied` | `require_admin` | `store_features.py` |

### <a id="apisuperadminthemepackages"></a>`/api/super-admin/theme-packages` — 3 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/theme-packages` | `require_super_admin` | `super_admin_service.py` |
| POST | `/api/super-admin/theme-packages` | `require_super_admin` | `super_admin_service.py` |
| PUT | `/api/super-admin/theme-packages/{package_id}` | `require_super_admin` | `super_admin_service.py` |

### <a id="apiadminnotifications"></a>`/api/admin/notifications` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/notifications` | `require_admin` | `admin_dashboard_v2.py` |
| GET | `/api/admin/notifications/unread-count` | `require_admin` | `admin_dashboard_v2.py` |

### <a id="apiadmindelivery"></a>`/api/admin/delivery` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/delivery/recent` | `require_admin` | `delivery_tracking.py` |
| GET | `/api/admin/delivery/stats` | `require_admin` | `delivery_tracking.py` |

### <a id="apiadmineventrequests"></a>`/api/admin/event-requests` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/event-requests` | `require_super_admin` | `event_feature_requests.py` |
| POST | `/api/admin/event-requests/{request_id}` | `require_super_admin` | `event_feature_requests.py` |

### <a id="apiadminfaceops"></a>`/api/admin/face-ops` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/face-ops/overview` | `require_admin` | `face_ops.py` |
| POST | `/api/admin/face-ops/reindex/{profile_id}` | `require_admin` | `face_ops.py` |

### <a id="apifeaturewishes"></a>`/api/feature-wishes` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/feature-wishes` | — | `feature_wishes.py` |
| GET | `/api/feature-wishes/consent` | — | `feature_wishes.py` |

### <a id="apiliveupload"></a>`/api/live-upload` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/live-upload/{profile_id}` | — | `gallery_features.py` |
| GET | `/api/live-upload/{profile_id}/status` | — | `gallery_features.py` |

### <a id="uploads"></a>`/uploads` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/uploads/voice/{profile_id}/{filename}` | `require_admin` | `guest_features.py` |
| GET | `/uploads/{subpath:path}` | — | `storage_serve.py` |

### <a id="apiuploads"></a>`/api/uploads` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/uploads/weddings/{wedding_id}/{folder}/{filename}` | — | `live_gallery_features.py` |
| GET | `/api/uploads/{subpath:path}` | — | `storage_serve.py` |

### <a id="apimarketplace"></a>`/api/marketplace` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/marketplace/config-options` | — | `marketplace_service.py` |
| POST | `/api/marketplace/quote` | — | `marketplace_service.py` |

### <a id="apiadminmonetization"></a>`/api/admin/monetization` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/monetization/orders` | `require_super_admin` | `monetization_service.py` |
| POST | `/api/admin/monetization/orders/{order_id}/activate` | `require_super_admin` | `monetization_service.py` |

### <a id="apiadminphotographerreviews"></a>`/api/admin/photographer-reviews` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/photographer-reviews/pending` | `get_current_admin` | `photographer_directory.py` |
| POST | `/api/admin/photographer-reviews/{review_id}/moderate` | `get_current_admin` | `photographer_directory.py` |

### <a id="apiadminanalytics"></a>`/api/admin/analytics` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/analytics/global` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/admin/analytics/overview` | `require_super_admin` | `pixora_service.py` |

### <a id="apiadminworkspaces"></a>`/api/admin/workspaces` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/workspaces` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/admin/workspaces/analytics` | `require_super_admin` | `pixora_service.py` |

### <a id="apiadmintalent"></a>`/api/admin/talent` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/talent` | `require_super_admin` | `pixora_service.py` |
| POST | `/api/admin/talent/{talent_id}/action` | `require_super_admin` | `pixora_service.py` |

### <a id="apiadmincurrency"></a>`/api/admin/currency` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/currency/rates` | `require_super_admin` | `pixora_service.py` |
| PUT | `/api/admin/currency/rates` | `require_super_admin` | `pixora_service.py` |

### <a id="apiadminstorage"></a>`/api/admin/storage` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/storage/overview` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/admin/storage/overview` | `require_admin` | `storage_analytics.py` |

### <a id="apiadminmarketplace"></a>`/api/admin/marketplace` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/marketplace/activity` | `require_super_admin` | `pixora_service.py` |
| GET | `/api/admin/marketplace/stats` | `get_current_admin` | `server.py` |

### <a id="apiadmincampaigns"></a>`/api/admin/campaigns` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/campaigns` | `require_super_admin` | `pixora_service.py` |
| POST | `/api/admin/campaigns/{campaign_id}/action` | `require_super_admin` | `pixora_service.py` |

### <a id="apiadminportfoliobuildrequests"></a>`/api/admin/portfolio-build-requests` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/portfolio-build-requests` | `require_super_admin` | `portfolio_service.py` |
| POST | `/api/admin/portfolio-build-requests/{req_id}/status` | `require_super_admin` | `portfolio_service.py` |

### <a id="apiadminlivegallery"></a>`/api/admin/live-gallery` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| DELETE | `/api/admin/live-gallery/{photo_id}` | `require_admin` | `premium_features.py` |
| PUT | `/api/admin/live-gallery/{photo_id}/moderate` | `require_admin` | `premium_features.py` |

### <a id="apisuperadmineventcategories"></a>`/api/super-admin/event-categories` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/event-categories/pricing` | `require_super_admin` | `server.py` |
| POST | `/api/super-admin/event-categories/pricing` | `require_super_admin` | `server.py` |

### <a id="apirsvp"></a>`/api/rsvp` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/rsvp` | — | `server.py` |
| PUT | `/api/rsvp/{rsvp_id}` | — | `server.py` |

### <a id="apidesigns"></a>`/api/designs` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/designs` | — | `server.py` |
| GET | `/api/designs/{design_id}` | — | `server.py` |

### <a id="apilords"></a>`/api/lords` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/lords` | — | `server.py` |
| GET | `/api/lords/{lord_id}` | — | `server.py` |

### <a id="apicaptcha"></a>`/api/captcha` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/captcha/generate` | — | `server.py` |
| POST | `/api/captcha/verify` | — | `server.py` |

### <a id="apiadminexpirytiers"></a>`/api/admin/expiry-tiers` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/expiry-tiers` | `require_super_admin` | `server.py` |
| PUT | `/api/admin/expiry-tiers` | `require_super_admin` | `server.py` |

### <a id="apiadminuseraddons"></a>`/api/admin/user-addons` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/user-addons` | `require_super_admin` | `server.py` |
| PUT | `/api/admin/user-addons` | `require_super_admin` | `server.py` |

### <a id="apisuperadmingalleryuploads"></a>`/api/super-admin/gallery-uploads` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/gallery-uploads` | `require_super_admin` | `server.py` |
| GET | `/api/super-admin/gallery-uploads/{wedding_id}` | `require_super_admin` | `server.py` |

### <a id="apiadminstorepackages"></a>`/api/admin/store-packages` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/store-packages` | `require_super_admin` | `store_features.py` |
| POST | `/api/admin/store-packages` | `require_super_admin` | `store_features.py` |

### <a id="apiadminsubscriptionplans"></a>`/api/admin/subscription-plans` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/subscription-plans` | `require_super_admin` | `subscription_service.py` |
| POST | `/api/admin/subscription-plans` | `require_super_admin` | `subscription_service.py` |

### <a id="apiadminbillingcycles"></a>`/api/admin/billing-cycles` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/billing-cycles` | `require_super_admin` | `subscription_service.py` |
| PUT | `/api/admin/billing-cycles` | `require_super_admin` | `subscription_service.py` |

### <a id="apisuperadminfeaturepricing"></a>`/api/super-admin/feature-pricing` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/super-admin/feature-pricing` | `require_super_admin` | `super_admin_service.py` |
| PUT | `/api/super-admin/feature-pricing` | `require_super_admin` | `super_admin_service.py` |

### <a id="apisuperadmininvitations"></a>`/api/super-admin/invitations` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| DELETE | `/api/super-admin/invitations/{invitation_id}` | `require_super_admin` | `super_admin_service.py` |
| GET | `/api/super-admin/invitations/{invitation_id}` | `require_super_admin` | `super_admin_service.py` |

### <a id="apiadmininvestigation"></a>`/api/admin/investigation` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/investigation/search` | `require_admin` | `user_investigation.py` |
| GET | `/api/admin/investigation/subject/{kind}/{subject_id}` | `require_admin` | `user_investigation.py` |

### <a id="apiadminwhitelabel"></a>`/api/admin/white-label` — 2 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/white-label` | `require_super_admin` | `white_label_service.py` |
| POST | `/api/admin/white-label/{studio_id}/entitlement` | `require_super_admin` | `white_label_service.py` |

### <a id="apiadmintags"></a>`/api/admin/tags` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/tags` | `require_admin` | `admin_dashboard_v2.py` |

### <a id="apiadminimpersonate"></a>`/api/admin/impersonate` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/impersonate` | `require_super_admin` | `admin_security.py` |

### <a id="apiadminbi"></a>`/api/admin/bi` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/bi/overview` | `require_admin` | `business_intelligence.py` |

### <a id="apiwebhooks"></a>`/api/webhooks` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/webhooks/delivery` | `require_admin` | `delivery_tracking.py` |

### <a id="apieventmeta"></a>`/api/event-meta` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/event-meta/child-collections` | `get_current_buyer` | `event_children_service.py` |

### <a id="apifeatureflags"></a>`/api/feature-flags` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/feature-flags` | `require_super_admin` | `feature_flags_service.py` |

### <a id="apifulfillment"></a>`/api/fulfillment` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/fulfillment/{code}/face-match/selfie` | — | `fulfillment_service.py` |

### <a id="apiadmingallery"></a>`/api/admin/gallery` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/gallery/aws/health` | `get_current_admin` | `gallery_features.py` |

### <a id="apigifts"></a>`/api/gifts` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/gifts/presets` | `get_current_admin` | `gift_registry.py` |

### <a id="invite"></a>`/invite` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/invite/{slug}/guest/{token}` | — | `guest_features.py` |

### <a id="apiinvoices"></a>`/api/invoices` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/invoices/{invoice_id}/download` | — | `invoice_service.py` |

### <a id="apiws"></a>`/api/ws` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| WEBSOCKET | `/api/ws/gallery/{wedding_id}` | — | `live_gallery_features.py` |

### <a id="apiadmincreditpacks"></a>`/api/admin/credit-packs` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/credit-packs` | `require_admin` | `monetization_features.py` |

### <a id="apisuperadmincreditpurchases"></a>`/api/super-admin/credit-purchases` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/super-admin/credit-purchases/{purchase_id}/refund` | `require_super_admin` | `monetization_features.py` |

### <a id="apitrack"></a>`/api/track` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/track` | `require_admin` | `pixora_service.py` |

### <a id="apiadminbookings"></a>`/api/admin/bookings` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/bookings/{booking_id}/resolve` | `require_super_admin` | `pixora_service.py` |

### <a id="apiadminindustryanalytics"></a>`/api/admin/industry-analytics` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/industry-analytics` | `require_super_admin` | `pixora_service.py` |

### <a id="apiadminvendorreviews"></a>`/api/admin/vendor-reviews` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| DELETE | `/api/admin/vendor-reviews/{review_id}` | `require_super_admin` | `pixora_service.py` |

### <a id="apicurrency"></a>`/api/currency` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/currency/rates` | `require_admin` | `pixora_service.py` |

### <a id="apiadminpush"></a>`/api/admin/push` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/push/stats` | `require_super_admin` | `pixora_service.py` |

### <a id="apiadminbrands"></a>`/api/admin/brands` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/brands/{brand_id}/verify` | `require_super_admin` | `pixora_service.py` |

### <a id="apiplanpurchasedetails"></a>`/api/plan-purchase-details` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/plan-purchase-details` | `require_super_admin` | `portfolio_service.py` |

### <a id="apiadminplanpurchasedetails"></a>`/api/admin/plan-purchase-details` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/plan-purchase-details` | `require_super_admin` | `portfolio_service.py` |

### <a id="apilivegallery"></a>`/api/live-gallery` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/live-gallery/desktop-upload` | — | `premium_features.py` |

### <a id="apicampaigns"></a>`/api/campaigns` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/campaigns/active` | — | `pricing_hub_service.py` |

### <a id="apiadminprofitability"></a>`/api/admin/profitability` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/profitability` | `require_admin` | `profitability.py` |

### <a id="apiadminproviders"></a>`/api/admin/providers` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/providers` | `require_admin` | `providers_admin.py` |

### <a id="apiadminqranalytics"></a>`/api/admin/qr-analytics` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/qr-analytics` | `require_admin` | `qr_analytics.py` |

### <a id="apihealth"></a>`/api/health` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/health` | — | `server.py` |

### <a id="apiadminlogout"></a>`/api/admin/logout` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/logout` | — | `server.py` |

### <a id="apisuperadminprofiles"></a>`/api/super-admin/profiles` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| PUT | `/api/super-admin/profiles/{profile_id}/watermark` | `require_super_admin` | `server.py` |

### <a id="apiadminauditlogs"></a>`/api/admin/audit-logs` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/audit-logs` | `get_current_admin` | `server.py` |

### <a id="apiadminuploadimage"></a>`/api/admin/upload-image` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/upload-image` | `get_current_admin` | `server.py` |

### <a id="apiadminuploadvideo"></a>`/api/admin/upload-video` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/upload-video` | `get_current_admin` | `server.py` |

### <a id="apisavethedate"></a>`/api/save-the-date` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/save-the-date/{slug}` | — | `server.py` |

### <a id="apiadminsongrequests"></a>`/api/admin/song-requests` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| DELETE | `/api/admin/song-requests/{request_id}` | `get_current_admin` | `server.py` |

### <a id="apiadminwishes"></a>`/api/admin/wishes` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| DELETE | `/api/admin/wishes/{wish_id}` | `get_current_admin` | `server.py` |

### <a id="apitranslate"></a>`/api/translate` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/translate` | — | `server.py` |

### <a id="apiadmingenerateeventdescription"></a>`/api/admin/generate-event-description` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/generate-event-description` | `get_current_admin` | `server.py` |

### <a id="apirsvpsuggestions"></a>`/api/rsvp-suggestions` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/rsvp-suggestions` | — | `server.py` |

### <a id="apiadminguestinsights"></a>`/api/admin/guest-insights` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/guest-insights/{profile_id}` | `get_current_admin` | `server.py` |

### <a id="apilanguages"></a>`/api/languages` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/languages` | `require_admin` | `server.py` |

### <a id="apirobots.txt"></a>`/api/robots.txt` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/robots.txt` | — | `server.py` |

### <a id="apicspreport"></a>`/api/csp-report` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/csp-report` | — | `server.py` |

### <a id="apiphotographer"></a>`/api/photographer` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/photographer/{slug}/portfolio` | — | `server.py` |

### <a id="apisitemap.xml"></a>`/api/sitemap.xml` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/sitemap.xml` | — | `server.py` |

### <a id="apievent"></a>`/api/event` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/event/{event_id}/verify-access` | — | `server.py` |

### <a id="apicheckcaptcharequired"></a>`/api/check-captcha-required` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/check-captcha-required` | — | `server.py` |

### <a id="apiplans"></a>`/api/plans` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/plans/info` | — | `server.py` |

### <a id="apireferrals"></a>`/api/referrals` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/referrals/apply` | — | `server.py` |

### <a id="apiadminreferrals"></a>`/api/admin/referrals` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/referrals/override` | `get_current_admin` | `server.py` |

### <a id="apiadmincreators"></a>`/api/admin/creators` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| PUT | `/api/admin/creators/{creator_id}/status` | `get_current_admin` | `server.py` |

### <a id="apifeatures"></a>`/api/features` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/features/registry` | — | `server.py` |

### <a id="apiai"></a>`/api/ai` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/ai/note-suggestions` | — | `server.py` |

### <a id="apigeneratelovestory"></a>`/api/generate-love-story` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/generate-love-story` | `get_current_admin` | `server.py` |

### <a id="apigenerateeventdescription"></a>`/api/generate-event-description` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/generate-event-description` | `get_current_admin` | `server.py` |

### <a id="apistoragepool"></a>`/api/storage-pool` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/storage-pool/oauth/callback` | — | `storage_pool_service.py` |

### <a id="apimedia"></a>`/api/media` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/media` | — | `storage_serve.py` |

### <a id="apiadminstoreaddons"></a>`/api/admin/store-addons` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/store-addons` | `require_super_admin` | `store_features.py` |

### <a id="apiadminstorealacarte"></a>`/api/admin/store-alacarte` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/store-alacarte` | `require_super_admin` | `store_features.py` |

### <a id="apiadminstorefeatures"></a>`/api/admin/store-features` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/store-features` | `require_super_admin` | `store_features.py` |

### <a id="apiadminstorelanguages"></a>`/api/admin/store-languages` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| POST | `/api/admin/store-languages` | `require_super_admin` | `store_features.py` |

### <a id="apisubscriptioncenter"></a>`/api/subscription-center` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/subscription-center` | `require_admin` | `subscription_service.py` |

### <a id="apiadminsystem"></a>`/api/admin/system` — 1 routes

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/api/admin/system/health` | `require_admin` | `system_health.py` |
