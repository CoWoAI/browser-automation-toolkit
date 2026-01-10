/**
 * Tool registry - aggregates all tool categories
 */

// Navigation
import { navigate, reload } from './navigation.js';

// Screenshots & Page Content
import {
  screenshot, screenshot_element, screenshot_full_page,
  read_page, get_html, get_text, save_pdf
} from './screenshots.js';

// Element Interaction
import {
  click, type, fill, select, check, focus, blur, hover,
  set_attribute, remove_attribute, set_style
} from './interaction.js';

// DOM Manipulation
import {
  remove_element, hide_element, show_element,
  highlight_element, insert_html
} from './dom.js';

// Keyboard
import { press, keyboard } from './keyboard.js';

// Mouse
import { mouse, drag } from './mouse.js';

// Scrolling
import {
  scroll, scroll_to, scroll_to_bottom, scroll_to_top, infinite_scroll
} from './scrolling.js';

// Tabs
import {
  get_tabs, create_tab, close_tab, switch_tab, duplicate_tab
} from './tabs.js';

// Windows
import {
  get_windows, create_window, close_window, resize_window,
  move_window, maximize_window, minimize_window, fullscreen_window
} from './windows.js';

// Wait & Polling
import {
  wait, wait_for, wait_for_navigation, wait_for_network_idle, poll_until
} from './wait.js';

// Script Execution
import { execute_script, evaluate } from './scripts.js';

// Session Management
import { save_session, restore_session } from './session.js';

// Cookies
import {
  import_cookies, export_cookies, get_cookies, set_cookie, delete_cookies
} from './cookies.js';

// Storage
import { get_storage, set_storage, clear_storage } from './storage.js';

// Page Info
import { get_url, get_title, get_viewport } from './page-info.js';

// Element Queries
import {
  find, find_all, find_by_text, get_element_info,
  get_bounding_box, count_elements, get_all_text, click_all
} from './queries.js';

// Forms
import { fill_form, submit_form, get_form_data, clear_form } from './forms.js';

// Tables
import { get_table_data } from './tables.js';

// Frames
import { get_frames, switch_frame, switch_to_main } from './frames.js';

// Files
import { set_file, download, wait_for_download } from './files.js';

// Dialogs
import { handle_dialog, get_dialog } from './dialogs.js';

// Console & Errors
import { get_console_logs, get_page_errors, clear_console_logs } from './console.js';

// Network
import {
  get_network_requests, clear_network_requests,
  block_urls, unblock_urls, set_request_interception,
  mock_response, clear_mocks, wait_for_request, wait_for_response
} from './network.js';

// Device Emulation
import {
  set_user_agent, set_geolocation, clear_geolocation, emulate_device
} from './device.js';

// Clipboard
import { get_clipboard, set_clipboard } from './clipboard.js';

// Browser State
import { clear_cache, clear_browsing_data } from './browser.js';

// Assertions
import {
  assert_text, assert_visible, assert_hidden,
  assert_url, assert_title, assert_element_count
} from './assertions.js';

// Utility
import { ping, get_tools, retry, setToolsRegistry } from './utility.js';

/**
 * All available tools
 */
export const tools = {
  // Navigation
  navigate,
  reload,

  // Screenshots & Page Content
  screenshot,
  screenshot_element,
  screenshot_full_page,
  read_page,
  get_html,
  get_text,
  save_pdf,

  // Element Interaction
  click,
  type,
  fill,
  select,
  check,
  focus,
  blur,
  hover,
  set_attribute,
  remove_attribute,
  set_style,

  // DOM Manipulation
  remove_element,
  hide_element,
  show_element,
  highlight_element,
  insert_html,

  // Keyboard
  press,
  keyboard,

  // Mouse
  mouse,
  drag,

  // Scrolling
  scroll,
  scroll_to,
  scroll_to_bottom,
  scroll_to_top,
  infinite_scroll,

  // Tabs
  get_tabs,
  create_tab,
  close_tab,
  switch_tab,
  duplicate_tab,

  // Windows
  get_windows,
  create_window,
  close_window,
  resize_window,
  move_window,
  maximize_window,
  minimize_window,
  fullscreen_window,

  // Wait & Polling
  wait,
  wait_for,
  wait_for_navigation,
  wait_for_network_idle,
  poll_until,

  // Script Execution
  execute_script,
  evaluate,

  // Session Management
  save_session,
  restore_session,

  // Cookies
  import_cookies,
  export_cookies,
  get_cookies,
  set_cookie,
  delete_cookies,

  // Storage
  get_storage,
  set_storage,
  clear_storage,

  // Page Info
  get_url,
  get_title,
  get_viewport,

  // Element Queries
  find,
  find_all,
  find_by_text,
  get_element_info,
  get_bounding_box,
  count_elements,
  get_all_text,
  click_all,

  // Forms
  fill_form,
  submit_form,
  get_form_data,
  clear_form,

  // Tables
  get_table_data,

  // Frames
  get_frames,
  switch_frame,
  switch_to_main,

  // Files
  set_file,
  download,
  wait_for_download,

  // Dialogs
  handle_dialog,
  get_dialog,

  // Console & Errors
  get_console_logs,
  get_page_errors,
  clear_console_logs,

  // Network
  get_network_requests,
  clear_network_requests,
  block_urls,
  unblock_urls,
  set_request_interception,
  mock_response,
  clear_mocks,
  wait_for_request,
  wait_for_response,

  // Device Emulation
  set_user_agent,
  set_geolocation,
  clear_geolocation,
  emulate_device,

  // Clipboard
  get_clipboard,
  set_clipboard,

  // Browser State
  clear_cache,
  clear_browsing_data,

  // Assertions
  assert_text,
  assert_visible,
  assert_hidden,
  assert_url,
  assert_title,
  assert_element_count,

  // Utility
  ping,
  get_tools,
  retry,
};

// Initialize the tools registry for utility functions
setToolsRegistry(tools);

/**
 * Get a tool handler by name
 * @param {string} name - Tool name
 * @returns {Function|undefined} - Tool handler
 */
export function getTool(name) {
  return tools[name];
}

/**
 * List all available tool names
 * @returns {string[]} - Array of tool names
 */
export function listTools() {
  return Object.keys(tools);
}

/**
 * Check if a tool exists
 * @param {string} name - Tool name
 * @returns {boolean} - Whether the tool exists
 */
export function hasTool(name) {
  return name in tools;
}

/**
 * Tools that require an active tab
 */
export const tabRequiredTools = [
  'navigate', 'reload', 'screenshot', 'screenshot_element', 'screenshot_full_page',
  'read_page', 'get_html', 'get_text',
  'click', 'type', 'fill', 'select', 'check', 'focus', 'blur', 'hover',
  'set_attribute', 'remove_attribute', 'set_style',
  'remove_element', 'hide_element', 'show_element', 'highlight_element', 'insert_html',
  'press', 'keyboard', 'mouse', 'drag',
  'scroll', 'scroll_to', 'scroll_to_bottom', 'scroll_to_top', 'infinite_scroll',
  'wait_for', 'wait_for_navigation', 'wait_for_network_idle', 'poll_until',
  'execute_script', 'evaluate',
  'save_session', 'restore_session', 'import_cookies', 'export_cookies',
  'get_storage', 'set_storage', 'clear_storage',
  'get_url', 'get_title', 'get_viewport',
  'find', 'find_all', 'find_by_text', 'get_element_info', 'get_bounding_box',
  'count_elements', 'get_all_text', 'click_all',
  'fill_form', 'submit_form', 'get_form_data', 'clear_form',
  'get_table_data', 'get_frames', 'switch_frame',
  'get_clipboard', 'set_clipboard',
  'assert_text', 'assert_visible', 'assert_hidden', 'assert_url', 'assert_title', 'assert_element_count'
];
