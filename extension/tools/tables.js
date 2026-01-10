/**
 * Table data extraction tools
 */

import { ensureContentScript, exec } from '../utils/content-script.js';

/**
 * Get data from a table element
 */
export async function get_table_data({ ref, selector, headers = true }, tabId) {
  await ensureContentScript(tabId);
  return await exec(tabId, (refId, sel, useHeaders) => {
    let table;
    if (refId) table = window.__getElementByRef?.(refId);
    else if (sel) table = document.querySelector(sel);
    else table = document.querySelector('table');

    if (!table || table.tagName !== 'TABLE') {
      return { success: false, error: 'Table not found' };
    }

    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) {
      return { success: true, data: [] };
    }

    const headerCells = Array.from(rows[0].querySelectorAll('th, td'))
      .map(c => c.textContent.trim());

    const data = rows.slice(useHeaders ? 1 : 0).map(row => {
      const cells = Array.from(row.querySelectorAll('td, th'))
        .map(c => c.textContent.trim());

      if (useHeaders) {
        const obj = {};
        headerCells.forEach((h, i) => obj[h] = cells[i] || '');
        return obj;
      }
      return cells;
    });

    return {
      success: true,
      data,
      headers: useHeaders ? headerCells : null,
      rowCount: data.length
    };
  }, [ref, selector, headers]);
}
