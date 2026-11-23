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

## 🎨 UI/UX Craft & The $unslop Standard

Plugins render inside the LearnHarness desktop and web applications. A plugin must **never** look like a foreign, disjointed third-party app. It must feel 100% native to LearnHarness.

To achieve this, every plugin strictly implements the **$unslop** craft principles:

1. **Quiet Chrome, Rich Content**:
   - The chrome (navigation, toolbar, cards, button containers) must stay quiet, neutral, and subdued.
   - All visual richness belongs exclusively to the actual pedagogical subject: an interactive CPU Gantt chart, a virtual memory matrix, a thread interleaving diagram, or a physics canvas.
2. **One Bright Element**:
   - Every screen has at most one primary visual focus that carries accent color. Everything around it is quiet.
3. **Strict Semantic Theme Variables**:
   - **NEVER use hardcoded hex or rgb colors** (`#ffffff`, `#1a1a1a`, `#8b5cf6`).
   - Use host CSS variables exclusively:
     - `--background`: Page background
     - `--card` / `--card-foreground`: Raised workbenches and panel surfaces
     - `--border`: Hairline dividers and outlines (6%–12% opacity)
     - `--primary` / `--primary-foreground`: Primary action button and selection indicators
     - `--muted` / `--muted-foreground`: Secondary surfaces, pill containers, telemetry hints
     - `--radius`, `--radius-lg`: Border curvature tokens
4. **4px Grid Scale**:
   - Spacing, paddings, gaps, and control heights are strictly multiples of 4:
     - Controls: 32px or 36px height (`h-8` or `h-9`)
     - Toolbars: 48px height
     - Gaps: 8px, 12px, 16px, 24px
     - Padding: 12px, 16px, 24px
   - No one-off odd pixel nudges (`mt-[13px]`, `p-[17px]`).
5. **No AI Tells (Zero Slop)**:
   - 🚫 No purple/violet surface gradients (`bg-gradient-to-r from-purple-500 to-indigo-500`).
   - 🚫 No gradient text in headings.
   - 🚫 No glowing neon box shadows (`box-shadow: 0 0 20px rgba(...)`).
   - 🚫 No floating blobs, orbs, or decorative AI sparkles (`✨`).
   - 🚫 No emojis inside buttons or headers (`🚀 Launch`, `💡 Info`). Use host Lucide icon names.
6. **Deliberate Typography Hierarchy**:
   - `var(--font-title)` (`font-title`): Headings, view titles (CMU Serif).
   - `var(--font-mono)` (`font-mono`): Memory addresses, PIDs, registers, metrics (`tabular-nums`).
   - `var(--font-sans)`: Body text, buttons, option labels (Source Sans 3).

---

## 🧩 The Shared Design System (`shared/plugin-base.css`)

All plugins must leverage the shared design system rather than inventing custom button or toolbar styles from scratch:

- **`.lh-root`**: Top-level container.
- **`.lh-toolbar`**: Standard 48px top toolbar with title and action groups.
- **`.lh-btn`**: Base button class (`.lh-btn-primary`, `.lh-btn-secondary`, `.lh-btn-ghost`, `.lh-btn-icon`).
- **`.lh-card`**: Standard container card with hairline border.
- **`.lh-badge`**: Compact status indicator with mono numbers.
- **`.lh-workbench`**: Sdoppiatore standard per canvas principale + pannello telemetria/metriche laterale.
- **`.lh-dialog-overlay` & `.lh-dialog`**: Modali centrate con backdrop blur pulito.
- **`.lh-copilot-container`, `.lh-copilot-pill`, `.lh-copilot-chips`**: Standard AI assistant pill with left-aligned suggestions and docked drawer.

---

## 🔒 Architectural Guardrails

1. **Zero Host Imports**:
   - 🚫 NEVER import from `@/...`, `@/components`, or `next/*`.
   - Runtime plugins run in an isolated sandbox. Only use standard Web APIs, Node built-ins (in `src/backend.ts`), and declarations from `learnharness-plugin-api` (`file:.sdk`).
2. **Lifecycle Hygiene**:
   - Every `mount` call in a frontend renderer (`registerView`, `registerModeRenderer`, `registerSettings`) **must** listen to `signal.addEventListener("abort", cleanup)` and remove all attached event listeners, intervals, and observers.
3. **Deterministic Separation of Concerns**:
   - `src/core/`: Pure, framework-agnostic TypeScript simulation engines and state reducers. Zero DOM dependencies. 100% covered by unit tests.
   - `src/ui/`: DOM view rendering, event listeners, canvas/SVG manipulation.
   - `src/backend.ts`: Server-side registrations, IPC handlers (`ctx.handle(...)`), persistent file storage.

---

## 🚀 Standard Agent Workflow

When asked to create or update a plugin, follow this exact sequence:

```bash
# 1. Scaffold the plugin with the appropriate template archetype:
#    Templates: lab (simulatore interattivo), library (raccolta a schede), tool (workbench singolo)
node scripts/create-plugin.mjs <id> "<Display Name>" --template=lab

# 2. Enter directory and install dependencies:
cd <id>
npm install

# 3. Implement core logic in src/core/ and write pure tests in tests/:
npm test

# 4. Implement UI using shared/plugin-base.css (.lh-*) classes.

# 5. Typecheck and validate against anti-slop rules:
npm run typecheck
npm run validate <id>

# 6. Build the standalone bundle:
npm run build

# 7. Install to local LearnHarness instance:
npm run install:plugin <id>
```
