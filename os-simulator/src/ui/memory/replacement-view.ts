import type { PageReplacementConfig } from "../../core/memory/types.js";
import { simulatePageReplacement } from "../../core/memory/replacement.js";
import { createIcon } from "../icons.js";

export function renderReplacementView(
  config: PageReplacementConfig,
  currentStepIndex: number,
  onStepChange: (newStepIndex: number) => void,
  onConfigChange: (newConfig: PageReplacementConfig) => void
): HTMLElement {
  const simulation = simulatePageReplacement(config);
  const container = document.createElement("div");
  container.className = "replacement-view-container";

  // Top control bar
  const controlBar = document.createElement("div");
  controlBar.className = "replacement-controls-bar";

  // Policy selector
  const policyGroup = document.createElement("div");
  policyGroup.className = "policy-selector-group";
  if (policyGroup.style) {
    policyGroup.style.flexWrap = "wrap";
    policyGroup.style.minWidth = "0";
  }
  policyGroup.innerHTML = `<span class="control-label">Algoritmo:</span>`;

  const select = document.createElement("select");
  select.className = "input-select font-mono";
  if (select.style) {
    select.style.minWidth = "0";
    select.style.maxWidth = "100%";
  }
  const policies: Array<{ id: PageReplacementConfig["policy"]; label: string }> = [
    { id: "fifo", label: "FIFO (First In First Out)" },
    { id: "opt", label: "Optimal (MIN / Belàdy Optimal)" },
    { id: "lru", label: "LRU (Least Recently Used)" },
    { id: "clock", label: "Clock (Second Chance)" },
    { id: "modified-clock", label: "Modified Clock (Use, Dirty)" }
  ];
  for (const pol of policies) {
    const opt = document.createElement("option");
    opt.value = pol.id;
    opt.textContent = pol.label;
    if (pol.id === config.policy) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    onConfigChange({ ...config, policy: select.value as PageReplacementConfig["policy"] });
  });
  policyGroup.appendChild(select);
  controlBar.appendChild(policyGroup);

  // Frame count input
  const frameGroup = document.createElement("div");
  frameGroup.className = "frame-count-group";
  if (frameGroup.style) {
    frameGroup.style.flexWrap = "wrap";
  }
  frameGroup.innerHTML = `<span class="control-label">Frame Fisici:</span>`;

  const frameInput = document.createElement("input");
  frameInput.type = "number";
  frameInput.min = "1";
  frameInput.max = "16";
  frameInput.value = String(config.frameCount);
  frameInput.className = "input-number font-mono";
  frameInput.addEventListener("change", () => {
    const val = parseInt(frameInput.value, 10);
    if (!Number.isNaN(val) && val >= 1 && val <= 16) {
      onConfigChange({ ...config, frameCount: val });
    }
  });
  frameGroup.appendChild(frameInput);
  controlBar.appendChild(frameGroup);

  // Stepping buttons
  const stepControls = document.createElement("div");
  stepControls.className = "step-buttons-group";
  if (stepControls.style) {
    stepControls.style.flexWrap = "wrap";
  }

  const btnPrev = document.createElement("button");
  btnPrev.className = "btn btn-outline";
  btnPrev.title = "Passo Precedente";
  btnPrev.appendChild(createIcon("chevron-left"));
  btnPrev.disabled = currentStepIndex <= 0;
  btnPrev.addEventListener("click", () => {
    if (currentStepIndex > 0) onStepChange(currentStepIndex - 1);
  });

  const stepIndicator = document.createElement("span");
  stepIndicator.className = "step-counter font-mono tabular-nums";
  stepIndicator.textContent = `Passo ${currentStepIndex + 1} / ${config.referenceString.length}`;

  const btnNext = document.createElement("button");
  btnNext.className = "btn btn-outline";
  btnNext.title = "Passo Successivo";
  btnNext.appendChild(createIcon("chevron-right"));
  btnNext.disabled = currentStepIndex >= config.referenceString.length - 1;
  btnNext.addEventListener("click", () => {
    if (currentStepIndex < config.referenceString.length - 1) onStepChange(currentStepIndex + 1);
  });

  const btnReset = document.createElement("button");
  btnReset.className = "btn btn-outline";
  btnReset.title = "Riavvia da Inizio";
  btnReset.appendChild(createIcon("rotate-ccw"));
  btnReset.addEventListener("click", () => onStepChange(0));

  const btnRunAll = document.createElement("button");
  btnRunAll.className = "btn btn-primary";
  btnRunAll.title = "Esegui Tutto";
  btnRunAll.textContent = "Completa Tutto";
  btnRunAll.addEventListener("click", () => onStepChange(config.referenceString.length - 1));

  stepControls.append(btnPrev, stepIndicator, btnNext, btnReset, btnRunAll);
  controlBar.appendChild(stepControls);
  container.appendChild(controlBar);

  // Belady Anomaly Card if detected
  if (simulation.beladyAnomalyDetected && simulation.beladyComparison) {
    const beladyAlert = document.createElement("div");
    beladyAlert.className = "belady-alert-card";
    beladyAlert.innerHTML = `
      <div class="belady-alert-title font-title">
        <span>Rilevata Anomalia di Belàdy!</span>
      </div>
      <div class="belady-alert-body font-mono">
        Con la politica FIFO, aumentando i frame fisici da 3 a 4 i page fault aumentano invece di diminuire:
        <br />• Con <strong>3 frame</strong>: <strong>${simulation.beladyComparison.frames3Faults}</strong> page fault.
        <br />• Con <strong>4 frame</strong>: <strong>${simulation.beladyComparison.frames4Faults}</strong> page fault (${simulation.beladyComparison.frames4Faults} > ${simulation.beladyComparison.frames3Faults}).
      </div>
    `;
    container.appendChild(beladyAlert);
  }

  // Reference String strip
  const stripCard = document.createElement("div");
  stripCard.className = "reference-string-card";
  stripCard.innerHTML = `<div class="card-section-title font-title">Stringa di Riferimento Pagine</div>`;

  const strip = document.createElement("div");
  strip.className = "ref-string-strip";
  config.referenceString.forEach((page, idx) => {
    const cell = document.createElement("button");
    const isCurrent = idx === currentStepIndex;
    const isPast = idx < currentStepIndex;
    const stepData = simulation.steps[idx];

    cell.className = `ref-page-cell font-mono tabular-nums ${isCurrent ? "current" : isPast ? "past" : ""} ${stepData?.fault ? "was-fault" : "was-hit"}`;
    cell.innerHTML = `
      <span class="ref-page-num font-mono tabular-nums">${page}</span>
      <span class="ref-page-step font-mono tabular-nums">#${idx + 1}</span>
    `;
    cell.addEventListener("click", () => onStepChange(idx));
    strip.appendChild(cell);
  });
  stripCard.appendChild(strip);
  container.appendChild(stripCard);

  // Matrix Grid: Frames x Steps
  const matrixCard = document.createElement("div");
  matrixCard.className = "replacement-matrix-card";
  matrixCard.innerHTML = `<div class="card-section-title font-title">Matrice di Allocazione dei Frame nel Tempo</div>`;

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "matrix-table-wrapper";

  const table = document.createElement("table");
  table.className = "replacement-matrix-table font-mono tabular-nums";

  // Thead: Step numbers and pages requested
  let theadHtml = `
    <thead>
      <tr>
        <th class="matrix-sticky-col">Passo</th>
        ${simulation.steps
          .map(
            (s, idx) =>
              `<th class="${idx === currentStepIndex ? "col-current" : ""}">#${idx + 1}</th>`
          )
          .join("")}
      </tr>
      <tr class="matrix-page-row">
        <th class="matrix-sticky-col">Pagina</th>
        ${simulation.steps
          .map(
            (s, idx) =>
              `<th class="${idx === currentStepIndex ? "col-current" : ""}">${s.page}</th>`
          )
          .join("")}
      </tr>
    </thead>
  `;
  table.innerHTML = theadHtml;

  const tbody = document.createElement("tbody");

  // Rows for each frame
  for (let f = 0; f < config.frameCount; f++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="matrix-sticky-col frame-label">Frame ${f}</td>`;

    simulation.steps.forEach((s, idx) => {
      const pageInFrame = s.frames[f];
      const isColCurrent = idx === currentStepIndex;
      const wasVictim = s.victim !== null && s.frames[f] === s.page && s.fault;

      const td = document.createElement("td");
      td.className = `matrix-cell ${isColCurrent ? "col-current" : ""} ${wasVictim ? "cell-victim" : ""}`;
      td.textContent = pageInFrame !== null && pageInFrame !== undefined ? String(pageInFrame) : "-";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }

  // Row for Outcome: HIT or FAULT
  const trOutcome = document.createElement("tr");
  trOutcome.className = "matrix-outcome-row";
  trOutcome.innerHTML = `<td class="matrix-sticky-col outcome-label">Esito</td>`;
  simulation.steps.forEach((s, idx) => {
    const td = document.createElement("td");
    const isColCurrent = idx === currentStepIndex;
    td.className = `outcome-cell ${isColCurrent ? "col-current" : ""} ${s.hit ? "outcome-hit" : "outcome-fault"}`;
    td.textContent = s.hit ? "HIT" : "FAULT";
    trOutcome.appendChild(td);
  });
  tbody.appendChild(trOutcome);

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  matrixCard.appendChild(tableWrapper);
  container.appendChild(matrixCard);

  // Step explanation callout
  const curStep = simulation.steps[currentStepIndex];
  if (curStep) {
    const callout = document.createElement("div");
    callout.className = `step-callout font-mono ${curStep.hit ? "callout-hit" : "callout-fault"}`;
    callout.innerHTML = `
      <span class="callout-badge">${curStep.hit ? "HIT" : "PAGE FAULT"}</span>
      <span class="callout-text">${curStep.explanation}</span>
    `;
    container.appendChild(callout);
  }

  // Summary Metrics Cards
  const metricsGrid = document.createElement("div");
  metricsGrid.className = "replacement-metrics-grid";

  const totalRefs = config.referenceString.length;
  const faultsUpToNow = simulation.steps.slice(0, currentStepIndex + 1).filter((s) => s.fault).length;
  const hitsUpToNow = simulation.steps.slice(0, currentStepIndex + 1).filter((s) => s.hit).length;
  const currentRefs = currentStepIndex + 1;
  const faultRate = currentRefs > 0 ? (faultsUpToNow / currentRefs) * 100 : 0;
  const hitRate = currentRefs > 0 ? (hitsUpToNow / currentRefs) * 100 : 0;

  metricsGrid.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Accessi Analizzati</div>
      <div class="metric-value font-mono tabular-nums">${currentRefs} / ${totalRefs}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Page Fault Totali</div>
      <div class="metric-value font-mono tabular-nums metric-fault">${faultsUpToNow} (${faultRate.toFixed(1)}%)</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Cache Hit Totali</div>
      <div class="metric-value font-mono tabular-nums metric-hit">${hitsUpToNow} (${hitRate.toFixed(1)}%)</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Frame Fisici</div>
      <div class="metric-value font-mono tabular-nums">${config.frameCount} frame</div>
    </div>
  `;
  container.appendChild(metricsGrid);

  return container;
}
