import type { CpuAlgorithm, CpuPreset, MlfqConfig, ProcessWorkload } from "./types.js";

export const FIFO_VS_SJF_CONVOY: CpuPreset = {
  id: "fifo-vs-sjf-convoy",
  name: "FIFO vs SJF (Convoy Effect)",
  description: "P1 (burst 100) blocca P2 e P3 (burst 10). In FIFO il turnaround medio è 110; in SJF scende a 50.",
  algorithm: "FIFO",
  workload: [
    {
      id: "P1",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 100 }]
    },
    {
      id: "P2",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 10 }]
    },
    {
      id: "P3",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 10 }]
    }
  ]
};

export const STCF_PREEMPTION: CpuPreset = {
  id: "stcf-preemption",
  name: "STCF (Shortest Time-to-Completion First)",
  description: "P1 (burst 100) avvia a t=0. Al tick 10 arriva P2 (burst 20) che sottrae la CPU a P1 tramite prelazione.",
  algorithm: "STCF",
  workload: [
    {
      id: "P1",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 100 }]
    },
    {
      id: "P2",
      arrivalTime: 10,
      bursts: [{ type: "cpu", duration: 20 }]
    }
  ]
};

export const RR_QUANTUM_DEMO: CpuPreset = {
  id: "rr-quantum-demo",
  name: "Round Robin (Quantum 2)",
  description: "P1, P2 e P3 (burst 5 ciascuno) alternano l'accesso alla CPU ogni 2 tick, minimizzando il response time.",
  algorithm: "RR",
  rrQuantum: 2,
  workload: [
    {
      id: "P1",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 5 }]
    },
    {
      id: "P2",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 5 }]
    },
    {
      id: "P3",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 5 }]
    }
  ]
};

export const DEFAULT_MLFQ_CONFIG: MlfqConfig = {
  queues: [
    { priority: 0, timeSlice: 10, allotment: 20 },
    { priority: 1, timeSlice: 20, allotment: 40 },
    { priority: 2, timeSlice: 40, allotment: 80 }
  ],
  priorityBoostInterval: 100
};

export const MLFQ_GAMING_WORKLOAD: CpuPreset = {
  id: "mlfq-gaming-workload",
  name: "MLFQ: Regola 4 (Demozione per Allotment Cumulativo)",
  description: "P2 tenta di monopolizzare la CPU eseguendo I/O al 90% del quantum (9 tick). La Regola 4 accumula l'allotment e lo retrocede a Q1.",
  algorithm: "MLFQ",
  mlfqConfig: DEFAULT_MLFQ_CONFIG,
  workload: [
    {
      id: "P1",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 50 }]
    },
    {
      id: "P2",
      arrivalTime: 0,
      bursts: [
        { type: "cpu", duration: 9 },
        { type: "io", duration: 2 },
        { type: "cpu", duration: 9 },
        { type: "io", duration: 2 },
        { type: "cpu", duration: 9 },
        { type: "io", duration: 2 }
      ]
    }
  ]
};

export const MLFQ_PRIORITY_BOOST: CpuPreset = {
  id: "mlfq-priority-boost",
  name: "MLFQ: Regola 5 (Priority Boost Periodico)",
  description: "Processi CPU-bound demotati a Q1 vengono riportati simultaneamente a Q0 ogni S=25 tick con azzeramento allotment.",
  algorithm: "MLFQ",
  mlfqConfig: {
    queues: [
      { priority: 0, timeSlice: 5, allotment: 10 },
      { priority: 1, timeSlice: 10, allotment: 20 }
    ],
    priorityBoostInterval: 25
  },
  workload: [
    {
      id: "P1",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 30 }]
    },
    {
      id: "P2",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 30 }]
    }
  ]
};

export const LDE_HARDWARE_TRANSITION: CpuPreset = {
  id: "lde-hardware-transition",
  name: "LDE: Transizione di Privilegio Hardware (Ring 3 -> 0 -> 3)",
  description: "Simulazione completa del protocollo Limited Direct Execution: avvio app con iret, chiamata sys_write (int 0x80), salvataggio Trap Frame su stack kernel e ritorno.",
  algorithm: "LDE",
  workload: [
    {
      id: "UserApp",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 10 }]
    }
  ]
};

export const CPU_PRESETS: CpuPreset[] = [
  FIFO_VS_SJF_CONVOY,
  STCF_PREEMPTION,
  RR_QUANTUM_DEMO,
  MLFQ_GAMING_WORKLOAD,
  MLFQ_PRIORITY_BOOST,
  LDE_HARDWARE_TRANSITION
];
