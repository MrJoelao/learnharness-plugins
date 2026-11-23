import { buildRAG } from "./rag.js";
import type { ConcurrencyScenarioState } from "./types.js";

export const LOST_UPDATE_DEMO: ConcurrencyScenarioState = (() => {
  const state: ConcurrencyScenarioState = {
    scenarioId: "lost-update",
    name: "Lost Update Race Condition",
    description:
      "Due thread eseguono l'operazione non atomica x = x + 1. Senza sincronizzazione, un context switch tra lettura e scrittura porta al valore errato x = 11 invece di x = 12.",
    threads: [
      {
        id: "T1",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "read", targetVariable: "x", register: "eax", label: "mov x, %eax" },
          { op: "add", register: "eax", literal: 1, label: "add $1, %eax" },
          { op: "write", targetVariable: "x", register: "eax", label: "mov %eax, x" }
        ]
      },
      {
        id: "T2",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "read", targetVariable: "x", register: "eax", label: "mov x, %eax" },
          { op: "add", register: "eax", literal: 1, label: "add $1, %eax" },
          { op: "write", targetVariable: "x", register: "eax", label: "mov %eax, x" }
        ]
      }
    ],
    sharedMemory: { x: 10 },
    activeThreadId: "T1",
    locks: {},
    semaphores: {},
    conditionVariables: {},
    rag: {
      processes: ["T1", "T2"],
      resources: [],
      requests: [],
      allocations: [],
      detectedCycles: []
    },
    executionHistory: ["Scenario inizializzato: variabile condivisa x = 10."],
    stepCount: 0
  };
  state.rag = buildRAG(state);
  return state;
})();

export const TICKET_LOCK_DEMO: ConcurrencyScenarioState = (() => {
  const state: ConcurrencyScenarioState = {
    scenarioId: "ticket-lock",
    name: "Ticket Lock (Hardware Sync)",
    description:
      "Implementazione hardware di Ticket Lock con fetch-and-add (ticket e turn). Garantisce fairness assoluta e ordine FIFO di acquisizione senza starvation.",
    threads: [
      {
        id: "T1",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "lock", syncObject: "ticket_lock", label: "lock(&ticket_lock) [fetch_and_add]" },
          { op: "read", targetVariable: "counter", register: "eax", label: "mov counter, %eax" },
          { op: "add", register: "eax", literal: 1, label: "add $1, %eax" },
          { op: "write", targetVariable: "counter", register: "eax", label: "mov %eax, counter" },
          { op: "unlock", syncObject: "ticket_lock", label: "unlock(&ticket_lock) [turn++]" }
        ]
      },
      {
        id: "T2",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "lock", syncObject: "ticket_lock", label: "lock(&ticket_lock) [fetch_and_add]" },
          { op: "read", targetVariable: "counter", register: "eax", label: "mov counter, %eax" },
          { op: "add", register: "eax", literal: 1, label: "add $1, %eax" },
          { op: "write", targetVariable: "counter", register: "eax", label: "mov %eax, counter" },
          { op: "unlock", syncObject: "ticket_lock", label: "unlock(&ticket_lock) [turn++]" }
        ]
      },
      {
        id: "T3",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "lock", syncObject: "ticket_lock", label: "lock(&ticket_lock) [fetch_and_add]" },
          { op: "read", targetVariable: "counter", register: "eax", label: "mov counter, %eax" },
          { op: "add", register: "eax", literal: 1, label: "add $1, %eax" },
          { op: "write", targetVariable: "counter", register: "eax", label: "mov %eax, counter" },
          { op: "unlock", syncObject: "ticket_lock", label: "unlock(&ticket_lock) [turn++]" }
        ]
      }
    ],
    sharedMemory: { counter: 0 },
    activeThreadId: "T1",
    locks: {
      ticket_lock: {
        id: "ticket_lock",
        heldBy: null,
        waitQueue: [],
        type: "ticket",
        ticket: 0,
        turn: 0,
        threadTickets: {}
      }
    },
    semaphores: {},
    conditionVariables: {},
    rag: {
      processes: ["T1", "T2", "T3"],
      resources: ["ticket_lock"],
      requests: [],
      allocations: [],
      detectedCycles: []
    },
    executionHistory: ["Scenario inizializzato: ticket_lock pronto (ticket=0, turn=0), counter=0."],
    stepCount: 0
  };
  state.rag = buildRAG(state);
  return state;
})();

export const BOUNDED_BUFFER_MESA: ConcurrencyScenarioState = (() => {
  const state: ConcurrencyScenarioState = {
    scenarioId: "bounded-buffer-mesa",
    name: "Bounded Buffer (Mesa CVs - 2 CV Corretto)",
    description:
      "Buffer circolare di capacità 2 con mutex e 2 Condition Variables (empty e fill). Mostra il ciclo while (!condition) della semantica Mesa e il rilascio/riacquisizione atomica del lock.",
    threads: [
      {
        id: "P1",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "lock", syncObject: "mutex", label: "mutex_lock(&mutex)" },
          {
            op: "wait",
            syncObject: "empty",
            condition: { variable: "count", conditionOp: ">=", value: 2 },
            label: "while (count == MAX) wait(&empty, &mutex)"
          },
          { op: "write", targetVariable: "buffer", literal: 42, label: "put(42)" },
          { op: "signal", syncObject: "fill", label: "cond_signal(&fill)" },
          { op: "unlock", syncObject: "mutex", label: "mutex_unlock(&mutex)" }
        ]
      },
      {
        id: "C1",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "lock", syncObject: "mutex", label: "mutex_lock(&mutex)" },
          {
            op: "wait",
            syncObject: "fill",
            condition: { variable: "count", conditionOp: "<=", value: 0 },
            label: "while (count == 0) wait(&fill, &mutex)"
          },
          { op: "read", targetVariable: "buffer", register: "eax", label: "get() -> %eax" },
          { op: "signal", syncObject: "empty", label: "cond_signal(&empty)" },
          { op: "unlock", syncObject: "mutex", label: "mutex_unlock(&mutex)" }
        ]
      },
      {
        id: "C2",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "lock", syncObject: "mutex", label: "mutex_lock(&mutex)" },
          {
            op: "wait",
            syncObject: "fill",
            condition: { variable: "count", conditionOp: "<=", value: 0 },
            label: "while (count == 0) wait(&fill, &mutex)"
          },
          { op: "read", targetVariable: "buffer", register: "eax", label: "get() -> %eax" },
          { op: "signal", syncObject: "empty", label: "cond_signal(&empty)" },
          { op: "unlock", syncObject: "mutex", label: "mutex_unlock(&mutex)" }
        ]
      }
    ],
    sharedMemory: {},
    activeThreadId: "C1",
    locks: {
      mutex: {
        id: "mutex",
        heldBy: null,
        waitQueue: [],
        type: "mutex"
      }
    },
    semaphores: {},
    conditionVariables: {
      empty: {
        id: "empty",
        associatedLock: "mutex",
        waitQueue: []
      },
      fill: {
        id: "fill",
        associatedLock: "mutex",
        waitQueue: []
      }
    },
    boundedBuffer: {
      capacity: 2,
      items: [],
      inPtr: 0,
      outPtr: 0
    },
    rag: {
      processes: ["P1", "C1", "C2"],
      resources: ["mutex", "empty", "fill"],
      requests: [],
      allocations: [],
      detectedCycles: []
    },
    executionHistory: ["Scenario inizializzato: buffer vuoto (capacità 2), 2 CV (empty, fill)."],
    stepCount: 0
  };
  state.rag = buildRAG(state);
  return state;
})();

export const BOUNDED_BUFFER_1CV_BUG: ConcurrencyScenarioState = (() => {
  const state: ConcurrencyScenarioState = {
    scenarioId: "bounded-buffer-1cv-bug",
    name: "Bounded Buffer (Baco 1 CV)",
    description:
      "Uso errato di una sola Condition Variable per sia empty che fill. Mostra il baco descritto da OSTEP dove un consumer risveglia un altro consumer portando a stallo.",
    threads: [
      {
        id: "P1",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "lock", syncObject: "mutex", label: "mutex_lock(&mutex)" },
          {
            op: "wait",
            syncObject: "cond",
            condition: { variable: "count", conditionOp: ">=", value: 1 },
            label: "while (count == 1) wait(&cond, &mutex)"
          },
          { op: "write", targetVariable: "buffer", literal: 100, label: "put(100)" },
          { op: "signal", syncObject: "cond", label: "cond_signal(&cond) [1 CV BUG]" },
          { op: "unlock", syncObject: "mutex", label: "mutex_unlock(&mutex)" }
        ]
      },
      {
        id: "C1",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "lock", syncObject: "mutex", label: "mutex_lock(&mutex)" },
          {
            op: "wait",
            syncObject: "cond",
            condition: { variable: "count", conditionOp: "<=", value: 0 },
            label: "while (count == 0) wait(&cond, &mutex)"
          },
          { op: "read", targetVariable: "buffer", register: "eax", label: "get() -> %eax" },
          { op: "signal", syncObject: "cond", label: "cond_signal(&cond) [wakes C2 instead of P1]" },
          { op: "unlock", syncObject: "mutex", label: "mutex_unlock(&mutex)" }
        ]
      },
      {
        id: "C2",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "lock", syncObject: "mutex", label: "mutex_lock(&mutex)" },
          {
            op: "wait",
            syncObject: "cond",
            condition: { variable: "count", conditionOp: "<=", value: 0 },
            label: "while (count == 0) wait(&cond, &mutex)"
          },
          { op: "read", targetVariable: "buffer", register: "eax", label: "get() -> %eax" },
          { op: "signal", syncObject: "cond", label: "cond_signal(&cond)" },
          { op: "unlock", syncObject: "mutex", label: "mutex_unlock(&mutex)" }
        ]
      }
    ],
    sharedMemory: {},
    activeThreadId: "C1",
    locks: {
      mutex: {
        id: "mutex",
        heldBy: null,
        waitQueue: [],
        type: "mutex"
      }
    },
    semaphores: {},
    conditionVariables: {
      cond: {
        id: "cond",
        associatedLock: "mutex",
        waitQueue: []
      }
    },
    boundedBuffer: {
      capacity: 1,
      items: [],
      inPtr: 0,
      outPtr: 0
    },
    rag: {
      processes: ["P1", "C1", "C2"],
      resources: ["mutex", "cond"],
      requests: [],
      allocations: [],
      detectedCycles: []
    },
    executionHistory: ["Scenario inizializzato: buffer capacità 1 con singola CV cond."],
    stepCount: 0
  };
  state.rag = buildRAG(state);
  return state;
})();

export const SEMAPHORE_DEADLOCK_ORDER: ConcurrencyScenarioState = (() => {
  const state: ConcurrencyScenarioState = {
    scenarioId: "semaphore-deadlock-order",
    name: "Semaphore Wait Order Bug (Deadlock)",
    description:
      "Buffer con semafori di Dijkstra dove il consumatore inverte l'ordine delle attese (sem_wait(mutex) prima di sem_wait(fill)), causando deadlock a buffer vuoto (OSTEP Fig. 31.12).",
    threads: [
      {
        id: "Consumer",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "sem_wait", syncObject: "mutex", label: "sem_wait(&mutex) [BUG: mutex prima di fill]" },
          { op: "sem_wait", syncObject: "fill", label: "sem_wait(&fill) [bloccato con mutex trattenuto]" },
          { op: "read", targetVariable: "buffer", register: "eax", label: "get() -> %eax" },
          { op: "sem_post", syncObject: "mutex", label: "sem_post(&mutex)" },
          { op: "sem_post", syncObject: "empty", label: "sem_post(&empty)" }
        ]
      },
      {
        id: "Producer",
        programCounter: 0,
        registers: { eax: 0 },
        state: "ready",
        callStack: [],
        instructions: [
          { op: "sem_wait", syncObject: "empty", label: "sem_wait(&empty)" },
          { op: "sem_wait", syncObject: "mutex", label: "sem_wait(&mutex) [bloccato: mutex held by Consumer]" },
          { op: "write", targetVariable: "buffer", literal: 99, label: "put(99)" },
          { op: "sem_post", syncObject: "mutex", label: "sem_post(&mutex)" },
          { op: "sem_post", syncObject: "fill", label: "sem_post(&fill)" }
        ]
      }
    ],
    sharedMemory: {},
    activeThreadId: "Consumer",
    locks: {},
    semaphores: {
      mutex: {
        id: "mutex",
        value: 1,
        waitQueue: [],
        initialValue: 1,
        allocatedTo: []
      },
      empty: {
        id: "empty",
        value: 1,
        waitQueue: [],
        initialValue: 1,
        allocatedTo: []
      },
      fill: {
        id: "fill",
        value: 0,
        waitQueue: [],
        initialValue: 0,
        allocatedTo: []
      }
    },
    conditionVariables: {},
    boundedBuffer: {
      capacity: 1,
      items: [],
      inPtr: 0,
      outPtr: 0
    },
    rag: {
      processes: ["Consumer", "Producer"],
      resources: ["mutex", "empty", "fill"],
      requests: [],
      allocations: [],
      detectedCycles: []
    },
    executionHistory: [
      "Scenario inizializzato: buffer capacità 1, mutex=1, empty=1, fill=0."
    ],
    stepCount: 0
  };
  state.rag = buildRAG(state);
  return state;
})();

export const DINING_PHILOSOPHERS_DEADLOCK: ConcurrencyScenarioState = (() => {
  const forks = ["fork0", "fork1", "fork2", "fork3", "fork4"];
  const locks: Record<string, { id: string; heldBy: string | null; waitQueue: string[]; type: "mutex" }> = {};
  for (const f of forks) {
    locks[f] = { id: f, heldBy: null, waitQueue: [], type: "mutex" };
  }

  const threads = [0, 1, 2, 3, 4].map((i) => {
    const leftFork = `fork${i}`;
    const rightFork = `fork${(i + 1) % 5}`;
    return {
      id: `P${i}`,
      programCounter: 0,
      registers: { eax: 0 },
      state: "ready" as const,
      callStack: [],
      instructions: [
        { op: "lock" as const, syncObject: leftFork, label: `lock(&${leftFork}) [sinistra]` },
        { op: "lock" as const, syncObject: rightFork, label: `lock(&${rightFork}) [destra]` },
        { op: "add" as const, register: "eax", literal: 1, label: "eat()" },
        { op: "unlock" as const, syncObject: leftFork, label: `unlock(&${leftFork})` },
        { op: "unlock" as const, syncObject: rightFork, label: `unlock(&${rightFork})` }
      ]
    };
  });

  const state: ConcurrencyScenarioState = {
    scenarioId: "dining-philosophers-deadlock",
    name: "Dining Philosophers (Symmetric Deadlock)",
    description:
      "5 filosofi e 5 forchette con acquisizione simmetrica (sinistra poi destra). Quando tutti prendono la forchetta sinistra, si genera il ciclo di Coffman e deadlock totale.",
    threads,
    sharedMemory: {},
    activeThreadId: "P0",
    locks,
    semaphores: {},
    conditionVariables: {},
    rag: {
      processes: ["P0", "P1", "P2", "P3", "P4"],
      resources: forks,
      requests: [],
      allocations: [],
      detectedCycles: []
    },
    executionHistory: ["Scenario inizializzato: 5 filosofi simmetrici con 5 forchette."],
    stepCount: 0
  };
  state.rag = buildRAG(state);
  return state;
})();

export const DINING_PHILOSOPHERS_ASYMMETRIC: ConcurrencyScenarioState = (() => {
  const forks = ["fork0", "fork1", "fork2", "fork3", "fork4"];
  const locks: Record<string, { id: string; heldBy: string | null; waitQueue: string[]; type: "mutex" }> = {};
  for (const f of forks) {
    locks[f] = { id: f, heldBy: null, waitQueue: [], type: "mutex" };
  }

  const threads = [0, 1, 2, 3, 4].map((i) => {
    let firstFork: string;
    let secondFork: string;

    if (i === 4) {
      firstFork = "fork0";
      secondFork = "fork4";
    } else {
      firstFork = `fork${i}`;
      secondFork = `fork${(i + 1) % 5}`;
    }

    return {
      id: `P${i}`,
      programCounter: 0,
      registers: { eax: 0 },
      state: "ready" as const,
      callStack: [],
      instructions: [
        { op: "lock" as const, syncObject: firstFork, label: `lock(&${firstFork})` },
        { op: "lock" as const, syncObject: secondFork, label: `lock(&${secondFork})` },
        { op: "add" as const, register: "eax", literal: 1, label: "eat()" },
        { op: "unlock" as const, syncObject: firstFork, label: `unlock(&${firstFork})` },
        { op: "unlock" as const, syncObject: secondFork, label: `unlock(&${secondFork})` }
      ]
    };
  });

  const state: ConcurrencyScenarioState = {
    scenarioId: "dining-philosophers-asymmetric",
    name: "Dining Philosophers (Soluzione Asimmetrica)",
    description:
      "Soluzione di Dijkstra: il filosofo P4 inverte l'ordine delle forchette (acquisisce prima fork0, poi fork4). Rompe l'attesa circolare prevenendo il deadlock.",
    threads,
    sharedMemory: {},
    activeThreadId: "P0",
    locks,
    semaphores: {},
    conditionVariables: {},
    rag: {
      processes: ["P0", "P1", "P2", "P3", "P4"],
      resources: forks,
      requests: [],
      allocations: [],
      detectedCycles: []
    },
    executionHistory: ["Scenario inizializzato: P4 inverte l'ordine delle forchette."],
    stepCount: 0
  };
  state.rag = buildRAG(state);
  return state;
})();

export const CONCURRENCY_PRESETS = [
  LOST_UPDATE_DEMO,
  TICKET_LOCK_DEMO,
  BOUNDED_BUFFER_MESA,
  BOUNDED_BUFFER_1CV_BUG,
  SEMAPHORE_DEADLOCK_ORDER,
  DINING_PHILOSOPHERS_DEADLOCK,
  DINING_PHILOSOPHERS_ASYMMETRIC
];
