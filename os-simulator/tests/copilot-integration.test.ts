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

import { SEGMENTATION_UNIMI_SEED_0 } from "../src/core/memory/presets.ts";
import { BOUNDED_BUFFER_MESA } from "../src/core/concurrency/presets.ts";

function createMockBackendContextForIntegration(): PluginBackendContext {
  let callIdx = 0;
  return {
    signal: new AbortController().signal,
    inference: {
      catalog: async () => ({
        models: [
          {
            id: "claude-3-7-sonnet",
            name: "Claude 3.7 Sonnet",
            provider: "anthropic",
            reasoning: true,
            input: ["text"],
            supportedLevels: ["off", "low", "medium", "high"],
            cost: null,
            contextWindow: 200000,
            maxTokens: 8192
          }
        ],
        defaults: { model: { provider: "anthropic", id: "claude-3-7-sonnet" }, thinkingLevel: "medium" },
        rolePins: { researcher: null, demoBuilder: null, visualMaker: null, extractor: null, auditor: null, sideQuestion: null },
        slots: { strong: null, cheap: null, vision: null },
        providers: [{ id: "anthropic", envVar: "ANTHROPIC_API_KEY", keyPresent: true }]
      }),
      stream: (req: { context: { systemPrompt?: string; messages: Array<{ role: string }> } }) => {
        const hasToolResult = req.context.messages.some((m) => m.role === "toolResult");
        const sys = req.context.systemPrompt ?? "";
        const mkUsage = () => ({
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
        });
        async function* gen() {
          if (hasToolResult) {
            yield {
              type: "done" as const,
              reason: "stop" as const,
              message: {
                role: "assistant" as const,
                content: [{ type: "text" as const, text: "Esercizio OSTEP generato." }],
                api: "chat",
                provider: "anthropic",
                model: "claude-3-7-sonnet",
                usage: mkUsage(),
                stopReason: "stop" as const,
                timestamp: Date.now()
              }
            };
            return;
          }
          callIdx++;
          let toolCall: any;
          if (sys.includes("Memory Virtualization Lab")) {
            toolCall = {
              type: "toolCall",
              id: `tc-${callIdx}`,
              name: "generate_memory_preset",
              arguments: {
                subsystem: "segmentation",
                title: "Esercizio OSTEP: Segmentazione",
                consegna: "Analizza base e limit.",
                config: { ...SEGMENTATION_UNIMI_SEED_0, id: `mem-ex-${callIdx}`, name: "Esercizio OSTEP: Segmentazione" }
              }
            };
          } else if (sys.includes("CPU Scheduling")) {
            toolCall = {
              type: "toolCall",
              id: `tc-${callIdx}`,
              name: "generate_workload_preset",
              arguments: {
                title: "Esercizio OSTEP: STCF",
                consegna: "Traccia STCF con 3 processi.",
                algorithm: "stcf",
                workload: [
                  { id: "P0", arrivalTime: 0, bursts: [{ type: "cpu", duration: 2 }, { type: "io", duration: 2 }, { type: "cpu", duration: 4 }] },
                  { id: "P1", arrivalTime: 2, bursts: [{ type: "cpu", duration: 4 }] },
                  { id: "P2", arrivalTime: 4, bursts: [{ type: "cpu", duration: 2 }] }
                ]
              }
            };
          } else {
            toolCall = {
              type: "toolCall",
              id: `tc-${callIdx}`,
              name: "generate_concurrency_scenario",
              arguments: {
                title: "Esercizio OSTEP: Bounded Buffer Mesa 2 CV",
                consegna: "Verifica Bounded Buffer con 2 CV.",
                scenario: {
                  ...BOUNDED_BUFFER_MESA,
                  scenarioId: `conc-ex-${callIdx}`,
                  name: "Esercizio OSTEP: Bounded Buffer Mesa 2 CV"
                }
              }
            };
          }
          yield {
            type: "done" as const,
            reason: "toolUse" as const,
            message: {
              role: "assistant" as const,
              content: [toolCall],
              api: "chat",
              provider: "anthropic",
              model: "claude-3-7-sonnet",
              usage: mkUsage(),
              stopReason: "toolUse" as const,
              timestamp: Date.now()
            }
          };
        }
        return gen();
      }
    }
  } as unknown as PluginBackendContext;
}

function createMockFrontendContext(callHandler?: (op: string, input?: unknown) => Promise<unknown>): PluginFrontendContext {
  return {
    call: async <T = unknown>(operation: string, input?: unknown): Promise<T> => {
      if (callHandler) {
        return (await callHandler(operation, input)) as T;
      }
      if (operation === "ai-turn") {
        return (await handleAiTurn(createMockBackendContextForIntegration(), input)) as T;
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
      call: async <T = unknown>(_operation: string, input?: unknown): Promise<T> => {
        return (await handleAiTurn(createMockBackendContextForIntegration(), input)) as T;
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

test("6. Copilot integration: Memory Lab executeControlAction handles set_subsystem, load_preset, set_va, step_trace, and reset", async () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    let latestState = getInitialMemoryLabState("ws-mem-ctrl");
    let queuedActions: Array<{ action: string; payload: unknown }> = [];

    const frontendCtx = {
      call: async <T = unknown>(op: string): Promise<T> => {
        if (op === "ai-turn") {
          return {
            responseText: "Executing memory actions",
            controlActions: queuedActions
          } as T;
        }
        return {} as T;
      }
    } as unknown as PluginFrontendContext;

    const cleanup = createMemoryLabView(
      container as any,
      latestState,
      (s) => {
        latestState = s;
      },
      frontendCtx
    );

    const sendActions = async (actions: Array<{ action: string; payload: unknown }>) => {
      queuedActions = actions;
      const pill = container.querySelector(".copilot-pill-input");
      pill?.focus();
      const comp = container.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
      comp.value = "run action";
      const sendBtn = container.querySelector(".copilot-btn-send");
      sendBtn?.click();
      await new Promise((r) => setTimeout(r, 20));
    };

    // set_subsystem with defensive normalization
    await sendActions([{ action: "set_subsystem", payload: { subsystem: "two-level-paging" } }]);
    assert.equal(latestState.subsystem, "multi-level");

    await sendActions([{ action: "set_subsystem", payload: { subsystem: "swapping" } }]);
    assert.equal(latestState.subsystem, "replacement");

    // load_preset valid & unknown
    await sendActions([{ action: "load_preset", payload: { presetId: "paging-unimi-seed-0" } }]);
    assert.equal(latestState.subsystem, "linear-paging");
    assert.equal(latestState.activePresetId, "paging-unimi-seed-0");

    await sendActions([{ action: "load_preset", payload: { presetId: "non-existent-preset" } }]);
    assert.equal(latestState.activePresetId, "paging-unimi-seed-0");

    // set_va with hex string & number
    await sendActions([{ action: "set_va", payload: { va: "0x100" } }]);
    assert.equal(latestState.currentVa, 256);

    await sendActions([{ action: "set_va", payload: { virtualAddress: 512 } }]);
    assert.equal(latestState.currentVa, 512);

    // execute_translation updates currentVa, vaInputString, and tlbConfig.asid
    await sendActions([{ action: "execute_translation", payload: { virtualAddress: "0x200", asid: 3 } }]);
    assert.equal(latestState.currentVa, 512);
    assert.equal(latestState.vaInputString, "512");
    assert.equal((latestState.tlbConfig as unknown as { asid?: number }).asid, 3);

    await sendActions([{ action: "execute_translation", payload: { virtualAddress: 1024 } }]);
    assert.equal(latestState.currentVa, 1024);
    assert.equal(latestState.vaInputString, "1024");

    // execute_translation ignores invalid virtualAddress
    await sendActions([{ action: "execute_translation", payload: { virtualAddress: -5, asid: 9 } }]);
    assert.equal(latestState.currentVa, 1024);
    assert.equal((latestState.tlbConfig as unknown as { asid?: number }).asid, 3);

    // step_trace and clamping
    await sendActions([{ action: "step_trace", payload: { steps: 2 } }]);
    assert.equal(latestState.currentTraceIndex, 2);
    assert.equal(latestState.currentVa, latestState.trace[2]);

    await sendActions([{ action: "step_trace", payload: { steps: 999 } }]);
    assert.equal(latestState.currentTraceIndex, latestState.trace.length - 1);

    // reset
    await sendActions([{ action: "reset", payload: {} }]);
    assert.equal(latestState.currentTraceIndex, 0);
    assert.equal(latestState.currentVa, latestState.trace[0]);

    cleanup();
  } finally {
    env.restore();
  }
});

test("7. Copilot integration: CPU Lab executeControlAction and applyExercise accept quantum", async () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    let latestState = getInitialCpuLabState("ws-cpu-ctrl");
    let queuedResponse: Record<string, unknown> = {};

    const frontendCtx = {
      call: async <T = unknown>(op: string): Promise<T> => {
        if (op === "ai-turn") {
          return queuedResponse as T;
        }
        return {} as T;
      }
    } as unknown as PluginFrontendContext;

    const cleanup = createCpuLabView(
      container as any,
      latestState,
      (s) => {
        latestState = s;
      },
      frontendCtx
    );

    const sendTurn = async (response: Record<string, unknown>) => {
      queuedResponse = response;
      const pill = container.querySelector(".copilot-pill-input");
      pill?.focus();
      const comp = container.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
      comp.value = "run cpu action";
      const sendBtn = container.querySelector(".copilot-btn-send");
      sendBtn?.click();
      await new Promise((r) => setTimeout(r, 20));
    };

    // load_preset valid & unknown
    await sendTurn({
      responseText: "load preset",
      controlActions: [{ action: "load_preset", payload: { presetId: "rr-quantum-demo" } }]
    });
    assert.equal(latestState.activePresetId, "rr-quantum-demo");
    assert.equal(latestState.algorithm, "RR");

    await sendTurn({
      responseText: "unknown preset",
      controlActions: [{ action: "load_preset", payload: { presetId: "unknown-cpu-preset" } }]
    });
    assert.equal(latestState.activePresetId, "rr-quantum-demo");

    // set_quantum (positive & clamped)
    await sendTurn({
      responseText: "set quantum",
      controlActions: [{ action: "set_quantum", payload: { quantum: 5 } }]
    });
    assert.equal(latestState.rrQuantum, 5);

    await sendTurn({
      responseText: "clamp quantum",
      controlActions: [{ action: "set_quantum", payload: { quantum: -3 } }]
    });
    assert.equal(latestState.rrQuantum, 1);

    // step_tick & reset
    await sendTurn({
      responseText: "step tick",
      controlActions: [{ action: "step_tick", payload: { ticks: 3 } }]
    });
    assert.equal(latestState.currentTick, 3);

    await sendTurn({
      responseText: "reset",
      controlActions: [{ action: "reset", payload: {} }]
    });
    assert.equal(latestState.currentTick, 0);

    // control_scheduler: step, play, pause, reset
    await sendTurn({
      responseText: "control_scheduler step",
      controlActions: [{ action: "control_scheduler", payload: { command: "step", ticks: 2 } }]
    });
    assert.equal(latestState.currentTick, 2);
    assert.equal(latestState.isPlaying, false);

    await sendTurn({
      responseText: "control_scheduler play",
      controlActions: [{ action: "control_scheduler", payload: { command: "play" } }]
    });
    assert.equal(latestState.isPlaying, true);

    await sendTurn({
      responseText: "control_scheduler pause",
      controlActions: [{ action: "control_scheduler", payload: { command: "pause" } }]
    });
    assert.equal(latestState.isPlaying, false);

    await sendTurn({
      responseText: "control_scheduler reset",
      controlActions: [{ action: "control_scheduler", payload: { command: "reset" } }]
    });
    assert.equal(latestState.currentTick, 0);
    assert.equal(latestState.isPlaying, false);

    // applyExercise accepting quantum
    await sendTurn({
      responseText: "exercise with quantum",
      generatedExercise: {
        id: "ex-cpu-quantum",
        title: "RR Quantum Test",
        date: new Date().toISOString(),
        consegna: "Test quantum",
        sourceTag: "ai",
        mode: "cpu-lab",
        config: {
          algorithm: "RR",
          quantum: 7,
          workload: [{ id: "P1", arrivalTime: 0, bursts: [{ type: "cpu", duration: 10 }] }]
        }
      }
    });
    assert.equal(latestState.rrQuantum, 7);

    cleanup();
  } finally {
    env.restore();
  }
});

test("8. Copilot integration: Concurrency Lab executeControlAction handles load_preset, step_thread_instruction, and reset", async () => {
  const env = setupMockDom();
  try {
    const container = new MockDOMElement();
    let latestState = getInitialConcurrencyLabState("ws-conc-ctrl");
    let queuedActions: Array<{ action: string; payload: unknown }> = [];

    const frontendCtx = {
      call: async <T = unknown>(op: string): Promise<T> => {
        if (op === "ai-turn") {
          return {
            responseText: "Executing concurrency actions",
            controlActions: queuedActions
          } as T;
        }
        return {} as T;
      }
    } as unknown as PluginFrontendContext;

    const cleanup = createConcurrencyLabView(
      container as any,
      latestState,
      (s) => {
        latestState = s;
      },
      frontendCtx
    );

    const sendActions = async (actions: Array<{ action: string; payload: unknown }>) => {
      queuedActions = actions;
      const pill = container.querySelector(".copilot-pill-input");
      pill?.focus();
      const comp = container.querySelector(".copilot-composer-input") as unknown as MockDOMElement;
      comp.value = "run conc action";
      const sendBtn = container.querySelector(".copilot-btn-send");
      sendBtn?.click();
      await new Promise((r) => setTimeout(r, 20));
    };

    // load_preset valid & unknown
    await sendActions([{ action: "load_preset", payload: { presetId: "ticket-lock" } }]);
    assert.equal(latestState.activePresetId, "ticket-lock");
    assert.equal(latestState.scenarioState.scenarioId, "ticket-lock");

    await sendActions([{ action: "load_preset", payload: { presetId: "unknown-conc-preset" } }]);
    assert.equal(latestState.activePresetId, "ticket-lock");

    // step_thread_instruction
    await sendActions([{ action: "step_thread_instruction", payload: { threadId: "T1" } }]);
    const t1 = latestState.scenarioState.threads.find((t) => t.id === "T1");
    assert.equal(t1?.programCounter, 1);

    // reset
    await sendActions([{ action: "reset", payload: {} }]);
    const t1Reset = latestState.scenarioState.threads.find((t) => t.id === "T1");
    assert.equal(t1Reset?.programCounter, 0);

    cleanup();
  } finally {
    env.restore();
  }
});
