// ==========================================
// Admin CMS Client Logic
// Connects to Node.js Backend API
// ==========================================

const API_BASE = (
  (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ||
  window.location.port === '3000'
) ? '/api' : 'http://localhost:3000/api';

let sessionToken = localStorage.getItem('portfolio_admin_token') || null;
let currentProjects = [];
let currentCategories = [];
let currentGalleryImages = []; // Array of URL strings for the active project modal

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const adminLayout = document.getElementById('adminLayout');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');

// Pre-fill username default for convenience
if (usernameInput && !usernameInput.value) {
  usernameInput.value = 'admin';
}
const logoutBtn = document.getElementById('logoutBtn');
const refreshDataBtn = document.getElementById('refreshDataBtn');
const topAddProjectBtn = document.getElementById('topAddProjectBtn');
const pageTitle = document.getElementById('pageTitle');
const toastEl = document.getElementById('toast');
const loaderEl = document.getElementById('loader');
const loaderMessage = document.getElementById('loaderMessage');

// Modals
const projectModal = document.getElementById('projectModal');
const projectForm = document.getElementById('projectForm');
const categoryModal = document.getElementById('categoryModal');
const categoryForm = document.getElementById('categoryForm');
const experienceModal = document.getElementById('experienceModal');
const experienceForm = document.getElementById('experienceForm');

// ==========================================
// Helpers: Toast & Loader
// ==========================================
function showToast(message, type = 'success') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;
  setTimeout(() => {
    toastEl.className = 'toast';
  }, 3500);
}

function showLoader(message = 'Processing...') {
  loaderMessage.textContent = message;
  loaderEl.style.display = 'flex';
}

function hideLoader() {
  loaderEl.style.display = 'none';
}

// ==========================================
// API Client
// ==========================================
async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = options.headers || {};
  
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(url, { ...options, headers });
    
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      if (res.status === 404) {
        throw new Error(`API endpoint not found (404) at ${url}. Check server or Vercel rewrites.`);
      }
      throw new Error(`Server returned unexpected response (${res.status}): ${text.slice(0, 120)}`);
    }

    if (res.status === 401) {
      handleUnauthorized();
      throw new Error(data.message || 'Session expired. Please log in.');
    }

    if (!res.ok) {
      throw new Error(data.message || 'API request failed');
    }

    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    throw err;
  }
}

// File Upload helper (Base64)
async function uploadFiles(fileList) {
  showLoader('Uploading media...');
  const payloads = [];

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const base64 = await toBase64(file);
    payloads.push({
      name: file.name,
      mimeType: file.type,
      data: base64
    });
  }

  try {
    const res = await api('/upload', {
      method: 'POST',
      body: { files: payloads }
    });
    hideLoader();
    return res.urls || [res.url];
  } catch (e) {
    hideLoader();
    showToast('Failed to upload files: ' + e.message, 'error');
    return [];
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Strip 'data:image/...;base64,' prefix
      const result = reader.result.toString();
      const commaIdx = result.indexOf(',');
      resolve(commaIdx !== -1 ? result.substring(commaIdx + 1) : result);
    };
    reader.onerror = reject;
  });
}

// ==========================================
// Authentication
// ==========================================
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = (usernameInput.value || 'admin').trim();
  const password = passwordInput.value;

  showLoader('Signing in...');
  try {
    const res = await api('/auth/login', {
      method: 'POST',
      body: { username, password }
    });

    sessionToken = res.token;
    localStorage.setItem('portfolio_admin_token', sessionToken);
    document.getElementById('adminUsernameDisplay').textContent = res.user.username;

    loginScreen.style.display = 'none';
    adminLayout.style.display = 'flex';
    hideLoader();
    showToast('Signed in successfully');
    loadDashboard();
  } catch (err) {
    hideLoader();
    showToast(err.message, 'error');
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch (e) {}
  sessionToken = null;
  localStorage.removeItem('portfolio_admin_token');
  loginScreen.style.display = 'flex';
  adminLayout.style.display = 'none';
  showToast('Logged out');
});

function handleUnauthorized() {
  sessionToken = null;
  localStorage.removeItem('portfolio_admin_token');
  loginScreen.style.display = 'flex';
  adminLayout.style.display = 'none';
}

async function checkAuth() {
  if (!sessionToken) {
    loginScreen.style.display = 'flex';
    adminLayout.style.display = 'none';
    return;
  }

  try {
    const res = await api('/auth/me');
    document.getElementById('adminUsernameDisplay').textContent = res.user.username;
    loginScreen.style.display = 'none';
    adminLayout.style.display = 'flex';
    loadDashboard();
  } catch (e) {
    loginScreen.style.display = 'flex';
    adminLayout.style.display = 'none';
  }
}

// ==========================================
// Tab Switching
// ==========================================
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  navItems.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  tabPanes.forEach(pane => pane.classList.toggle('active', pane.id === `tab-${tabName}`));

  const titles = {
    dashboard: 'Dashboard',
    projects: 'Projects Management',
    categories: 'Categories',
    about: 'About & Contact Settings',
    settings: 'CMS Settings'
  };
  pageTitle.textContent = titles[tabName] || 'Dashboard';

  if (tabName === 'dashboard') loadDashboard();
  else if (tabName === 'projects') loadProjects();
  else if (tabName === 'categories') loadCategories();
  else if (tabName === 'about') loadAbout();
}

document.getElementById('viewAllProjectsBtn').addEventListener('click', () => switchTab('projects'));
refreshDataBtn.addEventListener('click', () => {
  const activeTab = document.querySelector('.nav-item.active').dataset.tab;
  switchTab(activeTab);
  showToast('Refreshed data');
});

// ==========================================
// 1. DASHBOARD
// ==========================================
async function loadDashboard() {
  try {
    const res = await api('/admin/stats');
    const stats = res.data;

    document.getElementById('statTotalProjects').textContent = stats.totalProjects;
    document.getElementById('statPublishedProjects').textContent = stats.publishedProjects;
    document.getElementById('statDraftProjects').textContent = stats.draftProjects;
    document.getElementById('statCategories').textContent = stats.totalCategories;

    const tbody = document.getElementById('recentProjectsTableBody');
    if (!stats.recentProjects || stats.recentProjects.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No projects created yet.</td></tr>';
      return;
    }

    tbody.innerHTML = stats.recentProjects.map(p => `
      <tr>
        <td>
          <img src="${p.cover_image ? '../' + p.cover_image : '../favicon_io/favicon.svg'}" class="table-thumb" alt="Thumb" onerror="this.src='../pfp 1.png'">
        </td>
        <td>
          <strong>${escapeHtml(p.title)}</strong>
        </td>
        <td><span class="badge badge-category">${escapeHtml(p.category_name || p.category_id)}</span></td>
        <td>
          <span class="badge ${p.published ? 'badge-published' : 'badge-draft'}">
            ${p.published ? 'Published' : 'Draft'}
          </span>
        </td>
        <td>
          <iconify-icon icon="${p.featured ? 'ph:star-fill' : 'ph:star-light'}" class="${p.featured ? 'star-featured' : 'star-unfeatured'}"></iconify-icon>
        </td>
        <td>${new Date(p.created_at).toLocaleDateString()}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn" title="Edit" onclick="openEditProjectModal('${p.id}')">
              <iconify-icon icon="ph:pencil-simple-line-light"></iconify-icon>
            </button>
            <button class="action-btn" title="Toggle Publish" onclick="togglePublishProject('${p.id}', ${p.published ? 0 : 1})">
              <iconify-icon icon="${p.published ? 'ph:eye-slash-light' : 'ph:eye-light'}"></iconify-icon>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    showToast('Failed to load dashboard: ' + e.message, 'error');
  }
}

// ==========================================
// 2. PROJECTS MANAGEMENT
// ==========================================
const projectSearchInput = document.getElementById('projectSearchInput');
const projectCategoryFilter = document.getElementById('projectCategoryFilter');
const projectStatusFilter = document.getElementById('projectStatusFilter');
const projectsTableBody = document.getElementById('projectsTableBody');

projectSearchInput.addEventListener('input', debounce(loadProjects, 300));
projectCategoryFilter.addEventListener('change', loadProjects);
projectStatusFilter.addEventListener('change', loadProjects);

async function loadProjects() {
  showLoader('Loading projects...');
  try {
    // Also ensure categories are loaded for the filter dropdown
    await loadCategoriesDropdown();

    const category = projectCategoryFilter.value;
    const status = projectStatusFilter.value;
    const search = projectSearchInput.value.trim();

    const params = new URLSearchParams();
    if (category && category !== 'all') params.append('category', category);
    if (status && status !== 'all') params.append('status', status);
    if (search) params.append('search', search);

    const res = await api(`/admin/projects?${params.toString()}`);
    currentProjects = res.data;
    renderProjectsTable(currentProjects);
    hideLoader();
  } catch (e) {
    hideLoader();
    showToast('Failed to load projects: ' + e.message, 'error');
  }
}

function renderProjectsTable(projects) {
  if (!projects || projects.length === 0) {
    projectsTableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No matching projects found.</td></tr>';
    return;
  }

  projectsTableBody.innerHTML = projects.map(p => `
    <tr data-id="${p.id}">
      <td>
        <span style="font-weight: 600; color: var(--admin-text-muted); font-size: 13px;">#${p.display_order}</span>
      </td>
      <td>
        <img src="${p.cover_image ? (p.cover_image.startsWith('http') ? p.cover_image : '../' + p.cover_image) : '../pfp 1.png'}" class="table-thumb" alt="Thumb" onerror="this.src='../pfp 1.png'">
      </td>
      <td>
        <div style="font-weight: 600; color: var(--admin-text-main); font-size: 15px;">${escapeHtml(p.title)}</div>
        <div style="font-size: 12px; color: var(--admin-text-muted); margin-top: 2px;">
          ${p.client ? '<strong>Client:</strong> ' + escapeHtml(p.client) + ' • ' : ''}
          ${p.year ? escapeHtml(p.year) + ' • ' : ''}
          <code>/${escapeHtml(p.slug)}</code>
        </div>
      </td>
      <td>
        <span class="badge badge-category">${escapeHtml(p.category_name || p.category_id)}</span>
      </td>
      <td>
        <button class="badge ${p.published ? 'badge-published' : 'badge-draft'}" style="cursor: pointer; border: none;" onclick="togglePublishProject('${p.id}', ${p.published ? 0 : 1})">
          <iconify-icon icon="${p.published ? 'ph:check-circle-fill' : 'ph:circle-dashed'}"></iconify-icon>
          ${p.published ? 'Published' : 'Draft'}
        </button>
      </td>
      <td>
        <button class="action-btn" onclick="toggleFeaturedProject('${p.id}', ${p.featured ? 0 : 1})" title="Toggle Featured">
          <iconify-icon icon="${p.featured ? 'ph:star-fill' : 'ph:star-light'}" class="${p.featured ? 'star-featured' : 'star-unfeatured'}"></iconify-icon>
        </button>
      </td>
      <td style="text-align: right;">
        <div class="action-btns">
          <button class="action-btn" title="Edit" onclick="openEditProjectModal('${p.id}')">
            <iconify-icon icon="ph:pencil-simple-line-light"></iconify-icon>
          </button>
          <button class="action-btn" title="Duplicate" onclick="duplicateProject('${p.id}')">
            <iconify-icon icon="ph:copy-light"></iconify-icon>
          </button>
          <button class="action-btn delete" title="Delete" onclick="deleteProject('${p.id}')">
            <iconify-icon icon="ph:trash-light"></iconify-icon>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadCategoriesDropdown() {
  if (currentCategories.length === 0) {
    const res = await api('/admin/categories');
    currentCategories = res.data;
  }

  // Populate filter
  const filterVal = projectCategoryFilter.value;
  projectCategoryFilter.innerHTML = '<option value="all">All Categories</option>' + 
    currentCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if (filterVal) projectCategoryFilter.value = filterVal;

  // Populate modal select
  const modalSelect = document.getElementById('projCategory');
  modalSelect.innerHTML = currentCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

// Quick Actions
async function togglePublishProject(id, newStatus) {
  try {
    await api(`/admin/projects/${id}/status`, {
      method: 'PATCH',
      body: { published: newStatus }
    });
    showToast(newStatus ? 'Project published' : 'Project moved to drafts');
    loadProjects();
  } catch (e) {
    showToast('Failed to update status: ' + e.message, 'error');
  }
}

async function toggleFeaturedProject(id, newFeatured) {
  try {
    await api(`/admin/projects/${id}/featured`, {
      method: 'PATCH',
      body: { featured: newFeatured }
    });
    showToast(newFeatured ? 'Marked as featured' : 'Unmarked from featured');
    loadProjects();
  } catch (e) {
    showToast('Failed to update featured: ' + e.message, 'error');
  }
}

async function duplicateProject(id) {
  showLoader('Duplicating project...');
  try {
    const res = await api(`/admin/projects/${id}/duplicate`, { method: 'POST' });
    hideLoader();
    showToast(`Project duplicated as "${res.title}" (Draft)`);
    loadProjects();
  } catch (e) {
    hideLoader();
    showToast('Failed to duplicate: ' + e.message, 'error');
  }
}

async function deleteProject(id) {
  if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
  showLoader('Deleting project...');
  try {
    await api(`/admin/projects/${id}`, { method: 'DELETE' });
    hideLoader();
    showToast('Project deleted successfully');
    loadProjects();
  } catch (e) {
    hideLoader();
    showToast('Failed to delete: ' + e.message, 'error');
  }
}

// Project Modal Logic (Add & Edit)
document.getElementById('addProjectBtn').addEventListener('click', () => openAddProjectModal());
topAddProjectBtn.addEventListener('click', () => openAddProjectModal());
document.getElementById('closeProjectModalBtn').addEventListener('click', closeProjectModal);
document.getElementById('cancelProjectModalBtn').addEventListener('click', closeProjectModal);

// Modal Subtab Switching
const subTabs = document.querySelectorAll('.sub-tab');
subTabs.forEach(st => {
  st.addEventListener('click', () => {
    const subtabName = st.dataset.subtab;
    subTabs.forEach(t => t.classList.toggle('active', t.dataset.subtab === subtabName));
    document.querySelectorAll('.subtab-pane').forEach(p => p.classList.toggle('active', p.id === `subtab-${subtabName}`));
  });
});

function openAddProjectModal() {
  projectForm.reset();
  document.getElementById('projectId').value = '';
  document.getElementById('projectModalTitle').textContent = 'Add New Project';
  currentGalleryImages = [];
  renderGalleryList();
  updateCoverPreview('');
  
  // Set default subtab
  subTabs[0].click();
  projectModal.classList.add('show');
}

async function openEditProjectModal(id) {
  showLoader('Loading project details...');
  try {
    const res = await api(`/admin/projects/${id}`);
    const p = res.data;
    hideLoader();

    document.getElementById('projectId').value = p.id;
    document.getElementById('projectModalTitle').textContent = 'Edit Project';
    document.getElementById('projTitle').value = p.title || '';
    document.getElementById('projSlug').value = p.slug || '';
    document.getElementById('projCategory').value = p.category_id || 'posters';
    document.getElementById('projClient').value = p.client || '';
    document.getElementById('projYear').value = p.year || '';
    document.getElementById('projShortDesc').value = p.short_description || '';
    document.getElementById('projDesc').value = p.description || '';
    document.getElementById('projObjective').value = p.design_objective || '';
    document.getElementById('projTools').value = p.tools || '';
    document.getElementById('projTags').value = p.tags || '';
    document.getElementById('projCoverImage').value = p.cover_image || '';
    document.getElementById('projFeatured').checked = Boolean(p.featured);
    document.getElementById('projDisplayOrder').value = p.display_order || 0;

    const publishedRadio = document.querySelector(`input[name="projPublished"][value="${p.published ? 1 : 0}"]`);
    if (publishedRadio) publishedRadio.checked = true;

    updateCoverPreview(p.cover_image);

    // Gallery images
    currentGalleryImages = (p.images || []).map(img => typeof img === 'string' ? img : img.image_url);
    renderGalleryList();

    subTabs[0].click();
    projectModal.classList.add('show');
  } catch (e) {
    hideLoader();
    showToast('Failed to load project: ' + e.message, 'error');
  }
}

function closeProjectModal() {
  projectModal.classList.remove('show');
}

// Cover image input change
document.getElementById('projCoverImage').addEventListener('input', (e) => {
  updateCoverPreview(e.target.value.trim());
});

document.getElementById('coverFileInput').addEventListener('change', async (e) => {
  if (e.target.files && e.target.files.length > 0) {
    const urls = await uploadFiles(e.target.files);
    if (urls.length > 0) {
      document.getElementById('projCoverImage').value = urls[0];
      updateCoverPreview(urls[0]);
    }
  }
});

function updateCoverPreview(url) {
  const container = document.getElementById('coverImagePreview');
  if (!url) {
    container.innerHTML = '<iconify-icon icon="ph:image-light"></iconify-icon><span>No cover image</span>';
    return;
  }
  const imgSrc = url.startsWith('http') ? url : (url.startsWith('uploads') || url.startsWith('images') ? '../' + url : '../' + url);
  container.innerHTML = `<img src="${imgSrc}" alt="Cover" onerror="this.src='../pfp 1.png'">`;
}

// Gallery Uploads (File Input & Drag-Drop)
const galleryFileInput = document.getElementById('galleryFileInput');
const galleryDropzone = document.getElementById('galleryDropzone');

galleryFileInput.addEventListener('change', async (e) => {
  if (e.target.files && e.target.files.length > 0) {
    const urls = await uploadFiles(e.target.files);
    currentGalleryImages.push(...urls);
    renderGalleryList();
  }
});

galleryDropzone.addEventListener('click', () => galleryFileInput.click());

['dragenter', 'dragover'].forEach(name => {
  galleryDropzone.addEventListener(name, (e) => {
    e.preventDefault();
    galleryDropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(name => {
  galleryDropzone.addEventListener(name, (e) => {
    e.preventDefault();
    galleryDropzone.classList.remove('dragover');
  });
});

galleryDropzone.addEventListener('drop', async (e) => {
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const urls = await uploadFiles(e.dataTransfer.files);
    currentGalleryImages.push(...urls);
    renderGalleryList();
  }
});

function renderGalleryList() {
  const container = document.getElementById('galleryItemsContainer');
  if (currentGalleryImages.length === 0) {
    container.innerHTML = '<p style="font-size: 13px; color: var(--admin-text-muted); text-align: center; padding: 12px;">No presentation gallery images added yet.</p>';
    return;
  }

  container.innerHTML = currentGalleryImages.map((imgUrl, idx) => {
    const src = imgUrl.startsWith('http') ? imgUrl : '../' + imgUrl;
    return `
      <div class="gallery-item" data-index="${idx}">
        <span style="font-size: 12px; font-weight: 700; color: var(--admin-text-muted); width: 24px;">#${idx + 1}</span>
        <img src="${src}" class="gallery-thumb" alt="Slice" onerror="this.src='../pfp 1.png'">
        <span class="gallery-url">${escapeHtml(imgUrl)}</span>
        <div class="gallery-actions">
          ${idx > 0 ? `<button type="button" class="action-btn" title="Move Up" onclick="moveGalleryImage(${idx}, -1)"><iconify-icon icon="ph:arrow-up-light"></iconify-icon></button>` : ''}
          ${idx < currentGalleryImages.length - 1 ? `<button type="button" class="action-btn" title="Move Down" onclick="moveGalleryImage(${idx}, 1)"><iconify-icon icon="ph:arrow-down-light"></iconify-icon></button>` : ''}
          <button type="button" class="action-btn" title="Set as Cover" onclick="setGalleryAsCover('${imgUrl}')"><iconify-icon icon="ph:image-square-light"></iconify-icon></button>
          <button type="button" class="action-btn delete" title="Remove" onclick="removeGalleryImage(${idx})"><iconify-icon icon="ph:trash-light"></iconify-icon></button>
        </div>
      </div>
    `;
  }).join('');
}

window.moveGalleryImage = function(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= currentGalleryImages.length) return;
  const temp = currentGalleryImages[index];
  currentGalleryImages[index] = currentGalleryImages[targetIndex];
  currentGalleryImages[targetIndex] = temp;
  renderGalleryList();
};

window.removeGalleryImage = function(index) {
  currentGalleryImages.splice(index, 1);
  renderGalleryList();
};

window.setGalleryAsCover = function(url) {
  document.getElementById('projCoverImage').value = url;
  updateCoverPreview(url);
  showToast('Set as project cover image');
};

// Project Save Form
projectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('projectId').value;
  const title = document.getElementById('projTitle').value.trim();
  const slug = document.getElementById('projSlug').value.trim();
  const category_id = document.getElementById('projCategory').value;
  const client = document.getElementById('projClient').value.trim();
  const year = document.getElementById('projYear').value.trim();
  const short_description = document.getElementById('projShortDesc').value.trim();
  const description = document.getElementById('projDesc').value.trim();
  const design_objective = document.getElementById('projObjective').value.trim();
  const tools = document.getElementById('projTools').value.trim();
  const tags = document.getElementById('projTags').value.trim();
  const cover_image = document.getElementById('projCoverImage').value.trim();
  const featured = document.getElementById('projFeatured').checked ? 1 : 0;
  const published = Number(document.querySelector('input[name="projPublished"]:checked').value);
  const display_order = parseInt(document.getElementById('projDisplayOrder').value, 10) || 0;

  const payload = {
    title,
    slug,
    category_id,
    client,
    year,
    short_description,
    description,
    design_objective,
    tools,
    tags,
    cover_image,
    featured,
    published,
    display_order,
    images: currentGalleryImages
  };

  showLoader('Saving project...');
  try {
    if (id) {
      await api(`/admin/projects/${id}`, { method: 'PUT', body: payload });
      showToast('Project updated successfully');
    } else {
      await api('/admin/projects', { method: 'POST', body: payload });
      showToast('Project created successfully');
    }
    hideLoader();
    closeProjectModal();
    loadProjects();
  } catch (err) {
    hideLoader();
    showToast('Failed to save project: ' + err.message, 'error');
  }
});

// ==========================================
// 3. CATEGORIES MANAGEMENT
// ==========================================
document.getElementById('addCategoryBtn').addEventListener('click', () => openAddCategoryModal());
document.getElementById('closeCategoryModalBtn').addEventListener('click', () => categoryModal.classList.remove('show'));
document.getElementById('cancelCategoryModalBtn').addEventListener('click', () => categoryModal.classList.remove('show'));

async function loadCategories() {
  showLoader('Loading categories...');
  try {
    const res = await api('/admin/categories');
    currentCategories = res.data;
    hideLoader();
    renderCategoriesTable(currentCategories);
  } catch (e) {
    hideLoader();
    showToast('Failed to load categories: ' + e.message, 'error');
  }
}

function renderCategoriesTable(categories) {
  const tbody = document.getElementById('categoriesTableBody');
  if (categories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">No categories found.</td></tr>';
    return;
  }

  tbody.innerHTML = categories.map((cat, idx) => `
    <tr>
      <td><strong>#${cat.display_order}</strong></td>
      <td>
        <strong>${escapeHtml(cat.name)}</strong>
      </td>
      <td><code>${escapeHtml(cat.slug)}</code></td>
      <td>
        <iconify-icon icon="${cat.icon || 'ph:folder-light'}" style="font-size: 20px;"></iconify-icon>
        <span style="font-size: 12px; color: var(--admin-text-muted); margin-left: 6px;">${escapeHtml(cat.icon || '')}</span>
      </td>
      <td><span style="font-size: 13px; color: var(--admin-text-muted);">${escapeHtml(cat.description || '')}</span></td>
      <td style="text-align: right;">
        <div class="action-btns">
          ${idx > 0 ? `<button class="action-btn" title="Move Up" onclick="moveCategory(${idx}, -1)"><iconify-icon icon="ph:arrow-up-light"></iconify-icon></button>` : ''}
          ${idx < categories.length - 1 ? `<button class="action-btn" title="Move Down" onclick="moveCategory(${idx}, 1)"><iconify-icon icon="ph:arrow-down-light"></iconify-icon></button>` : ''}
          <button class="action-btn" title="Edit" onclick="openEditCategoryModal('${cat.id}')">
            <iconify-icon icon="ph:pencil-simple-line-light"></iconify-icon>
          </button>
          <button class="action-btn delete" title="Delete" onclick="deleteCategory('${cat.id}')">
            <iconify-icon icon="ph:trash-light"></iconify-icon>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddCategoryModal() {
  categoryForm.reset();
  document.getElementById('categoryEditId').value = '';
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  document.getElementById('catSlug').readOnly = false;
  categoryModal.classList.add('show');
}

function openEditCategoryModal(id) {
  const cat = currentCategories.find(c => c.id === id);
  if (!cat) return;

  document.getElementById('categoryEditId').value = cat.id;
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';
  document.getElementById('catName').value = cat.name;
  document.getElementById('catSlug').value = cat.slug;
  document.getElementById('catSlug').readOnly = true; // Protect ID
  document.getElementById('catIcon').value = cat.icon || 'ph:folder-light';
  document.getElementById('catDesc').value = cat.description || '';
  document.getElementById('catDisplayOrder').value = cat.display_order || 0;

  categoryModal.classList.add('show');
}

categoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('categoryEditId').value;
  const name = document.getElementById('catName').value.trim();
  const slug = document.getElementById('catSlug').value.trim();
  const icon = document.getElementById('catIcon').value.trim();
  const description = document.getElementById('catDesc').value.trim();
  const display_order = parseInt(document.getElementById('catDisplayOrder').value, 10) || 0;

  const payload = { name, slug, icon, description, display_order };

  showLoader('Saving category...');
  try {
    if (id) {
      await api(`/admin/categories/${id}`, { method: 'PUT', body: payload });
      showToast('Category updated');
    } else {
      await api('/admin/categories', { method: 'POST', body: { ...payload, id: slug } });
      showToast('Category created');
    }
    hideLoader();
    categoryModal.classList.remove('show');
    loadCategories();
  } catch (err) {
    hideLoader();
    showToast('Failed to save category: ' + err.message, 'error');
  }
});

async function moveCategory(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= currentCategories.length) return;
  const temp = currentCategories[index];
  currentCategories[index] = currentCategories[targetIndex];
  currentCategories[targetIndex] = temp;

  const categoryIds = currentCategories.map(c => c.id);
  try {
    await api('/admin/categories/reorder', { method: 'PATCH', body: { categoryIds } });
    loadCategories();
  } catch (e) {
    showToast('Failed to reorder: ' + e.message, 'error');
  }
}

async function deleteCategory(id) {
  if (!confirm(`Are you sure you want to delete category "${id}"?`)) return;
  try {
    await api(`/admin/categories/${id}`, { method: 'DELETE' });
    showToast('Category deleted');
    loadCategories();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ==========================================
// 4. ABOUT & CONTACT CMS
// ==========================================
async function loadAbout() {
  showLoader('Loading about settings...');
  try {
    const res = await api('/admin/about');
    const s = res.data;

    document.getElementById('aboutName').value = s.name || '';
    document.getElementById('aboutProfession').value = s.profession || '';
    document.getElementById('aboutHeroGreeting').value = s.hero_greeting || '';
    document.getElementById('aboutHeroTagline').value = s.hero_tagline || '';
    document.getElementById('aboutProfileImage').value = s.profile_image || '';
    document.getElementById('aboutMarqueeText').value = s.marquee_text || '';
    document.getElementById('aboutEmail').value = s.email || '';
    document.getElementById('aboutWhatsapp').value = s.whatsapp || '';
    document.getElementById('aboutWhatsappLink').value = s.whatsapp_link || '';
    document.getElementById('aboutLinkedinHandle').value = s.linkedin_handle || '';
    document.getElementById('aboutLinkedinLink').value = s.linkedin_link || '';

    await loadExperience();
    hideLoader();
  } catch (e) {
    hideLoader();
    showToast('Failed to load settings: ' + e.message, 'error');
  }
}

document.getElementById('profileImageUpload').addEventListener('change', async (e) => {
  if (e.target.files && e.target.files.length > 0) {
    const urls = await uploadFiles(e.target.files);
    if (urls.length > 0) {
      document.getElementById('aboutProfileImage').value = urls[0];
      showToast('Profile image uploaded');
    }
  }
});

document.getElementById('aboutSettingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings = {
    name: document.getElementById('aboutName').value.trim(),
    profession: document.getElementById('aboutProfession').value.trim(),
    hero_greeting: document.getElementById('aboutHeroGreeting').value.trim(),
    hero_tagline: document.getElementById('aboutHeroTagline').value.trim(),
    profile_image: document.getElementById('aboutProfileImage').value.trim(),
    marquee_text: document.getElementById('aboutMarqueeText').value.trim(),
    email: document.getElementById('aboutEmail').value.trim(),
    whatsapp: document.getElementById('aboutWhatsapp').value.trim(),
    whatsapp_link: document.getElementById('aboutWhatsappLink').value.trim(),
    linkedin_handle: document.getElementById('aboutLinkedinHandle').value.trim(),
    linkedin_link: document.getElementById('aboutLinkedinLink').value.trim()
  };

  showLoader('Saving settings...');
  try {
    await api('/admin/about', { method: 'PUT', body: { settings } });
    hideLoader();
    showToast('About and Contact information updated successfully');
  } catch (err) {
    hideLoader();
    showToast('Failed to save settings: ' + err.message, 'error');
  }
});

// Experience CRUD
async function loadExperience() {
  const tbody = document.getElementById('experienceTableBody');
  try {
    const res = await api('/admin/experience');
    const experiences = res.data;

    if (experiences.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No experience listed.</td></tr>';
      return;
    }

    tbody.innerHTML = experiences.map(exp => `
      <tr>
        <td><strong>${escapeHtml(exp.company)}</strong></td>
        <td>${escapeHtml(exp.role)}</td>
        <td><span class="badge badge-category">${escapeHtml(exp.duration)}</span></td>
        <td><span style="font-size: 13px; color: var(--admin-text-muted);">${escapeHtml(exp.description || '')}</span></td>
        <td style="text-align: right;">
          <div class="action-btns">
            <button type="button" class="action-btn" title="Edit" onclick="openEditExperienceModal('${exp.id}')">
              <iconify-icon icon="ph:pencil-simple-line-light"></iconify-icon>
            </button>
            <button type="button" class="action-btn delete" title="Delete" onclick="deleteExperience('${exp.id}')">
              <iconify-icon icon="ph:trash-light"></iconify-icon>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell" style="color: red;">Error loading experience: ${e.message}</td></tr>`;
  }
}

document.getElementById('addExperienceBtn').addEventListener('click', () => {
  experienceForm.reset();
  document.getElementById('expId').value = '';
  document.getElementById('experienceModalTitle').textContent = 'Add Experience';
  experienceModal.classList.add('show');
});

document.getElementById('closeExperienceModalBtn').addEventListener('click', () => experienceModal.classList.remove('show'));
document.getElementById('cancelExperienceModalBtn').addEventListener('click', () => experienceModal.classList.remove('show'));

window.openEditExperienceModal = async function(id) {
  showLoader('Loading experience item...');
  try {
    const res = await api('/admin/experience');
    const exp = res.data.find(e => e.id === id);
    hideLoader();
    if (!exp) return;

    document.getElementById('expId').value = exp.id;
    document.getElementById('experienceModalTitle').textContent = 'Edit Experience';
    document.getElementById('expCompany').value = exp.company;
    document.getElementById('expRole').value = exp.role;
    document.getElementById('expDuration').value = exp.duration;
    document.getElementById('expDesc').value = exp.description || '';

    experienceModal.classList.add('show');
  } catch (e) {
    hideLoader();
    showToast('Failed to load item: ' + e.message, 'error');
  }
};

experienceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('expId').value;
  const company = document.getElementById('expCompany').value.trim();
  const role = document.getElementById('expRole').value.trim();
  const duration = document.getElementById('expDuration').value.trim();
  const description = document.getElementById('expDesc').value.trim();

  const payload = { company, role, duration, description };
  showLoader('Saving experience...');
  try {
    if (id) {
      await api(`/admin/experience/${id}`, { method: 'PUT', body: payload });
      showToast('Experience updated');
    } else {
      await api('/admin/experience', { method: 'POST', body: payload });
      showToast('Experience added');
    }
    hideLoader();
    experienceModal.classList.remove('show');
    loadExperience();
  } catch (err) {
    hideLoader();
    showToast('Failed to save: ' + err.message, 'error');
  }
});

window.deleteExperience = async function(id) {
  if (!confirm('Are you sure you want to delete this experience entry?')) return;
  try {
    await api(`/admin/experience/${id}`, { method: 'DELETE' });
    showToast('Experience deleted');
    loadExperience();
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// ==========================================
// 5. SETTINGS
// ==========================================
document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPasswordInput').value;
  const newPassword = document.getElementById('newPasswordInput').value;
  const confirmPassword = document.getElementById('confirmPasswordInput').value;

  if (newPassword.length < 6) {
    return showToast('New password must be at least 6 characters', 'error');
  }
  if (newPassword !== confirmPassword) {
    return showToast('Passwords do not match', 'error');
  }

  showLoader('Updating password...');
  try {
    await api('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword }
    });
    hideLoader();
    showToast('Password updated successfully');
    document.getElementById('changePasswordForm').reset();
  } catch (err) {
    hideLoader();
    showToast(err.message, 'error');
  }
});

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Initial Boot Check
checkAuth();
