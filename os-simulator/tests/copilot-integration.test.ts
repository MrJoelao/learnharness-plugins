import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createMemoryLabView,
  getInitialMemoryLabState
} from "../src/ui/memory/memory-lab-view.js";
import {
  createCpuLabView,
  getInitialCpuLabState
} from "../src/ui/cpu/cpu-lab-view.js";
import {
  createConcurrencyLabView,
  getInitialConcurrencyLabState
} from "../src/ui/concurrency/concurrency-lab-view.js";
import { activate as activateFrontend } from "../src/main.js";
import { handleAiTurn } from "../src/backend/ai-service.js";
import type {
  PluginFrontendContext,
  PluginBackendContext,
  PluginWorkspaceRendererContext
} from "learnharness-plugin-api";
import type { MemoryLabState } from "../src/core/memory/types.js";
import type { CpuLabState } from "../src/core/cpu/types.js";
import type { ConcurrencyLabState } from "../src/core/concurrency/types.js";
import type { SavedExercise, AiTurnRequest, AiTurnResponse } from "../src/types/ai.js";

// Comprehensive Mock DOM implementation
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
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners: Record<string, Function[]> = {};
  style: Record<string, string> = {};
  min = "";
  max = "";

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
    const all = this.querySelectorAll(selector);
    return all[0] ?? null;
  }
  querySelectorAll(selector: string): MockDOMElement[] {
    const results: MockDOMElement[] = [];
    const match = (el: MockDOMElement): boolean => {
      const tokens = selector.split(/\s+/).filter(Boolean);
      const lastToken = tokens[tokens.length - 1] ?? selector;

      const tagMatch = lastToken.match(/^([a-zA-Z0-9]+)/);
      if (tagMatch && tagMatch[1]) {
        if (el.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;
      }
      const classMatch = lastToken.match(/\.([a-zA-Z0-9_-]+)/);
      if (classMatch && classMatch[1]) {
        if (!el.className.split(" ").includes(classMatch[1])) return false;
      }
      const idMatch = lastToken.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        if (el.attributes["id"] !== idMatch[1]) return false;
      }
      const attrMatch = lastToken.match(/\[([a-zA-Z0-9_-]+)=['"]?([^'"\]]+)['"]?\]/);
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
      return Boolean(tagMatch || classMatch || idMatch || attrMatch);
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
  const mockWindow = {
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
    },
    addEventListener: (type: string, fn: Function) => mockWindow.addEventListener(type, fn),
    removeEventListener: (type: string, fn: Function) => mockWindow.removeEventListener(type, fn)
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

const createMockStorageAdapter = () => {
  const data = new Map<string, unknown>();
  return {
    get: async <T = unknown>(key: string): Promise<T | null> => {
      if (!data.has(key)) return null;
      return JSON.parse(JSON.stringify(data.get(key))) as T;
    },
    set: async (key: string, value: unknown): Promise<void> => {
      data.set(key, JSON.parse(JSON.stringify(value)));
    },
    delete: async (key: string): Promise<void> => {
      data.delete(key);
    }
  };
};

function createMockFrontendContext(callHandler?: (op: string, input?: unknown) => Promise<unknown>): PluginFrontendContext {
  return {
    call: async <T = unknown>(operation: string, input?: unknown): Promise<T> => {
      if (callHandler) {
        return (await callHandler(operation, input)) as T;
      }
      if (operation === "ai-turn") {
        const dummyCtx = {} as PluginBackendContext;
        return (await handleAiTurn(dummyCtx, input)) as T;
      }
      throw new Error(`Unhandled op: ${operation}`);
    }
  } as unknown as PluginFrontendContext;
}

test("1. Copilot integration: all 3 lab modes mount the Copilot drawer and display 'Esercizi' toolbar button", () => {
  const env = setupMockDom();
  try {
    const frontendCtx = createMockFrontendContext();

    // 1. Memory Lab
    const memContainer = new MockDOMElement();
    const memState = getInitialMemoryLabState("ws-mem");
    const cleanupMem = createMemoryLabView(memContainer as any, memState, () => {}, frontendCtx);

    const memCopilot = memContainer.querySelector(".copilot-root");
    assert.ok(memCopilot, "Memory lab must mount .copilot-root");
    const memExercisesBtn = memContainer.querySelector(".memory-lab-toolbar .btn-outline");
    assert.ok(memExercisesBtn, "Memory lab must include Esercizi button in toolbar");
    assert.ok(memExercisesBtn.textContent.includes("Esercizi"));
    cleanupMem();

    // 2. CPU Lab
    const cpuContainer = new MockDOMElement();
    const cpuState = getInitialCpuLabState("ws-cpu");
    const cleanupCpu = createCpuLabView(cpuContainer as any, cpuState, () => {}, frontendCtx);

    const cpuCopilot = cpuContainer.querySelector(".copilot-root");
    assert.ok(cpuCopilot, "CPU lab must mount .copilot-root");
    const cpuExercisesBtn = cpuContainer.querySelector(".cpu-lab-toolbar .btn-outline");
    assert.ok(cpuExercisesBtn, "CPU lab must include Esercizi button in toolbar");
    assert.ok(cpuExercisesBtn.textContent.includes("Esercizi"));
    cleanupCpu();

    // 3. Concurrency Lab
    const concContainer = new MockDOMElement();
    const concState = getInitialConcurrencyLabState("ws-conc");
    const cleanupConc = createConcurrencyLabView(concContainer as any, concState, () => {}, frontendCtx);

    const concCopilot = concContainer.querySelector(".copilot-root");
    assert.ok(concCopilot, "Concurrency lab must mount .copilot-root");
    const concExercisesBtn = concContainer.querySelector(".concurrency-toolbar .btn-outline");
    assert.ok(concExercisesBtn, "Concurrency lab must include Esercizi button in toolbar");
    assert.ok(concExercisesBtn.textContent.includes("Esercizi"));
    cleanupConc();
  } finally {
    env.restore();
  }
});

test("2. Copilot integration: ai-turn automatically applies generated scenario, updates exerciseHistory with 'ai', and shows Undo banner", async () => {
  const env = setupMockDom();
  try {
    let savedMemState: MemoryLabState | null = null;
    const frontendCtx = createMockFrontendContext();

    const memContainer = new MockDOMElement();
    const memState = getInitialMemoryLabState("ws-mem-turn");
    const cleanupMem = createMemoryLabView(
      memContainer as any,
      memState,
      (nextState) => {
        savedMemState = nextState;
      },
      frontendCtx
    );

    // Expand copilot drawer and submit prompt requesting an exercise
    const pillBtn = memContainer.querySelector(".copilot-pill-input");
    assert.ok(pillBtn);
    pillBtn.focus();

    const composerInput = memContainer.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
    assert.ok(composerInput);
    composerInput.value = "Genera esercizio OSTEP di memoria";

    const sendBtn = memContainer.querySelector(".copilot-btn-send");
    assert.ok(sendBtn);
    sendBtn.click();

    // Wait microtask resolution for turn
    await new Promise((r) => setTimeout(r, 30));

    // Verify exercise was applied and added to history with 'ai' tag
    const memResult = savedMemState as MemoryLabState | null;
    assert.ok(memResult !== null);
    assert.ok(memResult.exerciseHistory && memResult.exerciseHistory.length > 0);
    const activeEx = memResult.exerciseHistory[0]!;
    assert.equal(activeEx.sourceTag, "ai");
    assert.ok(activeEx.title.includes("Esercizio OSTEP"));

    // Verify undo banner is rendered in DOM
    const undoBanner = memContainer.querySelector(".copilot-undo-banner");
    assert.ok(undoBanner, "Undo banner must be present in DOM after exercise applied");
    assert.ok(undoBanner.textContent.includes("Esercizio applicato"));
    assert.ok(undoBanner.querySelector(".copilot-undo-btn"));

    cleanupMem();

    // CPU Lab AI turn
    let savedCpuState: CpuLabState | null = null;
    const cpuContainer = new MockDOMElement();
    const cpuState = getInitialCpuLabState("ws-cpu-turn");
    const cleanupCpu = createCpuLabView(
      cpuContainer as any,
      cpuState,
      (nextState) => {
        savedCpuState = nextState;
      },
      frontendCtx
    );

    const cpuPillInput = cpuContainer.querySelector(".copilot-pill-input");
    assert.ok(cpuPillInput);
    cpuPillInput.focus();

    const cpuComposerInput = cpuContainer.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
    assert.ok(cpuComposerInput);
    cpuComposerInput.value = "Genera workload STCF con preemption";
    const cpuSendBtn = cpuContainer.querySelector(".copilot-btn-send");
    assert.ok(cpuSendBtn);
    cpuSendBtn.click();

    await new Promise((r) => setTimeout(r, 30));

    const cpuResult = savedCpuState as CpuLabState | null;
    assert.ok(cpuResult !== null);
    assert.ok(cpuResult.exerciseHistory && cpuResult.exerciseHistory.length > 0);
    assert.equal(cpuResult.exerciseHistory[0]!.sourceTag, "ai");
    assert.equal(cpuResult.workload.length, 3); // STCF 3 processes P0, P1, P2
    assert.equal(cpuResult.workload[0]!.id, "P0");
    const cpuUndoBanner = cpuContainer.querySelector(".copilot-undo-banner");
    assert.ok(cpuUndoBanner);
    cleanupCpu();

    // Concurrency Lab AI turn
    let savedConcState: ConcurrencyLabState | null = null;
    const concContainer = new MockDOMElement();
    const concState = getInitialConcurrencyLabState("ws-conc-turn");
    const cleanupConc = createConcurrencyLabView(
      concContainer as any,
      concState,
      (nextState) => {
        savedConcState = nextState;
      },
      frontendCtx
    );

    const concPillInput = concContainer.querySelector(".copilot-pill-input");
    assert.ok(concPillInput);
    concPillInput.focus();

    const concComposerInput = concContainer.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
    assert.ok(concComposerInput);
    concComposerInput.value = "Genera scenario Bounded Buffer Mesa 2 CV";
    const concSendBtn = concContainer.querySelector(".copilot-btn-send");
    assert.ok(concSendBtn);
    concSendBtn.click();

    await new Promise((r) => setTimeout(r, 30));

    const concResult = savedConcState as ConcurrencyLabState | null;
    assert.ok(concResult !== null);
    assert.ok(concResult.exerciseHistory && concResult.exerciseHistory.length > 0);
    assert.equal(concResult.exerciseHistory[0]!.sourceTag, "ai");
    assert.ok(concResult.scenarioState.name.includes("Bounded Buffer Mesa 2 CV"));
    const concUndoBanner = concContainer.querySelector(".copilot-undo-banner");
    assert.ok(concUndoBanner);
    cleanupConc();
  } finally {
    env.restore();
  }
});

test("3. Copilot integration: Undo trigger restores previous state instantly and dismisses the banner", async () => {
  const env = setupMockDom();
  try {
    let currentSavedState: CpuLabState | null = null;
    const frontendCtx = createMockFrontendContext();

    const cpuContainer = new MockDOMElement();
    const cpuState = getInitialCpuLabState("ws-cpu-undo");
    const initialProcessIds = cpuState.workload.map((p) => p.id);
    assert.deepEqual(initialProcessIds, ["P1", "P2", "P3"]);

    const cleanupCpu = createCpuLabView(
      cpuContainer as any,
      cpuState,
      (nextState) => {
        currentSavedState = nextState;
      },
      frontendCtx
    );

    // Apply an AI turn
    const pillInput = cpuContainer.querySelector(".copilot-pill-input");
    pillInput?.focus();
    const composerInput = cpuContainer.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
    composerInput.value = "Genera workload STCF";
    const sendBtn = cpuContainer.querySelector(".copilot-btn-send");
    sendBtn?.click();

    await new Promise((r) => setTimeout(r, 30));

    // Verify workload changed to generated workload (P0, P1, P2)
    const resultAfterAi = currentSavedState as CpuLabState | null;
    assert.ok(resultAfterAi !== null);
    assert.deepEqual(resultAfterAi.workload.map((p) => p.id), ["P0", "P1", "P2"]);

    const undoBtn = cpuContainer.querySelector(".copilot-undo-btn");
    assert.ok(undoBtn, "Undo button must be available in DOM");

    // Click Undo
    undoBtn.click();

    // Verify previous workload process IDs restored
    const resultAfterUndo = currentSavedState as CpuLabState | null;
    assert.ok(resultAfterUndo !== null);
    assert.deepEqual(resultAfterUndo.workload.map((p) => p.id), initialProcessIds);

    // Verify banner is removed
    const bannerAfterUndo = cpuContainer.querySelector(".copilot-undo-banner");
    assert.equal(bannerAfterUndo, null);

    cleanupCpu();
  } finally {
    env.restore();
  }
});

test("4. Copilot integration: manual parameter modification switches exercise tag from 'ai' to 'manual'", async () => {
  const env = setupMockDom();
  try {
    let currentSavedState: CpuLabState | null = null;
    const frontendCtx = createMockFrontendContext();

    const cpuContainer = new MockDOMElement();
    const cpuState = getInitialCpuLabState("ws-cpu-manual");
    const cleanupCpu = createCpuLabView(
      cpuContainer as any,
      cpuState,
      (nextState) => {
        currentSavedState = nextState;
      },
      frontendCtx
    );

    // Run AI turn to load an AI exercise
    const pillInput = cpuContainer.querySelector(".copilot-pill-input");
    pillInput?.focus();
    const composerInput = cpuContainer.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
    composerInput.value = "Genera workload STCF";
    const sendBtn = cpuContainer.querySelector(".copilot-btn-send");
    sendBtn?.click();

    await new Promise((r) => setTimeout(r, 30));

    const resultAfterAi = currentSavedState as CpuLabState | null;
    assert.ok(resultAfterAi !== null);
    assert.ok(resultAfterAi.exerciseHistory && resultAfterAi.exerciseHistory.length > 0);
    assert.equal(resultAfterAi.exerciseHistory[0]!.sourceTag, "ai");

    // Switch algorithm to RR and modify Quantum manually
    const rrTab = cpuContainer.querySelectorAll(".tab-button").find((b) => b.textContent.includes("Round Robin"));
    assert.ok(rrTab);
    rrTab.click();

    const quantumInput = cpuContainer.querySelector(".input-number") as unknown as MockDOMElement;
    assert.ok(quantumInput);
    quantumInput.value = "5";
    quantumInput.dispatchEvent({ type: "change" });

    // Verify tag switched to 'manual'
    const resultAfterManual = currentSavedState as CpuLabState | null;
    assert.ok(resultAfterManual !== null);
    assert.ok(resultAfterManual.exerciseHistory && resultAfterManual.exerciseHistory.length > 0);
    assert.equal(resultAfterManual.exerciseHistory[0]!.sourceTag, "manual");

    cleanupCpu();
  } finally {
    env.restore();
  }
});

test("5. Copilot integration: exerciseHistory persistence on context.storage across sessions", async () => {
  const env = setupMockDom();
  try {
    const storageAdapter = createMockStorageAdapter();
    const abortController1 = new AbortController();

    type RendererType = Parameters<PluginFrontendContext["registerModeRenderer"]>[2];
    const renderers: Record<string, RendererType> = {};
    const frontendCtx = {
      registerModeRenderer(pluginId: string, modeId: string, renderer: RendererType) {
        renderers[modeId] = renderer;
        return () => {
          delete renderers[modeId];
        };
      },
      call: async <T = unknown>(operation: string, input?: unknown): Promise<T> => {
        const dummyCtx = {} as PluginBackendContext;
        return (await handleAiTurn(dummyCtx, input)) as T;
      }
    } as unknown as PluginFrontendContext;

    activateFrontend(frontendCtx);

    // Session 1: Mount Memory Lab and add AI exercise
    const container1 = new MockDOMElement();
    const mountCtx1 = {
      workspace: { id: "ws-persist" },
      signal: abortController1.signal,
      storage: storageAdapter
    };

    const unmount1 = await renderers["memory-lab"]!.mount(container1 as any, mountCtx1 as any);
    assert.ok(typeof unmount1 === "function");

    // Send AI prompt in Session 1
    const pill1 = container1.querySelector(".copilot-pill-input");
    pill1?.focus();
    const comp1 = container1.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
    comp1.value = "Genera esercizio OSTEP";
    const send1 = container1.querySelector(".copilot-btn-send");
    send1?.click();

    await new Promise((r) => setTimeout(r, 30));

    // Verify storage has memory-state with exerciseHistory
    const storedState1 = await storageAdapter.get<MemoryLabState>("memory-state");
    assert.ok(storedState1 !== null);
    assert.ok(storedState1.exerciseHistory && storedState1.exerciseHistory.length > 0);
    const exId = storedState1.exerciseHistory[0]!.id;

    // Unmount Session 1
    unmount1();

    // Session 2: Mount new container with the same storage
    const abortController2 = new AbortController();
    const container2 = new MockDOMElement();
    const mountCtx2 = {
      workspace: { id: "ws-persist" },
      signal: abortController2.signal,
      storage: storageAdapter
    };

    const unmount2 = await renderers["memory-lab"]!.mount(container2 as any, mountCtx2 as any);
    assert.ok(typeof unmount2 === "function");

    // Check that Session 2 restored exerciseHistory
    const storedState2 = await storageAdapter.get<MemoryLabState>("memory-state");
    assert.ok(storedState2 !== null);
    assert.ok(storedState2.exerciseHistory && storedState2.exerciseHistory.length > 0);
    assert.equal(storedState2.exerciseHistory[0]!.id, exId);

    unmount2();
  } finally {
    env.restore();
  }
});
