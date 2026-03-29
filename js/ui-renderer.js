/**
 * @typedef {object} KeyframeEntity
 * @property {string} id - Stable keyframe identifier.
 * @property {string} imageKey - Cache key for the keyframe image.
 * @property {number} createdAt - Keyframe creation timestamp in milliseconds.
 */

/**
 * @typedef {object} PromptEntity
 * @property {string} id - Stable prompt identifier.
 * @property {string} leftKeyframeId - Left adjacent keyframe id.
 * @property {string} rightKeyframeId - Right adjacent keyframe id.
 * @property {string} text - Prompt text content.
 */

/**
 * @typedef {object} StoryboardState
 * @property {string} projectTitle - Current storyboard title.
 * @property {string|null} selectedPromptId - Active prompt id.
 * @property {KeyframeEntity[]} keyframes - Ordered keyframe entities.
 * @property {PromptEntity[]} prompts - Ordered prompt entities.
 */

/**
 * @typedef {object} UIRenderOptions
 * @property {Map<string, string>} imageUrlsByKey - Runtime map of image keys to object URLs.
 * @property {(title: string) => void} onTitleInput - Called on title input events.
 * @property {() => void} onTitleStartEditing - Called when title enters edit mode.
 * @property {(title: string) => void} onTitleFinishEditing - Called when title edit commits.
 * @property {() => void} onAddKeyframeClick - Called when add-keyframe button is clicked.
 * @property {(promptId: string, side: "left"|"right") => void} onInsertAtPromptEdgeClick - Called when inserting a keyframe next to a prompt.
 * @property {(keyframeId: string) => void} onDeleteKeyframeClick - Called when a keyframe delete button is clicked.
 * @property {(promptId: string, text: string) => void} onPromptInput - Called on prompt input events.
 * @property {(promptId: string, text: string) => void} onCopyPrompt - Called when copy prompt button is clicked.
 * @property {(promptId: string) => boolean} isPromptCopied - Returns whether a prompt is currently in copied UI state.
 * @property {(promptIndex: number) => void} onPaginationClick - Called when a page button is selected.
 * @property {() => void} onExportPromptsClick - Called when export prompts button is clicked.
 * @property {() => void} onExportWebpageClick - Called when export webpage button is clicked.
 * @property {() => void} onDeleteEverythingClick - Called when reset button is clicked.
 * @property {boolean} isEditingTitle - Whether title edit mode is active.
 */

/**
 * Builds a compact pagination model with ellipsis entries for large page ranges.
 * @param {number} total - Total number of prompt pages.
 * @param {number} activeIndex - Zero-based active prompt index.
 * @returns {(number|string)[]} Pagination tokens where numbers are 1-based page values and "..." is a gap marker.
 */
function renderPaginationModel(total, activeIndex) {
  if (total <= 0) {
    return [];
  }

  if (total <= 7) {
    return Array.from({ length: total }, (_item, index) => index + 1);
  }

  const pages = new Set([1, total, activeIndex + 1, activeIndex, activeIndex + 2]);
  const filtered = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const model = [];

  for (let i = 0; i < filtered.length; i += 1) {
    if (i > 0 && filtered[i] - filtered[i - 1] > 1) {
      model.push("...");
    }
    model.push(filtered[i]);
  }

  return model;
}

/**
 * Renders the storyboard UI from state and callback handlers.
 */
export class UIRenderer {
  /**
   * @param {HTMLElement} root - Root mount node for application rendering.
   */
  constructor(root) {
    this.root = root;
  }

  /**
   * Renders the full app shell based on current state.
   * @param {StoryboardState} state - Current application state.
   * @param {UIRenderOptions} options - Event and rendering options.
   * @returns {void}
   */
  render(state, options) {
    const {
      imageUrlsByKey,
      onTitleInput,
      onTitleStartEditing,
      onTitleFinishEditing,
      onAddKeyframeClick,
      onInsertAtPromptEdgeClick,
      onDeleteKeyframeClick,
      onPromptInput,
      onCopyPrompt,
      isPromptCopied,
      onPaginationClick,
      onExportPromptsClick,
      onExportWebpageClick,
      onDeleteEverythingClick,
      isEditingTitle
    } = options;

    this.root.innerHTML = "";
    const app = document.createElement("div");
    app.className = "app";

    const topLeftBrand = document.createElement("div");
    topLeftBrand.className = "top-left-brand";

    const badges = document.createElement("div");
    badges.className = "promo-badges";

    const githubBadge = document.createElement("a");
    githubBadge.className = "promo-badge promo-badge-github";
    githubBadge.href = "https://github.com/mwilber/ai-storyboard/";
    githubBadge.target = "_blank";
    githubBadge.rel = "noopener noreferrer";
    githubBadge.setAttribute("aria-label", "Open AI Storyboard GitHub repository");
    githubBadge.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path>
      </svg>
    `;
    badges.append(githubBadge);

    const zetaBadge = document.createElement("a");
    zetaBadge.className = "promo-badge promo-badge-zeta";
    zetaBadge.href = "https://greenzeta.com/";
    zetaBadge.target = "_blank";
    zetaBadge.rel = "noopener noreferrer";
    zetaBadge.setAttribute("aria-label", "Open Green Zeta website");
    zetaBadge.textContent = "ζ";
    badges.append(zetaBadge);

    const headerLabel = document.createElement("p");
    headerLabel.className = "app-header-label";
    headerLabel.textContent = "AI Storyboard";
    topLeftBrand.append(headerLabel);
    topLeftBrand.append(badges);
    app.append(topLeftBrand);

    const topRightControls = document.createElement("div");
    topRightControls.className = "top-right-controls";

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "export-prompts-btn";
    exportButton.textContent = "Export Prompts";
    exportButton.addEventListener("click", onExportPromptsClick);
    topRightControls.append(exportButton);

    const exportWebpageButton = document.createElement("button");
    exportWebpageButton.type = "button";
    exportWebpageButton.className = "export-webpage-btn";
    exportWebpageButton.textContent = "Export Webpage";
    exportWebpageButton.addEventListener("click", onExportWebpageClick);
    topRightControls.append(exportWebpageButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-everything-btn";
    deleteButton.textContent = "Delete Everything";
    deleteButton.addEventListener("click", onDeleteEverythingClick);
    topRightControls.append(deleteButton);
    app.append(topRightControls);

    const titleWrap = document.createElement("div");
    titleWrap.className = "project-title-wrap";
    if (isEditingTitle) {
      const titleInput = document.createElement("input");
      titleInput.className = "project-title-input";
      titleInput.value = state.projectTitle;
      titleInput.setAttribute("aria-label", "Project Title");
      titleInput.addEventListener("input", (event) => onTitleInput(event.target.value));
      titleInput.addEventListener("blur", (event) => onTitleFinishEditing(event.target.value));
      titleInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onTitleFinishEditing(event.target.value);
        }
      });
      titleInput.dataset.autofocus = "true";
      titleWrap.append(titleInput);
    } else {
      const titleDisplay = document.createElement("h1");
      titleDisplay.className = "project-title";
      titleDisplay.textContent = state.projectTitle || "Project Title";
      titleDisplay.tabIndex = 0;
      titleDisplay.setAttribute("role", "button");
      titleDisplay.setAttribute("aria-label", "Edit Project Title");
      titleDisplay.addEventListener("click", onTitleStartEditing);
      titleDisplay.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onTitleStartEditing();
        }
      });
      titleWrap.append(titleDisplay);
    }
    app.append(titleWrap);

    const layout = document.createElement("main");
    layout.className = "storyboard-layout";
    const rail = document.createElement("section");
    rail.className = "storyboard-rail";
    if (state.keyframes.length === 0) {
      rail.classList.add("storyboard-rail-empty");
    }
    rail.dataset.rail = "true";

    state.keyframes.forEach((keyframe, index) => {
      rail.append(this.#createKeyframeTile(index, keyframe, imageUrlsByKey.get(keyframe.imageKey) || null, onDeleteKeyframeClick));
      if (index < state.keyframes.length - 1) {
        const prompt = state.prompts[index];
        if (prompt) {
          rail.append(this.#createInsertAddTile(prompt.id, "left", onInsertAtPromptEdgeClick));
          rail.append(this.#createPromptTile(prompt, index, onPromptInput, onCopyPrompt, isPromptCopied(prompt.id)));
          rail.append(this.#createInsertAddTile(prompt.id, "right", onInsertAtPromptEdgeClick));
        }
      }
    });

    rail.append(this.#createAddTile(onAddKeyframeClick));
    layout.append(rail);

    if (state.prompts.length > 0) {
      const pagination = document.createElement("nav");
      pagination.className = "pagination";
      pagination.setAttribute("aria-label", "Prompt Pagination");
      const activeIndex = Math.max(0, state.prompts.findIndex((item) => item.id === state.selectedPromptId));
      renderPaginationModel(state.prompts.length, activeIndex).forEach((entry) => {
        if (entry === "...") {
          const gap = document.createElement("span");
          gap.className = "page-gap";
          gap.textContent = "...";
          pagination.append(gap);
        } else {
          const pageBtn = document.createElement("button");
          pageBtn.type = "button";
          pageBtn.className = "page-btn";
          pageBtn.textContent = String(entry);
          const promptForPage = state.prompts[entry - 1];
          if (promptForPage) {
            pageBtn.dataset.promptId = promptForPage.id;
          }
          if (activeIndex + 1 === entry) {
            pageBtn.setAttribute("aria-current", "page");
          }
          pageBtn.addEventListener("click", () => onPaginationClick(entry - 1));
          pagination.append(pageBtn);
        }
      });
      layout.append(pagination);
    }
    app.append(layout);
    this.root.append(app);
  }

  /**
   * Builds a keyframe tile with either an image or a missing-image placeholder.
   * @param {number} index - Zero-based keyframe order index.
   * @param {KeyframeEntity} keyframe - Keyframe entity metadata.
   * @param {string|null} imageUrl - Object URL for the keyframe image when available.
   * @param {(keyframeId: string) => void} onDeleteKeyframeClick - Keyframe deletion callback.
   * @returns {HTMLElement} Keyframe tile element.
   */
  #createKeyframeTile(index, keyframe, imageUrl, onDeleteKeyframeClick) {
    const tile = document.createElement("article");
    tile.className = "tile keyframe-tile";
    tile.dataset.keyframeId = keyframe.id;

    const mediaFrame = document.createElement("div");
    mediaFrame.className = "media-frame";
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = `Keyframe ${index + 1}`;
      mediaFrame.append(img);
    } else {
      const missing = document.createElement("span");
      missing.className = "media-missing";
      missing.textContent = "Image Missing";
      mediaFrame.append(missing);
    }
    tile.append(mediaFrame);

    const caption = document.createElement("p");
    caption.className = "keyframe-caption";
    caption.textContent = `Keyframe ${index + 1}`;
    tile.append(caption);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-keyframe-btn";
    deleteButton.textContent = "Delete Keyframe";
    deleteButton.setAttribute("aria-label", `Delete Keyframe ${index + 1}`);
    deleteButton.addEventListener("click", () => onDeleteKeyframeClick(keyframe.id));
    tile.append(deleteButton);

    return tile;
  }

  /**
   * Builds a prompt tile and binds text input callback.
   * @param {PromptEntity} prompt - Prompt entity metadata.
   * @param {number} promptIndex - Zero-based prompt sequence index.
   * @param {(promptId: string, text: string) => void} onPromptInput - Prompt update callback.
   * @param {(promptId: string, text: string) => void} onCopyPrompt - Copy action callback.
   * @param {boolean} isCopied - Whether this prompt currently shows copied state.
   * @returns {HTMLElement} Prompt tile element.
   */
  #createPromptTile(prompt, promptIndex, onPromptInput, onCopyPrompt, isCopied) {
    const tile = document.createElement("article");
    tile.className = "tile prompt-tile";
    tile.dataset.promptId = prompt.id;

    const label = document.createElement("label");
    label.className = "prompt-label";
    label.setAttribute("for", prompt.id);
    label.textContent = `AI Prompt ${promptIndex + 1}`;

    const input = document.createElement("textarea");
    input.id = prompt.id;
    input.className = "prompt-input";
    input.value = prompt.text || "";
    input.addEventListener("input", (event) => onPromptInput(prompt.id, event.target.value));

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "copy-prompt-btn";
    copyButton.textContent = isCopied ? "Copied" : "Copy to clipboard";
    copyButton.addEventListener("click", () => onCopyPrompt(prompt.id, input.value));

    tile.append(label, input, copyButton);
    return tile;
  }

  /**
   * Builds the add-keyframe tile and button action binding.
   * @param {() => void} onAddKeyframeClick - Upload trigger callback.
   * @returns {HTMLElement} Add-keyframe tile element.
   */
  #createAddTile(onAddKeyframeClick) {
    const tile = document.createElement("article");
    tile.className = "tile add-tile";

    const label = document.createElement("span");
    label.className = "add-label";
    label.textContent = "Add A Keyframe";

    const button = document.createElement("button");
    button.className = "add-btn";
    button.type = "button";
    button.textContent = "+";
    button.setAttribute("aria-label", "Add A Keyframe");
    button.addEventListener("click", onAddKeyframeClick);

    tile.append(label, button);
    return tile;
  }

  /**
   * Builds an insertion button tile for adding keyframes adjacent to an existing prompt.
   * @param {string} promptId - Prompt identifier for insertion target.
   * @param {"left"|"right"} side - Which side of the prompt the keyframe should be inserted.
   * @param {(promptId: string, side: "left"|"right") => void} onInsertAtPromptEdgeClick - Insertion callback.
   * @returns {HTMLElement} Prompt-edge insertion tile element.
   */
  #createInsertAddTile(promptId, side, onInsertAtPromptEdgeClick) {
    const tile = document.createElement("article");
    tile.className = "tile insert-add-tile";

    const label = document.createElement("span");
    label.className = "insert-add-label";
    label.textContent = "Add Keyframe";

    const button = document.createElement("button");
    button.className = "insert-add-btn";
    button.type = "button";
    button.textContent = "+";
    button.setAttribute("aria-label", `Add Keyframe ${side} of prompt`);
    button.addEventListener("click", () => onInsertAtPromptEdgeClick(promptId, side));

    tile.append(label, button);
    return tile;
  }
}
