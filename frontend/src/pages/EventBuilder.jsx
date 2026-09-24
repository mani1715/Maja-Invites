/**
 * EventBuilder.jsx — MAJA Dynamic Event Engine: the Builder page (Doc 06).
 * ========================================================================
 *
 * Orchestrates the event-type-agnostic Builder: loads the event + its registry
 * config + child-collection metadata, drives debounced autosave (changed section
 * only, with one retry and a live status — Doc 06 §Autosave), refreshes
 * cross-document validation, and publishes. All UI is the reusable BuilderShell;
 * this page knows nothing Ganesh-specific — it reads everything from the registry.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { EventService } from '../services/eventApi';
import {
  BuilderSidebar, BuilderProgress, AutosaveIndicator, DraftBanner,
  NavigationButtons, PublishPanel, SectionForm, ChildCollectionManager,
} from '../components/builder/BuilderShell';
import { ConfirmDialog } from '../components/builder/ConfirmDialog';
import { EventLivePreview } from '../components/builder/EventInvitationCard';
import { EventGalleryUploader } from '../components/builder/EventGalleryUploader';
import GaneshDayScheduleEditor from '../components/builder/GaneshDayScheduleEditor';
import MoneyMembersPanel from '../components/builder/MoneyMembersPanel';
import FeatureRequestPanel from '../components/builder/FeatureRequestPanel';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import LoadingFallback from '../components/LoadingFallback';

// map a validate() error string back to the section it belongs to (best-effort,
// by the section-title prefix the backend emits — keeps the sidebar honest).
const ERROR_PREFIX = {
  event_information: 'event information',
  venue_details: 'venue details',
  organizer_information: 'organizer information',
};

export default function EventBuilder() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [config, setConfig] = useState(null);
  const [meta, setMeta] = useState({});
  const [activeKey, setActiveKey] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [errors, setErrors] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const timer = useRef();

  // ---- load -------------------------------------------------------------- //
  const refreshValidation = useCallback(async () => {
    try {
      const res = await EventService.validate(eventId);
      setErrors(res.errors || []);
    } catch (_) { /* non-fatal */ }
  }, [eventId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ev = await EventService.get(eventId);
        const [cfg, m] = await Promise.all([
          EventService.getConfig(ev.event_type),
          EventService.childCollectionsMeta().catch(() => ({})),
        ]);
        if (!alive) return;
        setEvent(ev);
        setConfig(cfg);
        setMeta(m || {});
        setActiveKey((cfg.sections || [])[0]?.key || null);
        await refreshValidation();
      } catch (e) {
        if (!alive) return;
        setLoadError(
          e?.response?.status === 404
            ? 'This event was not found, or the event module is not enabled.'
            : 'Could not load this event.',
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [eventId, refreshValidation]);

  // ---- autosave (debounced, changed section only, one retry) ------------- //
  const handleChange = useCallback((sectionKey, values) => {
    setSaveStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const patch = { [sectionKey]: values };
      try {
        await EventService.autosave(eventId, patch);
        setSaveStatus('saved');
      } catch (_) {
        try {
          await EventService.autosave(eventId, patch);
          setSaveStatus('saved');
        } catch (e2) {
          setSaveStatus('error');
          return;
        }
      }
      refreshValidation();
    }, 700);
  }, [eventId, refreshValidation]);

  const doPublish = async () => {
    setPublishing(true);
    try {
      const res = await EventService.publish(eventId);
      setPublishResult(res);
      const ev = await EventService.get(eventId);
      setEvent(ev);
      setConfirmPublish(false);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 422 && detail?.errors) setErrors(detail.errors);
      else if (e?.response?.status === 402) {
        setPublishResult({ needsPaidEdit: true, message: detail?.message || 'Extra edit required.' });
      }
      setConfirmPublish(false);
    } finally { setPublishing(false); }
  };

  if (loading) return <LoadingFallback variant="page" />;
  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="text-lg font-medium">{loadError}</p>
        <button onClick={() => navigate('/events')} className="mt-4 text-sm text-primary underline">
          Back to events
        </button>
      </div>
    );
  }

  const sections = config.sections || [];
  const active = sections.find((s) => s.key === activeKey) || sections[0];
  const activeIndex = sections.findIndex((s) => s.key === active?.key);

  // sidebar status: sections with required fields go red until validation clears
  const statusMap = {};
  sections.forEach((s) => {
    const prefix = ERROR_PREFIX[s.key];
    if (prefix) {
      statusMap[s.key] = errors.some((e) => e.toLowerCase().startsWith(prefix)) ? 'incomplete' : 'complete';
    } else {
      statusMap[s.key] = 'neutral';
    }
  });
  const requiredSections = Object.values(ERROR_PREFIX).length;
  const completedRequired = sections.filter(
    (s) => ERROR_PREFIX[s.key] && statusMap[s.key] === 'complete',
  ).length;

  const isSystem = active?.store === 'system';
  const isCollection = (active?.store || '').startsWith('collection:');
  const collectionName = isCollection ? active.store.split(':')[1] : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Helmet><title>{event.title || 'Untitled event'} · Builder · MAJA</title></Helmet>

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{event.title || 'Untitled event'}</h1>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {config.name} · {event.status}
          </p>
        </div>
        <AutosaveIndicator status={saveStatus} />
      </header>

      <DraftBanner status={event.status} />

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <aside className="space-y-4">
          <BuilderProgress completed={completedRequired} total={requiredSections} />
          <BuilderSidebar
            sections={sections}
            activeKey={active?.key}
            statusMap={statusMap}
            onSelect={setActiveKey}
          />
        </aside>

        <main>
          <Card>
            <CardHeader>
              <CardTitle>{active?.title}</CardTitle>
              {active?.translatable && <CardDescription>Translatable section</CardDescription>}
            </CardHeader>
            <CardContent>
              {isSystem && active.key === 'publish' && (
                <PublishPanel
                  errors={errors}
                  onPublish={() => setConfirmPublish(true)}
                  publishing={publishing}
                  result={publishResult}
                />
              )}
              {isSystem && active.key === 'preview' && (
                <EventLivePreview event={event} />
              )}
              {isSystem && active.key !== 'publish' && active.key !== 'preview' && (
                <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  This step opens once the required sections are complete.
                </p>
              )}
              {!isSystem && isCollection && collectionName === 'gallery' && (
                <EventGalleryUploader eventId={eventId} />
              )}
              {!isSystem && isCollection && collectionName === 'festival_schedule' && (
                <GaneshDayScheduleEditor eventId={eventId} />
              )}
              {!isSystem && isCollection && collectionName !== 'gallery' && collectionName !== 'festival_schedule' && (
                <ChildCollectionManager
                  eventId={eventId}
                  collectionName={collectionName}
                  meta={meta[collectionName]}
                />
              )}
              {!isSystem && !isCollection && active && (
                <>
                  <SectionForm section={active} event={event} onChange={handleChange} />
                  {active.key === 'donation_config' && <MoneyMembersPanel eventId={eventId} />}
                </>
              )}
            </CardContent>
          </Card>

          <NavigationButtons
            index={activeIndex}
            total={sections.length}
            onPrev={() => setActiveKey(sections[Math.max(0, activeIndex - 1)].key)}
            onNext={() => setActiveKey(sections[Math.min(sections.length - 1, activeIndex + 1)].key)}
          />

          {/* Always reachable — before or after publishing — so a host who realises
              they need something extra can ask for it without leaving the builder. */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Request an extra feature</CardTitle>
              <CardDescription>Not in your plan? Ask and we’ll add it to this link.</CardDescription>
            </CardHeader>
            <CardContent>
              <FeatureRequestPanel event={event} />
            </CardContent>
          </Card>
        </main>
      </div>

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title={publishResult?.slug ? 'Re-publish this invitation?' : 'Publish this invitation?'}
        description={publishResult?.slug
          ? 'Your changes will go live immediately. A re-publish counts as one edit.'
          : 'Your invitation will go live and become publicly shareable.'}
        confirmLabel={publishResult?.slug ? 'Re-publish' : 'Publish'}
        loading={publishing}
        onConfirm={doPublish}
      />
    </div>
  );
}
