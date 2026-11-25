import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  createCopilotPill,
  createCopilotDrawer,
  openExerciseHistoryModal,
  type CopilotUiMode
} from "../src/ui/ai/index.js";
import type { SavedExercise, LabMode } from "../src/types/ai.js";

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
  scrollTop = 0;
  scrollHeight = 100;
  clientHeight = 50;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners: Record<string, Function[]> = {};
  private _styles: Record<string, string> = {};

  setPointerCapture(_id: number) {}
  releasePointerCapture(_id: number) {}

  style: any = {
    width: "",
    height: "",
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

function setupMockDom() {
  const windowListeners: Record<string, Function[]> = {};
  const mockStorage: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (k: string) => mockStorage[k] ?? null,
    setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => { for (const k of Object.keys(mockStorage)) delete mockStorage[k]; }
  };
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
    restore: () => {
      (globalThis as any).window = oldWindow;
      (globalThis as any).document = oldDocument;
    }
  };
}

test("CopilotPill: renders faithful search pill, handles focus/input, dock toggle, and keyboard actions", () => {
  const env = setupMockDom();
  try {
    let focusInputCalls: string[] = [];
    let submittedPrompts: string[] = [];
    let drawerToggled = false;
    let minimized = false;

    const pillHandle = createCopilotPill({
      placeholder: "Che domanda hai sulla simulazione?",
      onFocusOrInput: (text) => focusInputCalls.push(text),
      onSubmitPrompt: (p) => submittedPrompts.push(p),
      onToggleDrawer: () => { drawerToggled = true; },
      onMinimize: () => { minimized = true; }
    });

    assert.ok(pillHandle.element.classList.contains("copilot-pill"));
    assert.equal(pillHandle.inputElement.placeholder, "Che domanda hai sulla simulazione?");

    const defaultPillHandle = createCopilotPill();
    assert.ok(defaultPillHandle.inputElement.placeholder.length > 0);
    defaultPillHandle.destroy();

    pillHandle.inputElement.focus();
    assert.equal(focusInputCalls.length, 1);

    pillHandle.setValue("Spiegami la paginazione");
    (pillHandle.inputElement as unknown as MockDOMElement).dispatchEvent({ type: "input" });
    assert.equal(focusInputCalls.length, 2);
    assert.equal(focusInputCalls[1], "Spiegami la paginazione");

    const btnDrawer = pillHandle.element.querySelector(".copilot-pill-btn[aria-label='Aggancia a destra']");
    assert.ok(btnDrawer);
    (btnDrawer as unknown as MockDOMElement).click();
    assert.equal(drawerToggled, true);

    const btnMin = pillHandle.element.querySelector(".copilot-pill-btn[aria-label='Minimizza assistente']");
    assert.ok(btnMin);
    (btnMin as unknown as MockDOMElement).click();
    assert.equal(minimized, true);

    pillHandle.setValue("Spiegami il TLB");
    (pillHandle.inputElement as unknown as MockDOMElement).dispatchEvent({
      type: "keydown",
      key: "Enter",
      shiftKey: false,
      preventDefault: () => {}
    });
    assert.equal(submittedPrompts.length, 1);
    assert.equal(submittedPrompts[0], "Spiegami il TLB");

    minimized = false;
    (pillHandle.inputElement as unknown as MockDOMElement).dispatchEvent({
      type: "keydown",
      key: "Escape",
      shiftKey: false,
      preventDefault: () => {}
    });
    assert.equal(minimized, true);

    pillHandle.destroy();
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: mounts cleanly in all 4 states ('pill', 'sheet', 'drawer', 'minimized')", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();

    const drawer = createCopilotDrawer({
      mode: "memory-lab",
      initialState: "pill",
      targetContainer: container as any
    });

    assert.equal(drawer.getState(), "pill");
    assert.ok(container.querySelector(".copilot-container-pill"));
    assert.ok(container.querySelector(".copilot-pill"));
    assert.ok(!container.classList.contains("has-copilot-drawer"));

    drawer.setState("sheet");
    assert.equal(drawer.getState(), "sheet");
    assert.ok(container.querySelector(".copilot-container-sheet"));
    assert.ok(container.querySelector(".copilot-composer"));
    assert.ok(!container.classList.contains("has-copilot-drawer"));

    drawer.setState("drawer");
    assert.equal(drawer.getState(), "drawer");
    assert.ok(container.querySelector(".copilot-container-drawer"));
    assert.ok(container.classList.contains("has-copilot-drawer"));

    drawer.setState("minimized");
    assert.equal(drawer.getState(), "minimized");
    assert.ok(container.querySelector(".copilot-container-minimized"));
    assert.ok(container.querySelector(".copilot-bubble"));
    assert.ok(!container.classList.contains("has-copilot-drawer"));

    drawer.destroy();
    assert.equal(container.children.length, 0);
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: transitions fluidly between states through interactive clicks", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    const drawer = createCopilotDrawer({
      mode: "cpu-lab",
      initialState: "pill",
      targetContainer: container as any
    });

    const pillInput = container.querySelector(".copilot-pill-input")!;
    assert.ok(pillInput);
    pillInput.focus();
    assert.equal(drawer.getState(), "sheet");

    const btnDock = container.querySelector(".copilot-btn-dock")!;
    assert.ok(btnDock);
    btnDock.click();
    assert.equal(drawer.getState(), "drawer");
    assert.ok(container.classList.contains("has-copilot-drawer"));

    const btnUndock = container.querySelector(".copilot-btn-dock")!;
    assert.ok(btnUndock);
    btnUndock.click();
    assert.equal(drawer.getState(), "sheet");
    assert.ok(!container.classList.contains("has-copilot-drawer"));

    const btnCollapse = container.querySelector(".copilot-btn-collapse")!;
    assert.ok(btnCollapse);
    btnCollapse.click();

    const closingSheet = container.querySelector(".copilot-container-sheet.is-closing");
    assert.ok(closingSheet, "Sheet should gain .is-closing class upon collapse");
    (closingSheet as unknown as MockDOMElement).dispatchEvent({ type: "animationend" });
    assert.equal(drawer.getState(), "pill");

    const btnMin = container.querySelector(".copilot-pill-btn[aria-label='Minimizza assistente']")!;
    assert.ok(btnMin);
    btnMin.click();
    assert.equal(drawer.getState(), "minimized");

    const bubble = container.querySelector(".copilot-bubble")!;
    assert.ok(bubble);
    bubble.click();
    assert.equal(drawer.getState(), "sheet");

    drawer.destroy();
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: handles prompt submission, OSTEP chips, generated exercise cards, and simulator loading", async () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    let appliedExercise: SavedExercise | null = null;
    let historyUpdates: SavedExercise[][] = [];

    const fakeBackend = async (req: any) => {
      const generatedExercise: SavedExercise = {
        id: "ex-test-generated",
        title: "Esercizio Generato OSTEP",
        date: new Date().toISOString(),
        consegna: "Verifica della preemption STCF.",
        sourceTag: "ai",
        mode: "cpu-lab",
        config: { quantum: 2 }
      };

      return {
        responseText: "Risposta Copilot per: " + req.userMessage + "\n- Punto 1: STCF\n- Punto 2: `preemption`",
        generatedExercise,
        controlActions: [{ action: "set_algorithm", payload: { algorithm: "stcf" } }]
      };
    };

    const drawer = createCopilotDrawer({
      mode: "cpu-lab",
      initialState: "sheet",
      targetContainer: container as any,
      backendCall: fakeBackend,
      onApplyExercise: (ex) => { appliedExercise = ex; },
      onHistoryChange: (hist) => { historyUpdates.push(hist); }
    });

    const composerInput = container.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
    assert.ok(composerInput);

    await drawer.sendPrompt("Come funziona STCF?");

    const userMsg = container.querySelector(".copilot-message-user");
    assert.ok(userMsg);
    assert.ok(userMsg.textContent.includes("Come funziona STCF?"));

    const assistantMsg = container.querySelector(".copilot-message-assistant");
    assert.ok(assistantMsg);
    assert.ok(assistantMsg.textContent.includes("STCF"));

    const actionBadge = container.querySelector(".copilot-control-action-badge");
    assert.ok(actionBadge);
    assert.ok(actionBadge.textContent.includes("set_algorithm"));

    const exCard = container.querySelector(".copilot-generated-exercise-card");
    assert.ok(exCard);
    assert.ok(exCard.textContent.includes("Esercizio Generato OSTEP"));

    const btnApply = exCard.querySelector(".btn-primary")!;
    assert.ok(btnApply);
    btnApply.click();
    assert.ok(appliedExercise !== null);
    assert.equal((appliedExercise as SavedExercise).id, "ex-test-generated");

    assert.ok(historyUpdates.length >= 1);
    assert.equal(historyUpdates[0]![0]!.id, "ex-test-generated");

    drawer.destroy();
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: keyboard support (Esc closes/minimizes, Enter submits) and AbortSignal teardown", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    const abortController = new AbortController();

    const drawer = createCopilotDrawer({
      mode: "concurrency-lab",
      initialState: "sheet",
      targetContainer: container as any,
      signal: abortController.signal
    });

    assert.equal(drawer.getState(), "sheet");

    env.mockWindow.dispatchEvent({
      type: "keydown",
      key: "Escape",
      preventDefault: () => {}
    });

    const closingSheet = container.querySelector(".copilot-container-sheet.is-closing");
    assert.ok(closingSheet, "Sheet should gain .is-closing class upon Escape");
    (closingSheet as unknown as MockDOMElement).dispatchEvent({ type: "animationend" });
    assert.equal(drawer.getState(), "pill");

    abortController.abort();
    assert.equal(container.children.length, 0);
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: dynamic centering in quadro via ResizeObserver / window resize and --quadro-center-x variable", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    const drawer = createCopilotDrawer({
      mode: "memory-lab",
      initialState: "pill",
      targetContainer: container as any
    });

    const rootEl = container.querySelector(".copilot-root") as unknown as MockDOMElement;
    assert.ok(rootEl);
    assert.equal(rootEl.style.getPropertyValue("--quadro-center-x"), "500px");
    assert.equal(rootEl.style.getPropertyValue("--quadro-width"), "800px");

    env.mockWindow.dispatchEvent({ type: "resize" });
    assert.equal(rootEl.style.getPropertyValue("--quadro-center-x"), "500px");
    assert.equal(rootEl.style.getPropertyValue("--quadro-width"), "800px");

    drawer.destroy();
  } finally {
    env.restore();
  }
});

test("ExerciseHistoryModal: displays SavedExercise[] with distinct AI and Manual badges", () => {
  const env = setupMockDom();
  try {
    const exercises: SavedExercise[] = [
      {
        id: "ex-ai-1",
        title: "Traduzione Segmentazione",
        date: "2026-11-23T10:00:00.000Z",
        consegna: "Calcola indirizzi fisici e limit fault.",
        sourceTag: "ai",
        mode: "memory-lab",
        config: {}
      },
      {
        id: "ex-man-2",
        title: "Workload Personalizzato RR",
        date: "2026-11-23T09:30:00.000Z",
        consegna: "Valutazione manuale del quantum.",
        sourceTag: "manual",
        mode: "cpu-lab",
        config: {}
      }
    ];

    const targetContainer = new MockDOMElement();
    let loadedEx: SavedExercise | null = null;
    let updatedMetadata: { id: string; updates: { title: string; consegna: string } } | null = null;
    let deletedId: string | null = null;

    const closeModal = openExerciseHistoryModal({
      exercises,
      onLoadExercise: (ex) => { loadedEx = ex; },
      onUpdateMetadata: (id, updates) => { updatedMetadata = { id, updates }; },
      onDeleteExercise: (id) => { deletedId = id; },
      targetContainer: targetContainer as any
    });

    const overlay = targetContainer.querySelector(".copilot-history-overlay")!;
    assert.ok(overlay);

    const cards = targetContainer.querySelectorAll(".copilot-exercise-card");
    assert.equal(cards.length, 2);

    const cardAi = cards.find((c) => c.dataset["source"] === "ai")!;
    assert.ok(cardAi);
    const badgeAi = cardAi.querySelector(".copilot-badge-ai");
    assert.ok(badgeAi, "Badge AI must exist for sourceTag === 'ai'");
    assert.ok(badgeAi.textContent.includes("AI"));

    const cardManual = cards.find((c) => c.dataset["source"] === "manual")!;
    assert.ok(cardManual);
    const badgeManual = cardManual.querySelector(".copilot-badge-manual");
    assert.ok(badgeManual, "Badge Manuale must exist for sourceTag === 'manual'");
    assert.equal(badgeManual.textContent, "Manuale");

    const btnLoad = cardAi.querySelector(".btn-load-exercise")!;
    assert.ok(btnLoad);
    btnLoad.click();
    assert.ok(loadedEx !== null);
    assert.equal((loadedEx as SavedExercise).id, "ex-ai-1");

    openExerciseHistoryModal({
      exercises,
      onLoadExercise: () => {},
      onUpdateMetadata: (id, updates) => { updatedMetadata = { id, updates }; },
      onDeleteExercise: (id) => { deletedId = id; },
      targetContainer: targetContainer as any
    });

    const editCards = targetContainer.querySelectorAll(".copilot-exercise-card");
    const editBtn = editCards[0]!.querySelector(".btn-edit-metadata")!;
    assert.ok(editBtn);
    editBtn.click();

    const titleInput = targetContainer.querySelector(".copilot-exercise-edit-form input")!;
    assert.ok(titleInput);
    titleInput.value = "Titolo Aggiornato";
    const saveEditBtn = targetContainer.querySelector(".copilot-exercise-edit-actions .btn-primary")!;
    assert.ok(saveEditBtn);
    saveEditBtn.click();

    assert.ok(updatedMetadata !== null);
    assert.equal((updatedMetadata as { id: string; updates: { title: string; consegna: string } }).id, "ex-ai-1");
    assert.equal((updatedMetadata as { id: string; updates: { title: string; consegna: string } }).updates.title, "Titolo Aggiornato");

    const deleteBtn = targetContainer.querySelector(".btn-delete-exercise")!;
    assert.ok(deleteBtn);
    deleteBtn.click();
    assert.equal(deletedId, "ex-ai-1");

    env.mockWindow.dispatchEvent({
      type: "keydown",
      key: "Escape"
    });
    assert.equal(targetContainer.children.length, 0);
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: smooth morph animation between pill and sheet with carried input & seamless return", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    const drawer = createCopilotDrawer({
      mode: "memory-lab",
      initialState: "pill",
      targetContainer: container as any
    });

    assert.equal(drawer.getState(), "pill");
    const pillWrapper = container.querySelector(".copilot-container-pill")!;
    assert.ok(pillWrapper);

    const pillInput = container.querySelector(".copilot-pill-input")!;
    assert.ok(pillInput);
    pillInput.value = "Cos'è la paginazione?";
    pillInput.focus();

    assert.equal(drawer.getState(), "sheet");
    const sheetPanel = container.querySelector(".copilot-container-sheet")!;
    assert.ok(sheetPanel);
    assert.ok(sheetPanel.classList.contains("is-morphing-open"));

    const composerInput = container.querySelector(".copilot-composer-input")!;
    assert.ok(composerInput);
    assert.equal(composerInput.value, "Cos'è la paginazione?");

    // User types in composer
    composerInput.value = "Spiega il working set in dettaglio";

    // Collapse sheet back to pill
    const btnCollapse = container.querySelector(".copilot-btn-collapse")!;
    assert.ok(btnCollapse);
    btnCollapse.click();

    const closingSheet = container.querySelector(".copilot-container-sheet.is-closing");
    assert.ok(closingSheet, "Sheet gains .is-closing class upon collapse");
    (closingSheet as unknown as MockDOMElement).dispatchEvent({ type: "animationend" });

    assert.equal(drawer.getState(), "pill");
    const returnedPillWrapper = container.querySelector(".copilot-container-pill.is-morphed")!;
    assert.ok(returnedPillWrapper, "Returned pill gains .is-morphed to suppress entrance jump");

    const returnedPillInput = container.querySelector(".copilot-pill-input")!;
    assert.ok(returnedPillInput);
    assert.equal(returnedPillInput.value, "Spiega il working set in dettaglio", "Carries input back from composer to pill");

    drawer.destroy();
  } finally {
    env.restore();
  }
});

test("Copilot UX: subtle hub-style focus and hover borders adhering to LearnHarness tokens", () => {
  const stylesPath = path.resolve(__dirname, "../src/styles.css");
  const stylesContent = fs.readFileSync(stylesPath, "utf-8");

  // Verify Hub-style focus-within color-mix tokens
  assert.ok(
    stylesContent.includes("border-color: color-mix(in srgb, var(--foreground) 25%, var(--border));"),
    "Should include subtle color-mix highlight for focus-within"
  );

  // Verify Hub-style hover shadow
  assert.ok(
    stylesContent.includes("box-shadow: var(--lh-shadow-lg, 0 12px 30px -10px rgba(0, 0, 0, 0.3));"),
    "Should include Hub-style shadow elevation on hover"
  );

  // Verify transition curve
  assert.ok(
    stylesContent.includes("cubic-bezier(0.16, 1, 0.3, 1)"),
    "Should use the standard LearnHarness smooth cubic-bezier curve"
  );

  // Verify morph keyframes geometry: 52px starting and ending heights with opacity: 1
  assert.ok(
    /@keyframes copilot-card-open\s*\{[\s\S]*?0%\s*\{[\s\S]*?height:\s*52px[\s\S]*?opacity:\s*1/.test(stylesContent),
    "copilot-card-open must morph upwards from 52px height at opacity 1"
  );
  assert.ok(
    /@keyframes copilot-card-close\s*\{[\s\S]*?100%\s*\{[\s\S]*?height:\s*52px[\s\S]*?opacity:\s*1/.test(stylesContent),
    "copilot-card-close must contract down to 52px height at opacity 1"
  );

  // Verify no harsh primary white on copilot interactive elements
  const copilotPillFocusMatch = stylesContent.match(/\.copilot-pill:focus-within\s*\{([^}]+)\}/);
  assert.ok(copilotPillFocusMatch);
  assert.ok(!copilotPillFocusFocusHasPrimary(copilotPillFocusMatch[1]!));

  const composerSurfaceFocusMatch = stylesContent.match(/\.copilot-composer-surface:focus-within\s*\{([^}]+)\}/);
  assert.ok(composerSurfaceFocusMatch);
  assert.ok(!copilotPillFocusFocusHasPrimary(composerSurfaceFocusMatch[1]!));

  // Verify sheet mode removes nested bottom card and expands to true quadro fullscreen (keeping left sidebar visible)
  assert.ok(
    stylesContent.includes(".copilot-container-sheet .copilot-composer-surface"),
    "Sheet mode should flatten nested composer surface card"
  );
  assert.ok(
    /\.copilot-container-sheet\.is-fullscreen,\s*\.copilot-container-sheet\.is-expanded\s*\{[^}]*width:\s*var\(--quadro-width,\s*100vw\);[^}]*height:\s*100dvh;[^}]*border-radius:\s*0;/s.test(stylesContent),
    "Fullscreen mode must expand organically to quadro width x 100dvh preserving the left sidebar"
  );
});

function copilotPillFocusFocusHasPrimary(block: string): boolean {
  return /border-color:\s*var\(--primary\)/.test(block);
}

test("CopilotDrawer: organic sheet height progression - scroll expansion and reverse contraction", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    const drawer = createCopilotDrawer({
      mode: "memory-lab",
      initialState: "sheet",
      targetContainer: container as any
    });

    const panel = container.querySelector(".copilot-container-sheet") as unknown as MockDOMElement;
    assert.ok(panel);
    assert.ok(!panel.classList.contains("is-fullscreen"));
    assert.ok(!panel.classList.contains("is-expanded"));

    const chatBody = panel.querySelector(".copilot-chat-body") as unknown as MockDOMElement;
    assert.ok(chatBody);

    const btnExpand = panel.querySelector(".copilot-btn-expand") as unknown as MockDOMElement;
    assert.ok(btnExpand);
    assert.equal(btnExpand.title, "Espandi a schermo intero");

    // 1. Simulate scroll down in chat body when content overflows
    chatBody.scrollHeight = 500;
    chatBody.clientHeight = 200;
    chatBody.scrollTop = 45;
    chatBody.dispatchEvent({ type: "scroll" });

    // Should smoothly expand to tall state
    assert.ok(panel.classList.contains("is-fullscreen"), "Panel should gain .is-fullscreen on scroll down");
    assert.ok(panel.classList.contains("is-expanded"), "Panel should gain .is-expanded on scroll down");
    assert.equal(btnExpand.title, "Riduci dimensione");

    // 2. Simulate organic reverse contraction when scrolling back up to top (scrollTop <= 10)
    chatBody.scrollTop = 5;
    chatBody.dispatchEvent({ type: "scroll" });

    assert.ok(!panel.classList.contains("is-fullscreen"), "Panel should lose .is-fullscreen on scroll to top");
    assert.ok(!panel.classList.contains("is-expanded"), "Panel should lose .is-expanded on scroll to top");
    assert.equal(btnExpand.title, "Espandi a schermo intero");

    // 3. Wheel down expansion
    chatBody.scrollTop = 0;
    chatBody.dispatchEvent({ type: "wheel", deltaY: 25 });
    assert.ok(panel.classList.contains("is-fullscreen"), "Wheel down should expand sheet");

    // 4. Wheel up contraction when at the top
    chatBody.scrollTop = 0;
    chatBody.dispatchEvent({ type: "wheel", deltaY: -15 });
    assert.ok(!panel.classList.contains("is-fullscreen"), "Wheel up at top should contract sheet");

    drawer.destroy();
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: header maximize/minimize toggle button and Escape multi-step collapse", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    const drawer = createCopilotDrawer({
      mode: "cpu-lab",
      initialState: "sheet",
      targetContainer: container as any
    });

    const panel = container.querySelector(".copilot-container-sheet") as unknown as MockDOMElement;
    assert.ok(panel);
    assert.ok(!panel.classList.contains("is-fullscreen"));

    const btnExpand = panel.querySelector(".copilot-btn-expand") as unknown as MockDOMElement;
    assert.ok(btnExpand);

    // Click to maximize
    btnExpand.click();
    assert.ok(panel.classList.contains("is-fullscreen"));
    assert.equal(btnExpand.title, "Riduci dimensione");

    // Click to minimize back to medium sheet
    btnExpand.click();
    assert.ok(!panel.classList.contains("is-fullscreen"));
    assert.equal(btnExpand.title, "Espandi a schermo intero");

    // Maximize again
    btnExpand.click();
    assert.ok(panel.classList.contains("is-fullscreen"));

    // First Escape shrinks back to medium sheet (does NOT close to pill)
    env.mockWindow.dispatchEvent({
      type: "keydown",
      key: "Escape",
      preventDefault: () => {}
    });

    assert.ok(!panel.classList.contains("is-fullscreen"), "First Escape should contract from expanded to medium");
    assert.equal(drawer.getState(), "sheet", "First Escape keeps drawer in sheet mode");

    // Second Escape closes back to pill with animation
    env.mockWindow.dispatchEvent({
      type: "keydown",
      key: "Escape",
      preventDefault: () => {}
    });

    const closingSheet = container.querySelector(".copilot-container-sheet.is-closing") as unknown as MockDOMElement;
    assert.ok(closingSheet, "Second Escape closes sheet to pill");
    closingSheet.dispatchEvent({ type: "animationend" });
    assert.equal(drawer.getState(), "pill");

    drawer.destroy();
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: composer input generous sizing and auto-grow fallback", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    const drawer = createCopilotDrawer({
      mode: "concurrency-lab",
      initialState: "sheet",
      targetContainer: container as any
    });

    const composerInput = container.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
    assert.ok(composerInput);
    assert.ok(composerInput.classList.contains("copilot-composer-input"));

    // Simulate user typing and auto-grow event
    composerInput.scrollHeight = 88;
    composerInput.value = "Riga 1\nRiga 2\nRiga 3";
    composerInput.dispatchEvent({ type: "input" });

    assert.equal(composerInput.style.height, "88px", "Auto-grow fallback updates textarea style.height");

    drawer.destroy();
  } finally {
    env.restore();
  }
});

test("CopilotDrawer: auto-expands when multiple messages accumulate in sheet", () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    const drawer = createCopilotDrawer({
      mode: "memory-lab",
      initialState: "sheet",
      targetContainer: container as any
    });

    const panel = container.querySelector(".copilot-container-sheet") as unknown as MockDOMElement;
    assert.ok(panel);
    assert.ok(!panel.classList.contains("is-fullscreen"));

    // Add 1st message - remains medium
    drawer.addMessage({ role: "user", text: "Primo messaggio" });
    assert.ok(!panel.classList.contains("is-fullscreen"), "1 message keeps sheet at medium height");

    // Add 2nd message - remains medium
    drawer.addMessage({ role: "assistant", text: "Prima risposta dell'assistente" });
    assert.ok(!panel.classList.contains("is-fullscreen"), "2 messages keep sheet at medium height");

    // Add 3rd message - messages have accumulated, smoothly expands
    drawer.addMessage({ role: "user", text: "Secondo messaggio di approfondimento" });
    assert.ok(panel.classList.contains("is-fullscreen"), "Accumulated messages expand sheet to tall state");

    // Reverse contraction still works when scrolling to top
    const chatBody = panel.querySelector(".copilot-chat-body") as unknown as MockDOMElement;
    chatBody.scrollTop = 5;
    chatBody.dispatchEvent({ type: "scroll" });
    assert.ok(!panel.classList.contains("is-fullscreen"), "Scrolling to top contracts accumulated sheet back to medium");

    drawer.destroy();
  } finally {
    env.restore();
  }
});
