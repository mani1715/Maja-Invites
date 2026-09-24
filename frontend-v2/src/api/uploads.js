import axios from 'axios';
import client from './client';

// Direct-to-S3 presigned uploads — storage_upload.py. The app server never
// sees the file bytes: presign() hands back a policy, the browser POSTs
// straight to S3, then commit() tells the app the object landed.
export const presign = ({ area, content_type, size_bytes, event_id, filename }) =>
  client.post('/api/uploads/presign', { area, content_type, size_bytes, event_id, filename });

export const commit = ({ key, area, event_id, filename }) =>
  client.post('/api/uploads/commit', { key, area, event_id, filename });

// POST straight to S3 with the presigned policy fields — a bare axios call
// (no baseURL, no auth header, no withCredentials: this goes to S3, not us).
export const postToS3 = (url, fields, file) => {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', file);
  return axios.post(url, form);
};

// One file, full presign -> S3 -> commit round trip.
export const uploadViaPresign = async (file, { area, event_id }) => {
  const { data: signed } = await presign({
    area, content_type: file.type, size_bytes: file.size, event_id, filename: file.name,
  });
  await postToS3(signed.url, signed.fields, file);
  const { data } = await commit({ key: signed.key, area, event_id, filename: file.name });
  return data;
};

// Session-based single/multipart uploads — upload_sessions_service.py. Used
// by lib/multipartUploader.js. Unlike presign/commit above, the S3 PUTs here
// use plain fetch (not this client), so these wrappers only cover the
// control-plane calls; `config` lets the caller pass an AbortSignal through.
export const createMediaSession = (payload, config) =>
  client.post('/api/media/upload-sessions', payload, config);

export const getMediaSession = (sessionId, config) =>
  client.get(`/api/media/upload-sessions/${sessionId}`, config);

export const presignParts = (sessionId, partNumbers, config) =>
  client.post(`/api/media/upload-sessions/${sessionId}/parts`, { part_numbers: partNumbers }, config);

export const completeMediaSession = (sessionId, body, config) =>
  client.post(`/api/media/upload-sessions/${sessionId}/complete`, body, config);

export const abortMediaSession = (sessionId, config) =>
  client.post(`/api/media/upload-sessions/${sessionId}/abort`, {}, config);
