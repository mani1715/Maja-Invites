import { useEffect, useState } from 'react';
import StudioModule, {
  Panel, Toast, InlineError, useFlash,
} from '@/components/StudioModule';
import { useAsync, Loading, ErrorPanel } from '@/components/AdminModule';
import * as api from '@/api/studioOps';

// How this studio appears in the public photographer directory.
//
// Two endpoints with no screen, so a studio could not choose whether to be
// listed, describe itself, or say which cities it covers — the directory was
// showing whatever happened to be in the database.
//
// `available_now` is the part most worth getting right in the copy. The server
// stores a timestamp and treats the studio as available only for
// AVAILABILITY_TTL_MIN (2 hours); after that _is_available() returns false on
// its own. It is a "I'm free today" flag, not a setting. A toggle that quietly
// lapses is exactly the kind of thing that makes someone think they are
// advertised when they are not, so the page states the two hours plainly.

const AVAILABILITY_HOURS = 2;

export default function StudioDirectory() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ directory_listed: true, bio: '', service_cities: '', starting_price: '' });

  const { data, error, loading, reload } = useAsync(() => api.directoryProfile().then((r) => r.data));

  useEffect(() => {
    if (!data) return;
    setF({
      directory_listed: !!data.directory_listed,
      bio: data.bio || '',
      service_cities: (data.service_cities || []).join(', '),
      starting_price: data.starting_price ?? '',
    });
  }, [data]);

  const save = async () => {
    setBusy('save');
    setErr(null);
    try {
      await api.saveDirectoryProfile({
        directory_listed: f.directory_listed,
        bio: f.bio.trim(),
        service_cities: f.service_cities.split(',').map((c) => c.trim()).filter(Boolean),
        // Not editable here — sending [] would wipe what the portfolio set.
        portfolio_images: data?.portfolio_images || [],
        portfolio_videos: data?.portfolio_videos || [],
        starting_price: f.starting_price === '' ? null : Number(f.starting_price),
      });
      flash('Saved.');
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not save.');
    } finally { setBusy(null); }
  };

  const toggleAvailable = async () => {
    setBusy('avail');
    setErr(null);
    try {
      await api.setAvailability(!data?.available_now);
      flash(data?.available_now ? 'Marked unavailable.' : `Marked available for the next ${AVAILABILITY_HOURS} hours.`);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not change that.');
    } finally { setBusy(null); }
  };

  return (
    <StudioModule
      active="Directory listing"
      title="Directory listing"
      sub="How couples find you on MAJA — your entry in the public photographer directory."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <InlineError message={err} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel
            title="Available right now"
            sub={`This lapses by itself after ${AVAILABILITY_HOURS} hours. It says “I can take work today”, not “I am always free” — turn it on again when you are.`}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`wmod-pill wmod-pill--${data?.available_now ? 'yes' : 'neutral'}`}>
                {data?.available_now ? 'Showing as available' : 'Not showing as available'}
              </span>
              <button
                type="button"
                className={`wmod-btn wmod-btn--sm ${data?.available_now ? 'wmod-btn--ghost' : 'wmod-btn--primary'}`}
                disabled={busy === 'avail'}
                onClick={toggleAvailable}
              >
                {busy === 'avail' ? 'Saving…' : data?.available_now ? 'Turn off' : `Available for ${AVAILABILITY_HOURS} hours`}
              </button>
            </div>
          </Panel>

          <Panel title="Your listing">
            <label className="wmod-check" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18 }}>
              <input
                type="checkbox"
                checked={f.directory_listed}
                onChange={(e) => setF((p) => ({ ...p, directory_listed: e.target.checked }))}
              />
              <span>
                List my studio in the public directory
                <br />
                <span className="wmod-hint">
                  Unticking this removes you from search and the discovery pages.
                  Your portfolio link keeps working for anyone who already has it.
                </span>
              </span>
            </label>

            <div className="wmod-grid">
              <div className="wmod-field wmod-field--wide">
                <label className="wmod-label" htmlFor="dl-bio">About your studio</label>
                <textarea
                  id="dl-bio"
                  data-mj-field
                  className="wmod-input"
                  rows={4}
                  value={f.bio}
                  onChange={(e) => setF((p) => ({ ...p, bio: e.target.value }))}
                  placeholder="What you shoot, how you work, what a couple can expect."
                />
              </div>
              <div className="wmod-field wmod-field--wide">
                <label className="wmod-label" htmlFor="dl-cities">Cities you cover</label>
                <input
                  id="dl-cities"
                  data-mj-field
                  className="wmod-input"
                  value={f.service_cities}
                  onChange={(e) => setF((p) => ({ ...p, service_cities: e.target.value }))}
                  placeholder="Hyderabad, Vijayawada, Bengaluru"
                />
                <p className="wmod-hint">
                  Comma separated. The first one is used as your primary city in
                  search results.
                </p>
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="dl-price">Packages start at (₹)</label>
                <input
                  id="dl-price"
                  data-mj-field
                  className="wmod-input"
                  type="number"
                  min="0"
                  value={f.starting_price}
                  onChange={(e) => setF((p) => ({ ...p, starting_price: e.target.value }))}
                />
                <p className="wmod-hint">Leave blank to show no price.</p>
              </div>
            </div>

            <button type="button" className="wmod-btn wmod-btn--primary" style={{ marginTop: 16 }} disabled={busy === 'save'} onClick={save}>
              {busy === 'save' ? 'Saving…' : 'Save listing'}
            </button>
          </Panel>
        </>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
