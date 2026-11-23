# Fase 0: Setup Pacchetto, Manifest e Contratti TypeScript Condivisi

Questa fase definisce la base architetturale del plugin `os-simulator`, il manifest conforme all'API v1 di LearnHarness, l'inizializzazione del backend per registrare le 3 modalità in Study Hub e i tipi di dominio condivisi.

---

## 1. Struttura dei File della Fase 0

```
plugins/os-simulator/
├── manifest.json
├── package.json
├── tsconfig.json
└── src/
    ├── types/
    │   └── common.ts              # Primitive di bit, indirizzi e boundary parsers
    └── backend/
        └── index.ts               # Registrazione delle 3 modalità e default storage
```

---

## 2. Specifiche del Manifest (`plugins/os-simulator/manifest.json`)

```json
{
  "apiVersion": 1,
  "id": "os-simulator",
  "name": "OS Simulator",
  "version": "1.0.0",
  "minAppVersion": "0.7.0",
  "description": "Laboratorio visivo e parametrico di Sistemi Operativi (CPU, Memoria, Concorrenza).",
  "author": "Joel",
  "main": "main.js",
  "backend": "backend.cjs",
  "styles": "styles.css"
}
```

---

## 3. Contratti TypeScript di Dominio (`src/types/common.ts`)

```typescript
/**
 * Tipi primitivi e validati per bit e indirizzi di memoria.
 */
export type Bit = 0 | 1;
export type HexString = `0x${string}`;

export interface AddressSplit {
  raw: number;
  hex: string;
  binary: string;
  components: Record<string, { bits: number; value: number; binary: string }>;
}

/**
 * Risultato analitico di una fase di simulazione.
 */
export interface SimulationStepLog {
  stepIndex: number;
  timestamp: string;
  title: string;
  description: string;
  formulaApplied?: string;
  status: 'ok' | 'violation' | 'fault' | 'hit' | 'miss' | 'blocked' | 'deadlock';
}

/**
 * Parser al boundary per prevenire dati malformati dall'input utente.
 */
export interface BoundaryParser<T> {
  parse(raw: unknown): { success: true; data: T } | { success: false; error: string };
}
```

---

## 4. Backend Registration (`src/backend/index.ts` $\to$ `dist/backend.cjs`)

```typescript
import type { PluginBackendContext } from "learnharness-plugin-api";

export function activate(ctx: PluginBackendContext): void {
  // 1. Modalità Memoria
  ctx.registerMode({
    id: "memory-lab",
    name: "Memory Virtualization Lab",
    description: "Simulatore di Segmentazione (+/-), Paging lineare e a 2 livelli, TLB e Swapping.",
    category: "Operating Systems",
    icon: "Network",
    tags: ["memory", "paging", "segmentation", "tlb", "replacement-policies"],
    difficulty: "intermediate",
    activityType: "exploration",
    capabilities: ["simulation", "custom-exercises", "step-by-step"],
    initializeWorkspace({ workspace, storage }) {
      storage.set("memory-state", {
        workspaceId: workspace.id,
        subsystem: "segmentation",
        customConfig: null,
        history: [],
        lastUpdated: new Date().toISOString()
      });
    }
  });

  // 2. Modalità CPU
  ctx.registerMode({
    id: "cpu-lab",
    name: "CPU Scheduling & Hardware Lab",
    description: "Simulatore di Gantt (FIFO, SJF, STCF, RR, MLFQ a 5 regole) e meccanismo LDE.",
    category: "Operating Systems",
    icon: "Calculator",
    tags: ["cpu", "scheduling", "mlfq", "round-robin", "privilege-levels"],
    difficulty: "intermediate",
    activityType: "exploration",
    capabilities: ["gantt", "step-debugger", "metrics"],
    initializeWorkspace({ workspace, storage }) {
      storage.set("cpu-state", {
        workspaceId: workspace.id,
        algorithm: "rr",
        quantum: 2,
        workload: [],
        lastUpdated: new Date().toISOString()
      });
    }
  });

  // 3. Modalità Concorrenza
  ctx.registerMode({
    id: "concurrency-lab",
    name: "Concurrency & Deadlock Lab",
    description: "Interleaving deterministico di thread, lock, semafori, condition variables e grafi RAG.",
    category: "Operating Systems",
    icon: "Brain",
    tags: ["concurrency", "threads", "semaphores", "deadlock", "bounded-buffer"],
    difficulty: "advanced",
    activityType: "practice",
    capabilities: ["thread-interleaving", "rag-graph", "deadlock-detection"],
    initializeWorkspace({ workspace, storage }) {
      storage.set("concurrency-state", {
        workspaceId: workspace.id,
        scenario: "bounded-buffer",
        threads: [],
        lastUpdated: new Date().toISOString()
      });
    }
  });
}
```

---

## 5. Criteri di Accettazione e Verifica Terminale

L'agente che implementa la Fase 0 deve verificare:
1. `manifest.json` valido conforme allo schema LearnHarness API v1.
2. Il file compilato `dist/backend.cjs` esporta correttamente `activate(ctx)` con la registrazione delle 3 modalità senza errori sintattici:
   ```bash
   node -e "const b = require('./plugins/os-simulator/dist/backend.cjs'); console.log(typeof b.activate);"
   ```
3. Typecheck rigoroso di `common.ts` tramite TypeScript compiler (`tsc --noEmit`).
