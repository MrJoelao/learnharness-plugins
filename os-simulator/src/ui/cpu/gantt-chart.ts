import type { SchedulerTimelineStep } from "../../core/cpu/types.js";
import { createIcon } from "../icons.js";

const PROCESS_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--primary)"
];

export function getProcessColor(processId: string, processIds: string[]): string {
  const fallback = "var(--primary)";
  const idx = processIds.indexOf(processId);
  if (idx >= 0) {
    return PROCESS_COLORS[idx % PROCESS_COLORS.length] ?? fallback;
  }
  let hash = 0;
  for (let i = 0; i < processId.length; i++) {
    hash = (hash << 5) - hash + processId.charCodeAt(i);
    hash |= 0;
  }
  return PROCESS_COLORS[Math.abs(hash) % PROCESS_COLORS.length] ?? fallback;
}

export interface GanttChartProps {
  timeline: SchedulerTimelineStep[];
  currentTick: number;
  isPlaying: boolean;
  playbackSpeed: number;
  processIds: string[];
  onTickChange: (tick: number) => void;
  onPlayToggle: () => void;
  onReset: () => void;
}

export function renderGanttChart(container: HTMLElement, props: GanttChartProps): void {
  container.innerHTML = "";

  const chartRoot = document.createElement("div");
  chartRoot.className = "cpu-gantt-container";

  // Control bar
  const controlBar = document.createElement("div");
  controlBar.className = "cpu-playback-bar";

  const buttonsGroup = document.createElement("div");
  buttonsGroup.className = "playback-buttons-group";

  // Reset
  const resetBtn = document.createElement("button");
  resetBtn.className = "btn-icon";
  resetBtn.title = "Riavvia all'inizio (Tick 0)";
  resetBtn.appendChild(createIcon("skip-back", "size-4"));
  resetBtn.addEventListener("click", () => props.onReset());

  // Step back
  const stepBackBtn = document.createElement("button");
  stepBackBtn.className = "btn-icon";
  stepBackBtn.title = "Indietro di 1 tick";
  stepBackBtn.disabled = props.currentTick <= 0;
  stepBackBtn.appendChild(createIcon("chevron-left", "size-4"));
  stepBackBtn.addEventListener("click", () => {
    if (props.currentTick > 0) {
      props.onTickChange(props.currentTick - 1);
    }
  });

  // Play / Pause
  const playBtn = document.createElement("button");
  playBtn.className = "btn btn-primary";
  playBtn.title = props.isPlaying ? "Pausa" : "Riproduci";
  playBtn.appendChild(createIcon(props.isPlaying ? "pause" : "play", "size-4"));
  const playLabel = document.createElement("span");
  playLabel.textContent = props.isPlaying ? "Pausa" : "Play";
  playBtn.appendChild(playLabel);
  playBtn.addEventListener("click", () => props.onPlayToggle());

  // Step forward
  const maxTick = Math.max(0, props.timeline.length - 1);
  const stepFwdBtn = document.createElement("button");
  stepFwdBtn.className = "btn-icon";
  stepFwdBtn.title = "Avanti di 1 tick";
  stepFwdBtn.disabled = props.currentTick >= maxTick;
  stepFwdBtn.appendChild(createIcon("chevron-right", "size-4"));
  stepFwdBtn.addEventListener("click", () => {
    if (props.currentTick < maxTick) {
      props.onTickChange(props.currentTick + 1);
    }
  });

  buttonsGroup.append(resetBtn, stepBackBtn, playBtn, stepFwdBtn);

  // Scrubber slider
  const scrubberGroup = document.createElement("div");
  scrubberGroup.className = "playback-scrubber-group";

  const scrubber = document.createElement("input");
  scrubber.type = "range";
  scrubber.className = "cpu-scrubber-slider";
  scrubber.min = "0";
  scrubber.max = String(maxTick);
  scrubber.value = String(props.currentTick);
  scrubber.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    props.onTickChange(Number(target.value));
  });

  const tickDisplay = document.createElement("span");
  tickDisplay.className = "cpu-tick-badge font-mono tabular-nums";
  tickDisplay.textContent = `Tick ${props.currentTick} / ${maxTick}`;

  scrubberGroup.append(scrubber, tickDisplay);
  controlBar.append(buttonsGroup, scrubberGroup);
  chartRoot.appendChild(controlBar);

  // Current Step Event Banner
  const currentStep = props.timeline[props.currentTick];
  if (currentStep) {
    const eventBanner = document.createElement("div");
    eventBanner.className = "cpu-event-banner";

    const titleDiv = document.createElement("div");
    titleDiv.className = "cpu-event-title";
    titleDiv.textContent = currentStep.eventDescription;

    const queuesDiv = document.createElement("div");
    queuesDiv.className = "cpu-event-details font-mono tabular-nums";

    const readyText = currentStep.readyQueue.length > 0
      ? `Ready: [${currentStep.readyQueue.join(", ")}]`
      : "Ready: [vuota]";

    const blockedText = currentStep.blockedQueue.length > 0
      ? `Blocked: [${currentStep.blockedQueue.map((b) => `${b.id}:${b.remainingIo}t`).join(", ")}]`
      : "Blocked: [vuota]";

    queuesDiv.textContent = `${readyText} | ${blockedText}`;
    eventBanner.append(titleDiv, queuesDiv);
    chartRoot.appendChild(eventBanner);
  }

  // Gantt Matrix
  const ganttSection = document.createElement("div");
  ganttSection.className = "cpu-gantt-matrix-card";

  const header = document.createElement("div");
  header.className = "card-section-title font-title";
  header.textContent = "Gantt Execution Timeline (One Bright Element)";
  ganttSection.appendChild(header);

  const scrollWrapper = document.createElement("div");
  scrollWrapper.className = "cpu-gantt-scroll-wrapper";

  const table = document.createElement("table");
  table.className = "cpu-gantt-table";

  // Table Head: Ticks 0..maxTick
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const cornerTh = document.createElement("th");
  cornerTh.className = "cpu-gantt-corner-header font-mono tabular-nums";
  cornerTh.textContent = "Processo";
  headRow.appendChild(cornerTh);

  for (let t = 0; t <= maxTick; t++) {
    const th = document.createElement("th");
    th.className = `cpu-gantt-tick-header font-mono tabular-nums ${t === props.currentTick ? "tick-current" : ""}`;
    th.textContent = String(t);
    th.addEventListener("click", () => props.onTickChange(t));
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Table Body: One row per process + Overall CPU row
  const tbody = document.createElement("tbody");

  // Summary row (Overall CPU)
  const cpuRow = document.createElement("tr");
  cpuRow.className = "cpu-gantt-summary-row";
  const cpuRowHeader = document.createElement("td");
  cpuRowHeader.className = "cpu-gantt-row-label font-mono tabular-nums";
  cpuRowHeader.textContent = "CPU";
  cpuRow.appendChild(cpuRowHeader);

  for (let t = 0; t <= maxTick; t++) {
    const step = props.timeline[t];
    const td = document.createElement("td");
    td.className = `cpu-gantt-cell ${t === props.currentTick ? "cell-current-scrubber" : ""}`;
    td.addEventListener("click", () => props.onTickChange(t));

    if (step && step.runningProcessId) {
      const color = getProcessColor(step.runningProcessId, props.processIds);
      const block = document.createElement("div");
      block.className = "cpu-gantt-block cpu-running font-mono tabular-nums";
      block.style.backgroundColor = color;
      block.textContent = step.runningProcessId;
      td.appendChild(block);
    } else {
      const idleBlock = document.createElement("div");
      idleBlock.className = "cpu-gantt-block cpu-idle font-mono tabular-nums";
      idleBlock.textContent = "idle";
      td.appendChild(idleBlock);
    }
    cpuRow.appendChild(td);
  }
  tbody.appendChild(cpuRow);

  // Rows per process
  for (const procId of props.processIds) {
    const row = document.createElement("tr");
    const rowHeader = document.createElement("td");
    rowHeader.className = "cpu-gantt-row-label font-mono tabular-nums";

    const colorDot = document.createElement("span");
    colorDot.className = "process-color-dot";
    colorDot.style.backgroundColor = getProcessColor(procId, props.processIds);

    const labelSpan = document.createElement("span");
    labelSpan.textContent = procId;

    rowHeader.append(colorDot, labelSpan);
    row.appendChild(rowHeader);

    for (let t = 0; t <= maxTick; t++) {
      const step = props.timeline[t];
      const td = document.createElement("td");
      td.className = `cpu-gantt-cell ${t === props.currentTick ? "cell-current-scrubber" : ""}`;
      td.addEventListener("click", () => props.onTickChange(t));

      if (step) {
        if (step.runningProcessId === procId) {
          const block = document.createElement("div");
          block.className = "cpu-gantt-block cpu-running font-mono tabular-nums";
          block.style.backgroundColor = getProcessColor(procId, props.processIds);
          block.textContent = "CPU";
          td.appendChild(block);
        } else if (step.blockedQueue.some((b) => b.id === procId)) {
          const block = document.createElement("div");
          block.className = "cpu-gantt-block cpu-blocked font-mono tabular-nums";
          block.textContent = "I/O";
          td.appendChild(block);
        } else if (step.readyQueue.includes(procId) || (step.mlfqQueues && Object.values(step.mlfqQueues).some((q) => q.includes(procId)))) {
          const block = document.createElement("div");
          block.className = "cpu-gantt-block cpu-ready font-mono tabular-nums";
          block.textContent = "wait";
          td.appendChild(block);
        }
      }
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  scrollWrapper.appendChild(table);
  ganttSection.appendChild(scrollWrapper);
  chartRoot.appendChild(ganttSection);

  container.appendChild(chartRoot);
}
