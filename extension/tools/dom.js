/**
 * DOM manipulation tools - remove, hide, show, highlight, insert
 */

import { ensureContentScript, exec } from '../utils/content-script.js';

/**
 * Remove an element from the DOM
 */
export async function remove_element({ ref }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    el.remove();
    return { success: true };
  }, [ref]);
}

/**
 * Hide an element (display: none)
 */
export async function hide_element({ ref }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    el.style.display = 'none';
    return { success: true };
  }, [ref]);
}

/**
 * Show a hidden element (reset display)
 */
export async function show_element({ ref }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    el.style.display = '';
    return { success: true };
  }, [ref]);
}

/**
 * Highlight an element with a colored outline
 */
export async function highlight_element({ ref, color = 'red', duration = 2000 }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, c, d) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    const orig = el.style.outline;
    el.style.outline = `3px solid ${c}`;
    setTimeout(() => el.style.outline = orig, d);
    return { success: true };
  }, [ref, color, duration]);
}

/**
 * Insert HTML adjacent to an element
 */
export async function insert_html({ ref, position, html }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, pos, h) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    el.insertAdjacentHTML(pos, h);
    return { success: true };
  }, [ref, position, html]);
}
