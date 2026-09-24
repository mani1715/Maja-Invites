function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

// WatchLiveSection — save-the-date video (`celebrant_info.video_link`, gated
// on sections_enabled.video) and the live stream link (`live_stream`, gated
// on sections_enabled.live_stream). Two independent blocks in one section so
// either can no-op without leaving a lopsided layout.
export default function WatchLiveSection({ invite, sections }) {
  const videoLink = sections.video ? invite.celebrant_info?.video_link : null;
  const stream = sections.live_stream ? invite.live_stream : null;
  const hasStream = !!(stream?.enabled && stream?.url);
  if (!videoLink && !hasStream) return null;

  const streamYtId = hasStream && stream.embed_enabled !== false ? youtubeId(stream.url) : null;
  const videoYtId = youtubeId(videoLink);

  return (
    <section className="gi-section gi-section--wide">
      <div className="gi-watch-grid" data-mj-stagger>
        {videoLink && (
          <div className="gi-watch-block" data-reveal="l">
            <p className="gi-eyebrow gi-watch-eyebrow">Save the date</p>
            {videoYtId ? (
              <div className="gi-prewed-embed">
                <iframe
                  title="Save the date"
                  src={`https://www.youtube.com/embed/${videoYtId}?rel=0`}
                  loading="lazy"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            ) : (
              <a className="mj-btn-primary" href={videoLink} target="_blank" rel="noreferrer">Watch our story</a>
            )}
          </div>
        )}
        {hasStream && (
          <div className="gi-watch-block" data-reveal="r">
            <p className="gi-eyebrow gi-watch-eyebrow">Live stream</p>
            {stream.message && <p className="gi-split-body gi-watch-message">{stream.message}</p>}
            {streamYtId ? (
              <div className="gi-prewed-embed">
                <iframe
                  title="Live stream"
                  src={`https://www.youtube.com/embed/${streamYtId}?rel=0`}
                  loading="lazy"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            ) : (
              <a className="mj-btn-primary" href={stream.url} target="_blank" rel="noreferrer">
                Watch {stream.platform ? `on ${stream.platform}` : 'live'}
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
