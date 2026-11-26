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
import { ensureAbortSignal, openToolbarMenu, showErrorBanner } from "../toolbar-helpers.js";
import type { SavedExercise, AiTurnRequest, AiTurnResponse, ControlAction, AiCatalogResponse } from "../../types/ai.js";
import { createCopilotDrawer, type CopilotDrawerHandle, showUndoBanner } from "../ai/index.js";
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
  let activeModalCleanup: (() => void) | null = null;
  let timerId: ReturnType<typeof setInterval> | null = null;
  const { signal: viewSignal, cleanup: cleanupSignal } = ensureAbortSignal(signal);
  let previousStateForUndo: CpuLabState | null = null;
  let activeExercise: SavedExercise | null =
    state.activeExerciseId && state.exerciseHistory
      ? state.exerciseHistory.find((e) => e.id === state.activeExerciseId) ?? null
      : null;
  let activeUndoBannerCleanup: (() => void) | null = null;

  const rootEl = document.createElement("div");
  rootEl.className = "lh-root cpu-lab-root";
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
      const rawQuantum = typeof rec.rrQuantum === "number" ? rec.rrQuantum : rec.quantum;
      if (typeof rawQuantum === "number" && Number.isFinite(rawQuantum) && rawQuantum > 0) {
        partial.rrQuantum = Math.max(1, Math.round(rawQuantum));
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
      signal: viewSignal
    });
  }

  function stepByTicks(rawTicks: number) {
    if (state.algorithm === "LDE") {
      const nextLdeStep = Math.max(0, state.ldeStepIndex + rawTicks);
      stopTimer();
      update({ ldeStepIndex: nextLdeStep, isPlaying: false });
    } else {
      const simResult = simulateSchedule(state.algorithm, state.workload, {
        quantum: state.rrQuantum,
        mlfqConfig: state.mlfqConfig
      });
      const maxTick = Math.max(0, simResult.timeline.length - 1);
      const nextTick = Math.max(0, Math.min(maxTick, state.currentTick + rawTicks));
      stopTimer();
      update({ currentTick: nextTick, isPlaying: false });
    }
  }

  function executeControlAction(action: ControlAction) {
    const payload =
      action.payload && typeof action.payload === "object"
        ? (action.payload as Record<string, unknown>)
        : {};

    if (action.action === "set_algorithm" && typeof payload.algorithm === "string") {
      const algo = payload.algorithm.toUpperCase();
      if (["FIFO", "SJF", "STCF", "RR", "MLFQ", "LDE"].includes(algo)) {
        stopTimer();
        update({ algorithm: algo as CpuAlgorithm, currentTick: 0, isPlaying: false });
      }
    } else if (action.action === "load_preset" && typeof payload.presetId === "string") {
      const preset = CPU_PRESETS.find((p) => p.id === payload.presetId);
      if (preset) {
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
      }
    } else if (action.action === "set_quantum" && typeof payload.quantum === "number" && Number.isFinite(payload.quantum)) {
      const q = Math.max(1, Math.round(payload.quantum));
      stopTimer();
      update({ rrQuantum: q, currentTick: 0, isPlaying: false });
    } else if (action.action === "step_tick") {
      const rawTicks =
        typeof payload.ticks === "number" && Number.isFinite(payload.ticks)
          ? Math.trunc(payload.ticks)
          : 1;
      stepByTicks(rawTicks);
    } else if (action.action === "control_scheduler" && typeof payload.command === "string") {
      if (payload.command === "step") {
        const rawTicks =
          typeof payload.ticks === "number" && Number.isFinite(payload.ticks)
            ? Math.trunc(payload.ticks)
            : 1;
        stepByTicks(rawTicks);
      } else if (payload.command === "play") {
        if (state.algorithm === "LDE") {
          update({ isPlaying: true });
        } else {
          const simResult = simulateSchedule(state.algorithm, state.workload, {
            quantum: state.rrQuantum,
            mlfqConfig: state.mlfqConfig
          });
          const maxTick = Math.max(0, simResult.timeline.length - 1);
          if (state.currentTick >= maxTick) {
            update({ isPlaying: true, currentTick: 0 });
          } else {
            update({ isPlaying: true });
          }
        }
      } else if (payload.command === "pause") {
        stopTimer();
        update({ isPlaying: false });
      } else if (payload.command === "reset") {
        stopTimer();
        update({ currentTick: 0, isPlaying: false });
      }
    } else if (action.action === "reset") {
      stopTimer();
      update({ currentTick: 0, isPlaying: false });
    }
  }

  function render() {
    labContent.innerHTML = "";

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "lh-toolbar cpu-lab-toolbar";

    // Subsystems / Algorithms Tabs
    const tabsContainer = document.createElement("div");
    tabsContainer.className = "subsystem-tabs lh-no-drag";

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
    actionsContainer.className = "toolbar-actions lh-no-drag";

    // Esercizi Button (Discreet History Trigger)
    const exercisesBtn = document.createElement("button");
    exercisesBtn.className = "btn btn-outline btn-sm lh-no-drag";
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
      qGroup.className = "cpu-param-input-group lh-no-drag";
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
      sGroup.className = "cpu-param-input-group lh-no-drag";
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

    // Preset Menu Button
    const presetDropdown = document.createElement("div");
    presetDropdown.className = "preset-dropdown-container lh-no-drag";

    const presetBtn = document.createElement("button");
    presetBtn.type = "button";
    presetBtn.className = "btn btn-secondary btn-sm lh-no-drag";
    presetBtn.appendChild(createIcon("sliders", "size-4"));
    const presetBtnLabel = document.createElement("span");
    presetBtnLabel.textContent = "Preset";
    presetBtn.appendChild(presetBtnLabel);
    presetBtn.appendChild(createIcon("chevron-down", "size-3.5"));
    presetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openToolbarMenu({
        anchor: presetBtn,
        label: "Carica Preset",
        ui: ctx?.ui,
        signal: viewSignal,
        items: CPU_PRESETS.map((preset) => ({
          key: preset.id,
          label: preset.name,
          onSelect: () => {
            stopTimer();
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
          }
        }))
      });
    });
    presetDropdown.appendChild(presetBtn);
    actionsContainer.appendChild(presetDropdown);

    // Secondary Actions Menu Button ("Altro")
    const moreDropdown = document.createElement("div");
    moreDropdown.className = "preset-dropdown-container lh-no-drag";

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "btn btn-ghost btn-sm lh-no-drag";
    const moreBtnLabel = document.createElement("span");
    moreBtnLabel.textContent = "Altro";
    moreBtn.appendChild(moreBtnLabel);
    moreBtn.appendChild(createIcon("chevron-down", "size-3.5"));
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menuItems = [
        ...(state.algorithm !== "LDE"
          ? [
              {
                key: "edit-workload",
                label: "Modifica Workload",
                onSelect: () => {
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
                    viewSignal,
                    ctx?.ui
                  );
                }
              }
            ]
          : []),
        {
          key: "import-json",
          label: "Importa JSON",
          onSelect: () => {
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
                showErrorBanner(labContent, `Errore validazione preset CPU: ${parsedPreset.error}`, viewSignal);
              },
              (err) => showErrorBanner(labContent, err, viewSignal)
            );
          }
        },
        {
          key: "export-json",
          label: "Esporta JSON",
          onSelect: () => {
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
          }
        }
      ];

      openToolbarMenu({
        anchor: moreBtn,
        label: "Altre azioni",
        ui: ctx?.ui,
        signal: viewSignal,
        items: menuItems
      });
    });
    moreDropdown.appendChild(moreBtn);
    actionsContainer.appendChild(moreDropdown);

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
      throw new Error("Backend IPC (ctx.call) not available");
    },
    onNotification:
      typeof ctx?.onNotification === "function"
        ? (listener) => ctx.onNotification(listener)
        : undefined,
    loadCatalog:
      ctx && typeof ctx.call === "function"
        ? () => ctx.call<AiCatalogResponse>("ai-catalog")
        : undefined,
    signal: viewSignal,
    ui: ctx?.ui
  });

  render();

  return () => {
    stopTimer();
    cleanupSignal();
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
