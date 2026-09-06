// Configuration
// YOU MUST REPLACE THIS WITH YOUR GOOGLE APPS SCRIPT WEB APP URL
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw6L-z19_veg2EPygX8zBmaG5XOxw9wuz2EXhDLfAaoJZXRi4HNjJ6XOpWGeeScSaPw/exec';

// DOM Elements
const form = document.getElementById('projectForm');
const fileInput = document.getElementById('fileInput');
const fileDropzone = document.getElementById('fileDropzone');
const fileList = document.getElementById('fileList');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTime = document.getElementById('recordingTime');
const audioPreview = document.getElementById('audioPreview');
const loader = document.getElementById('loader');
const toast = document.getElementById('toast');

// State
let uploadedFiles = [];
let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let recordingInterval;
let recordingSeconds = 0;
let sessionId = 'session_' + Math.random().toString(36).substr(2, 9);

const toBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = error => reject(error);
});

// ==========================================
// Toast Notification
// ==========================================
function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 5000);
}

// ==========================================
// Dynamic Budget Logic
// ==========================================
function updateBudgetOptions() {
  const selectedServices = Array.from(document.querySelectorAll('input[name="services"]:checked')).map(cb => cb.value);
  const budgetContainer = document.getElementById('budget_chip_group');
  if (!budgetContainer) return;

  let presets = [500, 1000, 2000]; // Default

  if (selectedServices.length > 0) {
    let t1 = 0, t2 = 0, t3 = 0;

    if (selectedServices.includes('Web Design')) {
      t1 += 5000; t2 += 10000; t3 += 20000;
    }
    if (selectedServices.includes('Branding')) {
      t1 += 10000; t2 += 15000; t3 += 20000;
    }
    if (selectedServices.includes('Brochure')) {
      t1 += 200; t2 += 400; t3 += 800;
    }
    if (selectedServices.includes('Posters')) {
      t1 += 300; t2 += 600; t3 += 900;
    }

    presets = [t1, t2, t3];
  }

  let sub1 = '', sub2 = '', sub3 = '';
  if (selectedServices.includes('Posters')) {
    sub1 = ' <span style="font-size: 0.8rem; opacity: 0.7; margin-left: 0.4rem;">(1 Poster)</span>';
    sub2 = ' <span style="font-size: 0.8rem; opacity: 0.7; margin-left: 0.4rem;">(2 Posters)</span>';
    sub3 = ' <span style="font-size: 0.8rem; opacity: 0.7; margin-left: 0.4rem;">(3 Posters)</span>';
  }

  budgetContainer.innerHTML = `
    <input type="radio" id="budget_${presets[0]}" name="budget" value="${presets[0]}" class="chip-input" required onclick="document.getElementById('budget_custom_wrap').style.display='none'">
    <label for="budget_${presets[0]}" class="chip-label"><span class="curr-sym"></span>${presets[0]}${sub1}</label>

    <input type="radio" id="budget_${presets[1]}" name="budget" value="${presets[1]}" class="chip-input" onclick="document.getElementById('budget_custom_wrap').style.display='none'">
    <label for="budget_${presets[1]}" class="chip-label"><span class="curr-sym"></span>${presets[1]}${sub2}</label>

    <input type="radio" id="budget_${presets[2]}" name="budget" value="${presets[2]}" class="chip-input" onclick="document.getElementById('budget_custom_wrap').style.display='none'">
    <label for="budget_${presets[2]}" class="chip-label"><span class="curr-sym"></span>${presets[2]}${sub3}</label>

    <input type="radio" id="budget_custom_opt" name="budget" value="Custom" class="chip-input" onclick="document.getElementById('budget_custom_wrap').style.display='block'">
    <label for="budget_custom_opt" class="chip-label">Custom</label>
  `;

  if (typeof updateCurrencySymbols === 'function') {
    updateCurrencySymbols();
  }
}

function updateGoalOptions() {
  const selectedServices = Array.from(document.querySelectorAll('input[name="services"]:checked')).map(cb => cb.value);
  const goalContainer = document.getElementById('goal_chip_group');
  if (!goalContainer) return;

  let goals = new Set();

  if (selectedServices.length === 0) {
    goals = new Set(['Increase Sales', 'Generate Leads', 'Brand Awareness', 'Modernize / Redesign', 'Launch New Product']);
  } else {
    if (selectedServices.includes('Branding')) {
      ['Create Brand Identity', 'Rebranding', 'Brand Guidelines', 'Logo Design', 'Market Positioning'].forEach(g => goals.add(g));
    }
    if (selectedServices.includes('Posters') || selectedServices.includes('Brochure')) {
      ['Event Promotion', 'Product Marketing', 'Educational / Informational', 'Brand Awareness', 'Drive Foot Traffic'].forEach(g => goals.add(g));
    }
    if (selectedServices.includes('Web Design')) {
      ['Increase Conversions', 'Better User Experience', 'Modernize / Redesign', 'Informational / Portfolio', 'Generate Leads'].forEach(g => goals.add(g));
    }

    if (goals.size === 0) {
      goals = new Set(['Increase Sales', 'Generate Leads', 'Brand Awareness', 'Modernize / Redesign', 'Launch New Product']);
    }
  }

  let html = '';
  Array.from(goals).forEach((goal, i) => {
    html += `
      <input type="checkbox" id="goal_${i}" name="goal" value="${goal}" class="chip-input" onclick="document.getElementById('goal_custom_wrap').style.display='none'">
      <label for="goal_${i}" class="chip-label">${goal}</label>
    `;
  });
  html += `
    <input type="checkbox" id="goal_other" name="goal" value="Other" class="chip-input" onclick="document.getElementById('goal_custom_wrap').style.display=this.checked?'block':'none'">
    <label for="goal_other" class="chip-label">Other</label>
  `;
  goalContainer.innerHTML = html;
}

document.querySelectorAll('input[name="services"]').forEach(cb => {
  cb.addEventListener('change', () => {
    updateBudgetOptions();
    updateGoalOptions();
  });
});

// ==========================================
// File Upload Handling
// ==========================================
fileInput.addEventListener('change', handleFiles);
fileDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropzone.style.borderColor = 'var(--primary-color)';
});
fileDropzone.addEventListener('dragleave', () => {
  fileDropzone.style.borderColor = 'var(--border-color)';
});
fileDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDropzone.style.borderColor = 'var(--border-color)';
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    handleFiles();
  }
});

function handleFiles() {
  const files = Array.from(fileInput.files);
  const currentCount = uploadedFiles.length;
  if (currentCount + files.length > 5) {
    showToast('Maximum 5 files allowed.', 'error');
    return;
  }

  files.forEach(file => {
    // Check file size (max 5MB per file for base64 upload to Apps Script)
    if (file.size > 5 * 1024 * 1024) {
      showToast(`File ${file.name} is too large. Max 5MB.`, 'error');
      return;
    }
    const fileObj = { file: file, status: 'Uploading...', url: null };
    uploadedFiles.push(fileObj);
    uploadSingleFile(fileObj);
  });
  renderFileList();
}

async function uploadSingleFile(fileObj) {
  try {
    const b64 = await toBase64(fileObj.file);
    const payload = {
      action: 'uploadFile',
      sessionId: sessionId,
      file: {
        name: fileObj.file.name,
        mimeType: fileObj.file.type,
        data: b64
      }
    };

    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error('Server returned non-JSON response. This usually means the Apps Script deployment permissions are incorrect (needs to be "Anyone"). Raw response:', responseText);
      throw new Error('Server returned HTML instead of JSON. Please check Apps Script deployment settings.');
    }

    if (result.status === 'success') {
      fileObj.status = 'Uploaded';
      fileObj.url = result.url;
    } else {
      fileObj.status = 'Error';
      console.error('Backend error:', result.message);
      showToast('Upload failed: ' + (result.message || 'Unknown error'), 'error');
    }
  } catch (err) {
    fileObj.status = 'Error';
    console.error('Fetch error:', err);
    showToast('Network error during upload.', 'error');
  }
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = '';
  uploadedFiles.forEach((fileObj, index) => {
    const item = document.createElement('div');
    item.className = 'file-item';

    const name = document.createElement('span');
    let statusColor = 'var(--muted-foreground)';
    if (fileObj.status === 'Uploaded') statusColor = 'var(--primary)';
    if (fileObj.status === 'Error') statusColor = 'var(--danger-color)';

    name.innerHTML = `${fileObj.file.name} (${(fileObj.file.size / 1024 / 1024).toFixed(2)} MB) - <strong style="color: ${statusColor};">${fileObj.status}</strong>`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.style.background = 'none';
    removeBtn.style.border = 'none';
    removeBtn.style.color = 'var(--danger-color)';
    removeBtn.style.cursor = 'pointer';
    removeBtn.onclick = () => {
      uploadedFiles.splice(index, 1);
      renderFileList();
    };

    item.appendChild(name);
    item.appendChild(removeBtn);
    fileList.appendChild(item);
  });
}

// ==========================================
// Voice Recording
// ==========================================
startRecordBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const audioUrl = URL.createObjectURL(audioBlob);
      audioPreview.src = audioUrl;
      const previewContainer = document.getElementById('audioPreviewContainer');
      if (previewContainer) {
        previewContainer.style.display = 'flex';
      } else {
        audioPreview.style.display = 'block';
      }
    };

    mediaRecorder.start();
    startRecordBtn.style.display = 'none';
    stopRecordBtn.style.display = 'inline-flex';
    recordingIndicator.style.display = 'flex';

    recordingSeconds = 0;
    recordingTime.textContent = '00:00';
    recordingInterval = setInterval(() => {
      recordingSeconds++;
      const m = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
      const s = String(recordingSeconds % 60).padStart(2, '0');
      recordingTime.textContent = `${m}:${s}`;
    }, 1000);

  } catch (err) {
    console.error(err);
    showToast('Could not access microphone. Please check permissions.', 'error');
  }
});

stopRecordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  clearInterval(recordingInterval);
  recordingIndicator.style.display = 'none';
  stopRecordBtn.style.display = 'none';
  startRecordBtn.style.display = 'inline-flex';
  startRecordBtn.innerHTML = '<span class="material-symbols-outlined">mic</span> Rerecord';
});

const removeAudioBtn = document.getElementById('removeAudioBtn');
if (removeAudioBtn) {
  removeAudioBtn.addEventListener('click', () => {
    audioBlob = null;
    audioPreview.src = '';
    const previewContainer = document.getElementById('audioPreviewContainer');
    if (previewContainer) {
      previewContainer.style.display = 'none';
    } else {
      audioPreview.style.display = 'none';
    }
    startRecordBtn.innerHTML = '<span class="material-symbols-outlined">mic</span> Tap to Record';
  });
}

// ==========================================
// Form Submission & Base64 Encoding
// ==========================================

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE') {
    showToast('Error: Please configure the Google Apps Script URL in js/main.js', 'error');
    return;
  }

  loader.style.display = 'flex';

  try {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Handle multiple checkboxes (services)
    const selectedServices = formData.getAll('services');
    if (selectedServices.length === 0) {
      showToast('Please select at least one service you need help with.', 'error');
      loader.style.display = 'none';
      return;
    }
    data.services = selectedServices.join(', ');

    // Handle multiple checkboxes (goals)
    const selectedGoals = formData.getAll('goal');
    if (selectedGoals.length === 0) {
      showToast('Please select at least one primary goal.', 'error');
      loader.style.display = 'none';
      return;
    }
    data.goal = selectedGoals.join(', ');

    // Format Budget with currency
    const currSelect = document.getElementById('currency');
    if (currSelect) {
      const symbol = currSelect.options[currSelect.selectedIndex].getAttribute('data-symbol');
      if (data.budget === 'Custom') {
        const customVal = data.budget_custom;
        data.budget = customVal ? (symbol + customVal) : 'Not specified';
      } else if (data.budget) {
        data.budget = symbol + data.budget;
      }
    }
    delete data.budget_custom;

    // Encode files
    const encodedFiles = [];
    for (const fileObj of uploadedFiles) {
      if (fileObj.url) {
        // Already uploaded
        encodedFiles.push({ name: fileObj.file.name, url: fileObj.url });
      } else if (fileObj.status === 'Uploading...') {
        showToast('Please wait for all files to finish uploading.', 'error');
        loader.style.display = 'none';
        return;
      } else {
        // Fallback for failed uploads, try uploading them now
        const b64 = await toBase64(fileObj.file);
        encodedFiles.push({
          name: fileObj.file.name,
          mimeType: fileObj.file.type,
          data: b64
        });
      }
    }

    // Encode audio blob
    let encodedAudio = null;
    if (audioBlob) {
      const b64 = await toBase64(audioBlob);
      encodedAudio = {
        name: `voice_note_${new Date().getTime()}.webm`,
        mimeType: 'audio/webm',
        data: b64
      };
    }

    const payload = {
      action: 'submitProject',
      data: data,
      files: encodedFiles,
      audio: encodedAudio,
      sessionId: sessionId
    };

    // Note: We use fetch with 'no-cors' mode because Google Apps Script 
    // redirects POST requests. However, 'no-cors' means we can't read the JSON response.
    // To read JSON response, we must use form URL encoded string or plain text for POST payload
    // to avoid preflight OPTIONS request which GAS doesn't handle well for application/json.

    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === 'success') {
      showToast('Project submitted successfully!');
      form.reset();
      uploadedFiles = [];
      renderFileList();
      audioBlob = null;
      audioPreview.src = '';
      const previewContainer = document.getElementById('audioPreviewContainer');
      if (previewContainer) {
        previewContainer.style.display = 'none';
      } else {
        audioPreview.style.display = 'none';
      }
      startRecordBtn.innerHTML = '<span class="material-symbols-outlined">mic</span> Tap to Record';
    } else {
      throw new Error(result.message || 'Submission failed');
    }

  } catch (error) {
    console.error('Submission error:', error);
    showToast('An error occurred during submission. ' + error.message, 'error');
  } finally {
    loader.style.display = 'none';
  }
});

// ==========================================
// Date Picker Validation
// ==========================================
const deadlineInput = document.getElementById('deadline');
if (deadlineInput) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  deadlineInput.min = `${yyyy}-${mm}-${dd}`;
}
