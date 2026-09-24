import { useState } from 'react';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, shortDate,
} from '@/components/StudioModule';
import * as studioOps from '@/api/studioOps';

export default function StudioNotifications() {
  const [filter, setFilter] = useState('all');
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(() =>
    studioOps.studioNotifications().then((r) => r.data).catch(() => ({ notifications: [], unread_count: 0 }))
  );

  const notifications = data?.notifications || [];
  const unreadCount = data?.unread_count || notifications.filter(n => !n.is_read).length;

  const handleMarkRead = async (id) => {
    try {
      await studioOps.markNotificationRead(id);
      flash('Marked as read');
      reload();
    } catch {
      flash('Action failed');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await studioOps.markAllNotificationsRead();
      flash('All notifications marked as read');
      reload();
    } catch {
      flash('Action failed');
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read;
    return true;
  });

  return (
    <StudioModule
      active="Notifications"
      title="Studio Notifications Hub"
      sub="Activity alerts, client photo selection updates, gallery expiration notices, and system announcements."
      actions={
        <div style={{ display: 'flex', gap: 10 }}>
          {unreadCount > 0 && (
            <button
              type="button"
              className="wmod-btn wmod-btn--primary wmod-btn--sm"
              onClick={handleMarkAllRead}
            >
              Mark All Read
            </button>
          )}
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>
            Refresh
          </button>
        </div>
      }
    >
      <StatRow
        items={[
          { label: 'Unread Notifications', value: loading ? '—' : unreadCount },
          { label: 'Total Alerts', value: loading ? '—' : notifications.length },
          { label: 'System Status', value: 'Normal' },
        ]}
      />

      <Segmented
        ariaLabel="Notification filters"
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: 'All Notifications', count: notifications.length },
          { id: 'unread', label: 'Unread Only', count: unreadCount },
        ]}
      />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <Panel title="Notifications" pad={false}>
          {filtered.length === 0 ? (
            <Empty
              title="No notifications"
              body="You have no notifications in this view."
            />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Message</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((n) => (
                    <tr key={n.id} style={{ background: n.is_read ? 'transparent' : 'var(--mj-section)' }}>
                      <td>
                        <span className="wmod-pill wmod-pill--yes">{n.type || n.category || 'Alert'}</span>
                      </td>
                      <td style={{ fontWeight: n.is_read ? 400 : 600 }}>{n.title || n.message}</td>
                      <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(n.created_at)}</td>
                      <td>
                        {n.is_read ? (
                          <span className="wmod-td-muted">Read</span>
                        ) : (
                          <span style={{ color: 'var(--mj-primary)', fontWeight: 600 }}>New</span>
                        )}
                      </td>
                      <td className="wmod-td-actions">
                        {!n.is_read && (
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                            onClick={() => handleMarkRead(n.id)}
                          >
                            Mark Read
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
