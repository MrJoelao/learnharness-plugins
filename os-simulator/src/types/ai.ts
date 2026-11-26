import type { ModelCatalogResponse } from "learnharness-plugin-api";
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

export interface AiCatalogResponse extends ModelCatalogResponse {
  defaultModel: AiModelConfig | null;
}

export interface AiTurnRequest {
  mode: LabMode;
  userMessage: string;
  stateSnapshot: unknown;
  conversationHistory: ConversationTurn[];
  model?: AiModelConfig;
  requestId?: string;
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
  | "multi-level"
  | "tlb"
  | "replacement";

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
          enum: ["segmentation", "linear-paging", "multi-level", "tlb", "replacement"],
          description: "Optional memory subsystem to inspect."
        }
      }
    }
  },
  {
    name: "generate_memory_preset",
    description: "Generate a memory lab exercise preset with segmentation, paging, TLB, or page replacement parameters.",
    parameters: {
      type: "object",
      properties: {
        subsystem: {
          type: "string",
          enum: ["segmentation", "linear-paging", "multi-level", "tlb", "replacement"],
          description: "Target memory subsystem."
        },
        title: { type: "string", description: "Exercise title." },
        consegna: { type: "string", description: "Pedagogical prompt and objectives." },
        config: {
          type: "object",
          description: "MemoryLabPreset configuration matching the target subsystem.",
          properties: {
            id: { type: "string", description: "Unique preset ID." },
            name: { type: "string", description: "Display name." },
            description: { type: "string", description: "Short description." },
            subsystem: {
              type: "string",
              enum: ["segmentation", "linear-paging", "multi-level", "tlb", "replacement"],
              description: "Target memory subsystem."
            },
            trace: {
              type: "array",
              description: "Array of non-negative integer virtual addresses (or page numbers for replacement).",
              items: { type: "number" }
            },
            segmentationConfig: {
              type: "object",
              description: "Required when subsystem is 'segmentation'.",
              properties: {
                addressSpaceBits: { type: "number" },
                segmentBits: { type: "number" },
                physicalMemorySize: { type: "number" },
                segments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "number" },
                      name: { type: "string" },
                      base: { type: "number" },
                      limit: { type: "number" },
                      growth: { type: "string", enum: ["positive", "negative"] }
                    },
                    required: ["id", "name", "base", "limit", "growth"]
                  }
                }
              },
              required: ["addressSpaceBits", "segmentBits", "physicalMemorySize", "segments"]
            },
            linearPagingConfig: {
              type: "object",
              description: "Required when subsystem is 'linear-paging'.",
              properties: {
                addressSpaceBits: { type: "number" },
                pageSize: { type: "number" },
                physicalMemorySize: { type: "number" },
                pageTable: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      vpn: { type: "number" },
                      valid: { type: "boolean" },
                      pfn: { type: "number" },
                      rawEntry: { type: "number" }
                    },
                    required: ["vpn", "valid", "pfn"]
                  }
                }
              },
              required: ["addressSpaceBits", "pageSize", "physicalMemorySize", "pageTable"]
            },
            multiLevelPagingConfig: {
              type: "object",
              description: "Required when subsystem is 'multi-level'.",
              properties: {
                addressSpaceBits: { type: "number" },
                pageSize: { type: "number" },
                pdeBits: { type: "number" },
                pteBits: { type: "number" },
                pageDirectory: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      pdIndex: { type: "number" },
                      valid: { type: "boolean" },
                      ptPfn: { type: "number" },
                      table: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            ptIndex: { type: "number" },
                            valid: { type: "boolean" },
                            pfn: { type: "number" }
                          },
                          required: ["ptIndex", "valid", "pfn"]
                        }
                      }
                    },
                    required: ["pdIndex", "valid", "ptPfn"]
                  }
                }
              },
              required: ["addressSpaceBits", "pageSize", "pdeBits", "pteBits", "pageDirectory"]
            },
            tlbConfig: {
              type: "object",
              description: "Required when subsystem is 'tlb'.",
              properties: {
                capacity: { type: "number" },
                asidSupport: { type: "boolean" },
                replacementPolicy: { type: "string", enum: ["lru", "fifo"] },
                entries: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      vpn: { type: "number" },
                      pfn: { type: "number" },
                      valid: { type: "boolean" },
                      asid: { type: "number" },
                      dirty: { type: "boolean" },
                      lastUsedCycle: { type: "number" },
                      insertedCycle: { type: "number" }
                    },
                    required: ["vpn", "pfn", "valid", "asid", "dirty", "lastUsedCycle"]
                  }
                }
              },
              required: ["capacity", "asidSupport", "replacementPolicy", "entries"]
            },
            replacementConfig: {
              type: "object",
              description: "Required when subsystem is 'replacement'.",
              properties: {
                frameCount: { type: "number" },
                policy: { type: "string", enum: ["fifo", "opt", "lru", "clock", "modified-clock"] },
                referenceString: {
                  type: "array",
                  items: { type: "number" }
                }
              },
              required: ["frameCount", "policy", "referenceString"]
            }
          },
          required: ["trace"]
        }
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
  },
  {
    name: "set_subsystem",
    description: "Switch the active Memory Lab subsystem tab.",
    parameters: {
      type: "object",
      properties: {
        subsystem: {
          type: "string",
          enum: ["segmentation", "linear-paging", "multi-level", "tlb", "replacement"],
          description: "Target memory subsystem."
        }
      },
      required: ["subsystem"]
    }
  },
  {
    name: "load_preset",
    description: "Load a built-in Memory Lab preset by ID.",
    parameters: {
      type: "object",
      properties: {
        presetId: {
          type: "string",
          enum: [
            "segmentation-unimi-seed-0",
            "paging-unimi-seed-0",
            "multilevel-sparse-space",
            "tlb-cached-translation",
            "belady-anomaly-reference"
          ],
          description: "Built-in Memory Lab preset ID."
        }
      },
      required: ["presetId"]
    }
  },
  {
    name: "set_va",
    description: "Set the current virtual address input in Memory Lab.",
    parameters: {
      type: "object",
      properties: {
        virtualAddress: { type: "number", description: "Non-negative integer virtual address." }
      },
      required: ["virtualAddress"]
    }
  },
  {
    name: "step_trace",
    description: "Advance the Memory Lab address/reference trace by one or more steps.",
    parameters: {
      type: "object",
      properties: {
        steps: { type: "number", description: "Optional number of steps to advance (default 1)." }
      }
    }
  },
  {
    name: "reset",
    description: "Reset the Memory Lab trace and simulation state.",
    parameters: {
      type: "object",
      properties: {}
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
          enum: ["fifo", "sjf", "stcf", "rr", "mlfq", "FIFO", "SJF", "STCF", "RR", "MLFQ", "LDE"],
          description: "Scheduling algorithm."
        },
        workload: {
          type: "array",
          description: "List of ProcessWorkload objects.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique process ID (e.g. 'P0', 'P1')." },
              arrivalTime: { type: "number", description: "Non-negative integer arrival tick." },
              priority: { type: "number", description: "Optional non-negative integer priority." },
              bursts: {
                type: "array",
                description: "Non-empty list of CPU and I/O bursts.",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["cpu", "io"] },
                    duration: { type: "number", description: "Positive integer tick duration > 0." }
                  },
                  required: ["type", "duration"]
                }
              }
            },
            required: ["id", "arrivalTime", "bursts"]
          }
        },
        quantum: { type: "number", description: "Positive integer time quantum for Round Robin." },
        mlfqConfig: {
          type: "object",
          description: "MLFQ 5-rules configuration parameters.",
          properties: {
            priorityBoostInterval: { type: "number", description: "Positive integer boost period S > 0." },
            queues: {
              type: "array",
              description: "Priority queues (0 is highest priority).",
              items: {
                type: "object",
                properties: {
                  priority: { type: "number", description: "Non-negative integer priority level." },
                  timeSlice: { type: "number", description: "Positive integer RR time slice > 0." },
                  allotment: { type: "number", description: "Positive integer cumulative allotment > 0." }
                },
                required: ["priority", "timeSlice", "allotment"]
              }
            }
          },
          required: ["priorityBoostInterval", "queues"]
        }
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
  },
  {
    name: "set_algorithm",
    description: "Switch the active CPU scheduling algorithm or LDE Hardware Inspector.",
    parameters: {
      type: "object",
      properties: {
        algorithm: {
          type: "string",
          enum: ["FIFO", "SJF", "STCF", "RR", "MLFQ", "LDE"],
          description: "Target CPU scheduling algorithm or LDE mode."
        }
      },
      required: ["algorithm"]
    }
  },
  {
    name: "load_preset",
    description: "Load a built-in CPU Lab workload preset by ID.",
    parameters: {
      type: "object",
      properties: {
        presetId: {
          type: "string",
          enum: [
            "fifo-vs-sjf-convoy",
            "stcf-preemption",
            "rr-quantum-demo",
            "mlfq-gaming-workload",
            "mlfq-priority-boost",
            "lde-hardware-transition"
          ],
          description: "Built-in CPU Lab preset ID."
        }
      },
      required: ["presetId"]
    }
  },
  {
    name: "set_quantum",
    description: "Set the Round Robin time quantum in CPU Lab.",
    parameters: {
      type: "object",
      properties: {
        quantum: { type: "number", description: "Positive integer time quantum > 0." }
      },
      required: ["quantum"]
    }
  },
  {
    name: "step_tick",
    description: "Advance the CPU Lab simulation by one or more clock ticks.",
    parameters: {
      type: "object",
      properties: {
        ticks: { type: "number", description: "Optional number of clock ticks to step (default 1)." }
      }
    }
  },
  {
    name: "reset",
    description: "Reset the CPU Lab simulation tick to 0.",
    parameters: {
      type: "object",
      properties: {}
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
        scenario: {
          type: "object",
          description: "ConcurrencyScenarioState object.",
          properties: {
            scenarioId: { type: "string", description: "Unique scenario identifier." },
            name: { type: "string", description: "Scenario display name." },
            description: { type: "string", description: "Scenario description." },
            threads: {
              type: "array",
              description: "Non-empty list of ThreadContext objects.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique thread ID (e.g. 'T1', 'P1')." },
                  programCounter: { type: "number", description: "Initial PC (default 0)." },
                  registers: { type: "object", description: "Initial register map." },
                  state: { type: "string", enum: ["ready", "running", "blocked", "terminated"] },
                  instructions: {
                    type: "array",
                    description: "List of ThreadInstruction objects.",
                    items: {
                      type: "object",
                      properties: {
                        op: {
                          type: "string",
                          enum: ["read", "write", "add", "sub", "lock", "unlock", "wait", "signal", "sem_wait", "sem_post"]
                        },
                        targetVariable: { type: "string" },
                        register: { type: "string" },
                        literal: { type: "number" },
                        syncObject: { type: "string" },
                        label: { type: "string" }
                      },
                      required: ["op"]
                    }
                  }
                },
                required: ["id", "instructions"]
              }
            },
            sharedMemory: { type: "object", description: "Initial shared memory variables (map of name to number)." },
            locks: { type: "object", description: "Mutex or ticket lock definitions keyed by lock ID." },
            semaphores: { type: "object", description: "Semaphore definitions keyed by semaphore ID." },
            conditionVariables: { type: "object", description: "Condition variable definitions keyed by CV ID." },
            boundedBuffer: {
              type: "object",
              description: "Optional bounded buffer state.",
              properties: {
                capacity: { type: "number" },
                items: { type: "array", items: { type: "number" } },
                inPtr: { type: "number" },
                outPtr: { type: "number" }
              },
              required: ["capacity"]
            }
          },
          required: ["scenarioId", "name", "description", "threads"]
        }
      },
      required: ["title", "consegna", "scenario"]
    }
  },
  {
    name: "load_preset",
    description: "Load a built-in Concurrency Lab scenario preset by ID.",
    parameters: {
      type: "object",
      properties: {
        presetId: {
          type: "string",
          enum: [
            "lost-update",
            "ticket-lock",
            "bounded-buffer-mesa",
            "bounded-buffer-1cv-bug",
            "semaphore-deadlock-order",
            "dining-philosophers-deadlock",
            "dining-philosophers-asymmetric"
          ],
          description: "Built-in Concurrency Lab preset ID."
        }
      },
      required: ["presetId"]
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
  },
  {
    name: "reset",
    description: "Reset the active Concurrency Lab scenario to its initial state.",
    parameters: {
      type: "object",
      properties: {}
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

    let requestId: string | undefined;
    if (rec.requestId !== undefined && rec.requestId !== null) {
      if (typeof rec.requestId !== "string" || rec.requestId.trim().length === 0) {
        return { success: false, error: "requestId must be a non-empty string if provided." };
      }
      requestId = rec.requestId.trim();
    }

    return {
      success: true,
      data: {
        mode,
        userMessage,
        stateSnapshot: rec.stateSnapshot,
        conversationHistory,
        model,
        ...(requestId !== undefined ? { requestId } : {})
      }
    };
  }
};
