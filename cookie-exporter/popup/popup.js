// Cookie Exporter - Popup Script

const $ = (sel) => document.querySelector(sel);

// Utility functions
function showStatus(message, type = 'success') {
  const status = $('#status');
  status.textContent = message;
  status.className = `status ${type}`;
  setTimeout(() => { status.className = 'status'; }, 3000);
}

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

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    $(`#${tab.dataset.tab}-tab`).classList.add('active');
  });
});

// Export functionality
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

    const format = $('#export-format').value;
    let output;

    if (format === 'netscape') {
      output = toNetscapeFormat(cookies);
    } else {
      // Add URL field to each cookie for easy import
      const enrichedCookies = cookies.map(cookie => {
        const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
        const url = `http${cookie.secure ? 's' : ''}://${cookieDomain}${cookie.path || '/'}`;
        return { ...cookie, url };
      });
      output = JSON.stringify(enrichedCookies, null, 2);
    }

    $('#export-output').value = output;
    $('#export-count').textContent = `${cookies.length} cookie(s) exported`;
    showStatus(`Exported ${cookies.length} cookies`);
  } catch (e) {
    showStatus(`Error: ${e.message}`, 'error');
  }
});

// Copy to clipboard
$('#copy-btn').addEventListener('click', async () => {
  const output = $('#export-output').value;
  if (!output) {
    showStatus('Nothing to copy', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(output);
    showStatus('Copied to clipboard');
  } catch (e) {
    showStatus(`Error: ${e.message}`, 'error');
  }
});

// Download file
$('#download-btn').addEventListener('click', () => {
  const output = $('#export-output').value;
  if (!output) {
    showStatus('Nothing to download', 'error');
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
  showStatus(`Downloaded ${filename}`);
});

// Import functionality
$('#import-btn').addEventListener('click', async () => {
  try {
    const input = $('#import-input').value.trim();
    if (!input) {
      showStatus('No cookies to import', 'error');
      return;
    }

    let targetUrl = $('#import-url').value.trim();
    if ($('#use-current-url').checked) {
      const tab = await getCurrentTab();
      targetUrl = tab.url;
      $('#import-url').value = targetUrl;
    }

    // Target URL is now optional if cookies have their own URLs
    // (exported cookies now include URL field)

    const format = $('#import-format').value;
    let cookies;

    if (format === 'netscape') {
      cookies = parseNetscapeCookies(input);
    } else {
      cookies = JSON.parse(input);
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

        // Skip if no URL available
        if (!url) {
          console.warn('Skipping cookie without URL:', cookie.name);
          failed++;
          continue;
        }

        // Normalize sameSite - use 'lax' as default for unspecified
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

        // __Host- cookies must NOT have domain set, must have secure=true and path='/'
        // __Secure- cookies must have secure=true
        if (cookie.name.startsWith('__Host-')) {
          cookieData.secure = true;
          cookieData.path = '/';
          // Do NOT set domain for __Host- cookies
        } else if (cookie.name.startsWith('__Secure-')) {
          cookieData.secure = true;
          if (cookie.domain) {
            cookieData.domain = cookie.domain;
          }
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

    showStatus(`Imported ${imported}/${cookies.length} cookies${failed ? ` (${failed} failed)` : ''}`);
  } catch (e) {
    showStatus(`Error: ${e.message}`, 'error');
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

  showStatus(`Loaded ${file.name}`);
  e.target.value = ''; // Reset for next selection
});

// Clear domain cookies
$('#clear-domain-btn').addEventListener('click', async () => {
  try {
    const tab = await getCurrentTab();
    const domain = getDomainFromUrl(tab.url);

    if (!domain) {
      showStatus('Cannot determine domain', 'error');
      return;
    }

    const cookies = await chrome.cookies.getAll({ domain });

    if (cookies.length === 0) {
      showStatus('No cookies to clear');
      return;
    }

    for (const cookie of cookies) {
      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
      await chrome.cookies.remove({ url, name: cookie.name });
    }

    showStatus(`Cleared ${cookies.length} cookies for ${domain}`);
  } catch (e) {
    showStatus(`Error: ${e.message}`, 'error');
  }
});

// Clear ALL cookies
$('#clear-all-btn').addEventListener('click', async () => {
  try {
    if (!confirm('Are you sure you want to clear ALL cookies from ALL websites? This will log you out of everything.')) {
      return;
    }

    const cookies = await chrome.cookies.getAll({});

    if (cookies.length === 0) {
      showStatus('No cookies to clear');
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

    showStatus(`Cleared ${cleared} cookies from all websites`);
  } catch (e) {
    showStatus(`Error: ${e.message}`, 'error');
  }
});

// View all cookies
$('#view-cookies-btn').addEventListener('click', async () => {
  try {
    const tab = await getCurrentTab();
    const domain = getDomainFromUrl(tab.url);
    const cookies = await chrome.cookies.getAll({ domain });

    // Add URL field to each cookie for easy import
    const enrichedCookies = cookies.map(cookie => {
      const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const url = `http${cookie.secure ? 's' : ''}://${cookieDomain}${cookie.path || '/'}`;
      return { ...cookie, url };
    });

    $('#export-domain').value = domain;
    $('#export-output').value = JSON.stringify(enrichedCookies, null, 2);
    $('#export-count').textContent = `${cookies.length} cookie(s) for ${domain}`;

    // Switch to export tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    $('.tab[data-tab="export"]').classList.add('active');
    $('#export-tab').classList.add('active');

    showStatus(`Found ${cookies.length} cookies`);
  } catch (e) {
    showStatus(`Error: ${e.message}`, 'error');
  }
});

// Current domain checkbox auto-fill
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

// Initialize
(async () => {
  const tab = await getCurrentTab();
  if (tab?.url) {
    $('#export-domain').placeholder = getDomainFromUrl(tab.url) || 'example.com';
    $('#import-url').placeholder = tab.url;
  }
})();
