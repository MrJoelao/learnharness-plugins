# Fase 2: Laboratorio di Virtualizzazione CPU e Meccanismi Hardware (`cpu-lab`)

Questa fase descrive l'architettura tecnica del modulo **CPU Scheduling & Hardware Mechanisms Lab**.
Copre gli algoritmi di scheduling (FIFO, SJF, STCF, RR, MLFQ a 5 regole) e il simulatore visivo del protocollo **Limited Direct Execution (LDE)** con commutazione di privilegio e trap frame.

---

## 1. Modello Dati e Tipi di Dominio (`src/core/cpu/types.ts`)

```typescript
export type ProcessState = 'ready' | 'running' | 'blocked' | 'terminated';

export interface CpuBurst {
  duration: number;
}

export interface IoBurst {
  duration: number;
}

export interface ProcessWorkload {
  id: string;                 // Es. "P1", "A", "Process-0"
  arrivalTime: number;        // Istante di arrivo
  priority?: number;          // Per code con priorità iniziale
  bursts: Array<{ type: 'cpu' | 'io'; duration: number }>;
}

export interface MlfqQueueConfig {
  priority: number;           // 0 = priorità massima
  timeSlice: number;          // Quantum di questa specifica coda
  allotment: number;          // Tempo massimo cumulativo prima della retrocessione
}

export interface MlfqConfig {
  queues: MlfqQueueConfig[];
  priorityBoostInterval: number; // Intervallo S per ripristino di priorità
}

export interface SchedulerMetrics {
  processId: string;
  arrivalTime: number;
  firstRunTime: number;
  completionTime: number;
  turnaroundTime: number;     // completion - arrival
  responseTime: number;       // first_run - arrival
  waitTime: number;           // turnaround - sum(cpu_bursts)
}

export interface SchedulerTimelineStep {
  tick: number;
  runningProcessId: string | null;
  readyQueue: string[];
  blockedQueue: Array<{ id: string; remainingIo: number }>;
  mlfqQueues?: Record<number, string[]>;
  eventDescription: string;
}

export interface HardwarePrivilegeState {
  cpl: 0 | 3;                 // Current Privilege Level (0 = Ring 0 Kernel, 3 = Ring 3 User)
  currentInstruction: string;
  stackPointer: number;
  kernelStackPointer: number; // TSS esp0
  savedTrapFrame: {
    ss?: number;
    esp?: number;
    eflags?: number;
    cs?: number;
    eip?: number;
  } | null;
  stepDescription: string;
}
```

---

## 2. Motori di Calcolo Funzionali Puri

### 2.1 Motore di Scheduling Parametrico (`src/core/cpu/scheduler.ts`)
- **Supporto Workload Arbitrario**:
  - L'utente può creare processi con arrivi scaglionati, sequenze alternate di CPU e I/O bursts.
- **Implementazione MLFQ Completa (5 Regole OSTEP)**:
  - *Regola 1*: la coda con priorità più alta esegue prima.
  - *Regola 2*: processi alla stessa priorità eseguono in Round Robin.
  - *Regola 3*: i nuovi processi entrano in cima ($Q_0$).
  - *Regola 4 (Demozione per Allotment)*: un processo che esegue cumulativamente per un tempo pari all'allotment della sua coda scende di priorità, anche se effettua I/O prima dello scadere del singolo quantum.
  - *Regola 5 (Priority Boost)*: ogni $S$ tick, tutti i processi vengono spostati a $Q_0$ e il loro allotment viene azzerato.
- **Calcolo Metriche Live**:
  - Calcolo dinamico di media del turnaround time e response time ad ogni step della simulazione.

### 2.2 Simulatore Meccanismi Hardware e Transizioni di Privilegio LDE (`src/core/cpu/privilege.ts`)
- Macchina a stati esplicita che simula:
  1. Boot time: kernel registra handler nella IDT (Interrupt Descriptor Table).
  2. Esecuzione programma utente a Ring 3 (CPL=3).
  3. Timer Interrupt o Chiamata di sistema (`int 0x80` / `syscall`).
  4. Transizione hardware: CPU preleva `esp0` dal TSS, alloca il Trap Frame sul Kernel Stack, salva `%eip`, `%cs`, `%eflags`, `%esp`, `%ss`.
  5. Commutazione a Ring 0 (CPL=0) e salto all'handler.
  6. Esecuzione codice OS (salvataggio registri di contesto sul PCB, eventuale dispatch ad altro processo).
  7. Esecuzione `iret`: ripristino registri, ritorno a Ring 3 e ripresa del thread utente.

---

## 3. Interfaccia Utente e Controlli Parametrici (Applicazione `$unslop`)

1. **Gantt Chart Interattivo (One Bright Element)**:
   - Diagramma temporale orizzontale su griglia a 4px con indicazione visiva dei blocchi CPU, attese I/O e context switch.
   - Slider temporale con controlli di riproduzione: Play, Pausa, Step Forward, Step Backward, Reset, Salto a tick.
2. **Editor Parametrico di Processi**:
   - Tabella modificabile per aggiungere/rimuovere processi, cambiare Arrival Time e sequenza dei burst.
   - Import/Export JSON del workload per scambiare configurazioni d'esame.
3. **Pannello Metriche Tabulare**:
   - Tabella ordinata con cifre `tabular-nums` per tempi di turnaround, response e waiting.
4. **Ispettore Hardware LDE**:
   - Vista a due colonne che contrappone graficamente lo Stack Utente e lo Stack Kernel, con animazione del salvataggio del Trap Frame.

---

## 4. Criteri di Accettazione e Verifica Terminale

- Test di correttezza su simulazioni classiche OSTEP:
  - Confronto FIFO vs SJF con convoy effect.
  - Test MLFQ anti-gaming con processo che tenta di monopolizzare la CPU con I/O frequenti.
  - Verifica delle metriche di turnaround e response time con risultati attesi.
- Nessuna costante hardcoded: il motore accetta qualsiasi numero di code, quantum arbitrario e intervallo $S$.
