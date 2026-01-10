/**
 * Cookie format conversion utilities
 */

/**
 * Parse Netscape cookie format text into cookie objects
 * @param {string} text - Netscape format cookie text
 * @returns {Array<Object>} - Array of cookie objects
 */
export function parseNetscapeCookies(text) {
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

/**
 * Convert cookie objects to Netscape format
 * @param {Array<Object>} cookies - Array of cookie objects
 * @returns {string} - Netscape format cookie text
 */
export function toNetscapeFormat(cookies) {
  return cookies.map(c =>
    `${c.domain}\t${c.httpOnly ? 'TRUE' : 'FALSE'}\t${c.path}\t${c.secure ? 'TRUE' : 'FALSE'}\t${c.expirationDate || 0}\t${c.name}\t${c.value}`
  ).join('\n');
}

/**
 * Normalize cookie sameSite value for Chrome API
 * Chrome uses 'no_restriction' instead of 'none'
 * @param {string} sameSite - Input sameSite value
 * @returns {string} - Normalized sameSite value
 */
export function normalizeSameSite(sameSite) {
  if (!sameSite || sameSite === 'unspecified') return 'lax';
  if (sameSite === 'none') return 'no_restriction';
  return sameSite;
}

/**
 * Build a URL from cookie domain and path
 * @param {Object} cookie - Cookie object
 * @returns {string|null} - URL or null if cannot build
 */
export function buildCookieUrl(cookie) {
  if (cookie.url) return cookie.url;
  if (!cookie.domain) return null;
  const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return `http${cookie.secure ? 's' : ''}://${domain}${cookie.path || '/'}`;
}
