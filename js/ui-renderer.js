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

export class UIRenderer {
  constructor(root) {
    this.root = root;
  }

  render(state, options) {
    const {
      imageUrlsByKey,
      onTitleEditStart,
      onTitleInput,
      onTitleEditEnd,
      onAddKeyframeClick,
      onPromptInput,
      onPaginationClick,
      onDeleteEverythingClick
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
    const titleInput = document.createElement("input");
    titleInput.className = "project-title-input";
    titleInput.value = state.projectTitle;
    titleInput.setAttribute("aria-label", "Project Title");
    titleInput.addEventListener("focus", onTitleEditStart);
    titleInput.addEventListener("input", (event) => onTitleInput(event.target.value));
    titleInput.addEventListener("blur", (event) => onTitleEditEnd(event.target.value));
    titleWrap.append(titleInput);
    app.append(titleWrap);

    const layout = document.createElement("main");
    layout.className = "storyboard-layout";
    const rail = document.createElement("section");
    rail.className = "storyboard-rail";

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
    app.append(layout);
    this.root.append(app);
  }

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
