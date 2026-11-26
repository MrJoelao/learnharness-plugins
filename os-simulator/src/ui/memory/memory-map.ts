import type {
  SegmentationSystemConfig,
  LinearPagingConfig,
  MultiLevelPagingConfig,
  TlbConfig,
  TranslationResult,
  MemoryLabSubsystem
} from "../../core/memory/types.js";

function appendTableWithScrollWrap(card: HTMLElement, table: HTMLElement): void {
  const scrollWrap = document.createElement("div");
  scrollWrap.className = "table-scroll-wrap";
  scrollWrap.appendChild(table);
  card.appendChild(scrollWrap);
}

export function renderMemoryMap(
  subsystem: MemoryLabSubsystem,
  config: {
    segmentationConfig?: SegmentationSystemConfig;
    linearPagingConfig?: LinearPagingConfig;
    multiLevelPagingConfig?: MultiLevelPagingConfig;
    tlbConfig?: TlbConfig;
  },
  result: TranslationResult
): HTMLElement {
  const container = document.createElement("div");
  container.className = "memory-map-container";

  const title = document.createElement("h4");
  title.className = "memory-map-header font-title";
  title.textContent = "Mappa della Memoria Fisica & Strutture di Traduzione";
  container.appendChild(title);

  if (subsystem === "segmentation" && config.segmentationConfig) {
    const segConfig = config.segmentationConfig;
    const segmentsCard = document.createElement("div");
    segmentsCard.className = "structure-table-card";
    segmentsCard.innerHTML = `<div class="structure-table-title">Registri di Segmentazione (CPU)</div>`;

    const table = document.createElement("table");
    table.className = "structure-table font-mono tabular-nums";
    table.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Nome</th>
          <th>Crescita</th>
          <th>Base</th>
          <th>Limite</th>
          <th>Intervallo Fisico</th>
          <th>Stato</th>
        </tr>
      </thead>
      <tbody>
        ${segConfig.segments
          .map((seg) => {
            const isAccessed = result.extractedComponents.segmentId === seg.id;
            const rangeStr =
              seg.growth === "positive"
                ? `[${seg.base} .. ${seg.base + seg.limit - 1}]`
                : `[${seg.base - seg.limit} .. ${seg.base - 1}]`;

            return `
            <tr class="${isAccessed ? "row-highlighted" : ""}">
              <td>${seg.id}</td>
              <td>${seg.name}</td>
              <td><span class="growth-tag growth-${seg.growth}">${seg.growth === "positive" ? "+ (crescente)" : "- (decrescente)"}</span></td>
              <td>${seg.base} (0x${seg.base.toString(16)})</td>
              <td>${seg.limit} byte</td>
              <td>${rangeStr}</td>
              <td>${isAccessed ? (result.status === "valid" ? '<span class="status-badge valid">Accesso Valido</span>' : '<span class="status-badge violation">Violazione</span>') : '<span class="text-muted-foreground">-</span>'}</td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    `;
    appendTableWithScrollWrap(segmentsCard, table);
    container.appendChild(segmentsCard);
  } else if (subsystem === "linear-paging" && config.linearPagingConfig) {
    const paging = config.linearPagingConfig;
    const tableCard = document.createElement("div");
    tableCard.className = "structure-table-card";
    tableCard.innerHTML = `<div class="structure-table-title">Page Table Lineare (Memoria di Sistema)</div>`;

    const table = document.createElement("table");
    table.className = "structure-table font-mono tabular-nums";
    table.innerHTML = `
      <thead>
        <tr>
          <th>VPN</th>
          <th>Intervallo Virtuale</th>
          <th>Voce Raw (32-bit)</th>
          <th>Valid</th>
          <th>PFN</th>
          <th>Base Frame Fisico</th>
        </tr>
      </thead>
      <tbody>
        ${paging.pageTable
          .map((entry) => {
            const isAccessed = result.extractedComponents.vpn === entry.vpn;
            const vStart = entry.vpn * paging.pageSize;
            const vEnd = vStart + paging.pageSize - 1;
            const rawHex = entry.rawEntry !== undefined ? "0x" + (entry.rawEntry >>> 0).toString(16).padStart(8, "0") : (entry.valid ? "0x8000000" + entry.pfn.toString(16) : "0x00000000");
            const isValid = entry.rawEntry !== undefined ? (entry.rawEntry >>> 31) === 1 : entry.valid;
            const pfn = entry.rawEntry !== undefined ? (entry.rawEntry & 0x7fffffff) : entry.pfn;
            const fBase = isValid ? pfn * paging.pageSize : null;

            return `
            <tr class="${isAccessed ? "row-highlighted" : ""}">
              <td>${entry.vpn}</td>
              <td>[${vStart} .. ${vEnd}]</td>
              <td>${rawHex}</td>
              <td>${isValid ? '<span class="valid-tag">1 (Valido)</span>' : '<span class="invalid-tag">0 (Non Valido)</span>'}</td>
              <td>${isValid ? pfn : "-"}</td>
              <td>${fBase !== null ? `${fBase} (0x${fBase.toString(16)})` : "-"}</td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    `;
    appendTableWithScrollWrap(tableCard, table);
    container.appendChild(tableCard);

    // Frame Grid
    const frameCount = Math.min(32, Math.floor(paging.physicalMemorySize / paging.pageSize));
    const gridCard = document.createElement("div");
    gridCard.className = "frame-grid-card";
    gridCard.innerHTML = `<div class="structure-table-title">Frame della Memoria Fisica (Page Size: ${paging.pageSize} B, Memoria: ${paging.physicalMemorySize} B)</div>`;

    const grid = document.createElement("div");
    grid.className = "frame-grid";

    for (let f = 0; f < frameCount; f++) {
      const isTarget = result.status === "valid" && result.extractedComponents.pfn === f;
      const mappedEntry = paging.pageTable.find((e) => {
        const v = e.rawEntry !== undefined ? (e.rawEntry >>> 31) === 1 : e.valid;
        const p = e.rawEntry !== undefined ? (e.rawEntry & 0x7fffffff) : e.pfn;
        return v && p === f;
      });

      const frameBox = document.createElement("div");
      frameBox.className = `frame-box ${isTarget ? "frame-target-highlight" : mappedEntry ? "frame-allocated" : "frame-free"}`;
      frameBox.innerHTML = `
        <div class="frame-pfn font-mono">Frame ${f}</div>
        <div class="frame-base font-mono">0x${(f * paging.pageSize).toString(16)}</div>
        <div class="frame-status">${isTarget ? "TARGET" : mappedEntry ? `VPN ${mappedEntry.vpn}` : "Libero"}</div>
      `;
      grid.appendChild(frameBox);
    }
    gridCard.appendChild(grid);
    container.appendChild(gridCard);
  } else if (subsystem === "multi-level" && config.multiLevelPagingConfig) {
    const ml = config.multiLevelPagingConfig;
    const card = document.createElement("div");
    card.className = "structure-table-card";
    card.innerHTML = `<div class="structure-table-title">Page Directory (Livello 1) & Tabelle Associate</div>`;

    const table = document.createElement("table");
    table.className = "structure-table font-mono tabular-nums";
    table.innerHTML = `
      <thead>
        <tr>
          <th>PD Index</th>
          <th>Valid</th>
          <th>PT PFN</th>
          <th>Pagine Allocata nel Secondo Livello</th>
        </tr>
      </thead>
      <tbody>
        ${ml.pageDirectory
          .map((pde) => {
            const isAccessed = result.extractedComponents.pdIndex === pde.pdIndex;
            const tableEntriesCount = pde.table ? pde.table.filter((t) => t.valid).length : 0;
            return `
            <tr class="${isAccessed ? "row-highlighted" : ""}">
              <td>${pde.pdIndex}</td>
              <td>${pde.valid ? '<span class="valid-tag">1 (Allocata)</span>' : '<span class="invalid-tag">0 (Non allocata)</span>'}</td>
              <td>${pde.valid ? pde.ptPfn : "-"}</td>
              <td>${pde.valid ? `${tableEntriesCount} PTE valide` : "Spazio non mappato"}</td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    `;
    appendTableWithScrollWrap(card, table);
    container.appendChild(card);
  } else if (subsystem === "tlb" && config.tlbConfig) {
    const tlb = config.tlbConfig;
    const card = document.createElement("div");
    card.className = "structure-table-card";
    card.innerHTML = `<div class="structure-table-title">Voci Cache TLB (Capacità: ${tlb.capacity}, ASID: ${tlb.asidSupport ? "Abilitato" : "Disabilitato"})</div>`;

    const table = document.createElement("table");
    table.className = "structure-table font-mono tabular-nums";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Slot</th>
          <th>VPN</th>
          <th>PFN</th>
          <th>Valid</th>
          ${tlb.asidSupport ? "<th>ASID</th>" : ""}
          <th>Ultimo Ciclo</th>
          <th>Stato</th>
        </tr>
      </thead>
      <tbody>
        ${tlb.entries
          .map((entry, idx) => {
            const isMatch = entry.valid && result.extractedComponents.vpn === entry.vpn;
            return `
            <tr class="${isMatch ? "row-highlighted" : ""}">
              <td>${idx}</td>
              <td>${entry.vpn}</td>
              <td>${entry.pfn}</td>
              <td>${entry.valid ? '<span class="valid-tag">1</span>' : '<span class="invalid-tag">0</span>'}</td>
              ${tlb.asidSupport ? `<td>${entry.asid}</td>` : ""}
              <td>${entry.lastUsedCycle}</td>
              <td>${isMatch ? '<span class="status-badge valid">TLB HIT</span>' : '<span class="text-muted-foreground">-</span>'}</td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    `;
    appendTableWithScrollWrap(card, table);
    container.appendChild(card);
  }

  return container;
}
