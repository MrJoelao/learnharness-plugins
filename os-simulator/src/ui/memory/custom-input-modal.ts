import type {
  MemoryLabState,
  SegmentationSystemConfig,
  LinearPagingConfig,
  PageReplacementConfig
} from "../../core/memory/types.js";
import {
  parseAddressInput,
  parseReferenceString,
  parseNumberInRange
} from "../../core/memory/types.js";
import { createIcon } from "../icons.js";

export function openCustomInputModal(
  state: MemoryLabState,
  onSave: (updates: Partial<MemoryLabState>) => void,
  targetContainer?: HTMLElement,
  signal?: AbortSignal
): () => void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const close = () => {
    window.removeEventListener("keydown", handleKeyDown);
    if (signal) {
      signal.removeEventListener("abort", close);
    }
    overlay.remove();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  if (signal) {
    signal.addEventListener("abort", close, { once: true });
  }

  const modal = document.createElement("div");
  modal.className = "modal-dialog";

  const header = document.createElement("div");
  header.className = "modal-header";
  header.innerHTML = `
    <h3 class="modal-title font-title">Configurazione Parametrica Personalizzata</h3>
  `;
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn-icon";
  closeBtn.appendChild(createIcon("x"));
  closeBtn.addEventListener("click", () => close());
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const body = document.createElement("div");
  body.className = "modal-body";

  const errorContainer = document.createElement("div");
  errorContainer.className = "modal-error hidden";
  body.appendChild(errorContainer);

  const showError = (msg: string) => {
    errorContainer.textContent = msg;
    errorContainer.classList.remove("hidden");
  };

  if (state.subsystem === "segmentation") {
    const cfg = state.segmentationConfig;
    body.innerHTML += `
      <div class="form-group">
        <label class="form-label">Bit Spazio Virtuale (es. 10 per 1024 B, 14 per 16384 B):</label>
        <input type="number" id="seg-as-bits" class="input-text font-mono" value="${cfg.addressSpaceBits}" min="8" max="32" />
      </div>
      <div class="form-group">
        <label class="form-label">Bit Selettore Segmento (es. 1 per 2 segmenti):</label>
        <input type="number" id="seg-bits" class="input-text font-mono" value="${cfg.segmentBits}" min="1" max="4" />
      </div>
      <div class="form-group">
        <label class="form-label">Dimensione Memoria Fisica (byte, es. 16384):</label>
        <input type="number" id="seg-phys-mem" class="input-text font-mono" value="${cfg.physicalMemorySize}" min="256" />
      </div>
      <div class="form-group">
        <label class="form-label">Segmento 0 - Base e Limite (crescita positiva):</label>
        <div class="grid-2">
          <input type="number" id="seg0-base" class="input-text font-mono" placeholder="Base" value="${cfg.segments[0]?.base ?? 6890}" />
          <input type="number" id="seg0-limit" class="input-text font-mono" placeholder="Limite" value="${cfg.segments[0]?.limit ?? 472}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Segmento 1 - Base e Limite (crescita negativa):</label>
        <div class="grid-2">
          <input type="number" id="seg1-base" class="input-text font-mono" placeholder="Base" value="${cfg.segments[1]?.base ?? 4692}" />
          <input type="number" id="seg1-limit" class="input-text font-mono" placeholder="Limite" value="${cfg.segments[1]?.limit ?? 450}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Traccia Indirizzi Virtuali (separati da virgola o spazio, es. 523, 414, 802):</label>
        <input type="text" id="seg-trace" class="input-text font-mono" value="${state.trace.join(", ")}" />
      </div>
    `;
  } else if (state.subsystem === "linear-paging") {
    const cfg = state.linearPagingConfig;
    body.innerHTML += `
      <div class="form-group">
        <label class="form-label">Bit Spazio Virtuale (es. 14 per 16 KB):</label>
        <input type="number" id="page-as-bits" class="input-text font-mono" value="${cfg.addressSpaceBits}" min="8" max="32" />
      </div>
      <div class="form-group">
        <label class="form-label">Dimensione Pagina (byte, es. 4096 o 64):</label>
        <input type="number" id="page-size" class="input-text font-mono" value="${cfg.pageSize}" min="16" />
      </div>
      <div class="form-group">
        <label class="form-label">Dimensione Memoria Fisica (byte, es. 65536):</label>
        <input type="number" id="page-phys-mem" class="input-text font-mono" value="${cfg.physicalMemorySize}" min="256" />
      </div>
      <div class="form-group">
        <label class="form-label">Traccia Indirizzi Virtuali (es. 12841, 4969, 7808):</label>
        <input type="text" id="page-trace" class="input-text font-mono" value="${state.trace.join(", ")}" />
      </div>
    `;
  } else if (state.subsystem === "replacement") {
    const cfg = state.replacementConfig;
    body.innerHTML += `
      <div class="form-group">
        <label class="form-label">Numero di Frame Fisici (es. 3 o 4):</label>
        <input type="number" id="rep-frame-count" class="input-text font-mono" value="${cfg.frameCount}" min="1" max="16" />
      </div>
      <div class="form-group">
        <label class="form-label">Stringa di Riferimento Pagine (es. 1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5):</label>
        <input type="text" id="rep-ref-string" class="input-text font-mono" value="${cfg.referenceString.join(", ")}" />
      </div>
    `;
  } else {
    body.innerHTML += `
      <div class="form-group">
        <label class="form-label">Traccia Indirizzi Virtuali (es. 0, 4096, 0x1000):</label>
        <input type="text" id="generic-trace" class="input-text font-mono" value="${state.trace.join(", ")}" />
      </div>
    `;
  }

  modal.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const btnCancel = document.createElement("button");
  btnCancel.className = "btn btn-outline";
  btnCancel.textContent = "Annulla";
  btnCancel.addEventListener("click", () => close());

  const btnSave = document.createElement("button");
  btnSave.className = "btn btn-primary";
  btnSave.textContent = "Applica Configurazione";
  btnSave.addEventListener("click", () => {
    try {
      if (state.subsystem === "segmentation") {
        const asBitsRes = parseNumberInRange((modal.querySelector("#seg-as-bits") as HTMLInputElement).value, 8, 32, "Bit spazio virtuale");
        if (!asBitsRes.success || asBitsRes.data === undefined) return showError(asBitsRes.error || "Errore");

        const segBitsRes = parseNumberInRange((modal.querySelector("#seg-bits") as HTMLInputElement).value, 1, 4, "Bit selettore segmento");
        if (!segBitsRes.success || segBitsRes.data === undefined) return showError(segBitsRes.error || "Errore");

        const physMemRes = parseNumberInRange((modal.querySelector("#seg-phys-mem") as HTMLInputElement).value, 256, 1073741824, "Memoria fisica");
        if (!physMemRes.success || physMemRes.data === undefined) return showError(physMemRes.error || "Errore");

        const base0Res = parseNumberInRange((modal.querySelector("#seg0-base") as HTMLInputElement).value, 0, physMemRes.data, "Base Segmento 0");
        if (!base0Res.success || base0Res.data === undefined) return showError(base0Res.error || "Errore Base Segmento 0");

        const limit0Res = parseNumberInRange((modal.querySelector("#seg0-limit") as HTMLInputElement).value, 1, physMemRes.data, "Limite Segmento 0");
        if (!limit0Res.success || limit0Res.data === undefined) return showError(limit0Res.error || "Errore Limite Segmento 0");

        if (base0Res.data + limit0Res.data > physMemRes.data) {
          return showError(`Segmento 0: Base (${base0Res.data}) + Limite (${limit0Res.data}) supera la memoria fisica (${physMemRes.data} B).`);
        }

        const base1Res = parseNumberInRange((modal.querySelector("#seg1-base") as HTMLInputElement).value, 0, physMemRes.data, "Base Segmento 1");
        if (!base1Res.success || base1Res.data === undefined) return showError(base1Res.error || "Errore Base Segmento 1");

        const limit1Res = parseNumberInRange((modal.querySelector("#seg1-limit") as HTMLInputElement).value, 1, physMemRes.data, "Limite Segmento 1");
        if (!limit1Res.success || limit1Res.data === undefined) return showError(limit1Res.error || "Errore Limite Segmento 1");

        if (base1Res.data + limit1Res.data > physMemRes.data) {
          return showError(`Segmento 1: Base (${base1Res.data}) + Limite (${limit1Res.data}) supera la memoria fisica (${physMemRes.data} B).`);
        }

        if (base1Res.data < limit1Res.data) {
          return showError(`Segmento 1 (stack decrescente): Base (${base1Res.data}) non può essere inferiore al limite (${limit1Res.data}).`);
        }

        const traceStr = (modal.querySelector("#seg-trace") as HTMLInputElement).value;
        const traceRes = parseReferenceString(traceStr);
        if (!traceRes.success || !traceRes.data) return showError(traceRes.error || "Traccia non valida");

        const nextSegConfig: SegmentationSystemConfig = {
          addressSpaceBits: asBitsRes.data,
          segmentBits: segBitsRes.data,
          physicalMemorySize: physMemRes.data,
          segments: [
            {
              id: 0,
              name: "SEG0 (Codice/Heap)",
              base: base0Res.data,
              limit: limit0Res.data,
              growth: "positive"
            },
            {
              id: 1,
              name: "SEG1 (Stack)",
              base: base1Res.data,
              limit: limit1Res.data,
              growth: "negative"
            }
          ]
        };

        onSave({
          segmentationConfig: nextSegConfig,
          trace: traceRes.data,
          currentTraceIndex: 0,
          currentVa: traceRes.data[0] ?? 0,
          vaInputString: String(traceRes.data[0] ?? 0)
        });
        close();
      } else if (state.subsystem === "linear-paging") {
        const asBitsRes = parseNumberInRange((modal.querySelector("#page-as-bits") as HTMLInputElement).value, 8, 32, "Bit spazio virtuale");
        if (!asBitsRes.success || asBitsRes.data === undefined) return showError(asBitsRes.error || "Errore");

        const pageSizeRes = parseNumberInRange((modal.querySelector("#page-size") as HTMLInputElement).value, 16, 1048576, "Dimensione pagina");
        if (!pageSizeRes.success || pageSizeRes.data === undefined) return showError(pageSizeRes.error || "Errore");

        const physMemRes = parseNumberInRange((modal.querySelector("#page-phys-mem") as HTMLInputElement).value, 256, 1073741824, "Memoria fisica");
        if (!physMemRes.success || physMemRes.data === undefined) return showError(physMemRes.error || "Errore");

        const traceStr = (modal.querySelector("#page-trace") as HTMLInputElement).value;
        const traceRes = parseReferenceString(traceStr);
        if (!traceRes.success || !traceRes.data) return showError(traceRes.error || "Traccia non valida");

        const nextPagingConfig: LinearPagingConfig = {
          ...state.linearPagingConfig,
          addressSpaceBits: asBitsRes.data,
          pageSize: pageSizeRes.data,
          physicalMemorySize: physMemRes.data
        };

        onSave({
          linearPagingConfig: nextPagingConfig,
          trace: traceRes.data,
          currentTraceIndex: 0,
          currentVa: traceRes.data[0] ?? 0,
          vaInputString: String(traceRes.data[0] ?? 0)
        });
        close();
      } else if (state.subsystem === "replacement") {
        const frameCountRes = parseNumberInRange((modal.querySelector("#rep-frame-count") as HTMLInputElement).value, 1, 16, "Frame count");
        if (!frameCountRes.success || frameCountRes.data === undefined) return showError(frameCountRes.error || "Errore");

        const refStr = (modal.querySelector("#rep-ref-string") as HTMLInputElement).value;
        const refRes = parseReferenceString(refStr);
        if (!refRes.success || !refRes.data) return showError(refRes.error || "Stringa di riferimento non valida");

        const nextRepConfig: PageReplacementConfig = {
          ...state.replacementConfig,
          frameCount: frameCountRes.data,
          referenceString: refRes.data
        };

        onSave({
          replacementConfig: nextRepConfig,
          currentTraceIndex: 0
        });
        close();
      } else {
        const traceStr = (modal.querySelector("#generic-trace") as HTMLInputElement).value;
        const traceRes = parseReferenceString(traceStr);
        if (!traceRes.success || !traceRes.data) return showError(traceRes.error || "Traccia non valida");

        onSave({
          trace: traceRes.data,
          currentTraceIndex: 0,
          currentVa: traceRes.data[0] ?? 0,
          vaInputString: String(traceRes.data[0] ?? 0)
        });
        close();
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  });

  footer.append(btnCancel, btnSave);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  (targetContainer ?? document.body).appendChild(overlay);
  return close;
}
