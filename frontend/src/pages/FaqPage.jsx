import React from 'react';
import PublicChrome from '@/components/PublicChrome';
import { FAQSection } from '@/components/landing/LandingSections';

export default function FaqPage() {
  return (
    <PublicChrome
      title="FAQ — Invitations, Galleries, Pricing & Photographer Plans | MAJA Invites"
      description="Answers on how MAJA's done-for-you invitations, live guest galleries, one-time pricing, UPI shagun, and photographer portfolio plans work."
    >
      <FAQSection />
    </PublicChrome>
  );
}
