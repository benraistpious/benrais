const crypto = require('node:crypto');
const { db, hashPassword } = require('./db');

function seed() {
  console.log('Seeding portfolio database...');

  // 1. Seed Admin User
  const adminCheck = db.prepare('SELECT id FROM admin_users WHERE username = ?').get('admin');
  if (!adminCheck) {
    const { hash, salt } = hashPassword('benrais123');
    const adminId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO admin_users (id, username, password_hash, salt, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(adminId, 'admin', hash, salt, new Date().toISOString());
    console.log('Created default admin: admin / benrais123');
  }

  // 2. Seed Categories
  const categories = [
    {
      id: 'posters',
      name: 'Posters',
      slug: 'posters',
      icon: 'ph:image-square-light',
      description: 'A selection of my best poster designs.',
      display_order: 1
    },
    {
      id: 'lead-ads',
      name: 'Lead Ads',
      slug: 'lead-ads',
      icon: 'ph:megaphone-light',
      description: 'High-converting visual advertising and lead generation campaigns.',
      display_order: 2
    },
    {
      id: 'uiux',
      name: 'UI/UX',
      slug: 'uiux',
      icon: 'ph:layout-light',
      description: 'User-centered interface designs and interactive experiences.',
      display_order: 3
    },
    {
      id: 'branding',
      name: 'Branding',
      slug: 'branding',
      icon: 'ph:fingerprint-light',
      description: 'A selection of my best brand identity designs.',
      display_order: 4
    }
  ];

  // 2. Seed Categories (only if empty)
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  if (catCount === 0) {
    const catStmt = db.prepare(`
      INSERT INTO categories (id, name, slug, icon, description, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const cat of categories) {
      catStmt.run(cat.id, cat.name, cat.slug, cat.icon, cat.description, cat.display_order);
    }
    console.log('Seeded categories.');
  }

  // 3. Seed About / Settings (only if empty)
  const aboutCount = db.prepare('SELECT COUNT(*) as c FROM about_settings').get().c;
  if (aboutCount === 0) {
    const settings = [
      ['name', 'Benrais T Pious'],
      ['profession', 'Graphic Designer'],
      ['hero_greeting', "Hello, I'm Benrais."],
      ['hero_tagline', 'Graphic designer focused on brand identity, layout, and visual communication.'],
      ['skills_image', 'Frame 7.png'],
      ['profile_image', 'pfp 1.png'],
      ['marquee_text', 'UI/UX DESIGN • BRAND IDENTITY • LAYOUT • VISUAL COMMUNICATION'],
      ['email', 'benraistpious@gmail.com'],
      ['whatsapp', '+91 6282629144'],
      ['whatsapp_link', 'https://wa.me/916282629144'],
      ['linkedin_handle', '@benraistpious'],
      ['linkedin_link', 'https://www.linkedin.com/in/benraistpious']
    ];

    const setStmt = db.prepare('INSERT INTO about_settings (key, value) VALUES (?, ?)');
    for (const [key, value] of settings) {
      setStmt.run(key, value);
    }
    console.log('Seeded about settings.');
  }

  // 4. Seed Experience
  const expCount = db.prepare('SELECT COUNT(*) as count FROM experience').get().count;
  if (expCount === 0) {
    const experiences = [
      {
        id: crypto.randomUUID(),
        company: 'Freelance & Creative Studio',
        role: 'Lead Brand & Visual Designer',
        duration: '2023 - Present',
        description: 'Delivering comprehensive brand identities, creative ad campaigns, and intuitive digital interfaces for diverse clients.',
        display_order: 1
      },
      {
        id: crypto.randomUUID(),
        company: 'Digital Media Agency',
        role: 'Senior Graphic Designer',
        duration: '2021 - 2023',
        description: 'Spearheaded lead generation ad creatives, marketing collateral, and high-impact poster presentations.',
        display_order: 2
      }
    ];

    const expStmt = db.prepare(`
      INSERT INTO experience (id, company, role, duration, description, display_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const exp of experiences) {
      expStmt.run(exp.id, exp.company, exp.role, exp.duration, exp.description, exp.display_order, new Date().toISOString());
    }
    console.log('Seeded experience timeline.');
  }

  // 5. Seed Initial Projects if none exist
  const projCount = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
  if (projCount === 0) {
    const sampleProjects = [
      {
        id: crypto.randomUUID(),
        title: 'Modern Typography & Event Posters',
        slug: 'modern-typography-event-posters',
        category_id: 'posters',
        client: 'Cultural Arts Festival',
        year: '2024',
        short_description: 'A bespoke series of promotional posters highlighting minimalist Swiss typography and dynamic layout grids.',
        description: 'Exploration of contrast, negative space, and typographic scale designed for print and digital billboard displays.',
        design_objective: 'Create arresting visuals that communicate event dates and headline performers at a single glance.',
        tools: 'Adobe Illustrator, Photoshop, InDesign',
        tags: 'Poster, Typography, Swiss Style, Print',
        cover_image: 'Desktop - 1.png',
        featured: 1,
        published: 1,
        display_order: 1,
        images: ['Desktop - 1.png', 'Frame 7.png']
      },
      {
        id: crypto.randomUUID(),
        title: 'High-Conversion Social Lead Ads',
        slug: 'high-conversion-social-lead-ads',
        category_id: 'lead-ads',
        client: 'SaaS Growth Studio',
        year: '2024',
        short_description: 'Visual ad sets and carousel graphics optimized for Meta and LinkedIn advertising.',
        description: 'Strategic visual hierarchy paired with clear call-to-action triggers that improved click-through rates by 34%.',
        design_objective: 'Maximize engagement and user acquisition for subscription software products.',
        tools: 'Figma, Illustrator, Photoshop',
        tags: 'Advertising, Social Media, Lead Generation, Performance Marketing',
        cover_image: 'Frame 7.png',
        featured: 1,
        published: 1,
        display_order: 2,
        images: ['Frame 7.png', 'Desktop - 1.png']
      },
      {
        id: crypto.randomUUID(),
        title: 'FinTech Mobile App Interface',
        slug: 'fintech-mobile-app-interface',
        category_id: 'uiux',
        client: 'Novacash Global',
        year: '2023',
        short_description: 'Clean, modern user experience for personal wealth management and real-time expense tracking.',
        description: 'End-to-end UX flow from onboarding to micro-investing, featuring dark mode and accessible design systems.',
        design_objective: 'Demystify financial management with approachable visualizations and smooth micro-interactions.',
        tools: 'Figma, Principle, GSAP',
        tags: 'UI/UX, Mobile App, FinTech, Design System',
        cover_image: 'Desktop - 1.png',
        featured: 1,
        published: 1,
        display_order: 3,
        images: ['Desktop - 1.png']
      },
      {
        id: crypto.randomUUID(),
        title: 'Apex Studio Identity & Brand Guide',
        slug: 'apex-studio-identity-brand-guide',
        category_id: 'branding',
        client: 'Apex Architecture Studio',
        year: '2023',
        short_description: 'Full corporate identity, logo system, stationery suite, and digital guidelines.',
        description: 'Sophisticated architectural brand identity reflecting precision, structural balance, and modern sustainability.',
        design_objective: 'Establish an authoritative yet approachable market presence for a boutique architectural firm.',
        tools: 'Illustrator, InDesign, Figma',
        tags: 'Branding, Logo Design, Identity, Typography',
        cover_image: 'pfp 1.png',
        featured: 0,
        published: 1,
        display_order: 4,
        images: ['pfp 1.png', 'Frame 7.png']
      }
    ];

    const projStmt = db.prepare(`
      INSERT INTO projects (
        id, title, slug, category_id, client, year,
        short_description, description, design_objective,
        tools, tags, cover_image, featured, published, display_order,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const imgStmt = db.prepare(`
      INSERT INTO project_images (id, project_id, image_url, display_order, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const p of sampleProjects) {
      projStmt.run(
        p.id, p.title, p.slug, p.category_id, p.client, p.year,
        p.short_description, p.description, p.design_objective,
        p.tools, p.tags, p.cover_image, p.featured, p.published, p.display_order,
        now, now
      );

      let imgOrder = 0;
      for (const img of p.images) {
        imgStmt.run(crypto.randomUUID(), p.id, img, imgOrder++, now);
      }
    }
    console.log('Seeded sample projects.');
  }

  console.log('Seeding complete!');
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
