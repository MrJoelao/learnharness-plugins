import type { PluginFrontendContext, PluginWorkspaceRendererContext } from "learnharness-plugin-api";
import type { MemoryLabState } from "./core/memory/types.js";
import { createMemoryLabView, getInitialMemoryLabState } from "./ui/memory/memory-lab-view.js";
import type { CpuLabState } from "./core/cpu/types.js";
import { createCpuLabView, getInitialCpuLabState } from "./ui/cpu/cpu-lab-view.js";
import type { ConcurrencyLabState } from "./core/concurrency/types.js";
import { createConcurrencyLabView, getInitialConcurrencyLabState } from "./ui/concurrency/concurrency-lab-view.js";
import { exerciseListBoundaryParser } from "./core/exercise-manager.js";

function createMemoryLabRenderer(ctx: PluginFrontendContext) {
  return {
    async mount(container: HTMLElement, context: PluginWorkspaceRendererContext) {
      const defaultState = getInitialMemoryLabState(context.workspace.id);
      let initialState: MemoryLabState;
      try {
        const stored = await context.storage.get<MemoryLabState>("memory-state");
        if (stored && typeof stored === "object") {
          const parsedHistory = exerciseListBoundaryParser.parse(stored.exerciseHistory);
          initialState = {
            ...defaultState,
            ...stored,
            segmentationConfig: stored.segmentationConfig ?? defaultState.segmentationConfig,
            linearPagingConfig: stored.linearPagingConfig ?? defaultState.linearPagingConfig,
            multiLevelPagingConfig: stored.multiLevelPagingConfig ?? defaultState.multiLevelPagingConfig,
            tlbConfig: stored.tlbConfig ?? defaultState.tlbConfig,
            replacementConfig: stored.replacementConfig ?? defaultState.replacementConfig,
            exerciseHistory: parsedHistory.success ? parsedHistory.data : (defaultState.exerciseHistory ?? []),
            activeExerciseId: stored.activeExerciseId ?? defaultState.activeExerciseId
          };
        } else {
          initialState = defaultState;
        }
      } catch {
        initialState = defaultState;
      }

      const cleanup = createMemoryLabView(
        container,
        initialState,
        (nextState) => {
          context.storage.set("memory-state", nextState).catch((err) => {
            console.error("Failed to persist memory-state:", err);
          });
        },
        ctx,
        context.signal
      );

      const abortHandler = () => {
        cleanup();
      };
      context.signal.addEventListener("abort", abortHandler, { once: true });

      return () => {
        context.signal.removeEventListener("abort", abortHandler);
        cleanup();
      };
    }
  };
}

function createCpuLabRenderer(ctx: PluginFrontendContext) {
  return {
    async mount(container: HTMLElement, context: PluginWorkspaceRendererContext) {
      const defaultState = getInitialCpuLabState(context.workspace.id);
      let initialState: CpuLabState;
      try {
        const stored = await context.storage.get<CpuLabState>("cpu-state");
        if (stored && typeof stored === "object") {
          const parsedHistory = exerciseListBoundaryParser.parse(stored.exerciseHistory);
          initialState = {
            ...defaultState,
            ...stored,
            workload: Array.isArray(stored.workload) && stored.workload.length > 0 ? stored.workload : defaultState.workload,
            mlfqConfig: stored.mlfqConfig ?? defaultState.mlfqConfig,
            exerciseHistory: parsedHistory.success ? parsedHistory.data : (defaultState.exerciseHistory ?? []),
            activeExerciseId: stored.activeExerciseId ?? defaultState.activeExerciseId
          };
        } else {
          initialState = defaultState;
        }
      } catch {
        initialState = defaultState;
      }

      const cleanup = createCpuLabView(
        container,
        initialState,
        (nextState) => {
          context.storage.set("cpu-state", nextState).catch((err) => {
            console.error("Failed to persist cpu-state:", err);
          });
        },
        ctx,
        context.signal
      );

      const abortHandler = () => {
        cleanup();
      };
      context.signal.addEventListener("abort", abortHandler, { once: true });

      return () => {
        context.signal.removeEventListener("abort", abortHandler);
        cleanup();
      };
    }
  };
}

function createConcurrencyLabRenderer(ctx: PluginFrontendContext) {
  return {
    async mount(container: HTMLElement, context: PluginWorkspaceRendererContext) {
      const defaultState = getInitialConcurrencyLabState(context.workspace.id);
      let initialState: ConcurrencyLabState;
      try {
        const stored = await context.storage.get<ConcurrencyLabState>("concurrency-state");
        if (stored && typeof stored === "object" && stored.scenarioState) {
          const parsedHistory = exerciseListBoundaryParser.parse(stored.exerciseHistory);
          initialState = {
            ...defaultState,
            ...stored,
            exerciseHistory: parsedHistory.success ? parsedHistory.data : (defaultState.exerciseHistory ?? []),
            activeExerciseId: stored.activeExerciseId ?? defaultState.activeExerciseId
          };
        } else {
          initialState = defaultState;
        }
      } catch {
        initialState = defaultState;
      }

      const cleanup = createConcurrencyLabView(
        container,
        initialState,
        (nextState) => {
          context.storage.set("concurrency-state", nextState).catch((err) => {
            console.error("Failed to persist concurrency-state:", err);
          });
        },
        ctx,
        context.signal
      );

      const abortHandler = () => {
        cleanup();
      };
      context.signal.addEventListener("abort", abortHandler, { once: true });

      return () => {
        context.signal.removeEventListener("abort", abortHandler);
        cleanup();
      };
    }
  };
}

export function activate(ctx: PluginFrontendContext): () => void {
  const unregisterMemory = ctx.registerModeRenderer("os-simulator", "memory-lab", createMemoryLabRenderer(ctx));
  const unregisterCpu = ctx.registerModeRenderer("os-simulator", "cpu-lab", createCpuLabRenderer(ctx));
  const unregisterConcurrency = ctx.registerModeRenderer("os-simulator", "concurrency-lab", createConcurrencyLabRenderer(ctx));

  return () => {
    unregisterMemory();
    unregisterCpu();
    unregisterConcurrency();
  };
}
