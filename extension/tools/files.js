/**
 * File handling tools
 */

/**
 * Set file input (not supported without native file system access)
 */
export async function set_file({ ref, filePaths }) {
  return {
    success: false,
    error: 'File input requires native file system access. Use chrome.debugger or manual interaction.'
  };
}

/**
 * Download a file
 */
export async function download({ url, filename }) {
  const downloadId = await chrome.downloads.download({ url, filename });
  return { success: true, downloadId };
}

/**
 * Wait for a download to complete
 */
export async function wait_for_download({ timeout = 60000 }) {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      resolve({ success: false, error: 'Download timeout' });
    }, timeout);

    const listener = (delta) => {
      if (delta.state?.current === 'complete') {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(listener);
        chrome.downloads.search({ id: delta.id }, (items) => {
          resolve({ success: true, download: items[0] });
        });
      }
    };

    chrome.downloads.onChanged.addListener(listener);
  });
}
