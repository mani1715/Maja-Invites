import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Check, X, Trash2, Filter, MessageSquare } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

function GreetingsManagement() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  // BUG 15 FIX: redirect logged-out visitors to /admin/login.
  const { admin, loading: authLoading } = useAuth();
  const [greetings, setGreetings] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // all, pending, approved, rejected
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });

  useEffect(() => {
    if (!authLoading && !admin) {
      navigate('/studio/login', { replace: true });
    }
  }, [authLoading, admin, navigate]);

  const fetchProfileAndGreetings = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token');
      
      // Fetch profile
      const profileRes = await axios.get(`${BACKEND_URL}/api/admin/profiles/${profileId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfile(profileRes.data);

      // Fetch greetings with filter
      const greetingsUrl = statusFilter === 'all' 
        ? `${BACKEND_URL}/api/admin/profiles/${profileId}/greetings`
        : `${BACKEND_URL}/api/admin/profiles/${profileId}/greetings?status=${statusFilter}`;
      
      const greetingsRes = await axios.get(greetingsUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGreetings(greetingsRes.data);

      // Calculate stats
      const allGreetingsRes = await axios.get(`${BACKEND_URL}/api/admin/profiles/${profileId}/greetings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const allGreetings = allGreetingsRes.data;
      setStats({
        total: allGreetings.length,
        pending: allGreetings.filter(g => g.approval_status === 'pending').length,
        approved: allGreetings.filter(g => g.approval_status === 'approved').length,
        rejected: allGreetings.filter(g => g.approval_status === 'rejected').length,
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching greetings:', error);
      setLoading(false);
    }
  }, [profileId, statusFilter]);

  useEffect(() => {
    fetchProfileAndGreetings();
  }, [fetchProfileAndGreetings]);

  const handleApprove = async (greetingId) => {
    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(`${BACKEND_URL}/api/admin/greetings/${greetingId}/approve`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchProfileAndGreetings();
    } catch (error) {
      console.error('Error approving greeting:', error);
      alert('Failed to approve greeting');
    }
  };

  const handleReject = async (greetingId) => {
    try {
      const token = localStorage.getItem('admin_token');
      await axios.put(`${BACKEND_URL}/api/admin/greetings/${greetingId}/reject`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchProfileAndGreetings();
    } catch (error) {
      console.error('Error rejecting greeting:', error);
      alert('Failed to reject greeting');
    }
  };

  const handleDelete = async (greetingId) => {
    if (!window.confirm('Are you sure you want to delete this greeting? This action cannot be undone.')) {
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      await axios.delete(`${BACKEND_URL}/api/admin/greetings/${greetingId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchProfileAndGreetings();
    } catch (error) {
      console.error('Error deleting greeting:', error);
      alert('Failed to delete greeting');
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading greetings...</div>
      </div>
    );
  }

  return (
    <div className="luxe min-h-screen py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/studio/dashboard')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Dashboard
          </button>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-2">
              <MessageSquare className="w-6 h-6 text-purple-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">Wishes Management</h1>
            </div>
            {profile && (
              <p className="text-gray-600">
                {profile.groom_name} & {profile.bride_name}
              </p>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600">Total Wishes</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-4">
            <p className="text-sm text-yellow-800">Pending</p>
            <p className="text-2xl font-bold text-yellow-900">{stats.pending}</p>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-4">
            <p className="text-sm text-green-800">Approved</p>
            <p className="text-2xl font-bold text-green-900">{stats.approved}</p>
          </div>
          <div className="bg-red-50 rounded-lg shadow p-4">
            <p className="text-sm text-red-800">Rejected</p>
            <p className="text-2xl font-bold text-red-900">{stats.rejected}</p>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <div className="flex space-x-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 rounded ${
                  statusFilter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({stats.total})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-4 py-2 rounded ${
                  statusFilter === 'pending'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Pending ({stats.pending})
              </button>
              <button
                onClick={() => setStatusFilter('approved')}
                className={`px-4 py-2 rounded ${
                  statusFilter === 'approved'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Approved ({stats.approved})
              </button>
              <button
                onClick={() => setStatusFilter('rejected')}
                className={`px-4 py-2 rounded ${
                  statusFilter === 'rejected'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Rejected ({stats.rejected})
              </button>
            </div>
          </div>
        </div>

        {/* Greetings List */}
        <div className="space-y-4">
          {greetings.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No wishes found for this filter.
            </div>
          ) : (
            greetings.map((greeting) => (
              <div key={greeting.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{greeting.guest_name}</h3>
                      <span className={`text-xs px-2 py-1 rounded ${getStatusBadgeColor(greeting.approval_status)}`}>
                        {greeting.approval_status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{formatDate(greeting.created_at)}</p>
                    <p className="text-gray-800 whitespace-pre-wrap">{greeting.message}</p>
                  </div>
                </div>

                <div className="flex space-x-2 pt-4 border-t">
                  {greeting.approval_status !== 'approved' && (
                    <button
                      onClick={() => handleApprove(greeting.id)}
                      className="flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Approve
                    </button>
                  )}
                  {greeting.approval_status !== 'rejected' && (
                    <button
                      onClick={() => handleReject(greeting.id)}
                      className="flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Reject
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(greeting.id)}
                    className="flex items-center px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default GreetingsManagement;
