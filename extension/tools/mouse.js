/**
 * Mouse input tools
 */

import { exec } from '../utils/content-script.js';

/**
 * Mouse action (move, down, up, click)
 */
export async function mouse({ action, x, y, button = 'left' }, tabId) {
  return await exec(tabId, (act, mx, my, btn) => {
    const el = document.elementFromPoint(mx, my) || document.body;
    const init = {
      clientX: mx, clientY: my,
      button: btn === 'right' ? 2 : btn === 'middle' ? 1 : 0,
      bubbles: true, cancelable: true
    };

    if (act === 'move') {
      el.dispatchEvent(new MouseEvent('mousemove', init));
    } else if (act === 'down') {
      el.dispatchEvent(new MouseEvent('mousedown', init));
    } else if (act === 'up') {
      el.dispatchEvent(new MouseEvent('mouseup', init));
    } else if (act === 'click') {
      el.dispatchEvent(new MouseEvent('click', init));
    }
    return { success: true };
  }, [action, x, y, button]);
}

/**
 * Drag from one point to another
 */
export async function drag({ from, to }, tabId) {
  return await exec(tabId, (f, t) => {
    const startEl = document.elementFromPoint(f[0], f[1]);
    const endEl = document.elementFromPoint(t[0], t[1]);

    if (startEl) {
      startEl.dispatchEvent(new MouseEvent('mousedown', { clientX: f[0], clientY: f[1], bubbles: true }));
      startEl.dispatchEvent(new DragEvent('dragstart', { clientX: f[0], clientY: f[1], bubbles: true }));
    }

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: t[0], clientY: t[1], bubbles: true }));

    if (endEl) {
      endEl.dispatchEvent(new DragEvent('dragover', { clientX: t[0], clientY: t[1], bubbles: true }));
      endEl.dispatchEvent(new DragEvent('drop', { clientX: t[0], clientY: t[1], bubbles: true }));
      endEl.dispatchEvent(new MouseEvent('mouseup', { clientX: t[0], clientY: t[1], bubbles: true }));
    }
    return { success: true, from: f, to: t };
  }, [from, to]);
}
