import type { PluginFrontendContext, PluginBackendContext } from "learnharness-plugin-api";
import { canThreadStep, stepActive, stepThread } from "../../core/concurrency/interleaving.js";
import { buildRAG } from "../../core/concurrency/rag.js";
import {
  BOUNDED_BUFFER_1CV_BUG,
  BOUNDED_BUFFER_MESA,
  CONCURRENCY_PRESETS,
  DINING_PHILOSOPHERS_ASYMMETRIC,
  DINING_PHILOSOPHERS_DEADLOCK,
  LOST_UPDATE_DEMO,
  SEMAPHORE_DEADLOCK_ORDER,
  TICKET_LOCK_DEMO
} from "../../core/concurrency/presets.js";
import type { ConcurrencyLabState, ConcurrencyScenarioState } from "../../core/concurrency/types.js";
import { parseScenarioConfig, concurrencyScenarioBoundaryParser } from "../../core/concurrency/types.js";
import { createIcon } from "../icons.js";
import { exportJsonFile, triggerJsonImport } from "../import-export.js";
import { ensureAbortSignal, openToolbarMenu, showErrorBanner } from "../toolbar-helpers.js";
import { renderCircularBuffer } from "./circular-buffer.js";
import { openCustomScenarioModal } from "./custom-scenario-modal.js";
import { renderRagGraph } from "./rag-graph.js";
import { renderThreadInspector } from "./thread-inspector.js";
import type { SavedExercise, AiTurnRequest, AiTurnResponse, ControlAction, AiCatalogResponse } from "../../types/ai.js";
import { createCopilotDrawer, type CopilotDrawerHandle, showUndoBanner } from "../ai/index.js";
import { markExerciseAsModified } from "../../core/exercise-manager.js";

export function getInitialConcurrencyLabState(workspaceId: string): ConcurrencyLabState {
  const initialPreset = LOST_UPDATE_DEMO;
  return {
    workspaceId,
    activePresetId: initialPreset.scenarioId,
    scenarioState: initialPreset,
    history: [initialPreset],
    historyIndex: 0,
    isPlaying: false,
    playbackSpeed: 1,
    exerciseHistory: [],
    activeExerciseId: null,
    lastUpdated: new Date().toISOString()
  };
}

export function createConcurrencyLabView(
  container: HTMLElement,
  initialState: ConcurrencyLabState,
  saveState: (state: ConcurrencyLabState) => void,
  ctx?: PluginFrontendContext,
  signal?: AbortSignal
): () => void {
  let state: ConcurrencyLabState = {
    ...initialState,
    exerciseHistory: [...(initialState.exerciseHistory ?? [])]
  };
  let timerId: ReturnType<typeof setInterval> | null = null;
  let activeModalCleanup: (() => void) | null = null;
  const { signal: viewSignal, cleanup: cleanupViewSignal } = ensureAbortSignal(signal);
  let previousStateForUndo: ConcurrencyLabState | null = null;
  let activeExercise: SavedExercise | null =
    state.activeExerciseId && state.exerciseHistory
      ? state.exerciseHistory.find((e) => e.id === state.activeExerciseId) ?? null
      : null;
  let activeUndoBannerCleanup: (() => void) | null = null;

  const rootEl = document.createElement("div");
  rootEl.className = "lh-root concurrency-lab-root";
  container.appendChild(rootEl);

  const labContent = document.createElement("div");
  labContent.className = "concurrency-lab-content";
  rootEl.appendChild(labContent);

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    const intervalMs = Math.max(100, Math.floor(600 / state.playbackSpeed));
    timerId = setInterval(() => {
      const anyCanStep = state.scenarioState.threads.some((t) => canThreadStep(state.scenarioState, t.id));
      if (anyCanStep) {
        stepNextInstruction();
      } else {
        stopTimer();
        state = { ...state, isPlaying: false };
        saveState(state);
        render();
      }
    }, intervalMs);
  }

  function update(partial: Partial<ConcurrencyLabState>) {
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

  function applyScenario(
    scenario: ConcurrencyScenarioState,
    presetId?: string,
    exerciseId?: string | null,
    historyList?: SavedExercise[]
  ) {
    stopTimer();
    state = {
      ...state,
      activePresetId: presetId ?? scenario.scenarioId,
      scenarioState: scenario,
      history: [scenario],
      historyIndex: 0,
      isPlaying: false,
      activeExerciseId: exerciseId !== undefined ? exerciseId : state.activeExerciseId,
      exerciseHistory: historyList ?? state.exerciseHistory,
      lastUpdated: new Date().toISOString()
    };
    saveState(state);
    render();
  }

  function applyExercise(exercise: SavedExercise) {
    previousStateForUndo = JSON.parse(JSON.stringify(state)) as ConcurrencyLabState;
    activeExercise = exercise;
    stopTimer();

    let scenarioToApply: ConcurrencyScenarioState | null = null;
    if (typeof exercise.config === "object" && exercise.config !== null) {
      const candidate = (exercise.config as Record<string, unknown>).scenarioState ?? exercise.config;
      const parsed = concurrencyScenarioBoundaryParser.parse(candidate);
      if (parsed.success) {
        scenarioToApply = parsed.data;
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

    if (scenarioToApply) {
      applyScenario(scenarioToApply, scenarioToApply.scenarioId, exercise.id, newHistory);
    } else {
      update({ activeExerciseId: exercise.id, exerciseHistory: newHistory });
    }

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

  function executeControlAction(action: ControlAction) {
    const payload =
      action.payload && typeof action.payload === "object"
        ? (action.payload as Record<string, unknown>)
        : {};

    if (action.action === "load_preset" && typeof payload.presetId === "string") {
      const preset = CONCURRENCY_PRESETS.find((p) => p.scenarioId === payload.presetId);
      if (preset) {
        isPresetDropdownOpen = false;
        applyScenario(preset, preset.scenarioId);
      }
    } else if (action.action === "step_thread_instruction" && typeof payload.threadId === "string") {
      stepSpecificThread(payload.threadId);
    } else if (action.action === "reset") {
      resetCurrentScenario();
    }
  }

  function stepNextInstruction() {
    const nextScenario = stepActive(state.scenarioState);
    if (nextScenario !== state.scenarioState) {
      const newHistory = [...state.history.slice(0, state.historyIndex + 1), nextScenario];
      state = {
        ...state,
        scenarioState: nextScenario,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        lastUpdated: new Date().toISOString()
      };
      saveState(state);
      render();
    } else {
      if (state.isPlaying) {
        stopTimer();
        state = { ...state, isPlaying: false };
        saveState(state);
        render();
      }
    }
  }

  function stepSpecificThread(threadId: string) {
    const nextScenario = stepThread(state.scenarioState, threadId);
    if (nextScenario !== state.scenarioState) {
      const newHistory = [...state.history.slice(0, state.historyIndex + 1), nextScenario];
      state = {
        ...state,
        scenarioState: nextScenario,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        lastUpdated: new Date().toISOString()
      };
      saveState(state);
      render();
    }
  }

  function resetCurrentScenario() {
    stopTimer();
    const currentPreset = CONCURRENCY_PRESETS.find((p) => p.scenarioId === state.activePresetId);
    if (currentPreset) {
      applyScenario(currentPreset, currentPreset.scenarioId);
    } else {
      const first = state.history[0];
      if (first) {
        applyScenario(first, state.activePresetId);
      }
    }
  }

  function render() {
    labContent.innerHTML = "";

    const toolbar = document.createElement("div");
    toolbar.className = "lh-toolbar concurrency-toolbar";

    const leftToolbar = document.createElement("div");
    leftToolbar.className = "toolbar-group-left lh-no-drag";

    // Esercizi Button (Discreet History Trigger - must remain first .btn-outline)
    const exercisesBtn = document.createElement("button");
    exercisesBtn.className = "btn btn-outline btn-sm lh-no-drag";
    exercisesBtn.title = "Cronologia Esercizi";
    const exSpan = document.createElement("span");
    exSpan.textContent = "Esercizi";
    exercisesBtn.append(createIcon("history", "size-3.5"), exSpan);
    exercisesBtn.addEventListener("click", () => {
      copilotHandle.openHistoryModal();
    });
    leftToolbar.appendChild(exercisesBtn);

    const presetList = [
      { id: LOST_UPDATE_DEMO.scenarioId, title: "1. Lost Update (Race Condition)", preset: LOST_UPDATE_DEMO },
      { id: TICKET_LOCK_DEMO.scenarioId, title: "2. Ticket Lock (Hardware Sync)", preset: TICKET_LOCK_DEMO },
      { id: BOUNDED_BUFFER_MESA.scenarioId, title: "3. Bounded Buffer (Mesa 2 CV)", preset: BOUNDED_BUFFER_MESA },
      { id: BOUNDED_BUFFER_1CV_BUG.scenarioId, title: "4. Bounded Buffer (Baco 1 CV)", preset: BOUNDED_BUFFER_1CV_BUG },
      { id: SEMAPHORE_DEADLOCK_ORDER.scenarioId, title: "5. Semafori: Deadlock Mutex Order", preset: SEMAPHORE_DEADLOCK_ORDER },
      { id: DINING_PHILOSOPHERS_DEADLOCK.scenarioId, title: "6. 5 Filosofi a Cena (Deadlock)", preset: DINING_PHILOSOPHERS_DEADLOCK },
      { id: DINING_PHILOSOPHERS_ASYMMETRIC.scenarioId, title: "7. 5 Filosofi (Soluzione Asimmetrica)", preset: DINING_PHILOSOPHERS_ASYMMETRIC }
    ];

    const presetDropdown = document.createElement("div");
    presetDropdown.className = "preset-dropdown-container lh-no-drag";

    const presetBtn = document.createElement("button");
    presetBtn.className = "btn btn-secondary btn-sm lh-no-drag";
    const presetIcon = createIcon("layers", "size-4");
    const presetLabel = document.createElement("span");
    presetLabel.textContent = `Preset: ${state.scenarioState.name}`;
    const chevronIcon = createIcon("chevron-down", "size-3.5");
    presetBtn.append(presetIcon, presetLabel, chevronIcon);

    presetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openToolbarMenu({
        anchor: presetBtn,
        label: "Seleziona Preset Concorrenza",
        ui: ctx?.ui,
        signal: viewSignal,
        items: presetList.map((item) => ({
          key: item.id,
          label: item.title,
          onSelect: () => {
            applyScenario(item.preset, item.id);
          }
        }))
      });
    });
    presetDropdown.appendChild(presetBtn);
    leftToolbar.appendChild(presetDropdown);

    if (state.scenarioState.asymmetricThreads && state.scenarioState.asymmetricThreads.length > 0) {
      const toggleAsymBtn = document.createElement("button");
      toggleAsymBtn.className = "btn btn-secondary btn-sm lh-no-drag";
      const isAsym = state.scenarioState.name.includes("Asimmetrica");
      toggleAsymBtn.append(
        createIcon("refresh-cw", "size-3.5"),
        document.createTextNode(isAsym ? "Usa Versione Simmetrica (Deadlock)" : "Usa Versione Asimmetrica")
      );
      toggleAsymBtn.addEventListener("click", () => {
        markActiveExerciseManual();
        const currentThreads = state.scenarioState.threads;
        const targetThreads = state.scenarioState.asymmetricThreads!;
        const updatedLocks: Record<string, { id: string; heldBy: string | null; waitQueue: string[]; type: "mutex" }> = {};
        for (const k of Object.keys(state.scenarioState.locks)) {
          updatedLocks[k] = { id: k, heldBy: null, waitQueue: [], type: "mutex" };
        }
        const updatedScenario: ConcurrencyScenarioState = {
          ...state.scenarioState,
          name: isAsym ? "Dining Philosophers (Symmetric Deadlock)" : "Dining Philosophers (Soluzione Asimmetrica)",
          description: isAsym
            ? "5 filosofi simmetrici con 5 forchette (deadlock circolare)."
            : "5 filosofi con P4 asimmetrico che inverte le forchette (prevenzione deadlock).",
          threads: targetThreads.map((t) => ({ ...t, programCounter: 0, state: "ready", registers: { ...t.registers } })),
          asymmetricThreads: currentThreads,
          locks: updatedLocks,
          rag: {
            processes: targetThreads.map((t) => t.id),
            resources: Object.keys(updatedLocks),
            requests: [],
            allocations: [],
            detectedCycles: []
          },
          executionHistory: [`Scenario commutato a ${isAsym ? "simmetrico" : "asimmetrico"}.`],
          stepCount: 0
        };
        updatedScenario.rag = buildRAG(updatedScenario);
        applyScenario(updatedScenario, updatedScenario.scenarioId);
      });
      leftToolbar.appendChild(toggleAsymBtn);
    }

    const altroDropdown = document.createElement("div");
    altroDropdown.className = "preset-dropdown-container lh-no-drag";

    const altroBtn = document.createElement("button");
    altroBtn.className = "btn btn-ghost btn-sm lh-no-drag";
    altroBtn.append(
      createIcon("sliders", "size-3.5"),
      document.createTextNode("Altro"),
      createIcon("chevron-down", "size-3.5")
    );
    altroBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openToolbarMenu({
        anchor: altroBtn,
        label: "Altre azioni",
        ui: ctx?.ui,
        signal: viewSignal,
        items: [
          {
            key: "custom-scenario",
            label: "Custom Scenario",
            onSelect: () => {
              if (activeModalCleanup) activeModalCleanup();
              activeModalCleanup = openCustomScenarioModal(
                state.scenarioState,
                (newScenario) => {
                  markActiveExerciseManual();
                  applyScenario(newScenario, "custom");
                },
                container,
                viewSignal,
                ctx?.ui
              );
            }
          },
          {
            key: "import-json",
            label: "Importa JSON",
            onSelect: () => {
              triggerJsonImport(
                (data) => {
                  const parsed = parseScenarioConfig(data);
                  if (parsed.success) {
                    applyScenario(parsed.data, parsed.data.scenarioId);
                  } else {
                    showErrorBanner(labContent, `Errore validazione scenario concorrenza: ${parsed.error}`, viewSignal);
                  }
                },
                (err) => showErrorBanner(labContent, err, viewSignal)
              );
            }
          },
          {
            key: "export-json",
            label: "Esporta JSON",
            onSelect: () => {
              exportJsonFile(`concurrency-scenario-${state.scenarioState.scenarioId}.json`, state.scenarioState);
            }
          }
        ]
      });
    });
    altroDropdown.appendChild(altroBtn);
    leftToolbar.appendChild(altroDropdown);

    toolbar.appendChild(leftToolbar);

    const rightToolbar = document.createElement("div");
    rightToolbar.className = "toolbar-group-right lh-no-drag";

    const runStepBtn = document.createElement("button");
    runStepBtn.className = "btn btn-primary btn-sm font-mono tabular-nums lh-no-drag";
    runStepBtn.append(createIcon("skip-forward", "size-3.5"), document.createTextNode("Run Step"));
    const anyCanStep = state.scenarioState.threads.some((t) => canThreadStep(state.scenarioState, t.id));
    runStepBtn.disabled = !anyCanStep;
    runStepBtn.addEventListener("click", () => {
      stepNextInstruction();
    });
    rightToolbar.appendChild(runStepBtn);

    const playBtn = document.createElement("button");
    playBtn.className = `btn btn-sm ${state.isPlaying ? "btn-primary" : "btn-secondary"} lh-no-drag`;
    playBtn.append(
      createIcon(state.isPlaying ? "pause" : "play", "size-3.5"),
      document.createTextNode(state.isPlaying ? "Pausa" : "Auto Play")
    );
    playBtn.addEventListener("click", () => {
      if (state.isPlaying) {
        stopTimer();
        state = { ...state, isPlaying: false };
        saveState(state);
        render();
      } else {
        state = { ...state, isPlaying: true };
        saveState(state);
        render();
        startTimer();
      }
    });
    rightToolbar.appendChild(playBtn);

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn btn-secondary btn-sm lh-no-drag";
    resetBtn.title = "Ripristina Scenario";
    resetBtn.append(createIcon("rotate-ccw", "size-3.5"), document.createTextNode("Reset"));
    resetBtn.addEventListener("click", () => {
      resetCurrentScenario();
    });
    rightToolbar.appendChild(resetBtn);

    toolbar.appendChild(rightToolbar);
    labContent.appendChild(toolbar);

    const banner = document.createElement("div");
    banner.className = "scenario-info-banner";
    banner.innerHTML = `
      <div class="scenario-banner-title font-title font-mono">${state.scenarioState.name}</div>
      <div class="scenario-banner-desc">${state.scenarioState.description}</div>
    `;
    labContent.appendChild(banner);

    const mainLayout = document.createElement("div");
    mainLayout.className = "concurrency-main-grid";

    const leftCol = document.createElement("div");
    leftCol.className = "concurrency-left-col";
    renderThreadInspector(leftCol, state.scenarioState, (tId) => {
      stepSpecificThread(tId);
    });
    mainLayout.appendChild(leftCol);

    const rightCol = document.createElement("div");
    rightCol.className = "concurrency-right-col";

    if (state.scenarioState.boundedBuffer) {
      const bufferContainer = document.createElement("div");
      bufferContainer.className = "visualizer-box";
      renderCircularBuffer(
        bufferContainer,
        state.scenarioState.boundedBuffer,
        state.scenarioState.locks,
        state.scenarioState.conditionVariables
      );
      rightCol.appendChild(bufferContainer);
    }

    const ragContainer = document.createElement("div");
    ragContainer.className = "visualizer-box";
    renderRagGraph(ragContainer, state.scenarioState);
    rightCol.appendChild(ragContainer);

    mainLayout.appendChild(rightCol);
    labContent.appendChild(mainLayout);

    const historySection = document.createElement("div");
    historySection.className = "history-section-card";
    const historyHeader = document.createElement("div");
    historyHeader.className = "section-header";
    const histTitle = document.createElement("h4");
    histTitle.className = "section-title font-title";
    histTitle.textContent = "Log di Esecuzione Interleaved";
    historyHeader.appendChild(histTitle);
    historySection.appendChild(historyHeader);

    const historyList = document.createElement("div");
    historyList.className = "execution-history-list font-mono tabular-nums";
    state.scenarioState.executionHistory.forEach((log) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.textContent = log;
      historyList.appendChild(item);
    });
    historySection.appendChild(historyList);
    labContent.appendChild(historySection);
  }

  // Mount Copilot Drawer
  const copilotHandle: CopilotDrawerHandle = createCopilotDrawer({
    mode: "concurrency-lab",
    initialState: "pill",
    targetContainer: rootEl,
    initialExercises: state.exerciseHistory ?? [],
    autoApplyExercise: true,
    getSimulatorSnapshot: () => ({
      activePresetId: state.activePresetId,
      scenarioName: state.scenarioState.name,
      threads: state.scenarioState.threads.map((t) => ({
        id: t.id,
        programCounter: t.programCounter,
        state: t.state,
        registers: t.registers
      })),
      locks: state.scenarioState.locks,
      semaphores: state.scenarioState.semaphores,
      conditionVariables: state.scenarioState.conditionVariables,
      rag: state.scenarioState.rag
    }),
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
    cleanupViewSignal();
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
