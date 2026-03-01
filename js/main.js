import { App } from "./app.js";

/**
 * Root mount node for the AI Storyboard SPA.
 * @type {HTMLElement|null}
 */
const root = document.getElementById("app-root");

if (!root) {
  throw new Error("Missing #app-root");
}

/**
 * App instance bootstrapped from the DOM root.
 * @type {App}
 */
const app = new App(root);
app.start();
