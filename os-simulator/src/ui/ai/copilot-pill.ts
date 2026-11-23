import { createIcon } from "../icons.js";

export const GRAPH_SEARCH_PLACEHOLDERS = [
  "Che domanda hai sulla simulazione?",
  "Fai una domanda o chiedi un esercizio...",
  "Cosa vorresti verificare?"
] as const;

export function getRandomGraphPlaceholder(): string {
  const idx = Math.floor(Math.random() * GRAPH_SEARCH_PLACEHOLDERS.length);
  return GRAPH_SEARCH_PLACEHOLDERS[idx] ?? GRAPH_SEARCH_PLACEHOLDERS[0];
}

export interface CopilotPillOptions {
  placeholder?: string;
  initialValue?: string;
  onFocusOrInput?: (currentText: string) => void;
  onSubmitPrompt?: (prompt: string) => void;
  onToggleDrawer?: () => void;
  onMinimize?: () => void;
  signal?: AbortSignal;
}

export interface CopilotPillHandle {
  element: HTMLElement;
  inputElement: HTMLInputElement;
  focus: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
  destroy: () => void;
}

export function createCopilotPill(options: CopilotPillOptions = {}): CopilotPillHandle {
  const container = document.createElement("div");
  container.className = "copilot-pill";
  container.setAttribute("role", "search");

  const botIcon = createIcon("bot", "size-4 text-primary shrink-0");
  container.appendChild(botIcon);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "copilot-pill-input font-sans";
  input.placeholder = options.placeholder ?? getRandomGraphPlaceholder();
  if (options.initialValue) {
    input.value = options.initialValue;
  }
  container.appendChild(input);

  const actionsGroup = document.createElement("div");
  actionsGroup.className = "copilot-pill-actions";

  const btnDrawer = document.createElement("button");
  btnDrawer.type = "button";
  btnDrawer.className = "copilot-pill-btn";
  btnDrawer.title = "Aggancia a destra (Drawer)";
  btnDrawer.setAttribute("aria-label", "Aggancia a destra");
  btnDrawer.appendChild(createIcon("panel-right", "size-4 text-muted-foreground"));

  const btnMinimize = document.createElement("button");
  btnMinimize.type = "button";
  btnMinimize.className = "copilot-pill-btn";
  btnMinimize.title = "Minimizza assistente";
  btnMinimize.setAttribute("aria-label", "Minimizza assistente");
  btnMinimize.appendChild(createIcon("minimize-2", "size-4 text-muted-foreground"));

  actionsGroup.append(btnDrawer, btnMinimize);
  container.appendChild(actionsGroup);

  const handleInputInteraction = () => {
    options.onFocusOrInput?.(input.value);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const val = input.value.trim();
      if (val.length > 0) {
        options.onSubmitPrompt?.(val);
      } else {
        options.onFocusOrInput?.("");
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      options.onMinimize?.();
    }
  };

  const handleDrawerClick = (e: MouseEvent) => {
    e?.stopPropagation?.();
    options.onToggleDrawer?.();
  };

  const handleMinimizeClick = (e: MouseEvent) => {
    e?.stopPropagation?.();
    options.onMinimize?.();
  };

  input.addEventListener("focus", handleInputInteraction);
  input.addEventListener("click", handleInputInteraction);
  input.addEventListener("input", handleInputInteraction);
  input.addEventListener("keydown", handleKeyDown);
  btnDrawer.addEventListener("click", handleDrawerClick);
  btnMinimize.addEventListener("click", handleMinimizeClick);

  const destroy = () => {
    input.removeEventListener("focus", handleInputInteraction);
    input.removeEventListener("click", handleInputInteraction);
    input.removeEventListener("input", handleInputInteraction);
    input.removeEventListener("keydown", handleKeyDown);
    btnDrawer.removeEventListener("click", handleDrawerClick);
    btnMinimize.removeEventListener("click", handleMinimizeClick);
    if (options.signal) {
      options.signal.removeEventListener("abort", destroy);
    }
    container.remove();
  };

  if (options.signal) {
    options.signal.addEventListener("abort", destroy, { once: true });
  }

  return {
    element: container,
    inputElement: input,
    focus: () => input.focus(),
    getValue: () => input.value,
    setValue: (val: string) => {
      input.value = val;
    },
    destroy
  };
}
