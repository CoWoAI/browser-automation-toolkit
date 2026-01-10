/**
 * Element interaction tools - click, type, fill, select, check, focus, blur, hover
 */

import { ensureContentScript, exec } from '../utils/content-script.js';

/**
 * Click on an element by ref or coordinate
 */
export async function click({ ref, coordinate, button = 'left', clickCount = 1, modifiers = {} }, tabId) {
  await ensureContentScript(tabId);

  if (ref) {
    return await exec(tabId, (refId, btn, count, mods) => {
      const el = window.__getElementByRef?.(refId);
      if (!el) return { success: false, error: `Element ${refId} not found` };
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const init = {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y,
        button: btn === 'right' ? 2 : btn === 'middle' ? 1 : 0,
        ctrlKey: mods.ctrl, shiftKey: mods.shift, altKey: mods.alt, metaKey: mods.meta
      };
      for (let i = 0; i < count; i++) {
        el.dispatchEvent(new MouseEvent('mousedown', init));
        el.dispatchEvent(new MouseEvent('mouseup', init));
        el.dispatchEvent(new MouseEvent('click', init));
      }
      if (count === 2) el.dispatchEvent(new MouseEvent('dblclick', init));
      return { success: true, coordinates: [x, y] };
    }, [ref, button, clickCount, modifiers]);
  }

  if (coordinate) {
    const [x, y] = coordinate;
    return await exec(tabId, (cx, cy, btn, count, mods) => {
      const el = document.elementFromPoint(cx, cy);
      if (!el) return { success: false, error: 'No element at coordinates' };
      const init = {
        bubbles: true, cancelable: true, view: window,
        clientX: cx, clientY: cy,
        button: btn === 'right' ? 2 : btn === 'middle' ? 1 : 0,
        ctrlKey: mods.ctrl, shiftKey: mods.shift, altKey: mods.alt, metaKey: mods.meta
      };
      for (let i = 0; i < count; i++) {
        el.dispatchEvent(new MouseEvent('mousedown', init));
        el.dispatchEvent(new MouseEvent('mouseup', init));
        el.dispatchEvent(new MouseEvent('click', init));
      }
      if (count === 2) el.dispatchEvent(new MouseEvent('dblclick', init));
      return { success: true, element: el.tagName, coordinates: [cx, cy] };
    }, [x, y, button, clickCount, modifiers]);
  }

  return { success: false, error: 'Must provide ref or coordinate' };
}

/**
 * Type text into an element or the focused element
 */
export async function type({ text, ref, delay = 0, clear = false }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (txt, refId, clr) => {
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
}

/**
 * Fill an input element with a value (replaces existing)
 */
export async function fill({ ref, value }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, val) => {
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
}

/**
 * Select an option in a select element
 */
export async function select({ ref, value }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, val) => {
    const el = window.__getElementByRef?.(refId);
    if (!el || el.tagName !== 'SELECT') {
      return { success: false, error: 'Not a select element' };
    }
    const option = Array.from(el.options).find(o => o.value === val || o.text === val);
    if (!option) return { success: false, error: `Option "${val}" not found` };
    el.value = option.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, selected: option.value };
  }, [ref, value]);
}

/**
 * Check or uncheck a checkbox/radio
 */
export async function check({ ref, checked = true }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, chk) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    if (el.type !== 'checkbox' && el.type !== 'radio') {
      return { success: false, error: 'Not a checkbox or radio' };
    }
    if (el.checked !== chk) el.click();
    return { success: true, checked: el.checked };
  }, [ref, checked]);
}

/**
 * Focus an element
 */
export async function focus({ ref }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    el.focus();
    return { success: true };
  }, [ref]);
}

/**
 * Blur an element
 */
export async function blur({ ref }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId) => {
    const el = refId ? window.__getElementByRef?.(refId) : document.activeElement;
    if (el) el.blur();
    return { success: true };
  }, [ref]);
}

/**
 * Hover over an element
 */
export async function hover({ ref, coordinate }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, coord) => {
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
}

/**
 * Set an attribute on an element
 */
export async function set_attribute({ ref, name, value }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, n, v) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    el.setAttribute(n, v);
    return { success: true };
  }, [ref, name, value]);
}

/**
 * Remove an attribute from an element
 */
export async function remove_attribute({ ref, name }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, n) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    el.removeAttribute(n);
    return { success: true };
  }, [ref, name]);
}

/**
 * Set a style property on an element
 */
export async function set_style({ ref, property, value }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, p, v) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    el.style[p] = v;
    return { success: true };
  }, [ref, property, value]);
}
