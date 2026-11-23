export interface BitComponentSpec {
  name: string;
  bitCount: number;
  value: number;
  type: "primary" | "secondary" | "accent";
}

export function renderBitVisualizer(
  va: number,
  totalBits: number,
  components: BitComponentSpec[]
): HTMLElement {
  const container = document.createElement("div");
  container.className = "bit-visualizer-container";

  // Top header with component legend badges
  const header = document.createElement("div");
  header.className = "bit-visualizer-header";

  let currentBitHigh = totalBits - 1;
  const groupsInfo: Array<{ spec: BitComponentSpec; high: number; low: number }> = [];

  for (const comp of components) {
    const low = currentBitHigh - comp.bitCount + 1;
    groupsInfo.push({ spec: comp, high: currentBitHigh, low });

    const badge = document.createElement("div");
    badge.className = `bit-badge bit-badge-${comp.type}`;
    badge.innerHTML = `
      <span class="badge-label">${comp.name}</span>
      <span class="badge-range font-mono tabular-nums">[${currentBitHigh}..${low}]</span>
      <span class="badge-val font-mono tabular-nums">val: ${comp.value} (0x${comp.value.toString(16)})</span>
    `;
    header.appendChild(badge);

    currentBitHigh = low - 1;
  }
  container.appendChild(header);

  // Bit strip
  const strip = document.createElement("div");
  strip.className = "bit-strip";

  // Convert VA to binary string of length totalBits
  // Using BigInt or unsigned shifting for bit safety
  const bits: number[] = [];
  for (let i = totalBits - 1; i >= 0; i--) {
    const bitVal = Math.floor(va / Math.pow(2, i)) % 2;
    bits.push(bitVal);
  }

  let bitIndexCounter = totalBits - 1;
  for (const group of groupsInfo) {
    const groupEl = document.createElement("div");
    groupEl.className = `bit-group bit-group-${group.spec.type}`;

    for (let b = 0; b < group.spec.bitCount; b++) {
      const bitIndex = bitIndexCounter--;
      const bitVal = Math.floor(va / Math.pow(2, bitIndex)) % 2;

      const cell = document.createElement("div");
      cell.className = `bit-cell ${bitVal === 1 ? "bit-cell-one" : "bit-cell-zero"}`;

      const indexLabel = document.createElement("span");
      indexLabel.className = "bit-index font-mono tabular-nums";
      indexLabel.textContent = String(bitIndex);

      const valLabel = document.createElement("span");
      valLabel.className = "bit-value font-mono tabular-nums";
      valLabel.textContent = String(bitVal);

      cell.append(indexLabel, valLabel);
      groupEl.appendChild(cell);
    }

    strip.appendChild(groupEl);
  }
  container.appendChild(strip);

  // Format conversion cards
  const footer = document.createElement("div");
  footer.className = "bit-visualizer-footer";

  // Binary representation grouped
  const binGroups: string[] = [];
  let bitCur = totalBits - 1;
  for (const group of groupsInfo) {
    let groupBin = "";
    for (let i = 0; i < group.spec.bitCount; i++) {
      groupBin += String(Math.floor(va / Math.pow(2, bitCur--)) % 2);
    }
    binGroups.push(groupBin);
  }

  const hexDigits = Math.max(2, Math.ceil(totalBits / 4));
  const hexStr = "0x" + va.toString(16).padStart(hexDigits, "0").toUpperCase();

  footer.innerHTML = `
    <div class="conversion-card">
      <span class="conversion-label">Binario</span>
      <span class="conversion-value font-mono tabular-nums">${binGroups.join(" ")}</span>
    </div>
    <div class="conversion-card">
      <span class="conversion-label">Decimale</span>
      <span class="conversion-value font-mono tabular-nums">${va.toLocaleString()}</span>
    </div>
    <div class="conversion-card">
      <span class="conversion-label">Esadecimale</span>
      <span class="conversion-value font-mono tabular-nums">${hexStr}</span>
    </div>
  `;
  container.appendChild(footer);

  return container;
}
