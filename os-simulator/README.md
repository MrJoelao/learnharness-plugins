# OS Simulator

Laboratorio visivo e parametrico di Sistemi Operativi per LearnHarness.

## Modalità Study Hub

1. **Memory Virtualization Lab** (`memory-lab`):
   Simulatore di Segmentazione (+/-), Paging lineare e a 2 livelli, TLB e Swapping con politiche di rimpiazzamento (Clock, LRU, FIFO).
2. **CPU Scheduling & Hardware Lab** (`cpu-lab`):
   Simulatore di Gantt (FIFO, SJF, STCF, RR, MLFQ a 5 regole) e meccanismo Limited Direct Execution (LDE).
3. **Concurrency & Deadlock Lab** (`concurrency-lab`):
   Interleaving deterministico di thread, primitive di sincronizzazione (Lock HW, semafori, condition variables) e rilevamento Deadlock tramite grafi RAG.

## Sviluppo

```bash
npm run sdk         # Genera i tipi locali della Plugin API
npm run build       # Compila frontend (dist/main.js), backend (dist/backend.cjs) e stili
npm run typecheck   # Controllo tipi TypeScript strict
npm test            # Esegue la suite di test
```

## Licenza

AGPL-3.0-only
