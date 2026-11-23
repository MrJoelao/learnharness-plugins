import { test } from "node:test";
import assert from "node:assert/strict";
import type { PluginBackendContext, ModelCatalogResponse } from "learnharness-plugin-api";
import {
  MEMORY_LAB_SYSTEM_PROMPT,
  CPU_LAB_SYSTEM_PROMPT,
  CONCURRENCY_LAB_SYSTEM_PROMPT,
  healPresetPayload,
  handleAiTurn,
  handleAiCatalog,
  getSystemPromptForMode
} from "../src/backend/ai-service.ts";
import { parseMemoryPreset } from "../src/core/memory/types.ts";
import { workloadBoundaryParser } from "../src/core/cpu/types.ts";
import { concurrencyScenarioBoundaryParser } from "../src/core/concurrency/types.ts";
import { SEGMENTATION_UNIMI_SEED_0 } from "../src/core/memory/presets.ts";
import { STCF_PREEMPTION } from "../src/core/cpu/presets.ts";
import { BOUNDED_BUFFER_MESA } from "../src/core/concurrency/presets.ts";
import { savedExerciseBoundaryParser } from "../src/core/exercise-manager.ts";
import type { AiTurnRequest } from "../src/types/ai.ts";

test("System prompts: specialize deeply in OSTEP principles for all 3 modes", () => {
  // Memory Lab OSTEP concepts
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("Segmentazione"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("0x80000000"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("TLB"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("ASID"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("Modified Clock"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("Belàdy"));

  // CPU Lab OSTEP concepts
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("FIFO"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("STCF"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("MLFQ"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("allotment"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("boost"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("LDE"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("Ring 0"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("iret"));

  // Concurrency Lab OSTEP concepts
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Lost Update"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Ticket Lock"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Mesa"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Bounded Buffer"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Dijkstra"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("RAG"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Coffman"));

  // Helper selector
  assert.equal(getSystemPromptForMode("memory-lab"), MEMORY_LAB_SYSTEM_PROMPT);
  assert.equal(getSystemPromptForMode("cpu-lab"), CPU_LAB_SYSTEM_PROMPT);
  assert.equal(getSystemPromptForMode("concurrency-lab"), CONCURRENCY_LAB_SYSTEM_PROMPT);
});

test("Self-healing loop: succeeds immediately when payload is valid", async () => {
  const result = await healPresetPayload({
    raw: SEGMENTATION_UNIMI_SEED_0,
    validator: parseMemoryPreset,
    repairFn: () => assert.fail("repairFn should not be invoked for valid payload")
  });

  assert.equal(result.success, true);
  assert.equal(result.attempts, 1);
  assert.equal(result.history.length, 0);
  assert.equal(result.data?.id, "segmentation-unimi-seed-0");
});

test("Self-healing loop: heals invalid memory preset within retry attempts", async () => {
  // Start with missing required id and subsystem
  const malformedMemory = {
    name: "Incomplete Memory Preset",
    trace: [0x0100]
  };

  let repairCount = 0;
  const result = await healPresetPayload({
    raw: malformedMemory,
    validator: parseMemoryPreset,
    repairFn: ({ lastError, attempt }) => {
      repairCount++;
      assert.ok(lastError.length > 0);
      assert.equal(attempt, 1);
      // Return a healed valid preset
      return {
        ...SEGMENTATION_UNIMI_SEED_0,
        name: "Healed Preset"
      };
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.attempts, 2);
  assert.equal(repairCount, 1);
  assert.equal(result.history.length, 1);
  assert.ok(result.history[0]?.error.length ?? 0 > 0);
  assert.equal(result.data?.name, "Healed Preset");
});

test("Self-healing loop: exhausts 3 attempts when payload remains persistently invalid", async () => {
  const invalidWorkload = { notAProcess: true };

  let callCount = 0;
  const result = await healPresetPayload({
    raw: invalidWorkload,
    validator: workloadBoundaryParser.parse,
    repairFn: () => {
      callCount++;
      return { stillBroken: true };
    },
    maxAttempts: 3
  });

  assert.equal(result.success, false);
  assert.equal(result.attempts, 3);
  assert.equal(callCount, 2); // Repaired after attempt 1 and attempt 2, failed on attempt 3
  assert.equal(result.history.length, 3);
  assert.ok(typeof result.error === "string");
});

test("Self-healing loop: validates concurrency scenario boundary parser", async () => {
  const result = await healPresetPayload({
    raw: BOUNDED_BUFFER_MESA,
    validator: concurrencyScenarioBoundaryParser.parse,
    repairFn: () => assert.fail("Should not call repair")
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.scenarioId, "bounded-buffer-mesa");
});

test("handleAiTurn: fallback generates valid pedagogical response and SavedExercise for memory-lab", async () => {
  const fakeCtx = {} as PluginBackendContext;
  const request: AiTurnRequest = {
    mode: "memory-lab",
    userMessage: "Spiegami la segmentazione e genera un esercizio pratico con preset.",
    stateSnapshot: {},
    conversationHistory: []
  };

  const response = await handleAiTurn(fakeCtx, request);
  assert.ok(response.responseText.length > 50);
  assert.ok(response.responseText.includes("Segmentazione"));
  assert.ok(response.generatedExercise);

  if (response.generatedExercise) {
    assert.equal(response.generatedExercise.sourceTag, "ai");
    assert.equal(response.generatedExercise.mode, "memory-lab");
    const parsedEx = savedExerciseBoundaryParser.parse(response.generatedExercise);
    assert.equal(parsedEx.success, true);
    const parsedConfig = parseMemoryPreset(response.generatedExercise.config);
    assert.equal(parsedConfig.success, true);
  }
});

test("handleAiTurn: fallback generates valid response and SavedExercise for cpu-lab", async () => {
  const fakeCtx = {} as PluginBackendContext;
  const request: AiTurnRequest = {
    mode: "cpu-lab",
    userMessage: "Vorrei un esercizio per confrontare Round Robin ed MLFQ con boost.",
    stateSnapshot: {},
    conversationHistory: []
  };

  const response = await handleAiTurn(fakeCtx, request);
  assert.ok(response.responseText.length > 50);
  assert.ok(response.responseText.includes("MLFQ") || response.responseText.includes("Round Robin"));
  assert.ok(response.generatedExercise);

  if (response.generatedExercise) {
    assert.equal(response.generatedExercise.sourceTag, "ai");
    assert.equal(response.generatedExercise.mode, "cpu-lab");
    const parsedEx = savedExerciseBoundaryParser.parse(response.generatedExercise);
    assert.equal(parsedEx.success, true);
    const parsedWorkload = workloadBoundaryParser.parse(response.generatedExercise.config);
    assert.equal(parsedWorkload.success, true);
  }
});

test("handleAiTurn: fallback generates valid response and SavedExercise for concurrency-lab", async () => {
  const fakeCtx = {} as PluginBackendContext;
  const request: AiTurnRequest = {
    mode: "concurrency-lab",
    userMessage: "Crea uno scenario per osservare il Lost Update o Bounded Buffer.",
    stateSnapshot: {},
    conversationHistory: []
  };

  const response = await handleAiTurn(fakeCtx, request);
  assert.ok(response.responseText.length > 50);
  assert.ok(response.responseText.includes("Lost Update") || response.responseText.includes("Bounded Buffer"));
  assert.ok(response.generatedExercise);

  if (response.generatedExercise) {
    assert.equal(response.generatedExercise.sourceTag, "ai");
    assert.equal(response.generatedExercise.mode, "concurrency-lab");
    const parsedEx = savedExerciseBoundaryParser.parse(response.generatedExercise);
    assert.equal(parsedEx.success, true);
    const parsedScenario = concurrencyScenarioBoundaryParser.parse(response.generatedExercise.config);
    assert.equal(parsedScenario.success, true);
  }
});

test("handleAiTurn: rejects malformed request payload with clean error", async () => {
  const fakeCtx = {} as PluginBackendContext;
  const badRequest = { mode: "invalid-mode" };

  const response = await handleAiTurn(fakeCtx, badRequest);
  assert.ok(response.error);
  assert.ok(response.responseText.includes("Invalid AI turn request"));
});

test("handleAiCatalog: returns model catalog from ctx.inference or fallback", async () => {
  // Case 1: ctx without inference -> fallback catalog
  const fakeCtxNoInference = {} as PluginBackendContext;
  const catalogFallback = await handleAiCatalog(fakeCtxNoInference);
  assert.ok(Array.isArray(catalogFallback.models));
  assert.ok(catalogFallback.models.length >= 2);

  // Case 2: ctx with inference -> uses ctx.inference.catalog()
  const customCatalog = {
    models: [
      { provider: "mock-provider", id: "mock-model", name: "Mock Model" }
    ]
  } as unknown as ModelCatalogResponse;
  const fakeCtxWithInference = {
    inference: {
      catalog: async () => customCatalog
    }
  } as unknown as PluginBackendContext;

  const catalogResult = await handleAiCatalog(fakeCtxWithInference);
  assert.deepEqual(catalogResult, customCatalog);
});
