import "./app.postcss";
// import "./styles.css";
import App from "./App.svelte";
import '@skeletonlabs/skeleton/themes/theme-skeleton.css';
import '@skeletonlabs/skeleton/styles/all.css';

const app = new App({
  target: document.getElementById("app"),
});

export default app;
