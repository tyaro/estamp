// Run from the repository root: node outputs/pr01-image-ipc-smoke4.mjs
// Tests the installed JS packages with mocked IPC; no OS clipboard access.
import assert from 'node:assert/strict';
import { Image } from '@tauri-apps/api/image';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';

const rgba = new Uint8Array([255, 0, 0, 255]);
const calls = [];
globalThis.window = {
  __TAURI_INTERNALS__: {
    async invoke(command, args) {
      calls.push({ command, args });
      if (command === 'plugin:image|new') return 42;
      if (command === 'plugin:clipboard-manager|write_image') return;
      if (command === 'plugin:resources|close') return;
      throw new Error(`Unexpected command: ${command}`);
    },
  },
};

try {
  const image = await Image.new(rgba, 1, 1);
  try {
    await writeImage(image);
  } finally {
    await image.close();
  }
  assert.deepEqual(calls, [
    { command: 'plugin:image|new', args: { rgba, width: 1, height: 1 } },
    { command: 'plugin:clipboard-manager|write_image', args: { image: 42 } },
    { command: 'plugin:resources|close', args: { rid: 42 } },
  ]);
  console.log('PASS: RGBA -> Image resource ID -> write_image -> close');
  console.log('PASS: clipboard-manager recognizes the shared API Image class');
  console.log('Scope: mocked JS IPC; WebView, ACL, OS clipboard and image quality are not tested.');
} finally {
  delete globalThis.window;
}
