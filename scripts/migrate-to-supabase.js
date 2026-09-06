/**
 * Migration Script: Local SQLite -> Supabase
 *
 * Usage:
 *   1. Set environment variables in .env or run with:
 *      $env:SUPABASE_URL="https://your-project.supabase.co"
 *      $env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
 *   2. Run:
 *      node scripts/migrate-to-supabase.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '..', '.env');
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Missing required environment variables:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPlease create a .env file or set them in your terminal before running this script.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const DB_PATH = path.join(__dirname, '..', 'data', 'portfolio.db');
if (!fs.existsSync(DB_PATH)) {
  console.error(`\n❌ SQLite database not found at ${DB_PATH}\n`);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

async function migrate() {
  console.log('🚀 Starting migration to Supabase...\n');

  try {
    // 1. Admin Users
    console.log('1️⃣ Migrating admin users...');
    const adminUsers = db.prepare('SELECT * FROM admin_users').all();
    if (adminUsers.length > 0) {
      const { error } = await supabase.from('admin_users').upsert(adminUsers);
      if (error) throw new Error(`Admin users migration error: ${error.message}`);
      console.log(`   ✅ Migrated ${adminUsers.length} admin user(s).`);
    } else {
      console.log('   ℹ️ No admin users found.');
    }

    // 2. Categories
    console.log('2️⃣ Migrating categories...');
    const categories = db.prepare('SELECT * FROM categories').all();
    if (categories.length > 0) {
      const { error } = await supabase.from('categories').upsert(categories);
      if (error) throw new Error(`Categories migration error: ${error.message}`);
      console.log(`   ✅ Migrated ${categories.length} categories.`);
    }

    // 3. Projects
    console.log('3️⃣ Migrating projects...');
    const projects = db.prepare('SELECT * FROM projects').all();
    if (projects.length > 0) {
      const { error } = await supabase.from('projects').upsert(projects);
      if (error) throw new Error(`Projects migration error: ${error.message}`);
      console.log(`   ✅ Migrated ${projects.length} projects.`);
    }

    // 4. Project Images
    console.log('4️⃣ Migrating project images...');
    const images = db.prepare('SELECT * FROM project_images').all();
    if (images.length > 0) {
      const { error } = await supabase.from('project_images').upsert(images);
      if (error) throw new Error(`Project images migration error: ${error.message}`);
      console.log(`   ✅ Migrated ${images.length} project images.`);
    }

    // 5. Experience
    console.log('5️⃣ Migrating experience entries...');
    const experience = db.prepare('SELECT * FROM experience').all();
    if (experience.length > 0) {
      const { error } = await supabase.from('experience').upsert(experience);
      if (error) throw new Error(`Experience migration error: ${error.message}`);
      console.log(`   ✅ Migrated ${experience.length} experience records.`);
    }

    // 6. About Settings
    console.log('6️⃣ Migrating about settings...');
    const settings = db.prepare('SELECT * FROM about_settings').all();
    if (settings.length > 0) {
      const { error } = await supabase.from('about_settings').upsert(settings);
      if (error) throw new Error(`About settings migration error: ${error.message}`);
      console.log(`   ✅ Migrated ${settings.length} about settings.`);
    }

    // 7. Upload Existing Media in uploads/ to Supabase Storage
    const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
    if (fs.existsSync(UPLOADS_DIR)) {
      const uploadFiles = fs.readdirSync(UPLOADS_DIR).filter(f => !f.startsWith('.'));
      if (uploadFiles.length > 0) {
        console.log(`7️⃣ Uploading ${uploadFiles.length} file(s) from uploads/ to Supabase Storage...`);
        for (const file of uploadFiles) {
          const filePath = path.join(UPLOADS_DIR, file);
          const fileBuffer = fs.readFileSync(filePath);
          const ext = path.extname(file).toLowerCase();
          const mimeTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';

          const { error } = await supabase.storage
            .from('portfolio')
            .upload(file, fileBuffer, {
              contentType,
              upsert: true
            });

          if (error) {
            console.warn(`   ⚠️ Warning uploading ${file}: ${error.message}`);
          } else {
            console.log(`   ☁️ Uploaded: ${file}`);
          }
        }
      }
    }

    console.log('\n🎉 All data and assets have been successfully migrated to Supabase!\n');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
