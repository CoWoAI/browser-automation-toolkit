// Browser Automation Toolkit - Popup UI

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============ UTILITIES ============

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ============ TAB NAVIGATION ============

// Main tabs
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.tab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    $(`#${tab.dataset.tab}-tab`).classList.add('active');
  });
});

// Sub-tabs (cookies)
$$('.sub-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.sub-tab').forEach(t => t.classList.remove('active'));
    $$('.subtab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    $(`#${tab.dataset.subtab}-subtab`).classList.add('active');
  });
});

// ============ COOKIE FUNCTIONS ============

function parseNetscapeCookies(text) {
  const cookies = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      cookies.push({
        domain: parts[0],
        httpOnly: parts[1] === 'TRUE',
        path: parts[2],
        secure: parts[3] === 'TRUE',
        expirationDate: parseInt(parts[4]) || undefined,
        name: parts[5],
        value: parts[6]
      });
    }
  }
  return cookies;
}

function toNetscapeFormat(cookies) {
  const header = '# Netscape HTTP Cookie File\n# https://curl.se/docs/http-cookies.html\n\n';
  const lines = cookies.map(c =>
    `${c.domain}\t${c.httpOnly ? 'TRUE' : 'FALSE'}\t${c.path}\t${c.secure ? 'TRUE' : 'FALSE'}\t${c.expirationDate || 0}\t${c.name}\t${c.value}`
  );
  return header + lines.join('\n');
}

// Export cookies
$('#export-btn').addEventListener('click', async () => {
  try {
    let domain = $('#export-domain').value.trim();

    if ($('#current-domain-only').checked) {
      const tab = await getCurrentTab();
      domain = getDomainFromUrl(tab.url);
      $('#export-domain').value = domain;
    }

    const query = domain ? { domain } : {};
    const cookies = await chrome.cookies.getAll(query);

    // Add URL field to each cookie for easy import
    const enrichedCookies = cookies.map(cookie => {
      const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const url = `http${cookie.secure ? 's' : ''}://${cookieDomain}${cookie.path || '/'}`;
      return { ...cookie, url };
    });

    const format = $('#export-format').value;
    let output;

    if (format === 'netscape') {
      output = toNetscapeFormat(cookies);
    } else {
      output = JSON.stringify(enrichedCookies, null, 2);
    }

    $('#export-output').value = output;
    $('#export-count').textContent = `${cookies.length} cookie(s) exported`;
    showToast(`Exported ${cookies.length} cookies`);
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
});

// Copy to clipboard
$('#copy-btn').addEventListener('click', async () => {
  const output = $('#export-output').value;
  if (!output) {
    showToast('Nothing to copy', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(output);
    showToast('Copied to clipboard');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
});

// Download file
$('#download-btn').addEventListener('click', () => {
  const output = $('#export-output').value;
  if (!output) {
    showToast('Nothing to download', 'error');
    return;
  }

  const format = $('#export-format').value;
  const ext = format === 'netscape' ? 'txt' : 'json';
  const domain = $('#export-domain').value || 'all';
  const filename = `cookies-${domain}-${Date.now()}.${ext}`;

  const blob = new Blob([output], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
  showToast(`Downloaded ${filename}`);
});

// Import cookies
$('#import-btn').addEventListener('click', async () => {
  try {
    const input = $('#import-input').value.trim();
    if (!input) {
      showToast('No cookies to import', 'error');
      return;
    }

    let targetUrl = $('#import-url').value.trim();
    if ($('#use-current-url').checked) {
      const tab = await getCurrentTab();
      targetUrl = tab.url;
      $('#import-url').value = targetUrl;
    }

    const format = $('#import-format').value;
    let cookies;

    if (format === 'netscape') {
      cookies = parseNetscapeCookies(input);
    } else {
      const parsed = JSON.parse(input);
      // Handle various formats
      cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || [parsed]);
    }

    let imported = 0;
    let failed = 0;

    for (const cookie of cookies) {
      try {
        // Use cookie's URL if available, otherwise build from domain, or fall back to target URL
        let url = cookie.url;
        if (!url && cookie.domain) {
          const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          url = `http${cookie.secure ? 's' : ''}://${cookieDomain}${cookie.path || '/'}`;
        }
        if (!url) url = targetUrl;

        if (!url) {
          failed++;
          continue;
        }

        // Normalize sameSite
        let sameSite = cookie.sameSite || 'lax';
        if (sameSite === 'unspecified') sameSite = 'lax';

        const cookieData = {
          url,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path || '/',
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite
        };

        // __Host- cookies must NOT have domain set
        if (cookie.name.startsWith('__Host-')) {
          cookieData.secure = true;
          cookieData.path = '/';
        } else if (cookie.name.startsWith('__Secure-')) {
          cookieData.secure = true;
          if (cookie.domain) cookieData.domain = cookie.domain;
        } else if (cookie.domain) {
          cookieData.domain = cookie.domain;
        }

        if (cookie.expirationDate) {
          cookieData.expirationDate = cookie.expirationDate;
        }

        await chrome.cookies.set(cookieData);
        imported++;
      } catch (e) {
        console.warn('Failed to set cookie:', cookie.name, e);
        failed++;
      }
    }

    showToast(`Imported ${imported}/${cookies.length} cookies${failed ? ` (${failed} failed)` : ''}`);
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
});

// Load from file
$('#load-file-btn').addEventListener('click', () => {
  $('#file-input').click();
});

$('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  $('#import-input').value = text;

  // Auto-detect format
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    $('#import-format').value = 'json';
  } else {
    $('#import-format').value = 'netscape';
  }

  showToast(`Loaded ${file.name}`);
  e.target.value = '';
});

// View domain cookies
$('#view-cookies-btn').addEventListener('click', async () => {
  try {
    const tab = await getCurrentTab();
    const domain = getDomainFromUrl(tab.url);
    const cookies = await chrome.cookies.getAll({ domain });

    const enrichedCookies = cookies.map(cookie => {
      const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const url = `http${cookie.secure ? 's' : ''}://${cookieDomain}${cookie.path || '/'}`;
      return { ...cookie, url };
    });

    $('#export-domain').value = domain;
    $('#export-output').value = JSON.stringify(enrichedCookies, null, 2);
    $('#export-count').textContent = `${cookies.length} cookie(s) for ${domain}`;

    // Switch to export sub-tab
    $$('.sub-tab').forEach(t => t.classList.remove('active'));
    $$('.subtab-content').forEach(tc => tc.classList.remove('active'));
    $('.sub-tab[data-subtab="export"]').classList.add('active');
    $('#export-subtab').classList.add('active');

    showToast(`Found ${cookies.length} cookies`);
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
});

// Clear domain cookies
$('#clear-domain-btn').addEventListener('click', async () => {
  try {
    const tab = await getCurrentTab();
    const domain = getDomainFromUrl(tab.url);

    if (!domain) {
      showToast('Cannot determine domain', 'error');
      return;
    }

    const cookies = await chrome.cookies.getAll({ domain });

    if (cookies.length === 0) {
      showToast('No cookies to clear');
      return;
    }

    for (const cookie of cookies) {
      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`;
      await chrome.cookies.remove({ url, name: cookie.name });
    }

    showToast(`Cleared ${cookies.length} cookies for ${domain}`);
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
});

// Clear ALL cookies
$('#clear-all-btn').addEventListener('click', async () => {
  try {
    if (!confirm('Are you sure you want to clear ALL cookies? This will log you out of everything.')) {
      return;
    }

    const cookies = await chrome.cookies.getAll({});

    if (cookies.length === 0) {
      showToast('No cookies to clear');
      return;
    }

    let cleared = 0;
    for (const cookie of cookies) {
      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`;
      try {
        await chrome.cookies.remove({ url, name: cookie.name });
        cleared++;
      } catch (e) {
        console.warn('Failed to remove cookie:', cookie.name, e);
      }
    }

    showToast(`Cleared ${cleared} cookies`);
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
});

// Checkbox auto-fill
$('#current-domain-only').addEventListener('change', async (e) => {
  if (e.target.checked) {
    const tab = await getCurrentTab();
    $('#export-domain').value = getDomainFromUrl(tab.url);
  }
});

$('#use-current-url').addEventListener('change', async (e) => {
  if (e.target.checked) {
    const tab = await getCurrentTab();
    $('#import-url').value = tab.url;
  }
});

// ============ TOOLS TAB ============

const defaultArgs = {
  read_page: { filter: 'interactive', depth: 10 },
  screenshot: {},
  click: { coordinate: [100, 100] },
  type: { text: 'Hello World' },
  navigate: { url: 'https://example.com' },
  scroll: { direction: 'down', amount: 300 },
  execute_script: { code: 'document.title' },
  wait: { ms: 1000 },
  get_tabs: {},
  create_tab: { url: 'https://example.com' },
  save_session: {},
  restore_session: { session: {} }
};

$('#tool-select').addEventListener('change', () => {
  const tool = $('#tool-select').value;
  $('#args-input').value = JSON.stringify(defaultArgs[tool] || {}, null, 2);
});

async function refreshTabInfo() {
  try {
    const tab = await getCurrentTab();
    if (tab) {
      $('#tab-info').innerHTML = `
        <strong>ID:</strong> ${tab.id}<br>
        <strong>Title:</strong> ${tab.title?.substring(0, 40) || 'N/A'}<br>
        <strong>URL:</strong> ${tab.url?.substring(0, 40) || 'N/A'}
      `;
    } else {
      $('#tab-info').textContent = 'No active tab';
    }
  } catch (e) {
    $('#tab-info').textContent = 'Error: ' + e.message;
  }
}

async function executeTool() {
  const tool = $('#tool-select').value;
  let args;

  try {
    args = JSON.parse($('#args-input').value);
  } catch (e) {
    $('#result').innerHTML = `<span class="error">Invalid JSON: ${e.message}</span>`;
    return;
  }

  const tabId = $('#tab-id').value ? parseInt($('#tab-id').value) : undefined;
  $('#result').innerHTML = '<span class="loading">Executing...</span>';

  try {
    const message = {
      source: 'popup',
      id: `popup_${Date.now()}`,
      tool,
      args,
      tabId
    };

    const response = await chrome.runtime.sendMessage(message);

    if (response.success) {
      let resultHtml = '<span class="success">Success!</span><br><pre>';
      if (tool === 'screenshot' && response.result?.image) {
        resultHtml += `<img src="${response.result.image}" style="max-width: 100%; border: 1px solid #ccc;">`;
      } else {
        resultHtml += JSON.stringify(response.result, null, 2);
      }
      resultHtml += '</pre>';
      $('#result').innerHTML = resultHtml;
    } else {
      $('#result').innerHTML = `<span class="error">Error: ${response.error}</span>`;
    }
  } catch (e) {
    $('#result').innerHTML = `<span class="error">Error: ${e.message}</span>`;
  }
}

$('#execute-btn').addEventListener('click', executeTool);
$('#refresh-btn').addEventListener('click', refreshTabInfo);

// ============ SETTINGS ============

async function loadSettings() {
  const settings = await chrome.storage.local.get(['pollingEnabled', 'serverUrl', 'pollInterval']);
  $('#enable-polling').checked = settings.pollingEnabled !== false; // Default true
  $('#server-url').value = settings.serverUrl || 'http://127.0.0.1:8766';
  $('#poll-interval').value = settings.pollInterval || 100;
}

async function saveSettings() {
  const settings = {
    pollingEnabled: $('#enable-polling').checked,
    serverUrl: $('#server-url').value || 'http://127.0.0.1:8766',
    pollInterval: parseInt($('#poll-interval').value) || 100
  };

  await chrome.storage.local.set(settings);

  // Notify service worker of settings change
  try {
    await chrome.runtime.sendMessage({ type: 'settingsChanged', settings });
  } catch (e) {
    console.warn('Could not notify service worker:', e);
  }

  showToast('Settings saved');
}

$('#save-settings-btn').addEventListener('click', saveSettings);

// ============ STATUS CHECK ============

async function checkServerStatus() {
  const settings = await chrome.storage.local.get(['pollingEnabled', 'serverUrl']);
  const serverUrl = settings.serverUrl || 'http://127.0.0.1:8766';
  const pollingEnabled = settings.pollingEnabled !== false;

  const statusDot = $('.status-dot');
  const statusText = $('#status-text');

  if (!pollingEnabled) {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Disabled';
    return;
  }

  try {
    const response = await fetch(serverUrl, { method: 'GET' });
    if (response.ok) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected';
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Error';
    }
  } catch (e) {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Offline';
  }
}

// ============ INITIALIZE ============

(async () => {
  // Load settings
  await loadSettings();

  // Check server status
  await checkServerStatus();

  // Refresh tab info
  await refreshTabInfo();

  // Set placeholders
  const tab = await getCurrentTab();
  if (tab?.url) {
    $('#export-domain').placeholder = getDomainFromUrl(tab.url) || 'example.com';
    $('#import-url').placeholder = tab.url;
  }

  // Initialize tool args
  $('#args-input').value = JSON.stringify(defaultArgs[$('#tool-select').value], null, 2);
})();
