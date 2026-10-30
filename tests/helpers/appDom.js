import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { compile } from 'svelte/compiler';
import { writable } from 'svelte/store';
import ts from 'typescript';
import * as dates from '../../src/date.js';
import { saveSettings, settingsSnapshot } from '../../src/save.js';
import { hasLongStampLine, splitStampText, validateImageSettings } from '../../src/stampImage.js';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../../src/App.svelte', import.meta.url), 'utf8');
const javascript = source.replace(/<script lang="ts">([\s\S]*?)<\/script>/, (_, script) =>
  `<script>${ts.transpileModule(script, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, preserveValueImports: true },
  }).outputText}</script>`);
const compiled = compile(javascript, { css: false, format: 'cjs' }).js.code;

// A minimal DOM boundary for the real Svelte compiler/runtime. Value writes are
// counted separately from native user edits; this cannot exercise an OS IME.
class Node {
  constructor(name, data = '') {
    this.nodeName = name;
    this.data = data;
    this.childNodes = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = { add() {}, remove() {} };
    this.nativeValue = '';
    this.valueWrites = 0;
  }
  get value() { return this.nativeValue; }
  set value(value) { this.valueWrites++; this.nativeValue = String(value ?? ''); }
  get id() { return this.getAttribute('id'); }
  get options() { return this.childNodes.filter(node => node.nodeName === 'OPTION'); }
  get textContent() { return this.nodeName === '#text' ? this.data : this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value) {
    for (const child of [...this.childNodes]) this.removeChild(child);
    this.appendChild(new Node('#text', String(value)));
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus(options) { if (this.ownerDocument) this.ownerDocument.activeElement = this; this.focused = true; this.focusOptions = options; }
  scrollIntoView(options) { this.scrolled = true; this.scrollOptions = options; }
  appendChild(node) { this.insertBefore(node, null); }
  insertBefore(node, anchor) {
    node.parentNode?.removeChild(node);
    this.childNodes.splice(anchor ? this.childNodes.indexOf(anchor) : this.childNodes.length, 0, node);
    node.parentNode = this;
  }
  removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  dispatch(name, properties = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...properties };
    for (let node = this; node; node = node.parentNode) {
      event.currentTarget = node;
      for (const callback of node.listeners.get(name) ?? []) callback.call(node, event);
    }
    return event;
  }
}

export async function mountApp(initialSettings, {
  persist = async config => JSON.stringify(config), revision = null, clipboard, hintLaunchCount = 0, warning = null, native, fontError,
} = {}) {
  let now = new Date(2025, 11, 31, 23, 59, 59);
  const elements = [];
  const commands = [];
  let menuListener;
  const document = new Node('#document');
  document.createElement = name => {
    const node = new Node(name.toUpperCase());
    node.ownerDocument = document;
    elements.push(node);
    return node;
  };
  document.createTextNode = data => new Node('#text', String(data));
  document.createElementNS = (_namespace, name) => document.createElement(name);
  const timers = [];
  const window = new Node('#window');
  window.setInterval = callback => { timers.push(callback); return timers.length; };
  window.clearInterval = () => {};
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  window.performance = { now: () => 0 };
  const runtime = {};
  vm.runInNewContext(readFileSync(require.resolve('svelte/internal'), 'utf8'), {
    exports: runtime, document, window, console, setTimeout, clearTimeout,
  });
  class Licenses extends runtime.SvelteComponent {
    constructor(options) {
      super();
      runtime.init(this, options, null, () => ({ c() {}, m() {}, p() {}, d() {} }), runtime.safe_not_equal, {});
    }
  }
  const settings = writable(initialSettings);
  const imports = {
    'svelte/internal': runtime,
    svelte: runtime,
    './store': { settings },
    './date.js': {
      ...dates, todayState: () => dates.todayState(now),
      restoreDate: config => dates.restoreDate(config, now),
      refreshDate: state => dates.refreshDate(state, now),
    },
    './save.js': { saveSettings, settingsSnapshot },
    // Keep fonts pending unless testing copy. Empty SVG avoids needing an HTML
    // parser; only rasterization and Tauri are faked for those UI tests.
    './fonts.js': { loadStampFonts: () => fontError ? Promise.reject(new Error(fontError)) : clipboard ? Promise.resolve() : new Promise(() => {}), loadUiFonts: async () => {} },
    './stampImage.js': { hasLongStampLine, splitStampText, validateImageSettings, buildStampSvg: () => '',
      renderStampImage: async () => ({ rgba: new Uint8Array(4), width: 1, height: 1 }) },
    './performance.js': { markPerformance() {} },
    './Licenses.svelte': { default: Licenses },
    '../package.json': { version: 'test' },
    '@tauri-apps/api/core': { invoke: async (command, args) => {
      commands.push({ command, args });
      if (native) { const result = await native(command, args); if (result !== undefined) return result; }
      return command === 'load' ? { settings: initialSettings, revision, warning, hint_launch_count: hintLaunchCount }
        : command === 'save' ? persist(args.config) : false;
    } },
    '@tauri-apps/api/event': { listen: async (_name, callback) => { menuListener = callback; return () => { menuListener = undefined; }; } },
    '@tauri-apps/api/image': { Image: { new: async () => ({ close: async () => {} }) } },
    '@tauri-apps/plugin-clipboard-manager': { writeImage: clipboard },
  };
  const context = vm.createContext({
    exports: {}, document, window, requestAnimationFrame() {},
    require: name => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
  });
  vm.runInContext(compiled, context);
  const root = new Node('ROOT');
  document.parentNode = window;
  document.appendChild(root);
  const component = new context.exports.default({ target: root });
  await new Promise(setImmediate);
  await runtime.tick();
  return {
    input: id => elements.find(node => node.id === id), settings,
    button: text => elements.find(node => node.nodeName === 'BUTTON' && node.textContent === text),
    elements: predicate => elements.filter(node => node.parentNode && predicate(node)),
    element: predicate => elements.find(node => node.parentNode && predicate(node)),
    tick: async () => { await new Promise(setImmediate); await runtime.tick(); }, timer: () => timers[0](),
    focus: () => window.dispatch('focus'),
    keydown: properties => window.dispatch('keydown', properties),
    keyup: properties => window.dispatch('keyup', properties),
    contextmenu: properties => window.dispatch('contextmenu', properties),
    menu: async payload => { menuListener?.({ payload }); await new Promise(setImmediate); await runtime.tick(); },
    commands, document,
    resume: () => document.dispatch('visibilitychange'),
    advance: value => { now = value; },
    destroy: () => component.$destroy(),
  };
}
