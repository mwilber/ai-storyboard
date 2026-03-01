import { SAVE_DEBOUNCE_MS } from "./config.js";

/**
 * Default title used for a new storyboard or empty title commits.
 * @type {string}
 */
const DEFAULT_TITLE = "Project Title";

/**
 * @typedef {object} KeyframeEntity
 * @property {string} id - Stable keyframe identifier.
 * @property {string} imageKey - Cache API key for the keyframe image blob.
 * @property {number} createdAt - Unix timestamp in milliseconds.
 */

/**
 * @typedef {object} PromptEntity
 * @property {string} id - Stable prompt identifier.
 * @property {string} leftKeyframeId - Keyframe id on the left side of this prompt.
 * @property {string} rightKeyframeId - Keyframe id on the right side of this prompt.
 * @property {string} text - Prompt text content.
 */

/**
 * @typedef {object} StoryboardCounters
 * @property {number} keyframe - Counter for keyframe IDs.
 * @property {number} prompt - Counter for prompt IDs.
 * @property {number} image - Counter for image cache keys.
 */

/**
 * @typedef {object} StoryboardState
 * @property {number} version - Serialized state schema version.
 * @property {string} projectTitle - Current project title.
 * @property {string|null} selectedPromptId - Active prompt selection for pagination and focus.
 * @property {KeyframeEntity[]} keyframes - Ordered keyframe entities.
 * @property {PromptEntity[]} prompts - Ordered prompt entities.
 * @property {StoryboardCounters} counters - Monotonic counters for deterministic ID generation.
 */

/**
 * Owns canonical app state and persistence orchestration for state mutations.
 */
export class StateManager {
  /**
   * @param {import("./storage-manager.js").StorageManager} storageManager - Persistence adapter for JSON state.
   */
  constructor(storageManager) {
    this.storageManager = storageManager;
    /** @type {StoryboardState} */
    this.state = this.#buildDefaultState();
    /** @type {number|null} */
    this.saveTimerId = null;
  }

  /**
   * Loads any persisted state into memory and normalizes shape defaults.
   * @returns {void}
   */
  initialize() {
    const persisted = this.storageManager.loadState();
    if (persisted && typeof persisted === "object") {
      this.state = this.#normalizeState(persisted);
    }
  }

  /**
   * Returns the current in-memory storyboard state.
   * @returns {StoryboardState}
   */
  getState() {
    return this.state;
  }

  /**
   * Updates the project title and persists using debounced save.
   * @param {string} titleText - Next title value.
   * @returns {void}
   */
  setProjectTitle(titleText) {
    this.state.projectTitle = titleText;
    this.#debouncedSave();
  }

  /**
   * Sets the active prompt selection and saves immediately.
   * @param {string|null} promptId - Prompt identifier or null to clear selection.
   * @returns {void}
   */
  setSelectedPromptId(promptId) {
    this.state.selectedPromptId = promptId;
    this.#saveNow();
  }

  /**
   * Updates prompt text by prompt identifier with debounced persistence.
   * @param {string} promptId - Prompt entity identifier.
   * @param {string} promptText - Updated text value.
   * @returns {void}
   */
  updatePrompt(promptId, promptText) {
    const prompt = this.state.prompts.find((item) => item.id === promptId);
    if (!prompt) {
      return;
    }

    prompt.text = promptText;
    this.#debouncedSave();
  }

  /**
   * Adds a keyframe and, when applicable, appends the adjacent prompt segment.
   * @param {string} imageKey - Cache API image key for the new keyframe.
   * @returns {Promise<{keyframeId: string, promptId: string|null}>} Created entity IDs.
   */
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

  /**
   * Resets in-memory state and clears persisted localStorage state.
   * @returns {void}
   */
  resetAll() {
    this.state = this.#buildDefaultState();
    this.storageManager.clearState();
  }

  /**
   * Creates a new default application state object.
   * @returns {StoryboardState}
   */
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

  /**
   * Normalizes a persisted state payload into the expected runtime structure.
   * @param {unknown} persisted - Raw deserialized state object.
   * @returns {StoryboardState}
   */
  #normalizeState(persisted) {
    const fallback = this.#buildDefaultState();
    const safePersisted = /** @type {Record<string, unknown>} */ (persisted);
    const counters = /** @type {Record<string, unknown>} */ (safePersisted.counters || {});

    return {
      version: 1,
      projectTitle: typeof safePersisted.projectTitle === "string" ? safePersisted.projectTitle : fallback.projectTitle,
      selectedPromptId: typeof safePersisted.selectedPromptId === "string" ? safePersisted.selectedPromptId : null,
      keyframes: Array.isArray(safePersisted.keyframes) ? safePersisted.keyframes : [],
      prompts: Array.isArray(safePersisted.prompts) ? safePersisted.prompts : [],
      counters: {
        keyframe: Number.isInteger(counters.keyframe) ? counters.keyframe : 0,
        prompt: Number.isInteger(counters.prompt) ? counters.prompt : 0,
        image: Number.isInteger(counters.image) ? counters.image : 0
      }
    };
  }

  /**
   * Produces the next deterministic entity identifier.
   * @param {"kf"|"pr"} kind - Entity kind used to select the counter prefix.
   * @returns {string} Next generated ID.
   */
  #nextId(kind) {
    if (kind === "kf") {
      this.state.counters.keyframe += 1;
      return `kf_${String(this.state.counters.keyframe).padStart(3, "0")}`;
    }

    this.state.counters.prompt += 1;
    return `pr_${String(this.state.counters.prompt).padStart(3, "0")}`;
  }

  /**
   * Produces the next deterministic image cache key.
   * @returns {string} Next generated image key.
   */
  nextImageKey() {
    this.state.counters.image += 1;
    return `img_kf_${String(this.state.counters.image).padStart(3, "0")}`;
  }

  /**
   * Queues a debounced save for text-heavy input operations.
   * @returns {void}
   */
  #debouncedSave() {
    window.clearTimeout(this.saveTimerId);
    this.saveTimerId = window.setTimeout(() => {
      this.storageManager.saveState(this.state);
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Persists state immediately, cancelling any pending debounced save.
   * @returns {void}
   */
  #saveNow() {
    window.clearTimeout(this.saveTimerId);
    this.storageManager.saveState(this.state);
  }
}
