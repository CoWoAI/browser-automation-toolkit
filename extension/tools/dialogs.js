/**
 * Dialog handling tools
 */

import { setPendingDialogAction, getPendingDialogAction } from '../state/index.js';

/**
 * Set up a handler for the next dialog
 */
export async function handle_dialog({ action, text }) {
  setPendingDialogAction({ action, text });
  return { success: true, note: 'Dialog handler set. Will apply to next dialog.' };
}

/**
 * Get the current pending dialog action
 */
export async function get_dialog() {
  return { success: true, pendingAction: getPendingDialogAction() };
}
