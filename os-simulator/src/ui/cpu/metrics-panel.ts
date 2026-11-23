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
      <td style="font-weight: 600;">${m.processId}</td>
      <td>${m.arrivalTime}</td>
      <td>${m.firstRunTime}</td>
      <td>${m.completionTime}</td>
      <td style="font-weight: 600; color: var(--primary);">${m.turnaroundTime}</td>
      <td>${m.responseTime}</td>
      <td>${m.waitTime}</td>
    `;
    tbody.appendChild(tr);
  }

  // Summary Row: Averages
  const tfoot = document.createElement("tfoot");
  tfoot.className = "cpu-metrics-averages-row";
  tfoot.innerHTML = `
    <tr style="border-top: 2px solid var(--border); font-weight: 700; background-color: var(--muted);">
      <td>Media Generale</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td style="color: var(--primary);">${props.averages.turnaround}</td>
      <td>${props.averages.response}</td>
      <td>${props.averages.wait}</td>
    </tr>
  `;
  table.appendChild(tfoot);

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  panelRoot.appendChild(tableWrapper);

  container.appendChild(panelRoot);
}
