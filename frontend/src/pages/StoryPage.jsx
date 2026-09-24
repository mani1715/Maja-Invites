import React from 'react';
import PublicChrome from '@/components/PublicChrome';
import { Story } from '@/components/landing/LandingSections';

export default function StoryPage() {
  return (
    <PublicChrome
      title="Our Story — Why MAJA Invites Exists"
      description="MAJA takes the work out of inviting people and gives photographers a real platform around the events they capture — with clear, honest pricing and done-for-you invitations."
    >
      <Story />
    </PublicChrome>
  );
}
