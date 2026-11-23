import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  createCopilotDrawer,
  clampDrawerWidth,
  COPILOT_DRAWER_WIDTH_STORAGE_KEY,
  COPILOT_DRAWER_DEFAULT_WIDTH,
  COPILOT_DRAWER_MIN_WIDTH,
  COPILOT_DRAWER_MAX_WIDTH
} from "../src/ui/ai/index.js";

function splitSelector(selector: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inBracket = false;
  let quoteChar = "";

  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!;
    if ((ch === "'" || ch === '"') && inBracket) {
      if (quoteChar === ch) {
        quoteChar = "";
      } else if (!quoteChar) {
        quoteChar = ch;
      }
      current += ch;
    } else if (ch === "[" && !quoteChar) {
      inBracket = true;
      current += ch;
    } else if (ch === "]" && !quoteChar) {
      inBracket = false;
      current += ch;
    } else if (/\s/.test(ch) && !inBracket && !quoteChar) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    tokens.push(current.trim());
  }
  return tokens;
}

class MockDOMElement {
  children: MockDOMElement[] = [];
  parentNode: MockDOMElement | null = null;
  tagName = "DIV";
  className = "";
  title = "";
  private _textContent = "";
  private _innerHTML = "";
  value = "";
  placeholder = "";
  type = "";
  rows = 0;
  disabled = false;
  tabIndex = 0;
  scrollTop = 0;
  scrollHeight = 100;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners: Record<string, Function[]> = {};
  private _styles: Record<string, string> = {};

  capturedPointers: number[] = [];
  releasedPointers: number[] = [];

  setPointerCapture(id: number) {
    this.capturedPointers.push(id);
  }
  releasePointerCapture(id: number) {
    this.releasedPointers.push(id);
  }

  style: any = {
    width: "",
    setProperty: (name: string, val: string) => {
      this._styles[name] = val;
    },
    removeProperty: (name: string) => {
      delete this._styles[name];
    },
    getPropertyValue: (name: string) => {
      return this._styles[name] ?? "";
    }
  };

  getBoundingClientRect() {
    return {
      left: 100,
      top: 50,
      width: 800,
      height: 600,
      right: 900,
      bottom: 650,
      x: 100,
      y: 50,
      toJSON: () => {}
    };
  }

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(html: string) {
    this._innerHTML = html;
    if (html === "") {
      this.children = [];
    }
  }

  get textContent(): string {
    if (this.children.length === 0) {
      if (this._textContent) return this._textContent;
      if (this._innerHTML) return this._innerHTML.replace(/<[^>]+>/g, "");
      return "";
    }
    return this.children.map((c) => c.textContent).join("");
  }
  set textContent(val: string) {
    this._textContent = val;
    this._innerHTML = val;
  }

  classList = {
    add: (...classes: string[]) => {
      const current = new Set(this.className.split(" ").filter(Boolean));
      classes.forEach((c) => current.add(c));
      this.className = Array.from(current).join(" ");
    },
    remove: (...classes: string[]) => {
      const current = new Set(this.className.split(" ").filter(Boolean));
      classes.forEach((c) => current.delete(c));
      this.className = Array.from(current).join(" ");
    },
    contains: (c: string) => {
      return this.className.split(" ").includes(c);
    }
  };

  addEventListener(type: string, fn: Function) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type]!.push(fn);
  }
  removeEventListener(type: string, fn: Function) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type]!.filter((f) => f !== fn);
    }
  }
  dispatchEvent(event: { type: string; [k: string]: any }) {
    const enrichedEvent = {
      target: this,
      stopPropagation: () => {},
      preventDefault: () => {},
      ...event
    };
    const fns = [...(this.listeners[event.type] || [])];
    fns.forEach((fn) => fn(enrichedEvent));
  }
  click() {
    this.dispatchEvent({
      type: "click",
      target: this,
      stopPropagation: () => {},
      preventDefault: () => {}
    });
  }
  focus() {
    this.dispatchEvent({
      type: "focus",
      target: this,
      stopPropagation: () => {},
      preventDefault: () => {}
    });
  }
  setAttribute(name: string, val: string) {
    this.attributes[name] = val;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[key] = val;
    }
  }
  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }
  appendChild(child: MockDOMElement) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  append(...children: (MockDOMElement | string)[]) {
    for (const c of children) {
      if (typeof c === "string") {
        const textNode = new MockDOMElement();
        textNode.textContent = c;
        this.appendChild(textNode);
      } else if (c) {
        this.appendChild(c);
      }
    }
  }
  removeChild(child: MockDOMElement) {
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }
  querySelector(selector: string): MockDOMElement | null {
    const tokens = splitSelector(selector);
    if (tokens.length > 1) {
      let current: MockDOMElement | null = this;
      for (const token of tokens) {
        if (!current) return null;
        const all = current.querySelectorAll(token);
        current = all[0] ?? null;
      }
      return current;
    }
    const all = this.querySelectorAll(selector);
    return all[0] ?? null;
  }
  querySelectorAll(selector: string): MockDOMElement[] {
    const results: MockDOMElement[] = [];
    const match = (el: MockDOMElement): boolean => {
      const tagMatch = selector.match(/^([a-zA-Z0-9]+)/);
      if (tagMatch && tagMatch[1]) {
        if (el.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;
      }
      const classMatches = selector.match(/\.([a-zA-Z0-9_-]+)/g);
      if (classMatches && classMatches.length > 0) {
        for (const cm of classMatches) {
          const cls = cm.slice(1);
          if (!el.className.split(" ").includes(cls)) return false;
        }
      }
      const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        if (el.attributes["id"] !== idMatch[1]) return false;
      }
      const attrMatch = selector.match(/\[([a-zA-Z0-9_-]+)=['"]?([^'"\]]+)['"]?\]/);
      if (attrMatch && attrMatch[1] && attrMatch[2]) {
        const attr = attrMatch[1];
        const val = attrMatch[2];
        if (attr.startsWith("data-")) {
          const key = attr.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
          if (el.dataset[key] !== val) return false;
        } else if (el.attributes[attr] !== val) {
          return false;
        }
      }
      return Boolean(tagMatch || (classMatches && classMatches.length > 0) || idMatch || attrMatch);
    };
    const traverse = (el: MockDOMElement) => {
      for (const child of el.children) {
        if (match(child)) results.push(child);
        traverse(child);
      }
    };
    traverse(this);
    return results;
  }
}

function setupMockDom(savedStorage: Record<string, string> = {}) {
  const store = { ...savedStorage };
  const mockLocalStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    get _store() {
      return store;
    }
  };

  const windowListeners: Record<string, Function[]> = {};
  const mockWindow = {
    innerWidth: 1024,
    innerHeight: 768,
    localStorage: mockLocalStorage,
    addEventListener: (type: string, fn: Function) => {
      windowListeners[type] = windowListeners[type] || [];
      windowListeners[type]!.push(fn);
    },
    removeEventListener: (type: string, fn: Function) => {
      if (windowListeners[type]) {
        windowListeners[type] = windowListeners[type]!.filter((f) => f !== fn);
      }
    },
    dispatchEvent: (event: { type: string; [k: string]: any }) => {
      const fns = [...(windowListeners[event.type] || [])];
      fns.forEach((fn) => fn(event));
    }
  };

  const mockBody = new MockDOMElement();
  mockBody.tagName = "BODY";
  mockBody.className = "mock-body";

  const mockDocument = {
    body: mockBody,
    createElement: (tag = "div") => {
      const el = new MockDOMElement();
      el.tagName = tag.toUpperCase();
      return el;
    },
    createElementNS: (_ns: string, tag = "div") => {
      const el = new MockDOMElement();
      el.tagName = tag.toUpperCase();
      return el;
    },
    createTextNode: (text: string) => {
      const el = new MockDOMElement();
      el.textContent = text;
      return el;
    }
  };

  const oldWindow = (globalThis as any).window;
  const oldDocument = (globalThis as any).document;

  (globalThis as any).window = mockWindow;
  (globalThis as any).document = mockDocument;

  return {
    mockWindow,
    mockBody,
    mockLocalStorage,
    restore: () => {
      (globalThis as any).window = oldWindow;
      (globalThis as any).document = oldDocument;
    }
  };
}

test("clampDrawerWidth: mathematical boundary correctness", () => {
  // Test lower bound clamping to 280
  assert.equal(clampDrawerWidth(100, 1024), 280);
  assert.equal(clampDrawerWidth(279, 1024), 280);
  assert.equal(clampDrawerWidth(280, 1024), 280);

  // Test standard in-bounds
  assert.equal(clampDrawerWidth(400, 1024), 400);
  assert.equal(clampDrawerWidth(550, 1024), 550);
  assert.equal(clampDrawerWidth(720, 1024), 720);

  // Test upper bound clamping to 720 on wide screens
  assert.equal(clampDrawerWidth(750, 1024), 720);
  assert.equal(clampDrawerWidth(1200, 1920), 720);

  // Test clamping on constrained viewport (innerWidth - 80)
  // Viewport 600 -> max width = 600 - 80 = 520
  assert.equal(clampDrawerWidth(600, 600), 520);
  assert.equal(clampDrawerWidth(500, 600), 500);

  // Viewport 320 -> 320 - 80 = 240, but min is 280, so clamped to 280
  assert.equal(clampDrawerWidth(200, 320), 280);
  assert.equal(clampDrawerWidth(350, 320), 280);
});

test("CopilotDrawer: sheet has header and drawer mode has floating actions with lh-no-drag and no header", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();

    const drawer = createCopilotDrawer({
      mode: "memory-lab",
      initialState: "sheet",
      targetContainer: container as any
    });

    // Check Sheet mode
    const sheetHeader = container.querySelector(".copilot-panel-header")!;
    assert.ok(sheetHeader);
    assert.ok(sheetHeader.classList.contains("lh-no-drag"), "Sheet header must have lh-no-drag");
    assert.ok(!sheetHeader.classList.contains("lh-wco-gutter"), "Sheet header should not have lh-wco-gutter");

    const sheetActions = container.querySelector(".copilot-header-actions")!;
    assert.ok(sheetActions.classList.contains("lh-no-drag"), "Sheet header actions must have lh-no-drag");

    const sheetBtnHistory = container.querySelector(".copilot-btn-history")!;
    assert.ok(sheetBtnHistory.classList.contains("lh-no-drag"), "History btn must have lh-no-drag");

    const sheetBtnDock = container.querySelector(".copilot-btn-dock")!;
    assert.ok(sheetBtnDock.classList.contains("lh-no-drag"), "Dock btn must have lh-no-drag");

    const sheetBtnClose = container.querySelector(".copilot-btn-close")!;
    assert.ok(sheetBtnClose.classList.contains("lh-no-drag"), "Close btn must have lh-no-drag");

    const sheetBtnExpand = container.querySelector(".copilot-btn-expand")!;
    assert.ok(sheetBtnExpand.classList.contains("lh-no-drag"), "Expand btn must have lh-no-drag");

    // Transition to Drawer mode
    drawer.setState("drawer");

    // In drawer mode: header bar (title "Assistente OS" and mode badge) must be completely eliminated
    const drawerHeader = container.querySelector(".copilot-panel-header");
    assert.equal(drawerHeader, null, "Drawer mode must eliminate .copilot-panel-header");

    const drawerTitle = container.querySelector(".copilot-header-title");
    assert.equal(drawerTitle, null, "Drawer mode must eliminate .copilot-header-title");

    const drawerBadge = container.querySelector(".copilot-badge-mode");
    assert.equal(drawerBadge, null, "Drawer mode must eliminate .copilot-badge-mode");

    // Floating actions group and buttons must exist with .lh-no-drag
    const floatingActions = container.querySelector(".copilot-floating-actions")!;
    assert.ok(floatingActions, "Drawer mode must render .copilot-floating-actions");
    assert.ok(floatingActions.classList.contains("lh-no-drag"), "Floating actions must have lh-no-drag");

    const drawerBtnHistory = floatingActions.querySelector(".copilot-btn-history")!;
    assert.ok(drawerBtnHistory, "Floating actions must contain History button");
    assert.ok(drawerBtnHistory.classList.contains("lh-no-drag"), "Drawer history btn must have lh-no-drag");

    const drawerBtnDock = floatingActions.querySelector(".copilot-btn-dock")!;
    assert.ok(drawerBtnDock, "Floating actions must contain Dock toggle button");
    assert.ok(drawerBtnDock.classList.contains("lh-no-drag"), "Drawer dock btn must have lh-no-drag");

    const drawerBtnClose = floatingActions.querySelector(".copilot-btn-close")!;
    assert.ok(drawerBtnClose, "Floating actions must contain Close button");
    assert.ok(drawerBtnClose.classList.contains("lh-no-drag"), "Drawer close btn must have lh-no-drag");

    // Chat body in drawer mode must have top padding (padding-top: 52px)
    const chatBody = container.querySelector(".copilot-chat-body")!;
    assert.ok(chatBody);
    assert.equal(chatBody.style.paddingTop, "52px", "Chat body in drawer mode should have padding-top: 52px");

    drawer.destroy();
  } finally {
    env.restore();
  }
});


test("CopilotDrawer: resizable dock handle attributes and default width", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();

    const drawer = createCopilotDrawer({
      mode: "cpu-lab",
      initialState: "drawer",
      targetContainer: container as any
    });

    const panel = container.querySelector(".copilot-container-drawer")!;
    assert.ok(panel);
    assert.equal(panel.style.width, "400px");
    assert.equal(container.style.getPropertyValue("--copilot-drawer-width"), "410px");

    const resizer = container.querySelector(".copilot-drawer-resizer")!;
    assert.ok(resizer, "Drawer must render a left-edge resizer handle");
    assert.ok(resizer.classList.contains("copilot-resizer"));
    assert.ok(resizer.classList.contains("lh-no-drag"));

    // Check accessibility attributes
    assert.equal(resizer.getAttribute("role"), "separator");
    assert.equal(resizer.getAttribute("aria-orientation"), "vertical");
    assert.equal(resizer.getAttribute("aria-label"), "Resize Copilot sidebar");
    assert.equal(resizer.getAttribute("aria-valuenow"), "400");
    assert.equal(resizer.getAttribute("aria-valuemin"), "280");
    assert.equal(resizer.getAttribute("aria-valuemax"), "720");
    assert.equal(resizer.tabIndex, 0);

    drawer.destroy();
  } finally {
    env.restore();
  }
});


test("CopilotDrawer: drag resizing with pointer capture, transitions disabled, and localStorage persistence", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();

    const drawer = createCopilotDrawer({
      mode: "concurrency-lab",
      initialState: "drawer",
      targetContainer: container as any
    });

    const panel = container.querySelector(".copilot-container-drawer")!;
    const resizer = container.querySelector(".copilot-drawer-resizer")!;
    assert.ok(panel);
    assert.ok(resizer);

    // Initial width is 400px
    assert.equal(panel.style.width, "400px");

    // PointerDown at clientX = 624 (right edge drawer left border)
    resizer.dispatchEvent({
      type: "pointerdown",
      button: 0,
      pointerId: 42,
      clientX: 624
    });

    assert.ok(panel.classList.contains("is-resizing"), "panel must have is-resizing class while dragging");
    assert.ok(container.classList.contains("is-resizing"), "targetContainer must have is-resizing class while dragging");
    assert.deepEqual(resizer.capturedPointers, [42], "resizer must capture pointer on pointerdown");

    // Drag to the LEFT: clientX moves from 624 to 524 (delta = +100px)
    // New width = 400 + (624 - 524) = 500px
    resizer.dispatchEvent({
      type: "pointermove",
      pointerId: 42,
      clientX: 524
    });

    assert.equal(panel.style.width, "500px");
    assert.equal(resizer.getAttribute("aria-valuenow"), "500");
    assert.equal(container.style.getPropertyValue("--copilot-drawer-width"), "510px");

    // Drag further to test clamping to max (720px)
    // clientX moves to 100 (delta = 524 -> 400 + 524 = 924 -> clamped to 720)
    resizer.dispatchEvent({
      type: "pointermove",
      pointerId: 42,
      clientX: 100
    });

    assert.equal(panel.style.width, "720px");
    assert.equal(resizer.getAttribute("aria-valuenow"), "720");

    // Drag to the RIGHT to test clamping to min (280px)
    // clientX moves to 900 (delta = 624 - 900 = -276 -> 400 - 276 = 124 -> clamped to 280)
    resizer.dispatchEvent({
      type: "pointermove",
      pointerId: 42,
      clientX: 900
    });

    assert.equal(panel.style.width, "280px");
    assert.equal(resizer.getAttribute("aria-valuenow"), "280");

    // PointerUp releases drag and persists to localStorage
    resizer.dispatchEvent({
      type: "pointerup",
      button: 0,
      pointerId: 42,
      clientX: 900
    });

    assert.ok(!panel.classList.contains("is-resizing"), "is-resizing must be removed on pointerup");
    assert.ok(!container.classList.contains("is-resizing"), "is-resizing must be removed from container");
    assert.deepEqual(resizer.releasedPointers, [42], "pointer capture must be released on pointerup");
    assert.equal(env.mockLocalStorage.getItem(COPILOT_DRAWER_WIDTH_STORAGE_KEY), "280");

    drawer.destroy();
  } finally {
    env.restore();
  }
});


test("CopilotDrawer: double-click resets width to default 400px", () => {
  const env = setupMockDom({ [COPILOT_DRAWER_WIDTH_STORAGE_KEY]: "550" });
  try {
    const container = new MockDOMElement();

    const drawer = createCopilotDrawer({
      mode: "cpu-lab",
      initialState: "drawer",
      targetContainer: container as any
    });

    const panel = container.querySelector(".copilot-container-drawer")!;
    const resizer = container.querySelector(".copilot-drawer-resizer")!;

    // Initial width restored from storage (550px)
    assert.equal(panel.style.width, "550px");
    assert.equal(resizer.getAttribute("aria-valuenow"), "550");

    // Double-click resets to 400px
    resizer.dispatchEvent({ type: "dblclick" });

    assert.equal(panel.style.width, "400px");
    assert.equal(resizer.getAttribute("aria-valuenow"), "400");
    assert.equal(container.style.getPropertyValue("--copilot-drawer-width"), "410px");
    assert.equal(env.mockLocalStorage.getItem(COPILOT_DRAWER_WIDTH_STORAGE_KEY), "400");

    drawer.destroy();
  } finally {
    env.restore();
  }
});


test("CopilotDrawer: keyboard support (ArrowLeft +16px, ArrowRight -16px, Home/End)", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();

    const drawer = createCopilotDrawer({
      mode: "memory-lab",
      initialState: "drawer",
      targetContainer: container as any
    });

    const panel = container.querySelector(".copilot-container-drawer")!;
    const resizer = container.querySelector(".copilot-drawer-resizer")!;

    assert.equal(panel.style.width, "400px");

    // ArrowLeft: increases width by +16px
    resizer.dispatchEvent({ type: "keydown", key: "ArrowLeft" });
    assert.equal(panel.style.width, "416px");
    assert.equal(resizer.getAttribute("aria-valuenow"), "416");
    assert.equal(env.mockLocalStorage.getItem(COPILOT_DRAWER_WIDTH_STORAGE_KEY), "416");

    // ArrowRight: decreases width by -16px
    resizer.dispatchEvent({ type: "keydown", key: "ArrowRight" });
    assert.equal(panel.style.width, "400px");
    assert.equal(resizer.getAttribute("aria-valuenow"), "400");
    assert.equal(env.mockLocalStorage.getItem(COPILOT_DRAWER_WIDTH_STORAGE_KEY), "400");

    // Home: resets to min (280px)
    resizer.dispatchEvent({ type: "keydown", key: "Home" });
    assert.equal(panel.style.width, "280px");
    assert.equal(resizer.getAttribute("aria-valuenow"), "280");

    // End: expands to max (720px)
    resizer.dispatchEvent({ type: "keydown", key: "End" });
    assert.equal(panel.style.width, "720px");
    assert.equal(resizer.getAttribute("aria-valuenow"), "720");

    drawer.destroy();
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: dock mode styling and borders match LearnHarness Hub aesthetics", () => {
  const stylesPath = path.resolve(__dirname, "../src/styles.css");
  const stylesContent = fs.readFileSync(stylesPath, "utf-8");

  // 1. Sidebar styling (.copilot-container-drawer)
  assert.ok(
    stylesContent.includes("border-left: 1px solid var(--border);"),
    "Sidebar should have hairline left border"
  );
  assert.ok(
    /\.copilot-container-drawer\s*\{[^}]*box-shadow:\s*none;/.test(stylesContent),
    "Sidebar should have box-shadow: none for a clean edge without harsh highlights"
  );

  // 2. Resizer handle subtle highlight (var(--border) on hover/active, transparent idle)
  assert.ok(
    /\.copilot-drawer-resizer:hover[^{]*\{[^}]*background-color:\s*var\(--border\);/.test(stylesContent),
    "Resizer should use subtle var(--border) on hover"
  );

  // 3. Floating actions & buttons in drawer mode: backdrop blur, rounded pill, absolute top-right
  assert.ok(
    stylesContent.includes(".copilot-container-drawer .copilot-floating-actions"),
    "Styles should include .copilot-container-drawer .copilot-floating-actions"
  );
  assert.ok(
    stylesContent.includes("backdrop-filter: blur(8px);"),
    "Floating buttons should have backdrop blur"
  );
  assert.ok(
    stylesContent.includes("border-radius: 9999px;"),
    "Floating buttons should have rounded pill shape (border-radius: 9999px)"
  );
  assert.ok(
    /\.copilot-container-drawer \.copilot-chat-body\s*\{[^}]*padding-top:\s*52px;/.test(stylesContent),
    "Chat body in drawer mode should have padding-top: 52px"
  );
  assert.ok(
    stylesContent.includes(".copilot-badge-mode"),
    "Badge mode should be styled"
  );

  // 4. Composer surface: rounded container, color-mix border and background, backdrop blur
  assert.ok(
    stylesContent.includes("border-radius: var(--radius-lg, 12px);"),
    "Composer surface should use var(--radius-lg, 12px)"
  );
  assert.ok(
    stylesContent.includes("background-color: color-mix(in srgb, var(--card) 95%, transparent);"),
    "Composer surface should have color-mix translucent background"
  );
  assert.ok(
    stylesContent.includes("backdrop-filter: blur(8px);"),
    "Composer surface should have backdrop blur"
  );
  assert.ok(
    stylesContent.includes("border-color: color-mix(in srgb, var(--foreground) 25%, var(--border));"),
    "Composer surface should have subtle focus-within border highlight"
  );

  // 5. Send button: rounded button with primary icon
  assert.ok(
    /\.copilot-btn-send\s*\{[^}]*border-radius:\s*var\(--radius,\s*8px\);/.test(stylesContent),
    "Send button should use var(--radius, 8px)"
  );
  assert.ok(
    /\.copilot-btn-send\s*\{[^}]*color:\s*var\(--primary\);/.test(stylesContent),
    "Send button should have var(--primary) color"
  );

  // 6. User bubble & markdown code
  assert.ok(
    /\.copilot-bubble-user\s*\{[^}]*background-color:\s*var\(--accent\);[^}]*border:\s*1px solid var\(--border\);[^}]*border-radius:\s*var\(--radius-lg,\s*12px\);/.test(stylesContent),
    "User bubble should be subtle elevated card with var(--accent) and var(--radius-lg, 12px)"
  );
  assert.ok(
    stylesContent.includes(".copilot-pre"),
    "Styles should include .copilot-pre for code blocks"
  );

  // 7. Verify DOM rendering of code blocks in markdown
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    const drawer = createCopilotDrawer({
      mode: "cpu-lab",
      initialState: "drawer",
      targetContainer: container as any
    });

    drawer.addMessage({
      role: "assistant",
      text: "Ecco un blocco di codice:\n```c\nint x = 42;\n```\nFine."
    });

    const pre = container.querySelector(".copilot-pre");
    assert.ok(pre, "Assistant message should render <pre> tag for fenced code blocks");
    const code = container.querySelector(".copilot-code-block");
    assert.ok(code, "Assistant message should render <code> tag inside <pre>");
    assert.ok(code.textContent.includes("int x = 42;"));

    drawer.destroy();
  } finally {
    env.restore();
  }
});
