import type { SchedulerMetrics } from "../../core/cpu/types.js";

export interface MetricsPanelProps {
  metrics: SchedulerMetrics[];
  averages: {
    turnaround: number;
    response: number;
    wait: number;
  };
}

export function renderMetricsPanel(container: HTMLElement, props: MetricsPanelProps): void {
  container.innerHTML = "";

  const panelRoot = document.createElement("div");
  panelRoot.className = "cpu-metrics-container";

  const title = document.createElement("div");
  title.className = "card-section-title font-title";
  title.textContent = "Metriche di Scheduling e Prestazioni";
  panelRoot.appendChild(title);

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "cpu-table-responsive";

  const table = document.createElement("table");
  table.className = "structure-table font-mono tabular-nums";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Processo</th>
      <th>Arrivo (T_arr)</th>
      <th>Primo Run (T_first)</th>
      <th>Fine (T_comp)</th>
      <th>Turnaround (T_comp - T_arr)</th>
      <th>Response (T_first - T_arr)</th>
      <th>Wait Time (T_turn - CPU)</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const m of props.metrics) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cpu-metrics-cell-label">${m.processId}</td>
      <td class="cpu-metrics-cell-num">${m.arrivalTime}</td>
      <td class="cpu-metrics-cell-num">${m.firstRunTime}</td>
      <td class="cpu-metrics-cell-num">${m.completionTime}</td>
      <td class="cpu-metrics-cell-num cpu-metrics-cell-primary">${m.turnaroundTime}</td>
      <td class="cpu-metrics-cell-num">${m.responseTime}</td>
      <td class="cpu-metrics-cell-num">${m.waitTime}</td>
    `;
    tbody.appendChild(tr);
  }

  // Summary Row: Averages
  const tfoot = document.createElement("tfoot");
  tfoot.className = "cpu-metrics-averages-row";
  tfoot.innerHTML = `
    <tr class="cpu-metrics-row-avg">
      <td class="cpu-metrics-cell-label">Media Generale</td>
      <td class="cpu-metrics-cell-num">-</td>
      <td class="cpu-metrics-cell-num">-</td>
      <td class="cpu-metrics-cell-num">-</td>
      <td class="cpu-metrics-cell-num cpu-metrics-cell-primary">${props.averages.turnaround}</td>
      <td class="cpu-metrics-cell-num">${props.averages.response}</td>
      <td class="cpu-metrics-cell-num">${props.averages.wait}</td>
    </tr>
  `;
  table.appendChild(tfoot);

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  panelRoot.appendChild(tableWrapper);

  container.appendChild(panelRoot);
}
