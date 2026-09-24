/**
 * EventsDashboard.jsx — MAJA Dynamic Event Engine: the events list + create (Doc 06).
 * ===================================================================================
 *
 * Lists the signed-in owner's events and starts a new one from any registered
 * event type. Event-type-agnostic (reads the registry). When the module flag is
 * OFF every event endpoint 404s — this page treats that as a friendly
 * "module unavailable" empty state rather than an error (Doc 06 §Error Handling).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Archive, Trash2, Plus } from 'lucide-react';
import { EventService } from '../services/eventApi';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { ConfirmDialog, EmptyState } from '../components/builder/ConfirmDialog';
import LoadingFallback from '../components/LoadingFallback';

const STATUS_LABEL = {
  draft: 'Draft', incomplete: 'Incomplete', ready_for_review: 'Ready',
  published: 'Published', live: 'Live', completed: 'Completed', archived: 'Archived',
};

export default function EventsDashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null);   // {title, description, confirmLabel, danger, action}
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, reg] = await Promise.all([EventService.list(), EventService.listTypes()]);
      setEvents(list.events || []);
      setTypes(reg.event_types || []);
    } catch (e) {
      if (e?.response?.status === 404) setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runConfirmed = async () => {
    if (!confirm?.action) return;
    setBusy(true);
    try {
      await confirm.action();
      await load();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const askArchive = (e, ev) => {
    e.stopPropagation();
    setConfirm({
      title: 'Archive this event?',
      description: 'It will be taken offline and become read-only. You can restore it later.',
      confirmLabel: 'Archive', danger: false,
      action: () => EventService.archive(ev.event_id),
    });
  };

  const askDelete = (e, ev) => {
    e.stopPropagation();
    setConfirm({
      title: 'Move this event to Trash?',
      description: 'It will be removed from your list. It can be recovered during the retention period.',
      confirmLabel: 'Delete', danger: true,
      action: () => EventService.remove(ev.event_id),
    });
  };

  const create = async (eventType) => {
    setCreating(true);
    try {
      const res = await EventService.create(eventType);
      navigate(`/events/${res.event_id}/builder`);
    } catch (_) {
      setCreating(false);
    }
  };

  if (loading) return <LoadingFallback variant="page" />;

  if (unavailable) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-lg font-medium">Event invitations are coming soon</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This module isn't enabled on your account yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Helmet><title>Events · MAJA</title></Helmet>
      <h1 className="mb-6 text-2xl font-semibold">Your events</h1>

      <div className="mb-8 flex flex-wrap gap-2">
        {types.map((t) => (
          <Button key={t.event_type} onClick={() => create(t.event_type)} disabled={creating} size="sm">
            + New {t.name}
          </Button>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No events yet"
          hint="Create your first event invitation to start building — pick a type above."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => (
            <Card key={e.event_id} className="group cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => navigate(`/events/${e.event_id}/builder`)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{e.title || 'Untitled event'}</CardTitle>
                    <CardDescription className="text-xs uppercase tracking-wide">
                      {STATUS_LABEL[e.status] || e.status}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {e.status !== 'archived' && (
                      <button type="button" aria-label="Archive event" onClick={(ev) => askArchive(ev, e)}
                              className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                    <button type="button" aria-label="Delete event" onClick={(ev) => askDelete(ev, e)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {e.publish_slug ? <span className="font-mono">/invite/{e.publish_slug}</span> : 'Not published'}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.title || ''}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        loading={busy}
        onConfirm={runConfirmed}
      />
    </div>
  );
}
