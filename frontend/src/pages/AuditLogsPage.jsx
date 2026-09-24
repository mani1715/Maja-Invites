import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, User, FileText, Copy, Trash2, Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const AuditLogsPage = () => {
  const navigate = useNavigate();
  // BUG N FIX: page used to be accessible without any auth handling, leaving
  // logged-out visitors on a 401-shaped error screen. Bounce them to
  // /admin/login instead.
  const { admin, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!admin) { navigate('/studio/login', { replace: true }); return; }
    fetchAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, admin]);

  const fetchAuditLogs = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API_URL}/api/admin/audit-logs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setLogs(response.data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        setError('You are not authorized. Please log in again.');
      } else {
        setError('Failed to load audit logs');
      }
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'profile_create':
        return <FileText className="h-4 w-4 text-green-600" />;
      case 'profile_update':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'profile_delete':
        return <Trash2 className="h-4 w-4 text-red-600" />;
      case 'profile_duplicate':
        return <Copy className="h-4 w-4 text-purple-600" />;
      case 'template_save':
        return <Save className="h-4 w-4 text-amber-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionLabel = (action) => {
    switch (action) {
      case 'profile_create':
        return 'Created Profile';
      case 'profile_update':
        return 'Updated Profile';
      case 'profile_delete':
        return 'Deleted Profile';
      case 'profile_duplicate':
        return 'Duplicated Profile';
      case 'template_save':
        return 'Saved as Template';
      default:
        return action;
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'profile_create':
        return 'bg-green-50 border-green-200';
      case 'profile_update':
        return 'bg-blue-50 border-blue-200';
      case 'profile_delete':
        return 'bg-red-50 border-red-200';
      case 'profile_duplicate':
        return 'bg-purple-50 border-purple-200';
      case 'template_save':
        return 'bg-amber-50 border-amber-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getProfileNames = (details) => {
    if (details?.groom_name && details?.bride_name) {
      return `${details.groom_name} & ${details.bride_name}`;
    }
    return 'N/A';
  };

  if (loading) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading audit logs...</p>
      </div>
    );
  }

  return (
    <div className="luxe min-h-screen py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/studio/dashboard')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Audit Logs List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Admin Activity History
            </CardTitle>
            <p className="text-sm text-gray-600 mt-2">
              Last 1000 admin actions (newest first)
            </p>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No audit logs found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 border rounded-lg ${getActionColor(log.action)}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        {/* Action Icon */}
                        <div className="mt-1">
                          {getActionIcon(log.action)}
                        </div>

                        {/* Action Details */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 mb-1">
                            {getActionLabel(log.action)}
                          </div>
                          
                          <div className="text-sm text-gray-600 space-y-1">
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3" />
                              <span>Admin ID: {log.admin_id.slice(0, 8)}...</span>
                            </div>
                            
                            {log.profile_slug && (
                              <div className="flex items-center gap-2">
                                <FileText className="h-3 w-3" />
                                <span>Slug: {log.profile_slug}</span>
                              </div>
                            )}
                            
                            {log.details && (
                              <div className="mt-2 text-gray-700">
                                <span className="font-medium">
                                  {getProfileNames(log.details)}
                                </span>
                                {log.details.event_type && (
                                  <span className="text-gray-600">
                                    {' '}• {log.details.event_type}
                                  </span>
                                )}
                              </div>
                            )}

                            {log.action === 'profile_duplicate' && log.details?.original_slug && (
                              <div className="text-xs text-gray-500 mt-1">
                                Duplicated from: {log.details.original_slug}
                              </div>
                            )}

                            {log.action === 'profile_update' && log.details?.updated_fields && (
                              <div className="text-xs text-gray-500 mt-1">
                                Updated fields: {log.details.updated_fields.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="text-xs text-gray-500 whitespace-nowrap flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(log.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Footer */}
        {logs.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Showing {logs.length} audit log{logs.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogsPage;
