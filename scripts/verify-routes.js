const http = require('node:http');

const urls = [
  'http://localhost:3000/portfolio.html',
  'http://localhost:3000/posters.html',
  'http://localhost:3000/lead-ads.html',
  'http://localhost:3000/uiux.html',
  'http://localhost:3000/branding.html',
  'http://localhost:3000/project-view.html?id=modern-typography-event-posters',
  'http://localhost:3000/admin',
  'http://localhost:3000/api/public/projects',
  'http://localhost:3000/api/public/categories',
  'http://localhost:3000/api/public/about',
  'http://localhost:3000/api/public/experience'
];

async function check() {
  console.log('Verifying all frontend and API routes on http://localhost:3000:\n');
  let allOk = true;

  for (const url of urls) {
    await new Promise((resolve) => {
      http.get(url, (res) => {
        let size = 0;
        res.on('data', chunk => { size += chunk.length; });
        res.on('end', () => {
          const ok = res.statusCode === 200;
          if (!ok) allOk = false;
          console.log(`${ok ? '✓' : '✗'} [${res.statusCode}] ${size} bytes - ${url}`);
          resolve();
        });
      }).on('error', (err) => {
        console.error(`✗ [ERROR] ${url}: ${err.message}`);
        allOk = false;
        resolve();
      });
    });
  }

  console.log(allOk ? '\nAll routes returned 200 OK!' : '\nSome routes failed.');
  process.exit(allOk ? 0 : 1);
}

check();
