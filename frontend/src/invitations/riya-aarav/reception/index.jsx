import React from 'react';
import { ScrollSection, PhotoMarquee, RSVPForm, WishForm, tokens, fluid, mediaUrl } from '@/invitations/kit';

/**
 * Riya & Aarav — reception.  Request MAJA-TEST01.
 * SCAFFOLD — hand this file to Claude with INVITATION_AUTHORING.md to design.
 */
export default function Invitation({ data }) {
  return (
    <main data-testid="inv-riya-aarav-reception">
      <section className="min-h-screen flex items-center justify-center px-6 text-center">
        <h1 className="font-display" style={{ color: tokens.ivory, fontSize: fluid(2.6, 10, 12, 4.4) }}>
          {data.bride} &amp; {data.groom}
        </h1>
      </section>

      <PhotoMarquee
        photos={(data.gallery || []).map((p) => ({ ...p, url: mediaUrl(p.url) }))}
        title={`${data.bride} & ${data.groom}`}
      />

      {data.slug && (
        <>
          <ScrollSection className="px-6 py-16 max-w-2xl mx-auto"><RSVPForm slug={data.slug} /></ScrollSection>
          <ScrollSection className="px-6 py-16 max-w-2xl mx-auto"><WishForm slug={data.slug} /></ScrollSection>
        </>
      )}
    </main>
  );
}
