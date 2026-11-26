# OS Simulator: Architettura di Sistema e Master Plan

Questo documento definisce l'architettura tecnica e il piano di lavoro a fasi per la realizzazione del plugin **OS Simulator** (`os-simulator`) all'interno della piattaforma **LearnHarness**.

---

## 1. Principi Architetturali e Requisiti Non-Negoziabili

1. **Zero Logica Hardcoded (Total Parametric Freedom)**:
   - Nessun algoritmo, dimensione di memoria, traccia o processo deve essere cablato nel codice.
   - Lo studente deve poter inserire parametri e tracce arbitrarie da qualsiasi testo d'esame:
     - Dimensioni spazio virtuale e fisico (in bit o byte, es. 10 bit / 1 KB, 14 bit / 16 KB, 32 bit / 4 GB).
     - Dimensione pagina e frame (es. 64 B, 512 B, 4 KB).
     - Registri di segmentazione con crescita positiva (SEG0) o negativa (SEG1 / Stack).
     - Tabelle delle pagine a 1 o 2 livelli con bitfield arbitrari.
     - Stringhe di riferimento di pagine (es. `1, 2, 3, 4, 1, 2, 5...`) e numero di frame fisici.
     - Code MLFQ con numero di livelli, time slice e allotment configurabili.
     - Tracce di thread assembly/microistruzioni e valori di semaforo iniziali.
   - I dati degli esercizi d'esame UNIMI/OSTEP sono forniti unicamente come **Preset caricabili**, non come costanti interne.
2. **Architettura a 1 Plugin, 3 Modalità di Workspace**:
   - Pacchetto unico `plugins/os-simulator/` (Plugin API v1).
   - Registra 3 workspace mode distinti nel catalogo di Study Hub:
     1. `memory-lab`: Virtualizzazione Memoria & Traduzione Indirizzi.
     2. `cpu-lab`: Scheduling CPU & Meccanismi Hardware (LDE).
     3. `concurrency-lab`: Concorrenza, Sincronizzazione & Deadlock.
3. **Design `$unslop` Rigoroso**:
   - Quiet Chrome: superfici neutre basate sui token dell'host (`--background`, `--card`, `--border`, `--muted`).
   - Un solo elemento cromatico primario per vista (il visualizzatore di bit, la memoria fisica, il diagramma di Gantt o il grafo RAG).
   - Nessun gradiente o riflesso porpora, nessun pulsante con emoji, solo icone standard Lucide (`size-4`, tratto 1.5–2px).
   - Tipografia: `font-title` (CMU Serif), `font-mono` (`tabular-nums` per indirizzi e bit), `Source Sans 3` per etichette.
4. **Suddivisione in Fasi Modulari per AI Indipendenti**:
   - Ogni fase ha contratti TypeScript rigidi, input/output definiti, criteri di accettazione e comandi di verifica terminale.
   - Ogni fase può essere implementata e testata da un agente separato senza ambiguità.

---

## 2. Valutazione Architetturale ($architect)

### Tracciamento dei Confini (Boundary Map)
- **Host LearnHarness (Upstream)**:
  - Backend: `registerMode` con schema descrittivo e hook `initializeWorkspace({ storage })`.
  - Frontend: `registerModeRenderer(pluginId, modeId, renderer)` con ciclo di vita `mount(container, context)`.
  - Persistenza: `context.storage` (`get`, `set`) memorizza lo stato serializzabile JSON.
- **Motori di Simulazione (Core Domain)**:
  - Moduli TypeScript puri, privi di dipendenze DOM, completamente testabili con Node/Vitest.
- **Interfaccia Utente (Downstream)**:
  - Renderers reattivi che montano nel contenitore DOM fornito dall'host, osservano lo stato ed emettono azioni utente.

### Confronto tra Forme Concorrenti (Competing Shapes)

#### Forma A: Motore Funzionale Immutabile con Reducer e Tagged Unions (Scelta Vincente)
- **Struttura**:
  - Stato rappresentato da uno snapshot JSON immutabile: `State`.
  - Transizioni di stato determinate da funzioni pure: `reduce(state: State, action: Action): State`.
  - Gli eventi di calcolo producono tracce dettagliate: `step(state: State): { nextState: State; stepLog: StepExplanation }`.
- **Vantaggi**:
  - *Single Owner*: Lo stato del workspace è posseduto da un unico atomo immutabile.
  - *Single Way*: Ogni mutazione avviene tramite un'azione tipizzata (`SET_PARAM`, `LOAD_TRACE`, `STEP_FORWARD`, `RESET`).
  - *Scrubbing Temporale*: Supporto nativo per Undo/Redo e visualizzazione a scorrimento temporale (Time Travel Debugging).
  - *Persistenza Istantanea*: `storage.set(key, state)` serializza direttamente lo snapshot senza trasformazioni.

#### Forma B: Motore a Oggetti con Stato Interno Mutabile ed EventEmitter
- **Struttura**:
  - Classi come `new MemorySimulator(config)` che mantengono stato mutabile e registri privati.
  - Metodi `sim.executeNextInstruction()` che emettono eventi `'page-fault'`, `'tlb-hit'`.
- **Svantaggi**:
  - Difficile implementare lo scrubbing a ritroso (richiede memento pattern o cloni continui).
  - Rischio di disallineamento tra stato DOM e stato interno della classe durante il mount/unmount di LearnHarness.
  - Più fragile in caso di riavvio o ripristino di sessione.

**Decisione**: Si adotta la **Forma A**.

---

## 3. Mappa delle Fasi di Implementazione

| Fase | Documento Specifico | Responsabilità Principale |
|---|---|---|
| **Fase 0** | [phase-0-contracts-and-host.md](file:///home/joel/Documents/learnharness/docs/os-simulator/phase-0-contracts-and-host.md) | Setup pacchetto `plugins/os-simulator/`, manifest API v1, backend multi-mode, contratti TypeScript condivisi e parser di input boundary. |
| **Fase 1** | [phase-1-memory-lab.md](file:///home/joel/Documents/learnharness/docs/os-simulator/phase-1-memory-lab.md) | Motore parametrico di virtualizzazione memoria (Segmentazione crescita $\pm$, Paging 1 e 2 livelli, TLB con ASID, Swapping con Clock/LRU/FIFO) e UI con bit-slicer e memoria fisica. |
| **Fase 2** | [phase-2-cpu-lab.md](file:///home/joel/Documents/learnharness/docs/os-simulator/phase-2-cpu-lab.md) | Motore parametrico di scheduling CPU (FIFO, SJF, STCF, RR, MLFQ a 5 regole) + Simulatore Hardware LDE (Ring 0/3, IDT, TSS, Trap Frame) e UI con Gantt interattivo. |
| **Fase 3** | [phase-3-concurrency-lab.md](file:///home/joel/Documents/learnharness/docs/os-simulator/phase-3-concurrency-lab.md) | Motore di interleaving deterministico per thread, primitive di sincronizzazione (Lock HW, Mesa CV con 2 code, Semafori Dijkstra) + Analizzatore RAG di Deadlock e UI interattiva. |
| **Fase 4** | [phase-4-integration-and-testing.md](file:///home/joel/Documents/learnharness/docs/os-simulator/phase-4-integration-and-testing.md) | Persistenza workspace, preset d'esame UNIMI, audit finale `$unslop`, suite completa di test automatizzati e verifica di build. |
