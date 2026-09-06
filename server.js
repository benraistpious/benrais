const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  db,
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession
} = require('./data/db');
const { seed } = require('./data/seed');

// Load .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2] || '';
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val.trim();
      }
    }
  }
}

// Run seed on boot to ensure initial local SQLite data exists
if (!process.env.SUPABASE_URL) {
  seed();
}

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8'
};

// Request Helpers
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function getAuthToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const cookies = parseCookies(req);
  return cookies.session || null;
}

function requireAuth(req, res) {
  const token = getAuthToken(req);
  const session = validateSession(token);
  if (!session) {
    sendJson(res, 401, { status: 'error', message: 'Unauthorized. Please log in.' });
    return null;
  }
  return session;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Limit to 50MB payload
      if (body.length > 50 * 1024 * 1024) {
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// Server Handler
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  try {
    // If Supabase is configured, route /api/* directly to serverless handler
    if (process.env.SUPABASE_URL && pathname.startsWith('/api/')) {
      const serverlessHandler = require('./api/index');
      return await serverlessHandler(req, res);
    }

    // ==========================================
    // 1. AUTHENTICATION ROUTES
    // ==========================================
    if (pathname === '/api/auth/login' && method === 'POST') {
      const { username, password } = await readBody(req);
      if (!username || !password) {
        return sendJson(res, 400, { status: 'error', message: 'Username and password required' });
      }

      const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
      if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
        return sendJson(res, 401, { status: 'error', message: 'Invalid username or password' });
      }

      const { token, expiresAt } = createSession(user.id);
      res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${72 * 3600}`);
      return sendJson(res, 200, {
        status: 'success',
        token,
        expiresAt,
        user: { id: user.id, username: user.username }
      });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const token = getAuthToken(req);
      if (token) deleteSession(token);
      res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
      return sendJson(res, 200, { status: 'success', message: 'Logged out successfully' });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const session = requireAuth(req, res);
      if (!session) return;
      return sendJson(res, 200, { status: 'success', user: { id: session.user_id, username: session.username } });
    }

    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const session = requireAuth(req, res);
      if (!session) return;

      const { currentPassword, newPassword } = await readBody(req);
      if (!currentPassword || !newPassword) {
        return sendJson(res, 400, { status: 'error', message: 'Both current and new password are required' });
      }

      const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(session.user_id);
      if (!verifyPassword(currentPassword, user.password_hash, user.salt)) {
        return sendJson(res, 400, { status: 'error', message: 'Incorrect current password' });
      }

      const { hash, salt } = hashPassword(newPassword);
      db.prepare('UPDATE admin_users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
      return sendJson(res, 200, { status: 'success', message: 'Password updated successfully' });
    }

    // ==========================================
    // 2. PUBLIC API ROUTES (Published only)
    // ==========================================
    if (pathname === '/api/public/categories' && method === 'GET') {
      const categories = db.prepare('SELECT * FROM categories ORDER BY display_order ASC').all();
      return sendJson(res, 200, { status: 'success', data: categories });
    }

    if (pathname === '/api/public/projects' && method === 'GET') {
      const category = parsedUrl.searchParams.get('category');
      const featured = parsedUrl.searchParams.get('featured');

      let query = `
        SELECT p.*, c.name as category_name, c.slug as category_slug
        FROM projects p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.published = 1
      `;
      const params = [];

      if (category && category !== 'all') {
        query += ' AND (p.category_id = ? OR c.slug = ?)';
        params.push(category, category);
      }

      if (featured === 'true' || featured === '1') {
        query += ' AND p.featured = 1';
      }

      query += ' ORDER BY p.display_order ASC, p.created_at DESC';

      const projects = db.prepare(query).all(...params);

      // Fetch images for each project
      const imgStmt = db.prepare('SELECT image_url FROM project_images WHERE project_id = ? ORDER BY display_order ASC');
      for (const p of projects) {
        const rows = imgStmt.all(p.id);
        p.images = rows.map(r => r.image_url);
        // Also provide JSON string for backwards compatibility with cms-frontend.js
        p.imagesJson = JSON.stringify(p.images);
      }

      return sendJson(res, 200, { status: 'success', data: projects });
    }

    // Match /api/public/projects/:idOrSlug
    if (pathname.startsWith('/api/public/projects/') && method === 'GET') {
      const idOrSlug = pathname.replace('/api/public/projects/', '');
      const project = db.prepare(`
        SELECT p.*, c.name as category_name, c.slug as category_slug
        FROM projects p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE (p.id = ? OR p.slug = ?) AND p.published = 1
      `).get(idOrSlug, idOrSlug);

      if (!project) {
        return sendJson(res, 404, { status: 'error', message: 'Project not found' });
      }

      const imgRows = db.prepare('SELECT image_url FROM project_images WHERE project_id = ? ORDER BY display_order ASC').all(project.id);
      project.images = imgRows.map(r => r.image_url);
      project.imagesJson = JSON.stringify(project.images);

      return sendJson(res, 200, { status: 'success', data: project });
    }

    if (pathname === '/api/public/about' && method === 'GET') {
      const rows = db.prepare('SELECT key, value FROM about_settings').all();
      const settings = {};
      rows.forEach(r => { settings[r.key] = r.value; });
      return sendJson(res, 200, { status: 'success', data: settings });
    }

    if (pathname === '/api/public/experience' && method === 'GET') {
      const rows = db.prepare('SELECT * FROM experience ORDER BY display_order ASC, created_at DESC').all();
      return sendJson(res, 200, { status: 'success', data: rows });
    }

    // ==========================================
    // 3. ADMIN CMS ROUTES (Protected)
    // ==========================================
    if (pathname === '/api/admin/stats' && method === 'GET') {
      const session = requireAuth(req, res);
      if (!session) return;

      const totalProjects = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
      const publishedProjects = db.prepare('SELECT COUNT(*) as c FROM projects WHERE published = 1').get().c;
      const draftProjects = db.prepare('SELECT COUNT(*) as c FROM projects WHERE published = 0').get().c;
      const totalCategories = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;

      const recentProjects = db.prepare(`
        SELECT p.id, p.title, p.category_id, p.cover_image, p.published, p.featured, p.created_at, c.name as category_name
        FROM projects p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.created_at DESC LIMIT 5
      `).all();

      return sendJson(res, 200, {
        status: 'success',
        data: {
          totalProjects,
          publishedProjects,
          draftProjects,
          totalCategories,
          recentProjects
        }
      });
    }

    // Projects CRUD
    if (pathname === '/api/admin/projects' && method === 'GET') {
      const session = requireAuth(req, res);
      if (!session) return;

      const category = parsedUrl.searchParams.get('category');
      const status = parsedUrl.searchParams.get('status');
      const search = parsedUrl.searchParams.get('search');

      let query = `
        SELECT p.*, c.name as category_name, c.slug as category_slug
        FROM projects p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE 1=1
      `;
      const params = [];

      if (category && category !== 'all') {
        query += ' AND (p.category_id = ? OR c.slug = ?)';
        params.push(category, category);
      }

      if (status === 'published') {
        query += ' AND p.published = 1';
      } else if (status === 'draft') {
        query += ' AND p.published = 0';
      }

      if (search) {
        query += ' AND (p.title LIKE ? OR p.client LIKE ? OR p.description LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
      }

      query += ' ORDER BY p.display_order ASC, p.created_at DESC';

      const projects = db.prepare(query).all(...params);
      const imgStmt = db.prepare('SELECT id, image_url, display_order FROM project_images WHERE project_id = ? ORDER BY display_order ASC');
      for (const p of projects) {
        p.images = imgStmt.all(p.id);
      }

      return sendJson(res, 200, { status: 'success', data: projects });
    }

    if (pathname === '/api/admin/projects' && method === 'POST') {
      const session = requireAuth(req, res);
      if (!session) return;

      const data = await readBody(req);
      if (!data.title) {
        return sendJson(res, 400, { status: 'error', message: 'Project title is required' });
      }

      const id = crypto.randomUUID();
      let baseSlug = data.slug ? slugify(data.slug) : slugify(data.title);
      if (!baseSlug) baseSlug = 'project';

      // Ensure slug uniqueness
      let slug = baseSlug;
      let counter = 1;
      while (db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug)) {
        slug = `${baseSlug}-${counter++}`;
      }

      // Max display order + 1
      const maxOrderRow = db.prepare('SELECT MAX(display_order) as maxOrder FROM projects').get();
      const displayOrder = Number.isInteger(data.display_order) ? data.display_order : ((maxOrderRow.maxOrder || 0) + 1);

      const now = new Date().toISOString();
      const insertStmt = db.prepare(`
        INSERT INTO projects (
          id, title, slug, category_id, client, year,
          short_description, description, design_objective,
          tools, tags, cover_image, featured, published, display_order,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        id,
        data.title,
        slug,
        data.category_id || 'posters',
        data.client || '',
        data.year || new Date().getFullYear().toString(),
        data.short_description || '',
        data.description || '',
        data.design_objective || '',
        data.tools || '',
        data.tags || '',
        data.cover_image || '',
        data.featured ? 1 : 0,
        data.published !== undefined ? (data.published ? 1 : 0) : 1,
        displayOrder,
        now,
        now
      );

      // Insert Gallery Images
      if (Array.isArray(data.images)) {
        const imgStmt = db.prepare('INSERT INTO project_images (id, project_id, image_url, display_order, created_at) VALUES (?, ?, ?, ?, ?)');
        data.images.forEach((img, idx) => {
          const url = typeof img === 'string' ? img : img.image_url;
          if (url) {
            imgStmt.run(crypto.randomUUID(), id, url, idx, now);
          }
        });
      }

      return sendJson(res, 201, { status: 'success', id, slug });
    }

    // Reorder projects
    if (pathname === '/api/admin/projects/reorder' && method === 'PATCH') {
      const session = requireAuth(req, res);
      if (!session) return;

      const { projectIds } = await readBody(req);
      if (Array.isArray(projectIds)) {
        const stmt = db.prepare('UPDATE projects SET display_order = ? WHERE id = ?');
        projectIds.forEach((id, idx) => {
          stmt.run(idx + 1, id);
        });
      }
      return sendJson(res, 200, { status: 'success', message: 'Projects reordered' });
    }

    // Duplicate project
    if (pathname.startsWith('/api/admin/projects/') && pathname.endsWith('/duplicate') && method === 'POST') {
      const session = requireAuth(req, res);
      if (!session) return;

      const sourceId = pathname.replace('/api/admin/projects/', '').replace('/duplicate', '');
      const source = db.prepare('SELECT * FROM projects WHERE id = ?').get(sourceId);
      if (!source) {
        return sendJson(res, 404, { status: 'error', message: 'Source project not found' });
      }

      const newId = crypto.randomUUID();
      const newTitle = `${source.title} (Copy)`;
      const baseSlug = `${source.slug}-copy`;

      let slug = baseSlug;
      let counter = 1;
      while (db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug)) {
        slug = `${baseSlug}-${counter++}`;
      }

      const maxOrderRow = db.prepare('SELECT MAX(display_order) as maxOrder FROM projects').get();
      const newOrder = (maxOrderRow.maxOrder || 0) + 1;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO projects (
          id, title, slug, category_id, client, year,
          short_description, description, design_objective,
          tools, tags, cover_image, featured, published, display_order,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId,
        newTitle,
        slug,
        source.category_id,
        source.client,
        source.year,
        source.short_description,
        source.description,
        source.design_objective,
        source.tools,
        source.tags,
        source.cover_image,
        source.featured,
        0, // Duplicates start as Draft
        newOrder,
        now,
        now
      );

      // Duplicate images
      const images = db.prepare('SELECT * FROM project_images WHERE project_id = ? ORDER BY display_order ASC').all(sourceId);
      const imgInsert = db.prepare('INSERT INTO project_images (id, project_id, image_url, display_order, created_at) VALUES (?, ?, ?, ?, ?)');
      for (const img of images) {
        imgInsert.run(crypto.randomUUID(), newId, img.image_url, img.display_order, now);
      }

      return sendJson(res, 201, { status: 'success', id: newId, slug, title: newTitle });
    }

    // Toggle Status (Publish/Draft)
    if (pathname.startsWith('/api/admin/projects/') && pathname.endsWith('/status') && method === 'PATCH') {
      const session = requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '').replace('/status', '');
      const { published } = await readBody(req);
      db.prepare('UPDATE projects SET published = ?, updated_at = ? WHERE id = ?').run(published ? 1 : 0, new Date().toISOString(), id);
      return sendJson(res, 200, { status: 'success', message: 'Status updated' });
    }

    // Toggle Featured
    if (pathname.startsWith('/api/admin/projects/') && pathname.endsWith('/featured') && method === 'PATCH') {
      const session = requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '').replace('/featured', '');
      const { featured } = await readBody(req);
      db.prepare('UPDATE projects SET featured = ?, updated_at = ? WHERE id = ?').run(featured ? 1 : 0, new Date().toISOString(), id);
      return sendJson(res, 200, { status: 'success', message: 'Featured status updated' });
    }

    // Single Project GET, PUT, DELETE
    if (pathname.startsWith('/api/admin/projects/') && method === 'GET') {
      const session = requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '');
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
      if (!project) return sendJson(res, 404, { status: 'error', message: 'Project not found' });

      project.images = db.prepare('SELECT id, image_url, display_order FROM project_images WHERE project_id = ? ORDER BY display_order ASC').all(id);
      return sendJson(res, 200, { status: 'success', data: project });
    }

    if (pathname.startsWith('/api/admin/projects/') && method === 'PUT') {
      const session = requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '');
      const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { status: 'error', message: 'Project not found' });

      const data = await readBody(req);
      const now = new Date().toISOString();

      let slug = data.slug ? slugify(data.slug) : slugify(data.title);
      // Ensure slug uniqueness (excluding current)
      let finalSlug = slug;
      let counter = 1;
      while (db.prepare('SELECT id FROM projects WHERE slug = ? AND id != ?').get(finalSlug, id)) {
        finalSlug = `${slug}-${counter++}`;
      }

      db.prepare(`
        UPDATE projects SET
          title = ?, slug = ?, category_id = ?, client = ?, year = ?,
          short_description = ?, description = ?, design_objective = ?,
          tools = ?, tags = ?, cover_image = ?, featured = ?, published = ?,
          display_order = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.title,
        finalSlug,
        data.category_id,
        data.client || '',
        data.year || '',
        data.short_description || '',
        data.description || '',
        data.design_objective || '',
        data.tools || '',
        data.tags || '',
        data.cover_image || '',
        data.featured ? 1 : 0,
        data.published ? 1 : 0,
        data.display_order || 0,
        now,
        id
      );

      // Replace gallery images if provided
      if (Array.isArray(data.images)) {
        db.prepare('DELETE FROM project_images WHERE project_id = ?').run(id);
        const imgStmt = db.prepare('INSERT INTO project_images (id, project_id, image_url, display_order, created_at) VALUES (?, ?, ?, ?, ?)');
        data.images.forEach((img, idx) => {
          const url = typeof img === 'string' ? img : img.image_url;
          if (url) {
            imgStmt.run(crypto.randomUUID(), id, url, idx, now);
          }
        });
      }

      return sendJson(res, 200, { status: 'success', message: 'Project updated' });
    }

    if (pathname.startsWith('/api/admin/projects/') && method === 'DELETE') {
      const session = requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '');
      db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      return sendJson(res, 200, { status: 'success', message: 'Project deleted' });
    }

    // Categories CRUD
    if (pathname === '/api/admin/categories' && method === 'GET') {
      const session = requireAuth(req, res);
      if (!session) return;

      const categories = db.prepare('SELECT * FROM categories ORDER BY display_order ASC').all();
      return sendJson(res, 200, { status: 'success', data: categories });
    }

    if (pathname === '/api/admin/categories' && method === 'POST') {
      const session = requireAuth(req, res);
      if (!session) return;

      const data = await readBody(req);
      if (!data.name) return sendJson(res, 400, { status: 'error', message: 'Category name required' });

      const slug = data.slug ? slugify(data.slug) : slugify(data.name);
      const id = data.id ? slugify(data.id) : slug;

      const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM categories').get().m || 0;
      db.prepare(`
        INSERT INTO categories (id, name, slug, icon, description, display_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, data.name, slug, data.icon || 'ph:folder-light', data.description || '', maxOrder + 1);

      return sendJson(res, 201, { status: 'success', id, slug });
    }

    if (pathname.startsWith('/api/admin/categories/') && method === 'PUT') {
      const session = requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/categories/', '');
      const data = await readBody(req);
      const slug = data.slug ? slugify(data.slug) : slugify(data.name);

      db.prepare(`
        UPDATE categories SET name = ?, slug = ?, icon = ?, description = ?, display_order = ?
        WHERE id = ?
      `).run(data.name, slug, data.icon, data.description || '', data.display_order || 0, id);

      return sendJson(res, 200, { status: 'success', message: 'Category updated' });
    }

    if (pathname.startsWith('/api/admin/categories/') && method === 'DELETE') {
      const session = requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/categories/', '');
      const count = db.prepare('SELECT COUNT(*) as c FROM projects WHERE category_id = ?').get(id).c;
      if (count > 0) {
        return sendJson(res, 400, { status: 'error', message: `Cannot delete category: ${count} projects are assigned to it.` });
      }

      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      return sendJson(res, 200, { status: 'success', message: 'Category deleted' });
    }

    if (pathname === '/api/admin/categories/reorder' && method === 'PATCH') {
      const session = requireAuth(req, res);
      if (!session) return;

      const { categoryIds } = await readBody(req);
      if (Array.isArray(categoryIds)) {
        const stmt = db.prepare('UPDATE categories SET display_order = ? WHERE id = ?');
        categoryIds.forEach((id, idx) => {
          stmt.run(idx + 1, id);
        });
      }
      return sendJson(res, 200, { status: 'success', message: 'Categories reordered' });
    }

    // About & Contact CRUD
    if (pathname === '/api/admin/about' && method === 'GET') {
      const session = requireAuth(req, res);
      if (!session) return;

      const rows = db.prepare('SELECT key, value FROM about_settings').all();
      const settings = {};
      rows.forEach(r => { settings[r.key] = r.value; });
      return sendJson(res, 200, { status: 'success', data: settings });
    }

    if (pathname === '/api/admin/about' && method === 'PUT') {
      const session = requireAuth(req, res);
      if (!session) return;

      const { settings } = await readBody(req);
      if (settings && typeof settings === 'object') {
        const stmt = db.prepare('INSERT OR REPLACE INTO about_settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(settings)) {
          stmt.run(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
      }
      return sendJson(res, 200, { status: 'success', message: 'About settings updated' });
    }

    // Experience CRUD
    if (pathname === '/api/admin/experience' && method === 'GET') {
      const session = requireAuth(req, res);
      if (!session) return;

      const rows = db.prepare('SELECT * FROM experience ORDER BY display_order ASC, created_at DESC').all();
      return sendJson(res, 200, { status: 'success', data: rows });
    }

    if (pathname === '/api/admin/experience' && method === 'POST') {
      const session = requireAuth(req, res);
      if (!session) return;

      const data = await readBody(req);
      const id = crypto.randomUUID();
      const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM experience').get().m || 0;
      db.prepare(`
        INSERT INTO experience (id, company, role, duration, description, display_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.company, data.role, data.duration, data.description || '', maxOrder + 1, new Date().toISOString());

      return sendJson(res, 201, { status: 'success', id });
    }

    if (pathname.startsWith('/api/admin/experience/') && method === 'PUT') {
      const session = requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/experience/', '');
      const data = await readBody(req);
      db.prepare(`
        UPDATE experience SET company = ?, role = ?, duration = ?, description = ?, display_order = ?
        WHERE id = ?
      `).run(data.company, data.role, data.duration, data.description || '', data.display_order || 0, id);

      return sendJson(res, 200, { status: 'success', message: 'Experience updated' });
    }

    if (pathname.startsWith('/api/admin/experience/') && method === 'DELETE') {
      const session = requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/experience/', '');
      db.prepare('DELETE FROM experience WHERE id = ?').run(id);
      return sendJson(res, 200, { status: 'success', message: 'Experience deleted' });
    }

    // Upload Handler (Multi-file and Base64)
    if (pathname === '/api/upload' && method === 'POST') {
      const session = requireAuth(req, res);
      if (!session) return;

      const payload = await readBody(req);
      const files = Array.isArray(payload.files) ? payload.files : (payload.data ? [payload] : []);

      if (files.length === 0) {
        return sendJson(res, 400, { status: 'error', message: 'No file data received' });
      }

      const uploadedUrls = [];
      for (const file of files) {
        if (!file.data) continue;
        const ext = path.extname(file.name || 'image.png').toLowerCase() || '.png';
        const safeName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
        const filePath = path.join(UPLOADS_DIR, safeName);

        const buffer = Buffer.from(file.data, 'base64');
        fs.writeFileSync(filePath, buffer);
        uploadedUrls.push(`uploads/${safeName}`);
      }

      return sendJson(res, 200, {
        status: 'success',
        urls: uploadedUrls,
        url: uploadedUrls[0] || null
      });
    }

    // ==========================================
    // 4. STATIC FILE SERVING
    // ==========================================
    let filePath = '';

    // Clean routing
    if (pathname === '/' || pathname === '/portfolio.html') {
      filePath = path.join(ROOT_DIR, 'portfolio.html');
    } else if (pathname === '/admin' || pathname === '/admin/') {
      filePath = path.join(ROOT_DIR, 'admin', 'index.html');
      // If admin/index.html doesn't exist yet, fall back to admin.html
      if (!fs.existsSync(filePath)) {
        filePath = path.join(ROOT_DIR, 'admin.html');
      }
    } else if (pathname.startsWith('/uploads/')) {
      const filename = pathname.replace('/uploads/', '');
      const safeFilename = path.normalize(filename).replace(/^(\.\.[\/\\])+/, '');
      filePath = path.join(UPLOADS_DIR, safeFilename);
    } else {
      // Prevent directory traversal
      const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
      filePath = path.join(ROOT_DIR, safePath);
    }

    // Check file existence
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');

  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { status: 'error', message: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`- Public portfolio: http://localhost:${PORT}/portfolio.html`);
  console.log(`- Admin CMS:        http://localhost:${PORT}/admin`);
});

module.exports = { server };
