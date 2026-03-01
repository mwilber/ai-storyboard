import { STORAGE_KEY } from "./config.js";

export class StorageManager {
  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey;
  }

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

  saveState(state) {
    window.localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  clearState() {
    window.localStorage.removeItem(this.storageKey);
  }
}
