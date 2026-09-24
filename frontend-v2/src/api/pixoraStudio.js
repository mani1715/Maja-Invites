import client from './client';

// Pixora Community — studio (photographer) panel calls, Bearer admin_token identity.
// ponytail: '@/api/pixora' (the shared cross-panel namespace W4 owns) had not
// landed in this tree yet at the time this lane was built, and guessing its
// export shape would risk a runtime mismatch worse than owning these calls
// here. If '@/api/pixora' lands later, StudioCommunity.jsx's feed/post calls
// can be pointed at it in a follow-up — everything below is a thin client.get
// wrapper so that swap is mechanical.

export const me = () => client.get('/api/pixora/me');
export const postMeta = () => client.get('/api/pixora/post-meta');
export const portfolioProfile = () => client.get('/api/portfolio/profile');

// ---- Feed ----
export const getFeed = () => client.get('/api/pixora/feed');
export const createPost = (payload) => client.post('/api/pixora/posts', payload);
export const updatePost = (id, payload) => client.put(`/api/pixora/posts/${id}`, payload);
export const deletePost = (id) => client.delete(`/api/pixora/posts/${id}`);
export const likePost = (id) => client.post(`/api/pixora/posts/${id}/like`, {});
export const savePost = (id) => client.post(`/api/pixora/posts/${id}/save`, {});
export const listComments = (postId) => client.get(`/api/pixora/posts/${postId}/comments`);
export const addComment = (postId, body) => client.post(`/api/pixora/posts/${postId}/comment`, { body });
export const deleteComment = (id) => client.delete(`/api/pixora/comments/${id}`);

// ---- Shared media upload (multipart) ----
export const uploadMedia = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return client.post('/api/pixora/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// ---- Reels ----
export const listReels = () => client.get('/api/pixora/reels');
export const createReel = (payload) => client.post('/api/pixora/reels', payload);
export const deleteReel = (id) => client.delete(`/api/pixora/reels/${id}`);

// ---- Stories ----
export const listStories = () => client.get('/api/pixora/stories');
export const createStory = (payload) => client.post('/api/pixora/stories', payload);
export const deleteStory = (id) => client.delete(`/api/pixora/stories/${id}`);
