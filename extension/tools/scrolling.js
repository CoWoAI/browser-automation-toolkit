/**
 * Scrolling tools
 */

import { ensureContentScript, exec } from '../utils/content-script.js';

/**
 * Scroll in a direction or to an element
 */
export async function scroll({ direction, amount = 300, ref }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (dir, amt, refId) => {
    if (refId) {
      const el = window.__getElementByRef?.(refId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { success: true, scrolledTo: refId };
    }
    const map = { up: [0, -amt], down: [0, amt], left: [-amt, 0], right: [amt, 0] };
    const [x, y] = map[dir] || [0, 0];
    window.scrollBy({ left: x, top: y, behavior: 'smooth' });
    return { success: true, scrollX: window.scrollX, scrollY: window.scrollY };
  }, [direction, amount, ref]);
}

/**
 * Scroll an element into view
 */
export async function scroll_to({ ref }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId) => {
    const el = window.__getElementByRef?.(refId);
    if (!el) return { success: false, error: `Element ${refId} not found` };
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { success: true };
  }, [ref]);
}

/**
 * Scroll to the bottom of the page
 */
export async function scroll_to_bottom({}, tabId) {
  return await exec(tabId, () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    return { success: true, scrollY: document.documentElement.scrollHeight };
  });
}

/**
 * Scroll to the top of the page
 */
export async function scroll_to_top({}, tabId) {
  return await exec(tabId, () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return { success: true, scrollY: 0 };
  });
}

/**
 * Infinite scroll until content stops loading
 */
export async function infinite_scroll({ maxScrolls = 50, delay = 1000, threshold = 100 }, tabId) {
  let scrolls = 0, lastHeight = 0;

  while (scrolls < maxScrolls) {
    const info = await exec(tabId, () => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      return {
        scrollHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY
      };
    });

    if (Math.abs(info.scrollHeight - lastHeight) < threshold) break;

    lastHeight = info.scrollHeight;
    scrolls++;
    await new Promise(r => setTimeout(r, delay));
  }

  return { success: true, scrolls, finalHeight: lastHeight };
}
