import type { BoundaryParser } from "./common.js";

export type LabMode = "memory-lab" | "cpu-lab" | "concurrency-lab";

export interface SavedExercise<TConfig = unknown> {
  id: string;
  title: string;
  date: string;
  consegna: string;
  sourceTag: "ai" | "manual";
  mode: LabMode;
  config: TConfig;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AiModelConfig {
  provider: string;
  id: string;
  thinkingLevel?: string;
}

export interface AiTurnRequest {
  mode: LabMode;
  userMessage: string;
  stateSnapshot: unknown;
  conversationHistory: ConversationTurn[];
  model?: AiModelConfig;
}

export interface ControlAction {
  action: string;
  payload: unknown;
}

export interface AiTurnResponse {
  responseText: string;
  generatedExercise?: SavedExercise;
  controlActions?: ControlAction[];
  rawToolCalls?: unknown[];
  error?: string;
}

export type MemorySubsystem =
  | "segmentation"
  | "linear-paging"
  | "two-level-paging"
  | "tlb"
  | "swapping";

export interface InspectMemoryParams {
  subsystem?: MemorySubsystem;
}

export interface GenerateMemoryPresetParams {
  subsystem: MemorySubsystem;
  title: string;
  consegna: string;
  config: unknown;
}

export interface ExecuteTranslationParams {
  virtualAddress: number;
  asid?: number;
}

export interface InspectCpuParams {
  includeProcesses?: boolean;
  includeMetrics?: boolean;
}

export interface GenerateWorkloadPresetParams {
  title: string;
  consegna: string;
  algorithm?: "fifo" | "sjf" | "stcf" | "rr" | "mlfq";
  workload: unknown;
  quantum?: number;
  mlfqConfig?: unknown;
}

export interface ControlSchedulerParams {
  command: "step" | "play" | "pause" | "reset";
  ticks?: number;
}

export interface InspectConcurrencyParams {
  scenarioId?: string;
  includeGraph?: boolean;
}

export interface GenerateConcurrencyScenarioParams {
  title: string;
  consegna: string;
  scenario: unknown;
}

export interface StepThreadInstructionParams {
  threadId: string;
  instructionIndex?: number;
}

export type MemoryToolCall =
  | { name: "inspect_memory"; parameters: InspectMemoryParams }
  | { name: "generate_memory_preset"; parameters: GenerateMemoryPresetParams }
  | { name: "execute_translation"; parameters: ExecuteTranslationParams };

export type CpuToolCall =
  | { name: "inspect_cpu"; parameters: InspectCpuParams }
  | { name: "generate_workload_preset"; parameters: GenerateWorkloadPresetParams }
  | { name: "control_scheduler"; parameters: ControlSchedulerParams };

export type ConcurrencyToolCall =
  | { name: "inspect_concurrency"; parameters: InspectConcurrencyParams }
  | { name: "generate_concurrency_scenario"; parameters: GenerateConcurrencyScenarioParams }
  | { name: "step_thread_instruction"; parameters: StepThreadInstructionParams };

export type AiToolCall = MemoryToolCall | CpuToolCall | ConcurrencyToolCall;

export interface AiToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MEMORY_TOOL_SCHEMAS: readonly AiToolSchema[] = [
  {
    name: "inspect_memory",
    description: "Inspect active memory virtualization state, translation structures, or TLB cache.",
    parameters: {
      type: "object",
      properties: {
        subsystem: {
          type: "string",
          enum: ["segmentation", "linear-paging", "two-level-paging", "tlb", "swapping"],
          description: "Optional memory subsystem to inspect."
        }
      }
    }
  },
  {
    name: "generate_memory_preset",
    description: "Generate a memory lab exercise preset with segmentation or paging parameters.",
    parameters: {
      type: "object",
      properties: {
        subsystem: {
          type: "string",
          enum: ["segmentation", "linear-paging", "two-level-paging", "tlb", "swapping"],
          description: "Target memory subsystem."
        },
        title: { type: "string", description: "Exercise title." },
        consegna: { type: "string", description: "Pedagogical prompt and objectives." },
        config: { type: "object", description: "MemoryLabPreset configuration." }
      },
      required: ["subsystem", "title", "consegna", "config"]
    }
  },
  {
    name: "execute_translation",
    description: "Translate a virtual address through the active memory mapping structure.",
    parameters: {
      type: "object",
      properties: {
        virtualAddress: { type: "number", description: "Virtual address to translate." },
        asid: { type: "number", description: "Address Space ID (for TLB lookup)." }
      },
      required: ["virtualAddress"]
    }
  }
] as const;

export const CPU_TOOL_SCHEMAS: readonly AiToolSchema[] = [
  {
    name: "inspect_cpu",
    description: "Inspect current CPU scheduler queue, running process, or LDE hardware state.",
    parameters: {
      type: "object",
      properties: {
        includeProcesses: { type: "boolean", description: "Include full process list." },
        includeMetrics: { type: "boolean", description: "Include turnaround and response metrics." }
      }
    }
  },
  {
    name: "generate_workload_preset",
    description: "Generate a CPU scheduling workload preset with process arrival and burst profiles.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Preset title." },
        consegna: { type: "string", description: "Pedagogical prompt and objectives." },
        algorithm: {
          type: "string",
          enum: ["fifo", "sjf", "stcf", "rr", "mlfq"],
          description: "Scheduling algorithm."
        },
        workload: { type: "array", description: "List of ProcessWorkload objects." },
        quantum: { type: "number", description: "Time quantum for Round Robin." },
        mlfqConfig: { type: "object", description: "MLFQ 5-rules configuration parameters." }
      },
      required: ["title", "consegna", "workload"]
    }
  },
  {
    name: "control_scheduler",
    description: "Step, play, pause, or reset the CPU scheduling simulation.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: ["step", "play", "pause", "reset"],
          description: "Scheduler action."
        },
        ticks: { type: "number", description: "Number of clock ticks to step." }
      },
      required: ["command"]
    }
  }
] as const;

export const CONCURRENCY_TOOL_SCHEMAS: readonly AiToolSchema[] = [
  {
    name: "inspect_concurrency",
    description: "Inspect thread states, shared memory, locks, condition variables, or RAG deadlock graph.",
    parameters: {
      type: "object",
      properties: {
        scenarioId: { type: "string", description: "Scenario ID to inspect." },
        includeGraph: { type: "boolean", description: "Include full RAG adjacency matrix." }
      }
    }
  },
  {
    name: "generate_concurrency_scenario",
    description: "Generate a concurrency synchronization scenario with threads and instructions.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Scenario title." },
        consegna: { type: "string", description: "Pedagogical prompt and objectives." },
        scenario: { type: "object", description: "ConcurrencyScenarioState object." }
      },
      required: ["title", "consegna", "scenario"]
    }
  },
  {
    name: "step_thread_instruction",
    description: "Execute next instruction for a specific thread in the interleaving simulator.",
    parameters: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Thread identifier." },
        instructionIndex: { type: "number", description: "Optional explicit instruction index." }
      },
      required: ["threadId"]
    }
  }
] as const;

export const aiTurnRequestBoundaryParser: BoundaryParser<AiTurnRequest> = {
  parse(raw: unknown) {
    if (typeof raw !== "object" || raw === null) {
      return { success: false, error: "AiTurnRequest must be a non-null object." };
    }
    const rec = raw as Record<string, unknown>;

    const mode = rec.mode;
    if (mode !== "memory-lab" && mode !== "cpu-lab" && mode !== "concurrency-lab") {
      return { success: false, error: "Invalid mode: expected memory-lab, cpu-lab, or concurrency-lab." };
    }

    const userMessage = rec.userMessage;
    if (typeof userMessage !== "string" || userMessage.trim().length === 0) {
      return { success: false, error: "userMessage must be a non-empty string." };
    }

    const conversationHistoryRaw = rec.conversationHistory;
    if (!Array.isArray(conversationHistoryRaw)) {
      return { success: false, error: "conversationHistory must be an array." };
    }

    const conversationHistory: ConversationTurn[] = [];
    for (let i = 0; i < conversationHistoryRaw.length; i++) {
      const turn = conversationHistoryRaw[i];
      if (typeof turn !== "object" || turn === null) {
        return { success: false, error: `conversationHistory[${i}] must be an object.` };
      }
      const turnRec = turn as Record<string, unknown>;
      if (turnRec.role !== "user" && turnRec.role !== "assistant") {
        return { success: false, error: `conversationHistory[${i}].role must be 'user' or 'assistant'.` };
      }
      if (typeof turnRec.text !== "string") {
        return { success: false, error: `conversationHistory[${i}].text must be a string.` };
      }
      conversationHistory.push({
        role: turnRec.role,
        text: turnRec.text
      });
    }

    let model: AiModelConfig | undefined;
    if (rec.model !== undefined && rec.model !== null) {
      if (typeof rec.model !== "object") {
        return { success: false, error: "model must be an object if provided." };
      }
      const mRec = rec.model as Record<string, unknown>;
      if (typeof mRec.provider !== "string" || typeof mRec.id !== "string") {
        return { success: false, error: "model.provider and model.id must be strings." };
      }
      model = {
        provider: mRec.provider,
        id: mRec.id,
        thinkingLevel: typeof mRec.thinkingLevel === "string" ? mRec.thinkingLevel : undefined
      };
    }

    return {
      success: true,
      data: {
        mode,
        userMessage,
        stateSnapshot: rec.stateSnapshot,
        conversationHistory,
        model
      }
    };
  }
};
