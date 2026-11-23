import type { PluginBackendContext, ModelCatalogResponse } from "learnharness-plugin-api";
import type { Message, UserMessage, AssistantMessage } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  type AiTurnRequest,
  type AiTurnResponse,
  type SavedExercise,
  type LabMode,
  aiTurnRequestBoundaryParser
} from "../types/ai.js";
import { createExercise } from "../core/exercise-manager.js";
import { parseMemoryPreset, type MemoryLabPreset } from "../core/memory/types.js";
import { workloadBoundaryParser, type ProcessWorkload } from "../core/cpu/types.js";
import {
  concurrencyScenarioBoundaryParser,
  type ConcurrencyScenarioState
} from "../core/concurrency/types.js";
import {
  SEGMENTATION_UNIMI_SEED_0,
  PAGING_UNIMI_SEED_0,
  BELADY_ANOMALY_PRESET
} from "../core/memory/presets.js";
import {
  STCF_PREEMPTION,
  RR_QUANTUM_DEMO,
  MLFQ_GAMING_WORKLOAD
} from "../core/cpu/presets.js";
import {
  BOUNDED_BUFFER_MESA,
  LOST_UPDATE_DEMO,
  DINING_PHILOSOPHERS_DEADLOCK
} from "../core/concurrency/presets.js";

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

Quando generi configurazioni di esercizi, produci esclusivamente JSON validi conformi a MemoryLabPreset.`;

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

Quando generi configurazioni di carico, produci esclusivamente JSON validi conformi a ProcessWorkload[] o CpuPreset.`;

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

Quando generi scenari di concorrenza, produci esclusivamente JSON validi conformi a ConcurrencyScenarioState.`;

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

export const FALLBACK_MODEL_CATALOG: ModelCatalogResponse = {
  models: [
    {
      id: "claude-3-7-sonnet",
      name: "Claude 3.7 Sonnet",
      provider: "anthropic",
      reasoning: true,
      input: ["text", "image"],
      supportedLevels: ["off", "low", "medium", "high"],
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200000,
      maxTokens: 8192
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "google",
      reasoning: true,
      input: ["text", "image"],
      supportedLevels: ["off", "low", "medium", "high"],
      cost: { input: 1.25, output: 5, cacheRead: 0.3, cacheWrite: 1.25 },
      contextWindow: 1000000,
      maxTokens: 8192
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      provider: "google",
      reasoning: true,
      input: ["text", "image"],
      supportedLevels: ["off", "low", "medium"],
      cost: { input: 0.15, output: 0.6, cacheRead: 0.0375, cacheWrite: 0.15 },
      contextWindow: 1000000,
      maxTokens: 8192
    }
  ],
  defaults: {
    model: { provider: "anthropic", id: "claude-3-7-sonnet" },
    thinkingLevel: "medium"
  },
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
  providers: [
    { id: "anthropic", envVar: "ANTHROPIC_API_KEY", keyPresent: false },
    { id: "google", envVar: "GEMINI_API_KEY", keyPresent: false }
  ]
};

export async function handleAiCatalog(ctx: PluginBackendContext): Promise<ModelCatalogResponse> {
  if (ctx.inference && typeof ctx.inference.catalog === "function") {
    try {
      const catalog = await ctx.inference.catalog();
      if (catalog && Array.isArray(catalog.models)) {
        return catalog;
      }
    } catch {
      // Fallback below
    }
  }

  return FALLBACK_MODEL_CATALOG;
}

function generateDeterministicMemoryExercise(): SavedExercise<MemoryLabPreset> {
  const preset: MemoryLabPreset = {
    ...SEGMENTATION_UNIMI_SEED_0,
    id: `mem-ex-${Date.now()}`,
    name: "Esercizio OSTEP: Traduzione Segmentazione e Limiti",
    description: "Analisi della traslazione logica-fisica e rilevamento fault su Segmento 0 e Segmento 1."
  };

  return createExercise<MemoryLabPreset>({
    title: preset.name,
    consegna:
      "Dato il registro Base e Limit per Segmento 0 (Code/Heap) e Segmento 1 (Stack), calcola l'indirizzo fisico per gli indirizzi virtuali della trace ed evidenzia le violazioni di limite.",
    mode: "memory-lab",
    config: preset,
    isAiGenerated: true
  });
}

function generateDeterministicCpuExercise(): SavedExercise<ProcessWorkload[]> {
  const workload: ProcessWorkload[] = [
    {
      id: "P0",
      arrivalTime: 0,
      bursts: [
        { type: "cpu", duration: 2 },
        { type: "io", duration: 2 },
        { type: "cpu", duration: 4 }
      ]
    },
    {
      id: "P1",
      arrivalTime: 2,
      bursts: [{ type: "cpu", duration: 4 }]
    },
    {
      id: "P2",
      arrivalTime: 4,
      bursts: [{ type: "cpu", duration: 2 }]
    }
  ];

  return createExercise<ProcessWorkload[]>({
    title: "Esercizio OSTEP: STCF con Preemption e I/O",
    consegna:
      "Traccia il diagramma di Gantt sotto la politica STCF (Shortest Time-to-Completion First). Verifica quando P0 cede la CPU per I/O e se l'arrivo di P2 preempta P1.",
    mode: "cpu-lab",
    config: workload,
    isAiGenerated: true
  });
}

function generateDeterministicConcurrencyExercise(): SavedExercise<ConcurrencyScenarioState> {
  const scenario: ConcurrencyScenarioState = {
    ...BOUNDED_BUFFER_MESA,
    scenarioId: `conc-ex-${Date.now()}`,
    name: "Esercizio OSTEP: Bounded Buffer Mesa 2 CV",
    description:
      "Verifica l'assenza di deadlock con 2 Condition Variables (empty e fill) rispetto allo scenario patologico a singola CV."
  };

  return createExercise<ConcurrencyScenarioState>({
    title: scenario.name,
    consegna:
      "Esegui l'interleaving istruzione per istruzione dei thread Producer e Consumer. Verifica che la semantica Mesa utilizzi il ciclo while e che il risveglio non provochi starvation o deadlock.",
    mode: "concurrency-lab",
    config: scenario,
    isAiGenerated: true
  });
}

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
  const systemPrompt = getSystemPromptForMode(request.mode);

  // If ctx.inference is available and operational, attempt inference
  if (ctx.inference && typeof ctx.inference.complete === "function") {
    try {
      const validThinkingLevels: readonly ThinkingLevel[] = [
        "off",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ];
      const thinkingLevel =
        request.model?.thinkingLevel &&
        (validThinkingLevels as readonly string[]).includes(request.model.thinkingLevel)
          ? (request.model.thinkingLevel as ThinkingLevel)
          : undefined;

      const modelSpec = {
        provider: request.model?.provider ?? "anthropic",
        id: request.model?.id ?? "claude-3-7-sonnet",
        ...(thinkingLevel !== undefined ? { thinkingLevel } : {})
      };

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

      const inferenceResult = await ctx.inference.complete({
        model: modelSpec,
        purpose: "user",
        context: {
          systemPrompt,
          messages
        }
      });

      if (inferenceResult && inferenceResult.content) {
        let text = "";
        for (const item of inferenceResult.content) {
          if (item.type === "text") {
            text += item.text;
          }
        }
        if (text.trim().length > 0) {
          return {
            responseText: text.trim()
          };
        }
      }
    } catch {
      // Fall through to deterministic fallback on inference error
    }
  }

  // Deterministic Fallback Logic
  const msgLower = request.userMessage.toLowerCase();
  const shouldGenerateExercise =
    msgLower.includes("esercizio") ||
    msgLower.includes("preset") ||
    msgLower.includes("genera") ||
    msgLower.includes("exercise") ||
    msgLower.includes("scenario") ||
    msgLower.includes("workload") ||
    msgLower.includes("test");

  if (request.mode === "memory-lab") {
    let generatedExercise: SavedExercise | undefined;

    if (shouldGenerateExercise) {
      const candidateExercise = generateDeterministicMemoryExercise();
      const healResult = await healPresetPayload({
        raw: candidateExercise.config,
        validator: parseMemoryPreset,
        repairFn: () => SEGMENTATION_UNIMI_SEED_0
      });

      if (healResult.success && healResult.data) {
        candidateExercise.config = healResult.data;
        generatedExercise = candidateExercise;
      }
    }

    const responseText = [
      "In conformità ai principi di Memory Virtualization descritti in OSTEP (Operating Systems: Three Easy Pieces):",
      "- Segmentazione: La traslazione calcola Physical Address = Base + Offset. Per segmenti a crescita positiva (Code, Heap), l'offset non deve superare Limit. Per segmenti a crescita negativa (Stack), Base punta all'indirizzo fisico massimo e l'offset negativo viene calcolato rispetto alla dimensione massima.",
      "- Paging & TLB: L'indirizzo virtuale è scomposto in VPN e Offset. La Page Table Entry (PTE) utilizza l'MSB 0x80000000 come valid bit. Il TLB associa VPN ad ASID e PFN per eliminare memory reference aggiuntivi durante l'accesso.",
      "- Sostituzione & Belàdy: Con FIFO, la sequenza [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5] manifesta l'Anomalia di Belàdy (passaggio da 9 a 10 page fault con 4 frame invece di 3)."
    ].join("\n");

    return {
      responseText,
      generatedExercise,
      controlActions: [
        { action: "set_subsystem", payload: { subsystem: "segmentation" } }
      ]
    };
  }

  if (request.mode === "cpu-lab") {
    let generatedExercise: SavedExercise | undefined;

    if (shouldGenerateExercise) {
      const candidateExercise = generateDeterministicCpuExercise();
      const healResult = await healPresetPayload({
        raw: candidateExercise.config,
        validator: workloadBoundaryParser.parse,
        repairFn: () => STCF_PREEMPTION.workload
      });

      if (healResult.success && healResult.data) {
        candidateExercise.config = healResult.data;
        generatedExercise = candidateExercise;
      }
    }

    const responseText = [
      "In conformità ai principi di CPU Scheduling & LDE descritti in OSTEP:",
      "- STCF & Round Robin: STCF preempta il processo corrente non appena giunge un job con tempo di completamento rimanente inferiore. Round Robin garantisce equità temporale e ottimizza il response time mediante quantum di clock.",
      "- MLFQ (5 Regole): L'allotment cumulativo impedisce il gaming tramite frequenti yield di I/O (Regola 4). Il priority boost periodico ogni intervallo S (Regola 5) azzera la priority e previene la starvation.",
      "- Limited Direct Execution (LDE): Le transizioni Ring 3 -> Ring 0 avvengono attraverso la IDT salvando il Trap Frame sulla stack kernel del processo (letta dal TSS esp0), e terminano con l'istruzione hardware iret."
    ].join("\n");

    return {
      responseText,
      generatedExercise,
      controlActions: [
        { action: "set_algorithm", payload: { algorithm: "stcf" } }
      ]
    };
  }

  if (request.mode === "concurrency-lab") {
    let generatedExercise: SavedExercise | undefined;

    if (shouldGenerateExercise) {
      const candidateExercise = generateDeterministicConcurrencyExercise();
      const healResult = await healPresetPayload({
        raw: candidateExercise.config,
        validator: concurrencyScenarioBoundaryParser.parse,
        repairFn: () => BOUNDED_BUFFER_MESA
      });

      if (healResult.success && healResult.data) {
        candidateExercise.config = healResult.data;
        generatedExercise = candidateExercise;
      }
    }

    const responseText = [
      "In conformità ai principi di Concurrency & Synchronization descritti in OSTEP:",
      "- Lost Update: La sequenza di basso livello (mov rax; add 1; mov rax) su memoria condivisa produce corruzione dei dati se un context switch interrompe l'esecuzione prima dello Store.",
      "- Condition Variables & Mesa: pthread_cond_wait rilascia atomicamente il lock e addormenta il thread. Al risveglio (pthread_cond_signal), la semantica Mesa impone la riverifica dello stato mediante ciclo while(condizione). Nel Bounded Buffer, l'uso di due condition variable distinte (empty e fill) previene il deadlock.",
      "- Semafori & RAG Deadlock: Un semaforo con valore negativo indica il numero esatto di thread sospesi nella waiting queue FIFO. Il deadlock si instaura quando le 4 condizioni di Coffman sono verificate simultaneamente (es. 5 filosofi simmetrici che formano un ciclo RAG di lunghezza 10)."
    ].join("\n");

    return {
      responseText,
      generatedExercise,
      controlActions: [
        { action: "set_scenario", payload: { scenario: "bounded-buffer" } }
      ]
    };
  }

  const _exhaustive: never = request.mode;
  return {
    responseText: "Unsupported mode.",
    error: `Unsupported mode: ${_exhaustive}`
  };
}
