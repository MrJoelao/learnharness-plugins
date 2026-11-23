# LearnHarness Plugin UI/UX Pattern Library ($unslop & Experience First)

> **Experience First**
> 
> When implementation convenience conflicts with user delight, choose delight.
> 
> - Every feature, control, and option must be justified
> - Ship less, ship better (polished experience with three features beats rough one with ten)
> - Prototype before committing (design decisions are cheaper in throwaway HTML than production code)
> - Get the details right (transitions, alignment, spacing, feedback, error states)
> - Tighten the core loop (every feature should serve the central workflow or get out of the way)
> 
> The user is whoever consumes the work. For a UI that is the end user. For a library or an internal API it is the colleague who imports it. The engineer who maintains the code next is a user too. Weigh their experience the same way, and explain impact from their perspective.
> 
> Foundations should serve the experience. Foundational thinking governs the sequence of work. This principle governs the target.

---

This document provides concrete, copy-pasteable patterns for AI agents authoring LearnHarness plugins.

LearnHarness follows a **Dual UI Model**:
1. **Host-Controlled Widgets (`ctx.ui`)**: Native dialogs, menus, surfaces, markdown, composers, and pickers.
2. **Plugin Custom Base (`shared/plugin-base.css`)**: Layout splits, toolbars, workbenches, telemetry, and canvas controls.

---

## 1. Native Modal Dialog Pattern (`ctx.ui.openDialog`)

**ALWAYS prefer `ctx.ui.openDialog` over building custom HTML overlay backdrops.** The host handles backdrop blur, focus trapping, Escape key dismissal, clean header close button, and nested dialog handling automatically.

```ts
import type { PluginUi, PluginWidgetHandle, PluginDialogProps } from "learnharness-plugin-api";

export function openScenarioConfigModal(
  ui: PluginUi,
  signal: AbortSignal,
  onSave: (config: ScenarioConfig) => void
): PluginWidgetHandle<PluginDialogProps> {
  return ui.openDialog({
    title: "Configurazione Scenario OSTEP",
    content(container: HTMLElement, dialogSignal: AbortSignal) {
      const form = document.createElement("div");
      form.className = "flex flex-col gap-3 p-4";

      form.innerHTML = `
        <label class="lh-text-muted font-sans text-xs">Numero di Thread Concorrenti</label>
        <input type="number" id="threads-count" class="lh-input" value="2" min="1" max="8" />

        <label class="lh-text-muted font-sans text-xs">Primitiva di Sincronizzazione</label>
        <select id="sync-primitive" class="lh-select">
          <option value="mutex">Pthread Mutex</option>
          <option value="cv-mesa">Condition Variable (Semantica Mesa)</option>
          <option value="cv-hoare">Condition Variable (Semantica Hoare)</option>
          <option value="semaphore">Semaforo di Dijkstra</option>
        </select>

        <div class="flex justify-end gap-2 mt-4 pt-3 border-t border-border">
          <button type="button" class="lh-btn lh-btn-secondary" id="btn-cancel">Annulla</button>
          <button type="button" class="lh-btn lh-btn-primary" id="btn-apply">Applica Scenario</button>
        </div>
      `;

      container.appendChild(form);

      const cancelBtn = form.querySelector("#btn-cancel") as HTMLButtonElement;
      const applyBtn = form.querySelector("#btn-apply") as HTMLButtonElement;

      // Clean up when dialog closes
      dialogSignal.addEventListener("abort", () => {
        form.remove();
      });

      return () => {
        form.remove();
      };
    },
    onClose() {
      // Optional callback when dialog is closed by user
    }
  }, { signal });
}
```

---

## 2. Action Toolbar Pattern (`.lh-toolbar`)

In LearnHarness workspaces, the host's `<TopBar>` already renders the top-level back navigation, workspace title, and identity badge (`mode · plugin`). 

The plugin's `.lh-toolbar` sits immediately below and hosts **mode tabs, simulation stepper controls, and view toggles**:

```html
<header class="lh-toolbar">
  <!-- Left: Mode / Subsystem Switcher Tabs -->
  <div class="lh-toolbar-group">
    <button type="button" class="lh-btn lh-btn-secondary active" id="tab-memory">Paginazione</button>
    <button type="button" class="lh-btn lh-btn-ghost" id="tab-tlb">TLB Cache</button>
    <button type="button" class="lh-btn lh-btn-ghost" id="tab-multilevel">Multi-Level</button>
  </div>

  <!-- Right: Stepper Controls -->
  <div class="lh-actions">
    <span class="lh-dot lh-dot-success" title="Stato simulazione: Pronto"></span>
    <button type="button" class="lh-btn lh-btn-secondary" id="btn-reset">Reset</button>
    <button type="button" class="lh-btn lh-btn-secondary" id="btn-step">Step</button>
    <button type="button" class="lh-btn lh-btn-primary" id="btn-run">Run</button>
  </div>
</header>
```

---

## 3. Interactive Workbench Splitter (`.lh-workbench`)

For simulators and interactive labs (such as `os-simulator`), use the standard split layout (`lh-canvas-container` + `lh-telemetry-panel`):

```html
<main class="lh-workbench">
  <!-- Left/Center: Visualizer or Interactive Canvas -->
  <section class="lh-canvas-container">
    <div class="lh-card">
      <div class="lh-card-header">
        <h3 class="lh-card-title">Traduzione Indirizzo Fisico</h3>
        <span class="lh-badge lh-mono">VPN 0x04 → PFN 0x12</span>
      </div>
      <!-- SVG, Canvas, or Dynamic Memory Table -->
      <div id="simulation-canvas" style="min-height: 420px;"></div>
    </div>
  </section>

  <!-- Right: Telemetry & Parameter Inspector -->
  <aside class="lh-telemetry-panel">
    <div class="lh-card-header">
      <h3 class="lh-card-title">Parametri & Metriche</h3>
      <span class="lh-badge lh-mono">32-bit</span>
    </div>
    
    <div class="lh-card">
      <span class="lh-text-muted" style="font-size: var(--lh-text-xs, 11px);">TLB Hit Ratio</span>
      <strong class="lh-mono" style="font-size: var(--lh-text-xl, 20px);">87.5%</strong>
    </div>

    <div class="lh-card">
      <span class="lh-text-muted" style="font-size: var(--lh-text-xs, 11px);">Politica di Rimpiazzo</span>
      <select class="lh-select">
        <option value="fifo">FIFO</option>
        <option value="lru">LRU</option>
        <option value="clock">Clock (Second Chance)</option>
      </select>
    </div>
  </aside>
</main>
```

---

## 4. Integrated AI Copilot Pill & Chips (`.lh-copilot-container`)

The standard bottom-docked AI assistant pill with left-aligned, borderless suggestion chips:

```html
<div class="lh-copilot-container">
  <!-- Left-aligned prompt suggestion chips (transparent background, 8px radius) -->
  <div class="lh-copilot-chips">
    <button type="button" class="lh-copilot-chip" data-prompt="Mostrami l'Anomalia di Belàdy">
      Anomalia di Belàdy
    </button>
    <button type="button" class="lh-copilot-chip" data-prompt="Spiega il TLB Hit con ASID">
      TLB & ASID
    </button>
    <button type="button" class="lh-copilot-chip" data-prompt="Simula un Segment Fault">
      Segment Fault Test
    </button>
  </div>

  <!-- Main search/prompt pill (12px radius, hairline border, centered horizontally) -->
  <div class="lh-copilot-pill" role="search">
    <!-- Lucide bot icon -->
    <svg class="size-4 lh-text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 8V4H8"></path>
      <rect width="16" height="12" x="4" y="8" rx="2"></rect>
      <path d="M2 14h2"></path>
      <path d="M20 14h2"></path>
      <path d="M15 13v2"></path>
      <path d="M9 13v2"></path>
    </svg>
    <input 
      type="text" 
      class="lh-copilot-input font-sans" 
      placeholder="Che domanda hai sulla simulazione?" 
    />
    <div class="lh-actions">
      <button type="button" class="lh-btn-icon" title="Aggancia a destra (Drawer)">
        <!-- Lucide panel-right icon -->
      </button>
      <button type="button" class="lh-btn-icon" title="Riduci a icona">
        <!-- Lucide minimize-2 icon -->
      </button>
    </div>
  </div>
</div>
```

---

## 5. Study Hub Floating Action Buttons Pattern

When rendering drawers, modals, or readmes (inspired by the LearnHarness Study Hub plugin modal), **never clutter the top with heavy, redundant title bars**. Instead, float the action buttons in the top-right corner with a frosted glass backdrop:

```html
<!-- Floating actions overlay in top-right corner -->
<div class="copilot-floating-actions lh-no-drag" role="toolbar" aria-label="Azioni pannello">
  <!-- 32px circular pill buttons with frosted glass -->
  <button type="button" class="copilot-btn-floating lh-no-drag" title="Cronologia esercizi">
    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
      <path d="M3 3v5h5"></path>
      <path d="M12 7v5l4 2"></path>
    </svg>
  </button>
  <button type="button" class="copilot-btn-floating lh-no-drag" title="Ripristina a scheda fluttuante">
    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="m6 9 6 6 6-6"></path>
    </svg>
  </button>
  <button type="button" class="copilot-btn-floating lh-no-drag" title="Chiudi assistente">
    <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 6 6 18"></path>
      <path d="m6 6 12 12"></path>
    </svg>
  </button>
</div>
```

```css
/* Floating Action Pills (Study Hub style) */
.copilot-floating-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 6px;
}

.copilot-btn-floating {
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: color-mix(in srgb, var(--background) 80%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  color: var(--muted-foreground);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.copilot-btn-floating:hover {
  background-color: var(--background);
  color: var(--foreground);
  border-color: var(--border);
}

/* Ensure underlying body has padding so text flows under floating buttons */
.copilot-container-drawer .copilot-chat-body {
  padding-top: 52px;
}
```

---

## 6. Resizable Sidebar Pattern (Notes/Drawer Style)

Mirrors the canonical LearnHarness `NotesPanel` resizing pattern:
- Left-edge draggable handle with native Pointer Capture (`setPointerCapture`).
- Clamped between `280px` and `720px` (default `400px`).
- Transitions disabled during active drag (`is-resizing`) to guarantee 60fps tracking without pointer lag.
- Double-click resets to default `400px`.
- Keyboard accessible (`ArrowLeft` +16px, `ArrowRight` -16px, `Home`, `End`).
- Persistent to `localStorage`.

```ts
export function setupDrawerResizer(drawerEl: HTMLElement) {
  const DEFAULT_WIDTH = 400;
  const MIN_WIDTH = 280;
  const MAX_WIDTH = Math.min(720, window.innerWidth - 80);
  const STORAGE_KEY = "lh-os-copilot-width";

  let currentWidth = parseInt(localStorage.getItem(STORAGE_KEY) || String(DEFAULT_WIDTH), 10);
  drawerEl.style.width = `${currentWidth}px`;

  const handle = document.createElement("div");
  handle.className = "copilot-resizer lh-no-drag";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-valuenow", String(currentWidth));
  handle.setAttribute("aria-valuemin", String(MIN_WIDTH));
  handle.setAttribute("aria-valuemax", String(MAX_WIDTH));
  handle.setAttribute("tabindex", "0");

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener("pointerdown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = currentWidth;
    handle.setPointerCapture(e.pointerId);
    drawerEl.classList.add("is-resizing");
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const delta = startX - e.clientX; // Dragging left increases width
    currentWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(startWidth + delta)));
    drawerEl.style.width = `${currentWidth}px`;
    handle.setAttribute("aria-valuenow", String(currentWidth));
  });

  const stopDrag = (e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    handle.releasePointerCapture(e.pointerId);
    drawerEl.classList.remove("is-resizing");
    localStorage.setItem(STORAGE_KEY, String(currentWidth));
  };

  handle.addEventListener("pointerup", stopDrag);
  handle.addEventListener("pointercancel", stopDrag);
  handle.addEventListener("dblclick", () => {
    currentWidth = DEFAULT_WIDTH;
    drawerEl.style.width = `${currentWidth}px`;
    localStorage.setItem(STORAGE_KEY, String(currentWidth));
  });

  handle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") currentWidth = Math.min(MAX_WIDTH, currentWidth + 16);
    else if (e.key === "ArrowRight") currentWidth = Math.max(MIN_WIDTH, currentWidth - 16);
    else if (e.key === "Home") currentWidth = MIN_WIDTH;
    else if (e.key === "End") currentWidth = MAX_WIDTH;
    else return;
    e.preventDefault();
    drawerEl.style.width = `${currentWidth}px`;
    localStorage.setItem(STORAGE_KEY, String(currentWidth));
  });

  drawerEl.appendChild(handle);
}
```

---

## 7. Subtle Hub Focus & Border Treatment (No Stark White)

**Never use `border-color: var(--primary)` on dark backgrounds for focus/hover.** In dark mode, `--primary` is `#E6E6E6` (off-white), resulting in an aggressive white border flash.

Instead, follow the Study Hub standard using CSS `color-mix`:
```css
/* Idle State: restrained hairline border */
.lh-copilot-pill,
.copilot-container-sheet {
  border: 1px solid var(--border);
  transition: border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              background-color 0.2s ease;
}

/* Hover State: subtle deepening with soft elevation */
.lh-copilot-pill:hover,
.copilot-container-sheet:hover {
  border-color: var(--border);
  box-shadow: var(--lh-shadow-lg, 0 12px 30px -10px rgba(0, 0, 0, 0.3));
}

/* Focus-Within State: elegant, layered highlight without glowing rings */
.lh-copilot-pill:focus-within,
.copilot-container-sheet:focus-within {
  border-color: color-mix(in srgb, var(--foreground) 25%, var(--border));
  box-shadow: 0 22px 50px -10px rgba(0, 0, 0, 0.45),
              0 0 0 1px color-mix(in srgb, var(--foreground) 25%, var(--border));
}
```

---

## 8. Electron Window Drag Region & WCO Guardrail

In Electron applications (Linux, Windows, macOS), the top 60px of the window carries `-webkit-app-region: drag` for window movement. 

**If custom interactive elements (floating buttons, header buttons, sliders) render within the top 60px, Chromium will swallow all pointer clicks as window drag operations!**

Always apply:
```css
/* All interactive elements in titlebar / top 60px strips */
.copilot-floating-actions,
.copilot-btn-floating,
.copilot-panel-header button,
.copilot-resizer {
  -webkit-app-region: no-drag !important;
}
```
And add `.lh-wco-gutter` to respect native OS minimize/maximize/close window control buttons on Linux and Windows.

---

## 9. CSS Anti-Slop Checklist for Review

Before submitting or building any plugin:

- [ ] **Native Controlled UI First**: Dialogs use `ctx.ui.openDialog`, menus use `ctx.ui.openMenu`, model pickers use `ctx.ui.mountModelPicker`.
- [ ] **Surface Tokens**: All surfaces use `var(--background)`, `var(--card)`, or `var(--muted)`.
- [ ] **Borders**: Hairline borders use `1px solid var(--border)` or `color-mix`.
- [ ] **Zero Hardcoded Colors**: No hex colors (`#...`) in plugin styling.
- [ ] **No Ring Law**: Focus uses subtle `border-color` changes, never glowing outlines or `outline: auto`.
- [ ] **No Emojis in Buttons**: Use Lucide icons instead of emojis.
- [ ] **Typography Scale**: Adhere to the declared scale: 11px (`--text-xs`), 12.5px (`--text-sm`), 14px (`--text-base`), 16px (`--text-lg` / prose). Never use < 11px!
- [ ] **4px Grid**: Spacings and heights are whole multiples of 4px.
- [ ] **Lifecycle Hygiene**: Listen to `signal.addEventListener("abort", cleanup)` to prevent memory leaks.
- [ ] **No Animation Forwards Lock**: Never use `animation: ... forwards` on properties that later transition dynamically (e.g. `height`, `max-width`).
- [ ] **Electron Drag Hygiene**: Always add `.lh-no-drag` to buttons rendered within the top 60px of the viewport.
