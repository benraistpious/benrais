# Deployment Guide for Portfolio & CMS

This portfolio can be deployed in two architectures:
1. **Serverless on Vercel + Supabase** (Recommended for speed, global CDN, and zero server maintenance).
2. **Standard Node.js Server on Render, Railway, or VPS** (Self-hosted SQLite).

---

## ⚡ Option 1: Vercel + Supabase (Recommended)

This setup uses **Vercel** for the global edge frontend and serverless API, and **Supabase** for the cloud PostgreSQL database and image storage.

### Step 1: Set up Supabase
1. Create a free account at [supabase.com](https://supabase.com) and create a new project.
2. In the Supabase Dashboard, go to **SQL Editor** (left sidebar).
3. Open [`supabase_schema.sql`](supabase_schema.sql) in this repository, paste the entire SQL, and click **Run**.
   - This creates all tables, indexes, row-level security policies, and the public `portfolio` storage bucket.
4. Go to **Project Settings** → **API**:
   - Copy **Project URL** (this is your `SUPABASE_URL`).
   - Under **Project API keys**, copy the **service_role** secret key (this is your `SUPABASE_SERVICE_ROLE_KEY`).

### Step 2: Migrate Your Local Data to Supabase
Run the automated migration script to push all existing projects and uploads to Supabase:
```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
node scripts/migrate-to-supabase.js
```

### Step 3: Deploy to Vercel
1. Push your code to GitHub (see [Pushing to GitHub](#pushing-to-github) below).
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
3. Click **Add New...** → **Project** and import your GitHub repository.
4. In the **Environment Variables** section, add:
   - `SUPABASE_URL` = `https://your-project.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = `your-service-role-secret-key`
5. Click **Deploy**!
   - Your frontend will be deployed to Vercel's global Edge network.
   - All `/api/*` endpoints are handled serverlessly by `api/index.js`.
   - All project image uploads are stored in Supabase Storage.

---

## 📤 Pushing to GitHub

Ensure Git is installed on your computer:
```powershell
winget install --id Git.Git -e --source winget
```

Then initialize and push:
```powershell
# Initialize git repository
git init

# Add all files (respecting .gitignore)
git add .

# Create your commit
git commit -m "Portfolio with Supabase and Vercel serverless support"

# Set main branch
git branch -M main

# Link your GitHub repository (replace with your repo URL)
git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git

# Push to GitHub
git push -u origin main
```

---

## 🖥️ Option 2: Render.com (Node.js + SQLite)

1. Push your code to GitHub.
2. Go to [render.com](https://render.com) and create a **Web Service**.
3. Connect your repository:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Under **Disks**, add a persistent disk mounted to `/app/data` (size: 1 GB).
5. Deploy!

---

## 🔑 Admin Credentials

- **Admin URL**: `/admin`
- **Default Username**: `admin`
- **Default Password**: `benrais123`

> [!IMPORTANT]
> Immediately upon logging in, go to the **Settings** tab and change your password to a secure personal password.
