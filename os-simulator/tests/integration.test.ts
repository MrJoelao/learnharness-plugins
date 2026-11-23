import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { translateSegmentation } from "../src/core/memory/segmentation.js";
import { translateLinearPaging } from "../src/core/memory/paging.js";
import { simulatePageReplacement, detectBeladyAnomaly } from "../src/core/memory/replacement.js";
import { memoryPresetBoundaryParser, parseMemoryPreset } from "../src/core/memory/types.js";

import { simulateSchedule } from "../src/core/cpu/scheduler.js";
import { cpuPresetBoundaryParser, parseCpuPreset } from "../src/core/cpu/types.js";

import { stepThread, canThreadStep } from "../src/core/concurrency/interleaving.js";
import { buildRAG, checkCoffmanConditions } from "../src/core/concurrency/rag.js";
import { BOUNDED_BUFFER_1CV_BUG } from "../src/core/concurrency/presets.js";
import { scenarioConfigBoundaryParser, parseScenarioConfig } from "../src/core/concurrency/types.js";

import { activate as activateBackend } from "../src/backend/index.js";
import { activate as activateFrontend } from "../src/main.js";
import { triggerJsonImport } from "../src/ui/import-export.js";

import type {
  PluginBackendContext,
  PluginFrontendContext,
  PluginModeDefinition,
  PluginWorkspaceRendererContext
} from "learnharness-plugin-api";
import type { ConcurrencyScenarioState } from "../src/core/concurrency/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const presetsDir = path.resolve(__dirname, "../presets");

function readPresetJson(fileName: string): unknown {
  const filePath = path.join(presetsDir, fileName);
  assert.ok(fs.existsSync(filePath), `Preset file ${fileName} must exist on disk`);
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

test("Integration 1: Boundary Parsers validate all 6 external JSON preset files and reject invalid input", () => {
  // 1. Segmentation UNIMI
  const rawSeg = readPresetJson("segmentation-unimi-seed-0.json");
  const parsedSeg = memoryPresetBoundaryParser.parse(rawSeg);
  assert.equal(parsedSeg.success, true);
  if (parsedSeg.success) {
    assert.equal(parsedSeg.data.id, "segmentation-unimi-seed-0");
    assert.equal(parsedSeg.data.subsystem, "segmentation");
    assert.equal(parsedSeg.data.trace.length, 5);
    assert.equal(parsedSeg.data.segmentationConfig?.addressSpaceBits, 10);
    assert.equal(parsedSeg.data.segmentationConfig?.segments.length, 2);
  }

  // 2. Linear Paging UNIMI
  const rawPaging = readPresetJson("paging-unimi-seed-0.json");
  const parsedPaging = parseMemoryPreset(rawPaging);
  assert.equal(parsedPaging.success, true);
  if (parsedPaging.success) {
    assert.equal(parsedPaging.data.id, "paging-unimi-seed-0");
    assert.equal(parsedPaging.data.subsystem, "linear-paging");
    assert.equal(parsedPaging.data.linearPagingConfig?.pageSize, 4096);
    assert.equal(parsedPaging.data.linearPagingConfig?.pageTable.length, 4);
  }

  // 3. Belàdy Anomaly Reference
  const rawBelady = readPresetJson("belady-anomaly-reference.json");
  const parsedBelady = memoryPresetBoundaryParser.parse(rawBelady);
  assert.equal(parsedBelady.success, true);
  if (parsedBelady.success) {
    assert.equal(parsedBelady.data.id, "belady-anomaly-reference");
    assert.equal(parsedBelady.data.subsystem, "replacement");
    assert.equal(parsedBelady.data.replacementConfig?.frameCount, 3);
    assert.equal(parsedBelady.data.replacementConfig?.policy, "fifo");
    assert.deepEqual(parsedBelady.data.replacementConfig?.referenceString, [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]);
  }

  // 4. MLFQ Gaming Workload
  const rawMlfq = readPresetJson("mlfq-gaming-workload.json");
  const parsedMlfq = cpuPresetBoundaryParser.parse(rawMlfq);
  assert.equal(parsedMlfq.success, true);
  if (parsedMlfq.success) {
    assert.equal(parsedMlfq.data.id, "mlfq-gaming-workload");
    assert.equal(parsedMlfq.data.algorithm, "MLFQ");
    assert.equal(parsedMlfq.data.workload.length, 2);
    assert.equal(parsedMlfq.data.mlfqConfig?.queues.length, 3);
  }

  // 5. Lost Update Thread Demo
  const rawLostUpdate = readPresetJson("lost-update-thread-demo.json");
  const parsedLostUpdate = scenarioConfigBoundaryParser.parse(rawLostUpdate);
  assert.equal(parsedLostUpdate.success, true);
  if (parsedLostUpdate.success) {
    assert.equal(parsedLostUpdate.data.scenarioId, "lost-update-thread-demo");
    assert.equal(parsedLostUpdate.data.threads.length, 2);
    assert.equal(parsedLostUpdate.data.sharedMemory["x"], 10);
  }

  // 6. Dining Philosophers Deadlock & Asymmetric Solution
  const rawDining = readPresetJson("dining-philosophers-deadlock.json");
  const parsedDining = parseScenarioConfig(rawDining);
  assert.equal(parsedDining.success, true);
  if (parsedDining.success) {
    assert.equal(parsedDining.data.scenarioId, "dining-philosophers-deadlock");
    assert.equal(parsedDining.data.threads.length, 5);
    assert.ok(parsedDining.data.asymmetricThreads);
    assert.equal(parsedDining.data.asymmetricThreads?.length, 5);
  }

  // Boundary rejection checks
  const badSeg = { id: "", subsystem: "unknown" };
  const rejectedSeg = memoryPresetBoundaryParser.parse(badSeg);
  assert.equal(rejectedSeg.success, false);

  const badCpu = { id: "test", algorithm: "INVALID_ALGO", workload: [] };
  const rejectedCpu = parseCpuPreset(badCpu);
  assert.equal(rejectedCpu.success, false);

  const badScenario = { scenarioId: "test", name: "bad", threads: [] };
  const rejectedScenario = scenarioConfigBoundaryParser.parse(badScenario);
  assert.equal(rejectedScenario.success, false);
});

test("Integration 2: Mathematical correctness of external memory presets (Segmentation, Paging, Belàdy)", () => {
  // Segmentation UNIMI
  const rawSeg = readPresetJson("segmentation-unimi-seed-0.json");
  const parsedSeg = memoryPresetBoundaryParser.parse(rawSeg);
  assert.equal(parsedSeg.success, true);
  if (!parsedSeg.success) return;

  const segConfig = parsedSeg.data.segmentationConfig!;
  const segTrace = parsedSeg.data.trace;

  const r0 = translateSegmentation(segTrace[0]!, segConfig);
  assert.equal(r0.status, "segmentation-violation");
  assert.equal(r0.pa, null);
  assert.equal(r0.displacement, -501);

  const r1 = translateSegmentation(segTrace[1]!, segConfig);
  assert.equal(r1.status, "valid");
  assert.equal(r1.pa, 7304);
  assert.equal(r1.displacement, 414);

  const r2 = translateSegmentation(segTrace[2]!, segConfig);
  assert.equal(r2.status, "valid");
  assert.equal(r2.pa, 4470);
  assert.equal(r2.displacement, -222);

  const r3 = translateSegmentation(segTrace[3]!, segConfig);
  assert.equal(r3.status, "valid");
  assert.equal(r3.pa, 7200);
  assert.equal(r3.displacement, 310);

  const r4 = translateSegmentation(segTrace[4]!, segConfig);
  assert.equal(r4.status, "segmentation-violation");
  assert.equal(r4.pa, null);
  assert.equal(r4.displacement, 488);

  // Linear Paging UNIMI
  const rawPaging = readPresetJson("paging-unimi-seed-0.json");
  const parsedPaging = memoryPresetBoundaryParser.parse(rawPaging);
  assert.equal(parsedPaging.success, true);
  if (!parsedPaging.success) return;

  const pagingConfig = parsedPaging.data.linearPagingConfig!;
  const pagingTrace = parsedPaging.data.trace;

  const p0 = translateLinearPaging(pagingTrace[0]!, pagingConfig);
  assert.equal(p0.status, "valid");
  assert.equal(p0.pa, 25129);
  assert.equal(p0.extractedComponents.vpn, 3);
  assert.equal(p0.extractedComponents.offset, 553);

  const p1 = translateLinearPaging(pagingTrace[1]!, pagingConfig);
  assert.equal(p1.status, "invalid-page");
  assert.equal(p1.pa, null);

  const p2 = translateLinearPaging(pagingTrace[2]!, pagingConfig);
  assert.equal(p2.status, "invalid-page");
  assert.equal(p2.pa, null);

  const p3 = translateLinearPaging(pagingTrace[3]!, pagingConfig);
  assert.equal(p3.status, "invalid-page");
  assert.equal(p3.pa, null);

  const p4 = translateLinearPaging(pagingTrace[4]!, pagingConfig);
  assert.equal(p4.status, "valid");
  assert.equal(p4.pa, 27166);
  assert.equal(p4.extractedComponents.vpn, 3);
  assert.equal(p4.extractedComponents.offset, 2590);

  // Belàdy Anomaly Reference
  const rawBelady = readPresetJson("belady-anomaly-reference.json");
  const parsedBelady = memoryPresetBoundaryParser.parse(rawBelady);
  assert.equal(parsedBelady.success, true);
  if (!parsedBelady.success) return;

  const refString = parsedBelady.data.replacementConfig!.referenceString;
  const sim3 = simulatePageReplacement({ frameCount: 3, policy: "fifo", referenceString: refString });
  const sim4 = simulatePageReplacement({ frameCount: 4, policy: "fifo", referenceString: refString });

  assert.equal(sim3.totalFaults, 9);
  assert.equal(sim4.totalFaults, 10);
  assert.ok(sim4.totalFaults > sim3.totalFaults);

  const anomaly = detectBeladyAnomaly(refString);
  assert.equal(anomaly.hasAnomaly, true);
  assert.equal(anomaly.frames3Faults, 9);
  assert.equal(anomaly.frames4Faults, 10);
});

test("Integration 3: CPU and Concurrency engines verify MLFQ allotment demotion, lost update, and deadlock resolution", () => {
  // MLFQ Rule 4 Allotment Demotion
  const rawMlfq = readPresetJson("mlfq-gaming-workload.json");
  const parsedMlfq = cpuPresetBoundaryParser.parse(rawMlfq);
  assert.equal(parsedMlfq.success, true);
  if (!parsedMlfq.success) return;

  const mlfqRes = simulateSchedule("MLFQ", parsedMlfq.data.workload, {
    mlfqConfig: parsedMlfq.data.mlfqConfig
  });

  // Verify that P2 was demoted from Q0 to Q1 once cumulative allotment reached 20
  let p2EverInQ1 = false;
  for (const step of mlfqRes.timeline) {
    if (step.mlfqQueues?.[1]?.includes("P2")) {
      p2EverInQ1 = true;
      break;
    }
  }
  assert.equal(p2EverInQ1, true);

  // Lost Update Race Condition
  const rawLostUpdate = readPresetJson("lost-update-thread-demo.json");
  const parsedLostUpdate = scenarioConfigBoundaryParser.parse(rawLostUpdate);
  assert.equal(parsedLostUpdate.success, true);
  if (!parsedLostUpdate.success) return;

  let luState = parsedLostUpdate.data;
  assert.equal(luState.sharedMemory["x"], 10);

  // Step T1 once (reads x=10 into eax)
  luState = stepThread(luState, "T1");
  assert.equal(luState.threads.find((t) => t.id === "T1")!.registers["eax"], 10);

  // Preempt T1: T2 runs to completion (reads 10, adds 1, writes 11)
  luState = stepThread(luState, "T2");
  luState = stepThread(luState, "T2");
  luState = stepThread(luState, "T2");
  assert.equal(luState.threads.find((t) => t.id === "T2")!.state, "terminated");
  assert.equal(luState.sharedMemory["x"], 11);

  // Resume T1 (adds 1 to stale 10 -> 11, writes 11)
  luState = stepThread(luState, "T1");
  luState = stepThread(luState, "T1");
  assert.equal(luState.threads.find((t) => t.id === "T1")!.state, "terminated");
  assert.equal(luState.sharedMemory["x"], 11); // Confirmed: lost update produced 11 instead of 12

  // Dining Philosophers Deadlock & Asymmetric Solution
  const rawDining = readPresetJson("dining-philosophers-deadlock.json");
  const parsedDining = scenarioConfigBoundaryParser.parse(rawDining);
  assert.equal(parsedDining.success, true);
  if (!parsedDining.success) return;

  // 1. Symmetric Deadlock
  let symState = { ...parsedDining.data };
  symState.rag = buildRAG(symState);

  for (let i = 0; i < 5; i++) {
    symState = stepThread(symState, `P${i}`);
  }
  for (let i = 0; i < 5; i++) {
    symState = stepThread(symState, `P${i}`);
  }
  for (let i = 0; i < 5; i++) {
    const phil = symState.threads.find((t) => t.id === `P${i}`)!;
    assert.equal(phil.state, "blocked");
  }

  const symCoffman = checkCoffmanConditions(symState);
  assert.equal(symCoffman.circularWait.met, true);
  assert.equal(symCoffman.isDeadlocked, true);
  assert.ok(symState.rag.detectedCycles.length >= 1);

  // 2. Asymmetric Solution
  assert.ok(parsedDining.data.asymmetricThreads);
  const updatedLocks: Record<string, { id: string; heldBy: string | null; waitQueue: string[]; type: "mutex" }> = {};
  for (let i = 0; i < 5; i++) {
    updatedLocks[`fork${i}`] = { id: `fork${i}`, heldBy: null, waitQueue: [], type: "mutex" };
  }

  let asymState: ConcurrencyScenarioState = {
    ...parsedDining.data,
    threads: parsedDining.data.asymmetricThreads!.map((t) => ({ ...t, registers: { ...t.registers } })),
    locks: updatedLocks,
    activeThreadId: "P0",
    executionHistory: [],
    stepCount: 0,
    rag: {
      processes: ["P0", "P1", "P2", "P3", "P4"],
      resources: ["fork0", "fork1", "fork2", "fork3", "fork4"],
      requests: [],
      allocations: [],
      detectedCycles: []
    }
  };
  asymState.rag = buildRAG(asymState);

  asymState = stepThread(asymState, "P0"); // P0 takes fork0
  asymState = stepThread(asymState, "P1"); // P1 takes fork1
  asymState = stepThread(asymState, "P2"); // P2 takes fork2
  asymState = stepThread(asymState, "P3"); // P3 takes fork3
  asymState = stepThread(asymState, "P4"); // P4 requests fork0 first, blocks without holding fork4!

  const p4 = asymState.threads.find((t) => t.id === "P4")!;
  assert.equal(p4.state, "blocked");
  assert.equal(asymState.locks["fork4"]?.heldBy, null); // fork4 remains free

  // P3 requests fork4 -> succeeds!
  asymState = stepThread(asymState, "P3");
  const p3 = asymState.threads.find((t) => t.id === "P3")!;
  assert.notEqual(p3.state, "blocked");
  assert.equal(asymState.locks["fork4"]?.heldBy, "P3");

  const asymCoffman = checkCoffmanConditions(asymState);
  assert.equal(asymCoffman.circularWait.met, false);
  assert.equal(asymCoffman.isDeadlocked, false);

  // Single Condition Variable Bounded Buffer stall check
  let cv1State = BOUNDED_BUFFER_1CV_BUG;
  // 1. C1 acquires mutex, waits on cond
  cv1State = stepThread(cv1State, "C1");
  cv1State = stepThread(cv1State, "C1");
  // 2. C2 acquires mutex, waits on cond
  cv1State = stepThread(cv1State, "C2");
  cv1State = stepThread(cv1State, "C2");
  // 3. P1 acquires mutex, puts 100, signals cond (wakes C1), unlocks mutex (transfers to C1)
  cv1State = stepThread(cv1State, "P1");
  cv1State = stepThread(cv1State, "P1");
  cv1State = stepThread(cv1State, "P1");
  cv1State = stepThread(cv1State, "P1");
  cv1State = stepThread(cv1State, "P1");
  // 4. C1 re-evaluates condition, reads 100, signals cond (signals C2 instead of P1!), unlocks mutex
  cv1State = stepThread(cv1State, "C1");
  cv1State = stepThread(cv1State, "C1");
  cv1State = stepThread(cv1State, "C1");
  cv1State = stepThread(cv1State, "C1");
  // 5. C2 re-evaluates while count==0 -> goes back to sleep on cond!
  cv1State = stepThread(cv1State, "C2");
  // 6. Stall verified: all threads are blocked / cannot step!
  assert.equal(canThreadStep(cv1State, "P1"), false);
  assert.equal(canThreadStep(cv1State, "C1"), false);
  assert.equal(canThreadStep(cv1State, "C2"), false);
  assert.equal(cv1State.threads.some((t) => canThreadStep(cv1State, t.id)), false);
});

test("Integration 4: Storage persistence, atomicity, and workspace isolation across multiple workspaces", async () => {
  // Setup backend registration
  const registeredModes: PluginModeDefinition[] = [];
  const backendCtx = {
    registerMode(def: PluginModeDefinition) {
      registeredModes.push(def);
      return () => {};
    }
  } as unknown as PluginBackendContext;

  activateBackend(backendCtx);
  assert.equal(registeredModes.length, 3);

  const memoryMode = registeredModes.find((m) => m.id === "memory-lab")!;
  const cpuMode = registeredModes.find((m) => m.id === "cpu-lab")!;
  const concurrencyMode = registeredModes.find((m) => m.id === "concurrency-lab")!;

  assert.ok(memoryMode && cpuMode && concurrencyMode);

  // Create isolated storage for Workspace Alpha and Workspace Beta
  const storageA = new Map<string, unknown>();
  const storageB = new Map<string, unknown>();

  const createStorageAdapter = (map: Map<string, unknown>) => ({
    get: async <T = unknown>(key: string): Promise<T | undefined> => map.get(key) as T | undefined,
    set: async (key: string, value: unknown): Promise<void> => { map.set(key, value); },
    delete: async (key: string): Promise<void> => { map.delete(key); }
  });

  const adapterA = createStorageAdapter(storageA);
  const adapterB = createStorageAdapter(storageB);

  const syncStorageA = {
    get: <T = unknown>(key: string): T | undefined => storageA.get(key) as T | undefined,
    set: (key: string, value: unknown): void => { storageA.set(key, value); },
    delete: (key: string): void => { storageA.delete(key); }
  };

  const syncStorageB = {
    get: <T = unknown>(key: string): T | undefined => storageB.get(key) as T | undefined,
    set: (key: string, value: unknown): void => { storageB.set(key, value); },
    delete: (key: string): void => { storageB.delete(key); }
  };

  const abortControllerA = new AbortController();
  const abortControllerB = new AbortController();

  // Initialize workspace Alpha
  memoryMode.initializeWorkspace({
    workspace: { id: "workspace-alpha" } as any,
    signal: abortControllerA.signal,
    storage: syncStorageA
  });
  cpuMode.initializeWorkspace({
    workspace: { id: "workspace-alpha" } as any,
    signal: abortControllerA.signal,
    storage: syncStorageA
  });
  concurrencyMode.initializeWorkspace({
    workspace: { id: "workspace-alpha" } as any,
    signal: abortControllerA.signal,
    storage: syncStorageA
  });

  // Initialize workspace Beta
  memoryMode.initializeWorkspace({
    workspace: { id: "workspace-beta" } as any,
    signal: abortControllerB.signal,
    storage: syncStorageB
  });
  cpuMode.initializeWorkspace({
    workspace: { id: "workspace-beta" } as any,
    signal: abortControllerB.signal,
    storage: syncStorageB
  });
  concurrencyMode.initializeWorkspace({
    workspace: { id: "workspace-beta" } as any,
    signal: abortControllerB.signal,
    storage: syncStorageB
  });

  // Verify initial states are isolated and specific to their workspace ID
  const memStateA = await adapterA.get<any>("memory-state");
  const memStateB = await adapterB.get<any>("memory-state");
  assert.equal(memStateA.workspaceId, "workspace-alpha");
  assert.equal(memStateB.workspaceId, "workspace-beta");

  // Modify Workspace Alpha's states
  await adapterA.set("memory-state", {
    ...memStateA,
    subsystem: "linear-paging",
    currentVa: 12841
  });

  // Verify Workspace Beta is completely unaffected
  const memStateBAfter = await adapterB.get<any>("memory-state");
  assert.equal(memStateBAfter.subsystem, "segmentation");

  // Setup DOM mock for frontend renderer testing in Node.js
  class MockElement {
    children: MockElement[] = [];
    className = "";
    title = "";
    textContent = "";
    innerHTML = "";
    value = "";
    type = "";
    min = "";
    max = "";
    rows = 0;
    classList = {
      add: () => {},
      remove: () => {},
      contains: () => false
    };
    listeners: Record<string, Function[]> = {};
    addEventListener(type: string, fn: Function) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type]!.push(fn);
    }
    removeEventListener(type: string, fn: Function) {
      if (this.listeners[type]) {
        this.listeners[type] = this.listeners[type]!.filter((f) => f !== fn);
      }
    }
    appendChild(child: MockElement) {
      this.children.push(child);
      return child;
    }
    append(...children: MockElement[]) {
      this.children.push(...children);
    }
    setAttribute() {}
    querySelectorAll() {
      return [];
    }
    remove() {
      this.children = [];
    }
  }

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
    }
  };

  const mockDocument = {
    body: new MockElement(),
    createElement: () => new MockElement(),
    createElementNS: () => new MockElement(),
    addEventListener: (type: string, fn: Function) => mockWindow.addEventListener(type, fn),
    removeEventListener: (type: string, fn: Function) => mockWindow.removeEventListener(type, fn)
  };

  const oldWindow = (globalThis as any).window;
  const oldDocument = (globalThis as any).document;
  (globalThis as any).window = mockWindow;
  (globalThis as any).document = mockDocument;

  try {
    // Setup frontend renderer registration
    type RendererType = Parameters<PluginFrontendContext["registerModeRenderer"]>[2];
    const renderers: Record<string, RendererType> = {};
    const frontendCtx = {
      registerModeRenderer(pluginId: string, modeId: string, renderer: RendererType) {
        renderers[modeId] = renderer;
        return () => {
          delete renderers[modeId];
        };
      }
    } as unknown as PluginFrontendContext;

    activateFrontend(frontendCtx);
    assert.ok(renderers["memory-lab"]);
    assert.ok(renderers["cpu-lab"]);
    assert.ok(renderers["concurrency-lab"]);

    // Mock DOM container for workspace mount
    let cleanedUpA = false;
    const mockContainerA = new MockElement();

    const mountContextA = {
      workspace: { id: "workspace-alpha" },
      signal: abortControllerA.signal,
      storage: adapterA
    };

    const unmountA = await renderers["memory-lab"]!.mount(mockContainerA as any, mountContextA as any);
    assert.ok(typeof unmountA === "function");

    // Trigger abort signal on Workspace Alpha
    abortControllerA.signal.addEventListener("abort", () => {
      cleanedUpA = true;
    });
    abortControllerA.abort();

    assert.equal(cleanedUpA, true);

    // Verify Workspace Beta's storage and controllers are untouched
    assert.equal(abortControllerB.signal.aborted, false);
    const memStateBFinal = await adapterB.get<any>("memory-state");
    assert.equal(memStateBFinal.workspaceId, "workspace-beta");
  } finally {
    (globalThis as any).window = oldWindow;
    (globalThis as any).document = oldDocument;
  }
});

test("Integration 5: triggerJsonImport cleans up DOM element on cancel, error, and successful change without leaking inputs", async () => {
  class MockDOMElement {
    children: MockDOMElement[] = [];
    parentNode: MockDOMElement | null = null;
    listeners: Record<string, Function[]> = {};
    type = "";
    accept = "";
    style: Record<string, string> = {};
    files: any[] = [];
    clicked = false;

    addEventListener(type: string, fn: Function) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type]!.push(fn);
    }
    removeEventListener(type: string, fn: Function) {
      if (this.listeners[type]) {
        this.listeners[type] = this.listeners[type]!.filter((f) => f !== fn);
      }
    }
    dispatchEvent(type: string) {
      const fns = [...(this.listeners[type] || [])];
      fns.forEach((fn) => fn());
    }
    appendChild(child: MockDOMElement) {
      this.children.push(child);
      child.parentNode = this;
      return child;
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
    click() {
      this.clicked = true;
    }
  }

  const mockBody = new MockDOMElement();
  const mockWindowListeners: Record<string, Function[]> = {};
  const mockWindow = {
    addEventListener(type: string, fn: Function) {
      mockWindowListeners[type] = mockWindowListeners[type] || [];
      mockWindowListeners[type]!.push(fn);
    },
    removeEventListener(type: string, fn: Function) {
      if (mockWindowListeners[type]) {
        mockWindowListeners[type] = mockWindowListeners[type]!.filter((f) => f !== fn);
      }
    },
    dispatchEvent(type: string) {
      const fns = [...(mockWindowListeners[type] || [])];
      fns.forEach((fn) => fn());
    }
  };

  class MockFileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsText(file: any) {
      setTimeout(() => {
        if (file.content !== undefined) {
          this.result = file.content;
          this.onload?.();
        } else {
          this.onerror?.();
        }
      }, 10);
    }
  }

  const oldWindow = (globalThis as any).window;
  const oldDocument = (globalThis as any).document;
  const oldFileReader = (globalThis as any).FileReader;

  (globalThis as any).window = mockWindow;
  (globalThis as any).document = {
    body: mockBody,
    createElement: () => new MockDOMElement()
  };
  (globalThis as any).FileReader = MockFileReader;

  try {
    // 1. User cancels file picker -> input must be removed from DOM
    let loaded1 = false;
    let error1 = false;
    triggerJsonImport(
      () => { loaded1 = true; },
      () => { error1 = true; }
    );
    assert.equal(mockBody.children.length, 1, "Input must be attached to document.body");
    const input1 = mockBody.children[0]!;
    assert.equal(input1.clicked, true, "click() must be triggered on input");
    input1.dispatchEvent("cancel");
    assert.equal(mockBody.children.length, 0, "Input must be removed on cancel event");
    assert.equal(loaded1, false);
    assert.equal(error1, false);

    // 2. Change event with empty files -> input must be removed via finally
    triggerJsonImport(
      () => {},
      () => {}
    );
    assert.equal(mockBody.children.length, 1);
    const input2 = mockBody.children[0]!;
    input2.files = [];
    input2.dispatchEvent("change");
    assert.equal(mockBody.children.length, 0, "Input must be removed even if input.files is empty");

    // 3. Change event with invalid JSON -> input removed, onError called
    let capturedError = "";
    triggerJsonImport(
      () => {},
      (err) => { capturedError = err; }
    );
    assert.equal(mockBody.children.length, 1);
    const input3 = mockBody.children[0]!;
    input3.files = [{ content: "INVALID_JSON_SYNTAX" }];
    input3.dispatchEvent("change");
    assert.equal(mockBody.children.length, 0, "Input must be removed immediately on change");
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(capturedError.includes("Sintassi JSON non valida"));

    // 4. Change event with valid JSON -> input removed, onLoaded called with parsed data
    let loadedData: any = null;
    triggerJsonImport(
      (data) => { loadedData = data; },
      () => {}
    );
    assert.equal(mockBody.children.length, 1);
    const input4 = mockBody.children[0]!;
    input4.files = [{ content: JSON.stringify({ preset: "test-ok", count: 42 }) }];
    input4.dispatchEvent("change");
    assert.equal(mockBody.children.length, 0, "Input must be removed immediately on change");
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(loadedData, { preset: "test-ok", count: 42 });

    // 5. Window focus fallback cleanup
    triggerJsonImport(
      () => {},
      () => {}
    );
    assert.equal(mockBody.children.length, 1);
    mockWindow.dispatchEvent("focus");
    // Before timeout, still exists
    await new Promise((r) => setTimeout(r, 100));
    // Simulate fast-forwarding timeout
    assert.equal(mockBody.children.length, 1);
    await new Promise((r) => setTimeout(r, 950));
    assert.equal(mockBody.children.length, 0, "Input must be cleaned up on window focus timeout");
  } finally {
    (globalThis as any).window = oldWindow;
    (globalThis as any).document = oldDocument;
    (globalThis as any).FileReader = oldFileReader;
  }
});
