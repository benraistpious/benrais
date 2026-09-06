// ==========================================
// CONFIGURATION
// ==========================================
// 1. Create a Google Sheet and get its ID from the URL (https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit)
const SHEET_ID = '1avVZpDorS1bdsMoblqSytlUIkOPRZVHDaUfcWcHgO4E';
const SHEET_NAME = 'clients'; // Make sure this matches your tab name

// 2. Create a folder in Google Drive for uploads and get its ID from the URL (https://drive.google.com/drive/folders/YOUR_FOLDER_ID)
const UPLOAD_FOLDER_ID = '1T2tEYN9mHaE2cpVVpSQwD23Y-mr7oT3C';

// 3. Set a password for your admin dashboard
const ADMIN_PASSWORD = 'benrais123';

// 4. Set the admin email address where you want to receive new request notifications
// If empty, it defaults to the Google Account running this script
const ADMIN_EMAIL = ''; 


// ==========================================
// GET REQUESTS (Admin Dashboard)
// ==========================================
function doGet(e) {
  try {
    const action = e.parameter.action;
    const password = e.parameter.password;
    
    // Allow public access to getPortfolioProjects
    if (action === 'getPortfolioProjects') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('portfolio_projects');
      if (!sheet) return createJsonResponse({ status: 'success', data: [] });
      
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();
      
      if (values.length <= 1) {
        return createJsonResponse({ status: 'success', data: [] });
      }
      
      const headers = values[0];
      const projects = [];
      
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const project = { rowId: i + 1, id: row[0] };
        
        for (let j = 0; j < headers.length; j++) {
          project[headers[j]] = row[j];
        }
        projects.push(project);
      }
      
      projects.reverse();
      return createJsonResponse({ status: 'success', data: projects });
    }
    
    if (action !== 'getExperience' && password !== ADMIN_PASSWORD) {
      return createJsonResponse({ status: 'error', message: 'Invalid password' });
    }
    
    if (action === 'getProjects') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();
      
      if (values.length <= 1) {
        return createJsonResponse({ status: 'success', data: [] });
      }
      
      const headers = values[0];
      const projects = [];
      
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const project = { rowId: i + 1 }; // +1 because rows are 1-indexed in Sheets
        
        for (let j = 0; j < headers.length; j++) {
          project[headers[j]] = row[j];
        }
        projects.push(project);
      }
      
      // Sort newest first
      projects.reverse();
      
      return createJsonResponse({ status: 'success', data: projects });
    }
    if (action === 'getExperience') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('experience');
      if (!sheet) return createJsonResponse({ status: 'success', data: [] });
      
      const dataRange = sheet.getDataRange();
      const values = dataRange.getValues();
      
      if (values.length <= 1) {
        return createJsonResponse({ status: 'success', data: [] });
      }
      
      const headers = values[0];
      const experiences = [];
      
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const exp = { rowId: i + 1, id: row[0] };
        
        for (let j = 0; j < headers.length; j++) {
          exp[headers[j]] = row[j];
        }
        experiences.push(exp);
      }
      
      return createJsonResponse({ status: 'success', data: experiences });
    }
    
    return createJsonResponse({ status: 'error', message: 'Unknown action' });
    
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

// ==========================================
// POST REQUESTS (Client Form Submissions)
// ==========================================
function doPost(e) {
  try {
    // Parse the incoming JSON string
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    
    if (action === 'submitProject') {
      return handleSubmitProject(payload);
    } else if (action === 'updateStatus') {
      return handleUpdateStatus(payload);
    } else if (action === 'updateProject') {
      return handleUpdateProject(payload);
    } else if (action === 'uploadFile') {
      return handleUploadFile(payload);
    } else if (action === 'addPortfolioProject') {
      return handleAddPortfolioProject(payload);
    } else if (action === 'updatePortfolioProject') {
      return handleUpdatePortfolioProject(payload);
    } else if (action === 'deletePortfolioProject') {
      return handleDeletePortfolioProject(payload);
    } else if (action === 'addExperience') {
      return handleAddExperience(payload);
    } else if (action === 'updateExperience') {
      return handleUpdateExperience(payload);
    } else if (action === 'deleteExperience') {
      return handleDeleteExperience(payload);
    }
    
    return createJsonResponse({ status: 'error', message: 'Unknown action' });
    
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

// ==========================================
// HANDLERS
// ==========================================
function handleSubmitProject(payload) {
  const data = payload.data;
  const files = payload.files || [];
  const audio = payload.audio;
  const sessionId = payload.sessionId;
  
  const parentFolder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  
  const clientNameSafe = data.client_name ? data.client_name : 'Unknown Client';
  const finalFolderName = clientNameSafe + ' - ' + new Date().toISOString().split('T')[0];
  
  let subFolder;
  if (sessionId) {
    const folderIterator = parentFolder.searchFolders("title = 'Upload - " + sessionId + "'");
    if (folderIterator.hasNext()) {
      subFolder = folderIterator.next();
      subFolder.setName(finalFolderName);
    }
  }
  
  if (!subFolder) {
    subFolder = parentFolder.createFolder(finalFolderName);
  }
  
  const savedFiles = [];
  
  // 1. Save any fallback uploaded files to Drive or use existing URLs
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.data) {
      const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType, f.name);
      const file = subFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      savedFiles.push({ name: f.name, url: file.getUrl() });
    } else if (f.url) {
      savedFiles.push({ name: f.name, url: f.url });
    }
  }
  
  // 2. Save audio to Drive
  if (audio) {
    const blob = Utilities.newBlob(Utilities.base64Decode(audio.data), audio.mimeType, audio.name);
    const file = subFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    savedFiles.push({ name: 'Voice Note', url: file.getUrl() });
  }
  
  // 3. Append to Google Sheet
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  
  // Check if headers exist, if not, create them
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'timestamp', 'client_name', 'email', 'phone', 'company', 'website',
      'services', 'description', 'goal', 'target_audience', 'budget', 
      'deadline', 'deadline_flexible', 'files', 'status'
    ]);
  }
  
  const rowData = [
    new Date().toISOString(),
    data.client_name || '',
    data.email || '',
    data.phone || '',
    data.company || '',
    data.website || '',
    data.services || '',
    data.description || '',
    data.goal || '',
    data.target_audience || '',
    data.budget || '',
    data.deadline || '',
    data.deadline_flexible || '',
    JSON.stringify(savedFiles),
    'New' // Default status
  ];
  
  sheet.appendRow(rowData);
  
  // 4. Send Email Notifications
  try {
    sendEmailNotifications(data, subFolder.getUrl());
  } catch (e) {
    console.error('Error sending email:', e);
    // We don't want to fail the whole submission if email fails
  }
  
  return createJsonResponse({ status: 'success' });
}

function handleUpdateStatus(payload) {
  if (payload.password !== ADMIN_PASSWORD) {
    return createJsonResponse({ status: 'error', message: 'Invalid password' });
  }
  
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const rowId = payload.rowId;
  const newStatus = payload.status;
  
  // Find the 'status' column index
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const statusColIndex = headers.indexOf('status') + 1;
  
  if (statusColIndex === 0) {
    return createJsonResponse({ status: 'error', message: 'Status column not found in sheet' });
  }
  
  // Update the cell
  sheet.getRange(rowId, statusColIndex).setValue(newStatus);
  
  return createJsonResponse({ status: 'success' });
}

function handleUpdateProject(payload) {
  if (payload.password !== ADMIN_PASSWORD) {
    return createJsonResponse({ status: 'error', message: 'Invalid password' });
  }
  
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const rowId = payload.rowId;
  const updates = payload.data; // Object with fields to update
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  for (const key in updates) {
    const colIndex = headers.indexOf(key) + 1;
    if (colIndex > 0) {
      sheet.getRange(rowId, colIndex).setValue(updates[key]);
    }
  }
  
  return createJsonResponse({ status: 'success' });
}

function handleUploadFile(payload) {
  const f = payload.file;
  const sessionId = payload.sessionId;
  
  const parentFolder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  
  let folder;
  const folderIterator = parentFolder.searchFolders("title = 'Upload - " + sessionId + "'");
  if (folderIterator.hasNext()) {
    folder = folderIterator.next();
  } else {
    folder = parentFolder.createFolder("Upload - " + sessionId);
  }
  
  const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType, f.name);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return createJsonResponse({ status: 'success', name: f.name, url: file.getUrl() });
}

function handleAddPortfolioProject(payload) {
  if (payload.password !== ADMIN_PASSWORD) return createJsonResponse({ status: 'error', message: 'Invalid password' });
  
  let sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('portfolio_projects');
  if (!sheet) {
    sheet = SpreadsheetApp.openById(SHEET_ID).insertSheet('portfolio_projects');
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id', 'title', 'category', 'thumbnail', 'images', 'description', 'timestamp']);
  }

  const data = payload.data;
  const newId = new Date().getTime().toString();
  
  // Process files if provided
  const uploadedFiles = processPortfolioFiles(payload, data.title);
  
  // Override URLs if files were uploaded
  let finalThumbnail = data.thumbnail || '';
  if (uploadedFiles.thumbnail) finalThumbnail = uploadedFiles.thumbnail;
  
  let finalImages = data.images || [];
  if (uploadedFiles.images && uploadedFiles.images.length > 0) {
    // If files uploaded, we can either append or replace. The safest is to append or just replace.
    // Let's replace the manual URLs with the newly uploaded ones. 
    // Or we can combine them. Let's combine them:
    finalImages = finalImages.concat(uploadedFiles.images);
  }
  
  const rowData = [
    newId,
    data.title || '',
    data.category || '',
    finalThumbnail,
    finalImages ? JSON.stringify(finalImages) : '[]',
    data.description || '',
    new Date().toISOString()
  ];
  
  sheet.appendRow(rowData);
  return createJsonResponse({ status: 'success', id: newId });
}

function handleUpdatePortfolioProject(payload) {
  if (payload.password !== ADMIN_PASSWORD) return createJsonResponse({ status: 'error', message: 'Invalid password' });
  
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('portfolio_projects');
  if (!sheet) return createJsonResponse({ status: 'error', message: 'portfolio_projects sheet missing' });

  const rowId = payload.rowId;
  const updates = payload.data;
  
  // Process files if provided
  const uploadedFiles = processPortfolioFiles(payload, updates.title);
  
  if (uploadedFiles.thumbnail) updates.thumbnail = uploadedFiles.thumbnail;
  if (uploadedFiles.images && uploadedFiles.images.length > 0) {
    // Append to existing images if passed, or just use new ones
    const existingImages = updates.images || [];
    updates.images = existingImages.concat(uploadedFiles.images);
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  for (const key in updates) {
    let val = updates[key];
    if (key === 'images' && typeof val === 'object') val = JSON.stringify(val);
    
    const colIndex = headers.indexOf(key) + 1;
    if (colIndex > 0) {
      sheet.getRange(rowId, colIndex).setValue(val);
    }
  }
  return createJsonResponse({ status: 'success' });
}

function processPortfolioFiles(payload, projectTitle) {
  const thumbnailFile = payload.thumbnailFile;
  const presentationFiles = payload.presentationFiles || [];
  
  if (!thumbnailFile && presentationFiles.length === 0) return { thumbnail: null, images: null };
  
  const parentFolder = DriveApp.getFolderById(UPLOAD_FOLDER_ID);
  
  const safeTitle = projectTitle ? projectTitle.replace(/[^a-z0-9]/gi, '_') : 'Untitled Project';
  const folderName = "Portfolio - " + safeTitle;
  
  let folder;
  const folderIterator = parentFolder.searchFolders("title = '" + folderName + "'");
  if (folderIterator.hasNext()) {
    folder = folderIterator.next();
  } else {
    folder = parentFolder.createFolder(folderName);
  }
  
  const result = { thumbnail: null, images: [] };
  
  if (thumbnailFile && thumbnailFile.data) {
    const blob = Utilities.newBlob(Utilities.base64Decode(thumbnailFile.data), thumbnailFile.mimeType, thumbnailFile.name);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    result.thumbnail = 'https://drive.google.com/uc?export=view&id=' + file.getId();
  }
  
  for (let i = 0; i < presentationFiles.length; i++) {
    const pf = presentationFiles[i];
    if (pf.data) {
      const blob = Utilities.newBlob(Utilities.base64Decode(pf.data), pf.mimeType, pf.name);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      result.images.push('https://drive.google.com/uc?export=view&id=' + file.getId());
    }
  }
  
  return result;
}

function handleDeletePortfolioProject(payload) {
  if (payload.password !== ADMIN_PASSWORD) return createJsonResponse({ status: 'error', message: 'Invalid password' });
  
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('portfolio_projects');
  if (!sheet) return createJsonResponse({ status: 'error', message: 'portfolio_projects sheet missing' });

  const rowId = payload.rowId;
  sheet.deleteRow(rowId);
  return createJsonResponse({ status: 'success' });
}

function handleAddExperience(payload) {
  if (payload.password !== ADMIN_PASSWORD) return createJsonResponse({ status: 'error', message: 'Invalid password' });
  
  let sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('experience');
  if (!sheet) {
    sheet = SpreadsheetApp.openById(SHEET_ID).insertSheet('experience');
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id', 'company', 'role', 'duration', 'timestamp', 'description']);
  } else {
    // ensure description header exists
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!headers.includes('description')) {
      sheet.getRange(1, headers.length + 1).setValue('description');
    }
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = payload.data;
  const newId = new Date().getTime().toString();
  
  // Prepare data map
  const dataMap = {
    id: newId,
    company: data.company || '',
    role: data.role || '',
    duration: data.duration || '',
    description: data.description || '',
    timestamp: new Date().toISOString()
  };

  const rowData = headers.map(header => dataMap[header] || '');
  sheet.appendRow(rowData);
  return createJsonResponse({ status: 'success', id: newId });
}

function handleUpdateExperience(payload) {
  if (payload.password !== ADMIN_PASSWORD) return createJsonResponse({ status: 'error', message: 'Invalid password' });
  
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('experience');
  if (!sheet) return createJsonResponse({ status: 'error', message: 'experience sheet missing' });

  const rowId = payload.rowId;
  const updates = payload.data;
  
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!headers.includes('description')) {
    sheet.getRange(1, headers.length + 1).setValue('description');
    headers.push('description');
  }
  
  for (const key in updates) {
    const colIndex = headers.indexOf(key) + 1;
    if (colIndex > 0) {
      sheet.getRange(rowId, colIndex).setValue(updates[key]);
    }
  }
  return createJsonResponse({ status: 'success' });
}

function handleDeleteExperience(payload) {
  if (payload.password !== ADMIN_PASSWORD) return createJsonResponse({ status: 'error', message: 'Invalid password' });
  
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('experience');
  if (!sheet) return createJsonResponse({ status: 'error', message: 'experience sheet missing' });

  const rowId = payload.rowId;
  sheet.deleteRow(rowId);
  return createJsonResponse({ status: 'success' });
}

// ==========================================
// EMAIL NOTIFICATIONS
// ==========================================
function sendEmailNotifications(data, folderUrl) {
  const clientName = data.client_name || 'A new client';
  const clientEmail = data.email;
  const adminEmail = ADMIN_EMAIL || Session.getActiveUser().getEmail();

  // 1. Notify Admin
  const adminSubject = `New Project Request: ${clientName}`;
  const adminBody = `
    You have a new project request!
    
    Client Name: ${data.client_name || 'N/A'}
    Company: ${data.company || 'N/A'}
    Email: ${data.email || 'N/A'}
    Phone: ${data.phone || 'N/A'}
    
    Services Requested: ${data.services || 'N/A'}
    Budget: ${data.budget || 'N/A'}
    Deadline: ${data.deadline || 'N/A'}
    
    Description:
    ${data.description || 'N/A'}
    
    Client Uploads Folder: ${folderUrl}
    
    Log into your admin dashboard to view the full details and manage the status.
  `;
  
  MailApp.sendEmail({
    to: adminEmail,
    subject: adminSubject,
    body: adminBody
  });

  // 2. Notify Client (Auto-responder)
  if (clientEmail) {
    const clientSubject = `We've received your project request!`;
    const clientBody = `
      Hi ${data.client_name || 'there'},
      
      Thank you for submitting your project request to us! We have received your information and our team will be reviewing it shortly.
      
      Here is a copy of what you submitted:
      - Services: ${data.services || 'N/A'}
      - Budget: ${data.budget || 'N/A'}
      
      We will get back to you as soon as possible.
      
      Best regards,
      The Team
    `;
    
    MailApp.sendEmail({
      to: clientEmail,
      subject: clientSubject,
      body: clientBody,
      replyTo: adminEmail
    });
  }
}

// ==========================================
// UTILS
// ==========================================
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// NOTE: To allow CORS requests from your website, when you deploy this script as a Web App:
// 1. Click "Deploy" > "New deployment"
// 2. Select type "Web app"
// 3. Execute as: "Me"
// 4. Who has access: "Anyone" (Crucial for the public form to submit without Google login)
// 5. Copy the Web app URL and paste it into main.js and admin.js
