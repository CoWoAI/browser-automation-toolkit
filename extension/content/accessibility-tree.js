// Accessibility Tree Content Script
// Generates a structured DOM tree with ref IDs for element targeting

(function() {
  'use strict';

  console.log('[BrowserTaskExecutor] Content script loaded on:', window.location.href);

  // Listen for commands from bridge (MAIN world) via custom event
  document.addEventListener('__browserExecutorCommand', async (event) => {
    const data = event.detail;
    console.log('[BrowserTaskExecutor] Received command from bridge:', data);

    try {
      const response = await chrome.runtime.sendMessage(data.command);
      console.log('[BrowserTaskExecutor] Got response:', response);

      // Send response back to bridge via custom event
      const responseEvent = new CustomEvent('__browserExecutorResponse', {
        detail: { type: 'BROWSER_EXECUTOR_RESPONSE', id: data.id, response }
      });
      document.dispatchEvent(responseEvent);
    } catch (e) {
      console.error('[BrowserTaskExecutor] Error:', e.message);
      const responseEvent = new CustomEvent('__browserExecutorResponse', {
        detail: { type: 'BROWSER_EXECUTOR_RESPONSE', id: data.id, error: e.message }
      });
      document.dispatchEvent(responseEvent);
    }
  });

  // Initialize global state
  if (!window.__elementMap) {
    window.__elementMap = {};
  }
  if (!window.__refCounter) {
    window.__refCounter = 0;
  }

  // Tags to skip entirely
  const SKIP_TAGS = new Set(['script', 'style', 'meta', 'link', 'title', 'noscript', 'svg', 'path']);

  // Interactive tags
  const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'details', 'summary']);

  // Semantic/landmark tags
  const SEMANTIC_TAGS = new Set(['nav', 'main', 'header', 'footer', 'section', 'article', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

  // Get or create ref ID for an element
  function getRefId(element) {
    // Check if element already has a ref
    for (const [refId, weakRef] of Object.entries(window.__elementMap)) {
      const el = weakRef.deref();
      if (el === element) {
        return refId;
      }
    }
    // Create new ref
    const refId = `ref_${++window.__refCounter}`;
    window.__elementMap[refId] = new WeakRef(element);
    return refId;
  }

  // Get element by ref ID
  function getElementByRef(refId) {
    const weakRef = window.__elementMap[refId];
    if (!weakRef) return null;
    return weakRef.deref() || null;
  }

  // Clean up stale refs
  function cleanupRefs() {
    for (const [refId, weakRef] of Object.entries(window.__elementMap)) {
      if (!weakRef.deref()) {
        delete window.__elementMap[refId];
      }
    }
  }

  // Check if element is visible
  function isVisible(element) {
    if (!element.offsetParent && element.tagName !== 'BODY' && element.tagName !== 'HTML') {
      // Check if it's position fixed/sticky
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') {
        return false;
      }
    }

    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }

    return true;
  }

  // Check if element is in viewport
  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  // Check if element is interactive
  function isInteractive(element) {
    const tag = element.tagName.toLowerCase();
    if (INTERACTIVE_TAGS.has(tag)) return true;
    if (element.hasAttribute('onclick')) return true;
    if (element.hasAttribute('tabindex')) return true;
    if (element.getAttribute('role') === 'button' || element.getAttribute('role') === 'link') return true;
    if (element.getAttribute('contenteditable') === 'true') return true;
    return false;
  }

  // Check if element is semantic/landmark
  function isSemantic(element) {
    const tag = element.tagName.toLowerCase();
    if (SEMANTIC_TAGS.has(tag)) return true;
    if (element.hasAttribute('role')) return true;
    return false;
  }

  // Get element's role
  function getRole(element) {
    if (element.hasAttribute('role')) {
      return element.getAttribute('role');
    }

    const tag = element.tagName.toLowerCase();
    const type = element.getAttribute('type');

    const roleMap = {
      'a': 'link',
      'button': 'button',
      'input': type || 'textbox',
      'select': 'combobox',
      'textarea': 'textbox',
      'img': 'image',
      'h1': 'heading',
      'h2': 'heading',
      'h3': 'heading',
      'h4': 'heading',
      'h5': 'heading',
      'h6': 'heading',
      'nav': 'navigation',
      'main': 'main',
      'header': 'banner',
      'footer': 'contentinfo',
      'section': 'region',
      'article': 'article',
      'aside': 'complementary',
      'form': 'form',
      'table': 'table',
      'ul': 'list',
      'ol': 'list',
      'li': 'listitem'
    };

    return roleMap[tag] || 'generic';
  }

  // Get accessible text for element
  function getAccessibleText(element) {
    // For select, get selected option text
    if (element.tagName === 'SELECT' && element.selectedIndex >= 0) {
      return element.options[element.selectedIndex].text;
    }

    // Check aria-label
    if (element.hasAttribute('aria-label')) {
      return element.getAttribute('aria-label');
    }

    // Check placeholder
    if (element.hasAttribute('placeholder')) {
      return element.getAttribute('placeholder');
    }

    // Check title
    if (element.hasAttribute('title')) {
      return element.getAttribute('title');
    }

    // Check alt (for images)
    if (element.hasAttribute('alt')) {
      return element.getAttribute('alt');
    }

    // Check associated label
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        return label.textContent.trim();
      }
    }

    // Check value for buttons/inputs
    if (element.tagName === 'INPUT' && element.type === 'submit' && element.value) {
      return element.value;
    }

    // Get direct text content (limited)
    let text = '';
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent;
      }
    }
    text = text.trim();
    if (text.length > 100) {
      text = text.substring(0, 100) + '...';
    }
    return text;
  }

  // Build accessibility tree
  function buildTree(element, depth, maxDepth, filter, includeHidden) {
    if (depth > maxDepth) return '';

    const tag = element.tagName?.toLowerCase();
    if (!tag || SKIP_TAGS.has(tag)) return '';

    // Check aria-hidden
    if (!includeHidden && element.getAttribute('aria-hidden') === 'true') {
      return '';
    }

    // Check visibility
    if (!includeHidden && !isVisible(element)) {
      return '';
    }

    // Filter logic
    let includeElement = false;
    if (filter === 'interactive') {
      includeElement = isInteractive(element);
    } else if (filter === 'all') {
      includeElement = isInteractive(element) || isSemantic(element) || element.tagName.match(/^(DIV|SPAN|P|LI|TD|TH)$/i);
    } else {
      includeElement = isInteractive(element) || isSemantic(element);
    }

    let output = '';
    const indent = '  '.repeat(depth);

    if (includeElement && isInViewport(element)) {
      const role = getRole(element);
      const text = getAccessibleText(element);
      const refId = getRefId(element);

      let line = `${indent}${role}`;
      if (text) {
        line += ` "${text}"`;
      }
      line += ` [${refId}]`;

      // Add useful attributes
      if (element.href) {
        line += ` href="${element.href}"`;
      }
      if (element.tagName === 'INPUT') {
        line += ` type="${element.type || 'text'}"`;
        if (element.value && element.type !== 'password') {
          line += ` value="${element.value}"`;
        }
      }

      output += line + '\n';
    }

    // Recurse into children
    for (const child of element.children) {
      output += buildTree(child, depth + 1, maxDepth, filter, includeHidden);
    }

    return output;
  }

  // Main function to generate accessibility tree
  window.__generateAccessibilityTree = function(filter = 'all', maxDepth = 15, refId = null) {
    try {
      // Clean up stale refs
      cleanupRefs();

      // If refId specified, start from that element
      let rootElement = document.body;
      if (refId) {
        const element = getElementByRef(refId);
        if (!element) {
          return {
            error: `Element with ref "${refId}" not found or has been garbage collected`,
            pageContent: '',
            viewport: { width: window.innerWidth, height: window.innerHeight }
          };
        }
        rootElement = element;
      }

      const includeHidden = filter === 'all';
      const pageContent = buildTree(rootElement, 0, maxDepth, filter, includeHidden);

      // Check output size
      if (pageContent.length > 50000) {
        return {
          error: `Output exceeds 50,000 characters (${pageContent.length}). Try using a smaller depth or focusing on a specific element with ref_id.`,
          pageContent: pageContent.substring(0, 50000),
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };
      }

      return {
        pageContent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        error: null
      };
    } catch (e) {
      return {
        error: e.message,
        pageContent: '',
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    }
  };

  // Helper to get element by ref (exposed for service worker)
  window.__getElementByRef = getElementByRef;

  // Helper to click element by ref
  window.__clickElementByRef = function(refId, button = 'left') {
    const element = getElementByRef(refId);
    if (!element) {
      return { success: false, error: `Element with ref "${refId}" not found` };
    }

    try {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      const eventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: button === 'right' ? 2 : 0
      };

      element.dispatchEvent(new MouseEvent('mousedown', eventInit));
      element.dispatchEvent(new MouseEvent('mouseup', eventInit));
      element.dispatchEvent(new MouseEvent('click', eventInit));

      // Also focus and trigger if it's a link or button
      if (element.tagName === 'A' || element.tagName === 'BUTTON') {
        element.focus();
        if (element.tagName === 'A' && element.href) {
          // Let the click event handle navigation
        }
      }

      return { success: true, coordinates: [x, y] };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // Helper to type into element
  window.__typeIntoElement = function(refId, text) {
    let element;
    if (refId) {
      element = getElementByRef(refId);
      if (!element) {
        return { success: false, error: `Element with ref "${refId}" not found` };
      }
    } else {
      element = document.activeElement;
    }

    try {
      element.focus();

      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (element.getAttribute('contenteditable') === 'true') {
        element.textContent = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        return { success: false, error: 'Element is not an input field' };
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // Helper to scroll
  window.__scrollPage = function(direction, amount = 300) {
    try {
      const scrollMap = {
        'up': [0, -amount],
        'down': [0, amount],
        'left': [-amount, 0],
        'right': [amount, 0]
      };
      const [x, y] = scrollMap[direction] || [0, 0];
      window.scrollBy(x, y);
      return { success: true, scrollX: window.scrollX, scrollY: window.scrollY };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

})();
