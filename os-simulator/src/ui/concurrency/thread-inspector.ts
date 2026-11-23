import { canThreadStep } from "../../core/concurrency/interleaving.js";
import type { ConcurrencyScenarioState, ThreadContext } from "../../core/concurrency/types.js";
import { createIcon } from "../icons.js";

export function renderThreadInspector(
  container: HTMLElement,
  state: ConcurrencyScenarioState,
  onStepThread: (threadId: string) => void
): void {
  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "thread-inspector-root";

  const threadsGrid = document.createElement("div");
  threadsGrid.className = "threads-grid";

  for (const thread of state.threads) {
    const threadCard = document.createElement("div");
    threadCard.className = `thread-column-card thread-state-${thread.state}`;

    const header = document.createElement("div");
    header.className = "thread-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "thread-title-group";

    const title = document.createElement("h4");
    title.className = "thread-title font-mono tabular-nums";
    title.textContent = thread.id;

    const statePill = document.createElement("span");
    statePill.className = `thread-state-badge badge-${thread.state} font-mono tabular-nums`;
    statePill.textContent = thread.state.toUpperCase();

    titleGroup.append(title, statePill);

    const stepBtn = document.createElement("button");
    stepBtn.className = "btn btn-outline btn-sm font-mono tabular-nums";
    stepBtn.title = `Esegui una microistruzione per ${thread.id}`;
    const stepIcon = createIcon("skip-forward", "size-3.5");
    const stepLabel = document.createElement("span");
    stepLabel.textContent = `Step ${thread.id}`;
    stepBtn.append(stepIcon, stepLabel);

    const canStep = canThreadStep(state, thread.id);
    if (!canStep) {
      stepBtn.disabled = true;
    } else {
      stepBtn.addEventListener("click", () => {
        onStepThread(thread.id);
      });
    }

    header.append(titleGroup, stepBtn);
    threadCard.appendChild(header);

    const registersBar = document.createElement("div");
    registersBar.className = "thread-registers-bar";
    const regEntries = Object.entries(thread.registers);
    if (regEntries.length > 0) {
      for (const [reg, val] of regEntries) {
        const item = document.createElement("div");
        item.className = "register-item";
        item.innerHTML = `<span class="reg-name font-mono">%${reg}:</span> <span class="reg-val font-mono tabular-nums">${val}</span>`;
        registersBar.appendChild(item);
      }
    } else {
      registersBar.innerHTML = `<span class="text-xs text-muted-foreground font-mono">Nessun registro locale</span>`;
    }
    threadCard.appendChild(registersBar);

    const instructionsList = document.createElement("div");
    instructionsList.className = "instructions-list font-mono tabular-nums";

    thread.instructions.forEach((inst, idx) => {
      const row = document.createElement("div");
      const isCurrentPc = idx === thread.programCounter && thread.state !== "terminated";
      const isPast = idx < thread.programCounter || thread.state === "terminated";

      row.className = `instruction-row ${isCurrentPc ? "instruction-active" : isPast ? "instruction-past" : "instruction-future"}`;

      const lineNum = document.createElement("span");
      lineNum.className = "inst-line-num";
      lineNum.textContent = String(idx).padStart(2, "0");

      const instText = document.createElement("span");
      instText.className = "inst-code";
      instText.textContent = inst.label ?? `${inst.op} ${inst.targetVariable ?? inst.syncObject ?? ""}`;

      row.append(lineNum, instText);

      if (isCurrentPc) {
        const pcIndicator = document.createElement("span");
        pcIndicator.className = "pc-indicator font-mono";
        pcIndicator.textContent = "◀ PC";
        row.appendChild(pcIndicator);
      }

      instructionsList.appendChild(row);
    });

    threadCard.appendChild(instructionsList);
    threadsGrid.appendChild(threadCard);
  }

  root.appendChild(threadsGrid);

  const sharedPanel = document.createElement("div");
  sharedPanel.className = "shared-state-panel";

  const sharedHeader = document.createElement("div");
  sharedHeader.className = "section-header";
  const sharedTitle = document.createElement("h4");
  sharedTitle.className = "section-title font-title";
  sharedTitle.textContent = "Memoria Condivisa & Oggetti di Sincronizzazione";
  sharedHeader.appendChild(sharedTitle);
  sharedPanel.appendChild(sharedHeader);

  const sharedContent = document.createElement("div");
  sharedContent.className = "shared-state-content";

  const memBox = document.createElement("div");
  memBox.className = "shared-box";
  const memTitle = document.createElement("div");
  memTitle.className = "shared-box-title";
  memTitle.textContent = "Variabili Condivise (RAM)";
  memBox.appendChild(memTitle);

  const memEntries = Object.entries(state.sharedMemory);
  if (memEntries.length > 0) {
    const memList = document.createElement("div");
    memList.className = "shared-kv-list font-mono tabular-nums";
    for (const [k, v] of memEntries) {
      const row = document.createElement("div");
      row.className = "shared-kv-row";
      row.innerHTML = `<span class="kv-key">${k}:</span> <span class="kv-val">${v}</span>`;
      memList.appendChild(row);
    }
    memBox.appendChild(memList);
  } else {
    memBox.innerHTML += `<div class="text-xs text-muted-foreground font-mono">Nessuna variabile atomica</div>`;
  }
  sharedContent.appendChild(memBox);

  const locksBox = document.createElement("div");
  locksBox.className = "shared-box";
  const locksTitle = document.createElement("div");
  locksTitle.className = "shared-box-title";
  locksTitle.textContent = "Lock Hardware / Mutex";
  locksBox.appendChild(locksTitle);

  const lockEntries = Object.entries(state.locks);
  if (lockEntries.length > 0) {
    const lockList = document.createElement("div");
    lockList.className = "shared-kv-list font-mono tabular-nums";
    for (const [id, lock] of lockEntries) {
      const row = document.createElement("div");
      row.className = "shared-kv-row";
      const heldStr = lock.heldBy ? `Assegnato a ${lock.heldBy}` : "Libero";
      const qStr = lock.waitQueue.length > 0 ? ` [coda: ${lock.waitQueue.join(", ")}]` : "";
      const extra = lock.type === "ticket" ? ` (ticket=${lock.ticket}, turn=${lock.turn})` : "";
      row.innerHTML = `<span class="kv-key">${id}:</span> <span class="kv-val">${heldStr}${extra}${qStr}</span>`;
      lockList.appendChild(row);
    }
    locksBox.appendChild(lockList);
  } else {
    locksBox.innerHTML += `<div class="text-xs text-muted-foreground font-mono">Nessun lock attivo</div>`;
  }
  sharedContent.appendChild(locksBox);

  const semBox = document.createElement("div");
  semBox.className = "shared-box";
  const semTitle = document.createElement("div");
  semTitle.className = "shared-box-title";
  semTitle.textContent = "Semafori di Dijkstra";
  semBox.appendChild(semTitle);

  const semEntries = Object.entries(state.semaphores);
  if (semEntries.length > 0) {
    const semList = document.createElement("div");
    semList.className = "shared-kv-list font-mono tabular-nums";
    for (const [id, sem] of semEntries) {
      const row = document.createElement("div");
      row.className = "shared-kv-row";
      const valClass = sem.value < 0 ? "text-destructive font-bold" : "";
      const qStr = sem.waitQueue.length > 0 ? ` [coda: ${sem.waitQueue.join(", ")}]` : "";
      row.innerHTML = `<span class="kv-key">${id}:</span> <span class="kv-val ${valClass}">val=${sem.value}${qStr}</span>`;
      semList.appendChild(row);
    }
    semBox.appendChild(semList);
  } else {
    semBox.innerHTML += `<div class="text-xs text-muted-foreground font-mono">Nessun semaforo attivo</div>`;
  }
  sharedContent.appendChild(semBox);

  sharedPanel.appendChild(sharedContent);
  root.appendChild(sharedPanel);

  container.appendChild(root);
}
