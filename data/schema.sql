-- Portfolio Database Schema

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
  category_id TEXT NOT NULL,
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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS project_images (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
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
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES admin_users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_id);
CREATE INDEX IF NOT EXISTS idx_projects_published ON projects(published);
CREATE INDEX IF NOT EXISTS idx_projects_display_order ON projects(display_order);
CREATE INDEX IF NOT EXISTS idx_project_images_project ON project_images(project_id, display_order);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);
