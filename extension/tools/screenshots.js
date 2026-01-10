/**
 * Screenshot and page content tools
 */

import { ensureContentScript, exec } from '../utils/content-script.js';

/**
 * Take a screenshot of the visible viewport
 */
export async function screenshot({ fullPage = false, quality = 90, format = 'png' }, tabId) {
  const tab = await chrome.tabs.get(tabId);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format,
    quality: format === 'jpeg' ? quality : undefined
  });
  const viewport = await exec(tabId, () => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));
  return { image: dataUrl, viewport };
}

/**
 * Take a screenshot of a specific element
 */
export async function screenshot_element({ ref, format = 'png', quality = 90 }, tabId) {
  await ensureContentScript(tabId);
  const box = await exec(tabId, (refId) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, [ref]);

  if (!box) return { success: false, error: `Element ${ref} not found` };

  const tab = await chrome.tabs.get(tabId);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format,
    quality: format === 'jpeg' ? quality : undefined
  });
  return {
    success: true,
    image: dataUrl,
    boundingBox: box,
    note: 'Full viewport captured. Client should crop to boundingBox.'
  };
}

/**
 * Take a full page screenshot (returns viewport with page dimensions)
 */
export async function screenshot_full_page({ format = 'png', quality = 90 }, tabId) {
  const pageInfo = await exec(tabId, () => ({
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth
  }));
  const tab = await chrome.tabs.get(tabId);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format,
    quality: format === 'jpeg' ? quality : undefined
  });
  return {
    success: true,
    image: dataUrl,
    pageSize: { width: pageInfo.scrollWidth, height: pageInfo.scrollHeight },
    viewport: { width: pageInfo.viewportWidth, height: pageInfo.viewportHeight },
    note: 'Viewport screenshot. Full page stitching requires multiple captures.'
  };
}

/**
 * Generate an accessibility tree of the page
 */
export async function read_page({ filter = 'all', depth = 15, ref_id = null }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (f, d, r) => {
    return window.__generateAccessibilityTree?.(f, d, r) || { error: 'Content script not loaded' };
  }, [filter, depth, ref_id]);
}

/**
 * Get HTML content of the page or element
 */
export async function get_html({ selector, outer = true }, tabId) {
  return await exec(tabId, (sel, o) => {
    if (sel) {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: 'Element not found' };
      return { success: true, html: o ? el.outerHTML : el.innerHTML };
    }
    return { success: true, html: document.documentElement.outerHTML };
  }, [selector, outer]);
}

/**
 * Get text content of the page or element
 */
export async function get_text({ selector }, tabId) {
  return await exec(tabId, (sel) => {
    if (sel) {
      const el = document.querySelector(sel);
      if (!el) return { success: false, error: 'Element not found' };
      return { success: true, text: el.textContent };
    }
    return { success: true, text: document.body.innerText };
  }, [selector]);
}

/**
 * Save page as PDF (not supported without debugger API)
 */
export async function save_pdf({ options = {} }, tabId) {
  return {
    success: false,
    error: 'PDF generation requires debugger API. Use chrome.debugger for this feature.'
  };
}
