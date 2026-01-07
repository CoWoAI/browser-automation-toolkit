// Bridge script - runs in MAIN world to receive postMessage from page
// Forwards to isolated world content script via custom events

(function() {
  'use strict';

  console.log('[BrowserExecutor-Bridge] Bridge loaded in MAIN world');

  // Mark that bridge is loaded
  document.documentElement.setAttribute('data-browser-executor', 'loaded');
  window.__browserExecutorReady = true;

  // Listen for commands from the page
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'BROWSER_EXECUTOR_COMMAND') {
      console.log('[BrowserExecutor-Bridge] Received command from page:', event.data);

      // Forward to isolated world via custom event on document
      const customEvent = new CustomEvent('__browserExecutorCommand', {
        detail: event.data
      });
      document.dispatchEvent(customEvent);
    }
  });

  // Listen for responses from isolated world
  document.addEventListener('__browserExecutorResponse', (event) => {
    console.log('[BrowserExecutor-Bridge] Received response from isolated world:', event.detail);
    // Forward back to page
    window.postMessage(event.detail, '*');
  });

  console.log('[BrowserExecutor-Bridge] Bridge ready');
})();
