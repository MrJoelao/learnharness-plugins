import type { MlfqConfig, SchedulerTimelineStep } from "../../core/cpu/types.js";

export interface MlfqInspectorProps {
  mlfqConfig: MlfqConfig;
  currentStep?: SchedulerTimelineStep;
  currentTick: number;
}

export function renderMlfqInspector(container: HTMLElement, props: MlfqInspectorProps): void {
  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "cpu-mlfq-container";

  const header = document.createElement("div");
  header.className = "cpu-mlfq-header";

  const title = document.createElement("div");
  title.className = "card-section-title font-title";
  title.textContent = "MLFQ Priority Queues & Allotment Inspector (5 Regole OSTEP)";

  const S = props.mlfqConfig.priorityBoostInterval;
  const ticksUntilBoost = S - (props.currentTick % S);

  const boostBadge = document.createElement("div");
  boostBadge.className = "cpu-boost-badge font-mono tabular-nums";
  boostBadge.textContent = `Regola 5: Priority Boost (S=${S}) tra ${ticksUntilBoost} tick`;

  header.append(title, boostBadge);
  root.appendChild(header);

  const queuesGrid = document.createElement("div");
  queuesGrid.className = "cpu-mlfq-queues-grid";

  const activeQueues = props.currentStep?.mlfqQueues ?? {};

  for (const q of props.mlfqConfig.queues) {
    const queueCard = document.createElement("div");
    queueCard.className = "cpu-mlfq-queue-card";

    const qHeader = document.createElement("div");
    qHeader.className = "cpu-mlfq-queue-header";

    const qTitle = document.createElement("span");
    qTitle.className = "cpu-mlfq-queue-name";
    qTitle.textContent = `Q${q.priority} (Priorità ${q.priority === 0 ? "Massima" : q.priority})`;

    const qParams = document.createElement("span");
    qParams.className = "cpu-mlfq-queue-params font-mono tabular-nums";
    qParams.textContent = `Quantum: ${q.timeSlice}t | Allotment: ${q.allotment}t`;

    qHeader.append(qTitle, qParams);
    queueCard.appendChild(qHeader);

    const procsList = document.createElement("div");
    procsList.className = "cpu-mlfq-proc-strip";

    const procsInQueue = activeQueues[q.priority] ?? [];
    if (procsInQueue.length === 0) {
      const emptySpan = document.createElement("span");
      emptySpan.className = "cpu-mlfq-empty";
      emptySpan.textContent = "Nessun processo in coda";
      procsList.appendChild(emptySpan);
    } else {
      for (const pid of procsInQueue) {
        const procBadge = document.createElement("span");
        const isRunning = props.currentStep?.runningProcessId === pid;
        procBadge.className = `cpu-mlfq-proc-pill font-mono tabular-nums ${isRunning ? "proc-running" : ""}`;
        procBadge.textContent = isRunning ? `${pid} [RUN]` : pid;
        procsList.appendChild(procBadge);
      }
    }

    queueCard.appendChild(procsList);
    queuesGrid.appendChild(queueCard);
  }

  root.appendChild(queuesGrid);
  container.appendChild(root);
}
