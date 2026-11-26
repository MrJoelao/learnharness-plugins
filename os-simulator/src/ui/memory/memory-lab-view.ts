import type { PluginFrontendContext, PluginBackendContext } from "learnharness-plugin-api";
import type {
  MemoryLabState,
  MemoryLabSubsystem,
  TranslationResult,
  SegmentationSystemConfig,
  LinearPagingConfig,
  MultiLevelPagingConfig,
  TlbConfig,
  PageReplacementConfig
} from "../../core/memory/types.js";
import { parseAddressInput, parseMemoryPreset } from "../../core/memory/types.js";
import { translateSegmentation } from "../../core/memory/segmentation.js";
import { translateLinearPaging, translateMultiLevelPaging } from "../../core/memory/paging.js";
import { translateWithTlb } from "../../core/memory/tlb.js";
import {
  MEMORY_PRESETS,
  SEGMENTATION_UNIMI_SEED_0,
  PAGING_UNIMI_SEED_0,
  MULTILEVEL_SPARSE_SPACE,
  TLB_CACHED_TRANSLATION,
  BELADY_ANOMALY_PRESET
} from "../../core/memory/presets.js";
import { renderBitVisualizer, type BitComponentSpec } from "./bit-visualizer.js";
import { renderStepPanel } from "./step-panel.js";
import { renderMemoryMap } from "./memory-map.js";
import { renderReplacementView } from "./replacement-view.js";
import { openCustomInputModal } from "./custom-input-modal.js";
import { createIcon } from "../icons.js";
import { exportJsonFile, triggerJsonImport } from "../import-export.js";
import { ensureAbortSignal, openToolbarMenu, showErrorBanner } from "../toolbar-helpers.js";
import type { SavedExercise, AiTurnRequest, AiTurnResponse, ControlAction, AiCatalogResponse } from "../../types/ai.js";
import { createCopilotDrawer, type CopilotDrawerHandle, showUndoBanner } from "../ai/index.js";
import { markExerciseAsModified } from "../../core/exercise-manager.js";

export function getInitialMemoryLabState(workspaceId: string): MemoryLabState {
  return {
    workspaceId,
    subsystem: "segmentation",
    currentVa: 523,
    vaInputString: "523",
    segmentationConfig: SEGMENTATION_UNIMI_SEED_0.segmentationConfig!,
    linearPagingConfig: PAGING_UNIMI_SEED_0.linearPagingConfig!,
    multiLevelPagingConfig: MULTILEVEL_SPARSE_SPACE.multiLevelPagingConfig!,
    tlbConfig: TLB_CACHED_TRANSLATION.tlbConfig!,
    replacementConfig: BELADY_ANOMALY_PRESET.replacementConfig!,
    trace: SEGMENTATION_UNIMI_SEED_0.trace,
    currentTraceIndex: 0,
    activePresetId: SEGMENTATION_UNIMI_SEED_0.id,
    exerciseHistory: [],
    activeExerciseId: null,
    lastUpdated: new Date().toISOString()
  };
}

export function createMemoryLabView(
  container: HTMLElement,
  initialState: MemoryLabState,
  saveState: (state: MemoryLabState) => void,
  ctx?: PluginFrontendContext,
  signal?: AbortSignal
): () => void {
  let state: MemoryLabState = {
    ...initialState,
    exerciseHistory: [...(initialState.exerciseHistory ?? [])]
  };
  const { signal: viewSignal, cleanup: cleanupSignal } = ensureAbortSignal(signal);
  let activeModalCleanup: (() => void) | null = null;
  let previousStateForUndo: MemoryLabState | null = null;
  let activeExercise: SavedExercise | null =
    state.activeExerciseId && state.exerciseHistory
      ? state.exerciseHistory.find((e) => e.id === state.activeExerciseId) ?? null
      : null;
  let activeUndoBannerCleanup: (() => void) | null = null;

  const rootEl = document.createElement("div");
  rootEl.className = "lh-root memory-lab-root";
  container.appendChild(rootEl);

  const labContent = document.createElement("div");
  labContent.className = "memory-lab-content";
  rootEl.appendChild(labContent);

  function update(partial: Partial<MemoryLabState>) {
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

  function handleSubsystemChange(subsystem: MemoryLabSubsystem) {
    if (subsystem === state.subsystem) return;

    let trace = state.trace;
    let currentVa = state.currentVa;
    let presetId: string | null = null;

    if (subsystem === "segmentation") {
      trace = SEGMENTATION_UNIMI_SEED_0.trace;
      currentVa = trace[0] ?? 523;
      presetId = SEGMENTATION_UNIMI_SEED_0.id;
    } else if (subsystem === "linear-paging") {
      trace = PAGING_UNIMI_SEED_0.trace;
      currentVa = trace[0] ?? 12841;
      presetId = PAGING_UNIMI_SEED_0.id;
    } else if (subsystem === "multi-level") {
      trace = MULTILEVEL_SPARSE_SPACE.trace;
      currentVa = trace[0] ?? 0;
      presetId = MULTILEVEL_SPARSE_SPACE.id;
    } else if (subsystem === "tlb") {
      trace = TLB_CACHED_TRANSLATION.trace;
      currentVa = trace[0] ?? 4096;
      presetId = TLB_CACHED_TRANSLATION.id;
    } else if (subsystem === "replacement") {
      trace = BELADY_ANOMALY_PRESET.trace;
      currentVa = trace[0] ?? 1;
      presetId = BELADY_ANOMALY_PRESET.id;
    }

    update({
      subsystem,
      trace,
      currentTraceIndex: 0,
      currentVa,
      vaInputString: String(currentVa),
      activePresetId: presetId
    });
  }

  function loadPreset(presetId: string) {
    const preset = MEMORY_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    const updates: Partial<MemoryLabState> = {
      subsystem: preset.subsystem,
      trace: preset.trace,
      currentTraceIndex: 0,
      currentVa: preset.trace[0] ?? 0,
      vaInputString: String(preset.trace[0] ?? 0),
      activePresetId: preset.id
    };

    if (preset.segmentationConfig) updates.segmentationConfig = preset.segmentationConfig;
    if (preset.linearPagingConfig) updates.linearPagingConfig = preset.linearPagingConfig;
    if (preset.multiLevelPagingConfig) updates.multiLevelPagingConfig = preset.multiLevelPagingConfig;
    if (preset.tlbConfig) updates.tlbConfig = preset.tlbConfig;
    if (preset.replacementConfig) updates.replacementConfig = preset.replacementConfig;

    update(updates);
  }

  function applyExercise(exercise: SavedExercise) {
    previousStateForUndo = JSON.parse(JSON.stringify(state)) as MemoryLabState;
    activeExercise = exercise;

    const partial: Partial<MemoryLabState> = {
      activeExerciseId: exercise.id,
      activePresetId: null
    };

    if (typeof exercise.config === "object" && exercise.config !== null) {
      const cfg = exercise.config as Record<string, unknown>;
      if (typeof cfg.subsystem === "string" && ["segmentation", "linear-paging", "multi-level", "tlb", "replacement"].includes(cfg.subsystem)) {
        partial.subsystem = cfg.subsystem as MemoryLabSubsystem;
      }
      if (cfg.segmentationConfig && typeof cfg.segmentationConfig === "object") {
        partial.segmentationConfig = cfg.segmentationConfig as SegmentationSystemConfig;
      }
      if (cfg.linearPagingConfig && typeof cfg.linearPagingConfig === "object") {
        partial.linearPagingConfig = cfg.linearPagingConfig as LinearPagingConfig;
      }
      if (cfg.multiLevelPagingConfig && typeof cfg.multiLevelPagingConfig === "object") {
        partial.multiLevelPagingConfig = cfg.multiLevelPagingConfig as MultiLevelPagingConfig;
      }
      if (cfg.tlbConfig && typeof cfg.tlbConfig === "object") {
        partial.tlbConfig = cfg.tlbConfig as TlbConfig;
      }
      if (cfg.replacementConfig && typeof cfg.replacementConfig === "object") {
        partial.replacementConfig = cfg.replacementConfig as PageReplacementConfig;
      }
      if (Array.isArray(cfg.trace) && cfg.trace.length > 0) {
        partial.trace = cfg.trace as number[];
        partial.currentTraceIndex = 0;
        partial.currentVa = cfg.trace[0] as number;
        partial.vaInputString = String(cfg.trace[0]);
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

    if (action.action === "set_subsystem" && typeof payload.subsystem === "string") {
      const normalized =
        payload.subsystem === "two-level-paging"
          ? "multi-level"
          : payload.subsystem === "swapping"
          ? "replacement"
          : payload.subsystem;
      if (["segmentation", "linear-paging", "multi-level", "tlb", "replacement"].includes(normalized)) {
        handleSubsystemChange(normalized as MemoryLabSubsystem);
      }
    } else if (action.action === "load_preset" && typeof payload.presetId === "string") {
      loadPreset(payload.presetId);
    } else if (action.action === "set_va") {
      const rawVa = payload.va !== undefined ? payload.va : payload.virtualAddress;
      if (typeof rawVa === "number" && Number.isFinite(rawVa) && rawVa >= 0) {
        const va = Math.floor(rawVa);
        update({ currentVa: va, vaInputString: String(va) });
      } else if (typeof rawVa === "string") {
        const parsed = parseAddressInput(rawVa);
        if (parsed.success && parsed.data !== undefined) {
          update({ currentVa: parsed.data, vaInputString: String(parsed.data) });
        }
      }
    } else if (action.action === "step_trace") {
      const traceLen =
        state.subsystem === "replacement"
          ? state.replacementConfig.referenceString.length
          : state.trace.length;
      const maxIdx = Math.max(0, traceLen - 1);
      const rawSteps =
        typeof payload.steps === "number" && Number.isFinite(payload.steps)
          ? Math.trunc(payload.steps)
          : 1;
      const nextIdx = Math.max(0, Math.min(maxIdx, state.currentTraceIndex + rawSteps));
      if (state.subsystem === "replacement") {
        update({ currentTraceIndex: nextIdx });
      } else {
        const nextVa = state.trace[nextIdx] ?? state.currentVa;
        update({ currentTraceIndex: nextIdx, currentVa: nextVa, vaInputString: String(nextVa) });
      }
    } else if (action.action === "execute_translation") {
      const rawVa = payload.virtualAddress !== undefined ? payload.virtualAddress : payload.va;
      let va: number | undefined;
      if (typeof rawVa === "number" && Number.isInteger(rawVa) && rawVa >= 0) {
        va = rawVa;
      } else if (typeof rawVa === "string") {
        const parsed = parseAddressInput(rawVa);
        if (parsed.success && parsed.data !== undefined) {
          va = parsed.data;
        }
      }
      if (va !== undefined) {
        const updates: Partial<MemoryLabState> = { currentVa: va, vaInputString: String(va) };
        if (typeof payload.asid === "number" && Number.isInteger(payload.asid) && payload.asid >= 0) {
          updates.tlbConfig = {
            ...state.tlbConfig,
            ...({ asid: payload.asid } as Partial<TlbConfig>)
          };
        }
        update(updates);
      }
    } else if (action.action === "reset") {
      if (state.subsystem === "replacement") {
        update({ currentTraceIndex: 0 });
      } else {
        const firstVa = state.trace[0] ?? state.currentVa;
        update({ currentTraceIndex: 0, currentVa: firstVa, vaInputString: String(firstVa) });
      }
    }
  }

  function computeTranslation(): { result: TranslationResult; bitComponents: BitComponentSpec[]; totalBits: number } {
    const va = state.currentVa;

    switch (state.subsystem) {
      case "segmentation": {
        const cfg = state.segmentationConfig;
        const res = translateSegmentation(va, cfg);
        const offsetBits = cfg.addressSpaceBits - cfg.segmentBits;
        const segId = res.extractedComponents.segmentId ?? (va >> offsetBits);
        const rawOffset = res.extractedComponents.rawOffset ?? (va & ((1 << offsetBits) - 1));

        return {
          result: res,
          totalBits: cfg.addressSpaceBits,
          bitComponents: [
            { name: "Segment ID", bitCount: cfg.segmentBits, value: segId, type: "primary" },
            { name: "Offset", bitCount: offsetBits, value: rawOffset, type: "secondary" }
          ]
        };
      }

      case "linear-paging": {
        const cfg = state.linearPagingConfig;
        const res = translateLinearPaging(va, cfg);
        const offsetBits = Math.round(Math.log2(cfg.pageSize));
        const vpnBits = cfg.addressSpaceBits - offsetBits;
        const vpn = res.extractedComponents.vpn ?? Math.floor(va / cfg.pageSize);
        const offset = res.extractedComponents.offset ?? (va % cfg.pageSize);

        return {
          result: res,
          totalBits: cfg.addressSpaceBits,
          bitComponents: [
            { name: "VPN", bitCount: vpnBits, value: vpn, type: "primary" },
            { name: "Offset", bitCount: offsetBits, value: offset, type: "secondary" }
          ]
        };
      }

      case "multi-level": {
        const cfg = state.multiLevelPagingConfig;
        const res = translateMultiLevelPaging(va, cfg);
        const offsetBits = Math.round(Math.log2(cfg.pageSize));
        const pdIndex = res.extractedComponents.pdIndex ?? 0;
        const ptIndex = res.extractedComponents.ptIndex ?? 0;
        const offset = res.extractedComponents.offset ?? 0;

        return {
          result: res,
          totalBits: cfg.addressSpaceBits,
          bitComponents: [
            { name: "PD Index", bitCount: cfg.pdeBits, value: pdIndex, type: "primary" },
            { name: "PT Index", bitCount: cfg.pteBits, value: ptIndex, type: "accent" },
            { name: "Offset", bitCount: offsetBits, value: offset, type: "secondary" }
          ]
        };
      }

      case "tlb": {
        const pagingCfg = state.linearPagingConfig;
        const tlbCfg = state.tlbConfig;
        const activeAsid = (tlbCfg as TlbConfig & { asid?: number }).asid ?? 1;
        const res = translateWithTlb(va, activeAsid, tlbCfg, pagingCfg, state.currentTraceIndex + 1);
        const offsetBits = Math.round(Math.log2(pagingCfg.pageSize));
        const vpnBits = pagingCfg.addressSpaceBits - offsetBits;
        const vpn = res.extractedComponents.vpn ?? Math.floor(va / pagingCfg.pageSize);
        const offset = res.extractedComponents.offset ?? (va % pagingCfg.pageSize);

        return {
          result: res,
          totalBits: pagingCfg.addressSpaceBits,
          bitComponents: [
            { name: "VPN", bitCount: vpnBits, value: vpn, type: "primary" },
            { name: "Offset", bitCount: offsetBits, value: offset, type: "secondary" }
          ]
        };
      }

      default: {
        return {
          result: {
            va,
            pa: null,
            status: "valid",
            extractedComponents: {},
            stepExplanations: []
          },
          totalBits: 14,
          bitComponents: []
        };
      }
    }
  }

  function render() {
    labContent.innerHTML = "";

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "lh-toolbar memory-lab-toolbar";

    // Subsystem Tabs
    const tabs = document.createElement("div");
    tabs.className = "subsystem-tabs lh-no-drag";

    const subsystems: Array<{ id: MemoryLabSubsystem; label: string; iconName: string }> = [
      { id: "segmentation", label: "Segmentazione", iconName: "layers" },
      { id: "linear-paging", label: "Paging Lineare", iconName: "grid" },
      { id: "multi-level", label: "Paging 2-Livelli", iconName: "database" },
      { id: "tlb", label: "TLB & Cache", iconName: "cpu" },
      { id: "replacement", label: "Rimpiazzo Pagine", iconName: "clock" }
    ];

    for (const sub of subsystems) {
      const btn = document.createElement("button");
      btn.className = `tab-button lh-no-drag ${state.subsystem === sub.id ? "tab-active" : ""}`;
      btn.appendChild(createIcon(sub.iconName, "size-4"));
      const label = document.createElement("span");
      label.textContent = sub.label;
      btn.appendChild(label);
      btn.addEventListener("click", () => handleSubsystemChange(sub.id));
      tabs.appendChild(btn);
    }
    toolbar.appendChild(tabs);

    // Right Actions: Exercises, Presets, and More Menu
    const actions = document.createElement("div");
    actions.className = "toolbar-actions lh-no-drag";

    // Esercizi Button (Discreet History Trigger - must remain FIRST .btn-outline in .memory-lab-toolbar)
    const exercisesBtn = document.createElement("button");
    exercisesBtn.className = "btn btn-outline btn-sm lh-no-drag";
    exercisesBtn.title = "Cronologia Esercizi";
    const exSpan = document.createElement("span");
    exSpan.textContent = "Esercizi";
    exercisesBtn.append(createIcon("history", "size-4 text-muted-foreground"), exSpan);
    exercisesBtn.addEventListener("click", () => {
      copilotHandle.openHistoryModal();
    });
    actions.appendChild(exercisesBtn);

    // Presets menu trigger
    const presetDropdown = document.createElement("div");
    presetDropdown.className = "preset-dropdown-container lh-no-drag";

    const presetBtn = document.createElement("button");
    presetBtn.className = "btn btn-secondary btn-sm lh-no-drag";
    const presetSpan = document.createElement("span");
    presetSpan.textContent = "Preset";
    presetBtn.append(presetSpan, createIcon("chevron-right", "size-3"));
    presetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openToolbarMenu({
        anchor: presetBtn,
        label: "Preset",
        ui: ctx?.ui,
        signal: viewSignal,
        items: MEMORY_PRESETS.map((preset) => ({
          key: preset.id,
          label: state.activePresetId === preset.id ? `${preset.name} (attivo)` : preset.name,
          onSelect: () => loadPreset(preset.id)
        }))
      });
    });
    presetDropdown.appendChild(presetBtn);
    actions.appendChild(presetDropdown);

    // Altro menu trigger (Parametri Esercizio, Importa JSON, Esporta JSON)
    const moreDropdown = document.createElement("div");
    moreDropdown.className = "preset-dropdown-container lh-no-drag";

    const moreBtn = document.createElement("button");
    moreBtn.className = "btn btn-ghost btn-sm lh-no-drag";
    const moreSpan = document.createElement("span");
    moreSpan.textContent = "Altro";
    moreBtn.append(createIcon("sliders", "size-4"), moreSpan);
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openToolbarMenu({
        anchor: moreBtn,
        label: "Altro",
        ui: ctx?.ui,
        signal: viewSignal,
        items: [
          {
            key: "custom-config",
            label: "Parametri Esercizio",
            onSelect: () => {
              if (activeModalCleanup) {
                activeModalCleanup();
              }
              activeModalCleanup = openCustomInputModal(
                state,
                (updates) => {
                  markActiveExerciseManual();
                  update(updates);
                },
                rootEl,
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
                  const parsed = parseMemoryPreset(data);
                  if (parsed.success) {
                    const p = parsed.data;
                    const updates: Partial<MemoryLabState> = {
                      subsystem: p.subsystem,
                      trace: p.trace,
                      currentTraceIndex: 0,
                      currentVa: p.trace[0] ?? 0,
                      vaInputString: String(p.trace[0] ?? 0),
                      activePresetId: p.id
                    };
                    if (p.segmentationConfig) updates.segmentationConfig = p.segmentationConfig;
                    if (p.linearPagingConfig) updates.linearPagingConfig = p.linearPagingConfig;
                    if (p.multiLevelPagingConfig) updates.multiLevelPagingConfig = p.multiLevelPagingConfig;
                    if (p.tlbConfig) updates.tlbConfig = p.tlbConfig;
                    if (p.replacementConfig) updates.replacementConfig = p.replacementConfig;
                    update(updates);
                  } else {
                    showErrorBanner(
                      labContent,
                      `Errore validazione preset memoria: ${parsed.error}`,
                      viewSignal
                    );
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
              const exportData: Record<string, unknown> = {
                id: state.activePresetId ?? "custom-memory-preset",
                name: `Memory Configuration (${state.subsystem})`,
                description: "Configurazione esportata da Memory Virtualization Lab",
                subsystem: state.subsystem,
                trace: state.trace
              };
              if (state.subsystem === "segmentation") {
                exportData.segmentationConfig = state.segmentationConfig;
              } else if (state.subsystem === "linear-paging" || state.subsystem === "tlb") {
                exportData.linearPagingConfig = state.linearPagingConfig;
                if (state.subsystem === "tlb") exportData.tlbConfig = state.tlbConfig;
              } else if (state.subsystem === "multi-level") {
                exportData.multiLevelPagingConfig = state.multiLevelPagingConfig;
              } else if (state.subsystem === "replacement") {
                exportData.replacementConfig = state.replacementConfig;
              }
              exportJsonFile(`memory-preset-${state.subsystem}.json`, exportData);
            }
          }
        ]
      });
    });
    moreDropdown.appendChild(moreBtn);
    actions.appendChild(moreDropdown);

    toolbar.appendChild(actions);
    labContent.appendChild(toolbar);

    // If replacement mode
    if (state.subsystem === "replacement") {
      const repView = renderReplacementView(
        state.replacementConfig,
        state.currentTraceIndex,
        (newStep) => update({ currentTraceIndex: newStep }),
        (newConfig) => {
          markActiveExerciseManual();
          update({ replacementConfig: newConfig, currentTraceIndex: 0 });
        }
      );
      labContent.appendChild(repView);
      return;
    }

    // Translation Subsystems UI
    const { result, bitComponents, totalBits } = computeTranslation();

    // Trace & Address Bar
    const addressBar = document.createElement("div");
    addressBar.className = "address-control-bar";

    const traceControls = document.createElement("div");
    traceControls.className = "trace-nav-group";

    const btnPrev = document.createElement("button");
    btnPrev.className = "btn-icon";
    btnPrev.appendChild(createIcon("chevron-left"));
    btnPrev.disabled = state.currentTraceIndex <= 0;
    btnPrev.title = "Indirizzo Precedente";
    btnPrev.addEventListener("click", () => {
      if (state.currentTraceIndex > 0) {
        const nextIdx = state.currentTraceIndex - 1;
        const nextVa = state.trace[nextIdx] ?? state.currentVa;
        update({ currentTraceIndex: nextIdx, currentVa: nextVa, vaInputString: String(nextVa) });
      }
    });

    const traceIndicator = document.createElement("span");
    traceIndicator.className = "trace-counter font-mono tabular-nums";
    traceIndicator.textContent = `Indirizzo ${state.currentTraceIndex + 1} di ${state.trace.length}`;

    const btnNext = document.createElement("button");
    btnNext.className = "btn-icon";
    btnNext.appendChild(createIcon("chevron-right"));
    btnNext.disabled = state.currentTraceIndex >= state.trace.length - 1;
    btnNext.title = "Indirizzo Successivo";
    btnNext.addEventListener("click", () => {
      if (state.currentTraceIndex < state.trace.length - 1) {
        const nextIdx = state.currentTraceIndex + 1;
        const nextVa = state.trace[nextIdx] ?? state.currentVa;
        update({ currentTraceIndex: nextIdx, currentVa: nextVa, vaInputString: String(nextVa) });
      }
    });

    traceControls.append(btnPrev, traceIndicator, btnNext);
    addressBar.appendChild(traceControls);

    // Direct Address Input
    const directInput = document.createElement("div");
    directInput.className = "direct-address-group";

    const label = document.createElement("label");
    label.className = "control-label";
    label.textContent = "Indirizzo Virtuale (VA):";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "input-text font-mono";
    if (input.style) {
      input.style.minWidth = "0";
      input.style.flex = "1 1 140px";
      input.style.maxWidth = "100%";
    }
    input.value = state.vaInputString;
    input.placeholder = "es. 12841 o 0x3229";
    input.addEventListener("input", (e) => {
      state.vaInputString = (e.target as HTMLInputElement).value;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        applyInputAddress();
      }
    });

    const btnTranslate = document.createElement("button");
    btnTranslate.className = "btn btn-primary";
    btnTranslate.appendChild(createIcon("play", "size-3.5"));
    const btnSpan = document.createElement("span");
    btnSpan.textContent = "Traduci";
    btnTranslate.appendChild(btnSpan);
    btnTranslate.addEventListener("click", applyInputAddress);

    function applyInputAddress() {
      const parsed = parseAddressInput(state.vaInputString);
      if (parsed.success && parsed.data !== undefined) {
        update({ currentVa: parsed.data, vaInputString: String(parsed.data) });
      }
    }

    directInput.append(label, input, btnTranslate);
    addressBar.appendChild(directInput);

    // Trace address pills
    const pillsContainer = document.createElement("div");
    pillsContainer.className = "trace-pills-strip";
    state.trace.forEach((addr, idx) => {
      const pill = document.createElement("button");
      const isCur = idx === state.currentTraceIndex;
      pill.className = `trace-pill font-mono tabular-nums ${isCur ? "active" : ""}`;
      pill.innerHTML = `<span>VA #${idx + 1}:</span> <strong>${addr}</strong>`;
      pill.addEventListener("click", () => {
        update({ currentTraceIndex: idx, currentVa: addr, vaInputString: String(addr) });
      });
      pillsContainer.appendChild(pill);
    });
    addressBar.appendChild(pillsContainer);

    labContent.appendChild(addressBar);

    // Bit Visualizer (One Bright Element)
    const visualizer = renderBitVisualizer(state.currentVa, totalBits, bitComponents);
    labContent.appendChild(visualizer);

    // Two-Column Grid: Analytical Steps & Memory Map
    const grid = document.createElement("div");
    grid.className = "memory-lab-grid";

    const leftCol = document.createElement("div");
    leftCol.className = "grid-col left-col";
    leftCol.appendChild(renderStepPanel(result));

    const rightCol = document.createElement("div");
    rightCol.className = "grid-col right-col";
    rightCol.appendChild(
      renderMemoryMap(
        state.subsystem,
        {
          segmentationConfig: state.segmentationConfig,
          linearPagingConfig: state.linearPagingConfig,
          multiLevelPagingConfig: state.multiLevelPagingConfig,
          tlbConfig: state.tlbConfig
        },
        result
      )
    );

    grid.append(leftCol, rightCol);
    labContent.appendChild(grid);
  }

  // Mount Copilot Drawer
  const copilotHandle: CopilotDrawerHandle = createCopilotDrawer({
    mode: "memory-lab",
    initialState: "pill",
    targetContainer: rootEl,
    initialExercises: state.exerciseHistory ?? [],
    autoApplyExercise: true,
    getSimulatorSnapshot: () => ({
      subsystem: state.subsystem,
      currentVa: state.currentVa,
      trace: state.trace,
      currentTraceIndex: state.currentTraceIndex,
      segmentationConfig: state.subsystem === "segmentation" ? state.segmentationConfig : undefined,
      linearPagingConfig: state.subsystem === "linear-paging" || state.subsystem === "tlb" ? state.linearPagingConfig : undefined,
      multiLevelPagingConfig: state.subsystem === "multi-level" ? state.multiLevelPagingConfig : undefined,
      tlbConfig: state.subsystem === "tlb" ? state.tlbConfig : undefined,
      replacementConfig: state.subsystem === "replacement" ? state.replacementConfig : undefined
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
