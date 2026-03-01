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
 * @property {(promptId: string, text: string) => void} onPromptInput - Called on prompt input events.
 * @property {(promptIndex: number) => void} onPaginationClick - Called when a page button is selected.
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
      onPromptInput,
      onPaginationClick,
      onDeleteEverythingClick,
      isEditingTitle
    } = options;

    this.root.innerHTML = "";
    const app = document.createElement("div");
    app.className = "app";

    const headerLabel = document.createElement("p");
    headerLabel.className = "app-header-label";
    headerLabel.textContent = "AI Storyboard";
    app.append(headerLabel);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-everything-btn";
    deleteButton.textContent = "Delete Everything";
    deleteButton.addEventListener("click", onDeleteEverythingClick);
    app.append(deleteButton);

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
      rail.append(this.#createKeyframeTile(index, keyframe, imageUrlsByKey.get(keyframe.imageKey) || null));
      if (index < state.keyframes.length - 1) {
        const prompt = state.prompts[index];
        if (prompt) {
          rail.append(this.#createPromptTile(prompt, onPromptInput));
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
   * @returns {HTMLElement} Keyframe tile element.
   */
  #createKeyframeTile(index, keyframe, imageUrl) {
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

    return tile;
  }

  /**
   * Builds a prompt tile and binds text input callback.
   * @param {PromptEntity} prompt - Prompt entity metadata.
   * @param {(promptId: string, text: string) => void} onPromptInput - Prompt update callback.
   * @returns {HTMLElement} Prompt tile element.
   */
  #createPromptTile(prompt, onPromptInput) {
    const tile = document.createElement("article");
    tile.className = "tile prompt-tile";
    tile.dataset.promptId = prompt.id;

    const label = document.createElement("label");
    label.className = "prompt-label";
    label.setAttribute("for", prompt.id);
    label.textContent = "AI Prompt";

    const input = document.createElement("textarea");
    input.id = prompt.id;
    input.className = "prompt-input";
    input.value = prompt.text || "";
    input.addEventListener("input", (event) => onPromptInput(prompt.id, event.target.value));

    tile.append(label, input);
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
}
