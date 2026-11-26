import { test } from "node:test";
import assert from "node:assert/strict";
import type { PluginBackendContext, ModelCatalogResponse } from "learnharness-plugin-api";
import type { AssistantMessage, AssistantMessageEvent, ToolCall } from "@earendil-works/pi-ai";
import {
  MEMORY_LAB_SYSTEM_PROMPT,
  CPU_LAB_SYSTEM_PROMPT,
  CONCURRENCY_LAB_SYSTEM_PROMPT,
  healPresetPayload,
  resolveDefaultModel,
  handleAiTurn,
  handleAiCatalog,
  getSystemPromptForMode,
  formatStateSnapshot
} from "../src/backend/ai-service.ts";
import { parseMemoryPreset, type MemoryLabPreset } from "../src/core/memory/types.ts";
import { workloadBoundaryParser, type CpuPreset } from "../src/core/cpu/types.ts";
import { concurrencyScenarioBoundaryParser } from "../src/core/concurrency/types.ts";
import { SEGMENTATION_UNIMI_SEED_0, MULTILEVEL_SPARSE_SPACE } from "../src/core/memory/presets.ts";
import { BOUNDED_BUFFER_MESA } from "../src/core/concurrency/presets.ts";
import { savedExerciseBoundaryParser } from "../src/core/exercise-manager.ts";
import { aiTurnRequestBoundaryParser, type AiTurnRequest } from "../src/types/ai.ts";

function makeCatalog(overrides: Partial<ModelCatalogResponse> = {}): ModelCatalogResponse {
  return {
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
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        provider: "google",
        reasoning: true,
        input: ["text"],
        supportedLevels: ["off", "low", "medium", "high"],
        cost: null,
        contextWindow: 1000000,
        maxTokens: 8192
      }
    ],
    defaults: {
      model: { provider: "anthropic", id: "claude-3-7-sonnet" },
      thinkingLevel: "medium"
    },
    rolePins: {
      researcher: null,
      demoBuilder: null,
      visualMaker: null,
      extractor: null,
      auditor: null,
      sideQuestion: null
    },
    slots: {
      strong: { model: { provider: "google", id: "gemini-2.5-pro" }, thinkingLevel: "high" },
      cheap: null,
      vision: null
    },
    providers: [
      { id: "anthropic", envVar: "ANTHROPIC_API_KEY", keyPresent: true },
      { id: "google", envVar: "GEMINI_API_KEY", keyPresent: true }
    ],
    ...overrides
  };
}

function makeAssistantMessage(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"] = "stop",
  errorMessage?: string
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "chat",
    provider: "anthropic",
    model: "claude-3-7-sonnet",
    usage: {
      input: 10,
      output: 20,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 30,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
    timestamp: Date.now()
  };
}

async function* eventsToStream(events: AssistantMessageEvent[]): AsyncIterable<AssistantMessageEvent> {
  for (const ev of events) {
    yield ev;
  }
}

test("System prompts: specialize deeply in OSTEP principles for all 3 modes", () => {
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("Segmentazione"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("0x80000000"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("TLB"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("ASID"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("Modified Clock"));
  assert.ok(MEMORY_LAB_SYSTEM_PROMPT.includes("Belàdy"));

  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("FIFO"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("STCF"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("MLFQ"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("allotment"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("boost"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("LDE"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("Ring 0"));
  assert.ok(CPU_LAB_SYSTEM_PROMPT.includes("iret"));

  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Lost Update"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Ticket Lock"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Mesa"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Bounded Buffer"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Dijkstra"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("RAG"));
  assert.ok(CONCURRENCY_LAB_SYSTEM_PROMPT.includes("Coffman"));

  assert.equal(getSystemPromptForMode("memory-lab"), MEMORY_LAB_SYSTEM_PROMPT);
  assert.equal(getSystemPromptForMode("cpu-lab"), CPU_LAB_SYSTEM_PROMPT);
  assert.equal(getSystemPromptForMode("concurrency-lab"), CONCURRENCY_LAB_SYSTEM_PROMPT);
});

test("Self-healing loop: succeeds immediately and heals invalid payloads", async () => {
  const okRes = await healPresetPayload({
    raw: SEGMENTATION_UNIMI_SEED_0,
    validator: parseMemoryPreset,
    repairFn: () => assert.fail("repairFn should not be invoked for valid payload")
  });
  assert.equal(okRes.success, true);
  assert.equal(okRes.attempts, 1);

  const healedRes = await healPresetPayload({
    raw: { name: "Incomplete" },
    validator: parseMemoryPreset,
    repairFn: () => ({ ...SEGMENTATION_UNIMI_SEED_0, name: "Healed Preset" })
  });
  assert.equal(healedRes.success, true);
  assert.equal(healedRes.attempts, 2);
  assert.equal(healedRes.data?.name, "Healed Preset");

  const failedRes = await healPresetPayload({
    raw: { notAProcess: true },
    validator: workloadBoundaryParser.parse,
    repairFn: () => ({ stillBroken: true }),
    maxAttempts: 3
  });
  assert.equal(failedRes.success, false);
  assert.equal(failedRes.attempts, 3);
});

test("aiTurnRequestBoundaryParser parses and forwards requestId", () => {
  const parsed = aiTurnRequestBoundaryParser.parse({
    mode: "memory-lab",
    userMessage: "Spiega il TLB",
    stateSnapshot: {},
    conversationHistory: [],
    requestId: "req-123"
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.requestId, "req-123");
  }

  const badReqId = aiTurnRequestBoundaryParser.parse({
    mode: "memory-lab",
    userMessage: "Spiega",
    stateSnapshot: {},
    conversationHistory: [],
    requestId: "   "
  });
  assert.equal(badReqId.success, false);
});

test("handleAiCatalog & resolveDefaultModel: resolves defaults -> slots.strong -> first active -> null", async () => {
  // 1. Unavailable ctx.inference -> empty catalog + defaultModel: null
  const emptyRes = await handleAiCatalog({} as PluginBackendContext);
  assert.deepEqual(emptyRes.models, []);
  assert.deepEqual(emptyRes.providers, []);
  assert.equal(emptyRes.defaultModel, null);

  // 2. defaults.model valid & keyPresent -> uses defaults.model
  const cat1 = makeCatalog();
  const res1 = await handleAiCatalog({
    inference: { catalog: async () => cat1 }
  } as unknown as PluginBackendContext);
  assert.deepEqual(res1.defaultModel, {
    provider: "anthropic",
    id: "claude-3-7-sonnet",
    thinkingLevel: "medium"
  });

  // 3. defaults.model provider has keyPresent: false -> falls back to slots.strong.model
  const cat2 = makeCatalog({
    providers: [
      { id: "anthropic", envVar: "ANTHROPIC_API_KEY", keyPresent: false },
      { id: "google", envVar: "GEMINI_API_KEY", keyPresent: true }
    ]
  });
  assert.deepEqual(resolveDefaultModel(cat2), {
    provider: "google",
    id: "gemini-2.5-pro",
    thinkingLevel: "high"
  });

  // 4. defaults & slots.strong unset -> first model with keyPresent: true
  const cat3 = makeCatalog({
    defaults: null,
    slots: { strong: null, cheap: null, vision: null },
    providers: [
      { id: "anthropic", envVar: "ANTHROPIC_API_KEY", keyPresent: false },
      { id: "google", envVar: "GEMINI_API_KEY", keyPresent: true }
    ]
  });
  assert.deepEqual(resolveDefaultModel(cat3), {
    provider: "google",
    id: "gemini-2.5-pro"
  });

  // 5. No provider with keyPresent: true -> null
  const cat4 = makeCatalog({
    providers: [
      { id: "anthropic", envVar: "ANTHROPIC_API_KEY", keyPresent: false },
      { id: "google", envVar: "GEMINI_API_KEY", keyPresent: false }
    ]
  });
  assert.equal(resolveDefaultModel(cat4), null);
});

test("handleAiTurn: returns actionable error when inference or API keys are unconfigured", async () => {
  const request: AiTurnRequest = {
    mode: "memory-lab",
    userMessage: "Spiegami la segmentazione",
    stateSnapshot: {},
    conversationHistory: []
  };

  // Case 1: no ctx.inference.stream
  const resNoInference = await handleAiTurn({} as PluginBackendContext, request);
  assert.ok(resNoInference.error);
  assert.ok(resNoInference.responseText.length > 0);

  // Case 2: empty models / no keyPresent: true -> stream() must NOT be called
  let streamCalled = false;
  const ctxNoKeys = {
    inference: {
      catalog: async () =>
        makeCatalog({
          providers: [
            { id: "anthropic", envVar: "ANTHROPIC_API_KEY", keyPresent: false },
            { id: "google", envVar: "GEMINI_API_KEY", keyPresent: false }
          ]
        }),
      stream: () => {
        streamCalled = true;
        return eventsToStream([]);
      }
    }
  } as unknown as PluginBackendContext;

  const resNoKeys = await handleAiTurn(ctxNoKeys, request);
  assert.equal(streamCalled, false);
  assert.ok(resNoKeys.error);
  assert.ok(resNoKeys.responseText.includes("API key"));
});

test("handleAiTurn: injects stateSnapshot summary and emits streaming notifications", async () => {
  const capturedRequests: Array<{ systemPrompt?: string; tools?: unknown[] }> = [];
  const emittedEvents: Array<{ topic: string; data: unknown }> = [];

  const finalMsg = makeAssistantMessage([{ type: "text", text: "Risposta sulla segmentazione." }]);

  const ctx = {
    signal: new AbortController().signal,
    events: {
      emit: (topic: string, data?: unknown) => {
        emittedEvents.push({ topic, data });
      },
      on: () => () => {}
    },
    inference: {
      catalog: async () => makeCatalog(),
      stream: (req: { context: { systemPrompt?: string; tools?: unknown[] } }) => {
        capturedRequests.push(req.context);
        return eventsToStream([
          { type: "start", partial: makeAssistantMessage([]) },
          { type: "thinking_delta", contentIndex: 0, delta: "Analizzo...", partial: makeAssistantMessage([]) },
          { type: "text_delta", contentIndex: 0, delta: "Risposta ", partial: makeAssistantMessage([]) },
          { type: "text_delta", contentIndex: 0, delta: "sulla segmentazione.", partial: makeAssistantMessage([]) },
          { type: "done", reason: "stop", message: finalMsg }
        ]);
      }
    }
  } as unknown as PluginBackendContext;

  const res = await handleAiTurn(ctx, {
    mode: "memory-lab",
    userMessage: "Cosa vedi nello stato attuale?",
    requestId: "req-stream-1",
    stateSnapshot: {
      subsystem: "tlb",
      activePresetId: "tlb-cached-translation",
      currentVa: 4096,
      trace: [4096, 8192]
    },
    conversationHistory: []
  });

  assert.equal(res.error, undefined);
  assert.equal(res.responseText, "Risposta sulla segmentazione.");
  assert.equal(capturedRequests.length, 1);
  assert.ok(capturedRequests[0]?.systemPrompt?.includes("tlb-cached-translation"));
  assert.ok(capturedRequests[0]?.systemPrompt?.includes("0x1000"));
  assert.ok(Array.isArray(capturedRequests[0]?.tools) && capturedRequests[0]!.tools!.length >= 5);

  assert.equal(emittedEvents.length, 3);
  assert.deepEqual(emittedEvents[0], {
    topic: "ai-stream",
    data: { requestId: "req-stream-1", type: "thinking_delta", delta: "Analizzo..." }
  });
  assert.deepEqual(emittedEvents[1], {
    topic: "ai-stream",
    data: { requestId: "req-stream-1", type: "text_delta", delta: "Risposta " }
  });
  assert.deepEqual(emittedEvents[2], {
    topic: "ai-stream",
    data: { requestId: "req-stream-1", type: "text_delta", delta: "sulla segmentazione." }
  });
});

test("handleAiTurn: tool-calling loop with self-correction, exercise generation, and control actions", async () => {
  let round = 0;
  const capturedMessagesPerRound: unknown[][] = [];
  const emittedEvents: Array<{ topic: string; data: unknown }> = [];

  // Round 0: invalid generate_memory_preset (missing trace / bad config) + valid set_subsystem
  const badGenCall: ToolCall = {
    type: "toolCall",
    id: "tc-1",
    name: "generate_memory_preset",
    arguments: {
      subsystem: "two-level-paging",
      title: "Paging 2 Livelli",
      consegna: "Calcola risparmio di memoria",
      config: { notValid: true }
    }
  };
  const partialWithTool: AssistantMessage = makeAssistantMessage([badGenCall], "toolUse");

  // Round 1: self-corrected generate_memory_preset with two-level-paging -> multi-level + control action load_preset
  const goodGenCall: ToolCall = {
    type: "toolCall",
    id: "tc-2",
    name: "generate_memory_preset",
    arguments: {
      subsystem: "two-level-paging",
      title: "Paging 2 Livelli",
      consegna: "Calcola risparmio di memoria",
      config: {
        ...MULTILEVEL_SPARSE_SPACE,
        id: "ai-2level-1"
      } as unknown as Record<string, never>
    }
  };
  const ctrlCall: ToolCall = {
    type: "toolCall",
    id: "tc-3",
    name: "set_subsystem",
    arguments: { subsystem: "multi-level" }
  };

  const ctx = {
    signal: new AbortController().signal,
    events: {
      emit: (topic: string, data?: unknown) => {
        emittedEvents.push({ topic, data });
      },
      on: () => () => {}
    },
    inference: {
      catalog: async () => makeCatalog(),
      stream: (req: { context: { messages: unknown[] } }) => {
        capturedMessagesPerRound.push([...req.context.messages]);
        const currentRound = round++;
        if (currentRound === 0) {
          return eventsToStream([
            { type: "toolcall_start", contentIndex: 0, partial: partialWithTool },
            { type: "done", reason: "toolUse", message: makeAssistantMessage([badGenCall], "toolUse") }
          ]);
        }
        if (currentRound === 1) {
          return eventsToStream([
            { type: "done", reason: "toolUse", message: makeAssistantMessage([goodGenCall, ctrlCall], "toolUse") }
          ]);
        }
        return eventsToStream([
          { type: "text_delta", contentIndex: 0, delta: "Esercizio pronto.", partial: makeAssistantMessage([]) },
          { type: "done", reason: "stop", message: makeAssistantMessage([{ type: "text", text: "Esercizio pronto." }], "stop") }
        ]);
      }
    }
  } as unknown as PluginBackendContext;

  const res = await handleAiTurn(ctx, {
    mode: "memory-lab",
    userMessage: "Genera un esercizio di paging a due livelli e passa al tab multi-level.",
    requestId: "req-loop-1",
    stateSnapshot: { subsystem: "segmentation" },
    conversationHistory: []
  });

  assert.equal(res.error, undefined);
  assert.equal(res.responseText, "Esercizio pronto.");
  assert.equal(round, 3);

  // Verify round 1 received AssistantMessage + ToolResultMessage(isError: true)
  const round1Msgs = capturedMessagesPerRound[1] as Array<{ role: string; isError?: boolean }>;
  const toolResult1 = round1Msgs.find((m) => m.role === "toolResult");
  assert.ok(toolResult1);
  assert.equal(toolResult1.isError, true);

  // Verify generatedExercise normalized "two-level-paging" -> "multi-level"
  assert.ok(res.generatedExercise);
  assert.equal(res.generatedExercise.mode, "memory-lab");
  assert.equal(savedExerciseBoundaryParser.parse(res.generatedExercise).success, true);
  const memConfig = res.generatedExercise.config as MemoryLabPreset;
  assert.equal(memConfig.subsystem, "multi-level");
  assert.equal(parseMemoryPreset(memConfig).success, true);

  // Verify controlActions
  assert.deepEqual(res.controlActions, [
    { action: "set_subsystem", payload: { subsystem: "multi-level" } }
  ]);

  // Verify toolcall_start stream notification
  assert.ok(
    emittedEvents.some(
      (e) =>
        e.topic === "ai-stream" &&
        (e.data as Record<string, unknown>).type === "toolcall_start" &&
        (e.data as Record<string, unknown>).toolName === "generate_memory_preset"
    )
  );
});

test("handleAiTurn: cpu-lab generate_workload_preset maps fields & argumentsError is reported to model", async () => {
  let round = 0;

  const malformedCall: ToolCall = {
    type: "toolCall",
    id: "tc-err",
    name: "generate_workload_preset",
    arguments: {},
    argumentsError: "Unexpected end of JSON input"
  };

  const validCpuCall: ToolCall = {
    type: "toolCall",
    id: "tc-ok",
    name: "generate_workload_preset",
    arguments: {
      title: "RR Test",
      consegna: "Verifica turnaround con quantum=2",
      algorithm: "rr",
      quantum: 2,
      workload: [
        { id: "P0", arrivalTime: 0, bursts: [{ type: "cpu", duration: 4 }] },
        { id: "P1", arrivalTime: 1, bursts: [{ type: "cpu", duration: 3 }] }
      ]
    }
  };

  const ctx = {
    signal: new AbortController().signal,
    inference: {
      catalog: async () => makeCatalog(),
      stream: () => {
        const currentRound = round++;
        if (currentRound === 0) {
          return eventsToStream([
            { type: "done", reason: "toolUse", message: makeAssistantMessage([malformedCall], "toolUse") }
          ]);
        }
        if (currentRound === 1) {
          return eventsToStream([
            { type: "done", reason: "toolUse", message: makeAssistantMessage([validCpuCall], "toolUse") }
          ]);
        }
        return eventsToStream([
          { type: "done", reason: "stop", message: makeAssistantMessage([{ type: "text", text: "Workload CPU creato." }]) }
        ]);
      }
    }
  } as unknown as PluginBackendContext;

  const res = await handleAiTurn(ctx, {
    mode: "cpu-lab",
    userMessage: "Genera un workload Round Robin con quantum 2",
    stateSnapshot: { algorithm: "FIFO", rrQuantum: 2 },
    conversationHistory: []
  });

  assert.equal(res.error, undefined);
  assert.equal(res.responseText, "Workload CPU creato.");
  assert.ok(res.generatedExercise);
  assert.equal(res.generatedExercise.mode, "cpu-lab");
  const cpuCfg = res.generatedExercise.config as CpuPreset;
  assert.equal(cpuCfg.algorithm, "RR");
  assert.equal(cpuCfg.rrQuantum, 2);
  assert.equal(cpuCfg.name, "RR Test");
});

test("handleAiTurn: concurrency-lab generate_concurrency_scenario & stream error propagation", async () => {
  // 1. Concurrency scenario generation + control action
  let round = 0;
  const concCall: ToolCall = {
    type: "toolCall",
    id: "tc-conc",
    name: "generate_concurrency_scenario",
    arguments: {
      title: "Bounded Buffer Custom",
      consegna: "Testa Mesa 2 CV",
      scenario: BOUNDED_BUFFER_MESA as unknown as Record<string, never>
    }
  };
  const stepCall: ToolCall = {
    type: "toolCall",
    id: "tc-step",
    name: "step_thread_instruction",
    arguments: { threadId: "P1" }
  };

  const ctxOk = {
    signal: new AbortController().signal,
    inference: {
      catalog: async () => makeCatalog(),
      stream: () => {
        const currentRound = round++;
        if (currentRound === 0) {
          return eventsToStream([
            { type: "done", reason: "toolUse", message: makeAssistantMessage([concCall, stepCall], "toolUse") }
          ]);
        }
        return eventsToStream([
          { type: "done", reason: "stop", message: makeAssistantMessage([{ type: "text", text: "Scenario pronto." }]) }
        ]);
      }
    }
  } as unknown as PluginBackendContext;

  const resOk = await handleAiTurn(ctxOk, {
    mode: "concurrency-lab",
    userMessage: "Crea scenario Bounded Buffer ed esegui un passo di P1.",
    stateSnapshot: { activePresetId: "lost-update" },
    conversationHistory: []
  });

  assert.equal(resOk.error, undefined);
  assert.ok(resOk.generatedExercise);
  assert.equal(
    concurrencyScenarioBoundaryParser.parse(resOk.generatedExercise.config).success,
    true
  );
  assert.deepEqual(resOk.controlActions, [
    { action: "step_thread_instruction", payload: { threadId: "P1" } }
  ]);

  // 2. Stream error event propagation
  const ctxErr = {
    signal: new AbortController().signal,
    inference: {
      catalog: async () => makeCatalog(),
      stream: () =>
        eventsToStream([
          {
            type: "error",
            reason: "error",
            error: makeAssistantMessage([], "error", "Rate limit exceeded")
          }
        ])
    }
  } as unknown as PluginBackendContext;

  const resErr = await handleAiTurn(ctxErr, {
    mode: "concurrency-lab",
    userMessage: "Spiega Coffman",
    stateSnapshot: {},
    conversationHistory: []
  });
  assert.equal(resErr.error, "Rate limit exceeded");

  // 3. formatStateSnapshot smoke check
  const snapSummary = formatStateSnapshot("cpu-lab", { algorithm: "MLFQ", rrQuantum: 4, currentTick: 7 });
  assert.ok(snapSummary.includes("MLFQ"));
  assert.ok(snapSummary.includes("Tick corrente: 7"));
});
