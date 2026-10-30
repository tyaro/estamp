import App from "./App.svelte";
import './theme.css';
import "./app.postcss";

const app = new App({
  target: document.getElementById("app"),
});

export default app;
