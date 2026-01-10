/**
 * Frame/iframe management tools
 */

import { exec } from '../utils/content-script.js';
import { state, setCurrentFrameId } from '../state/index.js';

/**
 * Get all frames on the page
 */
export async function get_frames({}, tabId) {
  return await exec(tabId, () => {
    const frames = Array.from(document.querySelectorAll('iframe, frame'));
    return {
      success: true,
      frames: frames.map((f, i) => ({
        index: i,
        name: f.name || null,
        id: f.id || null,
        src: f.src
      })),
      count: frames.length
    };
  });
}

/**
 * Switch to a frame by ID, name, or selector
 */
export async function switch_frame({ frameId, name, selector }, tabId) {
  if (frameId !== undefined) {
    setCurrentFrameId(frameId);
    return { success: true, frameId };
  }

  const result = await exec(tabId, (n, sel) => {
    const frames = Array.from(document.querySelectorAll('iframe, frame'));
    let frame;
    if (n) frame = frames.find(f => f.name === n);
    else if (sel) frame = document.querySelector(sel);
    if (!frame) return { success: false, error: 'Frame not found' };
    return { success: true, index: frames.indexOf(frame) };
  }, [name, selector]);

  if (result.success) {
    setCurrentFrameId(result.index);
  }
  return result;
}

/**
 * Switch back to the main frame
 */
export async function switch_to_main() {
  setCurrentFrameId(0);
  return { success: true };
}
