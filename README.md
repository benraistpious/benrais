# Benrais T Pious - Portfolio & CMS

A bespoke graphic design portfolio and custom CMS backend for **Benrais T Pious**, Graphic Designer.

Features a minimalist Bento Grid frontend with GSAP micro-animations and a practical, secure Admin CMS for managing projects, categories, about/contact content, and media uploads.

---

## Quick Start

### 1. Start the Server
```bash
node server.js
# or
npm start
```
The server will boot on `http://localhost:3000`.

### 2. Access the Application
- **Public Portfolio**: [http://localhost:3000/portfolio.html](http://localhost:3000/portfolio.html) (or `http://localhost:3000/`)
- **Category Galleries**:
  - Posters: `http://localhost:3000/posters.html`
  - Lead Ads: `http://localhost:3000/lead-ads.html`
  - UI/UX: `http://localhost:3000/uiux.html`
  - Branding: `http://localhost:3000/branding.html`
- **Behance-Style Project View**: `http://localhost:3000/project-view.html?id=<project-id-or-slug>`
- **Admin CMS**: [http://localhost:3000/admin](http://localhost:3000/admin) (or `http://localhost:3000/admin/`)

---

## Admin CMS Credentials

- **Username**: `admin`
- **Default Password**: `benrais123`
*(Password can be updated at any time in the CMS Settings tab)*

---

## CMS Architecture & Features

### 1. Dashboard
- Real-time statistics: Total Projects, Published Projects, Draft Projects, Total Categories.
- Quick actions: New Project, New Category, Add Experience.
- Recently added projects table with quick publish/draft and edit buttons.

### 2. Project Management (`/admin`)
- **Add / Edit Project**:
  - *Basic Info*: Title, Slug (auto-generated or custom), Category, Client/Brand, Year, Short Description, Full Description.
  - *Design Info*: Design Objective, Tools/Software Used, Tags.
  - *Media & Gallery*:
    - Cover Image (file upload or URL with live preview).
    - Presentation Slices / Gallery: Multi-file drag-and-drop upload zone, reordering up/down, set-as-cover button, delete slices.
  - *Publishing*: Draft vs. Published radio toggle, Featured star toggle, Display Order number.
- **Duplicate Project**: One-click clone creating a Draft with `-copy` slug.
- **Publish / Draft Isolation**: Draft projects are strictly filtered out of public pages.
- **Delete Project**: Confirmation prompt with cascading image cleanup.

### 3. Category Management
- Manage portfolio categories (Posters, Lead Ads, UI/UX, Branding, custom).
- Edit name, URL slug, Iconify icon, and description.
- Reorder categories up or down.

### 4. About & Contact CMS
- Update Designer Name, Title, Hero Greeting, Hero Tagline.
- Upload/update Profile Picture.
- Edit Infinite Marquee banner text.
- Manage Career Experience timeline (Company, Role, Duration, Description).
- Update Contact Channels (Email, WhatsApp number and direct link, LinkedIn handle and profile link).

### 5. Settings
- Change administrator password with confirmation.
- System metrics and database path.

---

## Database & Tech Stack

- **Database**: SQLite persistent database via Node.js native `node:sqlite` (`data/portfolio.db`). Zero external C++ dependencies required.
- **Backend**: Native Node.js HTTP server (`server.js`) with salted `PBKDF2-SHA512` password hashing and secure token sessions.
- **Image Storage**: `uploads/` directory with multi-file upload support.
- **Frontend**: Vanilla HTML5, CSS3, GSAP, SplitText, Iconify web components. The public layout and design are preserved 100% identically to the approved design.

---

## Verification & Testing

To run the automated API verification tests:
```bash
node scripts/test-api.js
```

To verify all frontend and API routes return 200 OK:
```bash
node scripts/verify-routes.js
```
