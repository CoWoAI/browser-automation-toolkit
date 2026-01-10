/**
 * Device emulation tools
 */

import { DEVICES } from '../state/index.js';

/**
 * Set user agent (requires debugger API)
 */
export async function set_user_agent({ userAgent }, tabId) {
  return {
    success: false,
    error: 'User agent modification requires chrome.debugger API'
  };
}

/**
 * Set geolocation (requires debugger API)
 */
export async function set_geolocation({ latitude, longitude, accuracy = 100 }) {
  return {
    success: false,
    error: 'Geolocation override requires chrome.debugger API'
  };
}

/**
 * Clear geolocation override
 */
export async function clear_geolocation() {
  return { success: true };
}

/**
 * Emulate a device (requires debugger API for full emulation)
 */
export async function emulate_device({ device }, tabId) {
  const preset = typeof device === 'string' ? DEVICES[device] : device;
  if (!preset) {
    return {
      success: false,
      error: `Unknown device: ${device}. Available: ${Object.keys(DEVICES).join(', ')}`
    };
  }
  return {
    success: false,
    error: 'Device emulation requires chrome.debugger API for viewport and user agent changes.'
  };
}
