import React from 'react';
import PublicChrome from '@/components/PublicChrome';
import { Pricing } from '@/components/landing/LandingSections';

export default function PlansPage() {
  return (
    <PublicChrome
      title="Plans & Pricing — MAJA Wedding Invitations"
      description="Simple one-time ₹ pricing for luxury interactive wedding invitations. Pick a package, pay once, and our studio builds it for you. No credits, no subscriptions."
    >
      <Pricing />
    </PublicChrome>
  );
}
