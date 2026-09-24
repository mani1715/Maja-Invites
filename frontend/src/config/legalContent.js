/**
 * legalContent.js — single source of truth for all legal / policy page copy.
 *
 * ⚠️ DRAFT BOILERPLATE. Every document below is generic India-SaaS starter text.
 * Have a lawyer review and finalise before public launch. Edit the BUSINESS
 * facts in ONE place (the `BUSINESS` object) and they flow into every page.
 *
 * Used by: src/pages/LegalPage.jsx (routes /terms /privacy /refund /contact).
 */

// ---------------------------------------------------------------------------
// EDIT THESE — your real business details (used across every policy page).
// ---------------------------------------------------------------------------
export const BUSINESS = {
  name: 'MAJA Invites',
  legalName: 'MAJA Invites',          // TODO: registered legal entity name
  email: 'support@majacreations.com',   // TODO: real support email
  phone: '',                            // TODO: support phone (optional)
  gstin: '',                            // TODO: GSTIN (required for GST invoices)
  address: 'India',                     // TODO: registered business address
  jurisdiction: 'India',                // TODO: city/state for dispute jurisdiction
  effectiveDate: '13 June 2026',        // TODO: update on each revision
  website: 'https://majacreations.com', // TODO: production URL
};

const B = BUSINESS;

// ---------------------------------------------------------------------------
// Documents. Each: { key, title, intro?, sections: [{ heading, body[] }] }
// `body` is an array of paragraph strings. Keep plain text (no HTML).
// ---------------------------------------------------------------------------
export const LEGAL_DOCS = {
  terms: {
    key: 'terms',
    title: 'Terms of Service',
    intro: `These Terms govern your use of ${B.name} ("we", "us"), a digital invitation and event photo-sharing platform. By creating an account or using the service you agree to these Terms.`,
    sections: [
      { heading: '1. The Service', body: [
        `${B.name} is a done-for-you digital invitation and celebration platform. Users choose a design and share their details, and our team builds and delivers a shareable invitation with tools such as RSVP, a wishes wall, a live photo gallery, QR check-in, multi-language and digital shagun (UPI gifting). ${B.name} also provides photographers and studios with a portfolio website, a photographer directory, cloud storage, a scoped client portal and a community. Guests need no app or account to open an invitation.`,
        'At an event, guests can add their own photos to a shared live gallery, and can request their photos by uploading a selfie and contact details, which the studio uses to identify and share the matching photos with them.',
      ]},
      { heading: '2. Accounts', body: [
        'You are responsible for the accuracy of the information you provide and for keeping your login credentials secure. You must be legally capable of entering into a contract to use paid features.',
        'We may suspend or terminate accounts that violate these Terms, abuse the platform, or attempt to defraud the payment system.',
      ]},
      { heading: '3. Plans & Payments', body: [
        'Paid features are provided through one-time purchases (such as a done-for-you invitation and optional add-ons) and, for photographers, subscription plans billed per cycle. Payments are processed by our payment processor (Razorpay). Prices are shown before purchase and are inclusive of applicable taxes unless stated otherwise.',
        'Subscriptions renew for the cycle you choose until cancelled; you can cancel future renewals from your account at any time. Refunds are governed by our Refund & Cancellation Policy.',
      ]},
      { heading: '4. User Content', body: [
        'You retain ownership of the photos, names, and other content you upload. You grant us a limited licence to host, process, and display that content solely to operate the service for you and your invited guests.',
        'You must have the rights and consents necessary for any content and personal data (including guest photos and faces) you upload. You must not upload unlawful, infringing, or harmful content.',
      ]},
      { heading: '5. Photographers & Guests', body: [
        'Photographers/studios are independent users. We provide the tooling to share galleries with guests; we are not a party to any separate agreement between a photographer and their client.',
        'Guest photo requests collect a selfie and contact details, shared only with the studio to deliver photos. See the Privacy Policy.',
      ]},
      { heading: '6. Acceptable Use', body: [
        'Do not scrape, attack, reverse-engineer, or overload the platform; do not bypass or abuse the payment system; do not use the service to send spam or violate others’ rights.',
      ]},
      { heading: '7. Availability & Changes', body: [
        'We aim for high availability but do not guarantee uninterrupted service. We may update features and these Terms; material changes will be notified on this page with a new effective date.',
      ]},
      { heading: '8. Liability', body: [
        `To the maximum extent permitted by law, ${B.name} is not liable for indirect or consequential losses. Our total liability for any claim is limited to the amount you paid us in the 3 months preceding the claim.`,
      ]},
      { heading: '9. Governing Law', body: [
        `These Terms are governed by the laws of India. Disputes are subject to the courts of ${B.jurisdiction}.`,
      ]},
      { heading: '10. Contact', body: [
        `Questions about these Terms: ${B.email}.`,
      ]},
    ],
  },

  privacy: {
    key: 'privacy',
    title: 'Privacy Policy',
    intro: `This Policy explains how ${B.name} collects, uses, and protects personal data, in line with India’s Digital Personal Data Protection Act, 2023 (DPDP). By using the service you consent to this Policy.`,
    sections: [
      { heading: '1. Data We Collect', body: [
        'Account data: name, email, phone, and login identifiers (via Supabase auth).',
        'Invitation data: event details, photos, guest lists, RSVPs, wishes, and messages you add.',
        'Payment data: processed by Razorpay; we store payment status and invoice records, not your full card details.',
        'Usage data: device, approximate location (IP-based), and analytics about how invitations are viewed.',
        'Photo-request data: when a guest requests their photos, the selfie and contact details (email, WhatsApp) they submit are stored and shared with the relevant studio solely to identify and deliver their photos.',
      ]},
      { heading: '2. How We Use Data', body: [
        'To provide the service: build and display invitations, match guest photos (with consent), process payments, and support your account.',
        'To improve and secure the platform, prevent abuse, and meet legal obligations.',
      ]},
      { heading: '3. Face Recognition & Consent', body: [
        'Photo requests are optional and guest-initiated. A guest chooses to upload a selfie and contact details to receive their photos; this information is used only to match and deliver their photos and is deleted on request or when the gallery/account is deleted.',
      ]},
      { heading: '4. Sharing', body: [
        'We share data with processors who help us run the service: Razorpay (payments), Supabase (auth), AWS (storage and image processing), Google (optional Drive backup if you connect it), and AI providers for optional content generation. We do not sell personal data.',
      ]},
      { heading: '5. Retention', body: [
        'We keep data while your account/invitation is active and as required for legal and accounting purposes. You can request deletion at any time (see Your Rights).',
      ]},
      { heading: '6. Your Rights (DPDP)', body: [
        'You can access and export your data, correct it, withdraw consent, and request deletion. Use the “Download my data” and “Delete my account” tools in your profile, or email us.',
        `Grievance / Data Protection contact: ${B.email}.`,
      ]},
      { heading: '7. Security', body: [
        'We use industry-standard measures (encrypted transport, access controls, signed media URLs). No method is perfectly secure, but we work to protect your data.',
      ]},
      { heading: '8. Children', body: [
        'The service is not directed at children. We do not knowingly collect data from children without appropriate consent.',
      ]},
      { heading: '9. Changes', body: [
        'We may update this Policy; the effective date below reflects the latest version.',
      ]},
    ],
  },

  refund: {
    key: 'refund',
    title: 'Refund & Cancellation Policy',
    intro: `This Policy explains refunds and cancellations for purchases on ${B.name}.`,
    sections: [
      { heading: '1. Done-for-you invitations & add-ons', body: [
        'An invitation is custom-built for you and delivered as a digital service. If you cancel before we begin building, you may request a full refund.',
        'Once we have started building your invitation or delivered the link, charges for that invitation and any add-ons are generally non-refundable, because the service has been performed.',
      ]},
      { heading: '2. Photographer subscription plans', body: [
        'Photographer plans are billed per cycle (for example, monthly or yearly). You can cancel future renewals at any time from your account; cancellation stops the next renewal and you keep access until the current cycle ends.',
        'A partly-used billing cycle is generally non-refundable once the cycle has begun.',
      ]},
      { heading: '3. Failed or Duplicate Payments', body: [
        'If you are charged but your plan or order is not delivered, or you are charged twice for the same order, we will refund the affected amount in full after verification.',
      ]},
      { heading: '4. How to Request', body: [
        `Email ${B.email} with your registered email and the payment/order ID. We respond within 3 business days.`,
      ]},
      { heading: '5. How Refunds Are Issued', body: [
        'Approved refunds are returned to the original payment method via Razorpay, typically within 5–7 business days depending on your bank.',
      ]},
      { heading: '6. Discretion', body: [
        'We may make goodwill exceptions at our discretion. This Policy does not limit rights you have under applicable law.',
      ]},
    ],
  },

  contact: {
    key: 'contact',
    title: 'Contact Us',
    intro: `We’re here to help. Reach ${B.name} using the details below.`,
    sections: [
      { heading: 'Support email', body: [B.email] },
      { heading: 'Phone', body: [B.phone || 'Add a support phone number in legalContent.js'] },
      { heading: 'Business address', body: [B.address] },
      { heading: 'Grievance / Data Protection', body: [
        `For privacy or data requests, email ${B.email} with the subject “Data Request”.`,
      ]},
      { heading: 'Response time', body: ['We aim to respond within 3 business days.'] },
    ],
  },

  cookies: {
    key: 'cookies',
    title: 'Cookie Policy',
    intro: `This Policy explains how ${B.name} uses cookies and similar technologies, and the choices you have. You can change your choice any time from the cookie banner or your browser settings.`,
    sections: [
      { heading: '1. What cookies are', body: [
        'Cookies are small files stored on your device. Similar technologies include local storage and pixels. We group them by purpose below.',
      ]},
      { heading: '2. Strictly necessary (always on)', body: [
        'Required for the site to work: sign-in sessions, security (CSRF), load balancing, and remembering your cookie choice. These cannot be switched off, and we do not need consent for them.',
      ]},
      { heading: '3. Analytics (optional — off until you allow)', body: [
        'Help us understand how invitations and pages are used so we can improve them. These are set only if you accept analytics in the cookie banner.',
      ]},
      { heading: '4. Marketing (optional — off until you allow)', body: [
        'Used to measure and improve campaigns. Off by default; set only if you accept marketing in the banner.',
      ]},
      { heading: '5. Your choices', body: [
        'Use the cookie banner to accept all, reject non-essential, or choose per category. You can also clear or block cookies in your browser. Rejecting optional cookies does not affect your ability to use the service.',
        `Questions: ${B.email}.`,
      ]},
    ],
  },

  retention: {
    key: 'retention',
    title: 'Data Retention Policy',
    intro: `This Policy explains how long ${B.name} keeps different kinds of data and when it is deleted, in line with India's Digital Personal Data Protection Act, 2023 (DPDP).`,
    sections: [
      { heading: '1. Principle', body: [
        'We keep personal data only as long as needed for the purpose it was collected, to provide the service, and to meet legal, tax and accounting obligations — then we delete or anonymise it.',
      ]},
      { heading: '2. Account data', body: [
        'Kept while your account is active. When you delete your account, identifying data is anonymised and the account is soft-deleted; residual records required for law/accounting are retained only as long as required.',
      ]},
      { heading: '3. Invitation & guest data', body: [
        'Event details, RSVPs, wishes and guest lists are kept while the invitation is active and per your plan. You can delete an invitation, which removes its associated data on the normal purge cycle.',
      ]},
      { heading: '4. Photos & live galleries', body: [
        'Guest and gallery photos are stored under your account and governed by your plan and storage lifecycle. Deleted items move to a recycle window and are then purged; guest photo-request data (selfie/contact for face matching, when enabled) is deleted on request or when the gallery/account is deleted.',
      ]},
      { heading: '5. Payment records', body: [
        'Payment status and invoice records are retained as long as required by tax and accounting law; we do not store full card details (handled by Razorpay).',
      ]},
      { heading: '6. Logs & consent', body: [
        'Security, audit and consent records are kept for a limited period for safety, fraud-prevention and compliance, then rotated out.',
      ]},
      { heading: '7. Your rights', body: [
        'You can export or delete your data at any time from your profile, or by emailing us. See the Privacy Policy for the full list of DPDP rights.',
        `Grievance / Data Protection contact: ${B.email}.`,
      ]},
    ],
  },
};

export default LEGAL_DOCS;
