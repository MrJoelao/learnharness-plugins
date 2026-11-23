import type { PluginUi } from "learnharness-plugin-api";
import type { LabMode, SavedExercise, ControlAction, AiTurnRequest, AiTurnResponse } from "../../types/ai.js";

export type CopilotUiMode = "pill" | "sheet" | "drawer" | "minimized";

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  generatedExercise?: SavedExercise;
  controlActions?: ControlAction[];
  toolCalls?: unknown[];
  error?: string;
}

export interface CopilotPromptChip {
  id: string;
  label: string;
  prompt: string;
  category?: string;
}

export const OSTEP_PROMPT_CHIPS: Record<LabMode, readonly CopilotPromptChip[]> = {
  "memory-lab": [
    {
      id: "mem-seg-fault",
      label: "Segment Fault Test",
      prompt: "Configura una violazione di limite su Segmento 0 o Segmento 1 e spiegami passo per passo il calcolo dell'indirizzo fisico in conformità a OSTEP."
    },
    {
      id: "mem-two-level",
      label: "Multi-Level Paging",
      prompt: "Mostrami come il paging a due livelli risparmia memoria rispetto a una tabella lineare nel caso di uno spazio di indirizzi sparso."
    },
    {
      id: "mem-belady",
      label: "Anomalia di Belàdy",
      prompt: "Dimostra l'Anomalia di Belàdy con politica FIFO sulla traccia [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5], evidenziando il peggioramento da 3 a 4 frame."
    },
    {
      id: "mem-tlb-asid",
      label: "TLB Hit & ASID",
      prompt: "Spiega come l'ASID (Address Space Identifier) nel TLB previene il flush totale durante il context switch tra processi."
    }
  ],
  "cpu-lab": [
    {
      id: "cpu-mlfq-allotment",
      label: "MLFQ Allotment Demotion",
      prompt: "Genera un workload che illustri la Regola 4 di MLFQ: demotion dopo esaurimento dell'allotment temporale cumulativo."
    },
    {
      id: "cpu-stcf-preemption",
      label: "STCF Preemption",
      prompt: "Crea uno scenario di scheduling dove un processo breve preempta un processo lungo sotto politica STCF."
    },
    {
      id: "cpu-lde-trap",
      label: "LDE Trap Frame",
      prompt: "Spiega la transizione hardware Ring 3 -> Ring 0 tramite IDT e cosa viene salvato sul Trap Frame nello stack kernel."
    },
    {
      id: "cpu-mlfq-boost",
      label: "MLFQ Priority Boost",
      prompt: "In che modo la Regola 5 di MLFQ (Priority Boost periodico) previene la starvation dei processi CPU-bound?"
    }
  ],
  "concurrency-lab": [
    {
      id: "conc-lost-update",
      label: "Lost Update Race",
      prompt: "Mostrami il Lost Update su x++ spiegando il disassemblato assembly (mov, add, mov) e l'interleaving dei thread."
    },
    {
      id: "conc-mesa-while",
      label: "Mesa vs Hoare Semantics",
      prompt: "Perché in semantica Mesa il controllo della condition variable richiede rigorosamente un ciclo while anziché un if?"
    },
    {
      id: "conc-bounded-1cv",
      label: "Bounded Buffer 1 CV Deadlock",
      prompt: "Spiega perché l'uso di una sola condition variable causa deadlock nel Bounded Buffer e come due CV risolvono il problema."
    },
    {
      id: "conc-coffman-dining",
      label: "5 Filosofi Coffman",
      prompt: "Analizza le 4 condizioni di Coffman nei 5 filosofi e come la soluzione asimmetrica rompe il ciclo nel Resource Allocation Graph (RAG)."
    }
  ]
};

export function getOstepPromptChips(mode: LabMode): readonly CopilotPromptChip[] {
  return OSTEP_PROMPT_CHIPS[mode] ?? [];
}

export interface SuggestionsLoadResult {
  enabled: boolean;
  chips: readonly CopilotPromptChip[];
}

export interface CopilotDrawerOptions {
  mode: LabMode;
  initialState?: CopilotUiMode;
  onApplyExercise?: (exercise: SavedExercise) => void;
  onExecuteControlAction?: (action: ControlAction) => void;
  getSimulatorSnapshot?: () => unknown;
  onHistoryChange?: (exercises: SavedExercise[]) => void;
  initialExercises?: SavedExercise[];
  backendCall?: (request: AiTurnRequest) => Promise<AiTurnResponse>;
  loadSuggestions?: (mode: LabMode) => Promise<SuggestionsLoadResult>;
  onSettingsChanged?: (listener: () => void) => () => void;
  targetContainer?: HTMLElement;
  signal?: AbortSignal;
  ui?: PluginUi;
  autoApplyExercise?: boolean;
  onTurnResponse?: (response: AiTurnResponse) => void;
}
