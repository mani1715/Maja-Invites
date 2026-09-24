import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Eye, Palette, Sparkles, Settings } from 'lucide-react';
import axios from 'axios';
import ThemeSelector from '../components/ThemeSelector';
import ThemePreview from '../components/ThemePreview';
import { getThemeById, getPlanLabel } from '../themes/masterThemes';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

/**
 * PHASE 34: Theme Settings Page
 * Admin interface for managing premium themes
 */
const ThemeSettingsPage = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  // BUG 15 FIX: redirect logged-out visitors to /admin/login.
  const { admin, loading: authLoading } = useAuth();
  
  const [profile, setProfile] = useState(null);
  const [currentTheme, setCurrentTheme] = useState(null);
  const [themeSettings, setThemeSettings] = useState(null);
  const [previewTheme, setPreviewTheme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !admin) {
      navigate('/studio/login', { replace: true });
    }
  }, [authLoading, admin, navigate]);

  useEffect(() => {
    if (!authLoading && admin) fetchProfileAndTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, authLoading, admin]);

  const fetchProfileAndTheme = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      
      const profileResponse = await axios.get(
        `${BACKEND_URL}/api/admin/profiles/${profileId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfile(profileResponse.data);

      const themeResponse = await axios.get(
        `${BACKEND_URL}/api/profiles/${profileId}/theme`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setThemeSettings(themeResponse.data.theme_settings);
      setCurrentTheme(themeResponse.data.theme_data);
    } catch (error) {
      console.error('Error fetching theme data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleThemeSelect = async (themeId) => {
    try {
      setSaving(true);
      const token = localStorage.getItem('admin_token');
      
      await axios.put(
        `${BACKEND_URL}/api/profiles/${profileId}/theme`,
        { theme_id: themeId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchProfileAndTheme();
      alert('Theme updated successfully!');
    } catch (error) {
      console.error('Error updating theme:', error);
      if (error.response?.status === 403) {
        alert(error.response.data.detail);
      } else {
        alert('Failed to update theme');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSettingChange = async (key, value) => {
    try {
      const token = localStorage.getItem('admin_token');
      
      await axios.put(
        `${BACKEND_URL}/api/profiles/${profileId}/theme`,
        { [key]: value },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setThemeSettings(prev => ({ ...prev, [key]: value }));
    } catch (error) {
      console.error('Error updating setting:', error);
      alert('Failed to update setting');
    }
  };

  const handleApplyPreview = async (settings) => {
    try {
      setSaving(true);
      const token = localStorage.getItem('admin_token');
      
      await axios.put(
        `${BACKEND_URL}/api/profiles/${profileId}/theme`,
        settings,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchProfileAndTheme();
      setPreviewTheme(null);
      alert('Theme applied successfully!');
    } catch (error) {
      console.error('Error applying theme:', error);
      alert('Failed to apply theme');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  const userPlan = profile?.plan_type || 'FREE';

  return (
    <div className="luxe min-h-screen ">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(`/studio/profile/${profileId}/edit`)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Palette className="w-6 h-6 text-rose-600" />
                  Theme & Design Settings
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  {profile?.groom_name} & {profile?.bride_name}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-24">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-rose-600" />
                Current Theme
              </h3>

              {currentTheme && (
                <div>
                  <div
                    className="h-32 rounded-lg mb-4 flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${currentTheme.colors.primary} 0%, ${currentTheme.colors.accent} 100%)`
                    }}
                  >
                    <div
                      className="text-white text-center"
                      style={{ fontFamily: currentTheme.typography.heading }}
                    >
                      <div className="text-3xl font-bold drop-shadow-lg">Aa</div>
                    </div>
                  </div>

                  <h4 className="font-semibold text-gray-900 mb-1">{currentTheme.name}</h4>
                  <p className="text-sm text-gray-600 mb-4">{currentTheme.description}</p>

                  <div className="space-y-4 pt-4 border-t border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Settings className="w-4 h-4 inline mr-1" />
                        Animation Level
                      </label>
                      <select
                        value={themeSettings?.animation_level || 'subtle'}
                        onChange={(e) => handleSettingChange('animation_level', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                      >
                        <option value="none">None</option>
                        <option value="subtle">Subtle</option>
                        <option value="festive">Festive</option>
                      </select>
                    </div>

                    <div>
                      <label className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Glass Effect</span>
                        <button
                          onClick={() => handleSettingChange('glassmorphism_enabled', !themeSettings?.glassmorphism_enabled)}
                          className={`w-12 h-6 rounded-full transition-colors relative ${themeSettings?.glassmorphism_enabled ? 'bg-rose-600' : 'bg-gray-300'}`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${themeSettings?.glassmorphism_enabled ? 'translate-x-6' : ''}`}
                          />
                        </button>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Hero Type
                      </label>
                      <select
                        value={themeSettings?.hero_type || 'static'}
                        onChange={(e) => handleSettingChange('hero_type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                      >
                        <option value="static">Static Image</option>
                        <option value="video">Video</option>
                        <option value="animated">Animated</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => setPreviewTheme(currentTheme.id)}
                    className="w-full mt-6 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors flex items-center justify-center gap-2 font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    Preview Current Theme
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">
                Choose a Theme
              </h3>
              
              {saving && (
                <div className="mb-4 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
                  Saving changes...
                </div>
              )}

              <ThemeSelector
                profileId={profileId}
                currentThemeId={themeSettings?.theme_id}
                userPlan={userPlan}
                onThemeSelect={handleThemeSelect}
                onPreview={(theme) => setPreviewTheme(theme.id)}
              />
            </div>
          </div>
        </div>
      </div>

      {previewTheme && (
        <ThemePreview
          themeId={previewTheme}
          onClose={() => setPreviewTheme(null)}
          onApply={handleApplyPreview}
        />
      )}
    </div>
  );
};

export default ThemeSettingsPage;
