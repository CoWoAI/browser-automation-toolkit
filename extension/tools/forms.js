/**
 * Form handling tools
 */

import { ensureContentScript, exec } from '../utils/content-script.js';

/**
 * Fill multiple form fields
 */
export async function fill_form({ fields }, tabId) {
  return await exec(tabId, (flds) => {
    let filled = 0;
    for (const [selector, value] of Object.entries(flds)) {
      const el = document.querySelector(selector);
      if (el) {
        if (el.tagName === 'SELECT') {
          el.value = value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.type === 'checkbox' || el.type === 'radio') {
          if (el.checked !== !!value) el.click();
        } else {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        filled++;
      }
    }
    return { success: true, filled, total: Object.keys(flds).length };
  }, [fields]);
}

/**
 * Submit a form
 */
export async function submit_form({ ref, selector }, tabId) {
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
}

/**
 * Get form data as key-value pairs
 */
export async function get_form_data({ ref, selector }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, sel) => {
    let form;
    if (refId) form = window.__getElementByRef?.(refId);
    else if (sel) form = document.querySelector(sel);
    else form = document.querySelector('form');
    if (!form || form.tagName !== 'FORM') return { success: false, error: 'Form not found' };
    const data = {};
    for (const el of form.elements) {
      if (el.name) {
        data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      }
    }
    return { success: true, data };
  }, [ref, selector]);
}

/**
 * Reset/clear a form
 */
export async function clear_form({ ref, selector }, tabId) {
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
}
