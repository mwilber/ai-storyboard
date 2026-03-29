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
    /** @type {number|null} */
    this.railScrollRafId = null;
    /** @type {Map<string, number>} */
    this.promptCopiedTimers = new Map();
    /** @type {Map<string, number>} */
    this.promptCopiedUntil = new Map();
    /** @type {string|null} */
    this.pendingRecenterPromptId = null;
    /** @type {{mode: "append"} | {mode: "insert", promptId: string, side: "left"|"right"}} */
    this.pendingAddAction = { mode: "append" };
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
    const recenterPromptId = this.#resolveRecenterPromptIdBeforeRender();
    this.#revokeObjectUrls();
    const imageUrlsByKey = await this.#loadImageUrls();
    const state = this.stateManager.getState();

    this.uiRenderer.render(state, {
      imageUrlsByKey,
      isEditingTitle: this.isEditingTitle,
      onTitleStartEditing: () => this.#startTitleEditing(),
      onTitleInput: (title) => this.stateManager.setProjectTitle(title),
      onTitleFinishEditing: (title) => this.#finishTitleEditing(title),
      onAddKeyframeClick: () => this.#openFilePickerForAppend(),
      onInsertAtPromptEdgeClick: (promptId, side) => this.#openFilePickerForPromptInsertion(promptId, side),
      onDeleteKeyframeClick: (keyframeId) => this.#handleDeleteKeyframe(keyframeId),
      onPromptInput: (promptId, value) => this.stateManager.updatePrompt(promptId, value),
      onCopyPrompt: (promptId, text) => this.#handleCopyPrompt(promptId, text),
      isPromptCopied: (promptId) => this.#isPromptCopied(promptId),
      onPaginationClick: (index) => this.#scrollToPromptIndex(index),
      onExportPromptsClick: () => this.#handleExportPrompts(),
      onExportWebpageClick: () => this.#handleExportWebpage(),
      onDeleteEverythingClick: () => this.#handleDeleteEverything()
    });

    this.#attachWheelToHorizontalScroll();
    this.#attachRailSelectionTracking();
    this.#centerPromptById(recenterPromptId, false);
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
      const addAction = this.pendingAddAction;
      this.pendingAddAction = { mode: "append" };
      event.target.value = "";
      if (!file || !this.imageManager.isValidImage(file)) {
        return;
      }

      const imageKey = this.stateManager.nextImageKey();
      await this.imageManager.cacheImage(file, imageKey);
      let addResult = null;
      if (addAction.mode === "insert") {
        addResult = this.stateManager.insertKeyframeAtPromptEdge(
          imageKey,
          addAction.promptId,
          addAction.side
        );
      } else {
        addResult = await this.stateManager.addKeyframe(imageKey);
      }

      if (!addResult) {
        return;
      }

      await this.render();

      if (addResult.promptId) {
        this.#focusAndCenterPrompt(addResult.promptId);
      }
    });

    document.body.append(input);
    return input;
  }

  /**
   * Opens file picker for append-to-end keyframe creation.
   * @returns {void}
   */
  #openFilePickerForAppend() {
    this.pendingAddAction = { mode: "append" };
    this.fileInput.click();
  }

  /**
   * Opens file picker for prompt-adjacent keyframe insertion.
   * @param {string} promptId - Prompt anchor identifier.
   * @param {"left"|"right"} side - Which side of the prompt to insert on.
   * @returns {void}
   */
  #openFilePickerForPromptInsertion(promptId, side) {
    this.pendingAddAction = { mode: "insert", promptId, side };
    this.fileInput.click();
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
    this.#clearCopyTimers();
    await this.imageManager.clearCachedImages();
    await this.render();
  }

  /**
   * Exports all prompts as a downloadable text file in storyboard order.
   * @returns {void}
   */
  #handleExportPrompts() {
    const exportText = this.#buildPromptsExportText();
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = this.#buildExportFilename();
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Exports the current storyboard as a static, read-only HTML webpage.
   * @returns {Promise<void>}
   */
  async #handleExportWebpage() {
    const exportHtml = await this.#buildWebpageExportHtml();
    const blob = new Blob([exportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = this.#buildWebpageExportFilename();
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Builds concatenated prompt text output with hard-return heading sections.
   * @returns {string} Exported prompt text payload.
   */
  #buildPromptsExportText() {
    const prompts = this.stateManager.getState().prompts;
    return prompts
      .map((prompt, index) => `\nAI Prompt ${index + 1}\n\n${prompt.text || ""}\n`)
      .join("");
  }

  /**
   * Builds the exported text filename based on the current project title.
   * @returns {string} Download filename.
   */
  #buildExportFilename() {
    const title = this.stateManager.getState().projectTitle || "ai-storyboard";
    const safeTitle = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${safeTitle || "ai-storyboard"}-prompts.txt`;
  }

  /**
   * Builds the exported webpage filename based on the current project title.
   * @returns {string} Download filename.
   */
  #buildWebpageExportFilename() {
    const title = this.stateManager.getState().projectTitle || "ai-storyboard";
    const safeTitle = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${safeTitle || "ai-storyboard"}-storyboard.html`;
  }

  /**
   * Builds a static HTML document representing the current storyboard state.
   * @returns {Promise<string>} Complete standalone export HTML markup.
   */
  async #buildWebpageExportHtml() {
    const state = this.stateManager.getState();
    const encodedTitle = this.#escapeHtml(state.projectTitle || "Project Title");
    const encodedDocumentTitle = this.#escapeHtml(`${state.projectTitle || "Project Title"} - AI Storyboard`);
    const imageDataUrlsByKey = await this.#loadImageDataUrls();
    const activePromptIndex = Math.max(
      0,
      state.prompts.findIndex((prompt) => prompt.id === state.selectedPromptId)
    );
    const promptPaginationModel = this.#buildPaginationModel(state.prompts.length, activePromptIndex);
    const railClass = state.keyframes.length === 0 ? "storyboard-rail storyboard-rail-empty" : "storyboard-rail";
    const railMarkup = state.keyframes
      .map((keyframe, keyframeIndex) => {
        const keyframeMarkup = this.#buildExportKeyframeTileMarkup(
          keyframeIndex,
          keyframe,
          imageDataUrlsByKey.get(keyframe.imageKey) || null
        );
        const prompt = state.prompts[keyframeIndex];
        if (!prompt) {
          return keyframeMarkup;
        }
        const promptMarkup = this.#buildExportPromptTileMarkup(prompt, keyframeIndex);
        return `${keyframeMarkup}\n${promptMarkup}`;
      })
      .join("\n");

    const paginationMarkup =
      state.prompts.length > 0
        ? `<nav class="pagination" aria-label="Prompt Pagination">
${promptPaginationModel
  .map((entry) => {
    if (entry === "...") {
      return '  <span class="page-gap">...</span>';
    }
    const prompt = state.prompts[entry - 1];
    if (!prompt) {
      return "";
    }
    const encodedPromptId = this.#escapeAttribute(prompt.id);
    const isActive = activePromptIndex + 1 === entry;
    return `  <button type="button" class="page-btn" data-prompt-id="${encodedPromptId}"${
      isActive ? ' aria-current="page"' : ""
    }>${entry}</button>`;
  })
  .filter(Boolean)
  .join("\n")}
</nav>`
        : "";

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${encodedDocumentTitle}</title>
    <link rel="stylesheet" href="https://storyboard.greenzeta.com/styles.css" />
    <style>
      .project-title {
        cursor: default;
      }
      .prompt-input[readonly] {
        background: #fff;
        color: inherit;
      }
      .prompt-input[readonly]:focus {
        outline: 2px solid var(--focus);
        outline-offset: 2px;
      }
    </style>
    <script defer src="https://storyboard.greenzeta.com/js/export-webpage-static.js"></script>
  </head>
  <body>
    <div class="app export-webpage">
      <div class="top-left-brand">
        <p class="app-header-label">AI Storyboard</p>
        <div class="promo-badges">
          <a
            class="promo-badge promo-badge-github"
            href="https://github.com/mwilber/ai-storyboard/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open AI Storyboard GitHub repository"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path>
            </svg>
          </a>
          <a
            class="promo-badge promo-badge-zeta"
            href="https://greenzeta.com/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open Green Zeta website"
          >ζ</a>
        </div>
      </div>
      <div class="project-title-wrap">
        <h1 class="project-title">${encodedTitle}</h1>
      </div>
      <main class="storyboard-layout">
        <section class="${railClass}" data-rail="true">
${railMarkup}
        </section>
${paginationMarkup}
      </main>
    </div>
  </body>
</html>
`;
  }

  /**
   * Builds static markup for one exported keyframe tile.
   * @param {number} keyframeIndex - Zero-based keyframe index.
   * @param {{id: string}} keyframe - Keyframe metadata.
   * @param {string|null} imageDataUrl - Encoded image data URL payload.
   * @returns {string} Keyframe tile HTML.
   */
  #buildExportKeyframeTileMarkup(keyframeIndex, keyframe, imageDataUrl) {
    const encodedKeyframeId = this.#escapeAttribute(keyframe.id);
    const encodedAlt = this.#escapeAttribute(`Keyframe ${keyframeIndex + 1}`);
    const mediaMarkup = imageDataUrl
      ? `<img src="${this.#escapeAttribute(imageDataUrl)}" alt="${encodedAlt}" />`
      : '<span class="media-missing">Image Missing</span>';

    return `<article class="tile keyframe-tile" data-keyframe-id="${encodedKeyframeId}">
  <div class="media-frame">
    ${mediaMarkup}
  </div>
  <p class="keyframe-caption">Keyframe ${keyframeIndex + 1}</p>
</article>`;
  }

  /**
   * Builds static markup for one exported prompt tile.
   * @param {{id: string, text: string}} prompt - Prompt metadata.
   * @param {number} promptIndex - Zero-based prompt index.
   * @returns {string} Prompt tile HTML.
   */
  #buildExportPromptTileMarkup(prompt, promptIndex) {
    const encodedPromptId = this.#escapeAttribute(prompt.id);
    const encodedPromptText = this.#escapeHtml(prompt.text || "");

    return `<article class="tile prompt-tile" data-prompt-id="${encodedPromptId}">
  <label class="prompt-label" for="${encodedPromptId}">AI Prompt ${promptIndex + 1}</label>
  <textarea id="${encodedPromptId}" class="prompt-input" readonly>${encodedPromptText}</textarea>
</article>`;
  }

  /**
   * Loads keyframe images as encoded data URLs for static HTML export.
   * @returns {Promise<Map<string, string>>} Map of image cache keys to encoded data URLs.
   */
  async #loadImageDataUrls() {
    const state = this.stateManager.getState();
    const imageDataUrlsByKey = new Map();

    await Promise.all(
      state.keyframes.map(async (keyframe) => {
        const imageDataUrl = await this.imageManager.getImageDataUrl(keyframe.imageKey);
        if (imageDataUrl) {
          imageDataUrlsByKey.set(keyframe.imageKey, imageDataUrl);
        }
      })
    );

    return imageDataUrlsByKey;
  }

  /**
   * Builds compact pagination entries with ellipsis gap markers.
   * @param {number} total - Total prompt count.
   * @param {number} activeIndex - Zero-based active prompt index.
   * @returns {(number|string)[]} Pagination entries where numbers are one-based page indices.
   */
  #buildPaginationModel(total, activeIndex) {
    if (total <= 0) {
      return [];
    }

    if (total <= 7) {
      return Array.from({ length: total }, (_item, index) => index + 1);
    }

    const pages = new Set([1, total, activeIndex + 1, activeIndex, activeIndex + 2]);
    const filtered = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
    const model = [];

    for (let index = 0; index < filtered.length; index += 1) {
      if (index > 0 && filtered[index] - filtered[index - 1] > 1) {
        model.push("...");
      }
      model.push(filtered[index]);
    }

    return model;
  }

  /**
   * Escapes HTML text content to prevent tag interpretation in exports.
   * @param {string} value - Raw text value.
   * @returns {string} Escaped text content.
   */
  #escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Escapes HTML attribute values for safe inline usage.
   * @param {string} value - Raw attribute value.
   * @returns {string} Escaped attribute-safe value.
   */
  #escapeAttribute(value) {
    return this.#escapeHtml(value).replace(/`/g, "&#96;");
  }

  /**
   * Removes a keyframe and reconciles surrounding prompts per storyboard rules.
   * @param {string} keyframeId - Keyframe identifier to remove.
   * @returns {Promise<void>}
   */
  async #handleDeleteKeyframe(keyframeId) {
    const confirmed = window.confirm(
      "Delete this keyframe and its adjacent AI prompt text sections?"
    );
    if (!confirmed) {
      return;
    }

    const result = this.stateManager.removeKeyframe(keyframeId);
    if (!result) {
      return;
    }

    result.removedPromptIds.forEach((promptId) => this.#clearCopyStateForPrompt(promptId));
    this.pendingRecenterPromptId = result.insertedPromptId;
    await this.render();

    if (result.insertedPromptId) {
      this.#focusAndCenterPrompt(result.insertedPromptId);
    }
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

        if (this.#shouldAllowNativeTextScroll(event)) {
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
   * Determines whether wheel input should be handled natively by a prompt textarea.
   * @param {WheelEvent} event - Wheel input event originating from the storyboard rail.
   * @returns {boolean} True when the pointer is over a vertically scrollable prompt textarea.
   */
  #shouldAllowNativeTextScroll(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return false;
    }

    const textArea = target.closest(".prompt-input");
    if (!(textArea instanceof HTMLTextAreaElement)) {
      return false;
    }

    return textArea.scrollHeight > textArea.clientHeight;
  }

  /**
   * Tracks horizontal rail scroll position and syncs pagination active state to the centered prompt tile.
   * @returns {void}
   */
  #attachRailSelectionTracking() {
    const rail = this.root.querySelector('[data-rail="true"]');
    if (!(rail instanceof HTMLElement)) {
      return;
    }

    const updateActivePromptFromView = () => {
      this.railScrollRafId = null;
      const activePromptId = this.#getCenteredPromptId(rail);
      if (!activePromptId) {
        return;
      }

      if (activePromptId !== this.stateManager.getState().selectedPromptId) {
        this.stateManager.setSelectedPromptId(activePromptId);
      }
      this.#updatePaginationHighlight(activePromptId);
    };

    rail.addEventListener("scroll", () => {
      if (this.railScrollRafId !== null) {
        return;
      }
      this.railScrollRafId = window.requestAnimationFrame(updateActivePromptFromView);
    });

    updateActivePromptFromView();
  }

  /**
   * Finds the prompt tile whose center is closest to the rail viewport center.
   * @param {HTMLElement} rail - Horizontal storyboard rail element.
   * @returns {string|null} Center-most prompt id or null when no prompts exist.
   */
  #getCenteredPromptId(rail) {
    const promptTiles = [...this.root.querySelectorAll("[data-prompt-id]")];
    if (promptTiles.length === 0) {
      return null;
    }

    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    let closestPromptId = null;
    let smallestDistance = Number.POSITIVE_INFINITY;

    promptTiles.forEach((tile) => {
      if (!(tile instanceof HTMLElement)) {
        return;
      }

      const tileCenter = tile.offsetLeft + tile.clientWidth / 2;
      const distance = Math.abs(tileCenter - railCenter);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        closestPromptId = tile.dataset.promptId || null;
      }
    });

    return closestPromptId;
  }

  /**
   * Chooses which prompt ID should be centered after the next render.
   * @returns {string|null} Prompt identifier to re-center, if available.
   */
  #resolveRecenterPromptIdBeforeRender() {
    if (this.pendingRecenterPromptId) {
      const overridePromptId = this.pendingRecenterPromptId;
      this.pendingRecenterPromptId = null;
      return overridePromptId;
    }

    const rail = this.root.querySelector('[data-rail="true"]');
    if (!(rail instanceof HTMLElement)) {
      return null;
    }

    return this.#getCenteredPromptId(rail);
  }

  /**
   * Centers a prompt tile by prompt identifier if the tile exists in the current render.
   * @param {string|null} promptId - Prompt identifier to center.
   * @param {boolean} [smooth=false] - Whether centering should animate.
   * @returns {void}
   */
  #centerPromptById(promptId, smooth = false) {
    if (!promptId) {
      return;
    }

    const promptTile = this.root.querySelector(`[data-prompt-id="${promptId}"]`);
    if (!(promptTile instanceof HTMLElement)) {
      return;
    }

    this.#centerInRail(promptTile, smooth);
  }

  /**
   * Applies active-state styling to the pagination button mapped to a prompt id.
   * @param {string} promptId - Prompt identifier mapped to pagination buttons.
   * @returns {void}
   */
  #updatePaginationHighlight(promptId) {
    const buttons = [...this.root.querySelectorAll(".page-btn")];
    buttons.forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }

      if (button.dataset.promptId === promptId) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  /**
   * Copies prompt text to system clipboard and sets temporary copied-state UI.
   * @param {string} promptId - Prompt identifier for copied-state tracking.
   * @param {string} text - Prompt text to copy.
   * @returns {Promise<void>}
   */
  async #handleCopyPrompt(promptId, text) {
    try {
      await navigator.clipboard.writeText(text ?? "");
    } catch (_error) {
      return;
    }

    const copiedUntil = Date.now() + 5000;
    this.promptCopiedUntil.set(promptId, copiedUntil);

    const existingTimer = this.promptCopiedTimers.get(promptId);
    if (typeof existingTimer === "number") {
      window.clearTimeout(existingTimer);
    }

    const timerId = window.setTimeout(() => {
      const latestCopiedUntil = this.promptCopiedUntil.get(promptId) ?? 0;
      if (latestCopiedUntil <= Date.now()) {
        this.promptCopiedUntil.delete(promptId);
      }
      this.promptCopiedTimers.delete(promptId);
      this.render();
    }, 5000);

    this.promptCopiedTimers.set(promptId, timerId);
    await this.render();
  }

  /**
   * Returns whether a prompt should display the copied-state label.
   * @param {string} promptId - Prompt identifier.
   * @returns {boolean}
   */
  #isPromptCopied(promptId) {
    const copiedUntil = this.promptCopiedUntil.get(promptId);
    return typeof copiedUntil === "number" && copiedUntil > Date.now();
  }

  /**
   * Clears pending copied-state timers and cached copied metadata.
   * @returns {void}
   */
  #clearCopyTimers() {
    this.promptCopiedTimers.forEach((timerId) => window.clearTimeout(timerId));
    this.promptCopiedTimers.clear();
    this.promptCopiedUntil.clear();
  }

  /**
   * Clears copied-state timer metadata for a single prompt id.
   * @param {string} promptId - Prompt identifier.
   * @returns {void}
   */
  #clearCopyStateForPrompt(promptId) {
    const timerId = this.promptCopiedTimers.get(promptId);
    if (typeof timerId === "number") {
      window.clearTimeout(timerId);
    }
    this.promptCopiedTimers.delete(promptId);
    this.promptCopiedUntil.delete(promptId);
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
