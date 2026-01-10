/**
 * Keyboard input tools
 */

import { exec } from '../utils/content-script.js';

/**
 * Press a key with optional modifiers
 */
export async function press({ key, modifiers = {} }, tabId) {
  return await exec(tabId, (k, mods) => {
    const init = {
      key: k, code: k,
      bubbles: true, cancelable: true,
      ctrlKey: mods.ctrl, shiftKey: mods.shift,
      altKey: mods.alt, metaKey: mods.meta
    };
    const el = document.activeElement || document.body;
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    el.dispatchEvent(new KeyboardEvent('keypress', init));
    el.dispatchEvent(new KeyboardEvent('keyup', init));
    return { success: true, key: k };
  }, [key, modifiers]);
}

/**
 * Keyboard action (down, up, press, type)
 */
export async function keyboard({ action, key, text }, tabId) {
  return await exec(tabId, (act, k, txt) => {
    const el = document.activeElement || document.body;
    const init = { key: k, code: k, bubbles: true, cancelable: true };

    if (act === 'down') {
      el.dispatchEvent(new KeyboardEvent('keydown', init));
    } else if (act === 'up') {
      el.dispatchEvent(new KeyboardEvent('keyup', init));
    } else if (act === 'press') {
      el.dispatchEvent(new KeyboardEvent('keydown', init));
      el.dispatchEvent(new KeyboardEvent('keyup', init));
    } else if (act === 'type' && txt) {
      for (const c of txt) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: c, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: c, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: c, bubbles: true }));
      }
    }
    return { success: true };
  }, [action, key, text]);
}
