import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * PHASE 27: Thank You Message Editor Component
 * 
 * Allows admin to create/edit thank you message for guests
 * - Text or video message
 * - Optional scheduling
 * - Same message for all guests
 */
const ThankYouMessageEditor = ({ profileId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [thankYouData, setThankYouData] = useState({
    enabled: false,
    message_type: 'text',
    message_text: '',
    video_url: '',
    video_thumbnail: '',
    scheduled_date: null
  });
  const [videoFile, setVideoFile] = useState(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  useEffect(() => {
    fetchThankYouMessage();
  }, [profileId]);

  const fetchThankYouMessage = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(
        `${backendUrl}/api/admin/profiles/${profileId}/thank-you`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.exists !== false) {
        setThankYouData({
          enabled: response.data.enabled || false,
          message_type: response.data.message_type || 'text',
          message_text: response.data.message_text || '',
          video_url: response.data.video_url || '',
          video_thumbnail: response.data.video_thumbnail || '',
          scheduled_date: response.data.scheduled_date || null
        });
      }
    } catch (error) {
      console.error('Error fetching thank you message:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('admin_token');

      await axios.put(
        `${backendUrl}/api/admin/profiles/${profileId}/thank-you`,
        thankYouData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Thank you message saved successfully!');
    } catch (error) {
      console.error('Error saving thank you message:', error);
      alert('Error saving thank you message. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleVideoUpload = async () => {
    if (!videoFile) return;

    try {
      setUploadingVideo(true);
      const token = localStorage.getItem('admin_token');
      const formData = new FormData();
      formData.append('file', videoFile);
      formData.append('profile_id', profileId);
      formData.append('type', 'thank_you_video');

      // Upload video (assuming there's a generic video upload endpoint)
      const response = await axios.post(
        `${backendUrl}/api/admin/upload-video`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setThankYouData(prev => ({
        ...prev,
        video_url: response.data.video_url,
        video_thumbnail: response.data.thumbnail_url || ''
      }));

      alert('Video uploaded successfully!');
    } catch (error) {
      console.error('Error uploading video:', error);
      alert('Error uploading video. Please try again.');
    } finally {
      setUploadingVideo(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">
        💌 Thank You Message (PHASE 27)
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Send a heartfelt thank you message to all your guests after the wedding.
        This will be displayed on the same invitation URL.
      </p>

      {/* Enable/Disable Toggle */}
      <div className="mb-6">
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={thankYouData.enabled}
            onChange={(e) => setThankYouData(prev => ({ ...prev, enabled: e.target.checked }))}
            className="w-5 h-5 text-rose-600 border-gray-300 rounded focus:ring-rose-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Enable Thank You Message
          </span>
        </label>
      </div>

      {thankYouData.enabled && (
        <>
          {/* Message Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Type
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  value="text"
                  checked={thankYouData.message_type === 'text'}
                  onChange={(e) => setThankYouData(prev => ({ ...prev, message_type: e.target.value }))}
                  className="text-rose-600 focus:ring-rose-500"
                />
                <span className="text-sm text-gray-700">Text Message</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  value="video"
                  checked={thankYouData.message_type === 'video'}
                  onChange={(e) => setThankYouData(prev => ({ ...prev, message_type: e.target.value }))}
                  className="text-rose-600 focus:ring-rose-500"
                />
                <span className="text-sm text-gray-700">Video Message</span>
              </label>
            </div>
          </div>

          {/* Text Message */}
          {thankYouData.message_type === 'text' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Thank You Message
              </label>
              <textarea
                value={thankYouData.message_text}
                onChange={(e) => setThankYouData(prev => ({ ...prev, message_text: e.target.value }))}
                rows={6}
                maxLength={1000}
                placeholder="Express your gratitude to your guests..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-rose-500 focus:border-rose-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {thankYouData.message_text.length}/1000 characters
              </p>
            </div>
          )}

          {/* Video Message */}
          {thankYouData.message_type === 'video' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Thank You Video
              </label>
              {thankYouData.video_url ? (
                <div className="space-y-2">
                  <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                    <video
                      src={`${backendUrl}${thankYouData.video_url}`}
                      controls
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => setThankYouData(prev => ({ ...prev, video_url: '', video_thumbnail: '' }))}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove Video
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={(e) => setVideoFile(e.target.files[0])}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100"
                  />
                  {videoFile && (
                    <button
                      onClick={handleVideoUpload}
                      disabled={uploadingVideo}
                      className="px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 disabled:bg-gray-400 text-sm"
                    >
                      {uploadingVideo ? 'Uploading...' : 'Upload Video'}
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Recommended: 30-60 seconds, MP4 format, max 50MB
              </p>
            </div>
          )}

          {/* Optional Scheduling */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Schedule Delivery (Optional)
            </label>
            <input
              type="datetime-local"
              value={thankYouData.scheduled_date ? new Date(thankYouData.scheduled_date).toISOString().slice(0, 16) : ''}
              onChange={(e) => setThankYouData(prev => ({ ...prev, scheduled_date: e.target.value ? new Date(e.target.value).toISOString() : null }))}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-rose-500 focus:border-rose-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to publish immediately. Set a date to schedule for later.
            </p>
          </div>
        </>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 disabled:bg-gray-400 font-medium"
        >
          {saving ? 'Saving...' : 'Save Thank You Message'}
        </button>
      </div>
    </div>
  );
};

export default ThankYouMessageEditor;
