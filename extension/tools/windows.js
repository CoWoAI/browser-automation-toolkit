/**
 * Window management tools
 */

import { getWindow } from '../utils/tab-utils.js';

/**
 * Get all windows
 */
export async function get_windows() {
  const windows = await chrome.windows.getAll({ populate: true });
  return {
    success: true,
    windows: windows.map(w => ({
      id: w.id,
      state: w.state,
      type: w.type,
      bounds: { left: w.left, top: w.top, width: w.width, height: w.height },
      tabCount: w.tabs?.length
    }))
  };
}

/**
 * Create a new window
 */
export async function create_window({ url, type = 'normal', width, height }) {
  const opts = { type, url: url || 'about:blank' };
  if (width) opts.width = width;
  if (height) opts.height = height;
  const win = await chrome.windows.create(opts);
  return { success: true, windowId: win.id };
}

/**
 * Close a window
 */
export async function close_window({ windowId }) {
  const id = windowId || (await getWindow())?.id;
  if (id) await chrome.windows.remove(id);
  return { success: true };
}

/**
 * Resize a window
 */
export async function resize_window({ width, height, windowId }) {
  const id = windowId || (await getWindow())?.id;
  await chrome.windows.update(id, { width, height });
  return { success: true };
}

/**
 * Move a window
 */
export async function move_window({ x, y, windowId }) {
  const id = windowId || (await getWindow())?.id;
  await chrome.windows.update(id, { left: x, top: y });
  return { success: true };
}

/**
 * Maximize a window
 */
export async function maximize_window({ windowId }) {
  const id = windowId || (await getWindow())?.id;
  await chrome.windows.update(id, { state: 'maximized' });
  return { success: true };
}

/**
 * Minimize a window
 */
export async function minimize_window({ windowId }) {
  const id = windowId || (await getWindow())?.id;
  await chrome.windows.update(id, { state: 'minimized' });
  return { success: true };
}

/**
 * Fullscreen a window
 */
export async function fullscreen_window({ windowId }) {
  const id = windowId || (await getWindow())?.id;
  await chrome.windows.update(id, { state: 'fullscreen' });
  return { success: true };
}
