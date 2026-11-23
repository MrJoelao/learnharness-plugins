import type { BoundaryParser } from "../../types/common.js";
import type { SavedExercise } from "../../types/ai.js";

export type ProcessState = "ready" | "running" | "blocked" | "terminated";

export interface CpuBurst {
  type: "cpu";
  duration: number;
}

export interface IoBurst {
  type: "io";
  duration: number;
}

export type ProcessBurst = CpuBurst | IoBurst;

export interface ProcessWorkload {
  id: string;
  arrivalTime: number;
  priority?: number;
  bursts: ProcessBurst[];
}

export interface MlfqQueueConfig {
  priority: number;
  timeSlice: number;
  allotment: number;
}

export interface MlfqConfig {
  queues: MlfqQueueConfig[];
  priorityBoostInterval: number;
}

export interface SchedulerMetrics {
  processId: string;
  arrivalTime: number;
  firstRunTime: number;
  completionTime: number;
  turnaroundTime: number;
  responseTime: number;
  waitTime: number;
}

export interface SchedulerTimelineStep {
  tick: number;
  runningProcessId: string | null;
  readyQueue: string[];
  blockedQueue: Array<{ id: string; remainingIo: number }>;
  mlfqQueues?: Record<number, string[]>;
  eventDescription: string;
  isContextSwitch?: boolean;
}

export interface HardwarePrivilegeState {
  cpl: 0 | 3;
  currentInstruction: string;
  stackPointer: number;
  kernelStackPointer: number;
  savedTrapFrame: {
    ss?: number;
    esp?: number;
    eflags?: number;
    cs?: number;
    eip?: number;
  } | null;
  stepDescription: string;
  stepIndex: number;
  stageName: string;
  userStack: Array<{ address: number; value: string }>;
  kernelStack: Array<{ address: number; value: string }>;
}

export type CpuAlgorithm = "FIFO" | "SJF" | "STCF" | "RR" | "MLFQ" | "LDE";

export interface CpuPreset {
  id: string;
  name: string;
  description: string;
  algorithm: CpuAlgorithm;
  workload: ProcessWorkload[];
  rrQuantum?: number;
  mlfqConfig?: MlfqConfig;
}

export interface CpuLabState {
  workspaceId: string;
  algorithm: CpuAlgorithm;
  workload: ProcessWorkload[];
  rrQuantum: number;
  mlfqConfig: MlfqConfig;
  currentTick: number;
  isPlaying: boolean;
  playbackSpeed: number;
  activePresetId: string | null;
  ldeStepIndex: number;
  exerciseHistory?: SavedExercise[];
  activeExerciseId?: string | null;
  lastUpdated: string;
}

export const workloadBoundaryParser: BoundaryParser<ProcessWorkload[]> = {
  parse(raw: unknown) {
    if (!Array.isArray(raw) || raw.length === 0) {
      return { success: false, error: "Workload must be a non-empty array of processes." };
    }

    const parsed: ProcessWorkload[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (typeof item !== "object" || item === null) {
        return { success: false, error: `Process at index ${i} is not a valid object.` };
      }

      const id = (item as Record<string, unknown>).id;
      if (typeof id !== "string" || id.trim().length === 0) {
        return { success: false, error: `Process at index ${i} must have a non-empty string 'id'.` };
      }

      if (seenIds.has(id.trim())) {
        return { success: false, error: `Duplicate process ID detected: '${id}'.` };
      }
      seenIds.add(id.trim());

      const arrivalTime = (item as Record<string, unknown>).arrivalTime;
      if (typeof arrivalTime !== "number" || !Number.isInteger(arrivalTime) || arrivalTime < 0) {
        return { success: false, error: `Process '${id}' has invalid arrivalTime: must be an integer >= 0.` };
      }

      const rawBursts = (item as Record<string, unknown>).bursts;
      if (!Array.isArray(rawBursts) || rawBursts.length === 0) {
        return { success: false, error: `Process '${id}' must have a non-empty 'bursts' array.` };
      }

      const bursts: ProcessBurst[] = [];
      for (let b = 0; b < rawBursts.length; b++) {
        const burstItem = rawBursts[b];
        if (typeof burstItem !== "object" || burstItem === null) {
          return { success: false, error: `Burst ${b} of process '${id}' is not an object.` };
        }

        const type = (burstItem as Record<string, unknown>).type;
        if (type !== "cpu" && type !== "io") {
          return { success: false, error: `Burst ${b} of process '${id}' has invalid type: must be 'cpu' or 'io'.` };
        }

        const duration = (burstItem as Record<string, unknown>).duration;
        if (typeof duration !== "number" || !Number.isInteger(duration) || duration <= 0) {
          return { success: false, error: `Burst ${b} of process '${id}' has invalid duration: must be an integer > 0.` };
        }

        bursts.push({ type, duration });
      }

      const priority = (item as Record<string, unknown>).priority;
      const validPriority = typeof priority === "number" && Number.isInteger(priority) && priority >= 0
        ? priority
        : undefined;

      parsed.push({
        id: id.trim(),
        arrivalTime,
        priority: validPriority,
        bursts
      });
    }

    return { success: true, data: parsed };
  }
};

export const mlfqConfigBoundaryParser: BoundaryParser<MlfqConfig> = {
  parse(raw: unknown) {
    if (typeof raw !== "object" || raw === null) {
      return { success: false, error: "MLFQ config must be an object." };
    }

    const priorityBoostInterval = (raw as Record<string, unknown>).priorityBoostInterval;
    if (typeof priorityBoostInterval !== "number" || !Number.isInteger(priorityBoostInterval) || priorityBoostInterval <= 0) {
      return { success: false, error: "MLFQ priorityBoostInterval must be an integer > 0." };
    }

    const rawQueues = (raw as Record<string, unknown>).queues;
    if (!Array.isArray(rawQueues) || rawQueues.length === 0) {
      return { success: false, error: "MLFQ config must have at least one queue in 'queues'." };
    }

    const queues: MlfqQueueConfig[] = [];
    const seenPriorities = new Set<number>();

    for (let i = 0; i < rawQueues.length; i++) {
      const q = rawQueues[i];
      if (typeof q !== "object" || q === null) {
        return { success: false, error: `Queue at index ${i} is not an object.` };
      }

      const priority = (q as Record<string, unknown>).priority;
      if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 0) {
        return { success: false, error: `Queue at index ${i} has invalid priority: must be an integer >= 0.` };
      }

      if (seenPriorities.has(priority)) {
        return { success: false, error: `Duplicate queue priority detected: ${priority}.` };
      }
      seenPriorities.add(priority);

      const timeSlice = (q as Record<string, unknown>).timeSlice;
      if (typeof timeSlice !== "number" || !Number.isInteger(timeSlice) || timeSlice <= 0) {
        return { success: false, error: `Queue priority ${priority} has invalid timeSlice: must be an integer > 0.` };
      }

      const allotment = (q as Record<string, unknown>).allotment;
      if (typeof allotment !== "number" || !Number.isInteger(allotment) || allotment <= 0) {
        return { success: false, error: `Queue priority ${priority} has invalid allotment: must be an integer > 0.` };
      }

      queues.push({ priority, timeSlice, allotment });
    }

    queues.sort((a, b) => a.priority - b.priority);

    return {
      success: true,
      data: {
        queues,
        priorityBoostInterval
      }
    };
  }
};

export const quantumBoundaryParser: BoundaryParser<number> = {
  parse(raw: unknown) {
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
      return { success: false, error: "Quantum must be a positive integer > 0." };
    }
    return { success: true, data: raw };
  }
};

export function parseWorkloadInput(raw: unknown) {
  return workloadBoundaryParser.parse(raw);
}

export function parseMlfqConfig(raw: unknown) {
  return mlfqConfigBoundaryParser.parse(raw);
}

export function parseQuantum(raw: unknown) {
  return quantumBoundaryParser.parse(raw);
}

export const cpuPresetBoundaryParser: BoundaryParser<CpuPreset> = {
  parse(raw: unknown) {
    if (typeof raw !== "object" || raw === null) {
      return { success: false, error: "CPU Preset must be a non-null object." };
    }
    const rec = raw as Record<string, unknown>;
    const id = rec.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      return { success: false, error: "CPU Preset must have a non-empty string 'id'." };
    }
    const name = rec.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      return { success: false, error: "CPU Preset must have a non-empty string 'name'." };
    }
    const description = typeof rec.description === "string" ? rec.description : "";
    const validAlgorithms: CpuAlgorithm[] = ["FIFO", "SJF", "STCF", "RR", "MLFQ", "LDE"];
    const algorithm = rec.algorithm as CpuAlgorithm;
    if (!validAlgorithms.includes(algorithm)) {
      return { success: false, error: `Invalid CPU algorithm: '${String(rec.algorithm)}'. Must be one of: ${validAlgorithms.join(", ")}.` };
    }
    const parsedWorkload = workloadBoundaryParser.parse(rec.workload);
    if (!parsedWorkload.success) {
      return { success: false, error: `Invalid CPU workload: ${parsedWorkload.error}` };
    }

    const preset: CpuPreset = {
      id: id.trim(),
      name: name.trim(),
      description,
      algorithm,
      workload: parsedWorkload.data
    };

    if (rec.rrQuantum !== undefined) {
      const qRes = quantumBoundaryParser.parse(rec.rrQuantum);
      if (!qRes.success) {
        return { success: false, error: `Invalid rrQuantum: ${qRes.error}` };
      }
      preset.rrQuantum = qRes.data;
    }

    if (rec.mlfqConfig !== undefined) {
      const mlfqRes = mlfqConfigBoundaryParser.parse(rec.mlfqConfig);
      if (!mlfqRes.success) {
        return { success: false, error: `Invalid mlfqConfig: ${mlfqRes.error}` };
      }
      preset.mlfqConfig = mlfqRes.data;
    }

    return { success: true, data: preset };
  }
};

export function parseCpuPreset(raw: unknown) {
  return cpuPresetBoundaryParser.parse(raw);
}
