/**
 * Scroll animation mode used when centering prompt tiles.
 * @type {ScrollBehavior}
 */
const SCROLL_BEHAVIOR = "smooth";

/**
 * Returns the storyboard rail element.
 * @returns {HTMLElement|null} Rail element when present.
 */
function getRailElement() {
  const rail = document.querySelector('[data-rail="true"]');
  return rail instanceof HTMLElement ? rail : null;
}

/**
 * Returns all prompt tile elements currently rendered in the rail.
 * @returns {HTMLElement[]} Prompt tiles in DOM order.
 */
function getPromptTiles() {
  return [...document.querySelectorAll("[data-prompt-id]")].filter(
    (node) => node instanceof HTMLElement
  );
}

/**
 * Scrolls the rail so the target tile is centered.
 * @param {HTMLElement} rail - Horizontal storyboard rail.
 * @param {HTMLElement} tile - Tile to center in the viewport.
 * @returns {void}
 */
function centerTileInRail(rail, tile) {
  const targetLeft = tile.offsetLeft - (rail.clientWidth - tile.clientWidth) / 2;
  rail.scrollTo({
    left: Math.max(0, targetLeft),
    behavior: SCROLL_BEHAVIOR
  });
}

/**
 * Finds the prompt id closest to the rail viewport center.
 * @param {HTMLElement} rail - Horizontal storyboard rail.
 * @returns {string|null} Center-most prompt id, or null when unavailable.
 */
function getCenteredPromptId(rail) {
  const promptTiles = getPromptTiles();
  if (promptTiles.length === 0) {
    return null;
  }

  const railCenter = rail.scrollLeft + rail.clientWidth / 2;
  let closestPromptId = null;
  let smallestDistance = Number.POSITIVE_INFINITY;

  promptTiles.forEach((tile) => {
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
 * Applies active-page visual state based on prompt id mapping.
 * @param {string|null} promptId - Prompt id to highlight in pagination.
 * @returns {void}
 */
function updatePaginationHighlight(promptId) {
  const buttons = [...document.querySelectorAll(".page-btn")].filter(
    (node) => node instanceof HTMLElement
  );

  buttons.forEach((button) => {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    if (promptId && button.dataset.promptId === promptId) {
      button.setAttribute("aria-current", "page");
      return;
    }

    button.removeAttribute("aria-current");
  });
}

/**
 * Enables pagination button behavior for static exported pages.
 * @param {HTMLElement} rail - Horizontal storyboard rail.
 * @returns {void}
 */
function attachPaginationNavigation(rail) {
  const buttons = [...document.querySelectorAll(".page-btn")].filter(
    (node) => node instanceof HTMLButtonElement
  );

  buttons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.addEventListener("click", () => {
      const promptId = button.dataset.promptId || "";
      if (!promptId) {
        return;
      }

      const promptTile = document.querySelector(`[data-prompt-id="${CSS.escape(promptId)}"]`);
      if (!(promptTile instanceof HTMLElement)) {
        return;
      }

      centerTileInRail(rail, promptTile);
      const promptInput = promptTile.querySelector(".prompt-input");
      if (promptInput instanceof HTMLTextAreaElement) {
        promptInput.focus({ preventScroll: true });
      }
      updatePaginationHighlight(promptId);
    });
  });
}

/**
 * Routes wheel delta input to horizontal scrolling on the rail.
 * @param {HTMLElement} rail - Horizontal storyboard rail.
 * @returns {void}
 */
function attachWheelHorizontalScroll(rail) {
  rail.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const textArea = target.closest(".prompt-input");
      if (textArea instanceof HTMLTextAreaElement && textArea.scrollHeight > textArea.clientHeight) {
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
 * Tracks rail scroll movement and syncs active pagination state.
 * @param {HTMLElement} rail - Horizontal storyboard rail.
 * @returns {void}
 */
function attachSelectionTracking(rail) {
  /** @type {number|null} */
  let rafId = null;

  const syncSelection = () => {
    rafId = null;
    updatePaginationHighlight(getCenteredPromptId(rail));
  };

  rail.addEventListener("scroll", () => {
    if (rafId !== null) {
      return;
    }
    rafId = window.requestAnimationFrame(syncSelection);
  });

  syncSelection();
}

/**
 * Initializes static-export navigation bindings.
 * @returns {void}
 */
function initExportWebpage() {
  const rail = getRailElement();
  if (!rail) {
    return;
  }

  attachPaginationNavigation(rail);
  attachWheelHorizontalScroll(rail);
  attachSelectionTracking(rail);
}

document.addEventListener("DOMContentLoaded", initExportWebpage);
