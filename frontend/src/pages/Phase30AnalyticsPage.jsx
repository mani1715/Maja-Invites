/**
 * PHASE 30: Analytics, Insights & Guest Intelligence Dashboard
 * 
 * Admin-only analytics dashboard showing:
 * - View analytics (total, unique, repeat, device, location)
 * - Engagement analytics (gallery, video, music, map, scroll depth)
 * - RSVP conversion analytics
 * - Charts: Line (views trend), Donut (RSVP status), Bar (top events)
 * - Filters: Date range, Event
 * - Export: CSV download
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  Eye,
  Users,
  UserCheck,
  UserX,
  Clock,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Image,
  Play,
  Volume2,
  Map,
  CheckCircle,
  TrendingUp,
  Lock,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
// PHASE 33: Feature Gating
import LockedFeatureIndicator from '@/components/LockedFeatureIndicator';
import AnalyticsExtrasSection from '@/components/luxury/AnalyticsExtrasSection';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const COLORS = {
  primary: '#D4AF37',
  success: '#6FCF97',
  warning: '#E8C766',
  danger: '#F08585',
  purple: '#C3A3E3',
  pink: '#E8C4B8',
};

const Phase30AnalyticsPage = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [selectedEvent, setSelectedEvent] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [events, setEvents] = useState([]);

  // PHASE 33: Feature Gating
  const [featureFlags, setFeatureFlags] = useState(null);

  useEffect(() => {
    fetchFeatureFlags();
    fetchAnalytics();
    fetchEvents();
  }, [profileId]);

  // PHASE 33: Check feature access
  const fetchFeatureFlags = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/profiles/${profileId}/features`);
      setFeatureFlags(response.data);
      
      // If analytics not available, show locked state
      if (!response.data.analytics_basic && !response.data.analytics_advanced) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch feature flags:', error);
      setFeatureFlags({ analytics_basic: false, analytics_advanced: false, plan_type: 'FREE' });
    }
  };

  const hasFeature = (feature) => {
    if (!featureFlags) return false;
    return featureFlags[feature] === true;
  };

  const getCurrentPlan = () => {
    return featureFlags?.plan_type || 'FREE';
  };

  const fetchEvents = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API_URL}/api/admin/profiles/${profileId}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEvents(response.data.events || []);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('admin_token');
      if (!token) {
        navigate('/studio/login');
        return;
      }

      // Build query params
      const params = new URLSearchParams({ profile_id: profileId });
      if (selectedEvent) params.append('event_id', selectedEvent);
      if (startDate) params.append('start_date', new Date(startDate).toISOString());
      if (endDate) params.append('end_date', new Date(endDate).toISOString());

      const response = await axios.get(`${API_URL}/api/analytics/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setError(error.response?.data?.detail || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const params = new URLSearchParams({ profile_id: profileId });
      if (selectedEvent) params.append('event_id', selectedEvent);
      if (startDate) params.append('start_date', new Date(startDate).toISOString());
      if (endDate) params.append('end_date', new Date(endDate).toISOString());

      const response = await axios.get(`${API_URL}/api/analytics/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

      // Download file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `analytics_${profileId}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export analytics:', error);
      alert('Failed to export analytics data');
    }
  };

  if (loading && !analytics) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center" data-testid="analytics-loading">
        <div className="text-center">
          <div className="lux-mandala mx-auto" />
          <p className="mt-6 text-sm" style={{ color: 'var(--lux-text-muted)' }}>Reading the cosmos…</p>
        </div>
      </div>
    );
  }

  if (error && !analytics) {
    return (
      <div className="luxe min-h-screen relative" data-testid="analytics-page-degraded">
        <div className="px-4 md:px-12 py-10 max-w-7xl mx-auto">
          <button onClick={() => navigate('/studio/dashboard')} className="lux-btn lux-btn-ghost mb-6 inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="lux-eyebrow block mb-3">◆ Guest Intelligence</span>
          <h1 className="font-display text-[2.2rem] md:text-[3.6rem] leading-[1.05] mb-3" style={{ color: 'var(--lux-text)' }}>
            Analytics &amp; <span className="font-script italic text-gold">Insights</span>
          </h1>
          {/* PROMPT 16 — render new analytics even when legacy endpoint errors */}
          <AnalyticsExtrasSection profileId={profileId} />
        </div>
      </div>
    );
  }

  // Prepare chart data
  const viewsTrendData = analytics?.views?.views_by_date || [];
  const rsvpStatusData = [
    { name: 'Accepted', value: analytics?.rsvp?.accepted_count || 0, color: COLORS.success },
    { name: 'Declined', value: analytics?.rsvp?.declined_count || 0, color: COLORS.danger },
    { name: 'Pending', value: analytics?.rsvp?.pending_count || 0, color: COLORS.warning },
  ];
  const topEventsData = analytics?.rsvp?.rsvp_by_event || [];

  return (
    <div className="luxe min-h-screen relative" data-testid="analytics-page">
      <div className="lux-orbit" style={{ width: 800, height: 800, top: -240, right: -240 }} />

      {/* Header */}
      <div className="relative z-10 sticky top-0 backdrop-blur-md" style={{ background: 'rgba(10,10,15,0.85)', borderBottom: '1px solid var(--lux-border)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/studio/dashboard')}
                className="lux-btn lux-btn-ghost text-xs"
                data-testid="analytics-back"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div>
                <span className="lux-eyebrow block mb-1">◆ Phase 30 · Guest Intelligence</span>
                <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--lux-text)' }}>
                  Analytics &amp; <span className="font-script italic text-gold">Insights</span>
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleRefresh} disabled={refreshing} className="lux-btn lux-btn-ghost text-xs">
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <button onClick={handleExport} className="lux-btn text-xs">
                <Download className="w-4 h-4" /> Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* PROMPT 16 — AI Insights, heatmap, funnel, geography, PDF export */}
        <AnalyticsExtrasSection profileId={profileId} profileName={analytics?.profile_name} />

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
              <select
                value={selectedEvent}
                onChange={(e) => setSelectedEvent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Events</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.event_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={fetchAnalytics}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <MetricCard
            icon={<Eye className="w-6 h-6 text-blue-600" />}
            title="Total Views"
            value={analytics?.views?.total_views || 0}
            color="blue"
          />
          <MetricCard
            icon={<Users className="w-6 h-6 text-purple-600" />}
            title="Unique Visitors"
            value={analytics?.views?.unique_visitors || 0}
            color="purple"
          />
          <MetricCard
            icon={<UserCheck className="w-6 h-6 text-green-600" />}
            title="RSVPs"
            value={analytics?.rsvp?.total_rsvps || 0}
            subtitle={`${analytics?.rsvp?.conversion_rate || 0}% conversion`}
            color="green"
          />
          <MetricCard
            icon={<TrendingUp className="w-6 h-6 text-orange-600" />}
            title="Accepted"
            value={analytics?.rsvp?.accepted_count || 0}
            color="orange"
          />
        </div>

        {/* Device & Location Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Device Breakdown */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Device Breakdown</h3>
            <div className="space-y-3">
              <DeviceRow
                icon={<Smartphone className="w-5 h-5 text-blue-600" />}
                label="Mobile"
                count={analytics?.views?.mobile_views || 0}
                total={analytics?.views?.total_views || 1}
              />
              <DeviceRow
                icon={<Monitor className="w-5 h-5 text-purple-600" />}
                label="Desktop"
                count={analytics?.views?.desktop_views || 0}
                total={analytics?.views?.total_views || 1}
              />
              <DeviceRow
                icon={<Tablet className="w-5 h-5 text-green-600" />}
                label="Tablet"
                count={analytics?.views?.tablet_views || 0}
                total={analytics?.views?.total_views || 1}
              />
            </div>
          </div>

          {/* Top Locations */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <MapPin className="w-5 h-5 mr-2" />
              Top Locations
            </h3>
            <div className="space-y-2">
              {analytics?.views?.top_countries?.slice(0, 5).map((item, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-gray-700">{item.country}</span>
                  <span className="font-semibold text-gray-900">{item.count}</span>
                </div>
              ))}
              {(!analytics?.views?.top_countries || analytics.views.top_countries.length === 0) && (
                <p className="text-gray-500 text-sm">No location data yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Engagement Metrics */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Guest Engagement</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <EngagementStat
              icon={<Image className="w-5 h-5" />}
              label="Gallery Opens"
              value={analytics?.engagement?.gallery_opens || 0}
              color="blue"
            />
            <EngagementStat
              icon={<Play className="w-5 h-5" />}
              label="Video Plays"
              value={analytics?.engagement?.video_plays || 0}
              color="purple"
            />
            <EngagementStat
              icon={<Volume2 className="w-5 h-5" />}
              label="Music Unmutes"
              value={analytics?.engagement?.music_unmutes || 0}
              color="pink"
            />
            <EngagementStat
              icon={<Map className="w-5 h-5" />}
              label="Map Opens"
              value={analytics?.engagement?.map_opens || 0}
              color="green"
            />
            <EngagementStat
              icon={<Clock className="w-5 h-5" />}
              label="Avg. Time (sec)"
              value={Math.round(analytics?.engagement?.avg_time_spent_seconds || 0)}
              color="orange"
            />
          </div>

          {/* Scroll Depth */}
          <div className="mt-6">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Scroll Depth</h4>
            <div className="flex space-x-4">
              <ScrollDepthBar
                percentage={25}
                count={analytics?.engagement?.scroll_25_percent || 0}
              />
              <ScrollDepthBar
                percentage={50}
                count={analytics?.engagement?.scroll_50_percent || 0}
              />
              <ScrollDepthBar
                percentage={75}
                count={analytics?.engagement?.scroll_75_percent || 0}
              />
              <ScrollDepthBar
                percentage={100}
                count={analytics?.engagement?.scroll_100_percent || 0}
              />
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Views Trend */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Views Over Time</h3>
            {viewsTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={viewsTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke={COLORS.primary} name="Views" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                No view data available
              </div>
            )}
          </div>

          {/* RSVP Status */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">RSVP Status</h3>
            {rsvpStatusData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={rsvpStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {rsvpStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                No RSVP data available
              </div>
            )}
          </div>
        </div>

        {/* Top Events */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">RSVP by Event</h3>
          {topEventsData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topEventsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="event_name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="accepted" fill={COLORS.success} name="Accepted" />
                <Bar dataKey="declined" fill={COLORS.danger} name="Declined" />
                <Bar dataKey="pending" fill={COLORS.warning} name="Pending" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No event RSVP data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper Components
const MetricCard = ({ icon, title, value, subtitle, color }) => (
  <div className="bg-white rounded-lg shadow-sm p-6">
    <div className="flex items-center justify-between mb-2">
      {icon}
      <span className={`text-2xl font-bold text-${color}-600`}>{value}</span>
    </div>
    <h3 className="text-sm font-medium text-gray-700">{title}</h3>
    {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
  </div>
);

const DeviceRow = ({ icon, label, count, total }) => {
  const percentage = Math.round((count / total) * 100);
  return (
    <div className="flex items-center">
      {icon}
      <div className="ml-3 flex-1">
        <div className="flex justify-between text-sm mb-1">
          <span className="font-medium text-gray-700">{label}</span>
          <span className="text-gray-900">{count} ({percentage}%)</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const EngagementStat = ({ icon, label, value, color }) => (
  <div className="text-center">
    <div className={`inline-flex items-center justify-center w-10 h-10 bg-${color}-100 rounded-lg mb-2`}>
      {icon}
    </div>
    <div className="text-2xl font-bold text-gray-900">{value}</div>
    <div className="text-xs text-gray-600">{label}</div>
  </div>
);

const ScrollDepthBar = ({ percentage, count }) => (
  <div className="flex-1">
    <div className="text-center mb-1">
      <span className="text-sm font-medium text-gray-700">{percentage}%</span>
    </div>
    <div className="h-24 bg-gray-200 rounded-t-lg flex items-end">
      <div
        className="w-full bg-blue-600 rounded-t-lg"
        style={{ height: count > 0 ? `${Math.min((count / 100) * 100, 100)}%` : '0%' }}
      />
    </div>
    <div className="text-center mt-1">
      <span className="text-xs text-gray-600">{count}</span>
    </div>
  </div>
);

export default Phase30AnalyticsPage;
