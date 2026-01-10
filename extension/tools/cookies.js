/**
 * Cookie management tools
 */

import { parseNetscapeCookies, toNetscapeFormat, normalizeSameSite, buildCookieUrl } from '../utils/cookie-format.js';

/**
 * Import cookies from JSON or Netscape format
 */
export async function import_cookies({ cookies, format = 'json' }, tabId) {
  let fallbackUrl = null;
  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      fallbackUrl = tab.url;
    } catch (e) { /* ignore */ }
  }

  // Parse cookies - handle various input formats
  let parsedCookies;
  if (format === 'netscape') {
    parsedCookies = parseNetscapeCookies(cookies);
  } else if (typeof cookies === 'string') {
    const parsed = JSON.parse(cookies);
    parsedCookies = Array.isArray(parsed) ? parsed : (parsed.cookies || [parsed]);
  } else if (Array.isArray(cookies)) {
    parsedCookies = cookies;
  } else if (cookies && cookies.cookies) {
    parsedCookies = cookies.cookies;
  } else if (cookies) {
    parsedCookies = [cookies];
  } else {
    return { success: false, error: 'No cookies provided' };
  }

  let imported = 0;
  let failed = 0;
  const errors = [];

  for (const cookie of parsedCookies) {
    try {
      let url = buildCookieUrl(cookie);
      if (!url) url = fallbackUrl;
      if (!url) {
        failed++;
        errors.push({ name: cookie.name, error: 'No URL available' });
        continue;
      }

      let sameSite = normalizeSameSite(cookie.sameSite);

      // SameSite=None (no_restriction) requires Secure=true
      let secure = cookie.secure || false;
      if (sameSite === 'no_restriction') {
        secure = true;
        if (url.startsWith('http://')) {
          url = url.replace('http://', 'https://');
        }
      }

      const cookieData = {
        url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || '/',
        secure,
        httpOnly: cookie.httpOnly || false,
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
        if (cookie.domain.startsWith('.')) {
          cookieData.domain = cookie.domain;
        }
      }

      if (cookie.expirationDate) cookieData.expirationDate = cookie.expirationDate;

      await chrome.cookies.set(cookieData);
      imported++;
    } catch (e) {
      console.warn('[BAT] Failed to import cookie:', cookie.name, e.message);
      errors.push({ name: cookie.name, error: e.message });
      failed++;
    }
  }

  const debug = {
    receivedType: typeof cookies,
    isArray: Array.isArray(cookies),
    hasCookiesProp: !!(cookies && cookies.cookies),
    parsedCount: parsedCookies?.length || 0,
    sampleCookie: parsedCookies?.[0] ? {
      name: parsedCookies[0].name,
      hasUrl: !!parsedCookies[0].url,
      hasDomain: !!parsedCookies[0].domain
    } : null
  };

  return { success: true, imported, failed, total: parsedCookies.length, errors: errors.slice(0, 10), debug };
}

/**
 * Export cookies in JSON or Netscape format
 */
export async function export_cookies({ format = 'json', domain }, tabId) {
  const query = domain ? { domain } : {};
  const cookies = await chrome.cookies.getAll(query);

  // Add URL field to each cookie for easy import
  const enrichedCookies = cookies.map(cookie => {
    const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
    const url = `http${cookie.secure ? 's' : ''}://${cookieDomain}${cookie.path || '/'}`;
    return { ...cookie, url };
  });

  if (format === 'netscape') {
    return { success: true, cookies: toNetscapeFormat(cookies), count: cookies.length };
  }
  return { success: true, cookies: enrichedCookies, count: enrichedCookies.length };
}

/**
 * Get cookies matching a query
 */
export async function get_cookies({ url, name }) {
  const query = {};
  if (url) query.url = url;
  if (name) query.name = name;
  const cookies = await chrome.cookies.getAll(query);
  return { success: true, cookies };
}

/**
 * Set a single cookie
 */
export async function set_cookie(args, tabId) {
  try {
    // Handle various formats
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

    let url = buildCookieUrl(cookie);
    if (!url && tabId) {
      const tab = await chrome.tabs.get(tabId);
      url = tab.url;
    }

    let sameSite = normalizeSameSite(cookie.sameSite);

    // SameSite=None (no_restriction) requires Secure=true and https URL
    let secure = cookie.secure || false;
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
      httpOnly: cookie.httpOnly || false,
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
      if (cookie.domain.startsWith('.')) {
        cookieData.domain = cookie.domain;
      }
    }

    if (cookie.expirationDate) {
      cookieData.expirationDate = cookie.expirationDate;
    }

    const result = await chrome.cookies.set(cookieData);
    return { success: !!result, cookie: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Delete cookies
 */
export async function delete_cookies({ url, name }) {
  if (url && name) {
    await chrome.cookies.remove({ url, name });
  } else {
    const cookies = await chrome.cookies.getAll(url ? { url } : {});
    for (const c of cookies) {
      await chrome.cookies.remove({ url: `https://${c.domain}${c.path}`, name: c.name });
    }
  }
  return { success: true };
}
