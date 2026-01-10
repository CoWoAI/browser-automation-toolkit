/**
 * Element query tools
 */

import { ensureContentScript, exec } from '../utils/content-script.js';

/**
 * Find an element by CSS selector
 */
export async function find({ selector }, tabId) {
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
}

/**
 * Find all elements matching a selector
 */
export async function find_all({ selector, limit = 100 }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (sel, lim) => {
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
}

/**
 * Find an element by text content
 */
export async function find_by_text({ text, exact = false }, tabId) {
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
}

/**
 * Get detailed information about an element
 */
export async function get_element_info({ ref }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId) => {
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
}

/**
 * Get element bounding box
 */
export async function get_bounding_box({ ref }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    const rect = el.getBoundingClientRect();
    return { success: true, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, [ref]);
}

/**
 * Count elements matching a selector
 */
export async function count_elements({ selector }, tabId) {
  return await exec(tabId, (sel) => ({
    success: true,
    count: document.querySelectorAll(sel).length
  }), [selector]);
}

/**
 * Get text content of all elements matching a selector
 */
export async function get_all_text({ selector }, tabId) {
  return await exec(tabId, (sel) => {
    const elements = document.querySelectorAll(sel);
    return {
      success: true,
      texts: Array.from(elements).map(el => el.textContent.trim()),
      count: elements.length
    };
  }, [selector]);
}

/**
 * Click all elements matching a selector
 */
export async function click_all({ selector, limit = 10 }, tabId) {
  return await exec(tabId, (sel, lim) => {
    const elements = Array.from(document.querySelectorAll(sel)).slice(0, lim);
    elements.forEach(el => el.click());
    return { success: true, clicked: elements.length };
  }, [selector, limit]);
}
