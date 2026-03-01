import { STORAGE_KEY } from "./config.js";

/**
 * Handles JSON application state persistence in browser localStorage.
 */
export class StorageManager {
  /**
   * @param {string} [storageKey=STORAGE_KEY] - Local storage key for serialized state.
   */
  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  /**
   * Loads and parses persisted storyboard state.
   * @returns {object|null} Parsed state object when available and valid, otherwise null.
   */
  loadState() {
    const serialized = window.localStorage.getItem(this.storageKey);
    if (!serialized) {
      return null;
    }

    try {
      return JSON.parse(serialized);
    } catch (_err) {
      return null;
    }
  }

  /**
   * Saves state to localStorage as a JSON string.
   * @param {object} state - Serializable storyboard state object.
   * @returns {void}
   */
  saveState(state) {
    window.localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  /**
   * Removes persisted storyboard state from localStorage.
   * @returns {void}
   */
  clearState() {
    window.localStorage.removeItem(this.storageKey);
  }
}
