# Fase 3: Laboratorio di Concorrenza, Sincronizzazione e Deadlock (`concurrency-lab`)

Questa fase descrive l'architettura tecnica del modulo **Concurrency & Deadlock Lab**.
Il simulatore consente allo studente di comprendere le race condition a livello di istruzione macchina, sperimentare lock hardware, condition variables (Mesa semantics), semafori di Dijkstra ed esplorare graficamente i cicli di deadlock tramite Resource Allocation Graphs (RAG).

---

## 1. Modello Dati e Tipi di Dominio (`src/core/concurrency/types.ts`)

```typescript
export interface ThreadContext {
  id: string;                 // Es. "T1", "T2"
  programCounter: number;     // Indice dell'istruzione corrente
  registers: Record<string, number>; // Es. { eax: 10, ebx: 0 }
  state: 'ready' | 'running' | 'blocked' | 'terminated';
  callStack: string[];
}

export interface ThreadInstruction {
  op: 'read' | 'write' | 'add' | 'sub' | 'lock' | 'unlock' | 'wait' | 'signal' | 'sem_wait' | 'sem_post';
  targetVariable?: string;    // Variabile condivisa (es. "x", "buffer")
  register?: string;          // Registro locale (es. "eax")
  literal?: number;
  syncObject?: string;        // ID del lock, semaforo o condition variable
  label?: string;             // Codice sorgente C o Assembly visualizzato
}

export interface SemaphoreState {
  id: string;
  value: number;              // Se < 0, il valore assoluto indica i thread in coda
  waitQueue: string[];        // Thread IDs in attesa
}

export interface ConditionVarState {
  id: string;
  associatedLock: string;
  waitQueue: string[];
}

export interface ResourceAllocationGraph {
  processes: string[];        // Nodi processo
  resources: string[];        // Nodi risorsa
  requests: Array<{ fromProcess: string; toResource: string }>;
  allocations: Array<{ fromResource: string; toProcess: string }>;
  detectedCycles: string[][]; // Cicli di deadlock rilevati (es. [["P1", "R1", "P2", "R2", "P1"]])
}

export interface ConcurrencyScenarioState {
  threads: ThreadContext[];
  sharedMemory: Record<string, number>;
  activeThreadId: string;
  locks: Record<string, { heldBy: string | null; waitQueue: string[] }>;
  semaphores: Record<string, SemaphoreState>;
  conditionVariables: Record<string, ConditionVarState>;
  boundedBuffer?: {
    capacity: number;
    items: number[];
  };
  rag: ResourceAllocationGraph;
  executionHistory: string[];
}
```

---

## 2. Motori di Calcolo Funzionali Puri

### 2.1 Esecutore di Istruzioni Deterministico (`src/core/concurrency/interleaving.ts`)
- Consente di far avanzare un singolo thread di una singola istruzione macchina:
  - `stepThread(state: ConcurrencyScenarioState, threadId: string): ConcurrencyScenarioState`
- **Riproduzione dell'Aggiornamento Perso (Lost Update)**:
  - Sequenza parametrizzata configurabile:
    1. $T_1$: lettura $x \to \text{eax}$
    2. Context switch forzato su $T_2$
    3. $T_2$: lettura $x \to \text{eax}$, incremento, scrittura $\text{eax} \to x$
    4. Ritorno a $T_1$: incremento del valore vecchio, sovrascrittura. Risultato finale anomalo visibile a schermo.

### 2.2 Primitive di Sincronizzazione (`src/core/concurrency/sync-primitives.ts`)
- **Lock Hardware**:
  - Test-and-Set (`xchg`): scambio atomico del flag booleano.
  - Ticket Lock: avanzamento ordinato di `ticket` e `turn`.
- **Condition Variables con Semantica Mesa**:
  - Operazione `wait(cv, mutex)`: rilascio atomico del mutex, sospensione del thread nella coda della CV. Al risveglio, il thread deve riacquisire il mutex prima di riprendere l'esecuzione.
  - Verifica della necessità del ciclo `while (!condition)` invece dell'istruzione `if`.
- **Semafori di Dijkstra**:
  - `sem_wait()`: decrementa il contatore. Se $<0$, aggiunge il thread alla coda e commuta lo stato in `blocked`.
  - `sem_post()`: incrementa il contatore. Se $\le 0$, estrae un thread dalla coda e lo sposta in `ready`.
  - Dimostrazione del problema Bounded Buffer e dell'errore di deadlock nell'inversione delle wait (`wait(empty)` prima di `wait(mutex)`).

### 2.3 Rilevatore Cicli e Deadlock nel Grafo RAG (`src/core/concurrency/rag.ts`)
- Algoritmo di Tarjan / DFS per cycle detection su grafi diretti bipartiti (Processi $\leftrightarrow$ Risorse).
- Evidenziazione in tempo reale delle 4 Condizioni di Coffman:
  - *Mutual Exclusion*: risorse non condivisibili.
  - *Hold and Wait*: un processo trattiene una risorsa mentre ne richiede un'altra.
  - *No Preemption*: le risorse non possono essere sottratte con la forza.
  - *Circular Wait*: presenza del ciclo rilevato nel grafo RAG.

---

## 3. Interfaccia Utente e Controlli Parametrici (Applicazione `$unslop`)

1. **Thread Stepper & Assembly Inspector**:
   - Colonne affiancate per ciascun thread con evidenziazione dell'istruzione in fase di esecuzione ($PC$).
   - Pulsanti chiari "Step T1", "Step T2", "Run to Completion".
2. **Buffer Circolare Animato (One Bright Element per Bounded Buffer)**:
   - Anello grafico con gli slot del buffer, indici `in` e `out`, e puntatori agli elementi inseriti/prelevati.
3. **Grafo RAG Dinamico (One Bright Element per Deadlock)**:
   - Visualizzazione SVG pulita senza elementi fluorescenti: cerchi neutri per i processi, quadrati per i lock/risorse, frecce di allocazione e richiesta.
   - Quando si forma un ciclo, l'arco critico viene evidenziato con il colore di allerta (`text-destructive`), visualizzando la spiegazione del deadlock.

---

## 4. Criteri di Accettazione e Verifica Terminale

- Test di riproduzione esatta del problema del lost update da $10 \to 11$ vs $10 \to 12$.
- Test di deadlock su Bounded Buffer con singola Condition Variable vs correttezza con 2 Condition Variables (`empty` e `fill`).
- Test di rilevamento ciclo RAG su Dining Philosophers e sblocco con approccio asimmetrico.
- Zero logica hardcoded: lo studente può configurare il numero di thread, la capacità del buffer e l'ordine delle istruzioni.
