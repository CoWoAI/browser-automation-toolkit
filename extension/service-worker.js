// Browser Automation Toolkit - Service Worker v2.0
// Comprehensive browser automation via HTTP polling

const COMMAND_SERVER_URL = 'http://127.0.0.1:8766';

console.log('[BAT] Service worker v2.0 starting...');

// ============ STATE ============
const state = {
  consoleLogs: [],
  pageErrors: [],
  networkRequests: [],
  blockedUrls: [],
  mockResponses: new Map(),
  pendingDialogAction: null,
  currentFrameId: 0, // 0 = main frame
};

// ============ DEVICE PRESETS ============
const DEVICES = {
  'iPhone 12': { width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15', deviceScaleFactor: 3 },
  'iPhone 14': { width: 390, height: 844, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15', deviceScaleFactor: 3 },
  'Pixel 5': { width: 393, height: 851, userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36', deviceScaleFactor: 2.75 },
  'iPad': { width: 768, height: 1024, userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15', deviceScaleFactor: 2 },
  'iPad Pro': { width: 1024, height: 1366, userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15', deviceScaleFactor: 2 },
};

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

async function getWindow(windowId) {
  if (windowId) return await chrome.windows.get(windowId);
  const tab = await getActiveTab();
  return tab ? await chrome.windows.get(tab.windowId) : null;
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

async function exec(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [state.currentFrameId] },
    func,
    args
  });
  return results[0]?.result;
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
  return cookies.map(c =>
    `${c.domain}\t${c.httpOnly ? 'TRUE' : 'FALSE'}\t${c.path}\t${c.secure ? 'TRUE' : 'FALSE'}\t${c.expirationDate || 0}\t${c.name}\t${c.value}`
  ).join('\n');
}

// ============ TOOL HANDLERS ============

const tools = {
  // ============ NAVIGATION ============
  async navigate({ url, direction }, tabId) {
    if (direction === 'back') { await chrome.tabs.goBack(tabId); return { success: true, action: 'back' }; }
    if (direction === 'forward') { await chrome.tabs.goForward(tabId); return { success: true, action: 'forward' }; }
    if (direction === 'reload' || !url) { await chrome.tabs.reload(tabId); return { success: true, action: 'reload' }; }
    await chrome.tabs.update(tabId, { url });
    return { success: true, url };
  },

  async reload({ ignoreCache = false }, tabId) {
    await chrome.tabs.reload(tabId, { bypassCache: ignoreCache });
    return { success: true };
  },

  // ============ SCREENSHOTS ============
  async screenshot({ fullPage = false, quality = 90, format = 'png' }, tabId) {
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format, quality: format === 'jpeg' ? quality : undefined });
    const viewport = await exec(tabId, () => ({ width: window.innerWidth, height: window.innerHeight }));
    return { image: dataUrl, viewport };
  },

  async screenshot_element({ ref, format = 'png', quality = 90 }, tabId) {
    await ensureContentScript(tabId);
    const box = await exec(tabId, (refId) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, [ref]);
    if (!box) return { success: false, error: `Element ${ref} not found` };

    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format, quality: format === 'jpeg' ? quality : undefined });
    return { success: true, image: dataUrl, boundingBox: box, note: 'Full viewport captured. Client should crop to boundingBox.' };
  },

  async screenshot_full_page({ format = 'png', quality = 90 }, tabId) {
    // Simplified: just return viewport screenshot with page dimensions
    const pageInfo = await exec(tabId, () => ({
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    }));
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format, quality: format === 'jpeg' ? quality : undefined });
    return { success: true, image: dataUrl, pageSize: { width: pageInfo.scrollWidth, height: pageInfo.scrollHeight }, viewport: { width: pageInfo.viewportWidth, height: pageInfo.viewportHeight }, note: 'Viewport screenshot. Full page stitching requires multiple captures.' };
  },

  async read_page({ filter = 'all', depth = 15, ref_id = null }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (f, d, r) => window.__generateAccessibilityTree?.(f, d, r) || { error: 'Content script not loaded' }, [filter, depth, ref_id]);
  },

  async get_html({ selector, outer = true }, tabId) {
    return await exec(tabId, (sel, o) => {
      if (sel) { const el = document.querySelector(sel); if (!el) return { success: false, error: 'Element not found' }; return { success: true, html: o ? el.outerHTML : el.innerHTML }; }
      return { success: true, html: document.documentElement.outerHTML };
    }, [selector, outer]);
  },

  async get_text({ selector }, tabId) {
    return await exec(tabId, (sel) => {
      if (sel) { const el = document.querySelector(sel); if (!el) return { success: false, error: 'Element not found' }; return { success: true, text: el.textContent }; }
      return { success: true, text: document.body.innerText };
    }, [selector]);
  },

  async save_pdf({ options = {} }, tabId) {
    return { success: false, error: 'PDF generation requires debugger API. Use chrome.debugger for this feature.' };
  },

  // ============ ELEMENT INTERACTION ============
  async click({ ref, coordinate, button = 'left', clickCount = 1, modifiers = {} }, tabId) {
    await ensureContentScript(tabId);
    if (ref) {
      return await exec(tabId, (refId, btn, count, mods) => {
        const el = window.__getElementByRef?.(refId);
        if (!el) return { success: false, error: `Element ${refId} not found` };
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        const init = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: btn === 'right' ? 2 : btn === 'middle' ? 1 : 0, ctrlKey: mods.ctrl, shiftKey: mods.shift, altKey: mods.alt, metaKey: mods.meta };
        for (let i = 0; i < count; i++) { el.dispatchEvent(new MouseEvent('mousedown', init)); el.dispatchEvent(new MouseEvent('mouseup', init)); el.dispatchEvent(new MouseEvent('click', init)); }
        if (count === 2) el.dispatchEvent(new MouseEvent('dblclick', init));
        return { success: true, coordinates: [x, y] };
      }, [ref, button, clickCount, modifiers]);
    }
    if (coordinate) {
      const [x, y] = coordinate;
      return await exec(tabId, (cx, cy, btn, count, mods) => {
        const el = document.elementFromPoint(cx, cy);
        if (!el) return { success: false, error: 'No element at coordinates' };
        const init = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: btn === 'right' ? 2 : btn === 'middle' ? 1 : 0, ctrlKey: mods.ctrl, shiftKey: mods.shift, altKey: mods.alt, metaKey: mods.meta };
        for (let i = 0; i < count; i++) { el.dispatchEvent(new MouseEvent('mousedown', init)); el.dispatchEvent(new MouseEvent('mouseup', init)); el.dispatchEvent(new MouseEvent('click', init)); }
        if (count === 2) el.dispatchEvent(new MouseEvent('dblclick', init));
        return { success: true, element: el.tagName, coordinates: [cx, cy] };
      }, [x, y, button, clickCount, modifiers]);
    }
    return { success: false, error: 'Must provide ref or coordinate' };
  },

  async type({ text, ref, delay = 0, clear = false }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (txt, refId, clr) => {
      let el = refId ? window.__getElementByRef?.(refId) : document.activeElement;
      if (!el) return { success: false, error: refId ? `Element ${refId} not found` : 'No active element' };
      el.focus();
      if (clr && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.value = '';
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') { el.value += txt; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (el.isContentEditable) document.execCommand('insertText', false, txt);
      else return { success: false, error: 'Element is not editable' };
      return { success: true };
    }, [text, ref, clear]);
  },

  async fill({ ref, value }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, val) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };
      el.focus();
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { success: true }; }
      return { success: false, error: 'Element is not an input' };
    }, [ref, value]);
  },

  async select({ ref, value }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, val) => {
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
    return await exec(tabId, (refId, chk) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };
      if (el.type !== 'checkbox' && el.type !== 'radio') return { success: false, error: 'Not a checkbox or radio' };
      if (el.checked !== chk) el.click();
      return { success: true, checked: el.checked };
    }, [ref, checked]);
  },

  async focus({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; el.focus(); return { success: true }; }, [ref]);
  },

  async blur({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId) => { const el = refId ? window.__getElementByRef?.(refId) : document.activeElement; if (el) el.blur(); return { success: true }; }, [ref]);
  },

  async hover({ ref, coordinate }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, coord) => {
      let el, x, y;
      if (refId) { el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; const rect = el.getBoundingClientRect(); x = rect.left + rect.width / 2; y = rect.top + rect.height / 2; }
      else if (coord) { [x, y] = coord; el = document.elementFromPoint(x, y); }
      else return { success: false, error: 'Must provide ref or coordinate' };
      if (el) { el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: x, clientY: y })); el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y })); el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y })); }
      return { success: true, coordinates: [x, y] };
    }, [ref, coordinate]);
  },

  async set_attribute({ ref, name, value }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, n, v) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; el.setAttribute(n, v); return { success: true }; }, [ref, name, value]);
  },

  async remove_attribute({ ref, name }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, n) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; el.removeAttribute(n); return { success: true }; }, [ref, name]);
  },

  async set_style({ ref, property, value }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, p, v) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; el.style[p] = v; return { success: true }; }, [ref, property, value]);
  },

  // ============ DOM MANIPULATION ============
  async remove_element({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; el.remove(); return { success: true }; }, [ref]);
  },

  async hide_element({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; el.style.display = 'none'; return { success: true }; }, [ref]);
  },

  async show_element({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; el.style.display = ''; return { success: true }; }, [ref]);
  },

  async highlight_element({ ref, color = 'red', duration = 2000 }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, c, d) => {
      const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` };
      const orig = el.style.outline;
      el.style.outline = `3px solid ${c}`;
      setTimeout(() => el.style.outline = orig, d);
      return { success: true };
    }, [ref, color, duration]);
  },

  async insert_html({ ref, position, html }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, pos, h) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; el.insertAdjacentHTML(pos, h); return { success: true }; }, [ref, position, html]);
  },

  // ============ KEYBOARD ============
  async press({ key, modifiers = {} }, tabId) {
    return await exec(tabId, (k, mods) => {
      const init = { key: k, code: k, bubbles: true, cancelable: true, ctrlKey: mods.ctrl, shiftKey: mods.shift, altKey: mods.alt, metaKey: mods.meta };
      const el = document.activeElement || document.body;
      el.dispatchEvent(new KeyboardEvent('keydown', init));
      el.dispatchEvent(new KeyboardEvent('keypress', init));
      el.dispatchEvent(new KeyboardEvent('keyup', init));
      return { success: true, key: k };
    }, [key, modifiers]);
  },

  async keyboard({ action, key, text }, tabId) {
    return await exec(tabId, (act, k, txt) => {
      const el = document.activeElement || document.body;
      const init = { key: k, code: k, bubbles: true, cancelable: true };
      if (act === 'down') el.dispatchEvent(new KeyboardEvent('keydown', init));
      else if (act === 'up') el.dispatchEvent(new KeyboardEvent('keyup', init));
      else if (act === 'press') { el.dispatchEvent(new KeyboardEvent('keydown', init)); el.dispatchEvent(new KeyboardEvent('keyup', init)); }
      else if (act === 'type' && txt) { for (const c of txt) { el.dispatchEvent(new KeyboardEvent('keydown', { key: c, bubbles: true })); el.dispatchEvent(new KeyboardEvent('keypress', { key: c, bubbles: true })); el.dispatchEvent(new KeyboardEvent('keyup', { key: c, bubbles: true })); } }
      return { success: true };
    }, [action, key, text]);
  },

  // ============ MOUSE ============
  async mouse({ action, x, y, button = 'left' }, tabId) {
    return await exec(tabId, (act, mx, my, btn) => {
      const el = document.elementFromPoint(mx, my) || document.body;
      const init = { clientX: mx, clientY: my, button: btn === 'right' ? 2 : btn === 'middle' ? 1 : 0, bubbles: true, cancelable: true };
      if (act === 'move') el.dispatchEvent(new MouseEvent('mousemove', init));
      else if (act === 'down') el.dispatchEvent(new MouseEvent('mousedown', init));
      else if (act === 'up') el.dispatchEvent(new MouseEvent('mouseup', init));
      else if (act === 'click') el.dispatchEvent(new MouseEvent('click', init));
      return { success: true };
    }, [action, x, y, button]);
  },

  async drag({ from, to }, tabId) {
    return await exec(tabId, (f, t) => {
      const startEl = document.elementFromPoint(f[0], f[1]);
      const endEl = document.elementFromPoint(t[0], t[1]);
      if (startEl) { startEl.dispatchEvent(new MouseEvent('mousedown', { clientX: f[0], clientY: f[1], bubbles: true })); startEl.dispatchEvent(new DragEvent('dragstart', { clientX: f[0], clientY: f[1], bubbles: true })); }
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: t[0], clientY: t[1], bubbles: true }));
      if (endEl) { endEl.dispatchEvent(new DragEvent('dragover', { clientX: t[0], clientY: t[1], bubbles: true })); endEl.dispatchEvent(new DragEvent('drop', { clientX: t[0], clientY: t[1], bubbles: true })); endEl.dispatchEvent(new MouseEvent('mouseup', { clientX: t[0], clientY: t[1], bubbles: true })); }
      return { success: true, from: f, to: t };
    }, [from, to]);
  },

  // ============ SCROLLING ============
  async scroll({ direction, amount = 300, ref }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (dir, amt, refId) => {
      if (refId) { const el = window.__getElementByRef?.(refId); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return { success: true, scrolledTo: refId }; }
      const map = { up: [0, -amt], down: [0, amt], left: [-amt, 0], right: [amt, 0] };
      const [x, y] = map[dir] || [0, 0];
      window.scrollBy({ left: x, top: y, behavior: 'smooth' });
      return { success: true, scrollX: window.scrollX, scrollY: window.scrollY };
    }, [direction, amount, ref]);
  },

  async scroll_to({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return { success: true }; }, [ref]);
  },

  async scroll_to_bottom({}, tabId) {
    return await exec(tabId, () => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); return { success: true, scrollY: document.documentElement.scrollHeight }; });
  },

  async scroll_to_top({}, tabId) {
    return await exec(tabId, () => { window.scrollTo({ top: 0, behavior: 'smooth' }); return { success: true, scrollY: 0 }; });
  },

  async infinite_scroll({ maxScrolls = 50, delay = 1000, threshold = 100 }, tabId) {
    let scrolls = 0, lastHeight = 0;
    while (scrolls < maxScrolls) {
      const info = await exec(tabId, () => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        return { scrollHeight: document.documentElement.scrollHeight, scrollY: window.scrollY };
      });
      if (Math.abs(info.scrollHeight - lastHeight) < threshold) break;
      lastHeight = info.scrollHeight;
      scrolls++;
      await new Promise(r => setTimeout(r, delay));
    }
    return { success: true, scrolls, finalHeight: lastHeight };
  },

  // ============ TABS ============
  async get_tabs() {
    const tabs = await chrome.tabs.query({});
    return { success: true, tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active, windowId: t.windowId })) };
  },

  async create_tab({ url, active = true }) {
    const tab = await chrome.tabs.create({ url: url || 'about:blank', active });
    return { success: true, tabId: tab.id };
  },

  async close_tab({ tabId }) {
    const id = tabId || (await getActiveTab())?.id;
    if (id) await chrome.tabs.remove(id);
    return { success: true };
  },

  async switch_tab({ tabId }) {
    await chrome.tabs.update(tabId, { active: true });
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    return { success: true };
  },

  async duplicate_tab({ tabId }) {
    const id = tabId || (await getActiveTab())?.id;
    const newTab = await chrome.tabs.duplicate(id);
    return { success: true, tabId: newTab.id };
  },

  // ============ WINDOWS ============
  async get_windows() {
    const windows = await chrome.windows.getAll({ populate: true });
    return { success: true, windows: windows.map(w => ({ id: w.id, state: w.state, type: w.type, bounds: { left: w.left, top: w.top, width: w.width, height: w.height }, tabCount: w.tabs?.length })) };
  },

  async create_window({ url, type = 'normal', width, height }) {
    const opts = { type, url: url || 'about:blank' };
    if (width) opts.width = width;
    if (height) opts.height = height;
    const win = await chrome.windows.create(opts);
    return { success: true, windowId: win.id };
  },

  async close_window({ windowId }) {
    const id = windowId || (await getWindow())?.id;
    if (id) await chrome.windows.remove(id);
    return { success: true };
  },

  async resize_window({ width, height, windowId }) {
    const id = windowId || (await getWindow())?.id;
    await chrome.windows.update(id, { width, height });
    return { success: true };
  },

  async move_window({ x, y, windowId }) {
    const id = windowId || (await getWindow())?.id;
    await chrome.windows.update(id, { left: x, top: y });
    return { success: true };
  },

  async maximize_window({ windowId }) {
    const id = windowId || (await getWindow())?.id;
    await chrome.windows.update(id, { state: 'maximized' });
    return { success: true };
  },

  async minimize_window({ windowId }) {
    const id = windowId || (await getWindow())?.id;
    await chrome.windows.update(id, { state: 'minimized' });
    return { success: true };
  },

  async fullscreen_window({ windowId }) {
    const id = windowId || (await getWindow())?.id;
    await chrome.windows.update(id, { state: 'fullscreen' });
    return { success: true };
  },

  // ============ WAIT ============
  async wait({ ms }) {
    await new Promise(r => setTimeout(r, ms));
    return { success: true, waited: ms };
  },

  async wait_for({ selector, ref, state = 'visible', timeout = 5000 }, tabId) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = await exec(tabId, (refId, sel, st) => {
        let el = refId ? window.__getElementByRef?.(refId) : sel ? document.querySelector(sel) : null;
        if (!el) return { found: st === 'hidden' };
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
      const timer = setTimeout(() => { chrome.webNavigation.onCompleted.removeListener(listener); resolve({ success: false, error: 'Navigation timeout' }); }, timeout);
      const listener = (details) => { if (details.tabId === tabId && details.frameId === 0) { clearTimeout(timer); chrome.webNavigation.onCompleted.removeListener(listener); resolve({ success: true, url: details.url }); } };
      chrome.webNavigation.onCompleted.addListener(listener);
    });
  },

  async wait_for_network_idle({ timeout = 30000, idleTime = 500 }, tabId) {
    // Simplified: just wait for idleTime
    await new Promise(r => setTimeout(r, idleTime));
    return { success: true };
  },

  async poll_until({ code, timeout = 10000, interval = 100 }, tabId) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = await exec(tabId, (c) => { try { return { value: eval(c) }; } catch (e) { return { error: e.message }; } }, [code]);
      if (result?.value) return { success: true, elapsed: Date.now() - start, value: result.value };
      if (result?.error) return { success: false, error: result.error };
      await new Promise(r => setTimeout(r, interval));
    }
    return { success: false, error: `Timeout polling (${timeout}ms)` };
  },

  // ============ EXECUTE SCRIPT ============
  async execute_script({ code, args = [] }, tabId) {
    try {
      const result = await exec(tabId, (c, a) => { try { const fn = new Function(...a.map((_, i) => `arg${i}`), c); return { success: true, result: fn(...a) }; } catch (e) { return { success: false, error: e.message }; } }, [code, args]);
      return result;
    } catch (e) { return { success: false, error: e.message }; }
  },

  async evaluate({ code, args = [] }, tabId) { return tools.execute_script({ code, args }, tabId); },

  // ============ SESSION & AUTH ============
  async save_session({ name }, tabId) {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    const cookies = await chrome.cookies.getAll({ domain: url.hostname });
    const storage = await exec(tabId, () => ({
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(sessionStorage))
    }));
    return { success: true, session: { name: name || url.hostname, url: tab.url, cookies, localStorage: storage.localStorage, sessionStorage: storage.sessionStorage, timestamp: Date.now() } };
  },

  async restore_session({ session }, tabId) {
    // Restore cookies
    for (const cookie of session.cookies || []) {
      try {
        const cookieData = { url: session.url, name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path || '/', secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite };
        if (cookie.expirationDate) cookieData.expirationDate = cookie.expirationDate;
        await chrome.cookies.set(cookieData);
      } catch (e) { console.warn('[BAT] Failed to set cookie:', cookie.name, e); }
    }
    // Restore storage
    await exec(tabId, (ls, ss) => {
      for (const [k, v] of Object.entries(ls || {})) localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(ss || {})) sessionStorage.setItem(k, v);
    }, [session.localStorage, session.sessionStorage]);
    return { success: true, cookiesRestored: session.cookies?.length || 0 };
  },

  async import_cookies({ cookies, format = 'json' }, tabId) {
    let fallbackUrl = null;
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        fallbackUrl = tab.url;
      } catch (e) { /* ignore */ }
    }

    const parsedCookies = format === 'netscape' ? parseNetscapeCookies(cookies) : (typeof cookies === 'string' ? JSON.parse(cookies) : cookies);
    let imported = 0;
    let failed = 0;

    for (const cookie of parsedCookies) {
      try {
        // Build URL from cookie domain
        let url = cookie.url;
        if (!url && cookie.domain) {
          const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          url = `http${cookie.secure ? 's' : ''}://${domain}${cookie.path || '/'}`;
        }
        if (!url) url = fallbackUrl;

        if (!url) {
          failed++;
          continue;
        }

        const cookieData = {
          url,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path || '/',
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || 'lax'
        };

        if (cookie.domain) cookieData.domain = cookie.domain;
        if (cookie.expirationDate) cookieData.expirationDate = cookie.expirationDate;

        await chrome.cookies.set(cookieData);
        imported++;
      } catch (e) {
        console.warn('[BAT] Failed to import cookie:', cookie.name, e.message);
        failed++;
      }
    }
    return { success: true, imported, failed, total: parsedCookies.length };
  },

  async export_cookies({ format = 'json', domain }, tabId) {
    const query = domain ? { domain } : {};
    const cookies = await chrome.cookies.getAll(query);
    if (format === 'netscape') return { success: true, cookies: toNetscapeFormat(cookies), count: cookies.length };
    return { success: true, cookies, count: cookies.length };
  },

  // ============ COOKIES ============
  async get_cookies({ url, name }) {
    const query = {};
    if (url) query.url = url;
    if (name) query.name = name;
    const cookies = await chrome.cookies.getAll(query);
    return { success: true, cookies };
  },

  async set_cookie(args, tabId) {
    try {
      // Handle various formats:
      // - {cookie: {...}}
      // - Direct cookie object {name, value, ...}
      // - Array of cookies [{...}, {...}] - use first one
      let cookie = args;
      if (args.cookie) {
        cookie = args.cookie;
      } else if (Array.isArray(args)) {
        cookie = args[0];
      } else if (args.cookies && Array.isArray(args.cookies)) {
        cookie = args.cookies[0];
      }

      if (!cookie || typeof cookie !== 'object') {
        return { success: false, error: 'Invalid args. Received: ' + JSON.stringify(args).slice(0, 200) };
      }

      if (!cookie.name) {
        return { success: false, error: 'Cookie must have "name" field. Received keys: ' + Object.keys(cookie).join(', ') };
      }

      // Build URL from domain if not provided
      let url = cookie.url;
      if (!url && cookie.domain) {
        const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
        url = `http${cookie.secure ? 's' : ''}://${domain}${cookie.path || '/'}`;
      }
      if (!url && tabId) {
        const tab = await chrome.tabs.get(tabId);
        url = tab.url;
      }

      const cookieData = {
        url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || '/',
        secure: cookie.secure || false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'lax'
      };

      // Only set domain if provided (let Chrome infer from URL otherwise)
      if (cookie.domain) {
        cookieData.domain = cookie.domain;
      }

      // Only set expiration for persistent cookies
      if (cookie.expirationDate) {
        cookieData.expirationDate = cookie.expirationDate;
      }

      const result = await chrome.cookies.set(cookieData);
      return { success: !!result, cookie: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async delete_cookies({ url, name }) {
    if (url && name) { await chrome.cookies.remove({ url, name }); }
    else {
      const cookies = await chrome.cookies.getAll(url ? { url } : {});
      for (const c of cookies) await chrome.cookies.remove({ url: `https://${c.domain}${c.path}`, name: c.name });
    }
    return { success: true };
  },

  // ============ STORAGE ============
  async get_storage({ type, key }, tabId) {
    return await exec(tabId, (t, k) => {
      const storage = t === 'session' ? sessionStorage : localStorage;
      if (k) return { success: true, value: storage.getItem(k) };
      const items = {};
      for (let i = 0; i < storage.length; i++) { const key = storage.key(i); items[key] = storage.getItem(key); }
      return { success: true, items };
    }, [type, key]);
  },

  async set_storage({ type, key, value }, tabId) {
    return await exec(tabId, (t, k, v) => { const storage = t === 'session' ? sessionStorage : localStorage; storage.setItem(k, v); return { success: true }; }, [type, key, value]);
  },

  async clear_storage({ type }, tabId) {
    return await exec(tabId, (t) => { const storage = t === 'session' ? sessionStorage : localStorage; storage.clear(); return { success: true }; }, [type]);
  },

  // ============ PAGE INFO ============
  async get_url({}, tabId) { const tab = await chrome.tabs.get(tabId); return { success: true, url: tab.url }; },
  async get_title({}, tabId) { const tab = await chrome.tabs.get(tabId); return { success: true, title: tab.title }; },
  async get_viewport({}, tabId) { return await exec(tabId, () => ({ success: true, width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio })); },

  // ============ ELEMENT QUERIES ============
  async find({ selector }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: 'Element not found' };
      if (!window.__elementMap) window.__elementMap = {};
      if (!window.__refCounter) window.__refCounter = 0;
      const refId = `ref_${++window.__refCounter}`;
      window.__elementMap[refId] = new WeakRef(el);
      return { success: true, ref: refId, tag: el.tagName.toLowerCase() };
    }, [selector]);
  },

  async find_all({ selector, limit = 100 }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (sel, lim) => {
      const elements = Array.from(document.querySelectorAll(sel)).slice(0, lim);
      if (!window.__elementMap) window.__elementMap = {};
      if (!window.__refCounter) window.__refCounter = 0;
      const refs = elements.map(el => { const refId = `ref_${++window.__refCounter}`; window.__elementMap[refId] = new WeakRef(el); return { ref: refId, tag: el.tagName.toLowerCase() }; });
      return { success: true, elements: refs, count: refs.length };
    }, [selector, limit]);
  },

  async find_by_text({ text, exact = false }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (txt, ex) => {
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
    return await exec(tabId, (refId) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { success: true, tag: el.tagName.toLowerCase(), id: el.id || null, className: el.className || null, text: el.textContent?.substring(0, 200), value: el.value, href: el.href, src: el.src, attributes: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value])), boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' };
    }, [ref]);
  },

  async get_bounding_box({ ref }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId) => { const el = window.__getElementByRef?.(refId); if (!el) return { success: false, error: `Element ${refId} not found` }; const rect = el.getBoundingClientRect(); return { success: true, x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }, [ref]);
  },

  async count_elements({ selector }, tabId) {
    return await exec(tabId, (sel) => ({ success: true, count: document.querySelectorAll(sel).length }), [selector]);
  },

  async get_all_text({ selector }, tabId) {
    return await exec(tabId, (sel) => {
      const elements = document.querySelectorAll(sel);
      return { success: true, texts: Array.from(elements).map(el => el.textContent.trim()), count: elements.length };
    }, [selector]);
  },

  async click_all({ selector, limit = 10 }, tabId) {
    return await exec(tabId, (sel, lim) => {
      const elements = Array.from(document.querySelectorAll(sel)).slice(0, lim);
      elements.forEach(el => el.click());
      return { success: true, clicked: elements.length };
    }, [selector, limit]);
  },

  // ============ FORMS ============
  async fill_form({ fields }, tabId) {
    return await exec(tabId, (flds) => {
      let filled = 0;
      for (const [selector, value] of Object.entries(flds)) {
        const el = document.querySelector(selector);
        if (el) {
          if (el.tagName === 'SELECT') { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }
          else if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== !!value) el.click(); }
          else { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
          filled++;
        }
      }
      return { success: true, filled, total: Object.keys(flds).length };
    }, [fields]);
  },

  async submit_form({ ref, selector }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, sel) => {
      let form;
      if (refId) form = window.__getElementByRef?.(refId);
      else if (sel) form = document.querySelector(sel);
      else form = document.activeElement?.closest('form');
      if (!form || form.tagName !== 'FORM') return { success: false, error: 'Form not found' };
      form.submit();
      return { success: true };
    }, [ref, selector]);
  },

  async get_form_data({ ref, selector }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, sel) => {
      let form;
      if (refId) form = window.__getElementByRef?.(refId);
      else if (sel) form = document.querySelector(sel);
      else form = document.querySelector('form');
      if (!form || form.tagName !== 'FORM') return { success: false, error: 'Form not found' };
      const data = {};
      for (const el of form.elements) { if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value; }
      return { success: true, data };
    }, [ref, selector]);
  },

  async clear_form({ ref, selector }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, sel) => {
      let form;
      if (refId) form = window.__getElementByRef?.(refId);
      else if (sel) form = document.querySelector(sel);
      else form = document.querySelector('form');
      if (!form || form.tagName !== 'FORM') return { success: false, error: 'Form not found' };
      form.reset();
      return { success: true };
    }, [ref, selector]);
  },

  // ============ TABLES ============
  async get_table_data({ ref, selector, headers = true }, tabId) {
    await ensureContentScript(tabId);
    return await exec(tabId, (refId, sel, useHeaders) => {
      let table;
      if (refId) table = window.__getElementByRef?.(refId);
      else if (sel) table = document.querySelector(sel);
      else table = document.querySelector('table');
      if (!table || table.tagName !== 'TABLE') return { success: false, error: 'Table not found' };
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return { success: true, data: [] };
      const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map(c => c.textContent.trim());
      const data = rows.slice(useHeaders ? 1 : 0).map(row => {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.textContent.trim());
        if (useHeaders) {
          const obj = {};
          headerCells.forEach((h, i) => obj[h] = cells[i] || '');
          return obj;
        }
        return cells;
      });
      return { success: true, data, headers: useHeaders ? headerCells : null, rowCount: data.length };
    }, [ref, selector, headers]);
  },

  // ============ FRAMES ============
  async get_frames({}, tabId) {
    return await exec(tabId, () => {
      const frames = Array.from(document.querySelectorAll('iframe, frame'));
      return { success: true, frames: frames.map((f, i) => ({ index: i, name: f.name || null, id: f.id || null, src: f.src })), count: frames.length };
    });
  },

  async switch_frame({ frameId, name, selector }, tabId) {
    if (frameId !== undefined) { state.currentFrameId = frameId; return { success: true, frameId }; }
    const result = await exec(tabId, (n, sel) => {
      const frames = Array.from(document.querySelectorAll('iframe, frame'));
      let frame;
      if (n) frame = frames.find(f => f.name === n);
      else if (sel) frame = document.querySelector(sel);
      if (!frame) return { success: false, error: 'Frame not found' };
      return { success: true, index: frames.indexOf(frame) };
    }, [name, selector]);
    if (result.success) state.currentFrameId = result.index;
    return result;
  },

  async switch_to_main() {
    state.currentFrameId = 0;
    return { success: true };
  },

  // ============ FILES ============
  async set_file({ ref, filePaths }) {
    return { success: false, error: 'File input requires native file system access. Use chrome.debugger or manual interaction.' };
  },

  async download({ url, filename }) {
    const downloadId = await chrome.downloads.download({ url, filename });
    return { success: true, downloadId };
  },

  async wait_for_download({ timeout = 60000 }) {
    return new Promise(resolve => {
      const timer = setTimeout(() => { chrome.downloads.onChanged.removeListener(listener); resolve({ success: false, error: 'Download timeout' }); }, timeout);
      const listener = (delta) => {
        if (delta.state?.current === 'complete') {
          clearTimeout(timer);
          chrome.downloads.onChanged.removeListener(listener);
          chrome.downloads.search({ id: delta.id }, (items) => resolve({ success: true, download: items[0] }));
        }
      };
      chrome.downloads.onChanged.addListener(listener);
    });
  },

  // ============ DIALOGS ============
  async handle_dialog({ action, text }) {
    state.pendingDialogAction = { action, text };
    return { success: true, note: 'Dialog handler set. Will apply to next dialog.' };
  },

  async get_dialog() {
    return { success: true, pendingAction: state.pendingDialogAction };
  },

  // ============ CONSOLE & ERRORS ============
  async get_console_logs({ level = 'all', clear = false }) {
    let logs = state.consoleLogs;
    if (level !== 'all') logs = logs.filter(l => l.level === level);
    if (clear) state.consoleLogs = state.consoleLogs.filter(l => !logs.includes(l));
    return { success: true, logs, count: logs.length };
  },

  async get_page_errors({ clear = false }) {
    const errors = [...state.pageErrors];
    if (clear) state.pageErrors = [];
    return { success: true, errors, count: errors.length };
  },

  async clear_console_logs() {
    state.consoleLogs = [];
    return { success: true };
  },

  // ============ NETWORK ============
  async get_network_requests({ filter, clear = false }) {
    let requests = state.networkRequests;
    if (filter) requests = requests.filter(r => r.url.includes(filter));
    if (clear) state.networkRequests = state.networkRequests.filter(r => !requests.includes(r));
    return { success: true, requests, count: requests.length };
  },

  async clear_network_requests() {
    state.networkRequests = [];
    return { success: true };
  },

  async block_urls({ patterns }) {
    // Use declarativeNetRequest API for Manifest V3
    const rules = patterns.map((pattern, index) => ({
      id: state.blockedUrls.length + index + 1,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: pattern, resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other'] }
    }));

    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules,
        removeRuleIds: []
      });
      state.blockedUrls.push(...patterns);
      return { success: true, blocked: state.blockedUrls };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async unblock_urls({ patterns }) {
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      let removeIds = [];

      if (patterns) {
        // Remove specific patterns
        removeIds = existingRules.filter(r => patterns.some(p => r.condition.urlFilter === p)).map(r => r.id);
        state.blockedUrls = state.blockedUrls.filter(p => !patterns.includes(p));
      } else {
        // Remove all
        removeIds = existingRules.map(r => r.id);
        state.blockedUrls = [];
      }

      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [],
        removeRuleIds: removeIds
      });
      return { success: true, blocked: state.blockedUrls };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async set_request_interception({ enabled, patterns }) {
    return { success: true, note: 'Request interception requires chrome.debugger API for full control.' };
  },

  async mock_response({ pattern, response }) {
    state.mockResponses.set(pattern, response);
    return { success: true, mocked: Array.from(state.mockResponses.keys()) };
  },

  async clear_mocks() {
    state.mockResponses.clear();
    return { success: true };
  },

  async wait_for_request({ pattern, timeout = 30000 }) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const match = state.networkRequests.find(r => r.url.includes(pattern));
      if (match) return { success: true, request: match };
      await new Promise(r => setTimeout(r, 100));
    }
    return { success: false, error: `Timeout waiting for request matching "${pattern}"` };
  },

  async wait_for_response({ pattern, timeout = 30000 }) {
    return tools.wait_for_request({ pattern, timeout });
  },

  // ============ DEVICE EMULATION ============
  async set_user_agent({ userAgent }, tabId) {
    // User agent can only be set via chrome.debugger API
    return { success: false, error: 'User agent modification requires chrome.debugger API' };
  },

  async set_geolocation({ latitude, longitude, accuracy = 100 }) {
    // Geolocation override requires chrome.debugger API
    return { success: false, error: 'Geolocation override requires chrome.debugger API' };
  },

  async clear_geolocation() {
    return { success: true };
  },

  async emulate_device({ device }, tabId) {
    const preset = typeof device === 'string' ? DEVICES[device] : device;
    if (!preset) return { success: false, error: `Unknown device: ${device}. Available: ${Object.keys(DEVICES).join(', ')}` };
    return { success: false, error: 'Device emulation requires chrome.debugger API for viewport and user agent changes.' };
  },

  // ============ CLIPBOARD ============
  async get_clipboard({}, tabId) {
    return await exec(tabId, async () => {
      try { return { success: true, text: await navigator.clipboard.readText() }; }
      catch (e) { return { success: false, error: 'Clipboard access denied. Page must be focused and have permission.' }; }
    });
  },

  async set_clipboard({ text }, tabId) {
    return await exec(tabId, async (t) => {
      try { await navigator.clipboard.writeText(t); return { success: true }; }
      catch (e) { return { success: false, error: 'Clipboard access denied. Page must be focused and have permission.' }; }
    }, [text]);
  },

  // ============ BROWSER STATE ============
  async clear_cache() {
    await chrome.browsingData.removeCache({});
    return { success: true };
  },

  async clear_browsing_data({ dataTypes = ['cache', 'cookies'], since }) {
    const options = since ? { since } : {};
    const dataToRemove = {};
    if (dataTypes.includes('cache')) dataToRemove.cache = true;
    if (dataTypes.includes('cookies')) dataToRemove.cookies = true;
    if (dataTypes.includes('history')) dataToRemove.history = true;
    if (dataTypes.includes('localStorage')) dataToRemove.localStorage = true;
    await chrome.browsingData.remove(options, dataToRemove);
    return { success: true, cleared: dataTypes };
  },

  // ============ ASSERTIONS ============
  async assert_text({ selector, expected, contains = false }, tabId) {
    const result = await exec(tabId, (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; }, [selector]);
    if (result === null) return { success: false, error: 'Element not found' };
    const pass = contains ? result.includes(expected) : result === expected;
    return { success: pass, actual: result, expected, contains };
  },

  async assert_visible({ selector }, tabId) {
    const result = await exec(tabId, (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { visible: false, reason: 'not found' };
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      return { visible };
    }, [selector]);
    return { success: result.visible, visible: result.visible, reason: result.reason };
  },

  async assert_hidden({ selector }, tabId) {
    const result = await tools.assert_visible({ selector }, tabId);
    return { success: !result.visible };
  },

  async assert_url({ expected, contains = false }, tabId) {
    const tab = await chrome.tabs.get(tabId);
    const pass = contains ? tab.url.includes(expected) : tab.url === expected;
    return { success: pass, actual: tab.url, expected, contains };
  },

  async assert_title({ expected, contains = false }, tabId) {
    const tab = await chrome.tabs.get(tabId);
    const pass = contains ? tab.title.includes(expected) : tab.title === expected;
    return { success: pass, actual: tab.title, expected, contains };
  },

  async assert_element_count({ selector, count }, tabId) {
    const actual = await exec(tabId, (sel) => document.querySelectorAll(sel).length, [selector]);
    return { success: actual === count, actual, expected: count };
  },

  // ============ UTILITY ============
  async ping() { return { success: true, pong: true, timestamp: Date.now() }; },

  async get_tools() { return { success: true, tools: Object.keys(tools), count: Object.keys(tools).length }; },

  async retry({ tool, args, maxAttempts = 3, delay = 1000 }, tabId) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await tools[tool]?.(args, tabId);
      if (result?.success) return { ...result, attempt };
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, delay));
    }
    return { success: false, error: `Failed after ${maxAttempts} attempts` };
  },
};

// ============ REQUEST HANDLER ============

async function handleToolRequest(message) {
  const { id, tool, args = {}, tabId } = message;

  try {
    const handler = tools[tool];
    if (!handler) return { id, success: false, error: `Unknown tool: ${tool}` };

    let targetTabId = tabId;
    const tabRequiredTools = ['navigate', 'reload', 'screenshot', 'screenshot_element', 'screenshot_full_page', 'read_page', 'get_html', 'get_text',
      'click', 'type', 'fill', 'select', 'check', 'focus', 'blur', 'hover', 'set_attribute', 'remove_attribute', 'set_style',
      'remove_element', 'hide_element', 'show_element', 'highlight_element', 'insert_html',
      'press', 'keyboard', 'mouse', 'drag', 'scroll', 'scroll_to', 'scroll_to_bottom', 'scroll_to_top', 'infinite_scroll',
      'wait_for', 'wait_for_navigation', 'wait_for_network_idle', 'poll_until', 'execute_script', 'evaluate',
      'save_session', 'restore_session', 'import_cookies', 'export_cookies',
      'get_storage', 'set_storage', 'clear_storage', 'get_url', 'get_title', 'get_viewport',
      'find', 'find_all', 'find_by_text', 'get_element_info', 'get_bounding_box', 'count_elements', 'get_all_text', 'click_all',
      'fill_form', 'submit_form', 'get_form_data', 'clear_form', 'get_table_data', 'get_frames', 'switch_frame',
      'get_clipboard', 'set_clipboard',
      'assert_text', 'assert_visible', 'assert_hidden', 'assert_url', 'assert_title', 'assert_element_count'];

    if (!targetTabId && tabRequiredTools.includes(tool)) {
      const activeTab = await getActiveTab();
      if (!activeTab) return { id, success: false, error: 'No active tab' };
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
    const response = await fetch(`${COMMAND_SERVER_URL}/command`, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (response.status === 200) {
      const command = await response.json();
      console.log('[BAT] Command:', command.tool);
      const result = await handleToolRequest(command);
      await fetch(`${COMMAND_SERVER_URL}/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
    }
  } catch (e) { /* Server not running */ }
}

setInterval(pollForCommands, 100);

// ============ EVENT LISTENERS ============

// Capture network requests
chrome.webRequest.onCompleted.addListener((details) => {
  if (state.networkRequests.length > 1000) state.networkRequests.shift();
  state.networkRequests.push({ url: details.url, method: details.method, statusCode: details.statusCode, type: details.type, timestamp: details.timeStamp });
}, { urls: ['<all_urls>'] });

// Note: URL blocking uses declarativeNetRequest API (see block_urls/unblock_urls tools)

// Message listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.source === 'popup' || message.source === 'external') { handleToolRequest(message).then(sendResponse); return true; }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleToolRequest(message).then(sendResponse); return true;
});

console.log('[BAT] Service worker v2.0 ready, polling', COMMAND_SERVER_URL);
