import { LDE_STEPS } from "../../core/cpu/privilege.js";
import { createIcon } from "../icons.js";

export interface LdeInspectorProps {
  stepIndex: number;
  onStepChange: (stepIndex: number) => void;
}

export function renderLdeInspector(container: HTMLElement, props: LdeInspectorProps): void {
  container.innerHTML = "";

  const boundedIndex = Math.max(0, Math.min(props.stepIndex, LDE_STEPS.length - 1));
  const currentStep = LDE_STEPS[boundedIndex] ?? LDE_STEPS[0];
  if (!currentStep) return;

  const root = document.createElement("div");
  root.className = "cpu-lde-container";

  // Top header with CPL status badge and navigation
  const topBar = document.createElement("div");
  topBar.className = "cpu-lde-top-bar";

  const statusGroup = document.createElement("div");
  statusGroup.className = "cpu-lde-status-group";

  const cplBadge = document.createElement("div");
  const isRing0 = currentStep.cpl === 0;
  cplBadge.className = `cpu-cpl-badge ${isRing0 ? "cpl-ring0" : "cpl-ring3"}`;
  cplBadge.appendChild(createIcon("shield", "size-4"));
  const cplText = document.createElement("span");
  cplText.textContent = isRing0 ? "CPL = 0 (Ring 0 - Kernel Mode)" : "CPL = 3 (Ring 3 - User Mode)";
  cplBadge.appendChild(cplText);

  const stepIndicator = document.createElement("span");
  stepIndicator.className = "cpu-lde-step-counter font-mono tabular-nums";
  stepIndicator.textContent = `Fase ${boundedIndex + 1} / ${LDE_STEPS.length}`;

  statusGroup.append(cplBadge, stepIndicator);

  const navButtons = document.createElement("div");
  navButtons.className = "cpu-lde-nav-buttons";

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn-icon";
  resetBtn.title = "Riavvia al boot (Fase 1)";
  resetBtn.appendChild(createIcon("skip-back", "size-4"));
  resetBtn.addEventListener("click", () => props.onStepChange(0));

  const prevBtn = document.createElement("button");
  prevBtn.className = "btn-icon";
  prevBtn.title = "Fase precedente";
  prevBtn.disabled = boundedIndex <= 0;
  prevBtn.appendChild(createIcon("chevron-left", "size-4"));
  prevBtn.addEventListener("click", () => {
    if (boundedIndex > 0) props.onStepChange(boundedIndex - 1);
  });

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn btn-primary";
  nextBtn.title = "Fase successiva";
  nextBtn.disabled = boundedIndex >= LDE_STEPS.length - 1;
  const nextLabel = document.createElement("span");
  nextLabel.textContent = "Avanza Passo";
  nextBtn.appendChild(nextLabel);
  nextBtn.appendChild(createIcon("chevron-right", "size-4"));
  nextBtn.addEventListener("click", () => {
    if (boundedIndex < LDE_STEPS.length - 1) props.onStepChange(boundedIndex + 1);
  });

  navButtons.append(resetBtn, prevBtn, nextBtn);
  topBar.append(statusGroup, navButtons);
  root.appendChild(topBar);

  // Stage description card
  const descriptionCard = document.createElement("div");
  descriptionCard.className = "cpu-lde-desc-card";

  const stageTitle = document.createElement("h4");
  stageTitle.className = "cpu-lde-stage-title font-title";
  stageTitle.textContent = currentStep.stageName;

  const descText = document.createElement("p");
  descText.className = "cpu-lde-desc-text";
  descText.textContent = currentStep.stepDescription;

  const asmBox = document.createElement("div");
  asmBox.className = "cpu-lde-asm-box font-mono tabular-nums";
  asmBox.textContent = `Istruzione CPU Corrente: ${currentStep.currentInstruction}`;

  descriptionCard.append(stageTitle, descText, asmBox);
  root.appendChild(descriptionCard);

  // Two-column stacks view
  const stacksGrid = document.createElement("div");
  stacksGrid.className = "cpu-lde-stacks-grid";

  // User Stack column
  const userStackCard = document.createElement("div");
  userStackCard.className = `cpu-stack-card ${currentStep.cpl === 3 ? "stack-active" : ""}`;

  const userStackHeader = document.createElement("div");
  userStackHeader.className = "cpu-stack-header";
  userStackHeader.innerHTML = `
    <span class="cpu-stack-title">User Stack (<span class="font-mono tabular-nums">%esp = 0x${currentStep.stackPointer.toString(16)}</span>)</span>
    <span class="cpu-stack-badge">Ring 3</span>
  `;
  userStackCard.appendChild(userStackHeader);

  const userStackBody = document.createElement("div");
  userStackBody.className = "cpu-stack-body font-mono tabular-nums";
  if (currentStep.userStack.length === 0) {
    userStackBody.innerHTML = `<div class="cpu-stack-empty">[Stack vuoto]</div>`;
  } else {
    for (const frame of currentStep.userStack) {
      const row = document.createElement("div");
      row.className = "cpu-stack-entry";
      row.innerHTML = `
        <span class="stack-addr">0x${frame.address.toString(16)}:</span>
        <span class="stack-val">${frame.value}</span>
      `;
      userStackBody.appendChild(row);
    }
  }
  userStackCard.appendChild(userStackBody);

  // Kernel Stack column
  const kernelStackCard = document.createElement("div");
  kernelStackCard.className = `cpu-stack-card ${currentStep.cpl === 0 ? "stack-active" : ""}`;

  const kernelStackHeader = document.createElement("div");
  kernelStackHeader.className = "cpu-stack-header";
  kernelStackHeader.innerHTML = `
    <span class="cpu-stack-title">Kernel Stack (<span class="font-mono tabular-nums">TSS esp0 = 0x${currentStep.kernelStackPointer.toString(16)}</span>)</span>
    <span class="cpu-stack-badge kernel-badge">Ring 0</span>
  `;
  kernelStackCard.appendChild(kernelStackHeader);

  const kernelStackBody = document.createElement("div");
  kernelStackBody.className = "cpu-stack-body font-mono tabular-nums";
  if (currentStep.kernelStack.length === 0) {
    kernelStackBody.innerHTML = `<div class="cpu-stack-empty">[Stack vuoto - CPU in Ring 3]</div>`;
  } else {
    for (const frame of currentStep.kernelStack) {
      const row = document.createElement("div");
      const isTrapFrame =
        frame.value.includes("User SS") ||
        frame.value.includes("User ESP") ||
        frame.value.includes("EFLAGS") ||
        frame.value.includes("User CS") ||
        frame.value.includes("Return EIP");
      row.className = `cpu-stack-entry ${isTrapFrame ? "trap-frame-entry" : ""}`;
      row.innerHTML = `
        <span class="stack-addr">0x${frame.address.toString(16)}:</span>
        <span class="stack-val">${frame.value} ${isTrapFrame ? '<span class="trap-tag">TRAP FRAME</span>' : ""}</span>
      `;
      kernelStackBody.appendChild(row);
    }
  }
  kernelStackCard.appendChild(kernelStackBody);

  stacksGrid.append(userStackCard, kernelStackCard);
  root.appendChild(stacksGrid);

  container.appendChild(root);
}
