import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, shortDate,
} from '@/components/StudioModule';
import { useAuth } from '@/context/AuthContext';
import * as weddingsApi from '@/api/weddings';
import * as customDesignApi from '@/api/customDesign';
import * as subsApi from '@/api/subscriptions';
import { loadCatalogue, themeLabel, ceremonyLabel, designName, designCode } from '@/lib/designCatalogue';
import CreateGalleryModal from '@/components/gallery/CreateGalleryModal';
import CommercialPlansModal from '@/components/gallery/CommercialPlansModal';
import GalleryWorkspaceModal from '@/components/gallery/GalleryWorkspaceModal';
import { listGalleries } from '@/api/gallery';
import './StudioInvitations.css';

/**
 * StudioInvitations:
 * Simplified 5-section navigation centered on photographer workflows:
 * 1. Dashboard (Overview, quick creation, subscription status, metrics, recent activity)
 * 2. Designs (188 templates, preview, filter, and plan-aware actions + "What's Included")
 * 3. My Invitations (Unified manager: All | Drafts | Active | Expired | Archived)
 * 4. Gallery (Standalone & event galleries, albums, independent expiry, AI add-on)
 * 5. Design Help & Custom Requests (Contextual assistance + bespoke quoted artwork)
 */

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'designs', label: 'Designs' },
  { id: 'my-invitations', label: 'My Invitations' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'custom', label: 'Design Help & Custom Requests' },
];

export default function StudioInvitations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { admin } = useAuth();
  const [toast, flash] = useFlash();

  // ---------------------------------------------------- URL & Navigation State
  const tabParam = searchParams.get('tab') || searchParams.get('section');
  const filterParam = searchParams.get('filter');

  // Resolve initial tab & legacy parameter mappings
  const resolvedTab = useMemo(() => {
    if (!tabParam || tabParam === 'dashboard') return 'dashboard';
    if (['drafts', 'active', 'archived', 'expired'].includes(tabParam)) return 'my-invitations';
    if (tabParam === 'features' || tabParam === 'designs') return 'designs';
    if (tabParam === 'gallery') return 'gallery';
    if (tabParam === 'custom' || tabParam === 'custom-requests') return 'custom';
    if (tabParam === 'my-invitations') return 'my-invitations';
    return 'dashboard';
  }, [tabParam]);

  // Resolve initial filter for My Invitations
  const resolvedFilter = useMemo(() => {
    if (filterParam && ['all', 'drafts', 'active', 'expired', 'archived'].includes(filterParam)) {
      return filterParam;
    }
    if (tabParam === 'drafts') return 'drafts';
    if (tabParam === 'active') return 'active';
    if (tabParam === 'archived') return 'archived';
    return 'all';
  }, [filterParam, tabParam]);

  const [currentTab, setCurrentTab] = useState(resolvedTab);
  const [myInvFilter, setMyInvFilter] = useState(resolvedFilter);
  const [whatsIncludedOpen, setWhatsIncludedOpen] = useState(tabParam === 'features');
  const [showCreateGalleryModal, setShowCreateGalleryModal] = useState(false);
  const [showCommercialPlansModal, setShowCommercialPlansModal] = useState(false);
  const [workspaceGalleryId, setWorkspaceGalleryId] = useState(null);
  const [standaloneGalleries, setStandaloneGalleries] = useState([]);
  const [galleriesLoading, setGalleriesLoading] = useState(false);

  const loadStandaloneGalleries = () => {
    setGalleriesLoading(true);
    listGalleries({ status: 'all' })
      .then((res) => {
        setStandaloneGalleries(res.data?.galleries || []);
        setGalleriesLoading(false);
      })
      .catch(() => setGalleriesLoading(false));
  };

  useEffect(() => {
    loadStandaloneGalleries();
  }, []);

  // Keep state synchronized with URL query params
  useEffect(() => {
    setCurrentTab(resolvedTab);
    setMyInvFilter(resolvedFilter);
    if (tabParam === 'features') {
      setWhatsIncludedOpen(true);
    }
  }, [resolvedTab, resolvedFilter, tabParam]);

  const changeTab = (newTab, extra = {}) => {
    setCurrentTab(newTab);
    const nextParams = { tab: newTab, ...extra };
    if (newTab === 'my-invitations' && !nextParams.filter) {
      nextParams.filter = myInvFilter;
    }
    setSearchParams(nextParams);
  };

  const changeFilter = (newFilter) => {
    setMyInvFilter(newFilter);
    setSearchParams({ tab: 'my-invitations', filter: newFilter });
  };

  // ---------------------------------------------------- Data Loaders
  // 1. Invitations / profiles list
  const {
    data: profilesData,
    loading: profilesLoading,
    error: profilesError,
    reload: reloadProfiles,
  } = useAsync(() => weddingsApi.listPaginated({ page_size: 100 }), []);

  // 2. Real Design Catalogue (all 188 templates)
  const [catalogue, setCatalogue] = useState([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueFilter, setCatalogueFilter] = useState({ ceremony: 'all', theme: 'all', search: '' });
  const [previewDesign, setPreviewDesign] = useState(null);

  useEffect(() => {
    let mounted = true;
    loadCatalogue()
      .then((items) => {
        if (mounted) {
          setCatalogue(items || []);
          setCatalogueLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setCatalogueLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  // 3. Studio Subscriptions (Authoritative backend status)
  const {
    data: subsMineData,
    loading: subsLoading,
    error: subsError,
    reload: reloadSubs,
  } = useAsync(() => subsApi.mine().then((r) => r.data).catch((err) => {
    // Return null so we can show error UI rather than treating as unsubscribed
    throw err;
  }), []);

  // 4. Invitation Subscription Plans (Server-configured pricing)
  const {
    data: invPlansData,
  } = useAsync(() => subsApi.plans('invitation').then((r) => r.data).catch(() => null), []);

  // 5. Custom Design Requests
  const {
    data: customRequestsData,
    loading: requestsLoading,
    error: requestsError,
    reload: reloadRequests,
  } = useAsync(() => customDesignApi.listRequests(), []);

  // ---------------------------------------------------- Subscriptions & Entitlement
  const invitationSub = subsMineData?.active_by_product?.invitation;
  const isTestOrSuper = Boolean(admin?.role === 'super_admin' || admin?.is_test_studio);
  const isEntitled = Boolean(
    isTestOrSuper ||
    (invitationSub && invitationSub.status === 'active') ||
    admin?.has_invitation_subscription ||
    admin?.invitation_subscription_active
  );

  // Derive annual subscription price from backend plans (default/fallback only if unconfigured)
  const annualPlan = useMemo(() => {
    const plansList = invPlansData?.plans || [];
    return plansList.find((p) => p.tier === 'Studio') || plansList[0] || null;
  }, [invPlansData]);

  const annualPriceLabel = useMemo(() => {
    if (!annualPlan) return null;
    const yearlyCycle = annualPlan.cycles?.yearly;
    if (yearlyCycle?.total_inr) {
      return `₹${Number(yearlyCycle.total_inr).toLocaleString('en-IN')}/year`;
    }
    if (annualPlan.base_monthly) {
      return `₹${Number(annualPlan.base_monthly).toLocaleString('en-IN')}/month`;
    }
    return null;
  }, [annualPlan]);

  // ---------------------------------------------------- Categorization & Filtering
  const profiles = useMemo(() => profilesData?.data?.items || profilesData?.items || [], [profilesData]);
  const customRequests = useMemo(() => (
    customRequestsData?.data?.items ||
    customRequestsData?.data?.requests ||
    customRequestsData?.items ||
    customRequestsData?.requests ||
    []
  ), [customRequestsData]);

  // Unified status classification
  const categorized = useMemo(() => {
    const now = new Date();
    const all = profiles;
    const drafts = [];
    const active = [];
    const expired = [];
    const archived = [];

    for (const p of profiles) {
      const isArchived = p.status === 'ARCHIVED' || Boolean(p.archived_at);
      if (isArchived) {
        archived.push(p);
        continue;
      }

      if (p.status === 'DRAFT') {
        drafts.push(p);
        continue;
      }

      // Check published invitation expiry
      const expiryDateStr = p.invitation_expires_at || p.link_expiry_date || p.expires_at;
      let isExpired = false;
      if (expiryDateStr) {
        const exp = new Date(expiryDateStr);
        if (!isNaN(exp.getTime()) && exp < now) {
          isExpired = true;
        }
      }

      if (isExpired) {
        expired.push(p);
      } else {
        active.push(p);
      }
    }

    return { all, drafts, active, expired, archived };
  }, [profiles]);

  // Filtered & sorted invitations list for Section 3
  const [invSearch, setInvSearch] = useState('');
  const [invSort, setInvSort] = useState('updated_desc');

  const displayedInvitations = useMemo(() => {
    let list = categorized[myInvFilter] || categorized.all;
    if (invSearch.trim()) {
      const q = invSearch.toLowerCase();
      list = list.filter((p) => {
        const bride = (p.bride_name || '').toLowerCase();
        const groom = (p.groom_name || '').toLowerCase();
        const title = (p.title || '').toLowerCase();
        const slug = (p.slug || '').toLowerCase();
        return bride.includes(q) || groom.includes(q) || title.includes(q) || slug.includes(q);
      });
    }

    return [...list].sort((a, b) => {
      if (invSort === 'date_asc') {
        return new Date(a.event_date || 0) - new Date(b.event_date || 0);
      }
      if (invSort === 'date_desc') {
        return new Date(b.event_date || 0) - new Date(a.event_date || 0);
      }
      if (invSort === 'title_asc') {
        const nameA = `${a.bride_name || ''} ${a.groom_name || ''}`.trim();
        const nameB = `${b.bride_name || ''} ${b.groom_name || ''}`.trim();
        return nameA.localeCompare(nameB);
      }
      // default: updated_desc
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    });
  }, [categorized, myInvFilter, invSearch, invSort]);

  // ---------------------------------------------------- Modal & Contextual Actions
  // Request Help Modal State
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [reqProfileId, setReqProfileId] = useState('');
  const [reqTitle, setReqTitle] = useState('');
  const [reqDescription, setReqDescription] = useState('');
  const [reqType, setReqType] = useState('assistance');
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError] = useState(null);

  // Pre-fill request modal if profile_id passed in URL
  useEffect(() => {
    const pId = searchParams.get('profile_id');
    if (pId) {
      setReqProfileId(pId);
      const prof = profiles.find((p) => p.id === pId);
      if (prof) {
        setReqTitle(`Assistance with ${prof.bride_name || 'Wedding'} & ${prof.groom_name || 'Invite'}`);
      }
      if (currentTab === 'custom') {
        setRequestModalOpen(true);
      }
    }
  }, [searchParams, profiles, currentTab]);

  const openContextualHelp = (prof) => {
    setReqProfileId(prof.id);
    setReqTitle(`Assistance with ${prof.bride_name || 'Wedding'} & ${prof.groom_name || 'Invite'}`);
    setReqType('assistance');
    setReqDescription('');
    setRequestModalOpen(true);
    changeTab('custom', { profile_id: prof.id });
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!reqTitle.trim()) {
      setReqError('Please provide a title for the request.');
      return;
    }
    setReqSubmitting(true);
    setReqError(null);
    try {
      await customDesignApi.createRequest({
        title: reqTitle.trim(),
        profile_id: reqProfileId || null,
        description: reqDescription.trim(),
        requirements: reqDescription.trim(),
        request_type: reqType,
        kind: reqType,
      });
      flash('Custom design request submitted to MAJA design team.');
      setRequestModalOpen(false);
      setReqTitle('');
      setReqDescription('');
      setReqProfileId('');
      reloadRequests();
    } catch (err) {
      setReqError(err?.response?.data?.detail || 'Failed to submit request. Please try again.');
    } finally {
      setReqSubmitting(false);
    }
  };

  // QR Code Modal State
  const [qrModalItem, setQrModalItem] = useState(null);

  // Gallery Expiry Modal State
  const [galleryExpiryItem, setGalleryExpiryItem] = useState(null);
  const [newGalleryExpiry, setNewGalleryExpiry] = useState('');
  const [newRetentionDays, setNewRetentionDays] = useState(30);
  const [expirySaving, setExpirySaving] = useState(false);

  const handleSaveGalleryExpiry = async (e) => {
    e.preventDefault();
    if (!galleryExpiryItem) return;
    setExpirySaving(true);
    try {
      await weddingsApi.updateGalleryConfig(galleryExpiryItem.id, {
        expires_at: newGalleryExpiry ? new Date(newGalleryExpiry).toISOString() : null,
        retention_days: parseInt(newRetentionDays, 10) || 30,
      });
      flash('Gallery expiry and retention settings updated.');
      setGalleryExpiryItem(null);
      reloadProfiles();
    } catch (err) {
      flash('Failed to update gallery settings: ' + (err?.response?.data?.detail || err.message));
    } finally {
      setExpirySaving(false);
    }
  };

  // Backlog AI Indexing Trigger
  const handleTriggerBacklogIndexing = async (profileId) => {
    try {
      const res = await weddingsApi.triggerAiBacklog(profileId);
      if (res?.data?.ok) {
        flash(`Enqueued ${res.data.enqueued || 0} photos for AI face indexing.`);
      } else {
        flash(res?.data?.message || 'AI backlog indexing initiated.');
      }
    } catch (err) {
      flash('Could not start AI indexing: ' + (err?.response?.data?.detail || err.message));
    }
  };

  // Lifecycle item actions (Archive, Restore, Delete)
  const handleArchive = async (profileId) => {
    if (!window.confirm('Archive this invitation? It will be moved to the Archived view.')) return;
    try {
      await weddingsApi.archive(profileId);
      flash('Invitation archived.');
      reloadProfiles();
    } catch (err) {
      flash('Failed to archive: ' + (err?.response?.data?.detail || err.message));
    }
  };

  const handleRestore = async (profileId) => {
    try {
      await weddingsApi.unarchive(profileId);
      flash('Invitation restored.');
      reloadProfiles();
    } catch (err) {
      flash('Failed to restore: ' + (err?.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (profileId) => {
    if (!window.confirm('Are you sure you want to permanently delete this invitation? This action cannot be undone.')) return;
    try {
      await weddingsApi.remove(profileId);
      flash('Invitation deleted.');
      reloadProfiles();
    } catch (err) {
      flash('Failed to delete: ' + (err?.response?.data?.detail || err.message));
    }
  };

  // Filter catalogue
  const filteredCatalogue = useMemo(() => {
    return catalogue.filter((item) => {
      if (catalogueFilter.ceremony !== 'all' && item.ceremony !== catalogueFilter.ceremony) return false;
      if (catalogueFilter.theme !== 'all' && item.theme !== catalogueFilter.theme) return false;
      if (catalogueFilter.search.trim()) {
        const q = catalogueFilter.search.toLowerCase();
        const name = designName(item).toLowerCase();
        const code = (designCode(item) || '').toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });
  }, [catalogue, catalogueFilter]);

  const pendingRequestsCount = useMemo(() => {
    return customRequests.filter((r) => r.status === 'pending').length;
  }, [customRequests]);

  return (
    <StudioModule
      active="Invitations"
      title="Invitations"
      sub="Design, publish, and manage luxury wedding invitation suites and guest galleries."
      actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="wmod-btn wmod-btn--ghost wmod-btn--sm"
            onClick={() => {
              reloadProfiles();
              reloadSubs();
              reloadRequests();
            }}
          >
            Refresh
          </button>
          <Link to="/studio/wedding/new" className="wmod-btn wmod-btn--primary wmod-btn--sm">
            + Create Invitation
          </Link>
        </div>
      }
    >
      {/* 5-Section Navigation Bar */}
      <div className="si-tabs-container">
        <Segmented
          ariaLabel="Invitations Navigation"
          value={currentTab}
          onChange={(val) => changeTab(val)}
          options={SECTIONS.map((s) => ({
            id: s.id,
            label: s.label,
            count: s.id === 'my-invitations' ? categorized.active.length : (s.id === 'custom' && pendingRequestsCount > 0 ? pendingRequestsCount : undefined),
          }))}
        />
      </div>

      {/* =========================================================================
          SECTION 1: DASHBOARD (DEFAULT VIEW)
          ========================================================================= */}
      {currentTab === 'dashboard' && (
        <div className="si-dashboard-grid">
          {/* Hero Action Header */}
          <div className="si-dashboard-hero">
            <div className="si-hero-info">
              <h2>Invitation Studio Hub</h2>
              <p>Create elegant invitations, pick from 188 heritage designs, customize photos, and share live event links with your clients.</p>
            </div>
            <div className="si-hero-actions">
              <Link to="/studio/wedding/new" className="wmod-btn wmod-btn--primary">
                + Create Invitation
              </Link>
              <Link
                to="/studio/galleries/new"
                className="wmod-btn wmod-btn--secondary"
              >
                + Create Gallery
              </Link>
            </div>
          </div>

          {/* Subscription Status Banner with Accurate Loading/Error UI */}
          {subsLoading ? (
            <div className="si-sub-banner si-sub-banner--loading">
              <div className="si-sub-banner-left">
                <div className="si-sub-icon">⏳</div>
                <div className="si-sub-meta">
                  <h4>Loading subscription status…</h4>
                  <p>Verifying active studio entitlements with server.</p>
                </div>
              </div>
            </div>
          ) : subsError ? (
            <div className="si-sub-banner si-sub-banner--unsubscribed" style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
              <div className="si-sub-banner-left">
                <div className="si-sub-icon" style={{ background: '#fee2e2' }}>⚠️</div>
                <div className="si-sub-meta">
                  <h4 style={{ color: '#991b1b' }}>Subscription status temporarily unavailable</h4>
                  <p style={{ color: '#b91c1c' }}>Could not verify subscription data from server. Please retry.</p>
                </div>
              </div>
              <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reloadSubs}>
                Retry
              </button>
            </div>
          ) : (
            <div className={`si-sub-banner ${isEntitled ? 'si-sub-banner--active' : 'si-sub-banner--unsubscribed'}`}>
              <div className="si-sub-banner-left">
                <div className="si-sub-icon">
                  {isEntitled ? '✨' : '🎟️'}
                </div>
                <div className="si-sub-meta">
                  <h4>
                    {isEntitled
                      ? `Annual Invitation Subscription (${invitationSub?.tier || (isTestOrSuper ? 'Test Mode' : 'Active')})`
                      : 'Annual Invitation Subscription Inactive'}
                  </h4>
                  <p>
                    {isEntitled
                      ? (invitationSub?.current_period_end
                          ? `Active entitlement • Renews on ${shortDate(invitationSub.current_period_end)}`
                          : 'Full access to all 188 standard designs and unlimited publishing.')
                      : (annualPriceLabel
                          ? `Includes all 188 standard templates and unlimited publishing for ${annualPriceLabel}.`
                          : 'Subscribe to create and publish unlimited client invitations.')}
                  </p>
                </div>
              </div>
              <div>
                {isEntitled ? (
                  <Link to="/studio/plans?product=invitation" className="wmod-btn wmod-btn--ghost wmod-btn--sm">
                    Manage Subscription ↗
                  </Link>
                ) : (
                  <Link to="/studio/plans?product=invitation" className="wmod-btn wmod-btn--primary wmod-btn--sm">
                    Get Annual Plan
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Pending Assistance Alert Banner */}
          {pendingRequestsCount > 0 && (
            <div className="si-pending-alert">
              <span className="si-pending-alert-text">
                📌 You have {pendingRequestsCount} pending design assistance / custom request{pendingRequestsCount > 1 ? 's' : ''} in review.
              </span>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                onClick={() => changeTab('custom')}
              >
                View Requests
              </button>
            </div>
          )}

          {/* Compact Metrics Row */}
          <StatRow
            items={[
              { label: 'Active Invitations', value: profilesLoading ? '—' : categorized.active.length },
              { label: 'Drafts in Progress', value: profilesLoading ? '—' : categorized.drafts.length },
              { label: 'Galleries', value: profilesLoading ? '—' : profiles.length },
              { label: 'Design Help Requests', value: requestsLoading ? '—' : customRequests.length },
            ]}
          />

          {/* Recent Invitations Activity */}
          <Panel
            title="Recent Invitations"
            sub="Your recently created and updated client invitation suites."
            actions={
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                onClick={() => changeTab('my-invitations')}
              >
                View All Invitations →
              </button>
            }
          >
            {profilesLoading ? (
              <Loading rows={3} />
            ) : profiles.length === 0 ? (
              <Empty
                title="No invitations created yet"
                body="Start your first wedding invitation suite in minutes using our handcrafted templates."
                action={
                  <Link to="/studio/wedding/new" className="wmod-btn wmod-btn--primary wmod-btn--sm">
                    + Create Invitation
                  </Link>
                }
              />
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr>
                      <th>Couple</th>
                      <th>Ceremony Date</th>
                      <th>Theme</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.slice(0, 6).map((p) => {
                      const isDraft = p.status === 'DRAFT' && !p.archived_at;
                      const isPub = (p.status === 'PUBLISHED' || p.is_published) && !p.archived_at;
                      return (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.bride_name || 'Draft'} & {p.groom_name || 'Invite'}</strong>
                            {p.slug && <span className="si-slug-sub">/invite/{p.slug}</span>}
                          </td>
                          <td>{shortDate(p.event_date) || '—'}</td>
                          <td>{themeLabel(p.design_id)}</td>
                          <td>
                            <span className={`si-status-badge si-status-badge--${p.status?.toLowerCase() || 'draft'}`}>
                              {p.status || 'DRAFT'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {isDraft && (
                                <Link to={`/studio/wedding/${p.id}/edit`} className="wmod-btn wmod-btn--primary wmod-btn--sm">
                                  Continue Editing
                                </Link>
                              )}
                              {isPub && (
                                <>
                                  <a
                                    href={`/invite/${p.slug}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                                  >
                                    View
                                  </a>
                                  <button
                                    type="button"
                                    className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                                    onClick={() => {
                                      navigator.clipboard.writeText(`${window.location.origin}/invite/${p.slug}`);
                                      flash('Copied invitation link!');
                                    }}
                                  >
                                    Copy Link
                                  </button>
                                </>
                              )}
                              <Link to={`/studio/wedding/${p.id}/edit`} className="wmod-btn wmod-btn--ghost wmod-btn--sm">
                                Edit
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* =========================================================================
          SECTION 2: DESIGNS CATALOGUE
          ========================================================================= */}
      {currentTab === 'designs' && (
        <div>
          {/* Expandable "What's Included?" explanation */}
          <div className="si-included-accordion">
            <div
              className="si-included-header"
              onClick={() => setWhatsIncludedOpen(!whatsIncludedOpen)}
            >
              <div className="si-included-title">
                <span>📖</span>
                <span>What’s included with the Annual Invitation Plan?</span>
              </div>
              <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm">
                {whatsIncludedOpen ? 'Hide Details ▲' : 'What’s Included? ▼'}
              </button>
            </div>

            {whatsIncludedOpen && (
              <div className="si-included-body">
                <div className="si-commercial-split">
                  <div className="si-included-box si-included-box--featured">
                    <h4>Included with Annual Invitation Subscription</h4>
                    <ul className="si-included-list">
                      <li>✓ All 188 crafted layouts across 10 heritage wedding collections</li>
                      <li>✓ Unlimited invitation link creation and edits during active year</li>
                      <li>✓ Custom photo framing, zoom, pan, rotation, and separate mobile/desktop layouts</li>
                      <li>✓ Guest RSVPs, digital blessings wall, Google Maps navigation, audio player</li>
                      <li>✓ Multi-language guest selectors (English, Hindi, Telugu, Tamil, etc.)</li>
                      <li>✓ Draft autosave & atomic version rollback history</li>
                    </ul>
                  </div>

                  <div className="si-included-box">
                    <h4>Separate Services & Add-ons</h4>
                    <ul className="si-included-list">
                      <li>• <strong>Custom Design Service:</strong> Bespoke mandap styling or custom illustrations, quoted per event.</li>
                      <li>• <strong>Gallery Storage:</strong> Dedicated multi-album photo storage subscription with watermarked derivatives.</li>
                      <li>• <strong>AI Selfie Matching:</strong> Optional paid per-event add-on enabling guest face recognition under 800ms.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Panel
            title="Design Templates Catalogue"
            sub="Explore 188 heritage designs. Included in your Annual Invitation Plan."
          >
            {/* Filter Toolbar */}
            <div className="si-catalogue-toolbar">
              <div className="si-filter-group">
                <label>
                  <span>Ceremony:</span>
                  <select
                    value={catalogueFilter.ceremony}
                    onChange={(e) => setCatalogueFilter((prev) => ({ ...prev, ceremony: e.target.value }))}
                    className="wmod-input"
                  >
                    <option value="all">All Ceremonies</option>
                    <option value="Engagement">Engagement</option>
                    <option value="Haldi">Haldi</option>
                    <option value="Mehandi">Mehandi</option>
                    <option value="Marriage">Marriage</option>
                    <option value="Reception">Reception</option>
                    <option value="Sangeeth">Sangeet</option>
                  </select>
                </label>

                <label>
                  <span>Theme / Collection:</span>
                  <select
                    value={catalogueFilter.theme}
                    onChange={(e) => setCatalogueFilter((prev) => ({ ...prev, theme: e.target.value }))}
                    className="wmod-input"
                  >
                    <option value="all">All Themes</option>
                    <option value="royal_heritage">Royal Heritage</option>
                    <option value="south_indian_temple">South Indian Temple</option>
                    <option value="royal_mughal">Royal Mughal</option>
                    <option value="bengali_traditional">Bengali Traditional</option>
                    <option value="punjabi_sangeet">Punjabi Sangeet</option>
                    <option value="kerala_backwaters">Kerala Backwaters</option>
                    <option value="christian_elegant">Christian Elegant</option>
                    <option value="muslim_nikah">Muslim Nikah</option>
                    <option value="beach_destination">Beach Destination</option>
                    <option value="nature_eco_wedding">Nature / Eco</option>
                    <option value="modern_minimal">Modern Minimal</option>
                  </select>
                </label>

                <input
                  type="search"
                  placeholder="Search templates or codes..."
                  value={catalogueFilter.search}
                  onChange={(e) => setCatalogueFilter((prev) => ({ ...prev, search: e.target.value }))}
                  className="wmod-input si-search-input"
                />
              </div>
            </div>

            {catalogueLoading ? (
              <Loading rows={4} />
            ) : filteredCatalogue.length === 0 ? (
              <Empty title="No designs match your filter" body="Try adjusting your ceremony or theme collection filters." />
            ) : (
              <div className="si-designs-grid">
                {filteredCatalogue.slice(0, 48).map((d, idx) => (
                  <div key={idx} className="si-design-card">
                    <div className="si-card-thumb" onClick={() => setPreviewDesign(d)}>
                      <img
                        src={d.src480 || d.lqip}
                        alt={designName(d)}
                        loading="lazy"
                        style={{ backgroundColor: d.dominant || '#f3f4f6' }}
                      />
                      <div className="si-card-overlay">
                        <span>Click to preview</span>
                      </div>
                    </div>
                    <div className="si-card-info">
                      <h4 className="si-card-title">{designName(d)}</h4>
                      <span className="si-card-code">{designCode(d)}</span>
                      <div className="si-card-actions">
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          onClick={() => setPreviewDesign(d)}
                        >
                          Preview
                        </button>
                        {isEntitled ? (
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--primary wmod-btn--sm"
                            onClick={() => navigate(`/studio/wedding/new?theme=${d.theme}&design_id=${designCode(d)}`)}
                          >
                            Use Design
                          </button>
                        ) : (
                          <Link
                            to="/studio/plans?product=invitation"
                            className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                          >
                            Get Annual Plan
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* =========================================================================
          SECTION 3: MY INVITATIONS (COMBINED DRAFTS / ACTIVE / EXPIRED / ARCHIVED)
          ========================================================================= */}
      {currentTab === 'my-invitations' && (
        <Panel
          title="My Invitations"
          sub="Manage all your client invitation suites, active links, drafts, and archives in one place."
          actions={
            <Link to="/studio/wedding/new" className="wmod-btn wmod-btn--primary wmod-btn--sm">
              + Create Invitation
            </Link>
          }
        >
          {/* Sub-Filters and Search Toolbar */}
          <div className="si-invitations-toolbar">
            <div className="si-pill-filters">
              {[
                { id: 'all', label: 'All', count: categorized.all.length },
                { id: 'drafts', label: 'Drafts', count: categorized.drafts.length },
                { id: 'active', label: 'Active', count: categorized.active.length },
                { id: 'expired', label: 'Expired', count: categorized.expired.length },
                { id: 'archived', label: 'Archived', count: categorized.archived.length },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`si-pill-btn ${myInvFilter === f.id ? 'si-pill-btn--active' : ''}`}
                  onClick={() => changeFilter(f.id)}
                >
                  {f.label}
                  <span className="si-pill-count">{f.count}</span>
                </button>
              ))}
            </div>

            <div className="si-invitations-controls">
              <input
                type="search"
                placeholder="Search by couple or link…"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                className="wmod-input"
                style={{ minWidth: 200 }}
              />

              <select
                value={invSort}
                onChange={(e) => setInvSort(e.target.value)}
                className="wmod-input"
              >
                <option value="updated_desc">Recently Updated</option>
                <option value="date_desc">Event Date (Newest)</option>
                <option value="date_asc">Event Date (Oldest)</option>
                <option value="title_asc">Name (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Table List */}
          {profilesLoading ? (
            <Loading rows={4} />
          ) : displayedInvitations.length === 0 ? (
            <Empty
              title={`No ${myInvFilter === 'all' ? '' : myInvFilter} invitations found`}
              body={
                invSearch
                  ? 'No invitations match your search query.'
                  : (myInvFilter === 'drafts'
                      ? 'Unfinished invitations are automatically autosaved as drafts.'
                      : (myInvFilter === 'active'
                          ? 'Publish an invitation to generate active shareable guest links.'
                          : (myInvFilter === 'expired'
                              ? 'Invitations past their expiry date will appear here.'
                              : 'Retired invitations appear here once archived.')))
              }
              action={
                <Link to="/studio/wedding/new" className="wmod-btn wmod-btn--primary wmod-btn--sm">
                  + Create Invitation
                </Link>
              }
            />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead>
                  <tr>
                    <th>Couple / Event</th>
                    <th>Event Date</th>
                    <th>Design Theme</th>
                    <th>Status</th>
                    <th>Expiry</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedInvitations.map((p) => {
                    const isDraft = p.status === 'DRAFT' && !p.archived_at;
                    const isArchived = p.status === 'ARCHIVED' || Boolean(p.archived_at);
                    const expiryDate = p.invitation_expires_at || p.link_expiry_date || p.expires_at;
                    const isExpired = !isArchived && !isDraft && expiryDate && new Date(expiryDate) < new Date();
                    const isActive = (p.status === 'PUBLISHED' || p.is_published) && !isArchived && !isExpired;

                    return (
                      <InvitationRow
                        key={p.id}
                        p={p}
                        isDraft={isDraft}
                        isActive={isActive}
                        isExpired={isExpired}
                        isArchived={isArchived}
                        flash={flash}
                        onArchive={handleArchive}
                        onRestore={handleRestore}
                        onDelete={handleDelete}
                        onOpenQr={() => setQrModalItem(p)}
                        onContextualHelp={() => openContextualHelp(p)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* =========================================================================
          SECTION 4: GALLERY & ALBUM MANAGEMENT
          ========================================================================= */}
      {currentTab === 'gallery' && (
        <Panel
          title="Galleries & Album Management"
          sub="Separate gallery storage and album delivery. Photographers can manage event albums without an invitation subscription."
          actions={
            <Link
              to="/studio/galleries/new"
              className="wmod-btn wmod-btn--primary wmod-btn--sm"
            >
              + Create Gallery
            </Link>
          }
        >
          {/* Storage & Entitlement Info Banner */}
          <div className="si-gallery-banner">
            <div>
              <h3>Gallery Storage & Cloud Backup</h3>
              <p>
                Each event supports multiple named albums (Engagement, Haldi, Wedding, Reception).
                Guests receive watermarked display derivatives with originals kept private and guest downloads disabled.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                onClick={() => setShowCommercialPlansModal(true)}
              >
                Commercial Plans ↗
              </button>
              <Link to="/studio/storage" className="wmod-btn wmod-btn--ghost wmod-btn--sm">
                Storage Tiers ↗
              </Link>
            </div>
          </div>

          {galleriesLoading ? (
            <Loading rows={3} />
          ) : standaloneGalleries.length === 0 ? (
            <Empty
              title="No galleries found"
              body="Create a standalone client gallery to upload and deliver high-resolution named albums."
              action={
                <Link
                  to="/studio/galleries/new"
                  className="wmod-btn wmod-btn--primary wmod-btn--sm"
                >
                  + Create Gallery
                </Link>
              }
            />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead>
                  <tr>
                    <th>Gallery / Event</th>
                    <th>Albums & Storage</th>
                    <th>Status</th>
                    <th>Gallery Expiry</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {standaloneGalleries.map((g) => {
                    const galleryExp = g.expires_at;
                    const storageMb = g.storage_bytes ? (g.storage_bytes / (1024 * 1024)).toFixed(1) : '0';

                    return (
                      <tr key={g.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {g.cover_url ? (
                              <img
                                src={g.cover_url}
                                alt="cover"
                                style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: 6,
                                  background: '#f1f5f9',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '1.2rem',
                                  color: '#94a3b8',
                                }}
                              >
                                🖼️
                              </div>
                            )}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <strong>{g.title || 'Untitled Gallery'}</strong>
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    background: g.is_standalone ? '#eff6ff' : '#f5f3ff',
                                    color: g.is_standalone ? '#1d4ed8' : '#6d28d9',
                                    fontWeight: 500,
                                  }}
                                >
                                  {g.is_standalone ? 'Standalone' : 'Integrated'}
                                </span>
                              </div>
                              {g.slug && (
                                <span className="si-slug-sub">
                                  /gallery/{g.slug}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>
                            <strong>{g.album_count || 0} albums • {g.photo_count || 0} photos</strong>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                            Storage: {storageMb} MB
                          </div>
                        </td>
                        <td>
                          <span
                            className={`si-status-badge ${
                              g.status === 'active'
                                ? 'si-status-badge--published'
                                : g.status === 'expired'
                                ? 'si-status-badge--archived'
                                : 'si-status-badge--draft'
                            }`}
                          >
                            {g.status === 'active' ? 'Active' : g.status === 'expired' ? 'Expired' : 'Draft'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{galleryExp ? shortDate(galleryExp) : 'Standard (1 Yr)'}</span>
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                              style={{ padding: '2px 6px', fontSize: 11 }}
                              onClick={() => {
                                setGalleryExpiryItem(g);
                                setNewGalleryExpiry(galleryExp ? galleryExp.slice(0, 10) : '');
                                setNewRetentionDays(30);
                              }}
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                              onClick={() => setWorkspaceGalleryId(g.id)}
                            >
                              Manage
                            </button>
                            {g.slug && (
                              <a
                                href={g.public_url || `/gallery/${g.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                              >
                                Preview
                              </a>
                            )}
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                              onClick={() => {
                                const fullUrl = `${window.location.origin}${g.public_url || `/gallery/${g.slug}`}`;
                                navigator.clipboard.writeText(fullUrl);
                                flash('Copied public gallery link to clipboard!');
                              }}
                            >
                              Copy Link
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* =========================================================================
          SECTION 5: DESIGN HELP & CUSTOM REQUESTS
          ========================================================================= */}
      {currentTab === 'custom' && (
        <Panel
          title="Design Help & Custom Requests"
          sub="Request design assistance on your invitations or commission bespoke artwork from our super-admin creative team."
          actions={
            <button
              type="button"
              className="wmod-btn wmod-btn--primary wmod-btn--sm"
              onClick={() => {
                setReqProfileId('');
                setReqTitle('');
                setReqDescription('');
                setRequestModalOpen(true);
              }}
            >
              + New Request
            </button>
          }
        >
          {/* Service Distinction Overview */}
          <div className="si-help-intro-grid">
            <div className="si-help-card">
              <h4>Design Help (Included)</h4>
              <p>
                Assistance with photo repositioning, mobile/desktop framing adjustments, or font choices on an existing invitation.
                Handled promptly by MAJA support.
              </p>
              <button
                type="button"
                className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                onClick={() => {
                  setReqType('assistance');
                  setRequestModalOpen(true);
                }}
              >
                Request Design Assistance
              </button>
            </div>

            <div className="si-help-card">
              <h4>Custom Creative Work (Separately Quoted)</h4>
              <p>
                Bespoke mandap stage matching, custom illustrated caricatures, or venue-specific stage graphics.
                Individually quoted and fulfilled by super-admin designers.
              </p>
              <button
                type="button"
                className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                onClick={() => {
                  setReqType('bespoke');
                  setRequestModalOpen(true);
                }}
              >
                Request Bespoke Creative
              </button>
            </div>
          </div>

          {/* Requests Queue Table */}
          {requestsLoading ? (
            <Loading rows={3} />
          ) : customRequests.length === 0 ? (
            <Empty
              title="No design requests submitted"
              body="When you need help adjusting an invitation frame or want custom bespoke artwork, submit a request above."
            />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead>
                  <tr>
                    <th>Request Subject</th>
                    <th>Type</th>
                    <th>Linked Invitation</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Quote / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {customRequests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <strong>{req.title}</strong>
                        {req.description && <p className="si-req-desc">{req.description}</p>}
                      </td>
                      <td>
                        <span className="si-type-tag">
                          {req.request_type === 'bespoke_paid' || req.request_type === 'bespoke'
                            ? 'Bespoke Paid'
                            : 'Design Help'}
                        </span>
                      </td>
                      <td>
                        {req.profile_id ? (
                          <Link to={`/studio/wedding/${req.profile_id}/edit`} className="si-link-url">
                            {req.profile_id}
                          </Link>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`si-status-badge si-status-badge--${req.status?.toLowerCase() || 'pending'}`}>
                          {req.status}
                        </span>
                      </td>
                      <td>{shortDate(req.created_at)}</td>
                      <td>
                        {req.quoted_price ? (
                          <strong>₹{req.quoted_price.toLocaleString('en-IN')}</strong>
                        ) : (
                          req.admin_notes || 'Pending review'
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

      {/* =========================================================================
          MODALS
          ========================================================================= */}

      {/* Modal: New Design Help / Custom Request */}
      {requestModalOpen && (
        <div className="ife-modal-overlay" role="dialog" aria-modal="true">
          <div className="ife-modal-card" style={{ maxWidth: 540 }}>
            <header className="ife-header">
              <div className="ife-header-info">
                <h3 className="ife-title">
                  {reqType === 'bespoke' ? 'New Custom Creative Request' : 'Request Design Help'}
                </h3>
                <p className="ife-subtitle">Submit details directly to the MAJA design team.</p>
              </div>
              <button
                type="button"
                className="ife-close-btn"
                onClick={() => setRequestModalOpen(false)}
              >
                &times;
              </button>
            </header>

            <form onSubmit={handleSubmitRequest} style={{ padding: 20 }}>
              <InlineError message={reqError} />

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Request Type
                </label>
                <select
                  value={reqType}
                  onChange={(e) => setReqType(e.target.value)}
                  className="wmod-input"
                  style={{ width: '100%' }}
                >
                  <option value="assistance">Design Help (Framing, photo crop, background assistance)</option>
                  <option value="bespoke">Bespoke Creative (Custom mandap matching, separately quoted)</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Linked Invitation (Optional)
                </label>
                <select
                  value={reqProfileId}
                  onChange={(e) => setReqProfileId(e.target.value)}
                  className="wmod-input"
                  style={{ width: '100%' }}
                >
                  <option value="">— None (General Request) —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.bride_name || 'Draft'} & {p.groom_name || 'Invite'} ({p.id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Subject / Title *
                </label>
                <input
                  type="text"
                  value={reqTitle}
                  onChange={(e) => setReqTitle(e.target.value)}
                  placeholder="e.g. Mandap Floral Backdrop Adjustment"
                  className="wmod-input"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Detailed Description & Requirements
                </label>
                <textarea
                  rows={4}
                  value={reqDescription}
                  onChange={(e) => setReqDescription(e.target.value)}
                  placeholder="Describe your adjustments, photo framing specifications, or stage theme references..."
                  className="wmod-input"
                  style={{ width: '100%' }}
                />
              </div>

              <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--ghost"
                  onClick={() => setRequestModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="wmod-btn wmod-btn--primary"
                  disabled={reqSubmitting}
                >
                  {reqSubmitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Design Preview */}
      {previewDesign && (
        <div className="ife-modal-overlay" role="dialog" aria-modal="true">
          <div className="ife-modal-card" style={{ maxWidth: 500 }}>
            <header className="ife-header">
              <div className="ife-header-info">
                <h3 className="ife-title">{designName(previewDesign)}</h3>
                <p className="ife-subtitle">{designCode(previewDesign)} • {themeLabel(previewDesign.theme)}</p>
              </div>
              <button
                type="button"
                className="ife-close-btn"
                onClick={() => setPreviewDesign(null)}
              >
                &times;
              </button>
            </header>
            <div style={{ padding: 16, display: 'flex', justifyContent: 'center', background: '#f9fafb' }}>
              <img
                src={previewDesign.src960 || previewDesign.src480 || previewDesign.lqip}
                alt={designName(previewDesign)}
                style={{ maxHeight: '60vh', maxWidth: '100%', borderRadius: 8, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
              />
            </div>
            <footer style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6' }}>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                onClick={() => setPreviewDesign(null)}
              >
                Close
              </button>
              {isEntitled ? (
                <button
                  type="button"
                  className="wmod-btn wmod-btn--primary"
                  onClick={() => {
                    const theme = previewDesign.theme;
                    const code = designCode(previewDesign);
                    setPreviewDesign(null);
                    navigate(`/studio/wedding/new?theme=${theme}&design_id=${code}`);
                  }}
                >
                  Use This Design
                </button>
              ) : (
                <Link
                  to="/studio/plans?product=invitation"
                  className="wmod-btn wmod-btn--primary"
                  onClick={() => setPreviewDesign(null)}
                >
                  Get Annual Plan
                </Link>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* Modal: QR Code Sharing */}
      {qrModalItem && (
        <div className="ife-modal-overlay" role="dialog" aria-modal="true">
          <div className="ife-modal-card" style={{ maxWidth: 440 }}>
            <header className="ife-header">
              <div className="ife-header-info">
                <h3 className="ife-title">Invitation QR Code</h3>
                <p className="ife-subtitle">{qrModalItem.bride_name} & {qrModalItem.groom_name}</p>
              </div>
              <button
                type="button"
                className="ife-close-btn"
                onClick={() => setQrModalItem(null)}
              >
                &times;
              </button>
            </header>
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{
                display: 'inline-block',
                padding: 16,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.06)'
              }}>
                {/* SVG QR Code representation */}
                <svg width="180" height="180" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="100" height="100" fill="#ffffff"/>
                  <rect x="10" y="10" width="25" height="25" fill="#1f2937"/>
                  <rect x="15" y="15" width="15" height="15" fill="#ffffff"/>
                  <rect x="18" y="18" width="9" height="9" fill="#1f2937"/>
                  <rect x="65" y="10" width="25" height="25" fill="#1f2937"/>
                  <rect x="70" y="15" width="15" height="15" fill="#ffffff"/>
                  <rect x="73" y="18" width="9" height="9" fill="#1f2937"/>
                  <rect x="10" y="65" width="25" height="25" fill="#1f2937"/>
                  <rect x="15" y="70" width="15" height="15" fill="#ffffff"/>
                  <rect x="18" y="73" width="9" height="9" fill="#1f2937"/>
                  <rect x="42" y="12" width="6" height="6" fill="#1f2937"/>
                  <rect x="52" y="22" width="6" height="6" fill="#1f2937"/>
                  <rect x="42" y="42" width="16" height="16" fill="#7c3aed"/>
                  <rect x="65" y="42" width="8" height="8" fill="#1f2937"/>
                  <rect x="75" y="55" width="12" height="6" fill="#1f2937"/>
                  <rect x="42" y="68" width="10" height="10" fill="#1f2937"/>
                  <rect x="62" y="72" width="15" height="15" fill="#1f2937"/>
                  <rect x="80" y="75" width="8" height="8" fill="#1f2937"/>
                </svg>
              </div>
              <p style={{ marginTop: 14, fontSize: 13, color: '#4b5563', fontFamily: 'monospace' }}>
                {`${window.location.origin}/invite/${qrModalItem.slug}`}
              </p>
            </div>
            <footer style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6' }}>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                onClick={() => setQrModalItem(null)}
              >
                Close
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/invite/${qrModalItem.slug}`);
                    flash('Invitation URL copied!');
                  }}
                >
                  Copy URL
                </button>
                <Link
                  to={`/studio/profile/${qrModalItem.id}/qr-codes`}
                  className="wmod-btn wmod-btn--primary"
                >
                  Open QR Studio ↗
                </Link>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* Modal: Gallery Expiry & Retention Settings */}
      {galleryExpiryItem && (
        <div className="ife-modal-overlay" role="dialog" aria-modal="true">
          <div className="ife-modal-card" style={{ maxWidth: 460 }}>
            <header className="ife-header">
              <div className="ife-header-info">
                <h3 className="ife-title">Gallery Expiry Settings</h3>
                <p className="ife-subtitle">Configure independent gallery lifetime and retention grace.</p>
              </div>
              <button
                type="button"
                className="ife-close-btn"
                onClick={() => setGalleryExpiryItem(null)}
              >
                &times;
              </button>
            </header>

            <form onSubmit={handleSaveGalleryExpiry} style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Gallery Public Expiry Date
                </label>
                <input
                  type="date"
                  value={newGalleryExpiry}
                  onChange={(e) => setNewGalleryExpiry(e.target.value)}
                  className="wmod-input"
                  style={{ width: '100%' }}
                />
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                  Independent from the invitation link expiry. Guests can view albums until this date.
                </p>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  Retention Grace Period (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={newRetentionDays}
                  onChange={(e) => setNewRetentionDays(e.target.value)}
                  className="wmod-input"
                  style={{ width: '100%' }}
                />
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                  Number of grace days photos remain stored after expiry before permanent cleanup.
                </p>
              </div>

              <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--ghost"
                  onClick={() => setGalleryExpiryItem(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="wmod-btn wmod-btn--primary"
                  disabled={expirySaving}
                >
                  {expirySaving ? 'Saving…' : 'Save Settings'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Standalone Gallery Workflow Modals */}
      <CreateGalleryModal
        isOpen={showCreateGalleryModal}
        onClose={() => setShowCreateGalleryModal(false)}
        onOpenPlans={() => setShowCommercialPlansModal(true)}
        onSuccess={(newGallery) => {
          loadStandaloneGalleries();
          if (newGallery?.id) {
            setWorkspaceGalleryId(newGallery.id);
          }
          flash('Gallery created successfully!');
        }}
      />

      <CommercialPlansModal
        isOpen={showCommercialPlansModal}
        onClose={() => setShowCommercialPlansModal(false)}
      />

      <GalleryWorkspaceModal
        isOpen={Boolean(workspaceGalleryId)}
        galleryId={workspaceGalleryId}
        onClose={() => setWorkspaceGalleryId(null)}
        onUpdate={loadStandaloneGalleries}
      />

      <Toast message={toast} />
    </StudioModule>
  );
}

/**
 * Row component for Section 3: My Invitations
 */
function InvitationRow({
  p,
  isDraft,
  isActive,
  isExpired,
  isArchived,
  flash,
  onArchive,
  onRestore,
  onDelete,
  onOpenQr,
  onContextualHelp,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const expiryDate = p.invitation_expires_at || p.link_expiry_date || p.expires_at;

  return (
    <tr>
      <td>
        <strong>{p.bride_name || 'Draft'} & {p.groom_name || 'Invite'}</strong>
        {p.slug && <span className="si-slug-sub">/invite/{p.slug}</span>}
      </td>
      <td>{shortDate(p.event_date) || '—'}</td>
      <td>{themeLabel(p.design_id)}</td>
      <td>
        <span className={`si-status-badge si-status-badge--${
          isArchived ? 'archived' : (isExpired ? 'expired' : (isActive ? 'active' : 'draft'))
        }`}>
          {isArchived ? 'Archived' : (isExpired ? 'Expired' : (isActive ? 'Active' : 'Draft'))}
        </span>
      </td>
      <td>
        {expiryDate ? shortDate(expiryDate) : (p.link_expiry_value ? `${p.link_expiry_value} Days` : 'Standard')}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Draft Actions */}
          {isDraft && (
            <>
              <Link to={`/studio/wedding/${p.id}/edit`} className="wmod-btn wmod-btn--primary wmod-btn--sm">
                Continue Editing
              </Link>
              {p.slug && (
                <a
                  href={`/invite/${p.slug}?preview=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                >
                  Preview
                </a>
              )}
            </>
          )}

          {/* Active Actions */}
          {isActive && (
            <>
              <a
                href={`/invite/${p.slug}`}
                target="_blank"
                rel="noreferrer"
                className="wmod-btn wmod-btn--ghost wmod-btn--sm"
              >
                View
              </a>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/invite/${p.slug}`);
                  flash('Copied invitation link!');
                }}
              >
                Copy Link
              </button>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                onClick={onOpenQr}
              >
                QR
              </button>
              <Link to={`/studio/wedding/${p.id}/edit`} className="wmod-btn wmod-btn--ghost wmod-btn--sm">
                Edit
              </Link>
            </>
          )}

          {/* Expired Actions */}
          {isExpired && (
            <>
              <Link to={`/studio/wedding/${p.id}`} className="wmod-btn wmod-btn--ghost wmod-btn--sm">
                View Details
              </Link>
              <Link to={`/studio/wedding/${p.id}/edit`} className="wmod-btn wmod-btn--secondary wmod-btn--sm">
                Extend / Renew
              </Link>
            </>
          )}

          {/* Archived Actions */}
          {isArchived && (
            <>
              <Link to={`/studio/wedding/${p.id}`} className="wmod-btn wmod-btn--ghost wmod-btn--sm">
                View Details
              </Link>
              <button
                type="button"
                className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                onClick={() => onRestore(p.id)}
              >
                Restore
              </button>
            </>
          )}

          {/* More Menu Dropdown */}
          <div className="si-more-menu-wrapper" ref={menuRef}>
            <button
              type="button"
              className="wmod-btn wmod-btn--ghost wmod-btn--sm"
              style={{ padding: '4px 8px', minWidth: 28 }}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="More actions"
            >
              •••
            </button>

            {menuOpen && (
              <div className="si-more-menu">
                <button
                  type="button"
                  className="si-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onContextualHelp();
                  }}
                >
                  🛠 Request Design Help
                </button>

                {!isArchived && (
                  <button
                    type="button"
                    className="si-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onArchive(p.id);
                    }}
                  >
                    📦 Archive Invitation
                  </button>
                )}

                {isArchived && (
                  <button
                    type="button"
                    className="si-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onRestore(p.id);
                    }}
                  >
                    ↩ Restore to Active
                  </button>
                )}

                <button
                  type="button"
                  className="si-menu-item si-menu-item--danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(p.id);
                  }}
                >
                  🗑 Delete Invitation
                </button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
