import { createIcon } from "../icons.js";

export interface UndoBannerOptions {
  message: string;
  onUndo: () => void;
  onDismiss?: () => void;
  targetContainer?: HTMLElement;
  signal?: AbortSignal;
  autoDismissMs?: number;
}

export function showUndoBanner(options: UndoBannerOptions): () => void {
  const container = options.targetContainer ?? document.body;

  // Remove any existing undo banner in the target container
  const existing = container.querySelector(".copilot-undo-banner");
  if (existing) {
    existing.remove();
  }

  const banner = document.createElement("div");
  banner.className = "copilot-undo-banner";

  const contentGroup = document.createElement("div");
  contentGroup.className = "copilot-undo-banner-title font-sans";

  const botIcon = createIcon("bot", "size-4 text-primary shrink-0");
  const textSpan = document.createElement("span");
  textSpan.className = "copilot-undo-banner-text";
  textSpan.textContent = options.message;

  contentGroup.append(botIcon, textSpan);

  const actionsGroup = document.createElement("div");
  actionsGroup.className = "copilot-undo-banner-actions";

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "btn btn-outline btn-sm font-sans flex items-center gap-1.5 copilot-undo-btn";
  const undoLabel = document.createElement("span");
  undoLabel.textContent = "Annulla (Undo)";
  undoBtn.append(createIcon("rotate-ccw", "size-3.5"), undoLabel);
  undoBtn.addEventListener("click", () => {
    options.onUndo();
    cleanup();
  });

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.className = "btn-icon copilot-undo-dismiss-btn";
  dismissBtn.setAttribute("aria-label", "Chiudi notifica");
  dismissBtn.appendChild(createIcon("x", "size-3.5 text-muted-foreground"));
  dismissBtn.addEventListener("click", () => {
    options.onDismiss?.();
    cleanup();
  });

  actionsGroup.append(undoBtn, dismissBtn);
  banner.append(contentGroup, actionsGroup);
  container.appendChild(banner);

  let timerId: ReturnType<typeof setTimeout> | null = null;
  if (options.autoDismissMs && options.autoDismissMs > 0) {
    timerId = setTimeout(() => {
      cleanup();
    }, options.autoDismissMs);
  }

  const handleAbort = () => {
    cleanup();
  };

  if (options.signal) {
    options.signal.addEventListener("abort", handleAbort, { once: true });
  }

  function cleanup() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (options.signal) {
      options.signal.removeEventListener("abort", handleAbort);
    }
    banner.remove();
  }

  return cleanup;
}
