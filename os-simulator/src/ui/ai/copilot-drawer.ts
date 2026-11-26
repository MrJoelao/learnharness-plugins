import type {
  CopilotUiMode,
  CopilotMessage,
  CopilotDrawerOptions
} from "./types.js";
import { getRandomGraphPlaceholder } from "./copilot-pill.js";
import { openExerciseHistoryModal } from "./exercise-history-modal.js";
import { createIcon } from "../icons.js";
import type { SavedExercise, AiTurnRequest, AiTurnResponse, AiCatalogResponse, AiModelConfig } from "../../types/ai.js";
import type { ModelCatalogResponse, PluginDictationHandle } from "learnharness-plugin-api";

type ModelCatalogEntry = ModelCatalogResponse["models"][number];

declare const __LH_DEBUG_ANIMATIONS__: boolean | undefined;

export const COPILOT_DEBUG_ANIMATIONS_STORAGE_KEY = "lh-os-copilot-debug-animations";
export const COPILOT_DEBUG_ANIM_SCALE = 10;

export function isDebugAnimationsEnabled(): boolean {
  try {
    if (typeof __LH_DEBUG_ANIMATIONS__ !== "undefined" && __LH_DEBUG_ANIMATIONS__) {
      return true;
    }
  } catch {
  }
  try {
    if (typeof window !== "undefined") {
      if ((window as any).__LH_DEBUG_ANIMATIONS__ === true) return true;
      if (window.location?.search && new URLSearchParams(window.location.search).get("debug-animations") === "1") {
        return true;
      }
      if ((window as any).localStorage?.getItem(COPILOT_DEBUG_ANIMATIONS_STORAGE_KEY) === "1") {
        return true;
      }
    }
  } catch {
  }
  return false;
}

export const COPILOT_DRAWER_WIDTH_STORAGE_KEY = "lh-os-copilot-width";
export const COPILOT_MODEL_STORAGE_KEY = "lh-os-copilot-model";
export const COPILOT_THINKING_STORAGE_KEY = "lh-os-copilot-thinking";
export const COPILOT_DRAWER_DEFAULT_WIDTH = 400;
export const COPILOT_DRAWER_MIN_WIDTH = 280;
export const COPILOT_DRAWER_MAX_WIDTH = 720;
const PILL_DICTATION_BAR_COUNT = 36;
const PILL_DICTATION_TICK_MS = 60;

function rmsToMeter(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  const t = (db - -50) / (-10 - -50);
  return Math.max(0, Math.min(1, t));
}

export function clampDrawerWidth(width: number, viewportWidth?: number): number {
  const vpWidth =
    typeof viewportWidth === "number" && viewportWidth > 0
      ? viewportWidth
      : typeof window !== "undefined" && typeof window.innerWidth === "number" && window.innerWidth > 0
      ? window.innerWidth
      : 1024;
  const minWidth = COPILOT_DRAWER_MIN_WIDTH;
  const maxBound = Math.min(COPILOT_DRAWER_MAX_WIDTH, vpWidth - 80);
  const maxWidth = Math.max(minWidth, maxBound);
  return Math.min(Math.max(Math.round(width), minWidth), maxWidth);
}

function getSafeLocalStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } | null {
  try {
    if (typeof window !== "undefined" && (window as any).localStorage) {
      return (window as any).localStorage;
    }
  } catch {
  }
  return null;
}

function formatInlineMarkdown(str: string): string {
  const escaped = str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  let res = escaped.replace(/`([^`]+)`/g, '<code class="copilot-code font-mono tabular-nums">$1</code>');
  res = res.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
  return res;
}

function formatMarkdown(text: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "copilot-markdown-content font-sans";

  const lines = text.split("\n");
  let currentList: HTMLUListElement | null = null;
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        const pre = document.createElement("pre");
        pre.className = "copilot-pre font-mono";
        const code = document.createElement("code");
        code.className = "copilot-code-block font-mono tabular-nums";
        code.textContent = codeBlockLines.join("\n");
        pre.appendChild(code);
        container.appendChild(pre);
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
        currentList = null;
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!currentList) {
        currentList = document.createElement("ul");
        currentList.className = "copilot-list";
        container.appendChild(currentList);
      }
      const li = document.createElement("li");
      li.innerHTML = formatInlineMarkdown(trimmed.slice(2));
      currentList.appendChild(li);
    } else {
      currentList = null;
      if (trimmed.length === 0) {
        continue;
      }
      const p = document.createElement("p");
      p.className = "copilot-paragraph";
      p.innerHTML = formatInlineMarkdown(line);
      container.appendChild(p);
    }
  }

  if (inCodeBlock && codeBlockLines.length > 0) {
    const pre = document.createElement("pre");
    pre.className = "copilot-pre font-mono";
    const code = document.createElement("code");
    code.className = "copilot-code-block font-mono tabular-nums";
    code.textContent = codeBlockLines.join("\n");
    pre.appendChild(code);
    container.appendChild(pre);
  }

  return container;
}

export interface CopilotDrawerHandle {
  getState: () => CopilotUiMode;
  setState: (mode: CopilotUiMode) => void;
  addMessage: (message: Omit<CopilotMessage, "id" | "timestamp">) => void;
  sendPrompt: (promptText: string) => Promise<void>;
  openHistoryModal: () => void;
  setExercises?: (exercises: SavedExercise[]) => void;
  getExercises?: () => SavedExercise[];
  destroy: () => void;
}

export function createCopilotDrawer(options: CopilotDrawerOptions): CopilotDrawerHandle {
  let currentState: CopilotUiMode = options.initialState ?? "pill";
  let previousState: CopilotUiMode = currentState;
  let lastExpandedState: "sheet" | "drawer" = "sheet";
  let exercises: SavedExercise[] = options.initialExercises ? [...options.initialExercises] : [];
  let messages: CopilotMessage[] = [];
  let isThinking = false;
  let isClosing = false;
  let isMorphing = false;
  let isFullscreenTransitioning = false;
  let expectedProgrammaticScrollTop: number | null = null;
  let morphTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let closeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let fullscreenTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let cancelMorphAnimation: (() => void) | null = null;
  let cancelCloseAnimation: (() => void) | null = null;
  let cancelFullscreenTransition: (() => void) | null = null;
  let focusTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let historyModalCloseFn: (() => void) | null = null;
  let isDestroyed = false;
  let isFullscreen = false;
  const drawerAbortController = new AbortController();
  const drawerSignal = drawerAbortController.signal;
  let activeRequestId: string | null = null;
  let activeStreamingMessage: CopilotMessage | null = null;
  let isFinishingDictation = false;
  let selectedModel: AiModelConfig | null = null;
  let selectedThinkingLevel = "medium";
  let dictationHandle: PluginDictationHandle | null = null;
  const activePlaceholder = getRandomGraphPlaceholder();

  let drawerWidth: number = (() => {
    try {
      const storage = getSafeLocalStorage();
      if (storage) {
        const stored = storage.getItem(COPILOT_DRAWER_WIDTH_STORAGE_KEY);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!Number.isNaN(parsed)) {
            return clampDrawerWidth(parsed);
          }
        }
      }
    } catch {
    }
    return COPILOT_DRAWER_DEFAULT_WIDTH;
  })();

  const rootEl = document.createElement("div");
  const debugAnimations = isDebugAnimationsEnabled();
  const animScale = debugAnimations ? COPILOT_DEBUG_ANIM_SCALE : 1;
  rootEl.className = debugAnimations ? "copilot-root is-debug-animations" : "copilot-root";
  if (debugAnimations) {
    if (rootEl.style && typeof rootEl.style.setProperty === "function") {
      rootEl.style.setProperty("--copilot-anim-scale", String(animScale));
    }
    options.targetContainer?.classList.add("is-debug-animations");
    if (options.targetContainer?.style && typeof options.targetContainer.style.setProperty === "function") {
      options.targetContainer.style.setProperty("--copilot-anim-scale", String(animScale));
    }
  }
  (options.targetContainer ?? document.body).appendChild(rootEl);

  function updateQuadroCenter(): void {
    const target = options.targetContainer ?? document.body;
    if (!target || typeof target.getBoundingClientRect !== "function") {
      if (rootEl.style && typeof rootEl.style.setProperty === "function") {
        rootEl.style.setProperty("--quadro-center-x", "50%");
        rootEl.style.setProperty("--quadro-width", "100vw");
      }
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width > 0) {
      const centerX = rect.left + rect.width / 2;
      if (rootEl.style && typeof rootEl.style.setProperty === "function") {
        rootEl.style.setProperty("--quadro-center-x", `${centerX}px`);
        rootEl.style.setProperty("--quadro-width", `${rect.width}px`);
      }
    } else {
      if (rootEl.style && typeof rootEl.style.setProperty === "function") {
        rootEl.style.setProperty("--quadro-center-x", "50%");
        rootEl.style.setProperty("--quadro-width", "100vw");
      }
    }
  }

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined" && options.targetContainer) {
    try {
      resizeObserver = new ResizeObserver(() => {
        updateQuadroCenter();
      });
      resizeObserver.observe(options.targetContainer);
    } catch {
    }
  }

  window.addEventListener("resize", updateQuadroCenter);
  updateQuadroCenter();

  function scrollChatToBottom() {
    if (!chatBodyEl) return;
    chatBodyEl.scrollTop = chatBodyEl.scrollHeight;
    expectedProgrammaticScrollTop = chatBodyEl.scrollTop;
  }

  function closeWithAnimation(nextMode: CopilotUiMode = "pill"): void {
    if (isClosing) return;
    if (currentState !== "sheet" && currentState !== "drawer") {
      transitionTo(nextMode);
      return;
    }

    cancelMorphAnimation?.();
    isClosing = true;
    surfaceEl.classList.add("is-closing");
    if (currentState === "drawer") {
      options.targetContainer?.classList.remove("has-copilot-drawer");
      options.targetContainer?.classList.remove("is-resizing");
      if (options.targetContainer?.style && typeof options.targetContainer.style.removeProperty === "function") {
        options.targetContainer.style.removeProperty("--copilot-drawer-width");
      }
    }

    let finished = false;
    const cleanupClose = () => {
      surfaceEl.removeEventListener("animationend", onDone);
      if (closeTimeoutId) {
        clearTimeout(closeTimeoutId);
        closeTimeoutId = null;
      }
      surfaceEl.classList.remove("is-closing");
      isClosing = false;
      cancelCloseAnimation = null;
    };
    const onDone = (e?: Event) => {
      if (e && e.target && e.target !== surfaceEl) return;
      if (finished) return;
      finished = true;
      cleanupClose();
      transitionTo(nextMode);
    };

    cancelCloseAnimation = () => {
      if (finished) return;
      finished = true;
      cleanupClose();
    };
    surfaceEl.addEventListener("animationend", onDone);
    closeTimeoutId = setTimeout(() => onDone(), 320 * animScale);
  }

  let closeModelPopoverFn: ((restoreFocus?: boolean) => void) | null = null;
  const closeModelPopover = (restoreFocus = false) => {
    closeModelPopoverFn?.(restoreFocus);
  };

  const globalKeyDownHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (closeModelPopoverFn) {
        e.preventDefault();
        closeModelPopover(true);
        return;
      }
      if (isDictating) {
        stopPillDictation();
        return;
      }
      if (currentState === "sheet") {
        e.preventDefault();
        if (isFullscreen) {
          setFullscreen(false);
          return;
        }
        closeWithAnimation("pill");
      } else if (currentState === "drawer") {
        e.preventDefault();
        closeWithAnimation("pill");
      }
    }
  };
  window.addEventListener("keydown", globalKeyDownHandler);

  function transitionTo(nextState: CopilotUiMode, carriedInput?: string) {
    if (nextState === currentState && !carriedInput) return;
    closeModelPopover();
    if (nextState === "minimized" && isDictating) {
      stopPillDictation();
    }
    if (nextState !== "sheet") {
      isFullscreen = false;
    }
    if (currentState === "sheet" || currentState === "drawer") {
      lastExpandedState = currentState;
    }
    previousState = currentState;
    currentState = nextState;
    render(carriedInput);
  }

  async function handleSendPrompt(promptText: string) {
    const trimmed = promptText.trim();
    if (trimmed.length === 0 || isThinking || isDestroyed) return;

    const conversationHistory = messages.map((m) => ({
      role: m.role,
      text: m.text
    }));

    const userMessage: CopilotMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: "user",
      text: trimmed,
      timestamp: new Date().toISOString()
    };

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    activeRequestId = requestId;

    const placeholderAssistantMessage: CopilotMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: "assistant",
      text: "",
      timestamp: new Date().toISOString()
    };
    activeStreamingMessage = placeholderAssistantMessage;
    messages.push(userMessage, placeholderAssistantMessage);

    if (currentState === "pill" || currentState === "minimized") {
      transitionTo("sheet");
    } else {
      if (messages.length >= 3 && !isFullscreen && currentState === "sheet") {
        setFullscreen(true);
      }
      renderChatBody();
    }

    isThinking = true;
    renderComposerState();

    try {
      const turnRequest: AiTurnRequest = {
        mode: options.mode,
        userMessage: trimmed,
        stateSnapshot: options.getSimulatorSnapshot ? options.getSimulatorSnapshot() : {},
        conversationHistory,
        requestId,
        ...(selectedModel
          ? {
              model: {
                provider: selectedModel.provider,
                id: selectedModel.id,
                thinkingLevel: selectedThinkingLevel
              }
            }
          : {})
      };

      let response: AiTurnResponse;
      if (options.backendCall) {
        response = await options.backendCall(turnRequest);
      } else {
        throw new Error("Backend IPC (options.backendCall) not configured");
      }
      if (isDestroyed) return;

      activeRequestId = null;
      activeStreamingMessage = null;

      placeholderAssistantMessage.text = response.responseText;
      placeholderAssistantMessage.timestamp = new Date().toISOString();
      placeholderAssistantMessage.generatedExercise = response.generatedExercise;
      placeholderAssistantMessage.controlActions = response.controlActions;
      placeholderAssistantMessage.toolCalls = response.rawToolCalls;
      placeholderAssistantMessage.error = response.error;

      if (messages.length >= 3 && !isFullscreen && currentState === "sheet") {
        setFullscreen(true);
      }

      if (response.generatedExercise) {
        exercises = [response.generatedExercise, ...exercises];
        options.onHistoryChange?.(exercises);
        if (options.autoApplyExercise) {
          options.onApplyExercise?.(response.generatedExercise);
        }
      }

      if (response.controlActions && options.onExecuteControlAction) {
        for (const action of response.controlActions) {
          options.onExecuteControlAction(action);
        }
      }

      options.onTurnResponse?.(response);
    } catch (err: unknown) {
      if (isDestroyed) return;
      activeRequestId = null;
      activeStreamingMessage = null;
      const errorMsg = err instanceof Error ? err.message : String(err);
      placeholderAssistantMessage.text = `Si è verificato un errore durante la risposta dell'assistente: ${errorMsg}`;
      placeholderAssistantMessage.timestamp = new Date().toISOString();
      placeholderAssistantMessage.error = errorMsg;
      if (messages.length >= 3 && !isFullscreen && currentState === "sheet") {
        setFullscreen(true);
      }
    } finally {
      if (isDestroyed) return;
      isThinking = false;
      renderChatBody();
      renderComposerState();
    }
  }

  function openHistory() {
    if (historyModalCloseFn) {
      historyModalCloseFn();
    }
    historyModalCloseFn = openExerciseHistoryModal({
      exercises,
      onLoadExercise: (ex) => {
        options.onApplyExercise?.(ex);
      },
      onUpdateMetadata: (id, updates) => {
        exercises = exercises.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        );
        options.onHistoryChange?.(exercises);
      },
      onDeleteExercise: (id) => {
        exercises = exercises.filter((item) => item.id !== id);
        options.onHistoryChange?.(exercises);
      },
      targetContainer: options.targetContainer,
      signal: drawerSignal,
      ui: options.ui
    });
  }

  const surfaceEl = document.createElement("div");
  surfaceEl.className = "copilot-surface";
  surfaceEl.setAttribute("data-mode", currentState);
  surfaceEl.setAttribute("data-fullscreen", "false");

  const resizer = document.createElement("div");
  resizer.className = "copilot-drawer-resizer copilot-resizer lh-no-drag";
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-valuenow", String(drawerWidth));
  resizer.setAttribute("aria-valuemin", String(COPILOT_DRAWER_MIN_WIDTH));
  resizer.setAttribute("aria-valuemax", String(COPILOT_DRAWER_MAX_WIDTH));
  resizer.setAttribute("aria-label", "Resize Copilot sidebar");
  resizer.tabIndex = 0;

  let isDragging = false;
  let startX = 0;
  let startWidth = drawerWidth;

  const setWidth = (newWidth: number) => {
    drawerWidth = clampDrawerWidth(newWidth);
    if (currentState === "drawer") {
      surfaceEl.style.width = `${drawerWidth}px`;
    }
    resizer.setAttribute("aria-valuenow", String(drawerWidth));
    if (options.targetContainer?.style && typeof options.targetContainer.style.setProperty === "function") {
      options.targetContainer.style.setProperty("--copilot-drawer-width", `${drawerWidth + 10}px`);
    }
  };

  const persistWidth = () => {
    try {
      const storage = getSafeLocalStorage();
      if (storage) {
        storage.setItem(COPILOT_DRAWER_WIDTH_STORAGE_KEY, String(drawerWidth));
      }
    } catch {
    }
  };

  const onWindowPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const delta = startX - e.clientX;
    setWidth(startWidth + delta);
  };

  const stopDragging = (e?: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    surfaceEl.classList.remove("is-resizing");
    options.targetContainer?.classList.remove("is-resizing");
    if (e && typeof resizer.releasePointerCapture === "function") {
      try {
        resizer.releasePointerCapture(e.pointerId);
      } catch {
      }
    }
    window.removeEventListener("pointermove", onWindowPointerMove as EventListener);
    window.removeEventListener("pointerup", onWindowPointerUp as EventListener);
    window.removeEventListener("pointercancel", onWindowPointerUp as EventListener);
    persistWidth();
  };

  const onWindowPointerUp = (e: PointerEvent) => {
    stopDragging(e);
  };

  const onResizerPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || currentState !== "drawer") return;
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startWidth = drawerWidth;
    surfaceEl.classList.add("is-resizing");
    options.targetContainer?.classList.add("is-resizing");
    if (typeof resizer.setPointerCapture === "function") {
      try {
        resizer.setPointerCapture(e.pointerId);
      } catch {
      }
    }
    window.addEventListener("pointermove", onWindowPointerMove as EventListener);
    window.addEventListener("pointerup", onWindowPointerUp as EventListener);
    window.addEventListener("pointercancel", onWindowPointerUp as EventListener);
  };

  const onResizerDblClick = () => {
    setWidth(COPILOT_DRAWER_DEFAULT_WIDTH);
    persistWidth();
  };

  const onResizerKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth(drawerWidth + 16);
      persistWidth();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth(drawerWidth - 16);
      persistWidth();
    } else if (e.key === "Home") {
      e.preventDefault();
      setWidth(COPILOT_DRAWER_MIN_WIDTH);
      persistWidth();
    } else if (e.key === "End") {
      e.preventDefault();
      setWidth(COPILOT_DRAWER_MAX_WIDTH);
      persistWidth();
    }
  };

  resizer.addEventListener("pointerdown", onResizerPointerDown as EventListener);
  resizer.addEventListener("dblclick", onResizerDblClick);
  resizer.addEventListener("keydown", onResizerKeyDown as EventListener);

  const floatingActions = document.createElement("div");
  floatingActions.className = "copilot-floating-actions lh-no-drag";
  if (floatingActions.style && typeof floatingActions.style.setProperty === "function") {
    floatingActions.style.setProperty("-webkit-app-region", "no-drag");
  }

  const createFloatingBtn = (
    extraClasses: string,
    title: string,
    ariaLabel: string,
    iconName: Parameters<typeof createIcon>[0],
    onClick: () => void
  ): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `copilot-floating-btn btn-icon ${extraClasses} lh-no-drag`;
    btn.title = title;
    btn.setAttribute("aria-label", ariaLabel);
    if (btn.style && typeof btn.style.setProperty === "function") {
      btn.style.setProperty("-webkit-app-region", "no-drag");
    }
    btn.appendChild(createIcon(iconName, "size-4 text-muted-foreground"));
    btn.addEventListener("click", onClick);
    return btn;
  };

  const btnHistory = createFloatingBtn(
    "copilot-btn-history",
    "Cronologia Esercizi",
    "Cronologia Esercizi",
    "history",
    () => openHistory()
  );

  const btnDockToggle = createFloatingBtn(
    "copilot-btn-dock",
    "Aggancia a destra (Drawer)",
    "Aggancia a destra",
    "panel-right",
    () => {
      if (currentState === "drawer") {
        transitionTo("sheet");
      } else {
        transitionTo("drawer");
      }
    }
  );

  const btnExpandToggle = createFloatingBtn(
    "copilot-btn-expand",
    "Espandi a schermo intero",
    "Espandi a schermo intero",
    "maximize-2",
    () => {
      if (currentState === "sheet") {
        setFullscreen(!isFullscreen);
      }
    }
  );

  const btnClose = createFloatingBtn(
    "copilot-btn-close copilot-btn-collapse",
    "Minimizza assistente",
    "Minimizza assistente",
    "chevron-down",
    () => {
      if (currentState === "pill") {
        transitionTo("minimized");
      } else {
        closeWithAnimation("pill");
      }
    }
  );

  floatingActions.append(btnHistory, btnExpandToggle, btnDockToggle, btnClose);

  const chatBodyEl = document.createElement("div");
  chatBodyEl.className = "copilot-chat-body";
  let lastKnownClientHeight = 0;

  chatBodyEl.addEventListener("scroll", () => {
    if (isMorphing || isClosing || isFullscreenTransitioning || currentState !== "sheet") return;
    const currentScrollTop = chatBodyEl.scrollTop;
    if (expectedProgrammaticScrollTop !== null && currentScrollTop === expectedProgrammaticScrollTop) {
      expectedProgrammaticScrollTop = null;
      return;
    }
    expectedProgrammaticScrollTop = null;
    const scrollHeight = chatBodyEl.scrollHeight;
    const clientHeight = chatBodyEl.clientHeight || 0;
    const isScrollable = scrollHeight > clientHeight + 15;

    if (!isFullscreen) {
      if ((isScrollable && currentScrollTop > 20) || currentScrollTop > 30) {
        setFullscreen(true);
      }
    } else {
      if (clientHeight !== lastKnownClientHeight) {
        lastKnownClientHeight = clientHeight;
        return;
      }
      if (isScrollable && currentScrollTop <= 10) {
        setFullscreen(false);
      }
    }
    lastKnownClientHeight = clientHeight;
  });

  chatBodyEl.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (isMorphing || isClosing || isFullscreenTransitioning || currentState !== "sheet") return;
      const scrollHeight = chatBodyEl.scrollHeight;
      const clientHeight = chatBodyEl.clientHeight || 0;
      const isScrollable = scrollHeight > clientHeight + 15;

      if (!isFullscreen) {
        if (isScrollable && e.deltaY > 0) {
          setFullscreen(true);
        }
      } else {
        if (chatBodyEl.scrollTop <= 10 && e.deltaY < 0) {
          setFullscreen(false);
        }
      }
    },
    { passive: true }
  );

  const composer = document.createElement("div");
  composer.className = "copilot-composer";

  const composerSurface = document.createElement("div");
  composerSurface.className = "copilot-composer-surface";

  const composerInputEl = document.createElement("textarea");
  composerInputEl.className = "copilot-composer-input font-sans";
  composerInputEl.placeholder = activePlaceholder;
  composerInputEl.rows = 1;

  const MAX_COMPOSER_HEIGHT = 160;
  const autoGrow = () => {
    if (!composerInputEl.style) return;
    if (currentState === "pill") {
      composerInputEl.style.height = "40px";
      composerInputEl.style.overflowY = "hidden";
      return;
    }
    composerInputEl.style.height = "auto";
    const scrollHeight = composerInputEl.scrollHeight;
    composerInputEl.style.height = `${scrollHeight}px`;
    composerInputEl.style.overflowY = scrollHeight > MAX_COMPOSER_HEIGHT ? "auto" : "hidden";
  };

  const handlePillInteraction = () => {
    if (currentState === "pill" && !isClosing) {
      transitionTo("sheet");
    }
  };

  composerInputEl.addEventListener("focus", handlePillInteraction);
  composerInputEl.addEventListener("click", handlePillInteraction);
  composerInputEl.addEventListener("input", () => {
    if (currentState === "pill" && !isClosing) {
      transitionTo("sheet");
      return;
    }
    autoGrow();
  });

  const submitComposerText = async () => {
    if (isFinishingDictation || isThinking || isDestroyed) return;
    if (dictationHandle) {
      isFinishingDictation = true;
      try {
        await dictationHandle.finish();
      } catch {
        return;
      } finally {
        isFinishingDictation = false;
      }
      if (isDestroyed) return;
      if (!hostSupportsStateChange && isDictating) {
        applyDictationUiState(false);
      }
    }

    const text = composerInputEl.value;
    if (currentState === "pill") {
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        composerInputEl.value = "";
        void handleSendPrompt(trimmed);
      } else {
        transitionTo("sheet");
      }
      return;
    }
    composerInputEl.value = "";
    autoGrow();
    void handleSendPrompt(text);
  };

  composerInputEl.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitComposerText();
    } else if (e.key === "Escape" && currentState === "pill") {
      e.preventDefault();
      if (isDictating) {
        stopPillDictation();
      } else {
        transitionTo("minimized");
      }
    }
  });

  const dictationStripEl = document.createElement("div");
  dictationStripEl.className = "copilot-dictation-strip";
  dictationStripEl.setAttribute("aria-hidden", "true");

  const dictationDotEl = document.createElement("span");
  dictationDotEl.className = "copilot-dictation-dot";

  const dictationMeterEl = document.createElement("div");
  dictationMeterEl.className = "copilot-dictation-meter";
  dictationMeterEl.setAttribute("data-testid", "copilot-dictation-meter");

  const dictationBarEls: HTMLSpanElement[] = [];
  for (let i = 0; i < PILL_DICTATION_BAR_COUNT; i++) {
    const bar = document.createElement("span");
    bar.className = "copilot-dictation-bar";
    dictationBarEls.push(bar);
    dictationMeterEl.appendChild(bar);
  }
  dictationStripEl.append(dictationDotEl, dictationMeterEl);

  const composerActions = document.createElement("div");
  composerActions.className = "copilot-composer-actions";

  const btnPillMic = document.createElement("button");
  btnPillMic.type = "button";
  btnPillMic.className = "copilot-btn-pill-mic lh-no-drag";
  btnPillMic.setAttribute("aria-label", "Dettatura vocale");
  btnPillMic.setAttribute("aria-pressed", "false");
  btnPillMic.title = "Dettatura vocale";
  btnPillMic.appendChild(createIcon("mic", "size-4"));

  const btnComposerDock = document.createElement("button");
  btnComposerDock.type = "button";
  btnComposerDock.className = "copilot-btn-composer-dock lh-no-drag";
  btnComposerDock.setAttribute("aria-label", "Aggancia a destra");
  btnComposerDock.title = "Aggancia a destra (Drawer)";
  btnComposerDock.appendChild(createIcon("panel-right", "size-4"));
  btnComposerDock.addEventListener("click", (e) => {
    e?.stopPropagation?.();
    transitionTo("drawer");
  });

  const btnPillHide = document.createElement("button");
  btnPillHide.type = "button";
  btnPillHide.className = "copilot-btn-pill-hide lh-no-drag";
  btnPillHide.setAttribute("aria-label", "Nascondi assistente");
  btnPillHide.title = "Nascondi assistente";
  btnPillHide.appendChild(createIcon("chevron-down", "size-4"));
  btnPillHide.addEventListener("click", (e) => {
    e?.stopPropagation?.();
    if (currentState === "pill") {
      transitionTo("minimized");
    } else {
      closeWithAnimation("pill");
    }
  });

  const composerSendBtn = document.createElement("button");
  composerSendBtn.type = "button";
  composerSendBtn.className = "btn copilot-btn-send";
  composerSendBtn.setAttribute("aria-label", "Invia");
  composerSendBtn.title = "Invia [Invio]";
  composerSendBtn.appendChild(createIcon("corner-down-left", "size-4"));
  composerSendBtn.addEventListener("click", () => {
    void submitComposerText();
  });

  composerActions.append(btnPillMic, btnComposerDock, btnPillHide, composerSendBtn);
  composerSurface.append(composerInputEl, dictationStripEl, composerActions);

  const composerFooter = document.createElement("div");
  composerFooter.className = "copilot-composer-footer lh-no-drag";

  const btnDictate = document.createElement("button");
  btnDictate.type = "button";
  btnDictate.className = "copilot-composer-chip copilot-btn-dictate lh-no-drag";
  btnDictate.setAttribute("aria-pressed", "false");
  btnDictate.setAttribute("aria-label", "Dettatura vocale");
  btnDictate.title = "Dettatura vocale";
  const dictateLabelEl = document.createElement("span");
  dictateLabelEl.className = "copilot-chip-label";
  dictateLabelEl.textContent = "Dictate";
  btnDictate.append(createIcon("mic", "size-3.5"), dictateLabelEl);
  let isDictating = false;
  let hostSupportsStateChange = false;
  let dictationIntervalId: ReturnType<typeof setInterval> | null = null;
  let dictationStream: MediaStream | null = null;
  let dictationAudioCtx: AudioContext | null = null;
  let dictationAnalyser: AnalyserNode | null = null;
  let dictationSource: MediaStreamAudioSourceNode | null = null;
  let dictationDataArray: Float32Array<ArrayBuffer> | null = null;
  let dictationGeneration = 0;
  let dictationPhaseTick = 0;
  let dictationLevels: number[] = new Array(PILL_DICTATION_BAR_COUNT).fill(0);

  const renderDictationBars = () => {
    for (let i = 0; i < dictationBarEls.length; i++) {
      const bar = dictationBarEls[i];
      if (!bar) continue;
      const level = dictationLevels[i] ?? 0;
      if (bar.style) {
        bar.style.height = `${2 + Math.round(level * 16)}px`;
      }
    }
  };

  const cleanupDictationAudio = () => {
    if (dictationIntervalId) {
      clearInterval(dictationIntervalId);
      dictationIntervalId = null;
    }
    if (dictationSource) {
      try {
        dictationSource.disconnect();
      } catch {
        // ignore disconnect errors
      }
      dictationSource = null;
    }
    dictationAnalyser = null;
    dictationDataArray = null;
    if (dictationAudioCtx) {
      try {
        void dictationAudioCtx.close();
      } catch {
        // ignore close errors
      }
      dictationAudioCtx = null;
    }
    if (dictationStream) {
      try {
        for (const track of dictationStream.getTracks()) {
          track.stop();
        }
      } catch {
        // ignore track stop errors
      }
      dictationStream = null;
    }
  };

  const computeFallbackDictationLevel = (tick: number): number => {
    const wave = 0.5 + 0.5 * Math.sin(tick * 0.42);
    const ripple = 0.5 + 0.5 * Math.cos(tick * 0.23);
    return 0.08 + 0.24 * wave * ripple;
  };

  const stopHostDictationMeter = () => {
    if (dictationIntervalId) {
      clearInterval(dictationIntervalId);
      dictationIntervalId = null;
    }
    dictationLevels = new Array(PILL_DICTATION_BAR_COUNT).fill(0);
    renderDictationBars();
  };

  const applyDictationUiState = (active: boolean, error?: string | null) => {
    isDictating = active;
    if (active) {
      surfaceEl.classList.add("is-dictating");
      btnDictate.classList.add("is-active");
    } else {
      surfaceEl.classList.remove("is-dictating");
      btnDictate.classList.remove("is-active");
    }
    dictationStripEl.setAttribute("aria-hidden", active ? "false" : "true");
    btnPillMic.setAttribute("aria-pressed", active ? "true" : "false");
    btnDictate.setAttribute("aria-pressed", active ? "true" : "false");

    if (error) {
      btnPillMic.title = error;
      btnPillMic.setAttribute("aria-label", error);
      btnDictate.title = error;
      btnDictate.setAttribute("aria-label", error);
    } else {
      btnPillMic.title = active ? "Ferma dettatura [Esc]" : "Dettatura vocale";
      btnPillMic.setAttribute("aria-label", "Dettatura vocale");
      btnDictate.title = "Dettatura vocale";
      btnDictate.setAttribute("aria-label", "Dettatura vocale");
    }

    if (active) {
      if (!dictationIntervalId) {
        dictationPhaseTick = 0;
        dictationLevels = new Array(PILL_DICTATION_BAR_COUNT).fill(0);
        renderDictationBars();
        dictationIntervalId = setInterval(() => {
          if (!isDictating || isDestroyed || !dictationHandle) return;
          dictationPhaseTick++;
          let level: number;
          if (typeof dictationHandle.getLevel === "function") {
            const rawLevel = dictationHandle.getLevel();
            level = Number.isFinite(rawLevel) ? Math.max(0, Math.min(1, rawLevel)) : 0;
          } else {
            level = computeFallbackDictationLevel(dictationPhaseTick);
          }
          dictationLevels = [...dictationLevels.slice(1), level];
          renderDictationBars();
        }, PILL_DICTATION_TICK_MS);
      }
    } else {
      stopHostDictationMeter();
    }
  };

  const stopPillDictation = () => {
    if (dictationHandle) {
      dictationHandle.cancel();
      if (!hostSupportsStateChange) {
        applyDictationUiState(false);
      } else {
        stopHostDictationMeter();
      }
      return;
    }
    dictationGeneration++;
    if (!isDictating) return;
    isDictating = false;
    surfaceEl.classList.remove("is-dictating");
    dictationStripEl.setAttribute("aria-hidden", "true");
    btnPillMic.setAttribute("aria-pressed", "false");
    btnPillMic.title = "Dettatura vocale";
    btnDictate.setAttribute("aria-pressed", "false");
    btnDictate.classList.remove("is-active");
    cleanupDictationAudio();
    dictationLevels = new Array(PILL_DICTATION_BAR_COUNT).fill(0);
    renderDictationBars();
  };

  const startPillDictation = () => {
    if (dictationHandle) {
      dictationHandle.toggle();
      return;
    }
    if (isDictating || isDestroyed || currentState === "minimized") return;
    isDictating = true;
    const gen = ++dictationGeneration;
    dictationPhaseTick = 0;
    dictationLevels = new Array(PILL_DICTATION_BAR_COUNT).fill(0);
    surfaceEl.classList.add("is-dictating");
    dictationStripEl.setAttribute("aria-hidden", "false");
    btnPillMic.setAttribute("aria-pressed", "true");
    btnPillMic.title = "Ferma dettatura [Esc]";
    btnDictate.setAttribute("aria-pressed", "true");
    btnDictate.classList.add("is-active");
    renderDictationBars();

    dictationIntervalId = setInterval(() => {
      if (!isDictating || isDestroyed) return;
      dictationPhaseTick++;
      let level = 0;
      if (dictationAnalyser && dictationDataArray) {
        dictationAnalyser.getFloatTimeDomainData(dictationDataArray);
        let sumSq = 0;
        for (let i = 0; i < dictationDataArray.length; i++) {
          const sample = dictationDataArray[i] ?? 0;
          sumSq += sample * sample;
        }
        const rms = Math.sqrt(sumSq / dictationDataArray.length);
        level = rmsToMeter(rms);
      } else {
        // Organic idle/fallback wave while mic initializes or when unavailable
        level = computeFallbackDictationLevel(dictationPhaseTick);
      }
      dictationLevels = [...dictationLevels.slice(1), level];
      renderDictationBars();
    }, PILL_DICTATION_TICK_MS);

    if (typeof navigator !== "undefined" && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          if (gen !== dictationGeneration || !isDictating || isDestroyed) {
            for (const track of stream.getTracks()) {
              track.stop();
            }
            return;
          }
          dictationStream = stream;
          const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
          if (!AudioCtx) return;
          const audioCtx = new AudioCtx();
          dictationAudioCtx = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          dictationSource = source;
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          dictationAnalyser = analyser;
          dictationDataArray = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        })
        .catch(() => {
          // Graceful fallback: animated wave continues without throwing
        });
    }
  };

  if (options.ui?.mountDictation) {
    const dictationHostContainer = document.createElement("div");
    if (dictationHostContainer.style) {
      dictationHostContainer.style.display = "none";
    }
    dictationHostContainer.setAttribute("aria-hidden", "true");
    rootEl.appendChild(dictationHostContainer);

    dictationHandle = options.ui.mountDictation(
      dictationHostContainer,
      {
        onTranscript: (text: string) => {
          if (isDestroyed || typeof text !== "string" || text.length === 0) return;
          const currentVal = composerInputEl.value;
          if (currentVal.length > 0 && !/\s$/.test(currentVal) && !/^\s/.test(text)) {
            composerInputEl.value = `${currentVal} ${text}`;
          } else {
            composerInputEl.value = `${currentVal}${text}`;
          }
          autoGrow();
          renderComposerState();
        },
        onStateChange: (state) => {
          if (isDestroyed) return;
          hostSupportsStateChange = true;
          applyDictationUiState(state.active, state.error);
        }
      },
      { signal: drawerSignal }
    );
  }

  btnPillMic.addEventListener("click", (e) => {
    e?.stopPropagation?.();
    if (dictationHandle) {
      dictationHandle.toggle();
      if (!hostSupportsStateChange) {
        applyDictationUiState(!isDictating);
      }
      return;
    }
    if (isDictating) {
      stopPillDictation();
    } else {
      startPillDictation();
    }
  });

  btnDictate.addEventListener("click", () => {
    if (dictationHandle) {
      dictationHandle.toggle();
      if (!hostSupportsStateChange) {
        applyDictationUiState(!isDictating);
      }
      return;
    }
    if (currentState === "pill" || currentState === "sheet") {
      if (isDictating) {
        stopPillDictation();
      } else {
        startPillDictation();
      }
      return;
    }
    const nextPressed = btnDictate.getAttribute("aria-pressed") !== "true";
    btnDictate.setAttribute("aria-pressed", nextPressed ? "true" : "false");
    if (nextPressed) {
      btnDictate.classList.add("is-active");
    } else {
      btnDictate.classList.remove("is-active");
    }
  });

  const COPILOT_MODELS = ["gemini-4-hydrogen", "gpt-6-luna"] as const;
  let selectedModelIdx = 0;
  let catalogModels: ModelCatalogEntry[] = [];
  const initialModel = COPILOT_MODELS[selectedModelIdx] ?? "gemini-4-hydrogen";
  const btnModel = document.createElement("button");
  btnModel.type = "button";
  btnModel.className = "copilot-composer-chip copilot-btn-model lh-no-drag";
  btnModel.setAttribute("aria-label", "Seleziona modello");
  btnModel.setAttribute("data-model", initialModel);
  if (btnModel.dataset) btnModel.dataset.model = initialModel;
  btnModel.title = "Cambia modello";
  const modelLabelEl = document.createElement("span");
  modelLabelEl.className = "copilot-chip-label";
  modelLabelEl.textContent = initialModel;
  btnModel.append(modelLabelEl, createIcon("chevron-down", "size-3"));

  const COPILOT_THINKING_LEVELS = ["low", "medium", "high"] as const;
  let selectedThinkingIdx = 1;
  selectedThinkingLevel = COPILOT_THINKING_LEVELS[selectedThinkingIdx] ?? "medium";
  const btnThinking = document.createElement("button");
  btnThinking.type = "button";
  btnThinking.className = "copilot-composer-chip copilot-btn-thinking lh-no-drag";
  btnThinking.setAttribute("aria-label", "Livello di ragionamento");
  btnThinking.setAttribute("data-thinking", selectedThinkingLevel);
  if (btnThinking.dataset) btnThinking.dataset.thinking = selectedThinkingLevel;
  btnThinking.title = "Livello di ragionamento";
  const thinkingLabelEl = document.createElement("span");
  thinkingLabelEl.className = "copilot-chip-label";
  thinkingLabelEl.textContent = selectedThinkingLevel;
  btnThinking.append(thinkingLabelEl, createIcon("chevron-down", "size-3"));

  const getSupportedThinkingLevels = (): string[] => {
    if (catalogModels.length > 0 && selectedModel) {
      const entry = catalogModels.find(
        (m) => m.provider === selectedModel!.provider && m.id === selectedModel!.id
      );
      if (entry && Array.isArray(entry.supportedLevels) && entry.supportedLevels.length > 0) {
        return [...entry.supportedLevels];
      }
      return ["off"];
    }
    return [...COPILOT_THINKING_LEVELS];
  };

  const syncThinkingUi = (level: string) => {
    selectedThinkingLevel = level;
    thinkingLabelEl.textContent = level;
    btnThinking.setAttribute("data-thinking", level);
    if (btnThinking.dataset) btnThinking.dataset.thinking = level;
  };

  const persistThinkingLevel = (level: string) => {
    try {
      const storage = getSafeLocalStorage();
      storage?.setItem(COPILOT_THINKING_STORAGE_KEY, level);
    } catch {
    }
  };

  const clampThinkingLevel = (preferred?: string) => {
    const supported = getSupportedThinkingLevels();
    const candidate = preferred ?? selectedThinkingLevel;
    if (supported.includes(candidate)) {
      syncThinkingUi(candidate);
      return;
    }
    if (supported.includes("medium")) {
      syncThinkingUi("medium");
      return;
    }
    syncThinkingUi(supported[0] ?? "off");
  };

  const applyCatalogModel = (entry: ModelCatalogEntry, persist = false) => {
    selectedModel = { provider: entry.provider, id: entry.id };
    modelLabelEl.textContent = entry.id;
    btnModel.title = entry.name || entry.id;
    btnModel.setAttribute("data-model", entry.id);
    if (btnModel.dataset) btnModel.dataset.model = entry.id;
    if (persist) {
      try {
        const storage = getSafeLocalStorage();
        storage?.setItem(
          COPILOT_MODEL_STORAGE_KEY,
          JSON.stringify({ provider: entry.provider, id: entry.id })
        );
      } catch {
      }
    }
    clampThinkingLevel();
  };

  if (options.loadCatalog) {
    options
      .loadCatalog()
      .then((catalog: AiCatalogResponse) => {
        if (isDestroyed || !catalog) return;
        const providers = Array.isArray(catalog.providers) ? catalog.providers : [];
        const activeProviders = new Set(providers.filter((p) => p.keyPresent).map((p) => p.id));
        const availableModels =
          providers.length > 0
            ? catalog.models.filter((m) => activeProviders.has(m.provider))
            : [...catalog.models];
        catalogModels = availableModels;

        if (availableModels.length === 0) {
          return;
        }

        let storedModel: { provider?: string; id?: string } | null = null;
        let storedThinking: string | null = null;
        try {
          const storage = getSafeLocalStorage();
          const rawModel = storage?.getItem(COPILOT_MODEL_STORAGE_KEY);
          if (rawModel) {
            storedModel = JSON.parse(rawModel) as { provider?: string; id?: string };
          }
          storedThinking = storage?.getItem(COPILOT_THINKING_STORAGE_KEY) ?? null;
        } catch {
        }

        const matchedStored =
          storedModel && storedModel.provider && storedModel.id
            ? availableModels.find((m) => m.provider === storedModel!.provider && m.id === storedModel!.id)
            : undefined;
        const defaultSpec = catalog.defaultModel ?? catalog.defaults?.model ?? null;
        const matchedDefault = defaultSpec
          ? availableModels.find((m) => m.provider === defaultSpec.provider && m.id === defaultSpec.id)
          : undefined;

        const chosenModel = matchedStored ?? matchedDefault ?? availableModels[0]!;
        applyCatalogModel(chosenModel, false);

        const preferredThinking =
          storedThinking ??
          catalog.defaultModel?.thinkingLevel ??
          catalog.defaults?.thinkingLevel ??
          "medium";
        clampThinkingLevel(preferredThinking);
      })
      .catch(() => {
      });
  }

  const formatProviderName = (providerId: string): string => {
    const normalized = providerId.trim().toLowerCase();
    const known: Record<string, string> = {
      openai: "OpenAI",
      anthropic: "Anthropic",
      google: "Google",
      "google-antigravity": "Google Antigravity",
      antigravity: "Antigravity",
      "openai-codex": "OpenAI Codex",
      openrouter: "OpenRouter",
      xai: "xAI",
      groq: "Groq",
      mistral: "Mistral",
      deepseek: "DeepSeek",
      ollama: "Ollama"
    };
    if (known[normalized]) return known[normalized]!;
    if (!providerId) return "Altro";
    return providerId
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const openModelPopover = () => {
    if (closeModelPopoverFn) {
      closeModelPopover(false);
      return;
    }

    const popoverEl = document.createElement("div");
    popoverEl.className = "copilot-model-popover lh-no-drag";
    popoverEl.setAttribute("role", "dialog");
    popoverEl.setAttribute("aria-label", "Seleziona modello");

    const searchRow = document.createElement("div");
    searchRow.className = "copilot-model-search";

    const searchIcon = createIcon("search", "size-3.5 copilot-model-search-icon");
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "copilot-model-search-input font-sans";
    searchInput.placeholder = "Cerca modello o provider...";
    searchInput.setAttribute("aria-label", "Cerca modello");

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "copilot-model-search-clear";
    clearBtn.title = "Cancella ricerca";
    clearBtn.setAttribute("aria-label", "Cancella ricerca");
    clearBtn.appendChild(createIcon("x", "size-3"));
    if (clearBtn.style) {
      clearBtn.style.display = "none";
    }

    searchRow.append(searchIcon, searchInput, clearBtn);

    const listEl = document.createElement("div");
    listEl.className = "copilot-model-list";
    listEl.setAttribute("role", "listbox");

    popoverEl.append(searchRow, listEl);

    let highlightedIdx = -1;
    let visibleItems: Array<{ entry: ModelCatalogEntry; el: HTMLButtonElement }> = [];

    const updateHighlight = (nextIdx: number) => {
      if (visibleItems.length === 0) {
        highlightedIdx = -1;
        return;
      }
      const clamped = ((nextIdx % visibleItems.length) + visibleItems.length) % visibleItems.length;
      highlightedIdx = clamped;
      visibleItems.forEach((item, idx) => {
        if (idx === clamped) {
          item.el.classList.add("is-highlighted");
        } else {
          item.el.classList.remove("is-highlighted");
        }
      });
      const activeEl = visibleItems[clamped]?.el as (HTMLButtonElement & { scrollIntoView?: (opts?: ScrollIntoViewOptions) => void }) | undefined;
      if (activeEl && typeof activeEl.scrollIntoView === "function") {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    };

    const renderList = (query: string) => {
      listEl.innerHTML = "";
      visibleItems = [];
      highlightedIdx = -1;

      const normalizedQuery = query.trim().toLowerCase();
      if (clearBtn.style) {
        clearBtn.style.display = normalizedQuery.length > 0 ? "inline-flex" : "none";
      }

      const grouped = new Map<string, ModelCatalogEntry[]>();
      for (const model of catalogModels) {
        const providerLabel = formatProviderName(model.provider);
        const matchesQuery =
          normalizedQuery.length === 0 ||
          model.id.toLowerCase().includes(normalizedQuery) ||
          (model.name && model.name.toLowerCase().includes(normalizedQuery)) ||
          model.provider.toLowerCase().includes(normalizedQuery) ||
          providerLabel.toLowerCase().includes(normalizedQuery);
        if (!matchesQuery) continue;

        const key = model.provider;
        const bucket = grouped.get(key);
        if (bucket) {
          bucket.push(model);
        } else {
          grouped.set(key, [model]);
        }
      }

      const sortedProviders = Array.from(grouped.keys()).sort((a, b) =>
        formatProviderName(a).localeCompare(formatProviderName(b), "it", { sensitivity: "base" })
      );

      if (sortedProviders.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "copilot-model-empty text-muted-foreground";
        emptyEl.textContent = "Nessun modello trovato";
        listEl.appendChild(emptyEl);
        return;
      }

      for (const providerKey of sortedProviders) {
        const models = grouped.get(providerKey) ?? [];
        models.sort((a, b) =>
          (a.name || a.id).localeCompare(b.name || b.id, "it", { sensitivity: "base" })
        );

        const groupEl = document.createElement("div");
        groupEl.className = "copilot-model-group";

        const headerEl = document.createElement("div");
        headerEl.className = "copilot-model-group-header";
        headerEl.textContent = formatProviderName(providerKey);
        groupEl.appendChild(headerEl);

        for (const m of models) {
          const isSelected =
            selectedModel?.provider === m.provider && selectedModel?.id === m.id;
          const itemBtn = document.createElement("button");
          itemBtn.type = "button";
          itemBtn.className = isSelected
            ? "copilot-model-item is-selected"
            : "copilot-model-item";
          itemBtn.setAttribute("role", "option");
          itemBtn.setAttribute("aria-selected", isSelected ? "true" : "false");
          itemBtn.setAttribute("data-provider", m.provider);
          itemBtn.setAttribute("data-model-id", m.id);
          itemBtn.title = m.id;

          const nameSpan = document.createElement("span");
          nameSpan.className = "copilot-model-item-label";
          nameSpan.textContent = m.name || m.id;
          itemBtn.appendChild(nameSpan);

          if (isSelected) {
            itemBtn.appendChild(createIcon("check", "size-3.5 copilot-model-item-check"));
          }

          itemBtn.addEventListener("click", () => {
            applyCatalogModel(m, true);
            closeModelPopover(true);
          });

          const itemIdx = visibleItems.length;
          itemBtn.addEventListener("mouseenter", () => {
            updateHighlight(itemIdx);
          });

          visibleItems.push({ entry: m, el: itemBtn });
          groupEl.appendChild(itemBtn);
        }

        listEl.appendChild(groupEl);
      }

      const selectedIdx = visibleItems.findIndex(
        (item) => selectedModel?.provider === item.entry.provider && selectedModel?.id === item.entry.id
      );
      if (selectedIdx >= 0) {
        updateHighlight(selectedIdx);
      } else if (visibleItems.length > 0) {
        updateHighlight(0);
      }
    };

    renderList("");

    searchInput.addEventListener("input", () => {
      renderList(searchInput.value);
    });

    searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        updateHighlight(highlightedIdx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        updateHighlight(highlightedIdx - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = visibleItems[highlightedIdx]?.entry ?? visibleItems[0]?.entry;
        if (chosen) {
          applyCatalogModel(chosen, true);
          closeModelPopover(true);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation?.();
        closeModelPopover(true);
      }
    });

    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      renderList("");
      searchInput.focus();
    });

    const onOutsidePointerDown = (e: Event) => {
      const target = e.target as Node | null;
      if (!target) return;
      const inPopover =
        typeof popoverEl.contains === "function" ? popoverEl.contains(target) : target === (popoverEl as unknown as Node);
      const inBtn =
        typeof btnModel.contains === "function" ? btnModel.contains(target) : target === (btnModel as unknown as Node);
      if (!inPopover && !inBtn) {
        closeModelPopover(false);
      }
    };

    const doc = typeof document !== "undefined" ? document : null;
    if (doc && typeof doc.addEventListener === "function") {
      doc.addEventListener("pointerdown", onOutsidePointerDown);
    }

    surfaceEl.appendChild(popoverEl);
    btnModel.setAttribute("aria-expanded", "true");
    btnModel.classList.add("is-active");

    if (popoverEl.style) {
      const surfaceRect = surfaceEl.getBoundingClientRect?.();
      const btnRect = btnModel.getBoundingClientRect?.();
      if (surfaceRect && btnRect && surfaceRect.width > 0 && btnRect.width > 0) {
        const popoverWidth = Math.min(320, Math.max(220, surfaceRect.width - 24));
        const maxLeft = Math.max(12, surfaceRect.width - popoverWidth - 12);
        const targetLeft = Math.max(12, Math.min(btnRect.left - surfaceRect.left, maxLeft));
        const targetBottom = Math.max(40, surfaceRect.bottom - btnRect.top + 6);
        popoverEl.style.width = `${popoverWidth}px`;
        popoverEl.style.left = `${targetLeft}px`;
        popoverEl.style.bottom = `${targetBottom}px`;
      }
    }

    closeModelPopoverFn = (restoreFocus = false) => {
      if (doc && typeof doc.removeEventListener === "function") {
        doc.removeEventListener("pointerdown", onOutsidePointerDown);
      }
      popoverEl.remove();
      btnModel.setAttribute("aria-expanded", "false");
      btnModel.classList.remove("is-active");
      closeModelPopoverFn = null;
      if (restoreFocus && !isDestroyed) {
        btnModel.focus();
      }
    };

    searchInput.focus();
  };

  btnModel.setAttribute("aria-haspopup", "listbox");
  btnModel.setAttribute("aria-expanded", "false");

  btnModel.addEventListener("click", () => {
    if (catalogModels.length > 0) {
      openModelPopover();
      return;
    }

    if (options.ui?.openMenu) {
      const items = COPILOT_MODELS.map((m, idx) => ({
        key: m,
        label: idx === selectedModelIdx ? `✓ ${m}` : m,
        onSelect: () => {
          selectedModelIdx = idx;
          modelLabelEl.textContent = m;
          btnModel.setAttribute("data-model", m);
          if (btnModel.dataset) btnModel.dataset.model = m;
        }
      }));

      options.ui.openMenu(
        btnModel,
        {
          items,
          label: "Modello",
          preferredSide: "up"
        },
        { signal: drawerSignal }
      );
      return;
    }

    selectedModelIdx = (selectedModelIdx + 1) % COPILOT_MODELS.length;
    const nextModel = COPILOT_MODELS[selectedModelIdx] ?? "gemini-4-hydrogen";
    modelLabelEl.textContent = nextModel;
    btnModel.setAttribute("data-model", nextModel);
    if (btnModel.dataset) btnModel.dataset.model = nextModel;
  });

  btnThinking.addEventListener("click", () => {
    closeModelPopover();
    const levels = getSupportedThinkingLevels();
    if (options.ui?.openMenu) {
      const items = levels.map((lvl) => ({
        key: lvl,
        label: lvl === selectedThinkingLevel ? `✓ ${lvl}` : lvl,
        onSelect: () => {
          syncThinkingUi(lvl);
          persistThinkingLevel(lvl);
        }
      }));
      options.ui.openMenu(
        btnThinking,
        {
          items,
          label: "Livello di ragionamento",
          preferredSide: "up"
        },
        { signal: drawerSignal }
      );
      return;
    }

    if (catalogModels.length > 0) {
      const curIdx = levels.indexOf(selectedThinkingLevel);
      const nextLevel = levels[(curIdx + 1) % levels.length] ?? "off";
      syncThinkingUi(nextLevel);
      persistThinkingLevel(nextLevel);
      return;
    }

    selectedThinkingIdx = (selectedThinkingIdx + 1) % COPILOT_THINKING_LEVELS.length;
    const nextLevel = COPILOT_THINKING_LEVELS[selectedThinkingIdx] ?? "medium";
    syncThinkingUi(nextLevel);
  });

  composerFooter.append(btnDictate, btnModel, btnThinking);
  composer.append(composerSurface, composerFooter);

  surfaceEl.append(resizer, floatingActions, chatBodyEl, composer);
  rootEl.appendChild(surfaceEl);

  const minimizedWrapper = document.createElement("div");
  minimizedWrapper.className = "copilot-container-minimized";

  const bubbleBtn = document.createElement("button");
  bubbleBtn.type = "button";
  bubbleBtn.className = "copilot-bubble";
  bubbleBtn.title = "Apri Assistente OS";
  bubbleBtn.setAttribute("aria-label", "Apri Assistente OS");
  bubbleBtn.appendChild(createIcon("bot", "size-5"));

  const bubbleBadge = document.createElement("span");
  bubbleBadge.className = "copilot-bubble-badge font-mono tabular-nums";

  bubbleBtn.addEventListener("click", () => {
    transitionTo(lastExpandedState ?? "sheet");
  });

  minimizedWrapper.appendChild(bubbleBtn);

  function updateBubbleBadge() {
    if (exercises.length > 0) {
      bubbleBadge.textContent = String(exercises.length);
      if (!bubbleBadge.parentNode) {
        bubbleBtn.appendChild(bubbleBadge);
      }
    } else if (bubbleBadge.parentNode) {
      bubbleBadge.remove();
    }
  }

  function setFullscreen(enabled: boolean) {
    if (currentState !== "sheet" || isFullscreen === enabled) return;
    isFullscreen = enabled;
    lastKnownClientHeight = chatBodyEl.clientHeight || 0;
    cancelMorphAnimation?.();
    cancelFullscreenTransition?.();
    isFullscreenTransitioning = true;
    const cleanupFullscreenTransition = () => {
      surfaceEl.removeEventListener("transitionend", onFullscreenTransitionDone);
      if (fullscreenTimeoutId) {
        clearTimeout(fullscreenTimeoutId);
        fullscreenTimeoutId = null;
      }
      isFullscreenTransitioning = false;
      cancelFullscreenTransition = null;
    };
    const onFullscreenTransitionDone = (e?: Event) => {
      if (e && e.target && e.target !== surfaceEl) return;
      const prop = (e as { propertyName?: string } | undefined)?.propertyName;
      if (prop && prop !== "height") return;
      cleanupFullscreenTransition();
    };
    cancelFullscreenTransition = cleanupFullscreenTransition;
    surfaceEl.addEventListener("transitionend", onFullscreenTransitionDone);
    fullscreenTimeoutId = setTimeout(() => cleanupFullscreenTransition(), 360 * animScale);
    surfaceEl.setAttribute("data-fullscreen", isFullscreen ? "true" : "false");
    if (isFullscreen) {
      surfaceEl.classList.add("is-fullscreen", "is-expanded");
    } else {
      surfaceEl.classList.remove("is-fullscreen", "is-expanded");
    }
    updateFloatingButtonStates();
  }

  function updateFloatingButtonStates() {
    if (currentState === "drawer") {
      btnDockToggle.title = "Aggancia in basso (Sheet)";
      btnDockToggle.setAttribute("aria-label", "Aggancia in basso");
      btnDockToggle.innerHTML = "";
      btnDockToggle.appendChild(createIcon("chevron-down", "size-4 text-muted-foreground"));
    } else {
      btnDockToggle.title = "Aggancia a destra (Drawer)";
      btnDockToggle.setAttribute("aria-label", "Aggancia a destra");
      btnDockToggle.innerHTML = "";
      btnDockToggle.appendChild(createIcon("panel-right", "size-4 text-muted-foreground"));
    }

    if (currentState === "pill") {
      btnClose.title = "Minimizza assistente";
      btnClose.setAttribute("aria-label", "Minimizza assistente");
      btnClose.innerHTML = "";
      btnClose.appendChild(createIcon("chevron-down", "size-4 text-muted-foreground"));
    } else {
      btnClose.title = "Minimizza [Esc]";
      btnClose.setAttribute("aria-label", "Minimizza assistente");
      btnClose.innerHTML = "";
      btnClose.appendChild(createIcon("x", "size-4 text-muted-foreground"));
    }

    if (isFullscreen && currentState === "sheet") {
      btnExpandToggle.title = "Riduci dimensione";
      btnExpandToggle.setAttribute("aria-label", "Riduci dimensione");
      btnExpandToggle.innerHTML = "";
      btnExpandToggle.appendChild(createIcon("minimize-2", "size-4 text-muted-foreground"));
    } else {
      btnExpandToggle.title = "Espandi a schermo intero";
      btnExpandToggle.setAttribute("aria-label", "Espandi a schermo intero");
      btnExpandToggle.innerHTML = "";
      btnExpandToggle.appendChild(createIcon("maximize-2", "size-4 text-muted-foreground"));
    }
  }

  function render(carriedInput?: string) {
    if (isDestroyed) return;

    cancelCloseAnimation?.();
    cancelMorphAnimation?.();
    cancelFullscreenTransition?.();

    if (carriedInput !== undefined) {
      composerInputEl.value = carriedInput;
    }

    if (currentState === "drawer") {
      options.targetContainer?.classList.add("has-copilot-drawer");
      if (options.targetContainer?.style && typeof options.targetContainer.style.setProperty === "function") {
        options.targetContainer.style.setProperty("--copilot-drawer-width", `${drawerWidth + 10}px`);
      }
      if (surfaceEl.style) {
        surfaceEl.style.width = `${drawerWidth}px`;
      }
    } else {
      stopDragging();
      options.targetContainer?.classList.remove("has-copilot-drawer");
      options.targetContainer?.classList.remove("is-resizing");
      if (options.targetContainer?.style && typeof options.targetContainer.style.removeProperty === "function") {
        options.targetContainer.style.removeProperty("--copilot-drawer-width");
      }
      if (surfaceEl.style) {
        surfaceEl.style.width = "";
      }
    }

    surfaceEl.classList.remove(
      "copilot-container-pill",
      "copilot-container-sheet",
      "copilot-container-drawer",
      "is-morphed",
      "is-morphing-open",
      "is-entering-from-drawer",
      "is-fullscreen",
      "is-expanded",
      "is-minimized"
    );
    surfaceEl.setAttribute("data-mode", currentState);
    surfaceEl.setAttribute("data-fullscreen", currentState === "sheet" && isFullscreen ? "true" : "false");

    if (currentState === "minimized") {
      surfaceEl.classList.add("is-minimized");
      updateBubbleBadge();
      if (!minimizedWrapper.parentNode) {
        rootEl.appendChild(minimizedWrapper);
      }
      return;
    }

    if (minimizedWrapper.parentNode) {
      minimizedWrapper.remove();
    }

    if (currentState === "pill") {
      surfaceEl.classList.add("copilot-container-pill");
      composerInputEl.classList.add("copilot-pill-input");
      if (previousState === "sheet") {
        surfaceEl.classList.add("is-morphed");
      }
      if (composerInputEl.style) {
        composerInputEl.style.height = "40px";
      }
    } else if (currentState === "sheet") {
      surfaceEl.classList.add("copilot-container-sheet");
      composerInputEl.classList.remove("copilot-pill-input");
      if (isFullscreen) {
        surfaceEl.classList.add("is-fullscreen", "is-expanded");
      } else if (previousState === "pill") {
        isMorphing = true;
        surfaceEl.classList.add("is-morphing-open");
        const cleanupMorph = () => {
          surfaceEl.removeEventListener("animationend", onMorphDone);
          if (morphTimeoutId) {
            clearTimeout(morphTimeoutId);
            morphTimeoutId = null;
          }
          surfaceEl.classList.remove("is-morphing-open");
          isMorphing = false;
          cancelMorphAnimation = null;
        };
        const onMorphDone = (e?: Event) => {
          if (e && e.target && e.target !== surfaceEl) return;
          cleanupMorph();
        };
        cancelMorphAnimation = cleanupMorph;
        surfaceEl.addEventListener("animationend", onMorphDone);
        morphTimeoutId = setTimeout(() => onMorphDone(), 320 * animScale);
      } else if (previousState === "drawer") {
        surfaceEl.classList.add("is-entering-from-drawer");
        const cleanupEnter = () => {
          surfaceEl.removeEventListener("animationend", onEnterDone);
          if (morphTimeoutId) {
            clearTimeout(morphTimeoutId);
            morphTimeoutId = null;
          }
          surfaceEl.classList.remove("is-entering-from-drawer");
          cancelMorphAnimation = null;
        };
        const onEnterDone = (e?: Event) => {
          if (e && e.target && e.target !== surfaceEl) return;
          cleanupEnter();
        };
        cancelMorphAnimation = cleanupEnter;
        surfaceEl.addEventListener("animationend", onEnterDone);
        morphTimeoutId = setTimeout(() => onEnterDone(), 300 * animScale);
      }
      if (composerInputEl.style) {
        composerInputEl.style.height = "";
      }
      autoGrow();
    } else if (currentState === "drawer") {
      surfaceEl.classList.add("copilot-container-drawer");
      composerInputEl.classList.remove("copilot-pill-input");
      if (composerInputEl.style) {
        composerInputEl.style.height = "";
      }
      autoGrow();
    }

    updateFloatingButtonStates();
    renderChatBody();
    renderComposerState();

    if (currentState === "sheet" || currentState === "drawer") {
      if (focusTimeoutId) {
        clearTimeout(focusTimeoutId);
      }
      focusTimeoutId = setTimeout(() => {
        focusTimeoutId = null;
        if (isDestroyed || currentState === "pill" || currentState === "minimized") return;
        autoGrow();
        composerInputEl.focus();
      }, 50);
    }
  }

  function renderChatBody() {
    if (!chatBodyEl) return;
    chatBodyEl.innerHTML = "";

    if (messages.length === 0) {
      const emptyNotice = document.createElement("div");
      emptyNotice.className = "copilot-chat-empty text-muted-foreground";
      const emptyText = document.createElement("p");
      emptyText.className = "text-sm text-muted-foreground";
      emptyText.textContent = "Fai una domanda sulla simulazione attiva o genera un esercizio.";
      emptyNotice.appendChild(emptyText);
      chatBodyEl.appendChild(emptyNotice);
      return;
    }

    for (const msg of messages) {
      if (msg === activeStreamingMessage && msg.text.length === 0) {
        continue;
      }
      const msgRow = document.createElement("div");
      msgRow.className = `copilot-message-row copilot-message-${msg.role}`;

      const bubble = document.createElement("div");
      bubble.className = `copilot-bubble-message copilot-bubble-${msg.role}`;

      if (msg.role === "assistant") {
        const headerEl = document.createElement("div");
        headerEl.className = "copilot-message-header";
        const botIcon = createIcon("bot", "size-3.5 text-primary shrink-0");
        const senderText = document.createElement("span");
        senderText.className = "font-semibold text-xs";
        senderText.textContent = "Assistente OS";
        headerEl.append(botIcon, senderText);
        bubble.appendChild(headerEl);
      }

      const contentEl = formatMarkdown(msg.text);
      bubble.appendChild(contentEl);

      if (msg.controlActions && msg.controlActions.length > 0) {
        const actionsBox = document.createElement("div");
        actionsBox.className = "copilot-control-actions-box";
        for (const act of msg.controlActions) {
          const actBadge = document.createElement("div");
          actBadge.className = "copilot-control-action-badge font-mono tabular-nums text-xs";
          actBadge.textContent = `Azione: ${act.action} (${JSON.stringify(act.payload)})`;
          actionsBox.appendChild(actBadge);
        }
        bubble.appendChild(actionsBox);
      }

      if (msg.generatedExercise) {
        const ex = msg.generatedExercise;
        const exCard = document.createElement("div");
        exCard.className = "copilot-generated-exercise-card";

        const exHeader = document.createElement("div");
        exHeader.className = "flex items-center justify-between gap-2";

        const exTitle = document.createElement("h5");
        exTitle.className = "copilot-exercise-title font-title font-semibold text-sm";
        exTitle.textContent = ex.title;

        const exBadge = document.createElement("span");
        exBadge.className = "copilot-badge copilot-badge-ai text-xs";
        exBadge.append(createIcon("bot", "size-3 shrink-0"), document.createTextNode("AI Generato"));

        exHeader.append(exTitle, exBadge);

        const exConsegna = document.createElement("p");
        exConsegna.className = "copilot-exercise-consegna text-xs mt-1 text-muted-foreground";
        exConsegna.textContent = ex.consegna;

        const btnApply = document.createElement("button");
        btnApply.type = "button";
        btnApply.className = "btn btn-primary btn-sm mt-2";
        btnApply.append(createIcon("play", "size-3.5"), document.createTextNode("Carica nel Simulatore"));
        btnApply.addEventListener("click", () => {
          options.onApplyExercise?.(ex);
        });

        exCard.append(exHeader, exConsegna, btnApply);
        bubble.appendChild(exCard);
      }

      msgRow.appendChild(bubble);
      chatBodyEl.appendChild(msgRow);
    }

    if (isThinking && (!activeStreamingMessage || activeStreamingMessage.text.length === 0)) {
      const thinkingRow = document.createElement("div");
      thinkingRow.className = "copilot-message-row copilot-message-assistant";

      const thinkingBubble = document.createElement("div");
      thinkingBubble.className = "copilot-bubble-message copilot-bubble-assistant copilot-thinking-bubble";

      const loaderIcon = createIcon("loader-2", "size-3.5 text-primary shrink-0 animate-spin");
      const thinkingText = document.createElement("span");
      thinkingText.className = "text-xs text-muted-foreground font-sans";
      thinkingText.textContent = "Elaborazione...";

      thinkingBubble.append(loaderIcon, thinkingText);
      thinkingRow.appendChild(thinkingBubble);
      chatBodyEl.appendChild(thinkingRow);
    }

    scrollChatToBottom();
  }

  function renderComposerState() {
    if (composerInputEl) {
      composerInputEl.disabled = isThinking;
    }
    if (composerSendBtn) {
      composerSendBtn.disabled = isThinking;
      composerSendBtn.innerHTML = "";
      if (isThinking) {
        composerSendBtn.title = "Elaborazione in corso...";
        composerSendBtn.appendChild(createIcon("loader-2", "size-4 animate-spin shrink-0"));
      } else {
        composerSendBtn.title = "Invia [Invio]";
        composerSendBtn.appendChild(createIcon("corner-down-left", "size-4 shrink-0"));
      }
    }
  }

  let unsubscribeNotification: (() => void) | null = null;
  if (options.onNotification) {
    unsubscribeNotification = options.onNotification((event) => {
      if (event.topic !== "ai-stream" || isDestroyed) return;
      const data = event.data as { requestId?: unknown; type?: unknown; delta?: unknown } | null | undefined;
      if (!data || !activeRequestId || data.requestId !== activeRequestId) return;
      if (data.type === "text_delta" && typeof data.delta === "string" && activeStreamingMessage) {
        activeStreamingMessage.text += data.delta;
        renderChatBody();
      }
    });
  }

  render();

  const destroy = () => {
    isDestroyed = true;
    activeRequestId = null;
    activeStreamingMessage = null;
    unsubscribeNotification?.();
    unsubscribeNotification = null;
    if (dictationHandle) {
      dictationHandle.cancel();
      dictationHandle.dispose();
      dictationHandle = null;
    }
    stopHostDictationMeter();
    stopPillDictation();
    closeModelPopover();
    drawerAbortController.abort();
    stopDragging();
    cancelCloseAnimation?.();
    cancelMorphAnimation?.();
    cancelFullscreenTransition?.();
    if (focusTimeoutId) {
      clearTimeout(focusTimeoutId);
      focusTimeoutId = null;
    }
    window.removeEventListener("keydown", globalKeyDownHandler);
    window.removeEventListener("resize", updateQuadroCenter);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    options.targetContainer?.classList.remove("has-copilot-drawer");
    options.targetContainer?.classList.remove("is-resizing");
    options.targetContainer?.classList.remove("is-debug-animations");
    if (options.targetContainer?.style && typeof options.targetContainer.style.removeProperty === "function") {
      options.targetContainer.style.removeProperty("--copilot-drawer-width");
      options.targetContainer.style.removeProperty("--copilot-anim-scale");
    }
    if (historyModalCloseFn) {
      historyModalCloseFn();
      historyModalCloseFn = null;
    }
    if (options.signal) {
      options.signal.removeEventListener("abort", destroy);
    }
    rootEl.remove();
  };

  if (options.signal) {
    options.signal.addEventListener("abort", destroy, { once: true });
    if (options.signal.aborted) {
      destroy();
    }
  }

  return {
    getState: () => currentState,
    setState: (nextMode: CopilotUiMode) => transitionTo(nextMode),
    addMessage: (msg) => {
      messages.push({
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        ...msg
      });
      if (messages.length >= 3 && !isFullscreen && currentState === "sheet") {
        setFullscreen(true);
      }
      renderChatBody();
    },
    sendPrompt: handleSendPrompt,
    openHistoryModal: openHistory,
    setExercises: (newExercises: SavedExercise[]) => {
      exercises = [...newExercises];
      if (currentState === "minimized") {
        updateBubbleBadge();
      }
    },
    getExercises: () => [...exercises],
    destroy
  };
}
