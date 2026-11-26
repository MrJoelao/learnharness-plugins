import type { BoundedBufferState, ConditionVarState, LockState } from "../../core/concurrency/types.js";

export function renderCircularBuffer(
  container: HTMLElement,
  buffer: BoundedBufferState,
  locks: Record<string, LockState>,
  conditionVariables: Record<string, ConditionVarState>
): void {
  container.innerHTML = "";

  const root = document.createElement("div");
  root.className = "circular-buffer-card";

  const header = document.createElement("div");
  header.className = "section-header";
  const title = document.createElement("h3");
  title.className = "section-title font-title";
  title.textContent = "Buffer Circolare & Code Mesa";
  header.appendChild(title);
  root.appendChild(header);

  const content = document.createElement("div");
  content.className = "circular-buffer-content";

  const size = 260;
  const center = size / 2;
  const radius = 80;
  const slotRadius = 20;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "circular-buffer-svg");

  const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  ring.setAttribute("cx", String(center));
  ring.setAttribute("cy", String(center));
  ring.setAttribute("r", String(radius));
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "var(--border)");
  ring.setAttribute("stroke-width", "4");
  ring.setAttribute("stroke-dasharray", "4 4");
  svg.appendChild(ring);

  const capacity = Math.max(1, buffer.capacity);
  for (let i = 0; i < capacity; i++) {
    const angle = (i * 2 * Math.PI) / capacity - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);

    const slotGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", String(slotRadius));

    const isFilled = i < buffer.items.length;
    circle.setAttribute("fill", isFilled ? "var(--muted)" : "var(--card)");
    circle.setAttribute("stroke", isFilled ? "var(--primary)" : "var(--border)");
    circle.setAttribute("stroke-width", "2");
    slotGroup.appendChild(circle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y + 4));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-family", "var(--font-mono, monospace)");
    text.setAttribute("font-size", "12");
    text.setAttribute("font-weight", "600");
    text.setAttribute("fill", isFilled ? "var(--foreground)" : "var(--muted-foreground)");
    text.textContent = isFilled ? String(buffer.items[i]) : "—";
    slotGroup.appendChild(text);

    const idxText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    const idxR = radius + slotRadius + 14;
    const idxX = center + idxR * Math.cos(angle);
    const idxY = center + idxR * Math.sin(angle) + 4;
    idxText.setAttribute("x", String(idxX));
    idxText.setAttribute("y", String(idxY));
    idxText.setAttribute("text-anchor", "middle");
    idxText.setAttribute("font-family", "var(--font-mono, monospace)");
    idxText.setAttribute("font-size", "11");
    idxText.setAttribute("fill", "var(--muted-foreground)");
    idxText.textContent = `[${i}]`;
    slotGroup.appendChild(idxText);

    if (i === buffer.inPtr % capacity) {
      const inBadge = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const inR = radius - slotRadius - 10;
      inBadge.setAttribute("x", String(center + inR * Math.cos(angle)));
      inBadge.setAttribute("y", String(center + inR * Math.sin(angle) + 3));
      inBadge.setAttribute("text-anchor", "middle");
      inBadge.setAttribute("font-family", "var(--font-mono, monospace)");
      inBadge.setAttribute("font-size", "11");
      inBadge.setAttribute("font-weight", "bold");
      inBadge.setAttribute("fill", "var(--primary)");
      inBadge.textContent = "in";
      slotGroup.appendChild(inBadge);
    }

    svg.appendChild(slotGroup);
  }

  const centerText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  centerText.setAttribute("x", String(center));
  centerText.setAttribute("y", String(center - 4));
  centerText.setAttribute("text-anchor", "middle");
  centerText.setAttribute("font-family", "var(--font-sans)");
  centerText.setAttribute("font-size", "11");
  centerText.setAttribute("fill", "var(--muted-foreground)");
  centerText.textContent = "Capacità";
  svg.appendChild(centerText);

  const countText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  countText.setAttribute("x", String(center));
  countText.setAttribute("y", String(center + 14));
  countText.setAttribute("text-anchor", "middle");
  countText.setAttribute("font-family", "var(--font-mono, monospace)");
  countText.setAttribute("font-size", "14");
  countText.setAttribute("font-weight", "700");
  countText.setAttribute("fill", "var(--foreground)");
  countText.textContent = `${buffer.items.length} / ${buffer.capacity}`;
  svg.appendChild(countText);

  content.appendChild(svg);

  const queuesContainer = document.createElement("div");
  queuesContainer.className = "buffer-queues-container";

  const mutexLock = locks["mutex"];
  const lockRow = document.createElement("div");
  lockRow.className = "queue-row";
  lockRow.innerHTML = `
    <span class="queue-label">Mutex:</span>
    <span class="queue-val font-mono tabular-nums">${mutexLock?.heldBy ? `Assegnato a ${mutexLock.heldBy}` : "Libero"}</span>
    ${mutexLock && mutexLock.waitQueue.length > 0 ? `<span class="queue-waiting font-mono tabular-nums">(In coda: ${mutexLock.waitQueue.join(", ")})</span>` : ""}
  `;
  queuesContainer.appendChild(lockRow);

  for (const [cvId, cv] of Object.entries(conditionVariables)) {
    const cvRow = document.createElement("div");
    cvRow.className = "queue-row";
    const qStr = cv.waitQueue.length > 0 ? cv.waitQueue.join(", ") : "vuota";
    cvRow.innerHTML = `
      <span class="queue-label">CV '${cvId}':</span>
      <span class="queue-val font-mono tabular-nums">Coda: [${qStr}]</span>
    `;
    queuesContainer.appendChild(cvRow);
  }

  content.appendChild(queuesContainer);
  root.appendChild(content);
  container.appendChild(root);
}
