import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * PHASE 27: Wedding Album Uploader Component
 * 
 * Upload final wedding photos/videos for album
 * - Up to 50 media items
 * - Read-only for guests
 * - Lifetime access
 */
const WeddingAlbumUploader = ({ profileId }) => {
  const [loading, setLoading] = useState(true);
  const [albumMedia, setAlbumMedia] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [captions, setCaptions] = useState({});

  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  useEffect(() => {
    fetchAlbumMedia();
  }, [profileId]);

  const fetchAlbumMedia = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(
        `${backendUrl}/api/admin/profiles/${profileId}/album-media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAlbumMedia(response.data.media || []);
    } catch (error) {
      console.error('Error fetching album media:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const totalCount = albumMedia.length + files.length;

    if (totalCount > 50) {
      alert(`Maximum 50 media items allowed. You can add ${50 - albumMedia.length} more.`);
      return;
    }

    setSelectedFiles(files);
    
    // Initialize captions object
    const newCaptions = {};
    files.forEach(file => {
      newCaptions[file.name] = '';
    });
    setCaptions(newCaptions);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      setUploading(true);
      const token = localStorage.getItem('admin_token');
      const formData = new FormData();

      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      formData.append('captions', JSON.stringify(captions));

      const response = await axios.post(
        `${backendUrl}/api/admin/profiles/${profileId}/upload-album-media`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      alert(`Uploaded ${response.data.uploaded} media items successfully!`);
      setSelectedFiles([]);
      setCaptions({});
      fetchAlbumMedia();
    } catch (error) {
      console.error('Error uploading album media:', error);
      alert('Error uploading media. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (mediaId) => {
    if (!window.confirm('Are you sure you want to delete this media?')) return;

    try {
      const token = localStorage.getItem('admin_token');
      await axios.delete(
        `${backendUrl}/api/admin/profiles/${profileId}/album-media/${mediaId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Media deleted successfully!');
      fetchAlbumMedia();
    } catch (error) {
      console.error('Error deleting media:', error);
      alert('Error deleting media. Please try again.');
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
        📸 Wedding Album (PHASE 27)
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Upload final wedding photos and videos. Guests can view the album on the same invitation URL with lifetime access.
        <br />
        <span className="font-medium">Current: {albumMedia.length}/50 media items</span>
      </p>

      {/* Upload Section */}
      <div className="mb-8 border-2 border-dashed border-gray-300 rounded-lg p-6">
        <label className="block mb-4">
          <span className="text-sm font-medium text-gray-700 mb-2 block">
            Select Photos/Videos
          </span>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFileSelect}
            disabled={albumMedia.length >= 50}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 disabled:opacity-50"
          />
          <p className="text-xs text-gray-500 mt-2">
            Photos: JPG, PNG, WebP (max 10MB each) | Videos: MP4, WebM, MOV (max 50MB each)
          </p>
        </label>

        {selectedFiles.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">
              Selected Files ({selectedFiles.length})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center space-x-3 p-2 bg-gray-50 rounded">
                  <div className="flex-1">
                    <p className="text-sm text-gray-700 truncate">{file.name}</p>
                    <input
                      type="text"
                      placeholder="Add caption (optional)"
                      value={captions[file.name] || ''}
                      onChange={(e) => setCaptions(prev => ({ ...prev, [file.name]: e.target.value }))}
                      maxLength={200}
                      className="mt-1 w-full text-xs px-2 py-1 border border-gray-300 rounded focus:ring-rose-500 focus:border-rose-500"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 disabled:bg-gray-400 font-medium"
            >
              {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>

      {/* Album Media Grid */}
      {albumMedia.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-4">
            Uploaded Album Media ({albumMedia.length})
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {albumMedia.map((media) => (
              <div key={media.id} className="relative group">
                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  {media.media_type === 'photo' ? (
                    <img
                      src={`${backendUrl}${media.media_url}`}
                      alt={media.caption || 'Album photo'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <video
                      src={`${backendUrl}${media.media_url}`}
                      className="w-full h-full object-cover"
                      controls={false}
                    />
                  )}
                </div>
                
                {/* Caption */}
                {media.caption && (
                  <p className="text-xs text-gray-600 mt-1 truncate">{media.caption}</p>
                )}
                
                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(media.id)}
                  className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {/* Video Indicator */}
                {media.media_type === 'video' && (
                  <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white px-2 py-0.5 rounded text-xs flex items-center space-x-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6 4l8 6-8 6V4z" />
                    </svg>
                    <span>Video</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {albumMedia.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No media uploaded yet. Start building your wedding album!
        </div>
      )}
    </div>
  );
};

export default WeddingAlbumUploader;
