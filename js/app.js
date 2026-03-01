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
      onTitleEditStart: () => {},
      onTitleInput: (title) => this.stateManager.setProjectTitle(title),
      onTitleEditEnd: (title) => this.stateManager.setProjectTitle(title),
      onAddKeyframeClick: () => this.fileInput.click(),
      onPromptInput: (promptId, value) => this.stateManager.updatePrompt(promptId, value),
      onPaginationClick: (index) => this.#scrollToPromptIndex(index),
      onDeleteEverythingClick: () => this.#handleDeleteEverything()
    });
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
        this.#focusPrompt(promptId);
      }
    });

    document.body.append(input);
    return input;
  }

  #focusPrompt(promptId) {
    const promptTile = this.root.querySelector(`[data-prompt-id="${promptId}"]`);
    const promptInput = promptTile?.querySelector("textarea");
    if (!promptInput) {
      return;
    }

    promptInput.focus();
    promptTile.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  #scrollToPromptIndex(promptIndex) {
    const prompts = this.stateManager.getState().prompts;
    const prompt = prompts[promptIndex];
    if (!prompt) {
      return;
    }

    this.stateManager.setSelectedPromptId(prompt.id);
    const promptTile = this.root.querySelector(`[data-prompt-id="${prompt.id}"]`);
    promptTile?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  async #handleDeleteEverything() {
    const confirmed = window.confirm("Delete all keyframes, prompts, and cached images?");
    if (!confirmed) {
      return;
    }

    this.stateManager.resetAll();
    await this.imageManager.clearCachedImages();
    await this.render();
  }

  #revokeObjectUrls() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls = [];
  }
}
