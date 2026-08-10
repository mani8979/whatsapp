const socket = io();

// UI Elements
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');

const qrContainer = document.getElementById('qr-container');
const qrcodeElement = document.getElementById('qrcode');

const authenticatedView = document.getElementById('authenticated-view');
const loadingView = document.getElementById('loading-view');
const loadingText = document.getElementById('loading-text');

const logoutBtn = document.getElementById('logout-btn');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const logScreen = document.getElementById('log-screen');

const testMessageForm = document.getElementById('test-message-form');
const consoleResponse = document.getElementById('console-response');
const resStatus = document.getElementById('res-status');
const resBody = document.getElementById('res-body');
const sendBtn = document.getElementById('send-btn');

// QR Code utility reference
let qrcodeInstance = null;

// Initialize app log helper
function addLog(text, type = 'system') {
  const line = document.createElement('div');
  line.className = `log-line ${type}-line`;
  const time = new Date().toLocaleTimeString();
  line.innerText = `[${time}] [${type.toUpperCase()}] ${text}`;
  logScreen.appendChild(line);
  logScreen.scrollTop = logScreen.scrollHeight;
}

// 1. Connection Socket Events
socket.on('status_change', (data) => {
  const { status, qr } = data;
  addLog(`WhatsApp client status update: ${status}`, 'info');

  // Clear states
  statusBadge.className = 'badge';
  loadingView.classList.add('hidden');
  qrContainer.classList.add('hidden');
  authenticatedView.classList.add('hidden');

  switch (status) {
    case 'connecting':
      statusBadge.classList.add('status-connecting');
      statusText.innerText = 'Connecting...';
      loadingView.classList.remove('hidden');
      loadingText.innerText = 'Launching headless browser and connecting to WhatsApp Web...';
      break;

    case 'qr_ready':
      statusBadge.classList.add('status-qr');
      statusText.innerText = 'Auth Required (Scan)';
      qrContainer.classList.remove('hidden');
      
      // Render QR code image directly from the server-sent base64 string
      if (qr) {
        qrcodeElement.src = qr;
        qrcodeElement.classList.remove('hidden');
        addLog('New WhatsApp QR code received. Waiting for scan.', 'warn');
      } else {
        qrcodeElement.classList.add('hidden');
      }
      break;

    case 'authenticated':
      statusBadge.classList.add('status-authenticated');
      statusText.innerText = 'Connected';
      authenticatedView.classList.remove('hidden');
      addLog('WhatsApp automated connection is online and active.', 'info');
      break;

    case 'auth_failure':
      statusBadge.classList.add('status-disconnected');
      statusText.innerText = 'Auth Failed';
      loadingView.classList.remove('hidden');
      loadingText.innerText = 'WhatsApp authentication failed. Retrying...';
      addLog('Authentication failed. Check your phone connection and try again.', 'error');
      break;

    case 'disconnected':
    default:
      statusBadge.classList.add('status-disconnected');
      statusText.innerText = 'Disconnected';
      loadingView.classList.remove('hidden');
      loadingText.innerText = 'Disconnected from WhatsApp. Attempting to start/reconnect...';
      addLog('WhatsApp client is disconnected.', 'error');
      break;
  }
});

// Socket connection health check
socket.on('connect', () => {
  addLog('Websocket connection to server established.', 'system');
});

socket.on('disconnect', () => {
  addLog('Websocket connection to server lost. Retrying...', 'error');
});

socket.on('contacts_sync_started', () => {
  addLog('WhatsApp background sync started...', 'info');
});

socket.on('contacts_synced', (data) => {
  addLog(`WhatsApp background sync completed. Synced ${data.contactsCount} contacts and ${data.groupsCount} groups.`, 'info');
  fetchContacts();
});

// 2. Action Events
logoutBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to disconnect and log out of WhatsApp? You will have to scan a new QR code to re-link.')) {
    try {
      addLog('Sending logout request to API...', 'system');
      const response = await fetch('/api/logout', { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        addLog('Logged out. Re-initialising client...', 'system');
      } else {
        addLog(`Logout error: ${result.error}`, 'error');
      }
    } catch (err) {
      addLog(`Failed to execute logout: ${err.message}`, 'error');
    }
  }
});

clearLogsBtn.addEventListener('click', () => {
  logScreen.innerHTML = '';
  addLog('Terminal screen cleared.', 'system');
});

// 3. API Tester Form Submission
testMessageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const recipient = document.getElementById('recipient').value.trim();
  const body = document.getElementById('message-body').value.trim();

  sendBtn.disabled = true;
  sendBtn.innerText = 'Sending Message...';
  consoleResponse.classList.add('hidden');

  try {
    addLog(`Sending API test message request to ${recipient}...`, 'system');
    
    const response = await fetch('/api/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to: recipient, body: body })
    });

    const result = await response.json();
    sendBtn.disabled = false;
    sendBtn.innerText = 'Send Test Message';

    consoleResponse.classList.remove('hidden');
    if (result.success) {
      resStatus.innerText = '200 OK';
      resStatus.style.color = '#10b981';
      resBody.innerText = JSON.stringify(result, null, 2);
      addLog(`Message successfully sent. ID: ${result.data.id}`, 'info');
    } else {
      resStatus.innerText = `${response.status} Error`;
      resStatus.style.color = '#ef4444';
      resBody.innerText = JSON.stringify(result, null, 2);
      addLog(`API send-message error: ${result.error}`, 'error');
    }
  } catch (err) {
    sendBtn.disabled = false;
    sendBtn.innerText = 'Send Test Message';
    consoleResponse.classList.remove('hidden');
    resStatus.innerText = 'Network Error';
    resStatus.style.color = '#ef4444';
    resBody.innerText = err.message;
    addLog(`Request failed: ${err.message}`, 'error');
  }
});

// ==========================================================================
// BROADCAST & CONSENT MODULE LOGIC
// ==========================================================================

// Global state variables
let contactsList = [];
let csvRecipients = [];
let activeCampaignId = null;
let campaignsHistory = [];
const selectedConsentJids = new Set();
const selectedBroadcastJids = new Set();

// Tab Navigation Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Broadcast Create Form Elements
const createCampaignForm = document.getElementById('create-campaign-form');
const campaignNameInput = document.getElementById('campaign-name');
const campaignBodyInput = document.getElementById('campaign-body');
const recipientSourceRadios = document.getElementsByName('recipient-source');
const dbRecipientsSelect = document.getElementById('db-recipients-select');
const csvRecipientsSelect = document.getElementById('csv-recipients-select');
const broadcastContactsList = document.getElementById('broadcast-contacts-list');
const optedInCountSpan = document.getElementById('opted-in-count');
const contactsSearchBroadcast = document.getElementById('contacts-search-broadcast');
const selectAllBroadcastBtn = document.getElementById('select-all-broadcast-btn');
const csvFileInput = document.getElementById('csv-file');
const confirmCsvConsent = document.getElementById('confirm-csv-consent');
const batchSizeInput = document.getElementById('batch-size');
const delayMessageInput = document.getElementById('delay-message');
const delayBatchInput = document.getElementById('delay-batch');
const startBroadcastBtn = document.getElementById('start-broadcast-btn');
const campaignMediaInput = document.getElementById('campaign-media');

// Active Campaign Tracker Elements
const noActiveCampaignDiv = document.getElementById('no-active-campaign');
const activeCampaignTrackerDiv = document.getElementById('active-campaign-tracker');
const activeCampaignTitle = document.getElementById('active-campaign-title');
const activeCampaignStatus = document.getElementById('active-campaign-status');
const activeProgressPercent = document.getElementById('active-progress-percent');
const activeProgressBar = document.getElementById('active-progress-bar');
const statTotal = document.getElementById('stat-total');
const statSent = document.getElementById('stat-sent');
const statFailed = document.getElementById('stat-failed');
const pauseCampaignBtn = document.getElementById('pause-campaign-btn');
const resumeCampaignBtn = document.getElementById('resume-campaign-btn');
const cancelCampaignBtn = document.getElementById('cancel-campaign-btn');
const activeRecipientsLogsBody = document.getElementById('active-recipients-logs-body');

// Campaign History Elements
const campaignHistoryBody = document.getElementById('campaign-history-body');

// Consent Manager Elements
const exportContactsBtn = document.getElementById('export-contacts-btn');
const exportUnknownContactsBtn = document.getElementById('export-unknown-contacts-btn');
const syncContactsBtn = document.getElementById('sync-contacts-btn');
const consentContactsSearch = document.getElementById('consent-contacts-search');
const consentContactsTypeFilter = document.getElementById('consent-contacts-type-filter');
const bulkOptInBtn = document.getElementById('bulk-opt-in-btn');
const bulkOptOutBtn = document.getElementById('bulk-opt-out-btn');
const selectAllContactsChk = document.getElementById('select-all-contacts-chk');
const consentContactsBody = document.getElementById('consent-contacts-body');
const addContactConsentForm = document.getElementById('add-contact-consent-form');
const newContactNumber = document.getElementById('new-contact-number');
const newContactName = document.getElementById('new-contact-name');
const newContactOptIn = document.getElementById('new-contact-opt-in');

// 1. Navigation Tab Switches
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.getAttribute('data-tab');
    
    tabButtons.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.add('hidden'));
    
    btn.classList.add('active');
    document.getElementById(targetTab).classList.remove('hidden');

    if (targetTab === 'consent-tab') {
      fetchContacts();
    } else if (targetTab === 'broadcast-tab') {
      fetchContacts();
      fetchCampaigns();
    }
  });
});

// 2. Toggle Recipient Source Radio Buttons
recipientSourceRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'db') {
      dbRecipientsSelect.classList.remove('hidden');
      csvRecipientsSelect.classList.add('hidden');
      csvFileInput.removeAttribute('required');
      confirmCsvConsent.removeAttribute('required');
    } else {
      dbRecipientsSelect.classList.add('hidden');
      csvRecipientsSelect.classList.remove('hidden');
      csvFileInput.setAttribute('required', 'true');
      confirmCsvConsent.setAttribute('required', 'true');
    }
  });
});

// 3. Contacts Checkbox Search / Toggle Actions in Broadcast Form
contactsSearchBroadcast.addEventListener('input', (e) => {
  renderBroadcastContactsList(e.target.value);
});

let allSelectedBroadcast = false;
selectAllBroadcastBtn.addEventListener('click', () => {
  const checkboxes = broadcastContactsList.querySelectorAll('input[type="checkbox"]');
  allSelectedBroadcast = !allSelectedBroadcast;
  checkboxes.forEach(chk => {
    chk.checked = allSelectedBroadcast;
    if (allSelectedBroadcast) {
      selectedBroadcastJids.add(chk.value);
    } else {
      selectedBroadcastJids.delete(chk.value);
    }
  });
  selectAllBroadcastBtn.innerText = allSelectedBroadcast ? 'Deselect All' : 'Select All';
  updateOptedInCount();
});

broadcastContactsList.addEventListener('change', (e) => {
  if (e.target && e.target.type === 'checkbox') {
    if (e.target.checked) {
      selectedBroadcastJids.add(e.target.value);
    } else {
      selectedBroadcastJids.delete(e.target.value);
    }
    updateOptedInCount();
  }
});

function updateOptedInCount() {
  optedInCountSpan.innerText = `${selectedBroadcastJids.size} selected`;
}

// 4. CSV File Parsing
csvFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    parseCsv(text);
  };
  reader.readAsText(file);
});

function parseCsv(text) {
  try {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) throw new Error('CSV file is empty');

    // Basic CSV Parser that handles comma separations and quotes
    const parseLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === '\'') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]).map(h => h.toLowerCase());
    
    // Find phone number and name columns
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('number') || h.includes('jid') || h.includes('recipient'));
    const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('contact'));

    if (phoneIdx === -1) {
      alert('Could not find a phone number column in the CSV. Make sure you have a header named "phone" or "number".');
      csvFileInput.value = '';
      return;
    }

    csvRecipients = [];
    const seenNumbers = new Set();

    for (let i = 1; i < lines.length; i++) {
      const lineStr = lines[i].trim();
      if (!lineStr) continue;

      const cols = parseLine(lineStr);
      const number = cols[phoneIdx];
      const name = nameIdx !== -1 ? cols[nameIdx] : '';

      if (!number) continue;

      // Ensure duplicates are removed automatically
      const digitsOnly = number.replace(/\D/g, '');
      if (digitsOnly && !seenNumbers.has(digitsOnly)) {
        seenNumbers.add(digitsOnly);
        csvRecipients.push({
          number: digitsOnly,
          name: name || digitsOnly
        });
      }
    }

    addLog(`Uploaded CSV: Parsed ${csvRecipients.length} unique recipient numbers.`, 'info');
  } catch (error) {
    addLog(`Error parsing CSV file: ${error.message}`, 'error');
    alert('Invalid CSV structure. Please check the file formatting.');
    csvFileInput.value = '';
  }
}

// 5. Create & Start Broadcast Campaign Request
createCampaignForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = campaignNameInput.value.trim();
  const body = campaignBodyInput.value.trim();
  const source = document.querySelector('input[name="recipient-source"]:checked').value;
  const batchSize = parseInt(batchSizeInput.value, 10);
  const delayMsg = parseInt(delayMessageInput.value, 10) * 1000;
  const delayBatch = parseInt(delayBatchInput.value, 10) * 1000;
  const mediaFile = campaignMediaInput.files[0];

  if (!body && !mediaFile) {
    alert('Please enter a message text or attach a media file.');
    return;
  }

  let recipients = [];
  let csvConsentConfirmed = false;

  if (source === 'db') {
    if (selectedBroadcastJids.size === 0) {
      alert('Please select at least one database recipient.');
      return;
    }
    selectedBroadcastJids.forEach(jid => {
      const contact = contactsList.find(c => c.jid === jid);
      if (contact) {
        recipients.push({
          number: contact.jid,
          name: contact.name || contact.number
        });
      }
    });
  } else {
    if (csvRecipients.length === 0) {
      alert('Please upload a valid CSV file first.');
      return;
    }
    if (!confirmCsvConsent.checked) {
      alert('You must confirm consent of the CSV recipients before starting the campaign.');
      return;
    }
    recipients = csvRecipients;
    csvConsentConfirmed = true;
  }

  startBroadcastBtn.disabled = true;
  startBroadcastBtn.innerText = 'Queuing Broadcast...';

  // Construct FormData to support file upload
  const formData = new FormData();
  formData.append('name', name);
  formData.append('body', body);
  formData.append('recipients', JSON.stringify(recipients));
  formData.append('csvConsentConfirmed', csvConsentConfirmed);
  formData.append('batchSize', batchSize);
  formData.append('delayBetweenMessages', delayMsg);
  formData.append('delayBetweenBatches', delayBatch);
  if (mediaFile) {
    formData.append('media', mediaFile);
  }

  try {
    const res = await fetch('/api/broadcasts', {
      method: 'POST',
      body: formData // Let browser set Content-Type header with boundary automatically
    });

    const result = await res.json();
    startBroadcastBtn.disabled = false;
    startBroadcastBtn.innerText = 'Create & Start Broadcast';

    if (result.success) {
      addLog(`Campaign "${name}" successfully created and running.`, 'info');
      createCampaignForm.reset();
      csvRecipients = [];
      confirmCsvConsent.checked = false;
      selectedBroadcastJids.clear();
      document.querySelector('input[value="db"]').click(); // Reset tab to DB view
      
      // Load active UI
      activeCampaignId = result.data._id;
      updateActiveCampaignUI(result.data);
      fetchCampaigns();
    } else {
      addLog(`Campaign creation failed: ${result.error}`, 'error');
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    startBroadcastBtn.disabled = false;
    startBroadcastBtn.innerText = 'Create & Start Broadcast';
    addLog(`Network error starting campaign: ${err.message}`, 'error');
  }
});

// 6. Active Campaign control actions (pause, resume, cancel)
const triggerCampaignAction = async (action) => {
  if (!activeCampaignId) return;

  try {
    const res = await fetch(`/api/broadcasts/${activeCampaignId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    
    const result = await res.json();
    if (result.success) {
      addLog(`Campaign ${action} action executed.`, 'info');
      updateActiveCampaignUI(result.data);
      fetchCampaigns();
    } else {
      alert(`Action failed: ${result.error}`);
    }
  } catch (error) {
    addLog(`Control action error: ${error.message}`, 'error');
  }
};

pauseCampaignBtn.addEventListener('click', () => triggerCampaignAction('pause'));
resumeCampaignBtn.addEventListener('click', () => triggerCampaignAction('resume'));
cancelCampaignBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to cancel this broadcast? This action cannot be undone.')) {
    triggerCampaignAction('cancel');
  }
});

// 7. Render Active Campaign Tracker Dashboard
function updateActiveCampaignUI(campaign) {
  if (!campaign) {
    noActiveCampaignDiv.classList.remove('hidden');
    activeCampaignTrackerDiv.classList.add('hidden');
    activeCampaignId = null;
    return;
  }

  activeCampaignId = campaign._id || campaign.campaignId;
  noActiveCampaignDiv.classList.add('hidden');
  activeCampaignTrackerDiv.classList.remove('hidden');

  activeCampaignTitle.innerText = campaign.name;
  
  // Status badge update
  activeCampaignStatus.className = 'badge';
  activeCampaignStatus.innerText = campaign.status.toUpperCase();
  switch (campaign.status) {
    case 'processing':
      activeCampaignStatus.classList.add('status-connecting');
      pauseCampaignBtn.classList.remove('hidden');
      resumeCampaignBtn.classList.add('hidden');
      cancelCampaignBtn.classList.remove('hidden');
      break;
    case 'paused':
      activeCampaignStatus.classList.add('status-qr');
      pauseCampaignBtn.classList.add('hidden');
      resumeCampaignBtn.classList.remove('hidden');
      cancelCampaignBtn.classList.remove('hidden');
      break;
    case 'completed':
      activeCampaignStatus.classList.add('status-authenticated');
      pauseCampaignBtn.classList.add('hidden');
      resumeCampaignBtn.classList.add('hidden');
      cancelCampaignBtn.classList.add('hidden');
      break;
    case 'cancelled':
      activeCampaignStatus.classList.add('status-disconnected');
      pauseCampaignBtn.classList.add('hidden');
      resumeCampaignBtn.classList.add('hidden');
      cancelCampaignBtn.classList.add('hidden');
      break;
    default:
      activeCampaignStatus.classList.add('status-disconnected');
  }

  // Progress Bar & Stats
  const total = campaign.totalRecipients || 0;
  const sent = campaign.sentCount || 0;
  const failed = campaign.failedCount || 0;
  const processed = sent + failed;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  activeProgressPercent.innerText = `${percent}%`;
  activeProgressBar.style.width = `${percent}%`;

  statTotal.innerText = total;
  statSent.innerText = sent;
  statFailed.innerText = failed;

  // Render recipient logs table
  activeRecipientsLogsBody.innerHTML = '';
  if (campaign.recipients && campaign.recipients.length > 0) {
    campaign.recipients.forEach(r => {
      const tr = document.createElement('tr');
      
      const phoneClean = r.number.split('@')[0];
      const statusClass = `status-pill ${r.status}`;
      const errDetail = r.error ? `<span style="color:#f87171;">${r.error}</span>` : (r.sentAt ? `Sent at ${new Date(r.sentAt).toLocaleTimeString()}` : 'Queued in delivery loop');

      tr.innerHTML = `
        <td>${phoneClean}</td>
        <td>${r.name || 'Unknown'}</td>
        <td><span class="${statusClass}">${r.status}</span></td>
        <td>${r.attempts}</td>
        <td>${errDetail}</td>
      `;
      activeRecipientsLogsBody.appendChild(tr);
    });
  } else {
    activeRecipientsLogsBody.innerHTML = '<tr><td colspan="5" class="empty-hint">No recipient logs yet.</td></tr>';
  }
}

// 8. Fetch Campaigns and update history
const fetchCampaigns = async () => {
  try {
    const res = await fetch('/api/broadcasts');
    const result = await res.json();
    if (result.success) {
      campaignsHistory = result.data;
      renderCampaignHistory();
      
      // If there is an active running/paused campaign and we don't have it tracked, load it
      const currentActive = campaignsHistory.find(c => ['processing', 'paused', 'pending'].includes(c.status));
      if (currentActive && !activeCampaignId) {
        updateActiveCampaignUI(currentActive);
      }
    }
  } catch (error) {
    addLog(`Error fetching campaign history: ${error.message}`, 'error');
  }
};

function renderCampaignHistory() {
  campaignHistoryBody.innerHTML = '';
  if (campaignsHistory.length === 0) {
    campaignHistoryBody.innerHTML = '<tr><td colspan="6" class="empty-hint">No campaign records found.</td></tr>';
    return;
  }

  campaignsHistory.forEach(c => {
    const tr = document.createElement('tr');
    const date = new Date(c.createdAt).toLocaleDateString() + ' ' + new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const statusClass = `status-pill ${c.status}`;

    tr.innerHTML = `
      <td>${date}</td>
      <td><strong>${c.name}</strong></td>
      <td>${c.totalRecipients}</td>
      <td>${c.sentCount}/${c.totalRecipients}</td>
      <td><span class="${statusClass}">${c.status}</span></td>
      <td><button class="btn btn-secondary btn-sm" onclick="viewHistoryCampaign('${c._id}')">View Details</button></td>
    `;
    campaignHistoryBody.appendChild(tr);
  });
}

// Global hook to view details of an old campaign
window.viewHistoryCampaign = (id) => {
  const campaign = campaignsHistory.find(c => c._id === id);
  if (campaign) {
    updateActiveCampaignUI(campaign);
    addLog(`Loaded details for campaign "${campaign.name}" into tracker dashboard.`, 'system');
  }
};

// 9. Consent Manager: Fetch Contacts list
const fetchContacts = async () => {
  try {
    const res = await fetch('/api/contacts');
    const result = await res.json();
    if (result.success) {
      contactsList = result.data;
      renderConsentContactsList();
      renderBroadcastContactsList();
    }
  } catch (error) {
    addLog(`Error fetching contacts: ${error.message}`, 'error');
  }
};

function renderBroadcastContactsList(filter = '') {
  broadcastContactsList.innerHTML = '';
  // Only display opted-in individual contacts (isOptedIn: true, isGroup: false)
  const allowed = contactsList.filter(c => c.isOptedIn && !c.isGroup);
  
  // Clean up selectedBroadcastJids to remove any JIDs that are no longer allowed
  const allowedJids = new Set(allowed.map(c => c.jid));
  for (const jid of selectedBroadcastJids) {
    if (!allowedJids.has(jid)) {
      selectedBroadcastJids.delete(jid);
    }
  }

  const filtered = allowed.filter(c => {
    const nameMatch = c.name && c.name.toLowerCase().includes(filter.toLowerCase());
    const numberMatch = c.number && c.number.includes(filter);
    return nameMatch || numberMatch;
  });

  if (filtered.length === 0) {
    broadcastContactsList.innerHTML = '<p class="empty-hint">No opted-in contacts found. Toggle opt-in switches in Consent Manager.</p>';
    updateOptedInCount();
    return;
  }

  const limit = 200;
  const itemsToRender = filtered.slice(0, limit);

  itemsToRender.forEach(c => {
    const label = document.createElement('label');
    label.className = 'contact-check-item';
    const isChk = selectedBroadcastJids.has(c.jid) ? 'checked' : '';
    label.innerHTML = `
      <input type="checkbox" value="${c.jid}" data-name="${c.name || c.number}" ${isChk}>
      <span><strong>${c.name || 'Unknown'}</strong> (${c.number})</span>
    `;
    broadcastContactsList.appendChild(label);
  });

  if (filtered.length > limit) {
    const hint = document.createElement('p');
    hint.className = 'empty-hint';
    hint.style.color = 'var(--color-primary)';
    hint.style.textAlign = 'center';
    hint.style.margin = '0.5rem 0 0';
    hint.innerText = `Showing top ${limit} of ${filtered.length} opted-in contacts. Use the search box to find others.`;
    broadcastContactsList.appendChild(hint);
  }

  updateOptedInCount();
}

function renderConsentContactsList() {
  consentContactsBody.innerHTML = '';
  const filterVal = consentContactsSearch.value.trim().toLowerCase();
  const typeFilter = consentContactsTypeFilter.value;
  
  const filtered = contactsList.filter(c => {
    const nameMatch = c.name && c.name.toLowerCase().includes(filterVal);
    const numMatch = c.number && c.number.includes(filterVal);
    const matchesText = nameMatch || numMatch;
    
    if (!matchesText) return false;
    
    if (typeFilter === 'all') {
      return true;
    } else if (typeFilter === 'saved') {
      return c.isMyContact === true && !c.isGroup;
    } else if (typeFilter === 'unsaved') {
      return c.isMyContact !== true && !c.isGroup;
    } else if (typeFilter === 'groups') {
      return c.isGroup === true;
    }
    return true;
  });

  if (filtered.length === 0) {
    consentContactsBody.innerHTML = '<tr><td colspan="6" class="empty-hint">No contacts found matching search filter.</td></tr>';
    if (selectAllContactsChk) {
      selectAllContactsChk.checked = false;
    }
    updateConsentSelectedCount();
    return;
  }

  const limit = 200;
  const itemsToRender = filtered.slice(0, limit);

  itemsToRender.forEach(c => {
    const tr = document.createElement('tr');
    
    let typeLabel = 'Unsaved';
    let typeClass = 'queued'; // grey

    if (c.isGroup) {
      typeLabel = 'Group';
      typeClass = 'processing'; // cyan
    } else if (c.isMyContact) {
      typeLabel = 'Saved';
      typeClass = 'sent'; // green
    }

    const isChecked = c.isOptedIn ? 'checked' : '';
    const isChk = selectedConsentJids.has(c.jid) ? 'checked' : '';

    const relValue = c.relationship || 'Friend';
    const isFriendSelected = relValue === 'Friend' ? 'selected' : '';
    const isCustomerSelected = relValue === 'Customer' ? 'selected' : '';

    tr.innerHTML = `
      <td><input type="checkbox" class="contact-chk" value="${c.jid}" ${isChk}></td>
      <td><strong>${c.name || 'Unknown'}</strong></td>
      <td>${c.number}</td>
      <td><span class="status-pill ${typeClass}">${typeLabel}</span></td>
      <td>
        <select class="relationship-select" onchange="updateRelationship('${c.jid}', this.value)">
          <option value="Friend" ${isFriendSelected}>Friend</option>
          <option value="Customer" ${isCustomerSelected}>Customer</option>
        </select>
      </td>
      <td>
        <label class="switch">
          <input type="checkbox" class="consent-toggle" value="${c.jid}" ${isChecked} onchange="toggleConsent('${c.jid}', this.checked)">
          <span class="slider"></span>
        </label>
      </td>
    `;
    consentContactsBody.appendChild(tr);
  });

  if (filtered.length > limit) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="6" class="empty-hint" style="text-align: center; padding: 1rem; color: var(--color-primary); font-weight: 600;">
        Showing top ${limit} of ${filtered.length} contacts. Use the search filter above to narrow down.
      </td>
    `;
    consentContactsBody.appendChild(tr);
  }

  if (selectAllContactsChk) {
    const totalRendered = itemsToRender.length;
    const checkedRendered = itemsToRender.filter(c => selectedConsentJids.has(c.jid)).length;
    selectAllContactsChk.checked = totalRendered > 0 && totalRendered === checkedRendered;
  }
  updateConsentSelectedCount();
}

// 10. Toggle individual consent checkbox/switch
window.toggleConsent = async (jid, isChecked) => {
  try {
    const res = await fetch('/api/contacts/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, isOptedIn: isChecked })
    });
    const result = await res.json();
    if (result.success) {
      addLog(`Updated consent status for ${jid} to ${isChecked ? 'opted-in' : 'opted-out'}`, 'system');
      
      // Update local state copy
      const contactIndex = contactsList.findIndex(c => c.jid === jid);
      if (contactIndex !== -1) {
        contactsList[contactIndex].isOptedIn = isChecked;
      }
      renderBroadcastContactsList();
    } else {
      alert(`Failed to update consent status: ${result.error}`);
    }
  } catch (error) {
    addLog(`Consent update network error: ${error.message}`, 'error');
  }
};

// 10b. Update individual contact relationship
window.updateRelationship = async (jid, value) => {
  try {
    const res = await fetch('/api/contacts/relationship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, relationship: value })
    });
    const result = await res.json();
    if (result.success) {
      addLog(`Updated relationship status for ${jid} to "${value}"`, 'system');
      
      // Update local state copy
      const contactIndex = contactsList.findIndex(c => c.jid === jid);
      if (contactIndex !== -1) {
        contactsList[contactIndex].relationship = value;
      }
    } else {
      alert(`Failed to update relationship: ${result.error}`);
    }
  } catch (error) {
    addLog(`Relationship update network error: ${error.message}`, 'error');
  }
};

// 11. Consent Manager search filter
consentContactsSearch.addEventListener('input', () => {
  selectedConsentJids.clear();
  if (selectAllContactsChk) selectAllContactsChk.checked = false;
  renderConsentContactsList();
});

consentContactsTypeFilter.addEventListener('change', () => {
  selectedConsentJids.clear();
  if (selectAllContactsChk) selectAllContactsChk.checked = false;
  renderConsentContactsList();
});

// Bulk checkbox selection
selectAllContactsChk.addEventListener('change', (e) => {
  const filterVal = consentContactsSearch.value.trim().toLowerCase();
  const typeFilter = consentContactsTypeFilter.value;
  
  // Find all contacts matching the current filter
  const filtered = contactsList.filter(c => {
    const nameMatch = c.name && c.name.toLowerCase().includes(filterVal);
    const numMatch = c.number && c.number.includes(filterVal);
    const matchesText = nameMatch || numMatch;
    
    if (!matchesText) return false;
    
    if (typeFilter === 'all') {
      return true;
    } else if (typeFilter === 'saved') {
      return c.isMyContact === true && !c.isGroup;
    } else if (typeFilter === 'unsaved') {
      return c.isMyContact !== true && !c.isGroup;
    } else if (typeFilter === 'groups') {
      return c.isGroup === true;
    }
    return true;
  });

  const limit = 200;
  const itemsToRender = filtered.slice(0, limit);

  itemsToRender.forEach(c => {
    if (e.target.checked) {
      selectedConsentJids.add(c.jid);
    } else {
      selectedConsentJids.delete(c.jid);
    }
  });

  // Toggle checkboxes in the DOM
  const chks = consentContactsBody.querySelectorAll('.contact-chk');
  chks.forEach(chk => {
    chk.checked = e.target.checked;
  });

  updateConsentSelectedCount();
});

// Individual checkbox changes delegate listener
consentContactsBody.addEventListener('change', (e) => {
  if (e.target.classList.contains('contact-chk')) {
    const jid = e.target.value;
    if (e.target.checked) {
      selectedConsentJids.add(jid);
    } else {
      selectedConsentJids.delete(jid);
    }

    if (!e.target.checked) {
      selectAllContactsChk.checked = false;
    } else {
      const totalChks = consentContactsBody.querySelectorAll('.contact-chk').length;
      const checkedChks = consentContactsBody.querySelectorAll('.contact-chk:checked').length;
      selectAllContactsChk.checked = (totalChks === checkedChks);
    }
    updateConsentSelectedCount();
  }
});

function updateConsentSelectedCount() {
  const countEl = document.getElementById('consent-selected-count');
  if (countEl) {
    countEl.innerText = selectedConsentJids.size;
  }
}

// Bulk Opt-In action
bulkOptInBtn.addEventListener('click', async () => {
  await handleBulkConsent(true);
});

// Bulk Opt-Out action
bulkOptOutBtn.addEventListener('click', async () => {
  await handleBulkConsent(false);
});

async function handleBulkConsent(isOptedIn) {
  if (selectedConsentJids.size === 0) {
    alert('Please select at least one contact using the checkbox columns first.');
    return;
  }

  const jids = Array.from(selectedConsentJids);
  if (!confirm(`Are you sure you want to update the consent status to ${isOptedIn ? 'OPTED-IN' : 'OPTED-OUT'} for ${jids.length} contacts?`)) {
    return;
  }

  try {
    const res = await fetch('/api/contacts/bulk-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jids, isOptedIn })
    });
    
    const result = await res.json();
    if (result.success) {
      addLog(`Successfully updated consent to ${isOptedIn} for ${jids.length} contacts.`, 'info');
      selectedConsentJids.clear();
      selectAllContactsChk.checked = false;
      fetchContacts(); // Reload everything
    } else {
      alert(`Bulk consent update failed: ${result.error}`);
    }
  } catch (error) {
    addLog(`Bulk consent error: ${error.message}`, 'error');
  }
}

// 12. Manual add contact form submit
addContactConsentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const number = newContactNumber.value.trim();
  const name = newContactName.value.trim();
  const isOptedIn = newContactOptIn.checked;

  try {
    const res = await fetch('/api/contacts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, name, isOptedIn })
    });
    
    const result = await res.json();
    if (result.success) {
      addLog(`Manually recorded consent for contact "${name || number}" successfully.`, 'info');
      addContactConsentForm.reset();
      newContactOptIn.checked = true; // reset to default checked
      fetchContacts(); // Reload lists
    } else {
      alert(`Failed to save manual consent: ${result.error}`);
    }
  } catch (error) {
    addLog(`Manual save consent error: ${error.message}`, 'error');
  }
});

// 13. Sync contacts manually button
syncContactsBtn.addEventListener('click', async () => {
  syncContactsBtn.disabled = true;
  syncContactsBtn.innerText = 'Syncing...';
  
  try {
    const res = await fetch('/api/contacts/sync', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      addLog('WhatsApp contact synchronization has been triggered in the background. It will populate shortly.', 'system');
      alert('Contacts sync triggered! This will update your database in the background.');
      setTimeout(() => {
        fetchContacts();
        syncContactsBtn.disabled = false;
        syncContactsBtn.innerText = 'Sync WhatsApp Contacts';
      }, 5000); // Wait 5s then reload contact list
    } else {
      syncContactsBtn.disabled = false;
      syncContactsBtn.innerText = 'Sync WhatsApp Contacts';
      alert(`Sync failed: ${result.error}`);
    }
  } catch (error) {
    syncContactsBtn.disabled = false;
    syncContactsBtn.innerText = 'Sync WhatsApp Contacts';
    addLog(`Contact sync error: ${error.message}`, 'error');
  }
});

// 13.5. Export contacts to Excel file using the backend ExcelJS pipeline
exportContactsBtn.addEventListener('click', () => {
  addLog('Triggering WaVault-style Excel export for all contacts from backend...', 'info');
  window.location.href = '/api/contacts/export?type=all&format=xlsx';
});

exportUnknownContactsBtn.addEventListener('click', () => {
  addLog('Triggering WaVault-style Excel export for unknown contacts from backend...', 'info');
  window.location.href = '/api/contacts/export?type=unknown&format=xlsx';
});

// 14. Real-time web-socket listeners for Broadcast Campaign progress
socket.on('broadcast_progress', (data) => {
  // If we are currently viewing this campaign (or if it's the active one)
  if (!activeCampaignId || activeCampaignId === data.campaignId) {
    updateActiveCampaignUI(data);
  }
  
  // Reload campaigns history if status is completed or cancelled
  if (data.status === 'completed' || data.status === 'cancelled') {
    fetchCampaigns();
  }
});

// Socket event to receive global contact consent sync events from other sessions
socket.on('contact_consent_updated', (contact) => {
  const index = contactsList.findIndex(c => c.jid === contact.jid);
  if (index !== -1) {
    contactsList[index] = contact;
  } else {
    contactsList.push(contact);
  }
  renderConsentContactsList();
  renderBroadcastContactsList();
});

// ============================================================
// 15. CHANNELS TAB
// ============================================================
const channelsBody      = document.getElementById('channels-body');
const channelsLoading   = document.getElementById('channels-loading');
const channelsEmpty     = document.getElementById('channels-empty');
const channelsList      = document.getElementById('channels-list');
const refreshChannelsBtn = document.getElementById('refresh-channels-btn');

// Subscribers panel elements
const subscribersPanel      = document.getElementById('subscribers-panel');
const subscribersLoading    = document.getElementById('subscribers-loading');
const subscribersEmpty      = document.getElementById('subscribers-empty');
const subscribersList       = document.getElementById('subscribers-list');
const subscribersBody       = document.getElementById('subscribers-body');
const subscribersChannelName = document.getElementById('subscribers-channel-name');
const exportSubsCsvBtn      = document.getElementById('export-subscribers-csv-btn');
const closeSubscribersBtn   = document.getElementById('close-subscribers-btn');

let currentSubscribersData = [];

async function fetchChannels() {
  channelsLoading.style.display = 'block';
  channelsEmpty.style.display = 'none';
  channelsList.style.display = 'none';
  channelsBody.innerHTML = '';
  subscribersPanel.style.display = 'none';

  try {
    const res = await fetch('/api/channels');
    const result = await res.json();
    channelsLoading.style.display = 'none';

    if (!result.success || !result.data || result.data.length === 0) {
      channelsEmpty.style.display = 'block';
      return;
    }

    channelsList.style.display = 'block';
    result.data.forEach((ch, i) => {
      const lastActive = ch.timestamp
        ? new Date(ch.timestamp * 1000).toLocaleString()
        : '—';
      const unreadBadge = ch.unreadCount > 0
        ? `<span style="background:var(--accent-purple);color:#fff;border-radius:9999px;padding:2px 8px;font-size:0.75rem;">${ch.unreadCount}</span>`
        : '<span style="color:var(--text-muted);">0</span>';
      const mutedBadge = ch.isMuted
        ? '<span style="color:var(--text-muted);">🔇 Yes</span>'
        : '<span style="color:#4ade80;">🔔 No</span>';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="color:var(--text-muted);">${i + 1}</td>
        <td><strong>${ch.name}</strong></td>
        <td style="color:var(--text-muted);font-size:0.85rem;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ch.description || '—'}</td>
        <td>${unreadBadge}</td>
        <td>${mutedBadge}</td>
        <td style="color:var(--text-muted);font-size:0.8rem;">${lastActive}</td>
        <td><button class="btn btn-secondary btn-sm get-numbers-btn" data-id="${encodeURIComponent(ch.id)}" data-name="${ch.name}">👥 Get Numbers</button></td>
      `;
      channelsBody.appendChild(row);
    });

    // Attach click events to all Get Numbers buttons
    document.querySelectorAll('.get-numbers-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        fetchSubscribers(btn.dataset.id, btn.dataset.name);
      });
    });

    addLog(`Loaded ${result.data.length} WhatsApp channel(s).`, 'info');
  } catch (err) {
    channelsLoading.style.display = 'none';
    channelsEmpty.style.display = 'block';
    channelsEmpty.textContent = `Error loading channels: ${err.message}`;
    addLog(`Channels fetch error: ${err.message}`, 'error');
  }
}

async function fetchSubscribers(encodedChannelId, channelName) {
  subscribersPanel.style.display = 'block';
  subscribersLoading.style.display = 'block';
  subscribersEmpty.style.display = 'none';
  subscribersList.style.display = 'none';
  subscribersBody.innerHTML = '';
  currentSubscribersData = [];
  subscribersChannelName.textContent = `Subscribers from: ${channelName}`;

  // Scroll into view
  subscribersPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res = await fetch(`/api/channels/${encodedChannelId}/subscribers`);
    const result = await res.json();
    subscribersLoading.style.display = 'none';

    if (!result.success || !result.data || result.data.length === 0) {
      subscribersEmpty.style.display = 'block';
      subscribersEmpty.textContent = `No subscribers found in your contact list for "${channelName}". WhatsApp only shows subscribers who are saved in your contacts.`;
      return;
    }

    currentSubscribersData = result.data;
    subscribersList.style.display = 'block';
    subscribersChannelName.textContent = `Subscribers from: ${channelName} (${result.count} found)`;

    result.data.forEach((sub, i) => {
      const inContacts = sub.isMyContact
        ? '<span style="color:#4ade80;">✔ Yes</span>'
        : '<span style="color:var(--text-muted);">—</span>';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="color:var(--text-muted);">${i + 1}</td>
        <td>${sub.name || '<span style="color:var(--text-muted);">Unknown</span>'}</td>
        <td><code style="color:var(--accent-green);font-size:0.9rem;">${sub.number}</code></td>
        <td style="color:var(--text-muted);text-transform:capitalize;">${sub.role}</td>
        <td>${inContacts}</td>
      `;
      subscribersBody.appendChild(row);
    });

    addLog(`Fetched ${result.count} subscriber(s) from channel "${channelName}".`, 'info');
  } catch (err) {
    subscribersLoading.style.display = 'none';
    subscribersEmpty.style.display = 'block';
    subscribersEmpty.textContent = `Error fetching subscribers: ${err.message}`;
    addLog(`Subscriber fetch error: ${err.message}`, 'error');
  }
}

// Export subscribers to CSV
exportSubsCsvBtn.addEventListener('click', () => {
  if (currentSubscribersData.length === 0) {
    alert('No subscriber data to export. Fetch subscribers first.');
    return;
  }
  const rows = [['Name', 'WhatsApp Number', 'Role', 'In Contacts']];
  currentSubscribersData.forEach(sub => {
    rows.push([
      `"${sub.name || ''}"`,
      `"${sub.number}"`,
      sub.role,
      sub.isMyContact ? 'Yes' : 'No',
    ]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `channel_subscribers_${Date.now()}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  addLog(`Exported ${currentSubscribersData.length} subscriber(s) to CSV.`, 'info');
});

// Close subscribers panel
closeSubscribersBtn.addEventListener('click', () => {
  subscribersPanel.style.display = 'none';
  currentSubscribersData = [];
});

// Load when tab is clicked
document.getElementById('tab-channels-btn').addEventListener('click', () => {
  if (channelsBody.innerHTML === '') fetchChannels();
});

// Refresh button
refreshChannelsBtn.addEventListener('click', fetchChannels);
