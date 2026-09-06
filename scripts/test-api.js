const http = require('node:http');
const assert = require('node:assert');

const BASE_URL = 'http://localhost:3000';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (options.body) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(url, reqOptions, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch(e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json || data });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('Starting automated API verification tests...');

  // 1. Test public categories
  const catRes = await request('/api/public/categories');
  assert.strictEqual(catRes.status, 200, 'Categories endpoint should return 200');
  assert.ok(catRes.body.data.length >= 4, 'Should have at least 4 default categories');
  console.log('✓ Public categories API passed');

  // 2. Test public projects
  const projRes = await request('/api/public/projects');
  assert.strictEqual(projRes.status, 200, 'Public projects should return 200');
  assert.ok(Array.isArray(projRes.body.data), 'Public projects should be an array');
  console.log(`✓ Public projects API returned ${projRes.body.data.length} published projects`);

  // 3. Test admin endpoint without auth (should fail with 401)
  const unauthRes = await request('/api/admin/stats');
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated admin request should be rejected with 401');
  console.log('✓ Admin route protection (401 Unauthorized) passed');

  // 4. Test admin login
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'benrais123' }
  });
  assert.strictEqual(loginRes.status, 200, 'Login should succeed');
  assert.ok(loginRes.body.token, 'Login should return session token');
  const token = loginRes.body.token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  console.log('✓ Admin authentication & session generation passed');

  // 5. Test admin stats
  const statsRes = await request('/api/admin/stats', { headers: authHeaders });
  assert.strictEqual(statsRes.status, 200, 'Admin stats should return 200');
  assert.ok(statsRes.body.data.totalProjects >= 1, 'Total projects should be >= 1');
  console.log('✓ Admin stats dashboard metrics passed');

  // 6. Test project creation
  const newProject = {
    title: 'Automated Test Case Project',
    slug: 'automated-test-case-project',
    category_id: 'branding',
    client: 'Acme Test Corp',
    year: '2025',
    short_description: 'Test short description',
    description: 'Detailed description for test project',
    design_objective: 'Verify end-to-end CMS creation flow',
    tools: 'Figma, Illustrator',
    tags: 'Test, Branding, Automated',
    cover_image: 'pfp 1.png',
    featured: 1,
    published: 0, // DRAFT!
    images: ['pfp 1.png', 'Frame 7.png']
  };

  const createRes = await request('/api/admin/projects', {
    method: 'POST',
    headers: authHeaders,
    body: newProject
  });
  assert.strictEqual(createRes.status, 201, 'Create project should return 201');
  const createdId = createRes.body.id;
  console.log('✓ Admin project creation passed (created as Draft)');

  // 7. Verify draft project does NOT appear in public API
  const publicCheck = await request('/api/public/projects');
  const foundDraft = publicCheck.body.data.find(p => p.id === createdId);
  assert.strictEqual(foundDraft, undefined, 'Draft project must NOT be returned in public API');
  console.log('✓ Draft publishing isolation verified (drafts hidden from public)');

  // 8. Test project duplication
  const dupRes = await request(`/api/admin/projects/${createdId}/duplicate`, {
    method: 'POST',
    headers: authHeaders
  });
  assert.strictEqual(dupRes.status, 201, 'Duplicate project should return 201');
  const dupId = dupRes.body.id;
  console.log('✓ Project duplication passed');

  // 9. Test publishing the project
  const pubRes = await request(`/api/admin/projects/${createdId}/status`, {
    method: 'PATCH',
    headers: authHeaders,
    body: { published: 1 }
  });
  assert.strictEqual(pubRes.status, 200, 'Publish project should return 200');

  // Verify it now appears in public API
  const publicAfterPublish = await request('/api/public/projects');
  const foundPublished = publicAfterPublish.body.data.find(p => p.id === createdId);
  assert.ok(foundPublished, 'Published project MUST be returned in public API');
  console.log('✓ Project status toggle to Published verified');

  // 10. Test image upload
  const uploadRes = await request('/api/upload', {
    method: 'POST',
    headers: authHeaders,
    body: {
      data: Buffer.from('fake image content for test').toString('base64'),
      name: 'test-upload.png'
    }
  });
  assert.strictEqual(uploadRes.status, 200, 'Image upload should return 200');
  assert.ok(uploadRes.body.url.startsWith('uploads/'), 'Upload URL should be in uploads/ directory');
  console.log('✓ Image upload handler passed');

  // 11. Cleanup test projects
  await request(`/api/admin/projects/${createdId}`, { method: 'DELETE', headers: authHeaders });
  await request(`/api/admin/projects/${dupId}`, { method: 'DELETE', headers: authHeaders });
  console.log('✓ Test cleanup passed');

  console.log('\nAll API tests completed successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
