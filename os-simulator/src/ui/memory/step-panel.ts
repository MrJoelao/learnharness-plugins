import type { TranslationResult } from "../../core/memory/types.js";
import { createIcon } from "../icons.js";

export function renderStepPanel(result: TranslationResult): HTMLElement {
  const container = document.createElement("div");
  container.className = "step-panel-container";

  // Result Banner
  const banner = document.createElement("div");
  const isValid = result.status === "valid";
  banner.className = `step-banner ${isValid ? "step-banner-valid" : "step-banner-invalid"}`;

  const icon = createIcon(isValid ? "check" : "alert-circle", "banner-icon size-5");
  banner.appendChild(icon);

  const bannerText = document.createElement("div");
  bannerText.className = "banner-content";

  const title = document.createElement("div");
  title.className = "banner-title font-title font-mono tabular-nums";
  if (isValid) {
    const paHex = result.pa !== null ? "0x" + result.pa.toString(16).toUpperCase() : "";
    title.textContent = `Traduzione Riuscita: PA = ${result.pa?.toLocaleString()} (${paHex})`;
  } else {
    const statusLabels: Record<string, string> = {
      "segmentation-violation": "Violazione di Segmentazione (Accesso Fuori Limite)",
      "invalid-page": "Pagina Non Valida (Page Fault)",
      "tlb-miss": "TLB Miss & Page Fault"
    };
    title.textContent = statusLabels[result.status] || "Violazione di Memoria";
  }

  const subtitle = document.createElement("div");
  subtitle.className = "banner-subtitle font-mono tabular-nums";
  subtitle.textContent = `Indirizzo Virtuale: VA = ${result.va} (0x${result.va.toString(16).toUpperCase()})`;

  bannerText.append(title, subtitle);
  banner.appendChild(bannerText);
  container.appendChild(banner);

  // Savings badge for multi-level if present
  if (result.savingsBytes !== undefined && result.savingsBytes > 0) {
    const savingsEl = document.createElement("div");
    savingsEl.className = "savings-badge";
    savingsEl.innerHTML = `
      <span class="savings-label">Ottimizzazione Spazio Multi-Livello:</span>
      <span class="savings-amount font-mono tabular-nums">${result.savingsBytes.toLocaleString()} byte risparmiati</span>
      <span class="savings-note">rispetto alla tabella lineare a singolo livello.</span>
    `;
    container.appendChild(savingsEl);
  }

  // Step explanations list
  const stepsList = document.createElement("div");
  stepsList.className = "steps-list";

  const stepsTitle = document.createElement("h4");
  stepsTitle.className = "steps-header font-title";
  stepsTitle.textContent = "Passaggi Analitici della Traduzione";
  stepsList.appendChild(stepsTitle);

  const ol = document.createElement("ol");
  ol.className = "steps-ol";

  result.stepExplanations.forEach((explanation, idx) => {
    const li = document.createElement("li");
    li.className = "step-item";

    const numBadge = document.createElement("span");
    numBadge.className = "step-number font-mono tabular-nums";
    numBadge.textContent = String(idx + 1);

    const textSpan = document.createElement("span");
    textSpan.className = "step-text font-mono tabular-nums";
    textSpan.textContent = explanation;

    li.append(numBadge, textSpan);
    ol.appendChild(li);
  });

  stepsList.appendChild(ol);
  container.appendChild(stepsList);

  return container;
}
