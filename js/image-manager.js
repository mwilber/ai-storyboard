import { IMAGE_CACHE_NAME } from "./config.js";

/**
 * Manages upload validation, image blob caching, and cache retrieval.
 */
export class ImageManager {
  /**
   * @param {string} [cacheName=IMAGE_CACHE_NAME] - Cache API namespace for keyframe images.
   */
  constructor(cacheName = IMAGE_CACHE_NAME) {
    this.cacheName = cacheName;
  }

  /**
   * Opens the image cache bucket.
   * @returns {Promise<Cache>} Cache instance for storyboard images.
   */
  async openCache() {
    return caches.open(this.cacheName);
  }

  /**
   * Checks whether a selected file is a browser-displayable image.
   * @param {File|null|undefined} file - Candidate uploaded file.
   * @returns {boolean} True when the file has an image MIME type.
   */
  isValidImage(file) {
    return Boolean(file && typeof file.type === "string" && file.type.startsWith("image/"));
  }

  /**
   * Stores an image file blob in Cache API using a deterministic key.
   * @param {File} file - Uploaded image file.
   * @param {string} imageKey - Unique cache key for the image.
   * @returns {Promise<void>}
   */
  async cacheImage(file, imageKey) {
    const cache = await this.openCache();
    const request = new Request(this.#buildImageUrl(imageKey));
    const response = new Response(file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream"
      }
    });

    await cache.put(request, response);
  }

  /**
   * Retrieves a cached image and returns a temporary object URL for rendering.
   * @param {string} imageKey - Cache key associated with a keyframe image.
   * @returns {Promise<string|null>} Blob URL when found, otherwise null.
   */
  async getImageBlobUrl(imageKey) {
    const blob = await this.getImageBlob(imageKey);
    if (!blob) {
      return null;
    }

    return URL.createObjectURL(blob);
  }

  /**
   * Retrieves the raw image blob for a cached keyframe image.
   * @param {string} imageKey - Cache key associated with a keyframe image.
   * @returns {Promise<Blob|null>} Cached image blob when found, otherwise null.
   */
  async getImageBlob(imageKey) {
    const cache = await this.openCache();
    const request = new Request(this.#buildImageUrl(imageKey));
    const response = await cache.match(request);
    if (!response) {
      return null;
    }

    return response.blob();
  }

  /**
   * Retrieves a cached image and returns an embedded data URL for static export.
   * @param {string} imageKey - Cache key associated with a keyframe image.
   * @returns {Promise<string|null>} Image data URL when found, otherwise null.
   */
  async getImageDataUrl(imageKey) {
    const blob = await this.getImageBlob(imageKey);
    if (!blob) {
      return null;
    }

    return this.#blobToDataUrl(blob);
  }

  /**
   * Deletes the entire storyboard image cache bucket.
   * @returns {Promise<void>}
   */
  async clearCachedImages() {
    await caches.delete(this.cacheName);
  }

  /**
   * Creates an internal request path for cache operations.
   * @param {string} imageKey - Key for the cached image.
   * @returns {string} Cache request URL.
   */
  #buildImageUrl(imageKey) {
    return `/__storyboard_cache__/${encodeURIComponent(imageKey)}`;
  }

  /**
   * Converts a blob to a data URL payload.
   * @param {Blob} blob - Image blob to encode.
   * @returns {Promise<string>} Encoded data URL string.
   */
  #blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("Failed to encode blob as data URL."));
      };
      reader.onerror = () => reject(reader.error || new Error("Failed to read blob."));
      reader.readAsDataURL(blob);
    });
  }
}
