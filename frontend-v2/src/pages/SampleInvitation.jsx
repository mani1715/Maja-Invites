import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import useSeo from '@/lib/useSeo';
import { GuestInvitationReady } from '@/pages/GuestInvitation';
import { INVITE_THEMES, INVITE_THEME_IDS, resolveInviteTheme } from '@/lib/inviteThemes';
import { sampleInviteEnv, CATEGORY_SAMPLES } from '@/lib/sampleInvite';
import './SampleInvitation.css';

/**
 * A live sample invitation — the thing a buyer wants to see before paying.
 *
 * `/preview/luxe` and `/preview/celebration/:category` used to render a full
 * sample invitation in the legacy app. In frontend-v2 both were
 * `<Navigate to="/browse" />`, so the only way to find out what a design
 * actually looks like as an invitation was to buy it and publish one.
 *
 * This does NOT re-implement the invitation. It renders `GuestInvitationReady`
 * — the exact component `/invite/:slug` renders — with a sample payload shaped
 * like `/api/invite/{slug}/full`. That is deliberate: a preview built from its
 * own markup drifts from the real page the moment either changes, and then it
 * is worse than no preview, because it makes a promise the product does not
 * keep. Everything a visitor sees here is what a guest will see.
 *
 * `preview` is threaded into the renderer so the forms stay visible and
 * interactive-looking but never post: no RSVP, no blessing and no shagun
 * payment can be filed against a slug that belongs to nobody.
 */
export default function SampleInvitation() {
  const { category } = useParams();
  const [params, setParams] = useSearchParams();

  // ?theme= picks the palette. For a celebration category the sample content
  // changes too (a first birthday is not a wedding), which is the whole reason
  // the legacy app had a separate celebration preview.
  const themeId = params.get('theme') || 'royal_mughal';
  const theme = resolveInviteTheme(themeId);

  // `?embed=1` — this page inside a frame on another page (the home-page
  // showcase, the preview modal). The host supplies the title, the theme
  // choice and the calls to action, so rendering our own would duplicate them
  // and leave a "← All designs" link that navigates INSIDE the frame.
  const embed = params.get('embed') === '1';
  const env = useMemo(
    () => sampleInviteEnv({ themeId: theme.id, category }),
    [theme.id, category],
  );

  const catLabel = CATEGORY_SAMPLES[category]?.label;
  useSeo({
    title: catLabel
      ? `${catLabel} invitation preview · ${theme.name} — MAJA Invites`
      : `Live invitation preview · ${theme.name} — MAJA Invites`,
    description: `See a complete ${theme.name} invitation exactly as your guests will:`
      + ' hero, story, ceremonies, RSVP and blessings.',
    // A sample is not a page Google should rank against real invitations.
    noindex: true,
  });

  return (
    <div className={embed ? 'smp-wrap smp-wrap--embed' : 'smp-wrap'}>
      {!embed && (
      <div className="smp-bar">
        <div className="smp-bar-left">
          <Link to="/browse" className="smp-back" data-mj-link>&larr; All designs</Link>
          <span className="smp-tag">Live preview</span>
        </div>

        <label className="smp-picker">
          <span className="smp-picker-label">Theme</span>
          <select
            value={theme.id}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.set('theme', e.target.value);
              setParams(next, { replace: true });
            }}
          >
            {INVITE_THEME_IDS.map((id) => (
              <option key={id} value={id}>{INVITE_THEMES[id].name}</option>
            ))}
          </select>
        </label>
      </div>
      )}

      {!embed && (
      <p className="smp-note">
        {catLabel ? `A sample ${catLabel.toLowerCase()} invitation` : 'A sample wedding invitation'}
        {' '}in <strong>{theme.name}</strong> — {theme.culture}. Everything below is the real
        invitation page with sample names and dates; nothing you type here is saved.
      </p>
      )}

      <div className="smp-frame">
        <GuestInvitationReady
          slug={null}
          env={env}
          preview
          gateOpen={false}
          needsPasscode={false}
          decorPasscode=""
          decorError={false}
          onBreakSeal={() => {}}
          onPasscodeChange={() => {}}
          onUnlock={() => {}}
        />
      </div>

      {!embed && (
      <div className="smp-cta">
        <p className="smp-cta-copy">
          Like this one? Pick the design you want and we build your invitation for you.
        </p>
        <Link to={`/browse?theme=${theme.id}`} className="mj-btn-primary">
          See {theme.name} designs
        </Link>
      </div>
      )}
    </div>
  );
}
