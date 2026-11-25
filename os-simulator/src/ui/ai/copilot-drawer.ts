import type {
  CopilotUiMode,
  CopilotMessage,
  CopilotDrawerOptions
} from "./types.js";
import { createCopilotPill, type CopilotPillHandle, getRandomGraphPlaceholder } from "./copilot-pill.js";
import { openExerciseHistoryModal } from "./exercise-history-modal.js";
import { createIcon } from "../icons.js";
import type { SavedExercise, AiTurnRequest, AiTurnResponse } from "../../types/ai.js";

export const COPILOT_DRAWER_WIDTH_STORAGE_KEY = "lh-os-copilot-width";
export const COPILOT_DRAWER_DEFAULT_WIDTH = 400;
export const COPILOT_DRAWER_MIN_WIDTH = 280;
export const COPILOT_DRAWER_MAX_WIDTH = 720;

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
  let activePillHandle: CopilotPillHandle | null = null;
  let activeDrawerCleanup: (() => void) | null = null;
  let historyModalCloseFn: (() => void) | null = null;
  let isDestroyed = false;
  let isFullscreen = false;
  let setFullscreen: (enabled: boolean) => void = () => {};
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
  rootEl.className = "copilot-root";
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

  function closeWithAnimation(nextMode: CopilotUiMode = "pill"): void {
    if (isClosing) return;
    const panel = (rootEl.querySelector(".copilot-container-sheet") ||
      rootEl.querySelector(".copilot-container-drawer")) as HTMLElement | null;

    if (!panel) {
      transitionTo(nextMode);
      return;
    }

    isClosing = true;
    panel.classList.add("is-closing");

    const carriedInput = composerInputEl?.value?.trim() ? composerInputEl.value : undefined;

    let finished = false;
    const onDone = (e?: Event) => {
      if (e && e.target && e.target !== panel) return;
      if (finished) return;
      finished = true;
      panel.removeEventListener("animationend", onDone);
      isClosing = false;
      transitionTo(nextMode, carriedInput);
    };

    panel.addEventListener("animationend", onDone);
    setTimeout(() => onDone(), 260);
  }

  const globalKeyDownHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
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
    if (trimmed.length === 0 || isThinking) return;

    const userMessage: CopilotMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: "user",
      text: trimmed,
      timestamp: new Date().toISOString()
    };
    messages.push(userMessage);

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
      const historyTurns = messages.map((m) => ({
        role: m.role,
        text: m.text
      }));

      const turnRequest: AiTurnRequest = {
        mode: options.mode,
        userMessage: trimmed,
        stateSnapshot: options.getSimulatorSnapshot ? options.getSimulatorSnapshot() : {},
        conversationHistory: historyTurns.slice(0, -1)
      };

      let response: AiTurnResponse;
      if (options.backendCall) {
        response = await options.backendCall(turnRequest);
      } else {
        throw new Error("Backend IPC (options.backendCall) not configured");
      }

      const assistantMessage: CopilotMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "assistant",
        text: response.responseText,
        timestamp: new Date().toISOString(),
        generatedExercise: response.generatedExercise,
        controlActions: response.controlActions,
        toolCalls: response.rawToolCalls,
        error: response.error
      };
      messages.push(assistantMessage);
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
      const errorMsg = err instanceof Error ? err.message : String(err);
      const assistantMessage: CopilotMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "assistant",
        text: `Si è verificato un errore durante la risposta dell'assistente: ${errorMsg}`,
        timestamp: new Date().toISOString(),
        error: errorMsg
      };
      messages.push(assistantMessage);
      if (messages.length >= 3 && !isFullscreen && currentState === "sheet") {
        setFullscreen(true);
      }
    } finally {
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
      signal: options.signal,
      ui: options.ui
    });
  }

  function render(carriedInput?: string) {
    if (activeDrawerCleanup) {
      activeDrawerCleanup();
      activeDrawerCleanup = null;
    }
    if (activePillHandle) {
      activePillHandle.destroy();
      activePillHandle = null;
    }
    rootEl.innerHTML = "";

    if (currentState === "drawer") {
      options.targetContainer?.classList.add("has-copilot-drawer");
      if (options.targetContainer?.style && typeof options.targetContainer.style.setProperty === "function") {
        options.targetContainer.style.setProperty("--copilot-drawer-width", `${drawerWidth + 10}px`);
      }
    } else {
      options.targetContainer?.classList.remove("has-copilot-drawer");
      options.targetContainer?.classList.remove("is-resizing");
      if (options.targetContainer?.style && typeof options.targetContainer.style.removeProperty === "function") {
        options.targetContainer.style.removeProperty("--copilot-drawer-width");
      }
    }

    switch (currentState) {
      case "pill": {
        renderPillState(carriedInput);
        break;
      }
      case "sheet": {
        renderSheetOrDrawerState("sheet", carriedInput);
        break;
      }
      case "drawer": {
        renderSheetOrDrawerState("drawer", carriedInput);
        break;
      }
      case "minimized": {
        renderMinimizedState();
        break;
      }
      default: {
        const _exhaustive: never = currentState;
        return _exhaustive;
      }
    }
  }

  function renderPillState(initialText?: string) {
    const pillWrapper = document.createElement("div");
    pillWrapper.className =
      previousState === "sheet"
        ? "copilot-container-pill is-morphed"
        : "copilot-container-pill";

    activePillHandle = createCopilotPill({
      initialValue: initialText,
      placeholder: activePlaceholder,
      onFocusOrInput: (text) => {
        transitionTo("sheet", text);
      },
      onSubmitPrompt: (prompt) => {
        handleSendPrompt(prompt);
      },
      onToggleDrawer: () => {
        transitionTo("drawer");
      },
      onMinimize: () => {
        transitionTo("minimized");
      },
      signal: options.signal
    });

    pillWrapper.appendChild(activePillHandle.element);
    rootEl.appendChild(pillWrapper);
  }

  function renderMinimizedState() {
    const bubbleWrapper = document.createElement("div");
    bubbleWrapper.className = "copilot-container-minimized";

    const bubbleBtn = document.createElement("button");
    bubbleBtn.type = "button";
    bubbleBtn.className = "copilot-bubble";
    bubbleBtn.title = "Apri Assistente OS";
    bubbleBtn.setAttribute("aria-label", "Apri Assistente OS");

    const botIcon = createIcon("bot", "size-5 text-primary-foreground");
    bubbleBtn.appendChild(botIcon);

    if (exercises.length > 0) {
      const badge = document.createElement("span");
      badge.className = "copilot-bubble-badge font-mono tabular-nums";
      badge.textContent = String(exercises.length);
      bubbleBtn.appendChild(badge);
    }

    bubbleBtn.addEventListener("click", () => {
      transitionTo(lastExpandedState ?? "sheet");
    });

    bubbleWrapper.appendChild(bubbleBtn);
    rootEl.appendChild(bubbleWrapper);
  }

  let chatBodyEl: HTMLElement | null = null;
  let composerInputEl: HTMLTextAreaElement | null = null;
  let composerSendBtn: HTMLButtonElement | null = null;

  function renderSheetOrDrawerState(layoutMode: "sheet" | "drawer", carriedInput?: string) {
    const isMorphing = layoutMode === "sheet" && previousState === "pill";
    const panel = document.createElement("div");
    panel.className =
      layoutMode === "sheet"
        ? isFullscreen
          ? "copilot-container-sheet is-fullscreen is-expanded"
          : isMorphing
          ? "copilot-container-sheet is-morphing-open"
          : "copilot-container-sheet"
        : "copilot-container-drawer";

    if (isMorphing) {
      panel.addEventListener(
        "animationend",
        () => {
          panel.classList.remove("is-morphing-open");
        },
        { once: true }
      );
      setTimeout(() => {
        panel.classList.remove("is-morphing-open");
      }, 320);
    }

    if (layoutMode === "drawer") {
      panel.style.width = `${drawerWidth}px`;

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
        panel.style.width = `${drawerWidth}px`;
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
        panel.classList.remove("is-resizing");
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

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startWidth = drawerWidth;
        panel.classList.add("is-resizing");
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

      const onDblClick = () => {
        setWidth(COPILOT_DRAWER_DEFAULT_WIDTH);
        persistWidth();
      };

      const onKeyDown = (e: KeyboardEvent) => {
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

      resizer.addEventListener("pointerdown", onPointerDown as EventListener);
      resizer.addEventListener("pointermove", onWindowPointerMove as EventListener);
      resizer.addEventListener("pointerup", onWindowPointerUp as EventListener);
      resizer.addEventListener("pointercancel", onWindowPointerUp as EventListener);
      resizer.addEventListener("dblclick", onDblClick);
      resizer.addEventListener("keydown", onKeyDown as EventListener);

      activeDrawerCleanup = () => {
        stopDragging();
      };

      panel.appendChild(resizer);
    }

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

    if (layoutMode === "sheet") {
      const btnDockToggle = createFloatingBtn(
        "copilot-btn-dock",
        "Aggancia a destra (Drawer)",
        "Aggancia a destra",
        "panel-right",
        () => transitionTo("drawer")
      );

      const btnExpandToggle = createFloatingBtn(
        "copilot-btn-expand",
        isFullscreen ? "Riduci dimensione" : "Espandi a schermo intero",
        isFullscreen ? "Riduci dimensione" : "Espandi a schermo intero",
        isFullscreen ? "minimize-2" : "maximize-2",
        () => setFullscreen(!isFullscreen)
      );

      const btnClose = createFloatingBtn(
        "copilot-btn-close copilot-btn-collapse",
        "Minimizza [Esc]",
        "Minimizza assistente",
        "x",
        () => closeWithAnimation("pill")
      );

      floatingActions.append(btnHistory, btnDockToggle, btnExpandToggle, btnClose);
      panel.appendChild(floatingActions);

      setFullscreen = (enabled: boolean) => {
        if (layoutMode !== "sheet" || isFullscreen === enabled) return;
        isFullscreen = enabled;
        panel.classList.remove("is-morphing-open");
        if (isFullscreen) {
          panel.classList.add("is-fullscreen");
          panel.classList.add("is-expanded");
          btnExpandToggle.title = "Riduci dimensione";
          btnExpandToggle.setAttribute("aria-label", "Riduci dimensione");
          btnExpandToggle.innerHTML = "";
          btnExpandToggle.appendChild(createIcon("minimize-2", "size-4 text-muted-foreground"));
        } else {
          panel.classList.remove("is-fullscreen");
          panel.classList.remove("is-expanded");
          btnExpandToggle.title = "Espandi a schermo intero";
          btnExpandToggle.setAttribute("aria-label", "Espandi a schermo intero");
          btnExpandToggle.innerHTML = "";
          btnExpandToggle.appendChild(createIcon("maximize-2", "size-4 text-muted-foreground"));
        }
      };
    } else {
      setFullscreen = () => {};

      const btnDockToggle = createFloatingBtn(
        "copilot-btn-dock",
        "Aggancia in basso (Sheet)",
        "Aggancia in basso",
        "chevron-down",
        () => transitionTo("sheet")
      );

      const btnClose = createFloatingBtn(
        "copilot-btn-close copilot-btn-collapse",
        "Minimizza [Esc]",
        "Minimizza assistente",
        "x",
        () => closeWithAnimation("pill")
      );

      floatingActions.append(btnHistory, btnDockToggle, btnClose);
      panel.appendChild(floatingActions);
    }

    chatBodyEl = document.createElement("div");
    chatBodyEl.className = "copilot-chat-body";
    chatBodyEl.style.paddingTop = "52px";

    if (layoutMode === "sheet") {
      let lastScrollTop = 0;

      chatBodyEl.addEventListener("scroll", () => {
        if (!chatBodyEl) return;
        const currentScrollTop = chatBodyEl.scrollTop;
        const scrollHeight = chatBodyEl.scrollHeight;
        const clientHeight = chatBodyEl.clientHeight || 0;
        const isScrollable = scrollHeight > clientHeight + 15;

        if (!isFullscreen) {
          if ((isScrollable && currentScrollTop > 20) || currentScrollTop > 30) {
            setFullscreen(true);
          }
        } else {
          if (currentScrollTop <= 10) {
            setFullscreen(false);
          }
        }
        lastScrollTop = currentScrollTop;
      });

      chatBodyEl.addEventListener(
        "wheel",
        (e: WheelEvent) => {
          if (!chatBodyEl) return;
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
    }

    panel.appendChild(chatBodyEl);

    const autoGrow = () => {
      if (!composerInputEl) return;
      composerInputEl.style.height = "auto";
      composerInputEl.style.height = `${composerInputEl.scrollHeight}px`;
    };

    const composer = document.createElement("div");
    composer.className = "copilot-composer";

    const composerSurface = document.createElement("div");
    composerSurface.className = "copilot-composer-surface";

    composerInputEl = document.createElement("textarea");
    composerInputEl.className = "copilot-composer-input font-sans";
    composerInputEl.placeholder = activePlaceholder;
    composerInputEl.rows = 1;
    composerInputEl.addEventListener("input", autoGrow);
    if (carriedInput) {
      composerInputEl.value = carriedInput;
      autoGrow();
    }

    const submitComposerText = () => {
      const text = composerInputEl?.value ?? "";
      if (composerInputEl) {
        composerInputEl.value = "";
        autoGrow();
      }
      handleSendPrompt(text);
    };

    composerInputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitComposerText();
      }
    });

    const composerActions = document.createElement("div");
    composerActions.className = "copilot-composer-actions";

    composerSendBtn = document.createElement("button");
    composerSendBtn.type = "button";
    composerSendBtn.className = "btn copilot-btn-send";
    composerSendBtn.setAttribute("aria-label", "Invia");
    composerSendBtn.title = "Invia [Invio]";
    composerSendBtn.appendChild(createIcon("corner-down-left", "size-4"));
    composerSendBtn.addEventListener("click", () => {
      submitComposerText();
    });

    composerActions.appendChild(composerSendBtn);
    composerSurface.append(composerInputEl, composerActions);
    composer.appendChild(composerSurface);
    panel.appendChild(composer);

    rootEl.appendChild(panel);

    renderChatBody();
    renderComposerState();

    setTimeout(() => {
      autoGrow();
      composerInputEl?.focus();
    }, 50);
  }

  function renderChatBody() {
    if (!chatBodyEl) return;
    chatBodyEl.innerHTML = "";

    if (messages.length === 0) {
      const emptyNotice = document.createElement("div");
      emptyNotice.className = "copilot-chat-empty text-muted-foreground";
      emptyNotice.innerHTML = `
        <div class="copilot-empty-icon-wrap">
          <svg class="size-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8V4H8"></path>
            <rect width="16" height="12" x="4" y="8" rx="2"></rect>
            <path d="M2 14h2"></path>
            <path d="M20 14h2"></path>
            <path d="M15 13v2"></path>
            <path d="M9 13v2"></path>
          </svg>
        </div>
        <p class="font-semibold text-foreground text-sm mt-2">Assistente Didattico basato su OSTEP</p>
        <p class="text-xs mt-1 text-muted-foreground">Seleziona uno dei prompt consigliati qui sotto oppure fai una domanda sulla teoria e simulazione attiva.</p>
      `;
      chatBodyEl.appendChild(emptyNotice);
      return;
    }

    for (const msg of messages) {
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

    if (isThinking) {
      const thinkingRow = document.createElement("div");
      thinkingRow.className = "copilot-message-row copilot-message-assistant";

      const thinkingBubble = document.createElement("div");
      thinkingBubble.className = "copilot-bubble-message copilot-bubble-assistant copilot-thinking-bubble";

      const sparklesIcon = createIcon("loader-2", "size-3.5 text-primary shrink-0 animate-spin");
      const thinkingText = document.createElement("span");
      thinkingText.className = "text-xs text-muted-foreground font-sans";
      thinkingText.textContent = "Elaborazione risposta OSTEP...";

      thinkingBubble.append(sparklesIcon, thinkingText);
      thinkingRow.appendChild(thinkingBubble);
      chatBodyEl.appendChild(thinkingRow);
    }

    chatBodyEl.scrollTop = chatBodyEl.scrollHeight;
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

  render();

  const destroy = () => {
    isDestroyed = true;
    setFullscreen = () => {};
    if (activeDrawerCleanup) {
      activeDrawerCleanup();
      activeDrawerCleanup = null;
    }
    window.removeEventListener("keydown", globalKeyDownHandler);
    window.removeEventListener("resize", updateQuadroCenter);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    options.targetContainer?.classList.remove("has-copilot-drawer");
    options.targetContainer?.classList.remove("is-resizing");
    if (options.targetContainer?.style && typeof options.targetContainer.style.removeProperty === "function") {
      options.targetContainer.style.removeProperty("--copilot-drawer-width");
    }
    if (activePillHandle) {
      activePillHandle.destroy();
      activePillHandle = null;
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
    },
    getExercises: () => [...exercises],
    destroy
  };
}
