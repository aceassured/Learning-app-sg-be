// // src/utils/vercel-blob.js
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { put } from '@vercel/blob';

dotenv.config({ quiet: true });

const VERCEL_BLOB_URL = process.env.VERCEL_BLOB_URL; // e.g. https://api.vercel.com/v1/blob
const VERCEL_TOKEN = process.env.VERCEL_BLOB_TOKEN;

// export const uploadBufferToVercel = async (buffer, filename) => {
//   // 1) create upload URL
//   const name = encodeURIComponent(filename);
//   const res = await fetch(`${VERCEL_BLOB_URL}/uploads?name=${name}`, {
//     method: 'POST',
//     headers: {
//       Authorization: `Bearer ${VERCEL_TOKEN}`,
//       'Content-Type': 'application/json'
//     },
//     body: JSON.stringify({ size: buffer.length })
//   });
//   const json = await res.json();
//   // json expects "uploadURL" and "id" depending on API; adjust per Vercel docs
//   const uploadURL = json.uploadURL || json.url;
//   if (!uploadURL) throw new Error('Vercel blob: no upload url');

//   // 2) PUT the bytes
//   const putRes = await fetch(uploadURL, {
//     method: 'PUT',
//     headers: { 'Content-Type': 'application/octet-stream' },
//     body: buffer
//   });
//   if (!putRes.ok) {
//     throw new Error('Failed to upload to Vercel Blob');
//   }
//   // final retrieved URL; depending on response shape, adapt:
//   // For simplicity assume json.fileUrl exists or construct based on id
//   const finalUrl = json.fileUrl || json.url || `${VERCEL_BLOB_URL}/${json.id}`;
//   return finalUrl;
// };


export const uploadBufferToVercel = async (buffer, filename) => {
  try {
    const blob = await put(`forumfile/${filename}`, buffer, {
      access: 'public', // Or 'private'
      token: process.env.VERCEL_BLOB_TOKEN // Must be your Read/Write token
    });
    return blob.url; // This is the public URL to the file
  } catch (err) {
    console.error('Vercel blob upload failed:', err);
    throw new Error('Blob upload failed');
  }
};