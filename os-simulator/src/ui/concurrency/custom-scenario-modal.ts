import { parseScenarioConfig } from "../../core/concurrency/types.js";
import type { ConcurrencyScenarioState } from "../../core/concurrency/types.js";
import { createIcon } from "../icons.js";

const DEFAULT_CUSTOM_JSON = JSON.stringify(
  {
    scenarioId: "custom-concurrency",
    name: "Custom Concurrency Scenario",
    description: "Scenario di concorrenza personalizzato creato dall'utente.",
    threads: [
      {
        id: "T1",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "read", targetVariable: "x", register: "eax", label: "mov x, %eax" },
          { op: "add", register: "eax", literal: 1, label: "add $1, %eax" },
          { op: "write", targetVariable: "x", register: "eax", label: "mov %eax, x" }
        ]
      },
      {
        id: "T2",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "read", targetVariable: "x", register: "eax", label: "mov x, %eax" },
          { op: "add", register: "eax", literal: 1, label: "add $1, %eax" },
          { op: "write", targetVariable: "x", register: "eax", label: "mov %eax, x" }
        ]
      }
    ],
    sharedMemory: { x: 0 },
    activeThreadId: "T1",
    locks: {},
    semaphores: {},
    conditionVariables: {}
  },
  null,
  2
);

export function openCustomScenarioModal(
  currentScenario: ConcurrencyScenarioState,
  onApply: (scenario: ConcurrencyScenarioState) => void,
  targetContainer?: HTMLElement,
  signal?: AbortSignal
): () => void {
  if (signal?.aborted) {
    return () => {};
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal-dialog custom-scenario-modal";

  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("h3");
  title.className = "modal-title font-title";
  title.textContent = "Configura Scenario Concorrente Personalizzato";

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn-icon";
  closeBtn.title = "Chiudi";
  closeBtn.appendChild(createIcon("x", "size-4"));
  closeBtn.addEventListener("click", () => cleanup());

  header.append(title, closeBtn);
  modal.appendChild(header);

  const body = document.createElement("div");
  body.className = "modal-body";

  const desc = document.createElement("p");
  desc.className = "text-xs text-muted-foreground mb-3";
  desc.textContent =
    "Definisci lo scenario JSON: thread, registri, sequenza di istruzioni (read, write, add, sub, lock, unlock, wait, signal, sem_wait, sem_post) e memoria condivisa.";
  body.appendChild(desc);

  const textarea = document.createElement("textarea");
  textarea.className = "custom-scenario-textarea font-mono tabular-nums";
  textarea.rows = 16;
  textarea.value = JSON.stringify(
    {
      scenarioId: currentScenario.scenarioId,
      name: currentScenario.name,
      description: currentScenario.description,
      threads: currentScenario.threads,
      sharedMemory: currentScenario.sharedMemory,
      activeThreadId: currentScenario.activeThreadId,
      locks: currentScenario.locks,
      semaphores: currentScenario.semaphores,
      conditionVariables: currentScenario.conditionVariables,
      boundedBuffer: currentScenario.boundedBuffer
    },
    null,
    2
  ) || DEFAULT_CUSTOM_JSON;
  body.appendChild(textarea);

  const errorEl = document.createElement("div");
  errorEl.className = "modal-error-message hidden text-destructive text-xs font-mono mt-2";
  body.appendChild(errorEl);

  modal.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn btn-outline btn-sm";
  resetBtn.textContent = "Ripristina Modello";
  resetBtn.addEventListener("click", () => {
    textarea.value = DEFAULT_CUSTOM_JSON;
    errorEl.classList.add("hidden");
  });

  const btnGroup = document.createElement("div");
  btnGroup.className = "flex items-center gap-2";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-outline btn-sm";
  cancelBtn.textContent = "Annulla";
  cancelBtn.addEventListener("click", () => cleanup());

  const applyBtn = document.createElement("button");
  applyBtn.className = "btn btn-primary btn-sm";
  applyBtn.textContent = "Carica Scenario";
  applyBtn.addEventListener("click", () => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(textarea.value);
    } catch (err) {
      errorEl.textContent = `Errore di sintassi JSON: ${err instanceof Error ? err.message : String(err)}`;
      errorEl.classList.remove("hidden");
      return;
    }

    const validation = parseScenarioConfig(parsedJson);
    if (!validation.success) {
      errorEl.textContent = `Errore di validazione: ${validation.error}`;
      errorEl.classList.remove("hidden");
      return;
    }

    onApply(validation.data);
    cleanup();
  });

  btnGroup.append(cancelBtn, applyBtn);
  footer.append(resetBtn, btnGroup);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  const parent = targetContainer ?? document.body;
  parent.appendChild(overlay);

  let isCleanedUp = false;
  const abortHandler = () => {
    cleanup();
  };
  if (signal) {
    signal.addEventListener("abort", abortHandler, { once: true });
  }

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") cleanup();
  };
  window.addEventListener("keydown", keyHandler);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cleanup();
  });

  function cleanup() {
    if (isCleanedUp) return;
    isCleanedUp = true;
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
    window.removeEventListener("keydown", keyHandler);
    overlay.remove();
  }

  return cleanup;
}
