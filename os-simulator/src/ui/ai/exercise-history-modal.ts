import type { PluginUi, PluginWidgetHandle, PluginDialogProps } from "learnharness-plugin-api";
import type { SavedExercise } from "../../types/ai.js";
import { createIcon } from "../icons.js";

export interface ExerciseHistoryModalOptions {
  exercises: SavedExercise[];
  onLoadExercise: (exercise: SavedExercise) => void;
  onUpdateMetadata: (
    exerciseId: string,
    updates: { title: string; consegna: string }
  ) => void;
  onDeleteExercise: (exerciseId: string) => void;
  targetContainer?: HTMLElement;
  signal?: AbortSignal;
  ui?: PluginUi;
}

export function openExerciseHistoryModal(
  options: ExerciseHistoryModalOptions
): () => void {
  let list = [...options.exercises];
  let editingId: string | null = null;

  if (options.ui && typeof options.ui.openDialog === "function") {
    let handle: PluginWidgetHandle<PluginDialogProps>;
    const close = () => {
      handle?.dispose();
    };

    handle = options.ui.openDialog(
      {
        title: "Cronologia Esercizi",
        content(container: HTMLElement, dialogSignal: AbortSignal) {
          const modal = document.createElement("div");
          modal.className = "copilot-history-dialog-content";

          function render() {
            modal.innerHTML = "";
            renderHistoryBody(modal, list, options, editingId, (id) => {
              editingId = id;
              render();
            }, (updatedList) => {
              list = updatedList;
              render();
            }, close);
          }

          render();
          container.appendChild(modal);

          dialogSignal.addEventListener("abort", () => {
            modal.remove();
          });

          return () => {
            modal.remove();
          };
        }
      },
      { signal: options.signal ?? new AbortController().signal }
    );

    return () => handle.dispose();
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay copilot-history-overlay";

  const close = () => {
    window.removeEventListener("keydown", handleKeyDown);
    if (options.signal) {
      options.signal.removeEventListener("abort", close);
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

  if (options.signal) {
    options.signal.addEventListener("abort", close, { once: true });
  }

  const modal = document.createElement("div");
  modal.className = "modal-dialog copilot-history-dialog";

  function render() {
    modal.innerHTML = "";

    const header = document.createElement("div");
    header.className = "modal-header";

    const titleContainer = document.createElement("div");
    titleContainer.className = "copilot-history-header-title";

    const historyIcon = createIcon("history", "size-5 text-primary");
    const h3 = document.createElement("h3");
    h3.className = "modal-title font-title";
    h3.textContent = "Cronologia Esercizi";

    const countBadge = document.createElement("span");
    countBadge.className = "copilot-history-count font-mono tabular-nums";
    countBadge.textContent = `${list.length} ${list.length === 1 ? "esercizio" : "esercizi"}`;

    titleContainer.append(historyIcon, h3, countBadge);

    const closeBtn = document.createElement("button");
    closeBtn.className = "btn-icon";
    closeBtn.setAttribute("aria-label", "Chiudi cronologia");
    closeBtn.appendChild(createIcon("x", "size-4"));
    closeBtn.addEventListener("click", () => close());

    header.append(titleContainer, closeBtn);
    modal.appendChild(header);

    renderHistoryBody(modal, list, options, editingId, (id) => {
      editingId = id;
      render();
    }, (updatedList) => {
      list = updatedList;
      render();
    }, close);
  }

  render();
  overlay.appendChild(modal);
  (options.targetContainer ?? document.body).appendChild(overlay);

  return close;
}

function renderHistoryBody(
  container: HTMLElement,
  list: SavedExercise[],
  options: ExerciseHistoryModalOptions,
  editingId: string | null,
  setEditingId: (id: string | null) => void,
  setList: (newList: SavedExercise[]) => void,
  close: () => void
) {

    const body = document.createElement("div");
    body.className = "modal-body copilot-history-body";

    if (list.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "copilot-history-empty text-muted-foreground";
      emptyState.textContent = "Nessun esercizio salvato. Genera nuovi esercizi dall'assistente o creane di personalizzati.";
      body.appendChild(emptyState);
    } else {
      const listContainer = document.createElement("div");
      listContainer.className = "copilot-history-list";

      for (const ex of list) {
        const card = document.createElement("div");
        card.className = "copilot-exercise-card";
        card.dataset.id = ex.id;
        card.dataset.source = ex.sourceTag;

        if (editingId === ex.id) {
          const editForm = document.createElement("div");
          editForm.className = "copilot-exercise-edit-form";

          const titleLabel = document.createElement("label");
          titleLabel.className = "form-label";
          titleLabel.textContent = "Titolo Esercizio";
          const titleInput = document.createElement("input");
          titleInput.type = "text";
          titleInput.className = "input-text font-title font-semibold w-full";
          titleInput.value = ex.title;

          const consegnaLabel = document.createElement("label");
          consegnaLabel.className = "form-label mt-2";
          consegnaLabel.textContent = "Consegna e Obiettivi Didattici";
          const consegnaInput = document.createElement("textarea");
          consegnaInput.className = "input-text font-sans text-xs w-full";
          consegnaInput.rows = 3;
          consegnaInput.value = ex.consegna;

          const editActions = document.createElement("div");
          editActions.className = "copilot-exercise-edit-actions";

          const btnCancelEdit = document.createElement("button");
          btnCancelEdit.type = "button";
          btnCancelEdit.className = "btn btn-outline btn-sm";
          btnCancelEdit.textContent = "Annulla";
          btnCancelEdit.addEventListener("click", () => {
            setEditingId(null);
          });

          const btnSaveEdit = document.createElement("button");
          btnSaveEdit.type = "button";
          btnSaveEdit.className = "btn btn-primary btn-sm";
          btnSaveEdit.textContent = "Salva Metadati";
          btnSaveEdit.addEventListener("click", () => {
            const newTitle = titleInput.value.trim() || ex.title;
            const newConsegna = consegnaInput.value.trim() || ex.consegna;
            options.onUpdateMetadata(ex.id, { title: newTitle, consegna: newConsegna });
            ex.title = newTitle;
            ex.consegna = newConsegna;
            setEditingId(null);
          });

          editActions.append(btnCancelEdit, btnSaveEdit);
          editForm.append(titleLabel, titleInput, consegnaLabel, consegnaInput, editActions);
          card.appendChild(editForm);
        } else {
          const topRow = document.createElement("div");
          topRow.className = "copilot-exercise-card-header";

          const titleWrapper = document.createElement("div");
          titleWrapper.className = "copilot-exercise-title-wrapper";

          const titleEl = document.createElement("h4");
          titleEl.className = "copilot-exercise-title font-title";
          titleEl.textContent = ex.title;

          const sourceBadge = document.createElement("span");
          if (ex.sourceTag === "ai") {
            sourceBadge.className = "copilot-badge copilot-badge-ai";
            sourceBadge.append(createIcon("bot", "size-3 shrink-0"), document.createTextNode("AI"));
          } else {
            sourceBadge.className = "copilot-badge copilot-badge-manual";
            sourceBadge.textContent = "Manuale";
          }

          const modeBadge = document.createElement("span");
          modeBadge.className = "copilot-badge copilot-badge-mode font-mono";
          modeBadge.textContent = ex.mode;

          titleWrapper.append(titleEl, sourceBadge, modeBadge);

          const dateEl = document.createElement("span");
          dateEl.className = "copilot-exercise-date font-mono tabular-nums text-xs text-muted-foreground";
          try {
            const d = new Date(ex.date);
            dateEl.textContent = `${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
          } catch {
            dateEl.textContent = ex.date;
          }

          topRow.append(titleWrapper, dateEl);
          card.appendChild(topRow);

          const consegnaEl = document.createElement("p");
          consegnaEl.className = "copilot-exercise-consegna";
          consegnaEl.textContent = ex.consegna;
          card.appendChild(consegnaEl);

          const actionsRow = document.createElement("div");
          actionsRow.className = "copilot-exercise-card-actions";

          const btnLoad = document.createElement("button");
          btnLoad.type = "button";
          btnLoad.className = "btn btn-primary btn-sm btn-load-exercise";
          btnLoad.append(createIcon("play", "size-3.5"), document.createTextNode("Carica nel Simulatore"));
          btnLoad.addEventListener("click", () => {
            options.onLoadExercise(ex);
            close();
          });

          const btnEdit = document.createElement("button");
          btnEdit.type = "button";
          btnEdit.className = "btn btn-outline btn-sm btn-edit-metadata";
          btnEdit.append(createIcon("edit", "size-3.5"), document.createTextNode("Modifica Metadati"));
          btnEdit.addEventListener("click", () => {
            setEditingId(ex.id);
          });

          const btnDelete = document.createElement("button");
          btnDelete.type = "button";
          btnDelete.className = "btn btn-outline btn-sm text-destructive btn-delete-exercise";
          btnDelete.append(createIcon("trash", "size-3.5"), document.createTextNode("Elimina"));
          btnDelete.addEventListener("click", () => {
            options.onDeleteExercise(ex.id);
            setList(list.filter((item) => item.id !== ex.id));
          });

          actionsRow.append(btnLoad, btnEdit, btnDelete);
          card.appendChild(actionsRow);
        }

        listContainer.appendChild(card);
      }
      body.appendChild(listContainer);
    }

    container.appendChild(body);
}
