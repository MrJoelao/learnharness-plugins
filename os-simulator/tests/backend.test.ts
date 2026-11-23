import assert from "node:assert/strict";
import { it } from "node:test";
import { activate } from "../src/backend/index.ts";
import type { PluginBackendContext, PluginModeDefinition } from "learnharness-plugin-api";

type WorkspaceInput = Parameters<PluginModeDefinition["initializeWorkspace"]>[0]["workspace"];

interface MemoryState {
  workspaceId: string;
  subsystem: string;
  customConfig: unknown;
  history: unknown[];
  exerciseHistory: unknown[];
  lastUpdated: string;
}

interface CpuState {
  workspaceId: string;
  algorithm: string;
  quantum: number;
  workload: unknown[];
  exerciseHistory: unknown[];
  lastUpdated: string;
}

interface ConcurrencyState {
  workspaceId: string;
  scenario: string;
  threads: unknown[];
  exerciseHistory: unknown[];
  lastUpdated: string;
}

it("activate registers memory-lab, cpu-lab, and concurrency-lab modes with exerciseHistory and ai handlers", () => {
  const registeredModes: PluginModeDefinition[] = [];
  const registeredHandlers = new Map<string, (input: unknown) => unknown>();
  const fakeStorage = new Map<string, unknown>();

  const fakeCtx = {
    registerMode(def: PluginModeDefinition) {
      registeredModes.push(def);
      return () => {
        const idx = registeredModes.indexOf(def);
        if (idx !== -1) registeredModes.splice(idx, 1);
      };
    },
    handle(name: string, handler: (input: unknown) => unknown) {
      registeredHandlers.set(name, handler);
      return () => {
        registeredHandlers.delete(name);
      };
    }
  } as unknown as PluginBackendContext;

  const cleanup = activate(fakeCtx);
  assert.equal(registeredModes.length, 3);
  assert.equal(registeredHandlers.size, 5);
  assert.ok(registeredHandlers.has("ai-turn"));
  assert.ok(registeredHandlers.has("ai-catalog"));
  assert.ok(registeredHandlers.has("get-settings"));
  assert.ok(registeredHandlers.has("update-settings"));
  assert.ok(registeredHandlers.has("get-suggestions"));

  const [memoryMode, cpuMode, concurrencyMode] = registeredModes;
  assert.equal(memoryMode?.id, "memory-lab");
  assert.equal(memoryMode?.category, "Operating Systems");
  assert.equal(memoryMode?.icon, "Network");
  assert.equal(memoryMode?.difficulty, "intermediate");
  assert.equal(memoryMode?.activityType, "exploration");
  assert.deepEqual(memoryMode?.capabilities, ["simulation", "custom-exercises", "step-by-step"]);

  assert.equal(cpuMode?.id, "cpu-lab");
  assert.equal(cpuMode?.category, "Operating Systems");
  assert.equal(cpuMode?.icon, "Calculator");
  assert.equal(cpuMode?.difficulty, "intermediate");
  assert.equal(cpuMode?.activityType, "exploration");
  assert.deepEqual(cpuMode?.capabilities, ["gantt", "step-debugger", "metrics"]);

  assert.equal(concurrencyMode?.id, "concurrency-lab");
  assert.equal(concurrencyMode?.category, "Operating Systems");
  assert.equal(concurrencyMode?.icon, "Brain");
  assert.equal(concurrencyMode?.difficulty, "advanced");
  assert.equal(concurrencyMode?.activityType, "practice");
  assert.deepEqual(concurrencyMode?.capabilities, ["thread-interleaving", "rag-graph", "deadlock-detection"]);

  const mockStorage = {
    get: <T = unknown>(k: string) => fakeStorage.get(k) as T | undefined,
    set: (k: string, v: unknown) => {
      fakeStorage.set(k, v);
    },
    delete: (k: string) => {
      fakeStorage.delete(k);
    }
  };
  const dummySignal = new AbortController().signal;

  memoryMode?.initializeWorkspace({
    workspace: { id: "ws-mem" } as unknown as WorkspaceInput,
    signal: dummySignal,
    storage: mockStorage
  });
  const memState = fakeStorage.get("memory-state") as MemoryState | undefined;
  assert.equal(memState?.workspaceId, "ws-mem");
  assert.equal(memState?.subsystem, "segmentation");
  assert.equal(memState?.customConfig, null);
  assert.deepEqual(memState?.history, []);
  assert.deepEqual(memState?.exerciseHistory, []);
  assert.ok(typeof memState?.lastUpdated === "string");

  cpuMode?.initializeWorkspace({
    workspace: { id: "ws-cpu" } as unknown as WorkspaceInput,
    signal: dummySignal,
    storage: mockStorage
  });
  const cpuState = fakeStorage.get("cpu-state") as CpuState | undefined;
  assert.equal(cpuState?.workspaceId, "ws-cpu");
  assert.equal(cpuState?.algorithm, "rr");
  assert.equal(cpuState?.quantum, 2);
  assert.deepEqual(cpuState?.workload, []);
  assert.deepEqual(cpuState?.exerciseHistory, []);
  assert.ok(typeof cpuState?.lastUpdated === "string");

  concurrencyMode?.initializeWorkspace({
    workspace: { id: "ws-conc" } as unknown as WorkspaceInput,
    signal: dummySignal,
    storage: mockStorage
  });
  const concState = fakeStorage.get("concurrency-state") as ConcurrencyState | undefined;
  assert.equal(concState?.workspaceId, "ws-conc");
  assert.equal(concState?.scenario, "bounded-buffer");
  assert.deepEqual(concState?.threads, []);
  assert.deepEqual(concState?.exerciseHistory, []);
  assert.ok(typeof concState?.lastUpdated === "string");

  assert.equal(typeof cleanup, "function");
  cleanup?.();
  assert.equal(registeredModes.length, 0);
  assert.equal(registeredHandlers.size, 0);
});
