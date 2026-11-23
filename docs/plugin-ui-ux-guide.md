# Plugin UI and UX Design Guide (Craft over Slop & Experience First)

> **Experience First**
> 
> When implementation convenience conflicts with user delight, choose delight.
> 
> - **Every feature, control, and option must be justified**
> - **Ship less, ship better** (polished experience with three features beats rough one with ten)
> - **Prototype before committing** (design decisions are cheaper in throwaway HTML than production code)
> - **Get the details right** (transitions, alignment, spacing, feedback, error states)
> - **Tighten the core loop** (every feature should serve the central workflow or get out of the way)
> 
> The user is whoever consumes the work. For a UI that is the end user. For a library or an internal API it is the colleague who imports it. The engineer who maintains the code next is a user too. Weigh their experience the same way, and explain impact from their perspective.
> 
> Foundations should serve the experience. Foundational thinking governs the sequence of work. This principle governs the target.

This guide defines the design, user experience, and visual standards for LearnHarness plugins. Plugins render inside the host application, which provides native dark and light themes, typographic hierarchy, and interaction layers. 

AI coding agents authoring plugins **must** follow these principles and use the shared classes in [`shared/plugin-base.css`](../shared/plugin-base.css) and the native host methods in `ctx.ui` to produce interfaces that look intentionally crafted rather than automatically generated ("vibecoded slop"). See also [`docs/ui-patterns.md`](./ui-patterns.md) for concrete copy-pasteable snippets.

---

## 1. Dual UI Model: Host Controlled Widgets vs Plugin Workbench

LearnHarness plugins operate across two distinct UI layers:

### A. Controlled Host UI (`ctx.ui`) — First Choice for Common UI
The host application exposes **15 native controlled widgets** via `ctx.ui` (`PluginFrontendContext.ui`). Whenever your plugin needs these capabilities, **always prefer `ctx.ui`** over building custom HTML approximations:
- **Modal Dialogs**: `ctx.ui.openDialog(props, { signal })` — The host owns the modal backdrop, focus trapping, Escape key dismissal, title bar, and close button.
- **Context Menus & Popovers**: `ctx.ui.openMenu(anchor, props, { signal })` — Clean popover menus with keyboard navigation and collision-safe positioning.
- **Full-page Slide-over Surfaces**: `ctx.ui.openSurface(props, { signal })` — For non-modal workspace overlays.
- **AI Model & Thinking Pickers**: `ctx.ui.mountModelPicker` and `ctx.ui.mountThinkingPicker` — Directly connected to the user's configured LLMs and reasoning settings.
- **Composer & Prompt Bar**: `ctx.ui.mountComposer` and `ctx.ui.mountStandardComposer` — Standard prompt textarea with auto-grow, busy indicator, send/stop controls, and dictation.
- **Settings Rows & Forms**: `ctx.ui.mountSettingsRows` — Native form controls (toggles, text inputs, dropdowns, number steppers, sliders).
- **Markdown**: `ctx.ui.mountMarkdown` — Host prose styling, KaTeX formulas, Mermaid diagrams, and code highlighting.
- **Directory Tree**: `ctx.ui.mountDirectoryTree` — File hierarchy browser.

### B. Plugin Workbench & Canvas (`shared/plugin-base.css`) — For Pedagogical Subjects
For custom subject-matter visualizers (CPU scheduling Gantt charts, virtual memory matrices, thread DAGs, circuit boards, drawing canvases):
- Use `.lh-root`, `.lh-toolbar`, `.lh-workbench`, `.lh-canvas-container`, `.lh-telemetry-panel`, and `.lh-card`.
- Adhere strictly to the host design tokens detailed below.

---

## 2. Host Theme Tokens and CSS Variables

LearnHarness uses CSS variables that dynamically adapt to the active theme (Dark / Light / Sepia). **Never hardcode hex colors** (such as `#ffffff` or `#111827`) or RGB strings in plugin styles; doing so breaks immediately when the user toggles themes.

### Available Theme Variables

| CSS Variable | Role in LearnHarness | Typical Dark Theme Value |
| :--- | :--- | :--- |
| `--background` | Main page and canvas background | `#141414` |
| `--foreground` | High-contrast primary text and icons | `#e6e6e6` |
| `--card` | Raised containers, panels, toolbars | `#1c1c1c` |
| `--card-foreground` | Text on card surfaces | `#e6e6e6` |
| `--border` | Hairline dividers and container outlines | `#434343` |
| `--primary` | Primary action button, focused indicator | `#e6e6e6` (off-white) |
| `--primary-foreground`| Text inside primary buttons | `#141414` (dark) |
| `--muted` | Subdued surface (pills, secondary containers) | `#1c1c1c` |
| `--muted-foreground` | Secondary labels, timestamps, telemetry hints | `#8d8d8d` |
| `--accent` | Hover states on clickable items | `#2a2a2a` |
| `--accent-foreground` | Text on hover accents | `#e6e6e6` |
| `--destructive` | Destructive actions or errors | `#ef4444` |
| `--lh-success` | Success status dot and badge | `#22c55e` |
| `--lh-warning` | Warning status dot and badge | `#f59e0b` |
| `--lh-error` | Error status dot and badge | `#ef4444` |
| `--radius-sm` | Small curvature (badges, dots, keycaps) | `4px` |
| `--radius` | Standard curvature (buttons, inputs) | `8px` |
| `--radius-lg` | Large curvature (cards, copilot pill, dialogs) | `12px` |
| `--radius-xl` | Frame curvature | `16px` |

---

## 3. The Seven Invariants of LearnHarness Craft

1. **Quiet Chrome, Rich Content**:
   The chrome (toolbars, cards, sidebars) must stay quiet, neutral, and subdued. All visual richness belongs exclusively to the actual pedagogical subject: an interactive CPU Gantt chart, a virtual memory matrix, or a thread DAG.
2. **One Bright Element**:
   Each workspace mode has at most one primary visual focus carrying accent color. Everything around it is quiet.
3. **The No-Ring Law**:
   LearnHarness strictly enforces `*:focus, *:focus-visible { outline: none; }`. Never add glowing outline rings or box-shadow halos. Focus affordance is conveyed solely through clean border color changes (`border-color: var(--primary)`).
4. **4px Grid Scale**:
   Spacing, paddings, gaps, and heights are strictly multiples of 4:
   - Controls: 32px height (standard), 24px (compact/xs).
   - Toolbars: 48px height.
   - Gaps: 8px, 12px, 16px, 24px.
   - Padding: 8px, 12px, 16px, 24px.
   - No one-off odd pixel nudges (`mt-[13px]`, `p-[17px]`).
5. **Declared Modular Type Scale**:
   - `11px` (`--text-xs`, line-height 1.4): Minimum legibility floor. Used for mono numbers, memory addresses, telemetry hints, and badges. Never use < 11px!
   - `12.5px` (`--text-sm`, line-height 1.4): Secondary labels, button text, toolbar controls.
   - `14px` (`--text-base`, line-height 1.45): Primary body text and form inputs.
   - `16px` (`--text-lg`, line-height 1.5): Teaching reading prose (`--lh-prose-size: 16px`).
   - `20px` (`--text-xl`), `25px` (`--text-2xl`), `32px` (`--text-3xl`): Headings.
6. **No AI Tells (Zero Slop)**:
   - 🚫 No purple/violet surface gradients (`linear-gradient(to right, #ec4899, #8b5cf6)`).
   - 🚫 No gradient text in headings.
   - 🚫 No glowing neon box shadows (`box-shadow: 0 0 20px rgba(...)`).
   - 🚫 No floating blobs, orbs, or decorative AI sparkles (`✨`).
   - 🚫 No emojis inside buttons or headers (`🚀 Launch`, `💡 Info`). Use host Lucide icon names.
7. **No Redundant Workspace Titles**:
   The host application's `<TopBar>` already renders the top-level back button, the large workspace title, and the identity pill (`mode · plugin`). The plugin's `.lh-toolbar` must sit directly below and host only sub-mode tabs and action controls (`Step`, `Run`, `Reset`), without repeating the workspace title.

---

## 4. Typography and Copywriting

- **Font Pairing**:
  - `var(--font-title)` (`font-title`): Headings, card titles (uses CMU Serif bold 700/900 in the host).
  - `var(--font-mono)` (`font-mono`): Memory offsets, PIDs, registers, metrics (`JetBrains Mono`, `font-variant-numeric: tabular-nums`).
  - `var(--font-sans)`: Body text, UI labels, options (`Source Sans 3`).
- **Copywriting**:
  - Keep button labels short and active: "Reset", "Step", "Run", "Export JSON" (never "Click here to execute action!").
  - Do not use exclamation points or marketing slogans.
  - Avoid emoji prefixes in button text, category names, or headings.

---

## 5. Lifecycle Hygiene and Clean Unmount

When a workspace mode is closed, navigated away from, or disabled:
- The host passes an `AbortSignal` (`context.signal`).
- Plugins **must** listen to `signal.addEventListener("abort", ...)` or return a cleanup function from their mount function.
- Clean up:
  - Event listeners added to `window` or `document`.
  - Active `setInterval`, `setTimeout`, or `requestAnimationFrame`.
  - `ResizeObserver` or `MutationObserver` instances.
  - Child widget handles via `handle.dispose()`.
- Failing to clean up causes memory leaks, duplicate event triggers, and degraded host performance.
