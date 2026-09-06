const crypto = require('node:crypto');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabase() {
  if (!supabase) {
    let url = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : null;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.trim() : null;
    
    if (url && key) {
      // Automatically sanitize URL if user included /rest/v1 or trailing slashes
      url = url.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
      try {
        supabase = createClient(url, key, { auth: { persistSession: false } });
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err.message);
        return null;
      }
    }
  }
  return supabase;
}

// ==========================================
// Password & Session Helpers
// ==========================================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const checkHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(checkHash, 'hex'));
}

async function createSession(userId, expiresInHours = 72) {
  const client = getSupabase();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + expiresInHours * 3600 * 1000;

  await client.from('sessions').insert({
    token,
    user_id: userId,
    expires_at: expiresAt
  });

  return { token, expiresAt };
}

async function validateSession(token) {
  if (!token) return null;
  const client = getSupabase();
  if (!client) return null;

  const now = Date.now();
  const { data: session, error } = await client
    .from('sessions')
    .select('token, user_id, expires_at, admin_users(username)')
    .eq('token', token)
    .gt('expires_at', now)
    .single();

  if (error || !session) return null;

  return {
    token: session.token,
    user_id: session.user_id,
    expires_at: session.expires_at,
    username: session.admin_users ? session.admin_users.username : 'admin'
  };
}

async function deleteSession(token) {
  if (!token) return;
  const client = getSupabase();
  if (!client) return;
  await client.from('sessions').delete().eq('token', token);
}

// ==========================================
// Storage Upload Helper
// ==========================================
async function uploadToStorage(fileName, base64Data) {
  const client = getSupabase();
  if (!client) throw new Error('Supabase client not initialized');

  const ext = path.extname(fileName || 'image.png').toLowerCase() || '.png';
  const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const buffer = Buffer.from(base64Data, 'base64');

  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const { error } = await client.storage
    .from('portfolio')
    .upload(safeName, buffer, {
      contentType,
      upsert: false
    });

  if (error) {
    throw new Error(`Supabase Storage upload error: ${error.message}`);
  }

  const { data } = client.storage.from('portfolio').getPublicUrl(safeName);
  return data.publicUrl;
}

module.exports = {
  getSupabase,
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession,
  uploadToStorage
};
