const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'portfolio.db');
const db = new DatabaseSync(DB_PATH);

// Enable foreign keys and WAL mode for reliability
db.exec('PRAGMA foreign_keys = ON;');

// Initialize schema (schema.sql is located in the codebase directory)
const schemaPath = path.join(__dirname, 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}

// Security & Password Helpers
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const checkHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(checkHash, 'hex'));
}

// Session Helpers
function createSession(userId, expiresInHours = 72) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + expiresInHours * 3600 * 1000;
  
  const stmt = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
  stmt.run(token, userId, expiresAt);
  return { token, expiresAt };
}

function validateSession(token) {
  if (!token) return null;
  const stmt = db.prepare(`
    SELECT s.token, s.user_id, s.expires_at, u.username 
    FROM sessions s
    JOIN admin_users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `);
  const session = stmt.get(token, Date.now());
  return session || null;
}

function deleteSession(token) {
  if (!token) return;
  const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
  stmt.run(token);
}

// Clean expired sessions periodically
function cleanExpiredSessions() {
  try {
    const stmt = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
    stmt.run(Date.now());
  } catch (e) {
    console.error('Failed to clean expired sessions:', e);
  }
}

setInterval(cleanExpiredSessions, 3600 * 1000);

module.exports = {
  db,
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession
};
