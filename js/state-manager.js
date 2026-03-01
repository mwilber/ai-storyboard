import { SAVE_DEBOUNCE_MS } from "./config.js";

const DEFAULT_TITLE = "Project Title";

export class StateManager {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.state = this.#buildDefaultState();
    this.saveTimerId = null;
  }

  initialize() {
    const persisted = this.storageManager.loadState();
    if (persisted && typeof persisted === "object") {
      this.state = this.#normalizeState(persisted);
    }
  }

  getState() {
    return this.state;
  }

  setProjectTitle(titleText) {
    this.state.projectTitle = titleText;
    this.#debouncedSave();
  }

  setSelectedPromptId(promptId) {
    this.state.selectedPromptId = promptId;
    this.#saveNow();
  }

  updatePrompt(promptId, promptText) {
    const prompt = this.state.prompts.find((item) => item.id === promptId);
    if (!prompt) {
      return;
    }

    prompt.text = promptText;
    this.#debouncedSave();
  }

  async addKeyframe(imageKey) {
    const newKeyframe = {
      id: this.#nextId("kf"),
      imageKey,
      createdAt: Date.now()
    };

    const previousKeyframe = this.state.keyframes[this.state.keyframes.length - 1] ?? null;
    this.state.keyframes.push(newKeyframe);

    if (previousKeyframe) {
      const newPrompt = {
        id: this.#nextId("pr"),
        leftKeyframeId: previousKeyframe.id,
        rightKeyframeId: newKeyframe.id,
        text: ""
      };
      this.state.prompts.push(newPrompt);
      this.state.selectedPromptId = newPrompt.id;
    }

    this.#saveNow();
    return {
      keyframeId: newKeyframe.id,
      promptId: this.state.selectedPromptId
    };
  }

  resetAll() {
    this.state = this.#buildDefaultState();
    this.storageManager.clearState();
  }

  #buildDefaultState() {
    return {
      version: 1,
      projectTitle: DEFAULT_TITLE,
      selectedPromptId: null,
      keyframes: [],
      prompts: [],
      counters: {
        keyframe: 0,
        prompt: 0,
        image: 0
      }
    };
  }

  #normalizeState(persisted) {
    const fallback = this.#buildDefaultState();
    const counters = persisted.counters || {};

    return {
      version: 1,
      projectTitle: typeof persisted.projectTitle === "string" ? persisted.projectTitle : fallback.projectTitle,
      selectedPromptId: typeof persisted.selectedPromptId === "string" ? persisted.selectedPromptId : null,
      keyframes: Array.isArray(persisted.keyframes) ? persisted.keyframes : [],
      prompts: Array.isArray(persisted.prompts) ? persisted.prompts : [],
      counters: {
        keyframe: Number.isInteger(counters.keyframe) ? counters.keyframe : 0,
        prompt: Number.isInteger(counters.prompt) ? counters.prompt : 0,
        image: Number.isInteger(counters.image) ? counters.image : 0
      }
    };
  }

  #nextId(kind) {
    if (kind === "kf") {
      this.state.counters.keyframe += 1;
      return `kf_${String(this.state.counters.keyframe).padStart(3, "0")}`;
    }

    this.state.counters.prompt += 1;
    return `pr_${String(this.state.counters.prompt).padStart(3, "0")}`;
  }

  nextImageKey() {
    this.state.counters.image += 1;
    return `img_kf_${String(this.state.counters.image).padStart(3, "0")}`;
  }

  #debouncedSave() {
    window.clearTimeout(this.saveTimerId);
    this.saveTimerId = window.setTimeout(() => {
      this.storageManager.saveState(this.state);
    }, SAVE_DEBOUNCE_MS);
  }

  #saveNow() {
    window.clearTimeout(this.saveTimerId);
    this.storageManager.saveState(this.state);
  }
}
