import type { PluginUi, PluginWidgetHandle, PluginDialogProps } from "learnharness-plugin-api";
import type { ProcessBurst, ProcessWorkload } from "../../core/cpu/types.js";
import { parseWorkloadInput } from "../../core/cpu/types.js";
import { createIcon } from "../icons.js";

function formatBursts(bursts: ProcessBurst[]): string {
  return bursts.map((b) => `${b.type}:${b.duration}`).join(", ");
}

function parseBurstsString(str: string): ProcessBurst[] {
  const parts = str.split(",").map((s) => s.trim()).filter(Boolean);
  const result: ProcessBurst[] = [];
  for (const part of parts) {
    const [rawType, rawDur] = part.split(":").map((s) => s.trim().toLowerCase());
    const type = rawType === "io" ? "io" : "cpu";
    const duration = parseInt(rawDur ?? "1", 10);
    result.push({
      type,
      duration: Number.isNaN(duration) || duration <= 0 ? 1 : duration
    });
  }
  return result.length > 0 ? result : [{ type: "cpu", duration: 10 }];
}

export function openWorkloadEditorModal(
  currentWorkload: ProcessWorkload[],
  onSave: (newWorkload: ProcessWorkload[]) => void,
  onClose: () => void,
  targetContainer?: HTMLElement,
  signal?: AbortSignal,
  ui?: PluginUi
): () => void {
  if (ui && typeof ui.openDialog === "function") {
    let handle: PluginWidgetHandle<PluginDialogProps>;
    const close = () => {
      handle?.dispose();
      onClose();
    };

    handle = ui.openDialog(
      {
        title: "Editor Workload Processi (Zero Constant Cablate)",
        content(container: HTMLElement, dialogSignal: AbortSignal) {
          const wrapper = document.createElement("div");
          wrapper.className = "cpu-workload-modal-form";
          setupWorkloadEditor(wrapper, currentWorkload, onSave, close);
          container.appendChild(wrapper);

          dialogSignal.addEventListener("abort", () => {
            wrapper.remove();
          });
          return () => {
            wrapper.remove();
          };
        },
        onClose() {
          onClose();
        }
      },
      { signal: signal ?? new AbortController().signal }
    );

    return () => handle.dispose();
  }

  const backdrop = document.createElement("div");
  backdrop.className = "cpu-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "cpu-modal-dialog";

  let isClosed = false;

  function close() {
    if (isClosed) return;
    isClosed = true;
    cleanup();
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    }
  }
  document.addEventListener("keydown", handleKeyDown);

  function handleAbort() {
    close();
  }

  if (signal) {
    if (signal.aborted) {
      close();
      return () => {};
    }
    signal.addEventListener("abort", handleAbort, { once: true });
  }

  function cleanup() {
    if (signal) {
      signal.removeEventListener("abort", handleAbort);
    }
    document.removeEventListener("keydown", handleKeyDown);
    backdrop.remove();
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      close();
    }
  });

  const header = document.createElement("div");
  header.className = "cpu-modal-header";

  const title = document.createElement("h3");
  title.className = "cpu-modal-title font-title";
  title.textContent = "Editor Workload Processi (Zero Constant Cablate)";

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn-icon";
  closeBtn.appendChild(createIcon("x", "size-4"));
  closeBtn.addEventListener("click", () => {
    close();
  });

  header.append(title, closeBtn);
  modal.appendChild(header);

  const contentWrapper = document.createElement("div");
  modal.appendChild(contentWrapper);
  setupWorkloadEditor(contentWrapper, currentWorkload, onSave, close);

  backdrop.appendChild(modal);
  const mountTarget = targetContainer ?? document.body;
  mountTarget.appendChild(backdrop);

  return close;
}

function setupWorkloadEditor(
  container: HTMLElement,
  initialWorkload: ProcessWorkload[],
  onSave: (newWorkload: ProcessWorkload[]) => void,
  close: () => void
) {
  let workload: ProcessWorkload[] = JSON.parse(JSON.stringify(initialWorkload));
  let isJsonMode = false;

  function renderView() {
    container.innerHTML = "";

    // Mode switch: Tabella Form vs JSON Raw
    const navBar = document.createElement("div");
    navBar.className = "cpu-modal-nav";

    const tableTab = document.createElement("button");
    tableTab.className = `tab-button ${!isJsonMode ? "tab-active" : ""}`;
    tableTab.textContent = "Editor Tabellare";
    tableTab.addEventListener("click", () => {
      isJsonMode = false;
      renderView();
    });

    const jsonTab = document.createElement("button");
    jsonTab.className = `tab-button ${isJsonMode ? "tab-active" : ""}`;
    jsonTab.textContent = "Import/Export JSON";
    jsonTab.addEventListener("click", () => {
      isJsonMode = true;
      renderView();
    });

    navBar.append(tableTab, jsonTab);
    container.appendChild(navBar);

    // Error Alert Box
    const errorBox = document.createElement("div");
    errorBox.className = "cpu-modal-error";
    errorBox.style.display = "none";
    container.appendChild(errorBox);

    function showError(msg: string) {
      errorBox.textContent = msg;
      errorBox.style.display = "block";
    }

    // Body
    const body = document.createElement("div");
    body.className = "cpu-modal-body";

    if (!isJsonMode) {
      // Table editor
      const table = document.createElement("table");
      table.className = "cpu-workload-edit-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th style="width: 80px;">ID</th>
            <th style="width: 100px;">Arrivo (t)</th>
            <th>Sequenza Bursts (es. cpu:10, io:2, cpu:5)</th>
            <th style="width: 50px;"></th>
          </tr>
        </thead>
      `;

      const tbody = document.createElement("tbody");
      workload.forEach((p, idx) => {
        const tr = document.createElement("tr");

        // ID
        const tdId = document.createElement("td");
        const idInput = document.createElement("input");
        idInput.type = "text";
        idInput.className = "input-text font-mono tabular-nums";
        idInput.value = p.id;
        idInput.addEventListener("input", () => {
          p.id = idInput.value;
        });
        tdId.appendChild(idInput);

        // Arrival
        const tdArr = document.createElement("td");
        const arrInput = document.createElement("input");
        arrInput.type = "number";
        arrInput.className = "input-number font-mono tabular-nums";
        arrInput.min = "0";
        arrInput.value = String(p.arrivalTime);
        arrInput.addEventListener("input", () => {
          p.arrivalTime = parseInt(arrInput.value, 10) || 0;
        });
        tdArr.appendChild(arrInput);

        // Bursts
        const tdBursts = document.createElement("td");
        const burstsInput = document.createElement("input");
        burstsInput.type = "text";
        burstsInput.className = "input-text font-mono tabular-nums";
        burstsInput.value = formatBursts(p.bursts);
        burstsInput.addEventListener("input", () => {
          p.bursts = parseBurstsString(burstsInput.value);
        });
        tdBursts.appendChild(burstsInput);

        // Delete button
        const tdDel = document.createElement("td");
        const delBtn = document.createElement("button");
        delBtn.className = "btn-icon";
        delBtn.title = "Rimuovi processo";
        delBtn.appendChild(createIcon("trash", "size-4"));
        delBtn.addEventListener("click", () => {
          workload.splice(idx, 1);
          renderView();
        });
        tdDel.appendChild(delBtn);

        tr.append(tdId, tdArr, tdBursts, tdDel);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      body.appendChild(table);

      // Add Process button
      const addRowBtn = document.createElement("button");
      addRowBtn.className = "btn btn-outline";
      addRowBtn.style.marginTop = "0.75rem";
      addRowBtn.appendChild(createIcon("plus", "size-4"));
      const addSpan = document.createElement("span");
      addSpan.textContent = "Aggiungi Processo";
      addRowBtn.appendChild(addSpan);
      addRowBtn.addEventListener("click", () => {
        const nextNum = workload.length + 1;
        workload.push({
          id: `P${nextNum}`,
          arrivalTime: 0,
          bursts: [{ type: "cpu", duration: 10 }]
        });
        renderView();
      });
      body.appendChild(addRowBtn);
    } else {
      // JSON editor
      const jsonArea = document.createElement("textarea");
      jsonArea.className = "cpu-json-editor font-mono";
      jsonArea.value = JSON.stringify(workload, null, 2);
      jsonArea.addEventListener("input", () => {
        try {
          const parsed = JSON.parse(jsonArea.value);
          const validation = parseWorkloadInput(parsed);
          if (validation.success) {
            workload = validation.data;
            errorBox.style.display = "none";
          } else {
            showError(validation.error);
          }
        } catch (err) {
          showError(`Sintassi JSON non valida: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      body.appendChild(jsonArea);
    }

    container.appendChild(body);

    // Footer
    const footer = document.createElement("div");
    footer.className = "cpu-modal-footer";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-outline";
    cancelBtn.textContent = "Annulla";
    cancelBtn.addEventListener("click", () => {
      close();
    });

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary";
    saveBtn.textContent = "Salva e Applica";
    saveBtn.addEventListener("click", () => {
      const validation = parseWorkloadInput(workload);
      if (!validation.success) {
        showError(validation.error);
        return;
      }
      onSave(validation.data);
      close();
    });

    footer.append(cancelBtn, saveBtn);
    container.appendChild(footer);
  }

  renderView();
}
