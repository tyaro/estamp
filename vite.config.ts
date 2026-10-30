import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import sveltePreprocess from "svelte-preprocess";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    svelte({
      preprocess: [
        sveltePreprocess({
          typescript: true,
        }),
      ],
    }),
  ],
  // Define an explicit disabled value so production tree-shaking removes the
  // measurement body even when the environment variable is absent.
  define: {
    'import.meta.env.VITE_PR05_MEASURE': JSON.stringify(process.env.VITE_PR05_MEASURE === '1' ? '1' : '0'),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // prevent vite from obscuring rust errors
  clearScreen: false,
  // tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
  },
  // Expose TAURI_ENV_DEBUG and other Tauri build environment variables to the frontend.
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // Tauri supports es2021
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    // don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
