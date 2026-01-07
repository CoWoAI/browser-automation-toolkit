// Browser Automation Toolkit - Service Worker
// Handles HTTP polling and tool execution

const COMMAND_SERVER_URL = 'http://127.0.0.1:8766';

console.log('[BAT] Service worker starting...');

// ============ UTILITY FUNCTIONS ============

async function getActiveTab() {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) return tab;

  [tab] = await chrome.tabs.query({ active: true });
  if (tab) return tab;

  const tabs = await chrome.tabs.query({});
  tab = tabs.find(t => !t.url?.startsWith('chrome://') && !t.url?.startsWith('chrome-extension://'));
  return tab || tabs[0] || null;
}

async function ensureContentScript(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => typeof window.__generateAccessibilityTree === 'function'
    });
    if (results[0]?.result) return true;
  } catch (e) { /* ignore */ }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/accessibility-tree.js']
    });
    return true;
  } catch (e) {
    console.error('[BAT] Failed to inject content script:', e.message);
    return false;
  }
}

async function executeInTab(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args
  });
  return results[0]?.result;
}

// ============ TOOL HANDLERS ============

const tools = {
  // ---- Navigation ----
  async navigate({ url, direction }, tabId) {
    if (direction === 'back') {
      await chrome.tabs.goBack(tabId);
      return { success: true, action: 'back' };
    }
    if (direction === 'forward') {
      await chrome.tabs.goForward(tabId);
      return { success: true, action: 'forward' };
    }
    if (direction === 'reload' || !url) {
      await chrome.tabs.reload(tabId);
      return { success: true, action: 'reload' };
    }
    await chrome.tabs.update(tabId, { url });
    return { success: true, url };
  },

  async reload({ ignoreCache = false }, tabId) {
    await chrome.tabs.reload(tabId, { bypassCache: ignoreCache });
    return { success: true };
  },

  // ---- Screenshots ----
  async screenshot({ fullPage = false, quality = 90, format = 'png' }, tabId) {
    const tab = await chrome.tabs.get(tabId);

    if (fullPage) {
      // Full page screenshot via scrolling
      const pageInfo = await executeInTab(tabId, () => ({
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        scrollY: window.scrollY
      }));

      // For now, just capture viewport (full page requires more complex stitching)
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format, quality: format === 'jpeg' ? quality : undefined });
      return { image: dataUrl, viewport: { width: pageInfo.viewportWidth, height: pageInfo.viewportHeight }, fullPage: false, note: 'Full page capture not yet implemented, returning viewport' };
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format, quality: format === 'jpeg' ? quality : undefined });
    const viewport = await executeInTab(tabId, () => ({ width: window.innerWidth, height: window.innerHeight }));
    return { image: dataUrl, viewport };
  },

  // ---- Page Content ----
  async read_page({ filter = 'all', depth = 15, ref_id = null }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (f, d, r) => {
      return window.__generateAccessibilityTree?.(f, d, r) || { error: 'Content script not loaded' };
    }, [filter, depth, ref_id]);
  },

  async get_html({ selector, outer = true }, tabId) {
    return await executeInTab(tabId, (sel, outer) => {
      if (sel) {
        const el = document.querySelector(sel);
        if (!el) return { success: false, error: 'Element not found' };
        return { success: true, html: outer ? el.outerHTML : el.innerHTML };
      }
      return { success: true, html: document.documentElement.outerHTML };
    }, [selector, outer]);
  },

  async get_text({ selector }, tabId) {
    return await executeInTab(tabId, (sel) => {
      if (sel) {
        const el = document.querySelector(sel);
        if (!el) return { success: false, error: 'Element not found' };
        return { success: true, text: el.textContent };
      }
      return { success: true, text: document.body.innerText };
    }, [selector]);
  },

  // ---- Element Interaction ----
  async click({ ref, coordinate, button = 'left', clickCount = 1, modifiers = {} }, tabId) {
    await ensureContentScript(tabId);

    if (ref) {
      return await executeInTab(tabId, (refId, btn, count, mods) => {
        return window.__clickElementByRef?.(refId, btn, count, mods) || { success: false, error: 'Content script not loaded' };
      }, [ref, button, clickCount, modifiers]);
    }

    if (coordinate) {
      const [x, y] = coordinate;
      return await executeInTab(tabId, (cx, cy, btn, count, mods) => {
        const el = document.elementFromPoint(cx, cy);
        if (!el) return { success: false, error: 'No element at coordinates' };

        const eventInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: cx,
          clientY: cy,
          button: btn === 'right' ? 2 : btn === 'middle' ? 1 : 0,
          ctrlKey: mods.ctrl || false,
          shiftKey: mods.shift || false,
          altKey: mods.alt || false,
          metaKey: mods.meta || false
        };

        for (let i = 0; i < count; i++) {
          el.dispatchEvent(new MouseEvent('mousedown', eventInit));
          el.dispatchEvent(new MouseEvent('mouseup', eventInit));
          el.dispatchEvent(new MouseEvent('click', eventInit));
        }
        if (count === 2) el.dispatchEvent(new MouseEvent('dblclick', eventInit));

        return { success: true, element: el.tagName, coordinates: [cx, cy] };
      }, [x, y, button, clickCount, modifiers]);
    }

    return { success: false, error: 'Must provide ref or coordinate' };
  },

  async type({ text, ref, delay = 0, clear = false }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (txt, refId, clr) => {
      let el = refId ? window.__getElementByRef?.(refId) : document.activeElement;
      if (!el) return { success: false, error: refId ? `Element ${refId} not found` : 'No active element' };

      el.focus();
      if (clr && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        el.value = '';
      }

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.value += txt;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        document.execCommand('insertText', false, txt);
      } else {
        return { success: false, error: 'Element is not editable' };
      }

      return { success: true };
    }, [text, ref, clear]);
  },

  async fill({ ref, value }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (refId, val) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };

      el.focus();
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true };
      }
      return { success: false, error: 'Element is not an input' };
    }, [ref, value]);
  },

  async select({ ref, value }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (refId, val) => {
      const el = window.__getElementByRef?.(refId);
      if (!el || el.tagName !== 'SELECT') return { success: false, error: 'Not a select element' };

      const option = Array.from(el.options).find(o => o.value === val || o.text === val);
      if (!option) return { success: false, error: `Option "${val}" not found` };

      el.value = option.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, selected: option.value };
    }, [ref, value]);
  },

  async check({ ref, checked = true }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (refId, check) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };
      if (el.type !== 'checkbox' && el.type !== 'radio') {
        return { success: false, error: 'Not a checkbox or radio' };
      }

      if (el.checked !== check) {
        el.click();
      }
      return { success: true, checked: el.checked };
    }, [ref, checked]);
  },

  async focus({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (refId) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };
      el.focus();
      return { success: true };
    }, [ref]);
  },

  async blur({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (refId) => {
      const el = refId ? window.__getElementByRef?.(refId) : document.activeElement;
      if (el) el.blur();
      return { success: true };
    }, [ref]);
  },

  async hover({ ref, coordinate }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (refId, coord) => {
      let el, x, y;
      if (refId) {
        el = window.__getElementByRef?.(refId);
        if (!el) return { success: false, error: `Element ${refId} not found` };
        const rect = el.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      } else if (coord) {
        [x, y] = coord;
        el = document.elementFromPoint(x, y);
      } else {
        return { success: false, error: 'Must provide ref or coordinate' };
      }

      if (el) {
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
      }
      return { success: true, coordinates: [x, y] };
    }, [ref, coordinate]);
  },

  // ---- Keyboard ----
  async press({ key, modifiers = {} }, tabId) {
    return await executeInTab(tabId, (k, mods) => {
      const eventInit = {
        key: k,
        code: k,
        bubbles: true,
        cancelable: true,
        ctrlKey: mods.ctrl || false,
        shiftKey: mods.shift || false,
        altKey: mods.alt || false,
        metaKey: mods.meta || false
      };

      const el = document.activeElement || document.body;
      el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      el.dispatchEvent(new KeyboardEvent('keypress', eventInit));
      el.dispatchEvent(new KeyboardEvent('keyup', eventInit));
      return { success: true, key: k };
    }, [key, modifiers]);
  },

  async keyboard({ action, key, text }, tabId) {
    return await executeInTab(tabId, (act, k, txt) => {
      const el = document.activeElement || document.body;
      const eventInit = { key: k, code: k, bubbles: true, cancelable: true };

      if (act === 'down') {
        el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      } else if (act === 'up') {
        el.dispatchEvent(new KeyboardEvent('keyup', eventInit));
      } else if (act === 'press') {
        el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        el.dispatchEvent(new KeyboardEvent('keyup', eventInit));
      } else if (act === 'type' && txt) {
        for (const char of txt) {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        }
      }
      return { success: true };
    }, [action, key, text]);
  },

  // ---- Mouse ----
  async mouse({ action, x, y, button = 'left' }, tabId) {
    return await executeInTab(tabId, (act, mx, my, btn) => {
      const el = document.elementFromPoint(mx, my) || document.body;
      const eventInit = {
        clientX: mx,
        clientY: my,
        button: btn === 'right' ? 2 : btn === 'middle' ? 1 : 0,
        bubbles: true,
        cancelable: true
      };

      if (act === 'move') {
        el.dispatchEvent(new MouseEvent('mousemove', eventInit));
      } else if (act === 'down') {
        el.dispatchEvent(new MouseEvent('mousedown', eventInit));
      } else if (act === 'up') {
        el.dispatchEvent(new MouseEvent('mouseup', eventInit));
      } else if (act === 'click') {
        el.dispatchEvent(new MouseEvent('click', eventInit));
      }
      return { success: true };
    }, [action, x, y, button]);
  },

  async drag({ from, to }, tabId) {
    return await executeInTab(tabId, (f, t) => {
      const startEl = document.elementFromPoint(f[0], f[1]);
      const endEl = document.elementFromPoint(t[0], t[1]);

      if (startEl) {
        startEl.dispatchEvent(new MouseEvent('mousedown', { clientX: f[0], clientY: f[1], bubbles: true }));
        startEl.dispatchEvent(new DragEvent('dragstart', { clientX: f[0], clientY: f[1], bubbles: true }));
      }

      document.dispatchEvent(new MouseEvent('mousemove', { clientX: t[0], clientY: t[1], bubbles: true }));

      if (endEl) {
        endEl.dispatchEvent(new DragEvent('dragover', { clientX: t[0], clientY: t[1], bubbles: true }));
        endEl.dispatchEvent(new DragEvent('drop', { clientX: t[0], clientY: t[1], bubbles: true }));
        endEl.dispatchEvent(new MouseEvent('mouseup', { clientX: t[0], clientY: t[1], bubbles: true }));
      }

      return { success: true, from: f, to: t };
    }, [from, to]);
  },

  // ---- Scrolling ----
  async scroll({ direction, amount = 300, ref, coordinate }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (dir, amt, refId, coord) => {
      if (refId) {
        const el = window.__getElementByRef?.(refId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { success: true, scrolledTo: refId };
      }

      const scrollMap = { up: [0, -amt], down: [0, amt], left: [-amt, 0], right: [amt, 0] };
      const [x, y] = scrollMap[dir] || [0, 0];
      window.scrollBy({ left: x, top: y, behavior: 'smooth' });
      return { success: true, scrollX: window.scrollX, scrollY: window.scrollY };
    }, [direction, amount, ref, coordinate]);
  },

  async scroll_to({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (refId) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { success: true };
    }, [ref]);
  },

  // ---- Tabs ----
  async get_tabs() {
    const tabs = await chrome.tabs.query({});
    return {
      success: true,
      tabs: tabs.map(t => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.active,
        windowId: t.windowId
      }))
    };
  },

  async create_tab({ url, active = true }) {
    const tab = await chrome.tabs.create({ url: url || 'about:blank', active });
    return { success: true, tabId: tab.id };
  },

  async close_tab({ tabId }) {
    await chrome.tabs.remove(tabId || (await getActiveTab()).id);
    return { success: true };
  },

  async switch_tab({ tabId }) {
    await chrome.tabs.update(tabId, { active: true });
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    return { success: true };
  },

  // ---- Wait ----
  async wait({ ms }) {
    await new Promise(r => setTimeout(r, ms));
    return { success: true, waited: ms };
  },

  async wait_for({ ref, selector, state = 'visible', timeout = 5000 }, tabId) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = await executeInTab(tabId, (refId, sel, st) => {
        let el;
        if (refId) el = window.__getElementByRef?.(refId);
        else if (sel) el = document.querySelector(sel);
        if (!el) return { found: false };

        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';

        if (st === 'attached') return { found: true };
        if (st === 'visible') return { found: visible };
        if (st === 'hidden') return { found: !visible };
        return { found: true };
      }, [ref, selector, state]);

      if (result?.found) return { success: true, elapsed: Date.now() - start };
      await new Promise(r => setTimeout(r, 100));
    }
    return { success: false, error: `Timeout waiting for element (${timeout}ms)` };
  },

  async wait_for_navigation({ timeout = 30000 }, tabId) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        chrome.webNavigation.onCompleted.removeListener(listener);
        resolve({ success: false, error: 'Navigation timeout' });
      }, timeout);

      const listener = (details) => {
        if (details.tabId === tabId && details.frameId === 0) {
          clearTimeout(timer);
          chrome.webNavigation.onCompleted.removeListener(listener);
          resolve({ success: true, url: details.url });
        }
      };
      chrome.webNavigation.onCompleted.addListener(listener);
    });
  },

  // ---- Execute Script ----
  async execute_script({ code, args = [] }, tabId) {
    try {
      const result = await executeInTab(tabId, (c, a) => {
        try {
          const fn = new Function(...a.map((_, i) => `arg${i}`), c);
          return { success: true, result: fn(...a) };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }, [code, args]);
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async evaluate({ code, args = [] }, tabId) {
    return tools.execute_script({ code, args }, tabId);
  },

  // ---- Cookies ----
  async get_cookies({ url, name }) {
    const query = {};
    if (url) query.url = url;
    if (name) query.name = name;
    const cookies = await chrome.cookies.getAll(query);
    return { success: true, cookies };
  },

  async set_cookie({ cookie }) {
    const result = await chrome.cookies.set(cookie);
    return { success: !!result, cookie: result };
  },

  async delete_cookies({ url, name }) {
    if (url && name) {
      await chrome.cookies.remove({ url, name });
    } else {
      const cookies = await chrome.cookies.getAll(url ? { url } : {});
      for (const c of cookies) {
        await chrome.cookies.remove({ url: `https://${c.domain}${c.path}`, name: c.name });
      }
    }
    return { success: true };
  },

  // ---- Storage ----
  async get_storage({ type, key }, tabId) {
    return await executeInTab(tabId, (t, k) => {
      const storage = t === 'session' ? sessionStorage : localStorage;
      if (k) return { success: true, value: storage.getItem(k) };
      const items = {};
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        items[key] = storage.getItem(key);
      }
      return { success: true, items };
    }, [type, key]);
  },

  async set_storage({ type, key, value }, tabId) {
    return await executeInTab(tabId, (t, k, v) => {
      const storage = t === 'session' ? sessionStorage : localStorage;
      storage.setItem(k, v);
      return { success: true };
    }, [type, key, value]);
  },

  async clear_storage({ type }, tabId) {
    return await executeInTab(tabId, (t) => {
      const storage = t === 'session' ? sessionStorage : localStorage;
      storage.clear();
      return { success: true };
    }, [type]);
  },

  // ---- Page Info ----
  async get_url({}, tabId) {
    const tab = await chrome.tabs.get(tabId);
    return { success: true, url: tab.url };
  },

  async get_title({}, tabId) {
    const tab = await chrome.tabs.get(tabId);
    return { success: true, title: tab.title };
  },

  async get_viewport({}, tabId) {
    return await executeInTab(tabId, () => ({
      success: true,
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    }));
  },

  async set_viewport({ width, height }, tabId) {
    // Can't actually resize viewport from extension, but we can note the request
    return { success: false, error: 'Cannot resize viewport from extension. Use browser window controls.' };
  },

  // ---- Element Queries ----
  async find({ selector }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: 'Element not found' };

      // Generate ref
      if (!window.__elementMap) window.__elementMap = {};
      if (!window.__refCounter) window.__refCounter = 0;
      const refId = `ref_${++window.__refCounter}`;
      window.__elementMap[refId] = new WeakRef(el);

      return { success: true, ref: refId, tag: el.tagName.toLowerCase() };
    }, [selector]);
  },

  async find_all({ selector, limit = 100 }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (sel, lim) => {
      const elements = Array.from(document.querySelectorAll(sel)).slice(0, lim);
      if (!window.__elementMap) window.__elementMap = {};
      if (!window.__refCounter) window.__refCounter = 0;

      const refs = elements.map(el => {
        const refId = `ref_${++window.__refCounter}`;
        window.__elementMap[refId] = new WeakRef(el);
        return { ref: refId, tag: el.tagName.toLowerCase() };
      });

      return { success: true, elements: refs, count: refs.length };
    }, [selector, limit]);
  },

  async find_by_text({ text, exact = false }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (txt, ex) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        const content = node.textContent.trim();
        const match = ex ? content === txt : content.includes(txt);
        if (match && node.parentElement) {
          if (!window.__elementMap) window.__elementMap = {};
          if (!window.__refCounter) window.__refCounter = 0;
          const refId = `ref_${++window.__refCounter}`;
          window.__elementMap[refId] = new WeakRef(node.parentElement);
          return { success: true, ref: refId, tag: node.parentElement.tagName.toLowerCase(), text: content };
        }
      }
      return { success: false, error: 'Element with text not found' };
    }, [text, exact]);
  },

  async get_element_info({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (refId) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };

      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      return {
        success: true,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        text: el.textContent?.substring(0, 200),
        value: el.value,
        href: el.href,
        src: el.src,
        attributes: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value])),
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      };
    }, [ref]);
  },

  async get_bounding_box({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await executeInTab(tabId, (refId) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };
      const rect = el.getBoundingClientRect();
      return { success: true, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, [ref]);
  },

  // ---- Files ----
  async set_file({ ref, files }, tabId) {
    // File inputs are tricky from extensions - this is a placeholder
    return { success: false, error: 'File input not yet supported from extension' };
  },

  // ---- Dialogs ----
  async handle_dialog({ action, text }) {
    // Would need debugger API for this
    return { success: false, error: 'Dialog handling requires debugger API - not yet implemented' };
  },

  // ---- PDF ----
  async save_pdf({ options = {} }, tabId) {
    // Would need debugger API for this
    return { success: false, error: 'PDF saving requires debugger API - not yet implemented' };
  },

  // ---- Network ----
  async get_network_requests({ filter }) {
    // Would need webRequest storage
    return { success: false, error: 'Network request capture not yet implemented' };
  },

  // ---- Utility (handled by server) ----
  async ping() {
    return { success: true, pong: true };
  },

  async get_tools() {
    return { success: true, tools: Object.keys(tools) };
  }
};

// ============ REQUEST HANDLER ============

async function handleToolRequest(message) {
  const { id, tool, args = {}, tabId } = message;

  try {
    const handler = tools[tool];
    if (!handler) {
      return { id, success: false, error: `Unknown tool: ${tool}` };
    }

    let targetTabId = tabId;
    const tabRequiredTools = ['navigate', 'reload', 'screenshot', 'read_page', 'get_html', 'get_text',
      'click', 'type', 'fill', 'select', 'check', 'focus', 'blur', 'hover',
      'press', 'keyboard', 'mouse', 'drag', 'scroll', 'scroll_to',
      'wait_for', 'wait_for_navigation', 'execute_script', 'evaluate',
      'get_storage', 'set_storage', 'clear_storage', 'get_url', 'get_title', 'get_viewport',
      'find', 'find_all', 'find_by_text', 'get_element_info', 'get_bounding_box'];

    if (!targetTabId && tabRequiredTools.includes(tool)) {
      const activeTab = await getActiveTab();
      if (!activeTab) {
        return { id, success: false, error: 'No active tab' };
      }
      targetTabId = activeTab.id;
    }

    const result = await handler(args, targetTabId);
    return { id, success: true, result };
  } catch (e) {
    console.error(`[BAT] Tool error (${tool}):`, e);
    return { id, success: false, error: e.message };
  }
}

// ============ HTTP POLLING ============

async function pollForCommands() {
  try {
    const response = await fetch(`${COMMAND_SERVER_URL}/command`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (response.status === 200) {
      const command = await response.json();
      console.log('[BAT] Command:', command.tool);

      const result = await handleToolRequest(command);

      await fetch(`${COMMAND_SERVER_URL}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });
    }
  } catch (e) {
    // Server not running - silent
  }
}

setInterval(pollForCommands, 100);

// ============ MESSAGE LISTENERS ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === 'popup' || message.source === 'external') {
    handleToolRequest(message).then(sendResponse);
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleToolRequest(message).then(sendResponse);
  return true;
});

console.log('[BAT] Ready, polling', COMMAND_SERVER_URL);
