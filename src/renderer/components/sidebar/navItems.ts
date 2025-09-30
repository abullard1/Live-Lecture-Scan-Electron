/**
 * Sidebar navigation configuration.
 */

export interface NavItem {
  /** Unique key (used for active state, testing, potential routing) */
  key: string;
  /** Small icon (emoji or could be replaced with an imported icon component) */
  icon: string;
  /** Short human‑readable label displayed under the icon */
  label: string;
}

/**
 * MAIN (middle) navigation items – the core functional areas of the app.
 */
export const middleItems: NavItem[] = [
  { key: 'library', icon: '📚', label: 'Library' },
  { key: 'calendar', icon: '📅', label: 'Calendar' },
  { key: 'search', icon: '🔍', label: 'Search' },
  { key: 'recents', icon: '🕒', label: 'Recents' },
  { key: 'starred', icon: '⭐', label: 'Starred' },
  { key: 'tags', icon: '🏷️', label: 'Tags' },
  { key: 'queue', icon: '⚙️', label: 'Queue' },
  { key: 'exports', icon: '📤', label: 'Exports' },
  { key: 'extensions', icon: '🧩', label: 'Exts' },
];

/**
 * UTILITY (bottom) navigation – less frequently used / meta actions.
 */
export const bottomItems: NavItem[] = [
  { key: 'settings', icon: '⚙️', label: 'Settings' },
  { key: 'about', icon: 'ℹ️', label: 'About' },
];
