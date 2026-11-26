import type { PluginBackendContext } from "learnharness-plugin-api";
import { handleAiTurn, handleAiCatalog } from "./ai-service.js";

export function activate(ctx: PluginBackendContext): () => void {
  const unregisterMemory = ctx.registerMode({
    id: "memory-lab",
    name: "Memory Virtualization Lab",
    description: "Simulatore di Segmentazione (+/-), Paging lineare e a 2 livelli, TLB e Swapping.",
    category: "Operating Systems",
    icon: "Network",
    tags: ["memory", "paging", "segmentation", "tlb", "replacement-policies"],
    difficulty: "intermediate",
    activityType: "exploration",
    capabilities: ["simulation", "custom-exercises", "step-by-step"],
    initializeWorkspace({ workspace, storage }) {
      storage.set("memory-state", {
        workspaceId: workspace.id,
        subsystem: "segmentation",
        customConfig: null,
        history: [],
        exerciseHistory: [],
        lastUpdated: new Date().toISOString()
      });
    }
  });

  const unregisterCpu = ctx.registerMode({
    id: "cpu-lab",
    name: "CPU Scheduling & Hardware Lab",
    description: "Simulatore di Gantt (FIFO, SJF, STCF, RR, MLFQ a 5 regole) e meccanismo LDE.",
    category: "Operating Systems",
    icon: "Calculator",
    tags: ["cpu", "scheduling", "mlfq", "round-robin", "privilege-levels"],
    difficulty: "intermediate",
    activityType: "exploration",
    capabilities: ["gantt", "step-debugger", "metrics"],
    initializeWorkspace({ workspace, storage }) {
      storage.set("cpu-state", {
        workspaceId: workspace.id,
        algorithm: "rr",
        quantum: 2,
        workload: [],
        exerciseHistory: [],
        lastUpdated: new Date().toISOString()
      });
    }
  });

  const unregisterConcurrency = ctx.registerMode({
    id: "concurrency-lab",
    name: "Concurrency & Deadlock Lab",
    description: "Interleaving deterministico di thread, lock, semafori, condition variables e grafi RAG.",
    category: "Operating Systems",
    icon: "Brain",
    tags: ["concurrency", "threads", "semaphores", "deadlock", "bounded-buffer"],
    difficulty: "advanced",
    activityType: "practice",
    capabilities: ["thread-interleaving", "rag-graph", "deadlock-detection"],
    initializeWorkspace({ workspace, storage }) {
      storage.set("concurrency-state", {
        workspaceId: workspace.id,
        scenario: "bounded-buffer",
        threads: [],
        exerciseHistory: [],
        lastUpdated: new Date().toISOString()
      });
    }
  });

  const unregisterAiTurn =
    typeof ctx.handle === "function"
      ? ctx.handle("ai-turn", (input: unknown) => handleAiTurn(ctx, input))
      : () => {};

  const unregisterAiCatalog =
    typeof ctx.handle === "function"
      ? ctx.handle("ai-catalog", () => handleAiCatalog(ctx))
      : () => {};

  return () => {
    unregisterMemory();
    unregisterCpu();
    unregisterConcurrency();
    unregisterAiTurn();
    unregisterAiCatalog();
  };
}
