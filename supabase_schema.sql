-- ==========================================
-- Supabase Schema for Benrais Portfolio & CMS
-- Run this script in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ==========================================

-- 1. Create Tables

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT DEFAULT 'ph:folder-light',
  description TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_id TEXT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  client TEXT DEFAULT '',
  year TEXT DEFAULT '',
  short_description TEXT DEFAULT '',
  description TEXT DEFAULT '',
  design_objective TEXT DEFAULT '',
  tools TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  duration TEXT NOT NULL,
  description TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS about_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);

-- 2. Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id);
CREATE INDEX IF NOT EXISTS idx_projects_published ON projects(published);
CREATE INDEX IF NOT EXISTS idx_projects_display_order ON projects(display_order);
CREATE INDEX IF NOT EXISTS idx_project_images_project ON project_images(project_id, display_order);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);

-- 3. Row Level Security (RLS)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE about_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Public Read Policies
DROP POLICY IF EXISTS "Public can view categories" ON categories;
CREATE POLICY "Public can view categories" ON categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view published projects" ON projects;
CREATE POLICY "Public can view published projects" ON projects FOR SELECT USING (published = 1);

DROP POLICY IF EXISTS "Public can view project images" ON project_images;
CREATE POLICY "Public can view project images" ON project_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view experience" ON experience;
CREATE POLICY "Public can view experience" ON experience FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view about settings" ON about_settings;
CREATE POLICY "Public can view about settings" ON about_settings FOR SELECT USING (true);

-- 4. Supabase Storage: Create Public Bucket for Portfolio Media
INSERT INTO storage.buckets (id, name, public)
VALUES ('portfolio', 'portfolio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public to read objects from the 'portfolio' bucket
DROP POLICY IF EXISTS "Public can read portfolio bucket" ON storage.objects;
CREATE POLICY "Public can read portfolio bucket" ON storage.objects FOR SELECT
USING (bucket_id = 'portfolio');

-- Allow service role / admin to upload, update, and delete objects
DROP POLICY IF EXISTS "Service role can manage portfolio bucket" ON storage.objects;
CREATE POLICY "Service role can manage portfolio bucket" ON storage.objects FOR ALL
USING (bucket_id = 'portfolio');
