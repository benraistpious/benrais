const https = require('node:https');
const crypto = require('node:crypto');
const { db } = require('../data/db');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

async function syncFromGoogleSheets() {
  console.log('Fetching live data from Google Sheets API...');

  // 1. Sync Experience
  const expUrl = 'https://script.google.com/macros/s/AKfycbw6L-z19_veg2EPygX8zBmaG5XOxw9wuz2EXhDLfAaoJZXRi4HNjJ6XOpWGeeScSaPw/exec?action=getExperience&t=' + Date.now();
  const expData = await fetchJson(expUrl);
  if (expData && expData.status === 'success' && Array.isArray(expData.data) && expData.data.length > 0) {
    console.log(`Found ${expData.data.length} experiences in Google Sheets`);
    db.prepare('DELETE FROM experience').run();
    const insertExp = db.prepare(`
      INSERT INTO experience (id, company, role, duration, description, display_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    expData.data.forEach((exp, idx) => {
      insertExp.run(
        crypto.randomUUID(),
        (exp.company || '').trim(),
        (exp.role || '').trim(),
        (exp.duration || '').trim(),
        (exp.description || '').trim(),
        idx + 1,
        exp.timestamp || new Date().toISOString()
      );
    });
    console.log('✓ Successfully imported Google Sheets experience into SQLite');
  }

  // 2. Sync Projects
  const projUrl = 'https://script.google.com/macros/s/AKfycbw6L-z19_veg2EPygX8zBmaG5XOxw9wuz2EXhDLfAaoJZXRi4HNjJ6XOpWGeeScSaPw/exec?action=getPortfolioProjects&t=' + Date.now();
  const projData = await fetchJson(projUrl);
  if (projData && projData.status === 'success' && Array.isArray(projData.data) && projData.data.length > 0) {
    console.log(`Found ${projData.data.length} projects in Google Sheets`);
    for (const p of projData.data) {
      const slug = (p.title || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const existing = db.prepare('SELECT id FROM projects WHERE slug = ? OR title = ?').get(slug, p.title);
      let images = [];
      try { images = JSON.parse(p.images); } catch(e) {}

      if (!existing) {
        const id = crypto.randomUUID();
        const cover = p.thumbnail || (images[0] || '');
        const maxOrder = (db.prepare('SELECT MAX(display_order) as m FROM projects').get().m || 0) + 1;

        db.prepare(`
          INSERT INTO projects (
            id, title, slug, category_id, client, year,
            short_description, description, design_objective,
            tools, tags, cover_image, featured, published, display_order,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, p.title, slug, p.category || 'posters', '', '2026',
          p.description || 'View presentation details', p.description || '', '',
          '', '', cover, 1, 1, maxOrder, p.timestamp || new Date().toISOString(), p.timestamp || new Date().toISOString()
        );

        if (Array.isArray(images)) {
          const imgStmt = db.prepare(`
            INSERT INTO project_images (id, project_id, image_url, display_order, created_at)
            VALUES (?, ?, ?, ?, ?)
          `);
          images.forEach((img, idx) => {
            imgStmt.run(crypto.randomUUID(), id, img, idx, new Date().toISOString());
          });
        }
        console.log(`✓ Imported project "${p.title}" (${p.category})`);
      }
    }
  }

  console.log('Sync from Google Sheets complete!');
}

syncFromGoogleSheets().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
