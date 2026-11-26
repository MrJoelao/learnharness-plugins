import { checkCoffmanConditions } from "../../core/concurrency/rag.js";
import type { ConcurrencyScenarioState } from "../../core/concurrency/types.js";
import { createIcon } from "../icons.js";

function isEdgeInCycle(from: string, to: string, cycles: string[][]): boolean {
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length - 1; i++) {
      if (cycle[i] === from && cycle[i + 1] === to) {
        return true;
      }
    }
  }
  return false;
}

export function renderRagGraph(
  container: HTMLElement,
  state: ConcurrencyScenarioState
): void {
  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "rag-card";

  const header = document.createElement("div");
  header.className = "section-header";
  const title = document.createElement("h3");
  title.className = "section-title font-title";
  title.textContent = "Resource Allocation Graph (RAG)";
  header.appendChild(title);
  root.appendChild(header);

  const coffman = checkCoffmanConditions(state);
  const rag = state.rag;
  const cycles = rag.detectedCycles;

  if (coffman.isDeadlocked) {
    const alertBanner = document.createElement("div");
    alertBanner.className = "deadlock-alert-banner";
    const icon = createIcon("alert-circle", "size-5 text-destructive");
    const textWrap = document.createElement("div");
    textWrap.innerHTML = `
      <div class="font-bold">DEADLOCK RILEVATO (Condizioni di Coffman soddisfatte)</div>
      <div class="text-xs text-muted-foreground mt-0.5">
        Cicli di attesa circolare: <span class="font-mono tabular-nums">${cycles.map((c) => c.join(" → ")).join("; ")}</span>
      </div>
    `;
    alertBanner.append(icon, textWrap);
    root.appendChild(alertBanner);
  }

  const svgWidth = 360;
  const svgHeight = 280;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute("class", "rag-svg");

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

  const markerNormal = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  markerNormal.setAttribute("id", "arrow-normal");
  markerNormal.setAttribute("viewBox", "0 0 10 10");
  markerNormal.setAttribute("refX", "8");
  markerNormal.setAttribute("refY", "5");
  markerNormal.setAttribute("markerWidth", "6");
  markerNormal.setAttribute("markerHeight", "6");
  markerNormal.setAttribute("orient", "auto-start-reverse");
  const pathNormal = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathNormal.setAttribute("d", "M 0 1 L 8 5 L 0 9 z");
  pathNormal.setAttribute("fill", "var(--foreground)");
  markerNormal.appendChild(pathNormal);
  defs.appendChild(markerNormal);

  const markerDeadlock = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  markerDeadlock.setAttribute("id", "arrow-deadlock");
  markerDeadlock.setAttribute("viewBox", "0 0 10 10");
  markerDeadlock.setAttribute("refX", "8");
  markerDeadlock.setAttribute("refY", "5");
  markerDeadlock.setAttribute("markerWidth", "6");
  markerDeadlock.setAttribute("markerHeight", "6");
  markerDeadlock.setAttribute("orient", "auto-start-reverse");
  const pathDeadlock = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathDeadlock.setAttribute("d", "M 0 1 L 8 5 L 0 9 z");
  pathDeadlock.setAttribute("fill", "var(--destructive)");
  markerDeadlock.appendChild(pathDeadlock);
  defs.appendChild(markerDeadlock);

  svg.appendChild(defs);

  const nodePositions = new Map<string, { x: number; y: number; isResource: boolean }>();

  const isPhilosophers =
    rag.processes.length === 5 &&
    rag.processes.every((p) => p.startsWith("P")) &&
    rag.resources.length === 5 &&
    rag.resources.every((r) => r.startsWith("fork"));

  if (isPhilosophers) {
    const cx = svgWidth / 2;
    const cy = svgHeight / 2;
    const r = 100;
    const total = 10;
    for (let i = 0; i < 5; i++) {
      const pAngle = (2 * i * 2 * Math.PI) / total - Math.PI / 2;
      nodePositions.set(`P${i}`, {
        x: cx + r * Math.cos(pAngle),
        y: cy + r * Math.sin(pAngle),
        isResource: false
      });

      const fAngle = ((2 * i + 1) * 2 * Math.PI) / total - Math.PI / 2;
      nodePositions.set(`fork${i}`, {
        x: cx + r * Math.cos(fAngle),
        y: cy + r * Math.sin(fAngle),
        isResource: true
      });
    }
  } else {
    const procCount = Math.max(1, rag.processes.length);
    const procSpacing = svgHeight / (procCount + 1);
    rag.processes.forEach((p, idx) => {
      nodePositions.set(p, {
        x: 60,
        y: procSpacing * (idx + 1),
        isResource: false
      });
    });

    const resCount = Math.max(1, rag.resources.length);
    const resSpacing = svgHeight / (resCount + 1);
    rag.resources.forEach((r, idx) => {
      nodePositions.set(r, {
        x: svgWidth - 60,
        y: resSpacing * (idx + 1),
        isResource: true
      });
    });
  }

  const edgesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

  for (const alloc of rag.allocations) {
    const fromPos = nodePositions.get(alloc.fromResource);
    const toPos = nodePositions.get(alloc.toProcess);
    if (!fromPos || !toPos) continue;

    const inCycle = isEdgeInCycle(alloc.fromResource, alloc.toProcess, cycles);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(fromPos.x));
    line.setAttribute("y1", String(fromPos.y));
    line.setAttribute("x2", String(toPos.x));
    line.setAttribute("y2", String(toPos.y));
    line.setAttribute("stroke", inCycle ? "var(--destructive)" : "var(--foreground)");
    line.setAttribute("stroke-width", inCycle ? "2.5" : "1.5");
    line.setAttribute("marker-end", inCycle ? "url(#arrow-deadlock)" : "url(#arrow-normal)");
    edgesGroup.appendChild(line);
  }

  for (const req of rag.requests) {
    const fromPos = nodePositions.get(req.fromProcess);
    const toPos = nodePositions.get(req.toResource);
    if (!fromPos || !toPos) continue;

    const inCycle = isEdgeInCycle(req.fromProcess, req.toResource, cycles);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(fromPos.x));
    line.setAttribute("y1", String(fromPos.y));
    line.setAttribute("x2", String(toPos.x));
    line.setAttribute("y2", String(toPos.y));
    line.setAttribute("stroke", inCycle ? "var(--destructive)" : "var(--muted-foreground)");
    line.setAttribute("stroke-width", inCycle ? "2.5" : "1.5");
    line.setAttribute("stroke-dasharray", "4 3");
    line.setAttribute("marker-end", inCycle ? "url(#arrow-deadlock)" : "url(#arrow-normal)");
    edgesGroup.appendChild(line);
  }

  svg.appendChild(edgesGroup);

  const nodesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

  for (const [id, pos] of nodePositions.entries()) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

    if (pos.isResource) {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(pos.x - 14));
      rect.setAttribute("y", String(pos.y - 14));
      rect.setAttribute("width", "28");
      rect.setAttribute("height", "28");
      rect.setAttribute("rx", "4");
      rect.setAttribute("fill", "var(--muted)");
      rect.setAttribute("stroke", "var(--border)");
      rect.setAttribute("stroke-width", "1.5");
      g.appendChild(rect);
    } else {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(pos.x));
      circle.setAttribute("cy", String(pos.y));
      circle.setAttribute("r", "14");
      circle.setAttribute("fill", "var(--card)");
      circle.setAttribute("stroke", "var(--border)");
      circle.setAttribute("stroke-width", "1.5");
      g.appendChild(circle);
    }

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(pos.x));
    text.setAttribute("y", String(pos.y + 4));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-family", "var(--font-mono, monospace)");
    text.setAttribute("font-size", "11");
    text.setAttribute("font-weight", "600");
    text.setAttribute("fill", "var(--foreground)");
    text.textContent = id;
    g.appendChild(text);

    nodesGroup.appendChild(g);
  }

  svg.appendChild(nodesGroup);
  root.appendChild(svg);

  const legend = document.createElement("div");
  legend.className = "rag-legend";
  legend.innerHTML = `
    <div class="legend-item"><span class="legend-badge legend-proc"></span> Processo (Cerchio)</div>
    <div class="legend-item"><span class="legend-badge legend-res"></span> Risorsa (Rettangolo)</div>
    <div class="legend-item"><span class="legend-line legend-alloc"></span> Assegnazione (R → P)</div>
    <div class="legend-item"><span class="legend-line legend-req"></span> Richiesta (P → R)</div>
  `;
  root.appendChild(legend);

  const coffmanPanel = document.createElement("div");
  coffmanPanel.className = "coffman-panel";

  const conds = [
    { name: "1. Mutual Exclusion", ...coffman.mutualExclusion },
    { name: "2. Hold and Wait", ...coffman.holdAndWait },
    { name: "3. No Preemption", ...coffman.noPreemption },
    { name: "4. Circular Wait", ...coffman.circularWait }
  ];

  for (const c of conds) {
    const card = document.createElement("div");
    card.className = `coffman-card ${c.met ? "coffman-met" : "coffman-unmet"}`;
    card.innerHTML = `
      <div class="coffman-card-header">
        <span class="coffman-cond-name">${c.name}</span>
        <span class="coffman-status-badge ${c.met ? "status-met" : "status-unmet"} font-mono tabular-nums">
          ${c.met ? "Soddisfatta" : "Non presente"}
        </span>
      </div>
      <p class="coffman-explanation">${c.explanation}</p>
    `;
    coffmanPanel.appendChild(card);
  }

  root.appendChild(coffmanPanel);
  container.appendChild(root);
}
