import axios from 'axios';
import api from './client';

export const listFiles = (params) => api.get('/files', { params }).then((r) => r.data);
export const getFile = (id) => api.get(`/files/${id}`).then((r) => r.data.data);
export const createUploadUrl = (body) => api.post('/files/upload-url', body).then((r) => r.data.data);
export const confirmUpload = (id) => api.post(`/files/${id}/confirm`).then((r) => r.data.data);
export const getDownloadUrl = (id) => api.get(`/files/${id}/download-url`).then((r) => r.data.data);
export const deleteFile = (id) => api.delete(`/files/${id}`).then((r) => r.data.data);
export const lockFile = (id, reason) => api.patch(`/files/${id}/lock`, reason ? { reason } : {}).then((r) => r.data.data);
export const unlockFile = (id) => api.patch(`/files/${id}/unlock`).then((r) => r.data.data);
export const releaseFile = (id, note) => api.patch(`/files/${id}/release`, note ? { note } : {}).then((r) => r.data.data);

// Browser -> S3 directly with the pre-signed URL. A plain axios call is used on purpose:
// our API client would add the Bearer token, which must never be sent to S3.
export const putToS3 = ({ uploadUrl, headers, file, onProgress, signal }) =>
  axios.put(uploadUrl, file, {
    headers,
    timeout: 0,
    signal,
    onUploadProgress: (e) => { if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100)); },
  });
