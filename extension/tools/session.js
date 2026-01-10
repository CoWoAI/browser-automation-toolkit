/**
 * Session management tools (save/restore)
 */

import { exec } from '../utils/content-script.js';
import { normalizeSameSite } from '../utils/cookie-format.js';

/**
 * Save the current session (cookies + storage)
 */
export async function save_session({ name }, tabId) {
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url);
  const cookies = await chrome.cookies.getAll({ domain: url.hostname });
  const storage = await exec(tabId, () => ({
    localStorage: Object.fromEntries(Object.entries(localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(sessionStorage))
  }));

  return {
    success: true,
    session: {
      name: name || url.hostname,
      url: tab.url,
      cookies,
      localStorage: storage.localStorage,
      sessionStorage: storage.sessionStorage,
      timestamp: Date.now()
    }
  };
}

/**
 * Restore a saved session
 */
export async function restore_session({ session }, tabId) {
  // Restore cookies
  for (const cookie of session.cookies || []) {
    try {
      let sameSite = normalizeSameSite(cookie.sameSite);

      // SameSite=None (no_restriction) requires Secure=true and https URL
      let secure = cookie.secure || false;
      let url = session.url;
      if (sameSite === 'no_restriction') {
        secure = true;
        if (url && url.startsWith('http://')) {
          url = url.replace('http://', 'https://');
        }
      }

      const cookieData = {
        url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || '/',
        secure,
        httpOnly: cookie.httpOnly,
        sameSite
      };

      // Handle special cookie prefixes
      if (cookie.name.startsWith('__Host-')) {
        cookieData.secure = true;
        cookieData.path = '/';
      } else if (cookie.name.startsWith('__Secure-')) {
        cookieData.secure = true;
        if (cookie.domain && cookie.domain.startsWith('.')) {
          cookieData.domain = cookie.domain;
        }
      } else if (cookie.domain) {
        // Only set domain for domain-scoped cookies (leading dot)
        if (cookie.domain.startsWith('.')) {
          cookieData.domain = cookie.domain;
        }
      }

      if (cookie.expirationDate) cookieData.expirationDate = cookie.expirationDate;
      await chrome.cookies.set(cookieData);
    } catch (e) {
      console.warn('[BAT] Failed to set cookie:', cookie.name, e);
    }
  }

  // Restore storage
  await exec(tabId, (ls, ss) => {
    for (const [k, v] of Object.entries(ls || {})) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(ss || {})) sessionStorage.setItem(k, v);
  }, [session.localStorage, session.sessionStorage]);

  return { success: true, cookiesRestored: session.cookies?.length || 0 };
}
