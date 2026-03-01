import { App } from "./app.js";

const root = document.getElementById("app-root");

if (!root) {
  throw new Error("Missing #app-root");
}

const app = new App(root);
app.start();
