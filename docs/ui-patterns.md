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

This document provides copy-pasteable HTML/DOM patterns and code structures for AI agents authoring LearnHarness plugins using the **[`shared/plugin-base.css`](../shared/plugin-base.css)** design system.

---

## 1. Top Toolbar Pattern (`.lh-toolbar`)

Every primary view or lab should have a clean, dense 48px header strip:

```html
<header class="lh-toolbar">
  <!-- Left: Identity & Status -->
  <div class="lh-toolbar-title-group">
    <span class="lh-dot lh-dot-success"></span>
    <h2 class="lh-toolbar-title">Memory Virtualization Lab</h2>
    <span class="lh-badge">Active</span>
  </div>

  <!-- Right: Actions -->
  <div class="lh-actions">
    <button type="button" class="lh-btn lh-btn-secondary" id="btn-reset">
      Reset
    </button>
    <button type="button" class="lh-btn lh-btn-secondary" id="btn-step">
      Step
    </button>
    <button type="button" class="lh-btn lh-btn-primary" id="btn-run">
      Run
    </button>
  </div>
</header>
```

---

## 2. Interactive Simulator Workbench (`.lh-workbench`)

For simulators and interactive labs (such as `os-simulator`), use the two-pane layout:

```html
<main class="lh-workbench">
  <!-- Left/Center: Visualizer or Interactive Canvas -->
  <section class="lh-canvas-container">
    <div class="lh-card">
      <div class="lh-card-header">
        <h3 class="lh-card-title">Memory Address Translation</h3>
        <span class="lh-badge lh-mono">VPN 0x04 -> PFN 0x12</span>
      </div>
      <!-- SVG, Canvas, or Visual Table -->
      <div id="simulation-canvas" style="min-height: 380px;"></div>
    </div>
  </section>

  <!-- Right: Telemetry & Parameter Inspector -->
  <aside class="lh-telemetry-panel">
    <div class="lh-card-header">
      <h3 class="lh-card-title">Parametri & Metriche</h3>
    </div>
    
    <div class="lh-card">
      <span class="lh-text-muted" style="font-size: 12px;">TLB Hit Ratio</span>
      <strong class="lh-mono" style="font-size: 20px;">87.5%</strong>
    </div>

    <div class="lh-card">
      <span class="lh-text-muted" style="font-size: 12px;">Politica di Rimpiazzo</span>
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

## 3. Integrated AI Copilot Pill & Chips (`.lh-copilot-container`)

The standard bottom-docked AI assistant pill with left-aligned suggestions:

```html
<div class="lh-copilot-container">
  <!-- Left-aligned prompt suggestion chips -->
  <div class="lh-copilot-chips">
    <button type="button" class="lh-copilot-chip" data-prompt="Mostrami l'Anomalia di Belàdy">
      Anomalia di Belàdy
    </button>
    <button type="button" class="lh-copilot-chip" data-prompt="Spiega il TLB Hit con ASID">
      TLB & ASID
    </button>
    <button type="button" class="lh-copilot-chip" data-prompt="Test di Segment Fault">
      Segment Fault Test
    </button>
  </div>

  <!-- Main search/prompt pill -->
  <div class="lh-copilot-pill" role="search">
    <!-- Lucide bot icon -->
    <svg class="size-4 lh-text-primary shrink-0" ...></svg>
    <input 
      type="text" 
      class="lh-copilot-input" 
      placeholder="Che domanda hai sulla simulazione?" 
    />
    <div class="lh-actions">
      <button type="button" class="lh-btn-icon" title="Espandi assistente">
        <svg class="size-4" ...></svg>
      </button>
    </div>
  </div>
</div>
```

---

## 4. Modal Dialog Pattern (`.lh-dialog`)

```html
<div class="lh-dialog-overlay" id="custom-modal">
  <div class="lh-dialog">
    <div class="lh-dialog-header">
      <h3 class="lh-title" style="font-size: 16px;">Configura Workload</h3>
      <button type="button" class="lh-btn-icon" id="btn-close">✕</button>
    </div>
    
    <div class="lh-dialog-body">
      <label class="lh-text-muted" style="font-size: 12px;">Numero Processi</label>
      <input type="number" class="lh-input" value="3" min="1" max="10" />

      <label class="lh-text-muted" style="font-size: 12px;">Algoritmo di Scheduling</label>
      <select class="lh-select">
        <option value="rr">Round Robin</option>
        <option value="stcf">STCF (Preemptive)</option>
        <option value="mlfq">MLFQ (5 Regole OSTEP)</option>
      </select>
    </div>

    <div class="lh-dialog-footer">
      <button type="button" class="lh-btn lh-btn-secondary" id="btn-cancel">Annulla</button>
      <button type="button" class="lh-btn lh-btn-primary" id="btn-save">Salva e Applica</button>
    </div>
  </div>
</div>
```

---

## 5. CSS Anti-Slop Checklist for Review

Before submitting or building any plugin:

- [ ] All surfaces use `var(--background)`, `var(--card)`, or `var(--muted)`.
- [ ] Borders use `1px solid var(--border)`.
- [ ] No hex colors (`#...`) in `src/styles.css`.
- [ ] No emoji icons used in buttons or headers.
- [ ] Control buttons use `.lh-btn`, `.lh-btn-primary`, `.lh-btn-secondary`, `.lh-btn-icon`.
- [ ] Key metrics and registers use `.lh-mono` with tabular figures.
- [ ] View titles use `.lh-title` (`var(--font-title)`).
- [ ] All spacing is on the 4px grid (8px, 12px, 16px, 24px).
- [ ] Lifecycle cleanup binds to `signal.addEventListener("abort", ...)`.
