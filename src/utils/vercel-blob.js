import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { put } from '@vercel/blob';

dotenv.config({ quiet: true });


export const uploadBufferToVercel = async (buffer, filename) => {
  try {
    const blob = await put(`forumfile/${filename}`, buffer, {
      access: 'public', 
      token: process.env.VERCEL_BLOB_TOKEN 
    });
    return blob.url; 
  } catch (err) {
    console.error('Vercel blob upload failed:', err);
    throw new Error('Blob upload failed');
  }
};