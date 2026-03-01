import { IMAGE_CACHE_NAME } from "./config.js";

export class ImageManager {
  constructor(cacheName = IMAGE_CACHE_NAME) {
    this.cacheName = cacheName;
  }

  async openCache() {
    return caches.open(this.cacheName);
  }

  isValidImage(file) {
    return Boolean(file && typeof file.type === "string" && file.type.startsWith("image/"));
  }

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

  async getImageBlobUrl(imageKey) {
    const cache = await this.openCache();
    const request = new Request(this.#buildImageUrl(imageKey));
    const response = await cache.match(request);
    if (!response) {
      return null;
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  async clearCachedImages() {
    await caches.delete(this.cacheName);
  }

  #buildImageUrl(imageKey) {
    return `/__storyboard_cache__/${encodeURIComponent(imageKey)}`;
  }
}
