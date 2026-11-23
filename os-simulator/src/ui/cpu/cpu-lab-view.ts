import type { PluginFrontendContext, PluginBackendContext } from "learnharness-plugin-api";
import type { CpuAlgorithm, CpuLabState, ProcessWorkload, MlfqConfig } from "../../core/cpu/types.js";
import { parseCpuPreset, parseWorkloadInput } from "../../core/cpu/types.js";
import { simulateSchedule } from "../../core/cpu/scheduler.js";
import {
  CPU_PRESETS,
  DEFAULT_MLFQ_CONFIG,
  FIFO_VS_SJF_CONVOY
} from "../../core/cpu/presets.js";
import { renderGanttChart } from "./gantt-chart.js";
import { renderMetricsPanel } from "./metrics-panel.js";
import { renderMlfqInspector } from "./mlfq-inspector.js";
import { renderLdeInspector } from "./lde-inspector.js";
import { openWorkloadEditorModal } from "./workload-editor-modal.js";
import { createIcon } from "../icons.js";
import { exportJsonFile, triggerJsonImport } from "../import-export.js";
import type { SavedExercise, AiTurnRequest, AiTurnResponse, ControlAction } from "../../types/ai.js";
import { createCopilotDrawer, type CopilotDrawerHandle, showUndoBanner } from "../ai/index.js";
import { handleAiTurn } from "../../backend/ai-service.js";
import { markExerciseAsModified } from "../../core/exercise-manager.js";

export function getInitialCpuLabState(workspaceId: string): CpuLabState {
  return {
    workspaceId,
    algorithm: "FIFO",
    workload: FIFO_VS_SJF_CONVOY.workload,
    rrQuantum: 2,
    mlfqConfig: DEFAULT_MLFQ_CONFIG,
    currentTick: 0,
    isPlaying: false,
    playbackSpeed: 1,
    activePresetId: FIFO_VS_SJF_CONVOY.id,
    ldeStepIndex: 0,
    exerciseHistory: [],
    activeExerciseId: null,
    lastUpdated: new Date().toISOString()
  };
}

export function createCpuLabView(
  container: HTMLElement,
  initialState: CpuLabState,
  saveState: (state: CpuLabState) => void,
  ctx?: PluginFrontendContext,
  signal?: AbortSignal
): () => void {
  let state: CpuLabState = {
    ...initialState,
    exerciseHistory: [...(initialState.exerciseHistory ?? [])]
  };
  let isPresetMenuOpen = false;
  let activeModalCleanup: (() => void) | null = null;
  let timerId: ReturnType<typeof setInterval> | null = null;
  const abortController = new AbortController();
  let previousStateForUndo: CpuLabState | null = null;
  let activeExercise: SavedExercise | null =
    state.activeExerciseId && state.exerciseHistory
      ? state.exerciseHistory.find((e) => e.id === state.activeExerciseId) ?? null
      : null;
  let activeUndoBannerCleanup: (() => void) | null = null;

  const rootEl = document.createElement("div");
  rootEl.className = "cpu-lab-root";
  container.appendChild(rootEl);

  const labContent = document.createElement("div");
  labContent.className = "cpu-lab-content";
  rootEl.appendChild(labContent);

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer(maxTicks: number) {
    stopTimer();
    const intervalMs = Math.max(100, Math.floor(600 / state.playbackSpeed));
    timerId = setInterval(() => {
      if (state.currentTick < maxTicks) {
        state = { ...state, currentTick: state.currentTick + 1 };
        saveState(state);
        render();
      } else {
        stopTimer();
        state = { ...state, isPlaying: false };
        saveState(state);
        render();
      }
    }, intervalMs);
  }

  function update(partial: Partial<CpuLabState>) {
    state = {
      ...state,
      ...partial,
      lastUpdated: new Date().toISOString()
    };
    saveState(state);
    render();
  }

  function markActiveExerciseManual() {
    if (activeExercise && activeExercise.sourceTag === "ai") {
      activeExercise = markExerciseAsModified(activeExercise);
      const nextHistory = (state.exerciseHistory ?? []).map((ex) =>
        ex.id === activeExercise?.id ? activeExercise! : ex
      );
      copilotHandle.setExercises?.(nextHistory);
      update({ exerciseHistory: nextHistory });
    }
  }

  function applyExercise(exercise: SavedExercise) {
    previousStateForUndo = JSON.parse(JSON.stringify(state)) as CpuLabState;
    activeExercise = exercise;
    stopTimer();

    const partial: Partial<CpuLabState> = {
      activeExerciseId: exercise.id,
      activePresetId: null,
      currentTick: 0,
      isPlaying: false,
      ldeStepIndex: 0
    };

    if (Array.isArray(exercise.config)) {
      partial.workload = exercise.config as ProcessWorkload[];
    } else if (typeof exercise.config === "object" && exercise.config !== null) {
      const rec = exercise.config as Record<string, unknown>;
      if (Array.isArray(rec.workload)) {
        partial.workload = rec.workload as ProcessWorkload[];
      }
      if (typeof rec.algorithm === "string") {
        const algoUpper = rec.algorithm.toUpperCase();
        if (["FIFO", "SJF", "STCF", "RR", "MLFQ", "LDE"].includes(algoUpper)) {
          partial.algorithm = algoUpper as CpuAlgorithm;
        }
      }
      if (typeof rec.rrQuantum === "number" && rec.rrQuantum > 0) {
        partial.rrQuantum = rec.rrQuantum;
      }
      if (rec.mlfqConfig && typeof rec.mlfqConfig === "object") {
        partial.mlfqConfig = rec.mlfqConfig as MlfqConfig;
      }
    }

    const currentHist = state.exerciseHistory ?? [];
    const existingIndex = currentHist.findIndex((e) => e.id === exercise.id);
    let newHistory: SavedExercise[];
    if (existingIndex >= 0) {
      newHistory = currentHist.map((e, idx) => (idx === existingIndex ? exercise : e));
    } else {
      newHistory = [exercise, ...currentHist];
    }
    partial.exerciseHistory = newHistory;

    update(partial);
    copilotHandle.setExercises?.(newHistory);

    if (activeUndoBannerCleanup) {
      activeUndoBannerCleanup();
    }
    activeUndoBannerCleanup = showUndoBanner({
      message: `Esercizio applicato: ${exercise.title}`,
      onUndo: () => {
        if (previousStateForUndo) {
          stopTimer();
          const restored = { ...previousStateForUndo };
          previousStateForUndo = null;
          state = restored;
          activeExercise =
            state.activeExerciseId && state.exerciseHistory
              ? state.exerciseHistory.find((e) => e.id === state.activeExerciseId) ?? null
              : null;
          saveState(state);
          copilotHandle.setExercises?.(state.exerciseHistory ?? []);
          render();
        }
      },
      targetContainer: rootEl,
      signal
    });
  }

  function executeControlAction(action: ControlAction) {
    if (action.action === "set_algorithm" && typeof (action.payload as Record<string, unknown>)?.algorithm === "string") {
      const algo = String((action.payload as { algorithm: string }).algorithm).toUpperCase();
      if (["FIFO", "SJF", "STCF", "RR", "MLFQ", "LDE"].includes(algo)) {
        stopTimer();
        update({ algorithm: algo as CpuAlgorithm, currentTick: 0, isPlaying: false });
      }
    } else if (action.action === "reset") {
      stopTimer();
      update({ currentTick: 0, isPlaying: false });
    }
  }

  function render() {
    labContent.innerHTML = "";

    // View Header
    const viewHeader = document.createElement("div");
    viewHeader.className = "view-header";
    const viewTitle = document.createElement("h2");
    viewTitle.className = "view-title font-title";
    viewTitle.textContent = "CPU Scheduling & Hardware Lab";
    viewHeader.appendChild(viewTitle);
    labContent.appendChild(viewHeader);

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "cpu-lab-toolbar";

    // Subsystems / Algorithms Tabs
    const tabsContainer = document.createElement("div");
    tabsContainer.className = "subsystem-tabs";

    const algorithms: Array<{ id: CpuAlgorithm; label: string; iconName: string }> = [
      { id: "FIFO", label: "FIFO", iconName: "layers" },
      { id: "SJF", label: "SJF", iconName: "clock" },
      { id: "STCF", label: "STCF", iconName: "clock" },
      { id: "RR", label: "Round Robin", iconName: "refresh-cw" },
      { id: "MLFQ", label: "MLFQ (5 Regole)", iconName: "sliders" },
      { id: "LDE", label: "LDE Hardware Inspector", iconName: "shield" }
    ];

    for (const algo of algorithms) {
      const btn = document.createElement("button");
      btn.className = `tab-button ${state.algorithm === algo.id ? "tab-active" : ""}`;
      btn.appendChild(createIcon(algo.iconName, "size-4"));
      const span = document.createElement("span");
      span.textContent = algo.label;
      btn.appendChild(span);
      btn.addEventListener("click", () => {
        stopTimer();
        update({
          algorithm: algo.id,
          currentTick: 0,
          isPlaying: false,
          activePresetId: null
        });
      });
      tabsContainer.appendChild(btn);
    }
    toolbar.appendChild(tabsContainer);

    // Toolbar Actions
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "toolbar-actions";

    // Esercizi Button (Discreet History Trigger)
    const exercisesBtn = document.createElement("button");
    exercisesBtn.className = "btn btn-outline btn-sm";
    exercisesBtn.title = "Cronologia Esercizi";
    const exSpan = document.createElement("span");
    exSpan.textContent = "Esercizi";
    exercisesBtn.append(createIcon("history", "size-4 text-muted-foreground"), exSpan);
    exercisesBtn.addEventListener("click", () => {
      copilotHandle.openHistoryModal();
    });
    actionsContainer.appendChild(exercisesBtn);

    // RR Quantum input
    if (state.algorithm === "RR") {
      const qGroup = document.createElement("div");
      qGroup.className = "cpu-param-input-group";
      const qLabel = document.createElement("span");
      qLabel.className = "control-label";
      qLabel.textContent = "Quantum:";
      const qInput = document.createElement("input");
      qInput.type = "number";
      qInput.className = "input-number font-mono tabular-nums";
      qInput.min = "1";
      qInput.max = "100";
      qInput.value = String(state.rrQuantum);
      qInput.addEventListener("change", () => {
        const val = parseInt(qInput.value, 10);
        if (val > 0) {
          markActiveExerciseManual();
          update({ rrQuantum: val, currentTick: 0 });
        }
      });
      qGroup.append(qLabel, qInput);
      actionsContainer.appendChild(qGroup);
    }

    // MLFQ Boost S interval input
    if (state.algorithm === "MLFQ") {
      const sGroup = document.createElement("div");
      sGroup.className = "cpu-param-input-group";
      const sLabel = document.createElement("span");
      sLabel.className = "control-label";
      sLabel.textContent = "Boost S:";
      const sInput = document.createElement("input");
      sInput.type = "number";
      sInput.className = "input-number font-mono tabular-nums";
      sInput.min = "5";
      sInput.max = "500";
      sInput.value = String(state.mlfqConfig.priorityBoostInterval);
      sInput.addEventListener("change", () => {
        const val = parseInt(sInput.value, 10);
        if (val > 0) {
          markActiveExerciseManual();
          update({
            mlfqConfig: {
              ...state.mlfqConfig,
              priorityBoostInterval: val
            },
            currentTick: 0
          });
        }
      });
      sGroup.append(sLabel, sInput);
      actionsContainer.appendChild(sGroup);
    }

    // Edit Workload Button
    if (state.algorithm !== "LDE") {
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-outline";
      editBtn.appendChild(createIcon("edit", "size-4"));
      const editLabel = document.createElement("span");
      editLabel.textContent = "Edit Workload";
      editBtn.appendChild(editLabel);
      editBtn.addEventListener("click", () => {
        if (activeModalCleanup) activeModalCleanup();
        activeModalCleanup = openWorkloadEditorModal(
          state.workload,
          (newWorkload) => {
            markActiveExerciseManual();
            stopTimer();
            update({ workload: newWorkload, currentTick: 0, isPlaying: false });
          },
          () => {
            activeModalCleanup = null;
          },
          rootEl,
          abortController.signal
        );
      });
      actionsContainer.appendChild(editBtn);
    }

    // Presets Dropdown
    const presetDropdown = document.createElement("div");
    presetDropdown.className = "preset-dropdown-container";

    const presetBtn = document.createElement("button");
    presetBtn.className = "btn btn-outline";
    presetBtn.appendChild(createIcon("sliders", "size-4"));
    const presetBtnLabel = document.createElement("span");
    presetBtnLabel.textContent = "Carica Preset";
    presetBtn.appendChild(presetBtnLabel);
    presetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isPresetMenuOpen = !isPresetMenuOpen;
      render();
    });
    presetDropdown.appendChild(presetBtn);

    if (isPresetMenuOpen) {
      const popover = document.createElement("div");
      popover.className = "preset-menu-popover";

      for (const preset of CPU_PRESETS) {
        const item = document.createElement("button");
        item.className = `preset-menu-item ${state.activePresetId === preset.id ? "active" : ""}`;
        item.addEventListener("click", () => {
          stopTimer();
          isPresetMenuOpen = false;
          update({
            algorithm: preset.algorithm,
            workload: preset.workload,
            rrQuantum: preset.rrQuantum ?? state.rrQuantum,
            mlfqConfig: preset.mlfqConfig ?? state.mlfqConfig,
            activePresetId: preset.id,
            currentTick: 0,
            isPlaying: false,
            ldeStepIndex: 0
          });
        });

        const nameSpan = document.createElement("span");
        nameSpan.className = "preset-name";
        nameSpan.textContent = preset.name;

        const descSpan = document.createElement("span");
        descSpan.className = "preset-desc";
        descSpan.textContent = preset.description;

        item.append(nameSpan, descSpan);
        popover.appendChild(item);
      }
      presetDropdown.appendChild(popover);
    }

    actionsContainer.appendChild(presetDropdown);

    // Import JSON Button
    const importBtn = document.createElement("button");
    importBtn.className = "btn btn-outline";
    importBtn.appendChild(createIcon("upload", "size-4"));
    const importLabel = document.createElement("span");
    importLabel.textContent = "Importa JSON";
    importBtn.appendChild(importLabel);
    importBtn.addEventListener("click", () => {
      triggerJsonImport(
        (data) => {
          const parsedPreset = parseCpuPreset(data);
          if (parsedPreset.success) {
            const p = parsedPreset.data;
            stopTimer();
            update({
              algorithm: p.algorithm,
              workload: p.workload,
              rrQuantum: p.rrQuantum ?? state.rrQuantum,
              mlfqConfig: p.mlfqConfig ?? state.mlfqConfig,
              activePresetId: p.id,
              currentTick: 0,
              isPlaying: false,
              ldeStepIndex: 0
            });
            return;
          }
          const parsedWorkload = parseWorkloadInput(data);
          if (parsedWorkload.success) {
            stopTimer();
            update({
              workload: parsedWorkload.data,
              currentTick: 0,
              isPlaying: false,
              activePresetId: null
            });
            return;
          }
          alert(`Errore validazione preset CPU: ${parsedPreset.error}`);
        },
        (err) => alert(err)
      );
    });
    actionsContainer.appendChild(importBtn);

    // Export JSON Button
    const exportBtn = document.createElement("button");
    exportBtn.className = "btn btn-outline";
    exportBtn.appendChild(createIcon("download", "size-4"));
    const exportLabel = document.createElement("span");
    exportLabel.textContent = "Esporta JSON";
    exportBtn.appendChild(exportLabel);
    exportBtn.addEventListener("click", () => {
      const exportData = {
        id: state.activePresetId ?? "custom-cpu-preset",
        name: `CPU Preset (${state.algorithm})`,
        description: "Configurazione esportata da CPU Scheduling Lab",
        algorithm: state.algorithm,
        workload: state.workload,
        rrQuantum: state.algorithm === "RR" ? state.rrQuantum : undefined,
        mlfqConfig: state.algorithm === "MLFQ" ? state.mlfqConfig : undefined
      };
      exportJsonFile(`cpu-preset-${state.algorithm.toLowerCase()}.json`, exportData);
    });
    actionsContainer.appendChild(exportBtn);

    toolbar.appendChild(actionsContainer);
    labContent.appendChild(toolbar);

    // Main Content
    if (state.algorithm === "LDE") {
      const ldeSection = document.createElement("div");
      renderLdeInspector(ldeSection, {
        stepIndex: state.ldeStepIndex,
        onStepChange: (nextIndex) => {
          update({ ldeStepIndex: nextIndex });
        }
      });
      labContent.appendChild(ldeSection);
    } else {
      const simResult = simulateSchedule(state.algorithm, state.workload, {
        quantum: state.rrQuantum,
        mlfqConfig: state.mlfqConfig
      });

      const maxTick = Math.max(0, simResult.timeline.length - 1);
      const safeTick = Math.min(state.currentTick, maxTick);

      // Manage playback timer
      if (state.isPlaying && timerId === null) {
        startTimer(maxTick);
      } else if (!state.isPlaying && timerId !== null) {
        stopTimer();
      }

      // Gantt Chart
      const ganttContainer = document.createElement("div");
      renderGanttChart(ganttContainer, {
        timeline: simResult.timeline,
        currentTick: safeTick,
        isPlaying: state.isPlaying,
        playbackSpeed: state.playbackSpeed,
        processIds: state.workload.map((p) => p.id),
        onTickChange: (tick) => {
          update({ currentTick: tick });
        },
        onPlayToggle: () => {
          const nextPlaying = !state.isPlaying;
          if (nextPlaying && safeTick >= maxTick) {
            update({ isPlaying: true, currentTick: 0 });
          } else {
            update({ isPlaying: nextPlaying });
          }
        },
        onReset: () => {
          stopTimer();
          update({ currentTick: 0, isPlaying: false });
        }
      });
      labContent.appendChild(ganttContainer);

      // MLFQ Inspector (if MLFQ)
      if (state.algorithm === "MLFQ") {
        const mlfqContainer = document.createElement("div");
        renderMlfqInspector(mlfqContainer, {
          mlfqConfig: state.mlfqConfig,
          currentStep: simResult.timeline[safeTick],
          currentTick: safeTick
        });
        labContent.appendChild(mlfqContainer);
      }

      // Metrics Panel
      const metricsContainer = document.createElement("div");
      renderMetricsPanel(metricsContainer, {
        metrics: simResult.metrics,
        averages: simResult.averages
      });
      labContent.appendChild(metricsContainer);
    }
  }

  // Mount Copilot Drawer
  const copilotHandle: CopilotDrawerHandle = createCopilotDrawer({
    mode: "cpu-lab",
    initialState: "pill",
    targetContainer: rootEl,
    initialExercises: state.exerciseHistory ?? [],
    autoApplyExercise: true,
    getSimulatorSnapshot: () => {
      const sim = simulateSchedule(state.algorithm, state.workload, {
        quantum: state.rrQuantum,
        mlfqConfig: state.mlfqConfig
      });
      return {
        algorithm: state.algorithm,
        workload: state.workload,
        rrQuantum: state.rrQuantum,
        mlfqConfig: state.mlfqConfig,
        currentTick: state.currentTick,
        currentStep: sim.timeline[Math.min(state.currentTick, sim.timeline.length - 1)] ?? null,
        metrics: sim.metrics,
        averages: sim.averages
      };
    },
    onApplyExercise: (exercise) => {
      applyExercise(exercise);
    },
    onExecuteControlAction: (action) => {
      executeControlAction(action);
    },
    onHistoryChange: (updatedHistory) => {
      update({ exerciseHistory: updatedHistory });
    },
    backendCall: async (request: AiTurnRequest): Promise<AiTurnResponse> => {
      if (ctx && typeof ctx.call === "function") {
        return ctx.call<AiTurnResponse>("ai-turn", request);
      }
      const dummyBackendCtx = {} as PluginBackendContext;
      return handleAiTurn(dummyBackendCtx, request);
    },
    loadSuggestions: ctx && typeof ctx.call === "function"
      ? (mode) => ctx.call("get-suggestions", { mode })
      : undefined,
    onSettingsChanged: ctx && typeof ctx.onNotification === "function"
      ? (listener) => ctx.onNotification((event) => {
          if (event.topic === "settings-changed") listener();
        })
      : undefined,
    signal
  });

  const documentClickHandler = () => {
    if (isPresetMenuOpen) {
      isPresetMenuOpen = false;
      render();
    }
  };
  document.addEventListener("click", documentClickHandler);

  render();

  return () => {
    stopTimer();
    document.removeEventListener("click", documentClickHandler);
    abortController.abort();
    if (activeModalCleanup) {
      activeModalCleanup();
      activeModalCleanup = null;
    }
    if (activeUndoBannerCleanup) {
      activeUndoBannerCleanup();
      activeUndoBannerCleanup = null;
    }
    copilotHandle.destroy();
    rootEl.querySelectorAll(".modal-overlay").forEach((el) => el.remove());
    rootEl.remove();
  };
}
