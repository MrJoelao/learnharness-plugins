import type { BoundaryParser } from "../../types/common.js";
import type { SavedExercise } from "../../types/ai.js";

export type ThreadState = "ready" | "running" | "blocked" | "terminated";

export type InstructionOp =
  | "read"
  | "write"
  | "add"
  | "sub"
  | "lock"
  | "unlock"
  | "wait"
  | "signal"
  | "sem_wait"
  | "sem_post";

export interface ThreadInstruction {
  op: InstructionOp;
  targetVariable?: string;
  register?: string;
  literal?: number;
  syncObject?: string;
  label?: string;
  condition?: {
    variable: string;
    conditionOp: "==" | "!=" | "<" | "<=" | ">" | ">=";
    value: number;
  };
}

export interface ThreadContext {
  id: string;
  programCounter: number;
  registers: Record<string, number>;
  state: ThreadState;
  callStack: string[];
  instructions: ThreadInstruction[];
  blockedOn?: {
    type: "lock" | "semaphore" | "condition";
    syncObject: string;
    ticket?: number;
  };
}

export interface SemaphoreState {
  id: string;
  value: number;
  waitQueue: string[];
  initialValue: number;
  allocatedTo?: string[];
}

export interface ConditionVarState {
  id: string;
  associatedLock: string;
  waitQueue: string[];
}

export interface LockState {
  id: string;
  heldBy: string | null;
  waitQueue: string[];
  type: "mutex" | "ticket";
  ticket?: number;
  turn?: number;
  threadTickets?: Record<string, number>;
}

export interface ResourceAllocationGraph {
  processes: string[];
  resources: string[];
  requests: Array<{ fromProcess: string; toResource: string }>;
  allocations: Array<{ fromResource: string; toProcess: string }>;
  detectedCycles: string[][];
}

export interface BoundedBufferState {
  capacity: number;
  items: number[];
  inPtr: number;
  outPtr: number;
}

export interface CoffmanConditionStatus {
  met: boolean;
  explanation: string;
}

export interface CoffmanReport {
  mutualExclusion: CoffmanConditionStatus;
  holdAndWait: CoffmanConditionStatus;
  noPreemption: CoffmanConditionStatus;
  circularWait: CoffmanConditionStatus;
  isDeadlocked: boolean;
  cycles: string[][];
}

export interface ConcurrencyScenarioState {
  scenarioId: string;
  name: string;
  description: string;
  threads: ThreadContext[];
  asymmetricThreads?: ThreadContext[];
  sharedMemory: Record<string, number>;
  activeThreadId: string | null;
  locks: Record<string, LockState>;
  semaphores: Record<string, SemaphoreState>;
  conditionVariables: Record<string, ConditionVarState>;
  boundedBuffer?: BoundedBufferState;
  rag: ResourceAllocationGraph;
  executionHistory: string[];
  stepCount: number;
}

export interface ConcurrencyLabState {
  workspaceId: string;
  activePresetId: string;
  scenarioState: ConcurrencyScenarioState;
  history: ConcurrencyScenarioState[];
  historyIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  exerciseHistory?: SavedExercise[];
  activeExerciseId?: string | null;
  lastUpdated: string;
}

const VALID_OPS: ReadonlySet<InstructionOp> = new Set([
  "read",
  "write",
  "add",
  "sub",
  "lock",
  "unlock",
  "wait",
  "signal",
  "sem_wait",
  "sem_post"
]);

export const instructionBoundaryParser: BoundaryParser<ThreadInstruction> = {
  parse(raw: unknown) {
    if (typeof raw !== "object" || raw === null) {
      return { success: false, error: "Instruction must be a non-null object." };
    }

    const op = (raw as Record<string, unknown>).op;
    if (typeof op !== "string" || !VALID_OPS.has(op as InstructionOp)) {
      return { success: false, error: `Invalid op '${String(op)}'. Must be one of: ${Array.from(VALID_OPS).join(", ")}.` };
    }

    const instruction: ThreadInstruction = {
      op: op as InstructionOp
    };

    const targetVariable = (raw as Record<string, unknown>).targetVariable;
    if (targetVariable !== undefined) {
      if (typeof targetVariable !== "string" || targetVariable.trim().length === 0) {
        return { success: false, error: "targetVariable must be a non-empty string when provided." };
      }
      instruction.targetVariable = targetVariable.trim();
    }

    const register = (raw as Record<string, unknown>).register;
    if (register !== undefined) {
      if (typeof register !== "string" || register.trim().length === 0) {
        return { success: false, error: "register must be a non-empty string when provided." };
      }
      instruction.register = register.trim();
    }

    const literal = (raw as Record<string, unknown>).literal;
    if (literal !== undefined) {
      if (typeof literal !== "number" || !Number.isFinite(literal)) {
        return { success: false, error: "literal must be a finite number when provided." };
      }
      instruction.literal = literal;
    }

    const syncObject = (raw as Record<string, unknown>).syncObject;
    if (syncObject !== undefined) {
      if (typeof syncObject !== "string" || syncObject.trim().length === 0) {
        return { success: false, error: "syncObject must be a non-empty string when provided." };
      }
      instruction.syncObject = syncObject.trim();
    }

    const label = (raw as Record<string, unknown>).label;
    if (label !== undefined) {
      if (typeof label !== "string") {
        return { success: false, error: "label must be a string when provided." };
      }
      instruction.label = label;
    }

    const condition = (raw as Record<string, unknown>).condition;
    if (condition !== undefined) {
      if (typeof condition !== "object" || condition === null) {
        return { success: false, error: "condition must be an object when provided." };
      }
      const variable = (condition as Record<string, unknown>).variable;
      const conditionOp = (condition as Record<string, unknown>).conditionOp;
      const value = (condition as Record<string, unknown>).value;

      if (typeof variable !== "string" || variable.trim().length === 0) {
        return { success: false, error: "condition.variable must be a non-empty string." };
      }
      const validCondOps = ["==", "!=", "<", "<=", ">", ">="];
      if (typeof conditionOp !== "string" || !validCondOps.includes(conditionOp)) {
        return { success: false, error: `condition.conditionOp must be one of: ${validCondOps.join(", ")}.` };
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { success: false, error: "condition.value must be a finite number." };
      }

      instruction.condition = {
        variable: variable.trim(),
        conditionOp: conditionOp as "==" | "!=" | "<" | "<=" | ">" | ">=",
        value
      };
    }

    return { success: true, data: instruction };
  }
};

export const instructionListBoundaryParser: BoundaryParser<ThreadInstruction[]> = {
  parse(raw: unknown) {
    if (!Array.isArray(raw)) {
      return { success: false, error: "Instruction list must be an array." };
    }

    const parsed: ThreadInstruction[] = [];
    for (let i = 0; i < raw.length; i++) {
      const res = instructionBoundaryParser.parse(raw[i]);
      if (!res.success) {
        return { success: false, error: `Instruction at index ${i} is invalid: ${res.error}` };
      }
      parsed.push(res.data);
    }

    return { success: true, data: parsed };
  }
};

function parseThreadList(rawList: unknown, label: string): { success: true; data: ThreadContext[] } | { success: false; error: string } {
  if (!Array.isArray(rawList)) {
    return { success: false, error: `${label} must be an array.` };
  }
  const result: ThreadContext[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < rawList.length; i++) {
    const t = rawList[i];
    if (typeof t !== "object" || t === null) {
      return { success: false, error: `${label} at index ${i} is not an object.` };
    }
    const id = (t as Record<string, unknown>).id;
    if (typeof id !== "string" || id.trim().length === 0) {
      return { success: false, error: `${label} at index ${i} must have a non-empty string id.` };
    }
    const trimmedId = id.trim();
    if (seenIds.has(trimmedId)) {
      return { success: false, error: `Duplicate thread id detected: '${trimmedId}'.` };
    }
    seenIds.add(trimmedId);

    const pc = (t as Record<string, unknown>).programCounter ?? 0;
    if (typeof pc !== "number" || !Number.isInteger(pc) || pc < 0) {
      return { success: false, error: `Thread '${trimmedId}' has invalid programCounter.` };
    }

    const rawRegs = (t as Record<string, unknown>).registers ?? {};
    if (typeof rawRegs !== "object" || rawRegs === null) {
      return { success: false, error: `Thread '${trimmedId}' registers must be an object.` };
    }
    const registers: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawRegs)) {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return { success: false, error: `Thread '${trimmedId}' register '${k}' must be a finite number.` };
      }
      registers[k] = v;
    }

    const stateVal = (t as Record<string, unknown>).state ?? "ready";
    const validStates = ["ready", "running", "blocked", "terminated"];
    if (typeof stateVal !== "string" || !validStates.includes(stateVal)) {
      return { success: false, error: `Thread '${trimmedId}' state must be one of: ${validStates.join(", ")}.` };
    }

    const rawInstructions = (t as Record<string, unknown>).instructions;
    const parsedInsts = instructionListBoundaryParser.parse(rawInstructions);
    if (!parsedInsts.success) {
      return { success: false, error: `Thread '${trimmedId}' instructions error: ${parsedInsts.error}` };
    }

    result.push({
      id: trimmedId,
      programCounter: pc,
      registers,
      state: stateVal as ThreadState,
      callStack: Array.isArray((t as Record<string, unknown>).callStack) ? ((t as Record<string, unknown>).callStack as string[]) : [],
      instructions: parsedInsts.data
    });
  }
  return { success: true, data: result };
}

export const scenarioConfigBoundaryParser: BoundaryParser<ConcurrencyScenarioState> = {
  parse(raw: unknown) {
    if (typeof raw !== "object" || raw === null) {
      return { success: false, error: "Scenario config must be a non-null object." };
    }

    const rec = raw as Record<string, unknown>;

    const scenarioId = rec.scenarioId;
    if (typeof scenarioId !== "string" || scenarioId.trim().length === 0) {
      return { success: false, error: "scenarioId must be a non-empty string." };
    }

    const name = rec.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      return { success: false, error: "name must be a non-empty string." };
    }

    const description = rec.description;
    if (typeof description !== "string") {
      return { success: false, error: "description must be a string." };
    }

    const parsedThreads = parseThreadList(rec.threads, "threads");
    if (!parsedThreads.success) {
      return { success: false, error: parsedThreads.error };
    }
    if (parsedThreads.data.length === 0) {
      return { success: false, error: "threads must be a non-empty array." };
    }
    const threads = parsedThreads.data;

    let asymmetricThreads: ThreadContext[] | undefined;
    if (rec.asymmetricThreads !== undefined) {
      const parsedAsym = parseThreadList(rec.asymmetricThreads, "asymmetricThreads");
      if (!parsedAsym.success) {
        return { success: false, error: parsedAsym.error };
      }
      asymmetricThreads = parsedAsym.data;
    }

    const rawSharedMemory = rec.sharedMemory ?? {};
    if (typeof rawSharedMemory !== "object" || rawSharedMemory === null) {
      return { success: false, error: "sharedMemory must be an object." };
    }
    const sharedMemory: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawSharedMemory)) {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return { success: false, error: `sharedMemory variable '${k}' must be a finite number.` };
      }
      sharedMemory[k] = v;
    }

    const rawLocks = rec.locks ?? {};
    if (typeof rawLocks !== "object" || rawLocks === null) {
      return { success: false, error: "locks must be an object." };
    }
    const locks: Record<string, LockState> = {};
    for (const [k, v] of Object.entries(rawLocks)) {
      if (typeof v !== "object" || v === null) {
        return { success: false, error: `Lock '${k}' must be an object.` };
      }
      const lk = v as Record<string, unknown>;
      const lockType = lk.type === "ticket" ? "ticket" : "mutex";
      locks[k] = {
        id: k,
        heldBy: typeof lk.heldBy === "string" ? lk.heldBy : null,
        waitQueue: Array.isArray(lk.waitQueue) ? (lk.waitQueue as string[]) : [],
        type: lockType,
        ticket: typeof lk.ticket === "number" ? lk.ticket : (lockType === "ticket" ? 0 : undefined),
        turn: typeof lk.turn === "number" ? lk.turn : (lockType === "ticket" ? 0 : undefined),
        threadTickets: typeof lk.threadTickets === "object" && lk.threadTickets !== null ? (lk.threadTickets as Record<string, number>) : {}
      };
    }

    const rawSemaphores = rec.semaphores ?? {};
    if (typeof rawSemaphores !== "object" || rawSemaphores === null) {
      return { success: false, error: "semaphores must be an object." };
    }
    const semaphores: Record<string, SemaphoreState> = {};
    for (const [k, v] of Object.entries(rawSemaphores)) {
      if (typeof v !== "object" || v === null) {
        return { success: false, error: `Semaphore '${k}' must be an object.` };
      }
      const sm = v as Record<string, unknown>;
      const value = typeof sm.value === "number" ? sm.value : 1;
      const initialValue = typeof sm.initialValue === "number" ? sm.initialValue : value;
      semaphores[k] = {
        id: k,
        value,
        waitQueue: Array.isArray(sm.waitQueue) ? (sm.waitQueue as string[]) : [],
        initialValue,
        allocatedTo: Array.isArray(sm.allocatedTo) ? (sm.allocatedTo as string[]) : []
      };
    }

    const rawCvs = rec.conditionVariables ?? {};
    if (typeof rawCvs !== "object" || rawCvs === null) {
      return { success: false, error: "conditionVariables must be an object." };
    }
    const conditionVariables: Record<string, ConditionVarState> = {};
    for (const [k, v] of Object.entries(rawCvs)) {
      if (typeof v !== "object" || v === null) {
        return { success: false, error: `ConditionVariable '${k}' must be an object.` };
      }
      const cv = v as Record<string, unknown>;
      conditionVariables[k] = {
        id: k,
        associatedLock: typeof cv.associatedLock === "string" ? cv.associatedLock : "mutex",
        waitQueue: Array.isArray(cv.waitQueue) ? (cv.waitQueue as string[]) : []
      };
    }

    let boundedBuffer: BoundedBufferState | undefined = undefined;
    if (rec.boundedBuffer !== undefined) {
      if (typeof rec.boundedBuffer !== "object" || rec.boundedBuffer === null) {
        return { success: false, error: "boundedBuffer must be an object when provided." };
      }
      const bb = rec.boundedBuffer as Record<string, unknown>;
      const capacity = bb.capacity;
      if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity <= 0) {
        return { success: false, error: "boundedBuffer.capacity must be an integer > 0." };
      }
      const items = Array.isArray(bb.items) ? bb.items.filter((x): x is number => typeof x === "number") : [];
      boundedBuffer = {
        capacity,
        items,
        inPtr: typeof bb.inPtr === "number" ? bb.inPtr : items.length % capacity,
        outPtr: typeof bb.outPtr === "number" ? bb.outPtr : 0
      };
    }

    const rag: ResourceAllocationGraph = {
      processes: threads.map((t) => t.id),
      resources: [...Object.keys(locks), ...Object.keys(semaphores)],
      requests: [],
      allocations: [],
      detectedCycles: []
    };

    return {
      success: true,
      data: {
        scenarioId: scenarioId.trim(),
        name: name.trim(),
        description: description.trim(),
        threads,
        asymmetricThreads,
        sharedMemory,
        activeThreadId: typeof rec.activeThreadId === "string" ? rec.activeThreadId : (threads[0]?.id ?? null),
        locks,
        semaphores,
        conditionVariables,
        boundedBuffer,
        rag,
        executionHistory: Array.isArray(rec.executionHistory) ? (rec.executionHistory as string[]) : [],
        stepCount: typeof rec.stepCount === "number" ? rec.stepCount : 0
      }
    };
  }
};

export function parseInstruction(raw: unknown) {
  return instructionBoundaryParser.parse(raw);
}

export function parseInstructionList(raw: unknown) {
  return instructionListBoundaryParser.parse(raw);
}

export function parseScenarioConfig(raw: unknown) {
  return scenarioConfigBoundaryParser.parse(raw);
}

export const concurrencyScenarioBoundaryParser = scenarioConfigBoundaryParser;

export function parseConcurrencyScenario(raw: unknown) {
  return concurrencyScenarioBoundaryParser.parse(raw);
}
