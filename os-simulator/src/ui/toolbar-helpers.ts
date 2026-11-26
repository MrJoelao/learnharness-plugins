import type { PluginMenuItem, PluginUi } from "learnharness-plugin-api";
import { createIcon } from "./icons.ts";

export interface ToolbarMenuOptions {
  anchor: HTMLElement;
  items: PluginMenuItem[];
  label?: string;
  ui?: PluginUi;
  signal: AbortSignal;
}

const activeFallbackMenus = new WeakMap<HTMLElement, () => void>();

/**
 * Return the caller's AbortSignal with a no-op cleanup, or create a view-scoped
 * AbortController when none is provided.
 */
export function ensureAbortSignal(signal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  if (signal) {
    return { signal, cleanup: () => {} };
  }
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cleanup: () => controller.abort(),
  };
}

/**
 * Open a toolbar menu via the host `PluginUi.openMenu` when available, or fall
 * back to an accessible `.preset-menu-popover` with AbortSignal-scoped cleanup.
 */
export function openToolbarMenu(options: ToolbarMenuOptions): void {
  const { anchor, items, label, ui, signal } = options;
  if (signal.aborted) {
    return;
  }

  if (ui?.openMenu) {
    ui.openMenu(
      anchor,
      {
        items,
        label,
        preferredSide: "down",
      },
      { signal }
    );
    return;
  }

  const existingClose = activeFallbackMenus.get(anchor);
  if (existingClose) {
    existingClose();
    return;
  }

  const hostContainer = anchor.parentElement ?? document.body;
  for (const existing of hostContainer.querySelectorAll(".preset-menu-popover")) {
    existing.remove();
  }

  const menuController = new AbortController();
  const popover = document.createElement("div");
  popover.className = "preset-menu-popover lh-no-drag";
  popover.setAttribute("role", "menu");
  if (label) {
    popover.setAttribute("aria-label", label);
  }

  const close = (): void => {
    if (activeFallbackMenus.get(anchor) === close) {
      activeFallbackMenus.delete(anchor);
    }
    popover.remove();
    signal.removeEventListener("abort", close);
    menuController.abort();
  };

  activeFallbackMenus.set(anchor, close);
  signal.addEventListener("abort", close, { once: true });

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-menu-item";
    btn.setAttribute("role", "menuitem");
    btn.disabled = Boolean(item.disabled);

    const nameSpan = document.createElement("span");
    nameSpan.className = "preset-name";
    nameSpan.textContent = item.label;
    btn.appendChild(nameSpan);

    btn.addEventListener(
      "click",
      () => {
        if (item.disabled) return;
        close();
        void item.onSelect();
      },
      { signal: menuController.signal }
    );

    popover.appendChild(btn);
  }

  hostContainer.appendChild(popover);

  document.addEventListener(
    "click",
    (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && !popover.contains(target) && !anchor.contains(target)) {
        close();
      }
    },
    { signal: menuController.signal }
  );

  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        anchor.focus();
      }
    },
    { signal: menuController.signal }
  );
}

/**
 * Prepend a dismissible `.lh-error-banner` inside `container`, replacing any
 * existing error banner and cleaning up listeners on dismiss or signal abort.
 */
export function showErrorBanner(
  container: HTMLElement,
  message: string,
  signal: AbortSignal
): void {
  if (signal.aborted) {
    return;
  }

  for (const existing of container.querySelectorAll(".lh-error-banner")) {
    existing.remove();
  }

  const bannerController = new AbortController();
  const banner = document.createElement("div");
  banner.className = "lh-error-banner";
  banner.setAttribute("role", "alert");

  const icon = createIcon("alert-circle", "size-4");
  const text = document.createElement("span");
  text.textContent = message;
  text.style.flex = "1";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "lh-no-drag";
  closeBtn.setAttribute("aria-label", "Dismiss error");
  closeBtn.style.background = "transparent";
  closeBtn.style.border = "none";
  closeBtn.style.color = "inherit";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.padding = "4px";
  closeBtn.style.display = "inline-flex";
  closeBtn.style.alignItems = "center";
  closeBtn.style.justifyContent = "center";
  closeBtn.style.borderRadius = "var(--radius-sm, 4px)";
  closeBtn.appendChild(createIcon("x", "size-3.5"));

  const dismiss = (): void => {
    banner.remove();
    signal.removeEventListener("abort", dismiss);
    bannerController.abort();
  };

  closeBtn.addEventListener("click", dismiss, { signal: bannerController.signal });
  signal.addEventListener("abort", dismiss, { once: true });

  banner.append(icon, text, closeBtn);
  container.prepend(banner);
}
