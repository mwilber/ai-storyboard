import { ImageManager } from "./image-manager.js";
import { StateManager } from "./state-manager.js";
import { StorageManager } from "./storage-manager.js";
import { UIRenderer } from "./ui-renderer.js";

export class App {
  constructor(root) {
    this.root = root;
    this.storageManager = new StorageManager();
    this.imageManager = new ImageManager();
    this.stateManager = new StateManager(this.storageManager);
    this.uiRenderer = new UIRenderer(root);
    this.fileInput = this.#buildFileInput();
    this.objectUrls = [];
    this.isEditingTitle = false;
  }

  async start() {
    this.stateManager.initialize();
    await this.render();
  }

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

    this.#handleAutofocus();
  }

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

  #focusAndCenterPrompt(promptId) {
    const promptTile = this.root.querySelector(`[data-prompt-id="${promptId}"]`);
    const promptInput = promptTile?.querySelector("textarea");
    if (!promptInput) {
      return;
    }

    promptInput.focus({ preventScroll: true });
    this.#centerInRail(promptTile, true);
  }

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

  #startTitleEditing() {
    this.isEditingTitle = true;
    this.render();
  }

  #finishTitleEditing(title) {
    this.stateManager.setProjectTitle(title.trim() || "Project Title");
    this.isEditingTitle = false;
    this.render();
  }

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

  #handleAutofocus() {
    const autofocusTarget = this.root.querySelector("[data-autofocus='true']");
    if (autofocusTarget instanceof HTMLElement) {
      autofocusTarget.focus({ preventScroll: true });
      if (autofocusTarget instanceof HTMLInputElement) {
        autofocusTarget.setSelectionRange(autofocusTarget.value.length, autofocusTarget.value.length);
      }
    }
  }

  #revokeObjectUrls() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls = [];
  }
}
