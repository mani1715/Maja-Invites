import React from 'react';
import PublicChrome from '@/components/PublicChrome';
import { Features } from '@/components/landing/LandingSections';

export default function FeaturesPage() {
  return (
    <PublicChrome
      title="Features — Invitations, Guest Tools & Photographer Platform | MAJA Invites"
      description="A complete list of what MAJA does: designed invitation links, RSVP and live guest galleries, WhatsApp/email/SMS delivery, digital shagun, and a full photographer platform with portfolios, storage and community."
    >
      {/* A plain list of what the platform does — each feature with a short line
          on how it helps. No prices or packs here; pricing lives on the Plans page. */}
      <Features />
    </PublicChrome>
  );
}
