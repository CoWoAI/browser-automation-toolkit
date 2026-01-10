/**
 * Wait and polling tools
 */

import { exec } from '../utils/content-script.js';

/**
 * Wait for a specified duration
 */
export async function wait({ ms }) {
  await new Promise(r => setTimeout(r, ms));
  return { success: true, waited: ms };
}

/**
 * Wait for an element to match a state
 */
export async function wait_for({ selector, ref, state = 'visible', timeout = 5000 }, tabId) {
  const start = Date.now();
  // Ensure args are serializable (convert undefined to null)
  const refArg = ref || null;
  const selectorArg = selector || null;
  const stateArg = state || 'visible';

  while (Date.now() - start < timeout) {
    const result = await exec(tabId, (refId, sel, st) => {
      let el = refId ? window.__getElementByRef?.(refId) : sel ? document.querySelector(sel) : null;
      if (!el) return { found: st === 'hidden' };

      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = rect.width > 0 && rect.height > 0 &&
                      style.visibility !== 'hidden' && style.display !== 'none';

      if (st === 'attached') return { found: true };
      if (st === 'visible') return { found: visible };
      if (st === 'hidden') return { found: !visible };
      return { found: true };
    }, [refArg, selectorArg, stateArg]);

    if (result?.found) return { success: true, elapsed: Date.now() - start };
    await new Promise(r => setTimeout(r, 100));
  }

  return { success: false, error: `Timeout waiting for element (${timeout}ms)` };
}

/**
 * Wait for navigation to complete
 */
export async function wait_for_navigation({ timeout = 30000 }, tabId) {
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
}

/**
 * Wait for network to become idle
 */
export async function wait_for_network_idle({ timeout = 30000, idleTime = 500 }, tabId) {
  // Simplified: just wait for idleTime
  await new Promise(r => setTimeout(r, idleTime));
  return { success: true };
}

/**
 * Poll until a condition is true
 */
export async function poll_until({ code, timeout = 10000, interval = 100 }, tabId) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const result = await exec(tabId, (c) => {
      try {
        return { value: eval(c) };
      } catch (e) {
        return { error: e.message };
      }
    }, [code]);

    if (result?.value) return { success: true, elapsed: Date.now() - start, value: result.value };
    if (result?.error) return { success: false, error: result.error };
    await new Promise(r => setTimeout(r, interval));
  }

  return { success: false, error: `Timeout polling (${timeout}ms)` };
}
