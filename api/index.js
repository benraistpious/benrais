const crypto = require('node:crypto');
const {
  getSupabase,
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession,
  uploadToStorage
} = require('../lib/supabase');

// Helper to parse cookies
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

async function requireAuth(req, res) {
  const token = getAuthToken(req);
  if (!token) {
    sendJson(res, 401, { status: 'error', message: 'Unauthorized. Please log in.' });
    return null;
  }
  const session = await validateSession(token);
  if (!session) {
    sendJson(res, 401, { status: 'error', message: 'Session expired or invalid.' });
    return null;
  }
  return session;
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    ...extraHeaders
  };
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) return resolve(req.body);
    let body = '';
    req.on('data', chunk => {
      body += chunk;
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

module.exports = async function handler(req, res) {
  try {
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

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const rawUrl = req.url || '/api';
    const parsedUrl = new URL(rawUrl, `${proto}://${host}`);

    // If Vercel rewrote /api/(.*) -> /api, x-matched-path holds the original path
    const matchedPath = req.headers['x-matched-path'];
    let pathname = parsedUrl.pathname;
    if (matchedPath && pathname === '/api') {
      pathname = matchedPath;
    }

    const method = req.method;

    const client = getSupabase();
    if (!client) {
      return sendJson(res, 500, {
        status: 'error',
        message: 'Supabase configuration missing or invalid. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.'
      });
    }
    // ==========================================
    // 1. AUTHENTICATION ROUTES
    // ==========================================
    if (pathname === '/api/auth/login' && method === 'POST') {
      const { username, password } = await readBody(req);
      if (!username || !password) {
        return sendJson(res, 400, { status: 'error', message: 'Username and password required' });
      }

      const { data: user, error } = await client
        .from('admin_users')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !user || !verifyPassword(password, user.password_hash, user.salt)) {
        return sendJson(res, 401, { status: 'error', message: 'Invalid credentials' });
      }

      const session = await createSession(user.id);
      const isHttps = proto === 'https';
      const cookieVal = `session=${session.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=259200${isHttps ? '; Secure' : ''}`;

      return sendJson(res, 200, {
        status: 'success',
        token: session.token,
        user: { id: user.id, username: user.username }
      }, { 'Set-Cookie': cookieVal });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const token = getAuthToken(req);
      if (token) await deleteSession(token);
      return sendJson(res, 200, { status: 'success', message: 'Logged out' }, {
        'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0'
      });
    }

    if (pathname === '/api/auth/me' && method === 'GET') {
      const session = await requireAuth(req, res);
      if (!session) return;
      return sendJson(res, 200, {
        status: 'success',
        user: { id: session.user_id, username: session.username }
      });
    }

    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const { currentPassword, newPassword } = await readBody(req);
      if (!currentPassword || !newPassword || newPassword.length < 6) {
        return sendJson(res, 400, { status: 'error', message: 'New password must be at least 6 characters' });
      }

      const { data: user } = await client
        .from('admin_users')
        .select('*')
        .eq('id', session.user_id)
        .single();

      if (!user || !verifyPassword(currentPassword, user.password_hash, user.salt)) {
        return sendJson(res, 400, { status: 'error', message: 'Current password incorrect' });
      }

      const { hash, salt } = hashPassword(newPassword);
      await client.from('admin_users').update({ password_hash: hash, salt }).eq('id', session.user_id);
      return sendJson(res, 200, { status: 'success', message: 'Password updated successfully' });
    }

    // ==========================================
    // 2. PUBLIC API ROUTES
    // ==========================================
    if (pathname === '/api/public/categories' && method === 'GET') {
      const { data, error } = await client
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return sendJson(res, 200, { status: 'success', data });
    }

    if (pathname === '/api/public/projects' && method === 'GET') {
      const categorySlug = parsedUrl.searchParams.get('category');
      let query = client
        .from('projects')
        .select(`
          *,
          categories!inner(id, name, slug),
          project_images(id, image_url, display_order)
        `)
        .eq('published', 1)
        .order('display_order', { ascending: true });

      if (categorySlug && categorySlug !== 'all') {
        query = query.eq('categories.slug', categorySlug);
      }

      const { data: projects, error } = await query;
      if (error) throw error;

      const formatted = projects.map(p => {
        const sortedImages = (p.project_images || []).sort((a, b) => a.display_order - b.display_order);
        return {
          ...p,
          category_name: p.categories?.name,
          category_slug: p.categories?.slug,
          images: sortedImages.map(img => img.image_url)
        };
      });

      return sendJson(res, 200, { status: 'success', data: formatted });
    }

    if (pathname.startsWith('/api/public/projects/') && method === 'GET') {
      const slug = pathname.replace('/api/public/projects/', '');
      const { data: project, error } = await client
        .from('projects')
        .select(`
          *,
          categories(id, name, slug),
          project_images(id, image_url, display_order)
        `)
        .eq('slug', slug)
        .eq('published', 1)
        .single();

      if (error || !project) {
        return sendJson(res, 404, { status: 'error', message: 'Project not found' });
      }

      const sortedImages = (project.project_images || []).sort((a, b) => a.display_order - b.display_order);
      return sendJson(res, 200, {
        status: 'success',
        data: {
          ...project,
          category_name: project.categories?.name,
          category_slug: project.categories?.slug,
          images: sortedImages.map(img => img.image_url)
        }
      });
    }

    if (pathname === '/api/public/about' && method === 'GET') {
      const { data, error } = await client.from('about_settings').select('*');
      if (error) throw error;
      const settings = {};
      (data || []).forEach(row => { settings[row.key] = row.value; });
      return sendJson(res, 200, { status: 'success', data: settings });
    }

    if (pathname === '/api/public/experience' && method === 'GET') {
      const { data, error } = await client
        .from('experience')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return sendJson(res, 200, { status: 'success', data });
    }

    // ==========================================
    // 3. ADMIN API ROUTES
    // ==========================================
    if (pathname === '/api/admin/stats' && method === 'GET') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const { count: totalProjects } = await client.from('projects').select('*', { count: 'exact', head: true });
      const { count: publishedProjects } = await client.from('projects').select('*', { count: 'exact', head: true }).eq('published', 1);
      const { count: totalCategories } = await client.from('categories').select('*', { count: 'exact', head: true });
      const { count: totalImages } = await client.from('project_images').select('*', { count: 'exact', head: true });

      return sendJson(res, 200, {
        status: 'success',
        data: {
          totalProjects: totalProjects || 0,
          publishedProjects: publishedProjects || 0,
          draftProjects: (totalProjects || 0) - (publishedProjects || 0),
          totalCategories: totalCategories || 0,
          totalImages: totalImages || 0
        }
      });
    }

    if (pathname === '/api/admin/projects' && method === 'GET') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const { data: projects, error } = await client
        .from('projects')
        .select(`
          *,
          categories(id, name, slug),
          project_images(id, image_url, display_order)
        `)
        .order('display_order', { ascending: true });

      if (error) throw error;

      const formatted = projects.map(p => {
        const sortedImages = (p.project_images || []).sort((a, b) => a.display_order - b.display_order);
        return {
          ...p,
          category_name: p.categories?.name,
          category_slug: p.categories?.slug,
          images: sortedImages.map(img => img.image_url)
        };
      });

      return sendJson(res, 200, { status: 'success', data: formatted });
    }

    if (pathname === '/api/admin/projects' && method === 'POST') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const body = await readBody(req);
      if (!body.title || !body.category_id) {
        return sendJson(res, 400, { status: 'error', message: 'Title and Category are required' });
      }

      const id = crypto.randomUUID();
      const slug = body.slug ? slugify(body.slug) : slugify(body.title);
      const now = new Date().toISOString();

      // Get max display_order
      const { data: maxRow } = await client
        .from('projects')
        .select('display_order')
        .eq('category_id', body.category_id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();
      const nextOrder = (maxRow?.display_order || 0) + 1;

      const projectData = {
        id,
        title: body.title,
        slug,
        category_id: body.category_id,
        client: body.client || '',
        year: body.year || '',
        short_description: body.short_description || '',
        description: body.description || '',
        design_objective: body.design_objective || '',
        tools: body.tools || '',
        tags: body.tags || '',
        cover_image: body.cover_image || (body.images?.[0] || ''),
        featured: body.featured ? 1 : 0,
        published: body.published !== undefined ? (body.published ? 1 : 0) : 1,
        display_order: body.display_order !== undefined ? body.display_order : nextOrder,
        created_at: now,
        updated_at: now
      };

      const { error: insertError } = await client.from('projects').insert(projectData);
      if (insertError) throw insertError;

      // Insert images
      if (Array.isArray(body.images) && body.images.length > 0) {
        const imageRows = body.images.map((imgUrl, idx) => ({
          id: crypto.randomUUID(),
          project_id: id,
          image_url: typeof imgUrl === 'string' ? imgUrl : (imgUrl.url || imgUrl.image_url),
          display_order: idx,
          created_at: now
        }));
        await client.from('project_images').insert(imageRows);
      }

      return sendJson(res, 201, { status: 'success', data: { id, slug } });
    }

    if (pathname === '/api/admin/projects/reorder' && method === 'PATCH') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const { orders } = await readBody(req);
      if (Array.isArray(orders)) {
        for (const item of orders) {
          if (item.id && item.display_order !== undefined) {
            await client.from('projects').update({ display_order: item.display_order }).eq('id', item.id);
          }
        }
      }
      return sendJson(res, 200, { status: 'success', message: 'Order updated' });
    }

    if (pathname.startsWith('/api/admin/projects/') && pathname.endsWith('/duplicate') && method === 'POST') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const originalId = pathname.replace('/api/admin/projects/', '').replace('/duplicate', '');
      const { data: orig, error } = await client
        .from('projects')
        .select('*, project_images(*)')
        .eq('id', originalId)
        .single();

      if (error || !orig) return sendJson(res, 404, { status: 'error', message: 'Project not found' });

      const newId = crypto.randomUUID();
      const newSlug = `${orig.slug}-copy-${Date.now().toString().slice(-4)}`;
      const now = new Date().toISOString();

      const dupData = {
        ...orig,
        id: newId,
        title: `${orig.title} (Copy)`,
        slug: newSlug,
        published: 0,
        display_order: orig.display_order + 1,
        created_at: now,
        updated_at: now
      };
      delete dupData.project_images;

      await client.from('projects').insert(dupData);

      if (orig.project_images && orig.project_images.length > 0) {
        const dupImages = orig.project_images.map(img => ({
          id: crypto.randomUUID(),
          project_id: newId,
          image_url: img.image_url,
          display_order: img.display_order,
          created_at: now
        }));
        await client.from('project_images').insert(dupImages);
      }

      return sendJson(res, 201, { status: 'success', data: { id: newId, slug: newSlug } });
    }

    if (pathname.startsWith('/api/admin/projects/') && pathname.endsWith('/status') && method === 'PATCH') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '').replace('/status', '');
      const { published } = await readBody(req);
      await client.from('projects').update({ published: published ? 1 : 0, updated_at: new Date().toISOString() }).eq('id', id);
      return sendJson(res, 200, { status: 'success', message: 'Status updated' });
    }

    if (pathname.startsWith('/api/admin/projects/') && pathname.endsWith('/featured') && method === 'PATCH') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '').replace('/featured', '');
      const { featured } = await readBody(req);
      await client.from('projects').update({ featured: featured ? 1 : 0, updated_at: new Date().toISOString() }).eq('id', id);
      return sendJson(res, 200, { status: 'success', message: 'Featured status updated' });
    }

    if (pathname.startsWith('/api/admin/projects/') && method === 'GET') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '');
      const { data: project, error } = await client
        .from('projects')
        .select(`*, categories(id, name, slug), project_images(id, image_url, display_order)`)
        .eq('id', id)
        .single();

      if (error || !project) return sendJson(res, 404, { status: 'error', message: 'Project not found' });

      const sortedImages = (project.project_images || []).sort((a, b) => a.display_order - b.display_order);
      return sendJson(res, 200, {
        status: 'success',
        data: {
          ...project,
          category_name: project.categories?.name,
          category_slug: project.categories?.slug,
          images: sortedImages.map(img => img.image_url)
        }
      });
    }

    if (pathname.startsWith('/api/admin/projects/') && method === 'PUT') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '');
      const body = await readBody(req);
      const slug = body.slug ? slugify(body.slug) : slugify(body.title);
      const now = new Date().toISOString();

      const updateData = {
        title: body.title,
        slug,
        category_id: body.category_id,
        client: body.client || '',
        year: body.year || '',
        short_description: body.short_description || '',
        description: body.description || '',
        design_objective: body.design_objective || '',
        tools: body.tools || '',
        tags: body.tags || '',
        cover_image: body.cover_image || (body.images?.[0] || ''),
        featured: body.featured ? 1 : 0,
        published: body.published ? 1 : 0,
        updated_at: now
      };

      await client.from('projects').update(updateData).eq('id', id);

      // Replace images
      if (Array.isArray(body.images)) {
        await client.from('project_images').delete().eq('project_id', id);
        if (body.images.length > 0) {
          const imageRows = body.images.map((imgUrl, idx) => ({
            id: crypto.randomUUID(),
            project_id: id,
            image_url: typeof imgUrl === 'string' ? imgUrl : (imgUrl.url || imgUrl.image_url),
            display_order: idx,
            created_at: now
          }));
          await client.from('project_images').insert(imageRows);
        }
      }

      return sendJson(res, 200, { status: 'success', message: 'Project updated' });
    }

    if (pathname.startsWith('/api/admin/projects/') && method === 'DELETE') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/projects/', '');
      await client.from('projects').delete().eq('id', id);
      return sendJson(res, 200, { status: 'success', message: 'Project deleted' });
    }

    // ==========================================
    // 4. CATEGORIES ADMIN
    // ==========================================
    if (pathname === '/api/admin/categories' && method === 'GET') {
      const session = await requireAuth(req, res);
      if (!session) return;
      const { data } = await client.from('categories').select('*').order('display_order', { ascending: true });
      return sendJson(res, 200, { status: 'success', data });
    }

    if (pathname === '/api/admin/categories' && method === 'POST') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const body = await readBody(req);
      const id = body.slug ? slugify(body.slug) : slugify(body.name);
      const { error } = await client.from('categories').insert({
        id,
        name: body.name,
        slug: id,
        icon: body.icon || 'ph:folder-light',
        description: body.description || '',
        display_order: body.display_order || 0
      });
      if (error) throw error;
      return sendJson(res, 201, { status: 'success', data: { id } });
    }

    if (pathname.startsWith('/api/admin/categories/') && method === 'PUT') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/categories/', '');
      const body = await readBody(req);
      await client.from('categories').update({
        name: body.name,
        icon: body.icon,
        description: body.description
      }).eq('id', id);
      return sendJson(res, 200, { status: 'success', message: 'Category updated' });
    }

    if (pathname.startsWith('/api/admin/categories/') && method === 'DELETE') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/categories/', '');
      const { count } = await client.from('projects').select('*', { count: 'exact', head: true }).eq('category_id', id);
      if (count > 0) {
        return sendJson(res, 400, { status: 'error', message: 'Cannot delete category containing projects' });
      }
      await client.from('categories').delete().eq('id', id);
      return sendJson(res, 200, { status: 'success', message: 'Category deleted' });
    }

    // ==========================================
    // 5. ABOUT & EXPERIENCE ADMIN
    // ==========================================
    if (pathname === '/api/admin/about' && method === 'GET') {
      const session = await requireAuth(req, res);
      if (!session) return;
      const { data } = await client.from('about_settings').select('*');
      const settings = {};
      (data || []).forEach(row => { settings[row.key] = row.value; });
      return sendJson(res, 200, { status: 'success', data: settings });
    }

    if (pathname === '/api/admin/about' && method === 'PUT') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const body = await readBody(req);
      for (const [key, value] of Object.entries(body)) {
        await client.from('about_settings').upsert({ key, value: String(value) });
      }
      return sendJson(res, 200, { status: 'success', message: 'Settings saved' });
    }

    if (pathname === '/api/admin/experience' && method === 'GET') {
      const session = await requireAuth(req, res);
      if (!session) return;
      const { data } = await client.from('experience').select('*').order('display_order', { ascending: true });
      return sendJson(res, 200, { status: 'success', data });
    }

    if (pathname === '/api/admin/experience' && method === 'POST') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const body = await readBody(req);
      const id = crypto.randomUUID();
      await client.from('experience').insert({
        id,
        company: body.company,
        role: body.role,
        duration: body.duration,
        description: body.description || '',
        display_order: body.display_order || 0,
        created_at: new Date().toISOString()
      });
      return sendJson(res, 201, { status: 'success', data: { id } });
    }

    if (pathname.startsWith('/api/admin/experience/') && method === 'PUT') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/experience/', '');
      const body = await readBody(req);
      await client.from('experience').update({
        company: body.company,
        role: body.role,
        duration: body.duration,
        description: body.description
      }).eq('id', id);
      return sendJson(res, 200, { status: 'success', message: 'Experience updated' });
    }

    if (pathname.startsWith('/api/admin/experience/') && method === 'DELETE') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const id = pathname.replace('/api/admin/experience/', '');
      await client.from('experience').delete().eq('id', id);
      return sendJson(res, 200, { status: 'success', message: 'Experience deleted' });
    }

    // ==========================================
    // 6. UPLOAD HANDLER (Supabase Storage)
    // ==========================================
    if (pathname === '/api/upload' && method === 'POST') {
      const session = await requireAuth(req, res);
      if (!session) return;

      const payload = await readBody(req);
      const files = Array.isArray(payload.files) ? payload.files : (payload.data ? [payload] : []);

      if (files.length === 0) {
        return sendJson(res, 400, { status: 'error', message: 'No file data received' });
      }

      const uploadedUrls = [];
      for (const file of files) {
        if (!file.data) continue;
        const publicUrl = await uploadToStorage(file.name || 'image.png', file.data);
        uploadedUrls.push(publicUrl);
      }

      return sendJson(res, 200, {
        status: 'success',
        urls: uploadedUrls,
        url: uploadedUrls[0] || null
      });
    }

    // 404 for unmatched API routes
    return sendJson(res, 404, { status: 'error', message: `API endpoint not found: ${pathname}` });

  } catch (err) {
    console.error('API Error:', err);
    return sendJson(res, 500, { status: 'error', message: err.message || 'Internal Server Error' });
  }
};
