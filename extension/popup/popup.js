// Popup UI Logic

const toolSelect = document.getElementById('tool-select');
const argsInput = document.getElementById('args-input');
const tabIdInput = document.getElementById('tab-id');
const executeBtn = document.getElementById('execute-btn');
const refreshBtn = document.getElementById('refresh-btn');
const tabInfoDiv = document.getElementById('tab-info');
const resultDiv = document.getElementById('result');

// Default args for each tool
const defaultArgs = {
  inject_content_script: {},
  read_page: { filter: 'interactive', depth: 10 },
  screenshot: {},
  click: { coordinate: [100, 100] },
  type: { text: 'Hello World' },
  navigate: { url: 'https://example.com' },
  scroll: { direction: 'down', amount: 300 },
  execute_script: { code: 'document.title' },
  wait: { ms: 1000 },
  get_tabs: {},
  create_tab: { url: 'https://example.com' }
};

// Update args when tool changes
toolSelect.addEventListener('change', () => {
  const tool = toolSelect.value;
  argsInput.value = JSON.stringify(defaultArgs[tool] || {}, null, 2);
});

// Initialize with default args
argsInput.value = JSON.stringify(defaultArgs[toolSelect.value], null, 2);

// Refresh tab info
async function refreshTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      tabInfoDiv.innerHTML = `
        <strong>ID:</strong> ${tab.id}<br>
        <strong>Title:</strong> ${tab.title?.substring(0, 50) || 'N/A'}<br>
        <strong>URL:</strong> ${tab.url?.substring(0, 50) || 'N/A'}
      `;
    } else {
      tabInfoDiv.textContent = 'No active tab';
    }
  } catch (e) {
    tabInfoDiv.textContent = 'Error: ' + e.message;
  }
}

// Execute tool
async function execute() {
  const tool = toolSelect.value;
  let args;

  try {
    args = JSON.parse(argsInput.value);
  } catch (e) {
    resultDiv.innerHTML = `<span class="error">Invalid JSON: ${e.message}</span>`;
    return;
  }

  const tabId = tabIdInput.value ? parseInt(tabIdInput.value) : undefined;

  resultDiv.innerHTML = '<span class="loading">Executing...</span>';

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
      // Format result
      let resultHtml = '<span class="success">Success!</span><br><pre>';

      if (tool === 'screenshot' && response.result?.image) {
        // Show screenshot as image
        resultHtml += `<img src="${response.result.image}" style="max-width: 100%; border: 1px solid #ccc;">`;
        resultHtml += `\nViewport: ${response.result.viewport?.width}x${response.result.viewport?.height}`;
      } else {
        resultHtml += JSON.stringify(response.result, null, 2);
      }

      resultHtml += '</pre>';
      resultDiv.innerHTML = resultHtml;
    } else {
      resultDiv.innerHTML = `<span class="error">Error: ${response.error}</span>`;
    }
  } catch (e) {
    resultDiv.innerHTML = `<span class="error">Error: ${e.message}</span>`;
  }
}

// Event listeners
executeBtn.addEventListener('click', execute);
refreshBtn.addEventListener('click', refreshTabInfo);

// Initialize
refreshTabInfo();
