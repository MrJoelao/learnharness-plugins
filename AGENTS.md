# Guidelines for AI Coding Agents (LearnHarness Plugins)

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

---

## 🎨 Dual UI Model: Host Widgets vs Plugin Workbench

Plugins render inside LearnHarness. A plugin must **never** feel like a foreign, disjointed third-party app with separate look-and-feel. It must be indistinguishable from native core screens.

LearnHarness uses a **Dual UI Model**:

### 1. Controlled Host UI (`ctx.ui`) — First Choice for Standard Elements
The host application exposes **15 native controlled widgets** via `ctx.ui` (`PluginFrontendContext.ui`). Whenever your plugin needs these capabilities, **always prefer `ctx.ui`** over building custom HTML approximations:

| Component Needed | Native Host Method | Why Use It |
| :--- | :--- | :--- |
| **Modal Dialogs** | `ctx.ui.openDialog(props, { signal })` | Host owns focus trap, Escape key, close button, title, backdrop blur, and nested dialogs. |
| **Context Menus** | `ctx.ui.openMenu(anchor, props, { signal })` | Host owns auto-positioning, collision detection, and Escape dismissal. |
| **Slide-over Surfaces** | `ctx.ui.openSurface(props, { signal })` | Host-level full-page overlay with dimmed/opaque backgrounds. |
| **AI Model Selector** | `ctx.ui.mountModelPicker(container, props, { signal })` | Direct integration with host provider catalog and settings. |
| **Thinking Level** | `ctx.ui.mountThinkingPicker(container, props, { signal })` | Linked to selected model's reasoning capabilities. |
| **Knowledge Sources** | `ctx.ui.mountKnowledgePicker(container, props, { signal })` | Host knowledge collection selector. |
| **Chat / Composer** | `ctx.ui.mountComposer` or `mountStandardComposer` | Native textarea, auto-grow, send/stop state, and dictation. |
| **Markdown Display** | `ctx.ui.mountMarkdown(container, props, { signal })` | Prose styling, KaTeX math, Mermaid diagrams, and code highlighting. |
| **Settings & Forms** | `ctx.ui.mountSettingsRows(container, props, { signal })` | Standard toggles, inputs, dropdowns, numbers, and sliders. |
| **Directory Tree** | `ctx.ui.mountDirectoryTree(container, props, { signal })` | File explorer with indentation, expand/collapse, and icons. |
| **Host Buttons** | `ctx.ui.mountButton(container, props, { signal })` | Standard button variants (`default`, `secondary`, `outline`, `ghost`, `destructive`). |

Every `ctx.ui` call accepts `{ signal: AbortSignal }` and returns a `PluginWidgetHandle` with `.update(partialProps)` and `.dispose()`.

### 2. Custom Plugin Workbench (`shared/plugin-base.css`) — For Canvas & Layout
For plugin-specific pedagogical workspaces (CPU schedulers, memory matrices, thread DAGs, circuit boards), use the shared CSS classes:
- **`.lh-root`**: Root container covering the workspace viewport.
- **`.lh-toolbar`**: 48px action bar for mode tabs, simulation controls (`Step`, `Run`, `Reset`), speed sliders. *(Note: The top-level workspace title is already rendered by the host `<TopBar>`, so do not duplicate the workspace title here).*
- **`.lh-workbench`**: Standard layout splitter containing the main canvas and lateral telemetry panel.
- **`.lh-canvas-container`**: Interactive canvas/SVG area with dark background and native thin scrollbars.
- **`.lh-telemetry-panel`**: 320px sidebar for live metrics, registers, queue states, and parameter cards.
- **`.lh-card`**: Standard container card with hairline border (`var(--border)`) and 12px curvature.
- **`.lh-copilot-container`, `.lh-copilot-pill`, `.lh-copilot-chips`**: Floating AI assistant pill with left-aligned, borderless suggestion chips.

---

## 📐 LearnHarness Mathematical Design System & Tokens

To preserve complete harmony with LearnHarness, follow the exact system tokens:

### 1. 4px Rhythm Spacing Grid
Every margin, padding, height, and gap must be a multiple of 4px:
- Controls: 32px height (standard), 24px (compact/xs).
- Toolbar: 48px minimum height.
- Gaps: 4px, 8px, 12px, 16px, 20px, 24px.
- Padding: 8px, 12px, 16px, 24px.
- 🚫 **Never invent odd pixel values** (`padding: 13px; margin-top: 7px;`).

### 2. The Modular Type Scale
Never invent random `font-size` pixel values. Use the declared ladder:
- **`--text-xs` (11px, line-height 1.4)**: Numbers, memory addresses, telemetry labels, keycaps, badges. *(Minimum legibility floor — never use 10px or 9px!)*
- **`--text-sm` (12.5px, line-height 1.4)**: Secondary labels, button text, toolbar controls.
- **`--text-base` (14px, line-height 1.45)**: Primary body text and form inputs.
- **`--text-lg` (16px, line-height 1.5)**: Teaching reading prose (`--lh-prose-size: 16px; --lh-prose-leading: 1.5;`).
- **`--text-xl` (20px)**, **`--text-2xl` (25px)**, **`--text-3xl` (32px)**: Section and modal headings.

### 3. Font Stacks
- **`var(--font-title)` (`lh-cmu`, Georgia, serif)**: Titles and card headings with `font-weight: var(--lh-heading-weight, 700)` or `900`.
- **`var(--font-mono)` (`JetBrains Mono`, monospace)**: Code, memory offsets, PIDs, registers, metrics (`font-feature-settings: "tnum" 1; font-variant-numeric: tabular-nums`).
- **`var(--font-sans)` / `var(--font-prose)` (`Source Sans 3`, sans-serif)**: Descriptive text, instructions, and standard labels.

### 4. Radii Ladder
- **`--radius-sm: 4px`**: Status dots, badges, keycaps, inner nested chips.
- **`--radius` / `--radius-md: 8px`**: Buttons, inputs, suggestion chips, dropdown items.
- **`--radius-lg: 12px`**: Cards, telemetry containers, copilot pill, dialogs.
- **`--radius-xl: 16px`**: Major outer rounded frames.

### 5. Semantic Color Palette
**Never use hardcoded hex values** in plugin code:
- `--background`: Primary canvas/viewport surface (`#141414` in dark).
- `--card`: Raised containers, panels, toolbars (`#1C1C1C` in dark).
- `--border`: Clean edges and dividers (`#434343` in dark).
- `--accent`: Hover surface (`#2A2A2A` in dark).
- `--primary`: Off-white on dark, dark on light (`#E6E6E6` in dark).
- `--primary-foreground`: Contrast text on primary (`#141414` in dark).
- `--muted-foreground`: Secondary text, metadata, telemetry hints (`#8D8D8D` in dark).
- Status tokens: `--lh-success: #22c55e`, `--lh-warning: #f59e0b`, `--lh-error: #ef4444`.

### 6. The No-Ring Law
LearnHarness strictly enforces:
```css
*:focus, *:focus-visible { outline: none; }
```
Surfaces communicate focus through subtle border color changes (`border-color: var(--primary)`), never glowing outline rings or box-shadow halos.

### 7. Thin Native Scrollbar
Plugins inherit the host's dark thin scrollbar:
```css
scrollbar-width: thin;
scrollbar-color: var(--border) transparent;
```

---

## 🚫 The $unslop Anti-Pattern Checklist (Zero Slop)

Before committing any UI code, verify:
- [ ] **No purple/violet AI gradients**: No `linear-gradient(...)` across cards or backgrounds.
- [ ] **No gradient text**: Text is solid `var(--foreground)` or `var(--primary)`.
- [ ] **No glowing drop shadows**: No `box-shadow: 0 0 25px rgba(...)`.
- [ ] **No decorative sparkles or emojis in buttons**: No `✨ Copilot`, `🚀 Run`. Use clean Lucide icons.
- [ ] **No arbitrary border-radii**: Use 4px, 8px, or 12px.
- [ ] **No redundant titles**: The host TopBar already shows the workspace title. Do not repeat it in `.lh-toolbar`.
- [ ] **No hardcoded dark/light colors**: Always verify the plugin looks balanced in both dark and light modes by using CSS variables.

---

## 🔒 Architectural Guardrails

1. **Zero Host Imports**:
   - 🚫 NEVER import from `@/...`, `@/components`, or `next/*`.
   - Runtime plugins run in an isolated sandbox. Only use standard Web APIs, Node built-ins (in `src/backend.ts`), and declarations from `learnharness-plugin-api` (`file:.sdk`).
2. **Lifecycle Hygiene**:
   - Every `mount` call in a frontend renderer (`registerView`, `registerModeRenderer`, `registerSettings`) **must** listen to `signal.addEventListener("abort", cleanup)` and remove all attached event listeners, intervals, animation frames, and observers.
3. **Deterministic Separation of Concerns**:
   - `src/core/`: Pure, framework-agnostic TypeScript simulation engines and state reducers. Zero DOM dependencies. 100% covered by unit tests.
   - `src/ui/`: DOM view rendering, event listeners, canvas/SVG manipulation.
   - `src/backend.ts`: Server-side registrations, IPC handlers (`ctx.handle(...)`), persistent file storage.

---

## 🚀 Standard Agent Workflow

```bash
# 1. Scaffold plugin with chosen archetype (lab | library | tool):
node scripts/create-plugin.mjs <id> "<Display Name>" --template=lab

# 2. Enter directory and run tests:
cd <id>
npm test

# 3. Implement core engine in src/core/ with 100% test coverage.

# 4. Implement UI using ctx.ui (dialogs, menus, pickers) and shared/plugin-base.css (.lh-*).

# 5. Validate against architecture, lifecycle cleanup, and $unslop rules:
npm run typecheck
npm run validate <id>

# 6. Build standalone bundle:
npm run build

# 7. Install to local LearnHarness instance:
npm run install:plugin <id>
```
