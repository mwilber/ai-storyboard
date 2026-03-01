import { ImageManager } from "./image-manager.js";
import { StateManager } from "./state-manager.js";
import { StorageManager } from "./storage-manager.js";
import { UIRenderer } from "./ui-renderer.js";

/**
 * Coordinates app startup, rendering, event wiring, and cross-manager interactions.
 */
export class App {
  /**
   * @param {HTMLElement} root - Root mount node for the application UI.
   */
  constructor(root) {
    this.root = root;
    /** @type {StorageManager} */
    this.storageManager = new StorageManager();
    /** @type {ImageManager} */
    this.imageManager = new ImageManager();
    /** @type {StateManager} */
    this.stateManager = new StateManager(this.storageManager);
    /** @type {UIRenderer} */
    this.uiRenderer = new UIRenderer(root);
    /** @type {HTMLInputElement} */
    this.fileInput = this.#buildFileInput();
    /** @type {string[]} */
    this.objectUrls = [];
    /** @type {boolean} */
    this.isEditingTitle = false;
  }

  /**
   * Initializes state and renders the application.
   * @returns {Promise<void>}
   */
  async start() {
    this.stateManager.initialize();
    await this.render();
  }

  /**
   * Re-renders the UI based on current state and runtime image URL mapping.
   * @returns {Promise<void>}
   */
  async render() {
    this.#revokeObjectUrls();
    const imageUrlsByKey = await this.#loadImageUrls();
    const state = this.stateManager.getState();

    this.uiRenderer.render(state, {
      imageUrlsByKey,
      isEditingTitle: this.isEditingTitle,
      onTitleStartEditing: () => this.#startTitleEditing(),
      onTitleInput: (title) => this.stateManager.setProjectTitle(title),
      onTitleFinishEditing: (title) => this.#finishTitleEditing(title),
      onAddKeyframeClick: () => this.fileInput.click(),
      onPromptInput: (promptId, value) => this.stateManager.updatePrompt(promptId, value),
      onPaginationClick: (index) => this.#scrollToPromptIndex(index),
      onDeleteEverythingClick: () => this.#handleDeleteEverything()
    });

    this.#attachWheelToHorizontalScroll();
    this.#handleAutofocus();
  }

  /**
   * Loads runtime blob URLs for each keyframe image.
   * @returns {Promise<Map<string, string>>} Map of image cache keys to object URLs.
   */
  async #loadImageUrls() {
    const state = this.stateManager.getState();
    const imageUrlsByKey = new Map();

    await Promise.all(
      state.keyframes.map(async (keyframe) => {
        const blobUrl = await this.imageManager.getImageBlobUrl(keyframe.imageKey);
        if (blobUrl) {
          this.objectUrls.push(blobUrl);
          imageUrlsByKey.set(keyframe.imageKey, blobUrl);
        }
      })
    );

    return imageUrlsByKey;
  }

  /**
   * Creates and configures the hidden file input used for keyframe uploads.
   * @returns {HTMLInputElement} Hidden file input element.
   */
  #buildFileInput() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    input.addEventListener("change", async (event) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (!file || !this.imageManager.isValidImage(file)) {
        return;
      }

      const imageKey = this.stateManager.nextImageKey();
      await this.imageManager.cacheImage(file, imageKey);
      const { promptId } = await this.stateManager.addKeyframe(imageKey);
      await this.render();

      if (promptId) {
        this.#focusAndCenterPrompt(promptId);
      }
    });

    document.body.append(input);
    return input;
  }

  /**
   * Focuses and centers a prompt tile in the horizontal rail.
   * @param {string} promptId - Prompt identifier to focus.
   * @returns {void}
   */
  #focusAndCenterPrompt(promptId) {
    const promptTile = this.root.querySelector(`[data-prompt-id="${promptId}"]`);
    const promptInput = promptTile?.querySelector("textarea");
    if (!promptInput) {
      return;
    }

    promptInput.focus({ preventScroll: true });
    this.#centerInRail(promptTile, true);
  }

  /**
   * Selects a prompt by index, re-renders active state, then centers and focuses the prompt input.
   * @param {number} promptIndex - Zero-based prompt index.
   * @returns {Promise<void>}
   */
  async #scrollToPromptIndex(promptIndex) {
    const prompts = this.stateManager.getState().prompts;
    const prompt = prompts[promptIndex];
    if (!prompt) {
      return;
    }

    this.stateManager.setSelectedPromptId(prompt.id);
    await this.render();
    const promptTile = this.root.querySelector(`[data-prompt-id="${prompt.id}"]`);
    if (promptTile) {
      this.#centerInRail(promptTile, true);
      const promptInput = promptTile.querySelector("textarea");
      promptInput?.focus({ preventScroll: true });
    }
  }

  /**
   * Clears persisted app state and cached images after user confirmation.
   * @returns {Promise<void>}
   */
  async #handleDeleteEverything() {
    const confirmed = window.confirm("Delete all keyframes, prompts, and cached images?");
    if (!confirmed) {
      return;
    }

    this.stateManager.resetAll();
    this.isEditingTitle = false;
    await this.imageManager.clearCachedImages();
    await this.render();
  }

  /**
   * Enables title edit mode and re-renders.
   * @returns {void}
   */
  #startTitleEditing() {
    this.isEditingTitle = true;
    this.render();
  }

  /**
   * Commits title text, exits edit mode, and re-renders.
   * @param {string} title - Title text from the edit input.
   * @returns {void}
   */
  #finishTitleEditing(title) {
    this.stateManager.setProjectTitle(title.trim() || "Project Title");
    this.isEditingTitle = false;
    this.render();
  }

  /**
   * Scrolls the horizontal rail so the target element appears centered.
   * @param {HTMLElement} element - Element to center in the rail viewport.
   * @param {boolean} [smooth=false] - Whether to use smooth scrolling.
   * @returns {void}
   */
  #centerInRail(element, smooth = false) {
    const rail = this.root.querySelector('[data-rail="true"]');
    if (!rail || !element) {
      return;
    }

    const behavior = smooth ? "smooth" : "auto";
    const targetLeft = element.offsetLeft - (rail.clientWidth - element.clientWidth) / 2;
    rail.scrollTo({
      left: Math.max(0, targetLeft),
      behavior
    });
  }

  /**
   * Focuses the first element marked with the data-autofocus attribute.
   * @returns {void}
   */
  #handleAutofocus() {
    const autofocusTarget = this.root.querySelector("[data-autofocus='true']");
    if (autofocusTarget instanceof HTMLElement) {
      autofocusTarget.focus({ preventScroll: true });
      if (autofocusTarget instanceof HTMLInputElement) {
        autofocusTarget.setSelectionRange(autofocusTarget.value.length, autofocusTarget.value.length);
      }
    }
  }

  /**
   * Routes wheel deltas to horizontal scrolling while pointer is over the storyboard rail.
   * @returns {void}
   */
  #attachWheelToHorizontalScroll() {
    const rail = this.root.querySelector('[data-rail="true"]');
    if (!(rail instanceof HTMLElement)) {
      return;
    }

    rail.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey) {
          return;
        }

        const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
        if (delta === 0) {
          return;
        }

        event.preventDefault();
        rail.scrollLeft += delta;
      },
      { passive: false }
    );
  }

  /**
   * Revokes all temporary object URLs from the previous render cycle.
   * @returns {void}
   */
  #revokeObjectUrls() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls = [];
  }
}
