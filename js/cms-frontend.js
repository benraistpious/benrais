// ==========================================
// Frontend CMS Integration
// Preserves 100% of existing UI design, styling, and animations
// ==========================================

function getPublicApiBase(endpoint) {
  // If running on a deployed production domain or on port 3000, use relative path
  if (
    (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ||
    window.location.port === '3000'
  ) {
    return `/api/public${endpoint}`;
  }
  // Fallback when viewing via Live Server (port 5500) locally
  return `http://localhost:3000/api/public${endpoint}`;
}

// Legacy fallback if running standalone static without server
const FALLBACK_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw6L-z19_veg2EPygX8zBmaG5XOxw9wuz2EXhDLfAaoJZXRi4HNjJ6XOpWGeeScSaPw/exec';

// ==========================================
// 1. Fetch & Render Category Projects
// ==========================================
async function loadCategory(category) {
  const container = document.getElementById('portfolio-grid');
  if (!container) return;

  container.innerHTML = `
    <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem;">
      <div class="spinner" style="width: 40px; height: 40px; border: 4px solid rgba(0,0,0,0.1); border-top-color: var(--text-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
      <p style="margin-top: 1rem; color: var(--text-secondary);">Loading projects...</p>
    </div>
  `;

  let projects = [];

  // Try local backend API first
  try {
    const res = await fetch(`${getPublicApiBase('/projects')}?category=${encodeURIComponent(category)}&t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
        projects = data.data;
      }
    }
  } catch (err) {
    console.warn('Backend API unavailable, attempting fallback...', err);
  }

  // Fallback to Google Apps Script if empty or offline
  if (projects.length === 0) {
    try {
      const url = new URL(FALLBACK_SCRIPT_URL);
      url.searchParams.append('action', 'getPortfolioProjects');
      url.searchParams.append('t', Date.now());

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        projects = data.data.filter(p => p.category === category || p.category_id === category);
      }
    } catch (e) {
      console.error('Fallback fetch also failed:', e);
    }
  }

  renderGrid(projects, container, category);
}

function renderGrid(projects, container, category) {
  container.innerHTML = '';

  if (!projects || projects.length === 0) {
    container.innerHTML = `
      <div class="bento-card col-span-2" style="min-height: 400px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.03);">
        <p style="color: var(--text-secondary); font-size: 14px;">No projects added yet.</p>
      </div>
    `;
    return;
  }

  projects.forEach(p => {
    const idOrSlug = p.slug || p.id;
    const href = `project-view.html?id=${encodeURIComponent(idOrSlug)}`;
    const coverUrl = p.cover_image || p.thumbnail || '';
    const descText = p.short_description || p.description || 'View details';

    const cardHTML = `
      <a href="${href}" class="bento-card col-span-2 dynamic-project-card" style="text-decoration: none; display: flex; flex-direction: column; padding: 0; min-height: 400px;">
        <div style="flex-grow: 1; background: rgba(0,0,0,0.03) url('${coverUrl}') center/cover no-repeat; border-radius: var(--bento-radius) var(--bento-radius) 0 0;">
          ${!coverUrl ? '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--text-secondary);">No Thumbnail</div>' : ''}
        </div>
        <div style="padding: 24px;">
          <h3 style="margin: 0; color: var(--text-primary);">${escapeHtml(p.title)}</h3>
          <p style="margin-top: 8px; color: var(--text-secondary);">${escapeHtml(descText)}</p>
        </div>
      </a>
    `;
    container.innerHTML += cardHTML;
  });

  // Animate dynamic cards with GSAP matching existing style
  const renderedCards = container.querySelectorAll('.dynamic-project-card');

  if (typeof gsap !== 'undefined') {
    gsap.fromTo(renderedCards, 
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power3.out", clearProps: "opacity,transform" }
    );
  }

  renderedCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      if (typeof gsap !== 'undefined') gsap.to(card, { scale: 0.98, opacity: 1, duration: 0.3, ease: "power2.out" });
    });
    card.addEventListener('mouseleave', () => {
      if (typeof gsap !== 'undefined') gsap.to(card, { scale: 1, opacity: 1, duration: 0.4, ease: "power2.out" });
    });
  });
}

// ==========================================
// 2. Fetch & Render Single Project View
// ==========================================
async function loadProjectView() {
  const params = new URLSearchParams(window.location.search);
  const idOrSlug = params.get('id');
  const headerContainer = document.getElementById('project-header');
  const imagesContainer = document.getElementById('project-images');

  if (!idOrSlug) {
    if (headerContainer) headerContainer.innerHTML = '<h1>Project not found</h1>';
    return;
  }

  let project = null;

  // 1. Try Local API
  try {
    const res = await fetch(`${getPublicApiBase('/projects')}/${encodeURIComponent(idOrSlug)}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success') project = data.data;
    }
  } catch (err) {
    console.warn('Backend project-view error, attempting fallback...', err);
  }

  // 2. Try Fallback Script if needed
  if (!project) {
    try {
      const url = new URL(FALLBACK_SCRIPT_URL);
      url.searchParams.append('action', 'getPortfolioProjects');
      url.searchParams.append('t', Date.now());

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        project = data.data.find(p => String(p.id) === String(idOrSlug) || String(p.slug) === String(idOrSlug));
      }
    } catch (e) {
      console.error('Fallback project-view failed:', e);
    }
  }

  if (!project) {
    if (headerContainer) {
      headerContainer.innerHTML = `
        <h1 style="margin-bottom: 16px;">Project Not Found</h1>
        <p style="font-size: 16px; color: var(--text-secondary);">The requested project could not be loaded or is in draft mode.</p>
      `;
    }
    if (imagesContainer) imagesContainer.innerHTML = '';
    return;
  }

  // Update Page Title
  document.title = `${project.title} | ${project.category_name || 'Portfolio'} | Benrais T Pious`;

  // Render Header Details
  let metaDetails = '';
  if (project.client || project.year || project.tools) {
    metaDetails = `
      <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; margin: 16px 0 0 0; font-size: 14px; color: var(--text-secondary);">
        ${project.client ? `<span><strong>Client:</strong> ${escapeHtml(project.client)}</span>` : ''}
        ${project.year ? `<span><strong>Year:</strong> ${escapeHtml(project.year)}</span>` : ''}
        ${project.tools ? `<span><strong>Tools:</strong> ${escapeHtml(project.tools)}</span>` : ''}
      </div>
    `;
  }

  let objectiveHtml = '';
  if (project.design_objective) {
    objectiveHtml = `
      <div style="margin-top: 20px; padding: 16px; background: rgba(0,0,0,0.03); border-radius: 16px; max-width: 700px; margin-left: auto; margin-right: auto;">
        <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.6;">
          <strong style="color: var(--text-primary);">Objective:</strong> ${escapeHtml(project.design_objective)}
        </p>
      </div>
    `;
  }

  if (headerContainer) {
    headerContainer.innerHTML = `
      <h1 style="margin-bottom: 16px;">${escapeHtml(project.title)}</h1>
      <p style="font-size: 18px; max-width: 650px; margin: 0 auto; line-height: 1.5;">${escapeHtml(project.description || project.short_description || '')}</p>
      ${metaDetails}
      ${objectiveHtml}
    `;
  }

  // Parse and Render Presentation Images
  let images = [];
  if (Array.isArray(project.images)) {
    images = project.images;
  } else if (typeof project.images === 'string') {
    try { images = JSON.parse(project.images); } catch(e) {}
  }

  if ((!images || images.length === 0) && (project.cover_image || project.thumbnail)) {
    images = [project.cover_image || project.thumbnail];
  }

  if (imagesContainer) {
    if (!images || images.length === 0) {
      imagesContainer.innerHTML = '<div style="padding: 60px 40px; text-align: center;"><p style="color: var(--text-secondary);">No presentation slices added yet.</p></div>';
    } else {
      imagesContainer.innerHTML = images.map(imgUrl => {
        const url = typeof imgUrl === 'string' ? imgUrl : (imgUrl.image_url || '');
        return `<img src="${url}" style="width: 100%; display: block;" loading="lazy" alt="${escapeHtml(project.title)}" onerror="this.style.display='none'">`;
      }).join('');
    }
  }
}

// ==========================================
// 3. Dynamic Homepage (About, Experience, Contact, Categories)
// ==========================================
async function loadPortfolioHome() {
  // Load Experience
  loadHomeExperience();

  // Load About & Contact
  try {
    const res = await fetch(`${getPublicApiBase('/about')}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        applyAboutData(data.data);
      }
    }
  } catch (e) {
    console.warn('Could not load dynamic about info, keeping default content');
  }
}

function applyAboutData(s) {
  if (!s) return;

  // 1. Designer Name
  const navName = document.getElementById('navDesignerName');
  if (navName && s.name) {
    navName.textContent = s.name;
  }

  // 2. Hero Greeting
  const heroGreeting = document.getElementById('heroGreeting') || document.querySelector('.hero-text');
  if (heroGreeting && s.hero_greeting && heroGreeting.textContent !== s.hero_greeting) {
    heroGreeting.textContent = s.hero_greeting;
    reanimateText(heroGreeting);
  }

  // 3. Hero Tagline
  const heroTagline = document.getElementById('heroTagline') || document.querySelectorAll('.hero-text')[1];
  if (heroTagline && s.hero_tagline && heroTagline.textContent !== s.hero_tagline) {
    heroTagline.textContent = s.hero_tagline;
    reanimateText(heroTagline);
  }

  // 4. Profile Picture
  const pfpImg = document.getElementById('profileImage') || document.querySelector('.bento-img-cover');
  if (pfpImg && s.profile_image) {
    pfpImg.src = s.profile_image;
    pfpImg.alt = s.name || 'Benrais T Pious';
  }

  // 5. Skills Image
  const skillsImg = document.getElementById('skillsImage');
  if (skillsImg && s.skills_image) {
    skillsImg.src = s.skills_image;
  }

  // 6. Infinite Marquee
  if (s.marquee_text) {
    updateMarqueeContent(s.marquee_text);
  }

  // 7. Contact: WhatsApp
  const whatsappCard = document.getElementById('contact');
  if (whatsappCard) {
    if (s.whatsapp_link) {
      whatsappCard.href = s.whatsapp_link;
    } else if (s.whatsapp) {
      whatsappCard.href = `https://wa.me/${s.whatsapp.replace(/\D/g, '')}`;
    }
    const waText = whatsappCard.querySelector('p');
    if (waText && s.whatsapp) waText.textContent = s.whatsapp;
  }

  // 8. Contact: LinkedIn
  const linkedinCard = document.getElementById('linkedinCard') || document.querySelector('a[href*="linkedin.com"]');
  if (linkedinCard) {
    if (s.linkedin_link) linkedinCard.href = s.linkedin_link;
    const liText = linkedinCard.querySelector('p');
    if (liText && s.linkedin_handle) liText.textContent = s.linkedin_handle;
  }

  // 9. Contact: Email
  const emailCard = document.getElementById('emailCard') || document.querySelector('a[href*="mailto:"]');
  if (emailCard) {
    if (s.email) {
      emailCard.href = `mailto:${s.email}`;
      const emailText = emailCard.querySelector('p');
      if (emailText) emailText.textContent = s.email;
    }
  }
}

function reanimateText(el) {
  if (typeof SplitText !== 'undefined' && typeof gsap !== 'undefined') {
    try {
      const split = new SplitText(el, { type: 'lines,words' });
      gsap.fromTo(split.words, 
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.02, ease: 'power3.out', clearProps: 'opacity,transform' }
      );
    } catch(e) {}
  }
}

function updateMarqueeContent(text) {
  const marqueeContent = document.getElementById('marqueeContent') || document.querySelector('.marquee-content');
  if (!marqueeContent) return;

  const items = text.split(/[•\*\,\;]/).map(t => t.trim()).filter(Boolean);
  if (items.length === 0) return;

  const starIcon = '&nbsp;&nbsp;<iconify-icon icon="ph:star-four-fill" style="color: var(--text-secondary); font-size: 20px;"></iconify-icon>&nbsp;&nbsp;';
  const loopPart = items.join(starIcon) + starIcon;

  marqueeContent.innerHTML = `
    <span class="marquee-item">${loopPart}${loopPart}</span>
    <span class="marquee-item">${loopPart}${loopPart}</span>
  `;
}

async function loadHomeExperience() {
  const expList = document.getElementById('experienceList');
  if (!expList) return;

  let experiences = [];

  // 1. Try local API first
  try {
    const res = await fetch(`${getPublicApiBase('/experience')}?t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
        experiences = data.data;
      }
    }
  } catch (e) {}

  // 2. Fallback to Google Sheets if local is empty or offline
  if (experiences.length === 0) {
    try {
      const url = new URL(FALLBACK_SCRIPT_URL);
      url.searchParams.append('action', 'getExperience');
      url.searchParams.append('t', Date.now());

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        experiences = data.data;
      }
    } catch (e) {}
  }

  if (experiences.length > 0) {
    expList.innerHTML = '';
    experiences.forEach(exp => {
      let descriptionHtml = '';
      if (exp.description) {
        const paragraphs = exp.description.split('\n').filter(p => p.trim() !== '');
        descriptionHtml = '<div style="margin-top: 8px; color: var(--text-secondary); font-size: 14px; line-height: 1.5;">' + paragraphs.map(p => `<p style="margin-bottom: 4px;">${escapeHtml(p)}</p>`).join('') + '</div>';
      }
      expList.innerHTML += `
        <li class="exp-item">
          <h4>${escapeHtml(exp.company)}</h4>
          <span class="meta" style="margin-bottom: 4px;">${escapeHtml(exp.role)}</span>
          <span class="meta" style="color: var(--text-primary); font-size: 13px; font-weight: 600;">${escapeHtml(exp.duration)}</span>
          ${descriptionHtml}
        </li>
      `;
    });

    if (typeof gsap !== 'undefined') {
      gsap.from(".exp-item", {
        x: -20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: "power2.out",
        clearProps: "all"
      });
    }
  } else {
    expList.innerHTML = '<li style="opacity: 0.5;">No experience listed.</li>';
  }
}

// Utility
function escapeHtml(str) {
  if (!str) return '';
  return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
