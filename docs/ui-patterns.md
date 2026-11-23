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

## 5. CSS Anti-Slop Checklist for Review

Before submitting or building any plugin:

- [ ] **Native Controlled UI First**: Dialogs use `ctx.ui.openDialog`, menus use `ctx.ui.openMenu`, model pickers use `ctx.ui.mountModelPicker`.
- [ ] **Surface Tokens**: All surfaces use `var(--background)`, `var(--card)`, or `var(--muted)`.
- [ ] **Borders**: Hairline borders use `1px solid var(--border)`.
- [ ] **Zero Hardcoded Colors**: No hex colors (`#...`) in plugin styling.
- [ ] **No Ring Law**: Focus uses subtle `border-color` changes, never glowing outlines or `outline: auto`.
- [ ] **No Emojis in Buttons**: Use Lucide icons instead of emojis.
- [ ] **Typography Scale**: Adhere to the declared scale: 11px (`--text-xs`), 12.5px (`--text-sm`), 14px (`--text-base`), 16px (`--text-lg` / prose). Never use < 11px!
- [ ] **4px Grid**: Spacings and heights are whole multiples of 4px.
- [ ] **Lifecycle Hygiene**: Listen to `signal.addEventListener("abort", cleanup)` to prevent memory leaks.
