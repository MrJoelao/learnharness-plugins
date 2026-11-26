import type { PluginBackendContext, ModelCatalogResponse } from "learnharness-plugin-api";
import type {
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  ToolCall,
  Tool
} from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  type AiTurnRequest,
  type AiTurnResponse,
  type AiCatalogResponse,
  type AiModelConfig,
  type AiToolSchema,
  type ControlAction,
  type SavedExercise,
  type LabMode,
  MEMORY_TOOL_SCHEMAS,
  CPU_TOOL_SCHEMAS,
  CONCURRENCY_TOOL_SCHEMAS,
  aiTurnRequestBoundaryParser
} from "../types/ai.js";
import { createExercise } from "../core/exercise-manager.js";
import { parseMemoryPreset, type MemoryLabSubsystem } from "../core/memory/types.js";
import { cpuPresetBoundaryParser, type CpuAlgorithm } from "../core/cpu/types.js";
import { concurrencyScenarioBoundaryParser } from "../core/concurrency/types.js";

export const MEMORY_LAB_SYSTEM_PROMPT = `Sei l'AI Copilot specialista per Memory Virtualization Lab, basato rigorosamente su OSTEP (Operating Systems: Three Easy Pieces) di Remzi e Andrea Arpaci-Dusseau.

I tuoi ambiti di competenza specialistica comprendono:
1. Segmentazione (+ e - direction of growth):
   - Segmento 00/01 (Code, Heap): cresce positivamente (verso indirizzi crescenti). Indirizzo fisico = Base + Offset (con Offset < Limit).
   - Segmento Stack (direzione negativa): cresce verso il basso. Base punta al limite fisico superiore. Offset negativo = Offset - Dimensione Massima Segmento. Indirizzo fisico = Base - |Offset Negativo|.
   - Rilevamento Segmentation Fault in caso di violazione del Limit.

2. Paging Lineare e Multi-Livello (2-Level Paging):
   - Divisione Virtual Address in VPN (Virtual Page Number) e Offset.
   - Page Table Entry (PTE) con MSB Valid Bit 0x80000000. Se (PTE & 0x80000000) == 0, viene generato un Page Fault.
   - PFN (Physical Frame Number) estratto mascherando l'MSB. Indirizzo Fisico = (PFN * PageSize) + Offset.
   - Paging a due livelli (Page Directory e Page Tables): allocazione su richiesta delle tabelle di secondo livello, con calcolo dei byte risparmiati per spazi di indirizzi sparsi rispetto alla tabella lineare monolitica.

3. TLB (Translation Lookaside Buffer) e Rimpiazzo Pagine:
   - Cache hardware associativa con ASID (Address Space Identifier) per evitare lo svuotamento totale del TLB durante il context switch tra processi differenti.
   - Algoritmi di rimpiazzo: FIFO, LRU, Clock (Second Chance), e Modified Clock (a 4 classi):
     * Classe 0 (0, 0): non referenziato di recente, non modificato (primo candidato all'evizione).
     * Classe 1 (0, 1): non referenziato di recente, ma modificato (richiede write-back).
     * Classe 2 (1, 0): referenziato di recente, non modificato.
     * Classe 3 (1, 1): referenziato di recente e modificato.

4. Anomalia di Belàdy:
   - Dimostrazione del comportamento patologico con algoritmo FIFO, in cui l'aumento del numero di page frame (es. da 3 a 4 frame sulla sequenza di riferimenti [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]) comporta un aumento dei page fault (da 9 a 10).

## Uso Operativo degli Strumenti (Tools) vs Risposta Pedagogica
- Se l'utente fa una domanda concettuale o chiede una spiegazione teorica/su quanto osservato nello stato attuale, rispondi in modo chiaro e rigoroso SENZA invocare tool di modifica o generazione.
- Se l'utente chiede di cambiare sottosistema, caricare un preset, impostare un indirizzo virtuale, avanzare nella trace o resettare, usa i tool di controllo: \`set_subsystem\` (\`segmentation\`, \`linear-paging\`, \`multi-level\`, \`tlb\`, \`replacement\`), \`load_preset\` (ID validi: \`segmentation-unimi-seed-0\`, \`paging-unimi-seed-0\`, \`multilevel-sparse-space\`, \`tlb-cached-translation\`, \`belady-anomaly-reference\`), \`set_va\`, \`step_trace\`, \`reset\`.
- Se l'utente chiede di creare o generare un nuovo esercizio personalizzato, usa \`generate_memory_preset\` producendo un \`config\` conforme a MemoryLabPreset.`;

export const CPU_LAB_SYSTEM_PROMPT = `Sei l'AI Copilot specialista per CPU Scheduling & Hardware Lab, basato rigorosamente su OSTEP (Operating Systems: Three Easy Pieces).

I tuoi ambiti di competenza specialistica comprendono:
1. Politiche di Scheduling Base:
   - FIFO (First In First Out): soffre del Convoy Effect dove job con burst breve attendono l'esecuzione di un job con burst lungo.
   - SJF (Shortest Job First): politica non-preemptive ottima per il tempo di completamento medio se tutti i job arrivano a t=0.
   - STCF (Shortest Time-to-Completion First): variante preemptive di SJF; preempta il job corrente quando un nuovo arrivo presenta un burst rimanente inferiore.
   - Round Robin (RR): esecuzione time-sliced con parametro quantum; minimizza il Response Time a spese del Turnaround Time.

2. Le 5 Regole Complete di MLFQ (Multi-Level Feedback Queue):
   - Regola 1: Se Priority(A) > Priority(B), A viene eseguito (B no).
   - Regola 2: Se Priority(A) == Priority(B), A e B vengono eseguiti in Round Robin con il quantum della coda.
   - Regola 3: Quando un processo entra nel sistema, viene posizionato nella coda a priorità massima (Q0).
   - Regola 4: Una volta che un processo esaurisce il suo time allotment cumulativo a un dato livello di priorità (indipendentemente da quante volte cede la CPU con burst di I/O), la sua priorità viene ridotta (scende di una coda). Questo neutralizza il gaming dello scheduler.
   - Regola 5: Dopo un periodo di tempo S (priority boost periodico), tutti i processi nel sistema vengono riportati alla coda con massima priorità (Q0), prevenendo starvation e adattandosi a cambi di fase (da CPU-bound a interattivo).

3. Meccanismo LDE (Limited Direct Execution):
   - Transizione hardware di privilegio tra Ring 3 (User Mode) e Ring 0 (Kernel Mode).
   - Inizializzazione al boot della IDT (Interrupt Descriptor Table).
   - Passaggio tramite trap/syscall: salvataggio automatico da parte dell'hardware dello stato utente nel Trap Frame sulla stack kernel del processo (letta dal registro TSS esp0), salto al trap handler nel kernel.
   - Ritorno tramite istruzione privilegiata iret (return from trap) che ripristina registri, flags e Ring 3.

## Uso Operativo degli Strumenti (Tools) vs Risposta Pedagogica
- Se l'utente pone una domanda teorica o chiede di analizzare il Gantt/le metriche nello stato attuale, rispondi pedagogicamente SENZA invocare tool di modifica.
- Se l'utente chiede di cambiare politica, caricare un preset, modificare il quantum, avanzare i tick o resettare, usa i tool di controllo: \`set_algorithm\` (\`FIFO\`, \`SJF\`, \`STCF\`, \`RR\`, \`MLFQ\`, \`LDE\`), \`load_preset\` (ID validi: \`fifo-vs-sjf-convoy\`, \`stcf-preemption\`, \`rr-quantum-demo\`, \`mlfq-gaming-workload\`, \`mlfq-priority-boost\`, \`lde-hardware-transition\`), \`set_quantum\`, \`step_tick\`, \`reset\`.
- Se l'utente chiede di generare un nuovo esercizio o workload personalizzato, usa \`generate_workload_preset\` fornendo un array \`workload\` valido di ProcessWorkload.`;

export const CONCURRENCY_LAB_SYSTEM_PROMPT = `Sei l'AI Copilot specialista per Concurrency & Deadlock Lab, basato rigorosamente su OSTEP (Operating Systems: Three Easy Pieces).

I tuoi ambiti di competenza specialistica comprendono:
1. Interleaving Atomico e Race Conditions:
   - Lost Update: scomposizione dell'operazione ad alto livello x++ nelle tre istruzioni macchina indivisibili singolarmente: mov (%rax), %rbx (Load), add $1, %rbx (Add), mov %rbx, (%rax) (Store). Un context switch intermedio produce scritture sovrascritte e risultati errati.

2. Primitive di Sincronizzazione:
   - Test-and-Set: spinlock di base con busy waiting su variabile atomica.
   - Ticket Lock: implementazione con fetch-and-add con ticket e turn per garantire fairness assoluta in ordine FIFO e assenza di starvation.

3. Condition Variables (Semantica Mesa):
   - pthread_cond_wait rilascia atomicamente il mutex associato e pone il thread in attesa; al risveglio riacquisisce il mutex.
   - In semantica Mesa la notifica con pthread_cond_signal è un suggerimento, non una garanzia atomica di esecuzione immediata. Il controllo della condizione DEVE SEMPRE risiedere in un ciclo while (mai in un if).
   - Bounded Buffer: il deadlock con 1 sola Condition Variable (producer sveglia producer o consumer sveglia consumer) vs la correttezza garantita da 2 Condition Variables distinte (empty e fill).

4. Semafori di Dijkstra:
   - Variabile intera con operazioni sem_wait e sem_post.
   - sem_wait decrementa il valore; se il valore è negativo (< 0), il thread chiamante viene bloccato in una coda FIFO. Il valore assoluto del numero negativo indica quanti thread sono attualmente bloccati.
   - sem_post incrementa il valore; se il valore prima/dopo l'incremento è <= 0, sblocca un thread dalla coda FIFO.
   - Mutex ordering deadlock: inversione dell'ordine di acquisizione tra mutex e semafori empty/full nel Bounded Buffer.

5. Deadlock e RAG (Resource Allocation Graph):
   - Le 4 condizioni di Coffman: Mutual Exclusion, Hold and Wait, No Preemption, Circular Wait.
   - Problema dei 5 Filosofi a cena: 5 filosofi simmetrici creano un ciclo RAG di lunghezza 10; risoluzione tramite asimmetria o ordinamento globale delle risorse.

## Uso Operativo degli Strumenti (Tools) vs Risposta Pedagogica
- Se l'utente pone una domanda concettuale o chiede di spiegare lo stato attuale di thread/lock/RAG, rispondi pedagogicamente SENZA invocare tool di modifica.
- Se l'utente chiede di caricare uno scenario, eseguire l'istruzione di un thread o resettare, usa i tool di controllo: \`load_preset\` (ID validi: \`lost-update\`, \`ticket-lock\`, \`bounded-buffer-mesa\`, \`bounded-buffer-1cv-bug\`, \`semaphore-deadlock-order\`, \`dining-philosophers-deadlock\`, \`dining-philosophers-asymmetric\`), \`step_thread_instruction\`, \`reset\`.
- Se l'utente chiede di creare un nuovo scenario di concorrenza, usa \`generate_concurrency_scenario\` con uno \`scenario\` conforme a ConcurrencyScenarioState.`;

export function getSystemPromptForMode(mode: LabMode): string {
  switch (mode) {
    case "memory-lab":
      return MEMORY_LAB_SYSTEM_PROMPT;
    case "cpu-lab":
      return CPU_LAB_SYSTEM_PROMPT;
    case "concurrency-lab":
      return CONCURRENCY_LAB_SYSTEM_PROMPT;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export interface SelfHealingValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  history: Array<{ attempt: number; error: string; raw: unknown }>;
}

export async function healPresetPayload<T>({
  raw,
  validator,
  repairFn,
  maxAttempts = 3
}: {
  raw: unknown;
  validator: (candidate: unknown) => { success: true; data: T } | { success: false; error: string };
  repairFn: (params: { lastError: string; attempt: number; lastRaw: unknown }) => Promise<unknown> | unknown;
  maxAttempts?: number;
}): Promise<SelfHealingValidationResult<T>> {
  let currentRaw = raw;
  const history: Array<{ attempt: number; error: string; raw: unknown }> = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const parseResult = validator(currentRaw);
    if (parseResult.success) {
      return {
        success: true,
        data: parseResult.data,
        attempts: attempt,
        history
      };
    }

    history.push({
      attempt,
      error: parseResult.error,
      raw: currentRaw
    });

    if (attempt < maxAttempts) {
      try {
        currentRaw = await repairFn({
          lastError: parseResult.error,
          attempt,
          lastRaw: currentRaw
        });
      } catch (repairErr: unknown) {
        const errorMsg = repairErr instanceof Error ? repairErr.message : String(repairErr);
        history.push({
          attempt,
          error: `Repair error: ${errorMsg}`,
          raw: currentRaw
        });
      }
    }
  }

  const lastFailure = history[history.length - 1];
  return {
    success: false,
    error: lastFailure?.error ?? "Validation failed after maximum self-healing attempts.",
    attempts: maxAttempts,
    history
  };
}

const EMPTY_MODEL_CATALOG: ModelCatalogResponse = {
  models: [],
  defaults: null,
  rolePins: {
    researcher: null,
    demoBuilder: null,
    visualMaker: null,
    extractor: null,
    auditor: null,
    sideQuestion: null
  },
  slots: {
    strong: null,
    cheap: null,
    vision: null
  },
  providers: []
};

export function resolveDefaultModel(catalog: ModelCatalogResponse): AiModelConfig | null {
  const models = Array.isArray(catalog.models) ? catalog.models : [];
  const providers = Array.isArray(catalog.providers) ? catalog.providers : [];
  const activeProviders = new Set(
    providers.filter((p) => p && p.keyPresent === true).map((p) => p.id)
  );

  const isValidModel = (provider: string, id: string): boolean =>
    activeProviders.has(provider) &&
    models.some((m) => m.provider === provider && m.id === id);

  if (catalog.defaults?.model) {
    const { provider, id } = catalog.defaults.model;
    if (isValidModel(provider, id)) {
      return {
        provider,
        id,
        ...(catalog.defaults.thinkingLevel ? { thinkingLevel: catalog.defaults.thinkingLevel } : {})
      };
    }
  }

  if (catalog.slots?.strong?.model) {
    const { provider, id } = catalog.slots.strong.model;
    if (isValidModel(provider, id)) {
      return {
        provider,
        id,
        ...(catalog.slots.strong.thinkingLevel
          ? { thinkingLevel: catalog.slots.strong.thinkingLevel }
          : {})
      };
    }
  }

  const firstActiveModel = models.find((m) => activeProviders.has(m.provider));
  if (firstActiveModel) {
    return {
      provider: firstActiveModel.provider,
      id: firstActiveModel.id
    };
  }

  return null;
}

export async function handleAiCatalog(ctx: PluginBackendContext): Promise<AiCatalogResponse> {
  if (ctx.inference && typeof ctx.inference.catalog === "function") {
    try {
      const catalog = await ctx.inference.catalog();
      if (catalog && Array.isArray(catalog.models)) {
        return {
          ...catalog,
          defaultModel: resolveDefaultModel(catalog)
        };
      }
    } catch {
      // Fall through to empty catalog below
    }
  }

  return {
    ...EMPTY_MODEL_CATALOG,
    defaultModel: null
  };
}

export function formatStateSnapshot(mode: LabMode, stateSnapshot: unknown): string {
  if (stateSnapshot === null || stateSnapshot === undefined || typeof stateSnapshot !== "object") {
    return `Modalità: ${mode}. Nessuno snapshot di stato attivo.`;
  }

  const rec = stateSnapshot as Record<string, unknown>;
  const lines: string[] = [`Modalità attiva: ${mode}`];

  if (mode === "memory-lab") {
    if (typeof rec.subsystem === "string") {
      lines.push(`- Sottosistema: ${rec.subsystem}`);
    }
    if (typeof rec.activePresetId === "string" || rec.activePresetId === null) {
      lines.push(`- Preset attivo: ${rec.activePresetId ?? "nessuno (custom)"}`);
    }
    if (typeof rec.currentVa === "number") {
      lines.push(`- Virtual Address corrente: ${rec.currentVa} (0x${rec.currentVa.toString(16)})`);
    }
    if (typeof rec.currentTraceIndex === "number") {
      lines.push(`- Indice trace: ${rec.currentTraceIndex}`);
    }
    if (Array.isArray(rec.trace)) {
      lines.push(`- Trace (${rec.trace.length} elementi): [${rec.trace.slice(0, 12).join(", ")}${rec.trace.length > 12 ? ", ..." : ""}]`);
    }
  } else if (mode === "cpu-lab") {
    if (typeof rec.algorithm === "string") {
      lines.push(`- Algoritmo: ${rec.algorithm}`);
    }
    if (typeof rec.activePresetId === "string" || rec.activePresetId === null) {
      lines.push(`- Preset attivo: ${rec.activePresetId ?? "nessuno (custom)"}`);
    }
    if (typeof rec.rrQuantum === "number") {
      lines.push(`- Quantum RR: ${rec.rrQuantum}`);
    }
    if (typeof rec.currentTick === "number") {
      lines.push(`- Tick corrente: ${rec.currentTick}`);
    }
    if (Array.isArray(rec.workload)) {
      const summary = rec.workload
        .slice(0, 8)
        .map((p) => {
          if (typeof p === "object" && p !== null) {
            const pr = p as Record<string, unknown>;
            return `${String(pr.id ?? "?")}@t=${String(pr.arrivalTime ?? 0)}`;
          }
          return "?";
        })
        .join(", ");
      lines.push(`- Processi (${rec.workload.length}): ${summary}`);
    }
  } else if (mode === "concurrency-lab") {
    if (typeof rec.activePresetId === "string") {
      lines.push(`- Preset attivo: ${rec.activePresetId}`);
    }
    const sc =
      typeof rec.scenarioState === "object" && rec.scenarioState !== null
        ? (rec.scenarioState as Record<string, unknown>)
        : rec;
    if (typeof sc.scenarioId === "string") {
      lines.push(`- Scenario ID: ${sc.scenarioId}`);
    }
    if (typeof sc.stepCount === "number") {
      lines.push(`- Passi eseguiti: ${sc.stepCount}`);
    }
    if (typeof sc.activeThreadId === "string" || sc.activeThreadId === null) {
      lines.push(`- Thread attivo: ${sc.activeThreadId ?? "nessuno"}`);
    }
    if (Array.isArray(sc.threads)) {
      const tSummary = sc.threads
        .slice(0, 8)
        .map((t) => {
          if (typeof t === "object" && t !== null) {
            const tr = t as Record<string, unknown>;
            return `${String(tr.id ?? "?")}(pc=${String(tr.programCounter ?? 0)},state=${String(tr.state ?? "?")})`;
          }
          return "?";
        })
        .join(", ");
      lines.push(`- Thread (${sc.threads.length}): ${tSummary}`);
    }
    if (typeof sc.sharedMemory === "object" && sc.sharedMemory !== null) {
      const memEntries = Object.entries(sc.sharedMemory as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(", ");
      if (memEntries) {
        lines.push(`- Memoria condivisa: { ${memEntries} }`);
      }
    }
  }

  return lines.join("\n");
}

function getToolSchemasForMode(mode: LabMode): readonly AiToolSchema[] {
  switch (mode) {
    case "memory-lab":
      return MEMORY_TOOL_SCHEMAS;
    case "cpu-lab":
      return CPU_TOOL_SCHEMAS;
    case "concurrency-lab":
      return CONCURRENCY_TOOL_SCHEMAS;
  }
}

function toPiTools(schemas: readonly AiToolSchema[]): Tool[] {
  return schemas.map((schema) => ({
    name: schema.name,
    description: schema.description,
    parameters: schema.parameters as unknown as Tool["parameters"]
  }));
}

const VALID_MEMORY_SUBSYSTEMS: readonly MemoryLabSubsystem[] = [
  "segmentation",
  "linear-paging",
  "multi-level",
  "tlb",
  "replacement"
];

const VALID_MEMORY_PRESETS = new Set([
  "segmentation-unimi-seed-0",
  "paging-unimi-seed-0",
  "multilevel-sparse-space",
  "tlb-cached-translation",
  "belady-anomaly-reference"
]);

const VALID_CPU_ALGORITHMS: readonly CpuAlgorithm[] = [
  "FIFO",
  "SJF",
  "STCF",
  "RR",
  "MLFQ",
  "LDE"
];

const VALID_CPU_PRESETS = new Set([
  "fifo-vs-sjf-convoy",
  "stcf-preemption",
  "rr-quantum-demo",
  "mlfq-gaming-workload",
  "mlfq-priority-boost",
  "lde-hardware-transition"
]);

const VALID_CONCURRENCY_PRESETS = new Set([
  "lost-update",
  "ticket-lock",
  "bounded-buffer-mesa",
  "bounded-buffer-1cv-bug",
  "semaphore-deadlock-order",
  "dining-philosophers-deadlock",
  "dining-philosophers-asymmetric"
]);

function normalizeMemorySubsystem(raw: unknown): string {
  if (raw === "two-level-paging") return "multi-level";
  if (raw === "swapping") return "replacement";
  return typeof raw === "string" ? raw : "";
}

interface ToolExecutionOutcome {
  isError: boolean;
  result: Record<string, unknown>;
  generatedExercise?: SavedExercise;
  controlAction?: ControlAction;
}

function executeToolCall(
  mode: LabMode,
  toolCall: ToolCall,
  stateSnapshot: unknown
): ToolExecutionOutcome {
  const args = (toolCall.arguments ?? {}) as Record<string, unknown>;
  const name = toolCall.name;

  // Inspection tools
  if (name === "inspect_memory" || name === "inspect_cpu" || name === "inspect_concurrency") {
    return {
      isError: false,
      result: {
        ok: true,
        mode,
        stateSnapshot: stateSnapshot ?? {}
      }
    };
  }

  // Exercise generation tools
  if (name === "generate_memory_preset") {
    if (mode !== "memory-lab") {
      return { isError: true, result: { ok: false, error: `Tool ${name} is only valid in memory-lab.` } };
    }
    const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : "Esercizio Memory Lab";
    const consegna = typeof args.consegna === "string" && args.consegna.trim() ? args.consegna.trim() : "Analizza la configurazione di memoria.";
    const normalizedSubsystem = normalizeMemorySubsystem(args.subsystem);
    const rawConfig = args.config;
    if (typeof rawConfig !== "object" || rawConfig === null || Array.isArray(rawConfig)) {
      return { isError: true, result: { ok: false, error: "config must be a non-null MemoryLabPreset object." } };
    }
    const configRec = rawConfig as Record<string, unknown>;
    const configSubsystem = configRec.subsystem !== undefined
      ? normalizeMemorySubsystem(configRec.subsystem)
      : normalizedSubsystem;

    const candidate = {
      id: typeof configRec.id === "string" && configRec.id.trim() ? configRec.id : `mem-ai-${Date.now()}`,
      name: typeof configRec.name === "string" && configRec.name.trim() ? configRec.name : title,
      description: typeof configRec.description === "string" ? configRec.description : consegna,
      ...configRec,
      subsystem: configSubsystem || normalizedSubsystem
    };

    const parsed = parseMemoryPreset(candidate);
    if (!parsed.success) {
      return { isError: true, result: { ok: false, error: parsed.error } };
    }

    const exercise = createExercise({
      title,
      consegna,
      mode: "memory-lab",
      config: parsed.data,
      isAiGenerated: true
    });
    return {
      isError: false,
      result: { ok: true, exerciseId: exercise.id, subsystem: parsed.data.subsystem },
      generatedExercise: exercise
    };
  }

  if (name === "generate_workload_preset") {
    if (mode !== "cpu-lab") {
      return { isError: true, result: { ok: false, error: `Tool ${name} is only valid in cpu-lab.` } };
    }
    const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : "Esercizio CPU Lab";
    const consegna = typeof args.consegna === "string" && args.consegna.trim() ? args.consegna.trim() : "Analizza lo scheduling della CPU.";
    const algorithm = typeof args.algorithm === "string" ? args.algorithm.trim().toUpperCase() : "RR";

    const candidate = {
      id: `cpu-ai-${Date.now()}`,
      name: title,
      description: consegna,
      algorithm,
      workload: args.workload,
      ...(args.quantum !== undefined ? { rrQuantum: args.quantum } : {}),
      ...(args.mlfqConfig !== undefined ? { mlfqConfig: args.mlfqConfig } : {})
    };

    const parsed = cpuPresetBoundaryParser.parse(candidate);
    if (!parsed.success) {
      return { isError: true, result: { ok: false, error: parsed.error } };
    }

    const exercise = createExercise({
      title,
      consegna,
      mode: "cpu-lab",
      config: parsed.data,
      isAiGenerated: true
    });
    return {
      isError: false,
      result: { ok: true, exerciseId: exercise.id, algorithm: parsed.data.algorithm },
      generatedExercise: exercise
    };
  }

  if (name === "generate_concurrency_scenario") {
    if (mode !== "concurrency-lab") {
      return { isError: true, result: { ok: false, error: `Tool ${name} is only valid in concurrency-lab.` } };
    }
    const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : "Scenario Concurrency Lab";
    const consegna = typeof args.consegna === "string" && args.consegna.trim() ? args.consegna.trim() : "Analizza l'interleaving dei thread.";

    const parsed = concurrencyScenarioBoundaryParser.parse(args.scenario);
    if (!parsed.success) {
      return { isError: true, result: { ok: false, error: parsed.error } };
    }

    const exercise = createExercise({
      title,
      consegna,
      mode: "concurrency-lab",
      config: parsed.data,
      isAiGenerated: true
    });
    return {
      isError: false,
      result: { ok: true, exerciseId: exercise.id, scenarioId: parsed.data.scenarioId },
      generatedExercise: exercise
    };
  }

  // Control tools
  if (name === "set_subsystem" && mode === "memory-lab") {
    const normalized = normalizeMemorySubsystem(args.subsystem);
    if (!(VALID_MEMORY_SUBSYSTEMS as readonly string[]).includes(normalized)) {
      return {
        isError: true,
        result: { ok: false, error: `Invalid subsystem '${String(args.subsystem)}'. Must be one of: ${VALID_MEMORY_SUBSYSTEMS.join(", ")}.` }
      };
    }
    const action: ControlAction = { action: "set_subsystem", payload: { subsystem: normalized } };
    return { isError: false, result: { ok: true, action: action.action, payload: action.payload }, controlAction: action };
  }

  if (name === "set_va" && mode === "memory-lab") {
    const va = args.virtualAddress;
    if (typeof va !== "number" || !Number.isInteger(va) || va < 0) {
      return { isError: true, result: { ok: false, error: "virtualAddress must be a non-negative integer." } };
    }
    const action: ControlAction = { action: "set_va", payload: { virtualAddress: va } };
    return { isError: false, result: { ok: true, action: action.action, payload: action.payload }, controlAction: action };
  }

  if (name === "execute_translation" && mode === "memory-lab") {
    const va = args.virtualAddress;
    if (typeof va !== "number" || !Number.isInteger(va) || va < 0) {
      return { isError: true, result: { ok: false, error: "virtualAddress must be a non-negative integer." } };
    }
    const payload = {
      virtualAddress: va,
      ...(typeof args.asid === "number" ? { asid: args.asid } : {})
    };
    const action: ControlAction = { action: "execute_translation", payload };
    return { isError: false, result: { ok: true, action: action.action, payload }, controlAction: action };
  }

  if (name === "step_trace" && mode === "memory-lab") {
    const steps = args.steps === undefined ? 1 : args.steps;
    if (typeof steps !== "number" || !Number.isInteger(steps) || steps <= 0) {
      return { isError: true, result: { ok: false, error: "steps must be a positive integer." } };
    }
    const action: ControlAction = { action: "step_trace", payload: { steps } };
    return { isError: false, result: { ok: true, action: action.action, payload: action.payload }, controlAction: action };
  }

  if (name === "set_algorithm" && mode === "cpu-lab") {
    const algo = typeof args.algorithm === "string" ? args.algorithm.trim().toUpperCase() : "";
    if (!(VALID_CPU_ALGORITHMS as readonly string[]).includes(algo)) {
      return {
        isError: true,
        result: { ok: false, error: `Invalid algorithm '${String(args.algorithm)}'. Must be one of: ${VALID_CPU_ALGORITHMS.join(", ")}.` }
      };
    }
    const action: ControlAction = { action: "set_algorithm", payload: { algorithm: algo } };
    return { isError: false, result: { ok: true, action: action.action, payload: action.payload }, controlAction: action };
  }

  if (name === "set_quantum" && mode === "cpu-lab") {
    const quantum = args.quantum;
    if (typeof quantum !== "number" || !Number.isInteger(quantum) || quantum <= 0) {
      return { isError: true, result: { ok: false, error: "quantum must be a positive integer > 0." } };
    }
    const action: ControlAction = { action: "set_quantum", payload: { quantum } };
    return { isError: false, result: { ok: true, action: action.action, payload: action.payload }, controlAction: action };
  }

  if (name === "step_tick" && mode === "cpu-lab") {
    const ticks = args.ticks === undefined ? 1 : args.ticks;
    if (typeof ticks !== "number" || !Number.isInteger(ticks) || ticks <= 0) {
      return { isError: true, result: { ok: false, error: "ticks must be a positive integer." } };
    }
    const action: ControlAction = { action: "step_tick", payload: { ticks } };
    return { isError: false, result: { ok: true, action: action.action, payload: action.payload }, controlAction: action };
  }

  if (name === "control_scheduler" && mode === "cpu-lab") {
    const command = args.command;
    if (command !== "step" && command !== "play" && command !== "pause" && command !== "reset") {
      return { isError: true, result: { ok: false, error: "command must be one of: step, play, pause, reset." } };
    }
    const payload = {
      command,
      ...(typeof args.ticks === "number" ? { ticks: args.ticks } : {})
    };
    const action: ControlAction = { action: "control_scheduler", payload };
    return { isError: false, result: { ok: true, action: action.action, payload }, controlAction: action };
  }

  if (name === "load_preset") {
    const presetId = typeof args.presetId === "string" ? args.presetId.trim() : "";
    const validSet =
      mode === "memory-lab"
        ? VALID_MEMORY_PRESETS
        : mode === "cpu-lab"
          ? VALID_CPU_PRESETS
          : VALID_CONCURRENCY_PRESETS;
    if (!validSet.has(presetId)) {
      return {
        isError: true,
        result: { ok: false, error: `Invalid presetId '${presetId}' for ${mode}. Valid IDs: ${Array.from(validSet).join(", ")}.` }
      };
    }
    const action: ControlAction = { action: "load_preset", payload: { presetId } };
    return { isError: false, result: { ok: true, action: action.action, payload: action.payload }, controlAction: action };
  }

  if (name === "step_thread_instruction" && mode === "concurrency-lab") {
    const threadId = typeof args.threadId === "string" ? args.threadId.trim() : "";
    if (!threadId) {
      return { isError: true, result: { ok: false, error: "threadId must be a non-empty string." } };
    }
    const payload = {
      threadId,
      ...(typeof args.instructionIndex === "number" ? { instructionIndex: args.instructionIndex } : {})
    };
    const action: ControlAction = { action: "step_thread_instruction", payload };
    return { isError: false, result: { ok: true, action: action.action, payload }, controlAction: action };
  }

  if (name === "reset") {
    const action: ControlAction = { action: "reset", payload: {} };
    return { isError: false, result: { ok: true, action: action.action, payload: action.payload }, controlAction: action };
  }

  return {
    isError: true,
    result: { ok: false, error: `Unknown or unsupported tool '${name}' for mode '${mode}'.` }
  };
}

const MAX_TOOL_ROUNDS = 4;

const VALID_THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
];

export async function handleAiTurn(
  ctx: PluginBackendContext,
  rawInput: unknown
): Promise<AiTurnResponse> {
  const parseResult = aiTurnRequestBoundaryParser.parse(rawInput);
  if (!parseResult.success) {
    return {
      responseText: `Invalid AI turn request: ${parseResult.error}`,
      error: parseResult.error
    };
  }

  const request: AiTurnRequest = parseResult.data;

  if (!ctx.inference || typeof ctx.inference.stream !== "function") {
    const errorMsg = "Servizio di inferenza AI non disponibile in questo ambiente LearnHarness.";
    return {
      responseText: errorMsg,
      error: errorMsg
    };
  }

  const catalog = await handleAiCatalog(ctx);
  const hasConfiguredProvider =
    catalog.models.length > 0 && catalog.providers.some((p) => p.keyPresent === true);

  if (!hasConfiguredProvider) {
    const errorMsg =
      "Nessun provider AI configurato con API key attiva. Configura una chiave nelle impostazioni di LearnHarness per usare il Copilot.";
    return {
      responseText: errorMsg,
      error: errorMsg
    };
  }

  const resolvedModel = request.model ?? catalog.defaultModel;
  if (!resolvedModel) {
    const errorMsg =
      "Nessun modello AI predefinito disponibile nel catalogo corrente. Seleziona un modello valido nelle impostazioni.";
    return {
      responseText: errorMsg,
      error: errorMsg
    };
  }

  const thinkingLevel =
    resolvedModel.thinkingLevel &&
    (VALID_THINKING_LEVELS as readonly string[]).includes(resolvedModel.thinkingLevel)
      ? (resolvedModel.thinkingLevel as ThinkingLevel)
      : undefined;

  const modelSpec = {
    provider: resolvedModel.provider,
    id: resolvedModel.id,
    ...(thinkingLevel !== undefined ? { thinkingLevel } : {})
  };

  const baseSystemPrompt = getSystemPromptForMode(request.mode);
  const stateSummary = formatStateSnapshot(request.mode, request.stateSnapshot);
  const systemPrompt = `${baseSystemPrompt}\n\n## Stato Attuale del Simulatore\n${stateSummary}`;

  const messages: Message[] = [];
  const now = Date.now();

  for (const turn of request.conversationHistory) {
    if (turn.role === "user") {
      const userMsg: UserMessage = {
        role: "user",
        content: turn.text,
        timestamp: now
      };
      messages.push(userMsg);
    } else {
      const assistantMsg: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: turn.text }],
        api: "chat",
        provider: modelSpec.provider,
        model: modelSpec.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0
          }
        },
        stopReason: "stop",
        timestamp: now
      };
      messages.push(assistantMsg);
    }
  }

  const finalUserMsg: UserMessage = {
    role: "user",
    content: request.userMessage,
    timestamp: now
  };
  messages.push(finalUserMsg);

  const tools = toPiTools(getToolSchemasForMode(request.mode));
  const controlActions: ControlAction[] = [];
  const rawToolCalls: unknown[] = [];
  let generatedExercise: SavedExercise | undefined;
  let accumulatedText = "";

  const emitStream = (type: string, extra?: { delta?: string; toolName?: string }) => {
    if (request.requestId && ctx.events && typeof ctx.events.emit === "function") {
      ctx.events.emit("ai-stream", {
        requestId: request.requestId,
        type,
        ...(extra?.delta !== undefined ? { delta: extra.delta } : {}),
        ...(extra?.toolName !== undefined ? { toolName: extra.toolName } : {})
      });
    }
  };

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = ctx.inference.stream({
        model: modelSpec,
        purpose: "user",
        context: {
          systemPrompt,
          messages,
          tools
        },
        signal: ctx.signal
      });

      let doneMessage: AssistantMessage | undefined;
      let streamError: string | undefined;

      for await (const event of stream) {
        if (event.type === "text_delta") {
          emitStream("text_delta", { delta: event.delta });
        } else if (event.type === "thinking_delta") {
          emitStream("thinking_delta", { delta: event.delta });
        } else if (event.type === "toolcall_start") {
          const block = event.partial.content[event.contentIndex];
          const toolName = block && block.type === "toolCall" ? block.name : undefined;
          emitStream("toolcall_start", { toolName });
        } else if (event.type === "done") {
          doneMessage = event.message;
        } else if (event.type === "error") {
          streamError =
            event.error?.errorMessage || `Inference stream error (${event.reason}).`;
          break;
        }
      }

      if (streamError) {
        return {
          responseText: accumulatedText.trim() || streamError,
          error: streamError,
          ...(generatedExercise ? { generatedExercise } : {}),
          ...(controlActions.length > 0 ? { controlActions } : {}),
          ...(rawToolCalls.length > 0 ? { rawToolCalls } : {})
        };
      }

      if (!doneMessage) {
        const missingDoneErr = "Il flusso di inferenza AI è terminato senza un messaggio finale.";
        return {
          responseText: accumulatedText.trim() || missingDoneErr,
          error: missingDoneErr,
          ...(generatedExercise ? { generatedExercise } : {}),
          ...(controlActions.length > 0 ? { controlActions } : {}),
          ...(rawToolCalls.length > 0 ? { rawToolCalls } : {})
        };
      }

      if (doneMessage.stopReason === "error" || doneMessage.stopReason === "aborted") {
        const stopErr =
          doneMessage.errorMessage || `Inference stopped with reason: ${doneMessage.stopReason}`;
        return {
          responseText: accumulatedText.trim() || stopErr,
          error: stopErr,
          ...(generatedExercise ? { generatedExercise } : {}),
          ...(controlActions.length > 0 ? { controlActions } : {}),
          ...(rawToolCalls.length > 0 ? { rawToolCalls } : {})
        };
      }

      messages.push(doneMessage);

      const roundText = doneMessage.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");

      if (roundText.length > 0) {
        accumulatedText = accumulatedText.length > 0 ? `${accumulatedText}\n${roundText}` : roundText;
      }

      const toolCalls = doneMessage.content.filter(
        (c): c is ToolCall => c.type === "toolCall"
      );

      if (toolCalls.length === 0) {
        break;
      }

      for (const toolCall of toolCalls) {
        rawToolCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
          ...(toolCall.argumentsError ? { argumentsError: toolCall.argumentsError } : {})
        });

        if (toolCall.argumentsError) {
          const errToolResult: ToolResultMessage = {
            role: "toolResult",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: false, error: toolCall.argumentsError })
              }
            ],
            isError: true,
            timestamp: Date.now()
          };
          messages.push(errToolResult);
          continue;
        }

        const outcome = executeToolCall(request.mode, toolCall, request.stateSnapshot);
        if (outcome.generatedExercise) {
          generatedExercise = outcome.generatedExercise;
        }
        if (outcome.controlAction) {
          controlActions.push(outcome.controlAction);
        }

        const toolResult: ToolResultMessage = {
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: [{ type: "text", text: JSON.stringify(outcome.result) }],
          isError: outcome.isError,
          timestamp: Date.now()
        };
        messages.push(toolResult);
      }
    }

    return {
      responseText: accumulatedText.trim() || "Operazione completata.",
      ...(generatedExercise ? { generatedExercise } : {}),
      ...(controlActions.length > 0 ? { controlActions } : {}),
      ...(rawToolCalls.length > 0 ? { rawToolCalls } : {})
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      responseText: accumulatedText.trim() || errMsg,
      error: errMsg,
      ...(generatedExercise ? { generatedExercise } : {}),
      ...(controlActions.length > 0 ? { controlActions } : {}),
      ...(rawToolCalls.length > 0 ? { rawToolCalls } : {})
    };
  }
}
