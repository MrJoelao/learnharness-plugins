import type {
  CopilotUiMode,
  CopilotMessage,
  CopilotPromptChip,
  CopilotDrawerOptions
} from "./types.js";
import { getOstepPromptChips } from "./types.js";
import { createCopilotPill, type CopilotPillHandle, getRandomGraphPlaceholder } from "./copilot-pill.js";
import { openExerciseHistoryModal } from "./exercise-history-modal.js";
import { createIcon } from "../icons.js";
import type { SavedExercise, AiTurnRequest, AiTurnResponse } from "../../types/ai.js";
import { handleAiTurn } from "../../backend/ai-service.js";
import type { PluginBackendContext } from "learnharness-plugin-api";

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
  container.className = "copilot-markdown-content";

  const lines = text.split("\n");
  let currentList: HTMLUListElement | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
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
  let lastExpandedState: "sheet" | "drawer" = "sheet";
  let exercises: SavedExercise[] = options.initialExercises ? [...options.initialExercises] : [];
  let messages: CopilotMessage[] = [];
  let isThinking = false;
  let isClosing = false;
  let activePillHandle: CopilotPillHandle | null = null;
  let historyModalCloseFn: (() => void) | null = null;
  let suggestionsEnabled = true;
  let activePromptChips: readonly CopilotPromptChip[] = getOstepPromptChips(options.mode);
  let isDestroyed = false;

  async function refreshSuggestions(): Promise<void> {
    if (!options.loadSuggestions) return;
    try {
      const result = await options.loadSuggestions(options.mode);
      if (isDestroyed) return;
      suggestionsEnabled = Boolean(result.enabled);
      activePromptChips = Array.isArray(result.chips) ? result.chips : [];
      if (currentState === "pill" || currentState === "sheet" || currentState === "drawer") {
        const carried = currentState === "pill" ? activePillHandle?.getValue() : composerInputEl?.value;
        render(carried);
      }
    } catch {
      // Keep current/fallback chips on transient error
    }
  }

  const unsubscribeSettings = options.onSettingsChanged
    ? options.onSettingsChanged(() => {
        void refreshSuggestions();
      })
    : null;

  const rootEl = document.createElement("div");
  rootEl.className = "copilot-root";
  (options.targetContainer ?? document.body).appendChild(rootEl);

  function updateQuadroCenter(): void {
    const target = options.targetContainer ?? document.body;
    if (!target || typeof target.getBoundingClientRect !== "function") {
      if (rootEl.style && typeof rootEl.style.setProperty === "function") {
        rootEl.style.setProperty("--quadro-center-x", "50%");
      }
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width > 0) {
      const centerX = rect.left + rect.width / 2;
      if (rootEl.style && typeof rootEl.style.setProperty === "function") {
        rootEl.style.setProperty("--quadro-center-x", `${centerX}px`);
      }
    } else {
      if (rootEl.style && typeof rootEl.style.setProperty === "function") {
        rootEl.style.setProperty("--quadro-center-x", "50%");
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

    let finished = false;
    const onDone = () => {
      if (finished) return;
      finished = true;
      panel.removeEventListener("animationend", onDone);
      isClosing = false;
      transitionTo(nextMode);
    };

    panel.addEventListener("animationend", onDone, { once: true });
    setTimeout(onDone, 200);
  }

  const globalKeyDownHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (currentState === "sheet" || currentState === "drawer") {
        e.preventDefault();
        closeWithAnimation("pill");
      }
    }
  };
  window.addEventListener("keydown", globalKeyDownHandler);

  function transitionTo(nextState: CopilotUiMode, carriedInput?: string) {
    if (nextState === currentState && !carriedInput) return;
    if (currentState === "sheet" || currentState === "drawer") {
      lastExpandedState = currentState;
    }
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
        const dummyCtx = {} as PluginBackendContext;
        response = await handleAiTurn(dummyCtx, turnRequest);
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
      signal: options.signal
    });
  }

  function render(carriedInput?: string) {
    if (activePillHandle) {
      activePillHandle.destroy();
      activePillHandle = null;
    }
    rootEl.innerHTML = "";

    if (currentState === "drawer") {
      options.targetContainer?.classList.add("has-copilot-drawer");
    } else {
      options.targetContainer?.classList.remove("has-copilot-drawer");
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
    pillWrapper.className = "copilot-container-pill";

    activePillHandle = createCopilotPill({
      initialValue: initialText,
      placeholder: getRandomGraphPlaceholder(),
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

    if (suggestionsEnabled && activePromptChips.length > 0) {
      const chipsStrip = document.createElement("div");
      chipsStrip.className = "copilot-prompt-chips-strip copilot-prompt-chips-strip-pill";

      for (const chip of activePromptChips) {
        const chipBtn = document.createElement("button");
        chipBtn.type = "button";
        chipBtn.className = "copilot-prompt-chip font-sans";
        chipBtn.textContent = chip.label;
        chipBtn.title = chip.prompt;
        chipBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          transitionTo("sheet", chip.prompt);
        });
        chipsStrip.appendChild(chipBtn);
      }
      pillWrapper.appendChild(chipsStrip);
    }

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
    const panel = document.createElement("div");
    panel.className =
      layoutMode === "sheet" ? "copilot-container-sheet" : "copilot-container-drawer";

    const header = document.createElement("div");
    header.className = "copilot-panel-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "copilot-header-title-group";

    const botIcon = createIcon("bot", "size-4 text-primary shrink-0");
    const titleText = document.createElement("span");
    titleText.className = "copilot-header-title font-title font-semibold";
    titleText.textContent = "Assistente OS";

    const modeBadge = document.createElement("span");
    modeBadge.className = "copilot-badge copilot-badge-mode font-mono text-xs";
    modeBadge.textContent = options.mode;

    titleGroup.append(botIcon, titleText, modeBadge);

    const actionsGroup = document.createElement("div");
    actionsGroup.className = "copilot-header-actions";

    const btnHistory = document.createElement("button");
    btnHistory.type = "button";
    btnHistory.className = "btn-icon copilot-btn-history";
    btnHistory.title = "Cronologia Esercizi";
    btnHistory.setAttribute("aria-label", "Cronologia Esercizi");
    btnHistory.appendChild(createIcon("history", "size-4 text-muted-foreground"));
    btnHistory.addEventListener("click", () => openHistory());

    const btnDockToggle = document.createElement("button");
    btnDockToggle.type = "button";
    btnDockToggle.className = "btn-icon copilot-btn-dock";
    if (layoutMode === "sheet") {
      btnDockToggle.title = "Aggancia a destra (Drawer)";
      btnDockToggle.setAttribute("aria-label", "Aggancia a destra");
      btnDockToggle.appendChild(createIcon("panel-right", "size-4 text-muted-foreground"));
      btnDockToggle.addEventListener("click", () => transitionTo("drawer"));
    } else {
      btnDockToggle.title = "Aggancia in basso (Sheet)";
      btnDockToggle.setAttribute("aria-label", "Aggancia in basso");
      btnDockToggle.appendChild(createIcon("chevron-down", "size-4 text-muted-foreground"));
      btnDockToggle.addEventListener("click", () => transitionTo("sheet"));
    }

    const btnCollapse = document.createElement("button");
    btnCollapse.type = "button";
    btnCollapse.className = "btn-icon copilot-btn-collapse";
    btnCollapse.title = "Riduci a pillola";
    btnCollapse.setAttribute("aria-label", "Riduci a pillola");
    btnCollapse.appendChild(createIcon("minimize-2", "size-4 text-muted-foreground"));
    btnCollapse.addEventListener("click", () => closeWithAnimation("pill"));

    const btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "btn-icon copilot-btn-close";
    btnClose.title = "Minimizza";
    btnClose.setAttribute("aria-label", "Minimizza assistente");
    btnClose.appendChild(createIcon("x", "size-4 text-muted-foreground"));
    btnClose.addEventListener("click", () => closeWithAnimation("pill"));

    actionsGroup.append(btnHistory, btnDockToggle, btnCollapse, btnClose);
    header.append(titleGroup, actionsGroup);
    panel.appendChild(header);

    chatBodyEl = document.createElement("div");
    chatBodyEl.className = "copilot-chat-body";
    panel.appendChild(chatBodyEl);

    if (suggestionsEnabled && activePromptChips.length > 0) {
      const chipsStrip = document.createElement("div");
      chipsStrip.className = "copilot-prompt-chips-strip";

      for (const chip of activePromptChips) {
        const chipBtn = document.createElement("button");
        chipBtn.type = "button";
        chipBtn.className = "copilot-prompt-chip font-sans";
        chipBtn.textContent = chip.label;
        chipBtn.title = chip.prompt;
        chipBtn.addEventListener("click", () => {
          if (composerInputEl) {
            composerInputEl.value = chip.prompt;
            composerInputEl.focus();
          }
        });
        chipsStrip.appendChild(chipBtn);
      }
      panel.appendChild(chipsStrip);
    }

    const composer = document.createElement("div");
    composer.className = "copilot-composer";

    composerInputEl = document.createElement("textarea");
    composerInputEl.className = "copilot-composer-input font-sans";
    composerInputEl.placeholder = "Fai una domanda o chiedi un esercizio... [Invio per inviare]";
    composerInputEl.rows = 2;
    if (carriedInput) {
      composerInputEl.value = carriedInput;
    }

    composerInputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = composerInputEl?.value ?? "";
        if (composerInputEl) {
          composerInputEl.value = "";
        }
        handleSendPrompt(text);
      }
    });

    const composerActions = document.createElement("div");
    composerActions.className = "copilot-composer-actions";

    composerSendBtn = document.createElement("button");
    composerSendBtn.type = "button";
    composerSendBtn.className = "btn btn-primary btn-sm copilot-btn-send";
    composerSendBtn.setAttribute("aria-label", "Invia");
    composerSendBtn.append(createIcon("send", "size-4"), document.createTextNode("Invia"));
    composerSendBtn.addEventListener("click", () => {
      const text = composerInputEl?.value ?? "";
      if (composerInputEl) {
        composerInputEl.value = "";
      }
      handleSendPrompt(text);
    });

    composerActions.appendChild(composerSendBtn);
    composer.append(composerInputEl, composerActions);
    panel.appendChild(composer);

    rootEl.appendChild(panel);

    renderChatBody();
    renderComposerState();

    setTimeout(() => {
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
        <p class="font-semibold text-foreground">Assistente Didattico basato su OSTEP</p>
        <p class="text-xs mt-1">Seleziona un prompt consigliato qui sopra oppure fai una domanda sulla teoria e simulazione attiva.</p>
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

      const sparklesIcon = createIcon("sparkles", "size-4 text-primary animate-spin");
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
      if (isThinking) {
        composerSendBtn.textContent = "Elaborazione...";
      } else {
        composerSendBtn.innerHTML = "";
        composerSendBtn.append(createIcon("send", "size-4"), document.createTextNode("Invia"));
      }
    }
  }

  render();
  void refreshSuggestions();

  const destroy = () => {
    isDestroyed = true;
    unsubscribeSettings?.();
    window.removeEventListener("keydown", globalKeyDownHandler);
    window.removeEventListener("resize", updateQuadroCenter);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    options.targetContainer?.classList.remove("has-copilot-drawer");
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
