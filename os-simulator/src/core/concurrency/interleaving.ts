import { buildRAG } from "./rag.js";
import {
  acquireLock,
  releaseLock,
  semPost,
  semWait,
  signalCondition,
  waitCondition
} from "./sync-primitives.js";
import type {
  BoundedBufferState,
  ConcurrencyScenarioState,
  ThreadContext
} from "./types.js";

function evaluateCondition(
  condition: {
    variable: string;
    conditionOp: "==" | "!=" | "<" | "<=" | ">" | ">=";
    value: number;
  },
  sharedMemory: Record<string, number>,
  boundedBuffer?: BoundedBufferState
): boolean {
  let curVal: number;
  if (condition.variable === "buffer_count" || condition.variable === "count") {
    curVal = boundedBuffer ? boundedBuffer.items.length : (sharedMemory["count"] ?? 0);
  } else {
    curVal = sharedMemory[condition.variable] ?? 0;
  }

  switch (condition.conditionOp) {
    case "==":
      return curVal === condition.value;
    case "!=":
      return curVal !== condition.value;
    case "<":
      return curVal < condition.value;
    case "<=":
      return curVal <= condition.value;
    case ">":
      return curVal > condition.value;
    case ">=":
      return curVal >= condition.value;
  }
}

export function canThreadStep(state: ConcurrencyScenarioState, threadId: string): boolean {
  const thread = state.threads.find((t) => t.id === threadId);
  if (!thread) return false;
  if (thread.state === "terminated" || thread.state === "blocked") return false;
  return thread.programCounter < thread.instructions.length;
}

export function stepThread(
  state: ConcurrencyScenarioState,
  threadId: string
): ConcurrencyScenarioState {
  const threadIdx = state.threads.findIndex((t) => t.id === threadId);
  if (threadIdx === -1) return state;

  const originalThread = state.threads[threadIdx]!;
  if (originalThread.state === "terminated") {
    return {
      ...state,
      executionHistory: [
        ...state.executionHistory,
        `[${threadId}] Thread terminato. Nessuna operazione eseguita.`
      ]
    };
  }

  if (originalThread.state === "blocked") {
    return {
      ...state,
      executionHistory: [
        ...state.executionHistory,
        `[${threadId}] Thread bloccato su ${originalThread.blockedOn?.syncObject ?? "risorsa"}. Impossibile avanzare.`
      ]
    };
  }

  if (originalThread.programCounter >= originalThread.instructions.length) {
    const updatedThreads = state.threads.map((t, idx) =>
      idx === threadIdx ? { ...t, state: "terminated" as const } : t
    );
    return {
      ...state,
      threads: updatedThreads
    };
  }

  const inst = originalThread.instructions[originalThread.programCounter]!;
  let nextThreads: ThreadContext[] = state.threads.map((t) => ({
    ...t,
    registers: { ...t.registers },
    callStack: [...t.callStack]
  }));

  const activeThread = nextThreads[threadIdx]!;
  activeThread.state = "running";

  let nextSharedMemory = { ...state.sharedMemory };
  let nextLocks = { ...state.locks };
  let nextSemaphores = { ...state.semaphores };
  let nextCvs = { ...state.conditionVariables };
  let nextBuffer: BoundedBufferState | undefined = state.boundedBuffer
    ? {
        ...state.boundedBuffer,
        items: [...state.boundedBuffer.items]
      }
    : undefined;

  let stepLog = `[${threadId}] PC ${activeThread.programCounter}: ${inst.label ?? inst.op}`;

  switch (inst.op) {
    case "read": {
      const varName = inst.targetVariable;
      const reg = inst.register ?? "eax";
      let val = 0;

      if (varName === "buffer" && nextBuffer) {
        if (nextBuffer.items.length > 0) {
          val = nextBuffer.items[0]!;
          nextBuffer.items = nextBuffer.items.slice(1);
          nextBuffer.outPtr = (nextBuffer.outPtr + 1) % nextBuffer.capacity;
        }
      } else if (varName) {
        val = nextSharedMemory[varName] ?? 0;
      }

      activeThread.registers[reg] = val;
      activeThread.programCounter++;
      stepLog += ` (${reg} ← ${val})`;
      break;
    }

    case "write": {
      const varName = inst.targetVariable;
      const reg = inst.register;
      const val = reg ? (activeThread.registers[reg] ?? 0) : (inst.literal ?? 0);

      if (varName === "buffer" && nextBuffer) {
        if (nextBuffer.items.length < nextBuffer.capacity) {
          nextBuffer.items.push(val);
          nextBuffer.inPtr = (nextBuffer.inPtr + 1) % nextBuffer.capacity;
        }
      } else if (varName) {
        nextSharedMemory[varName] = val;
      }

      activeThread.programCounter++;
      stepLog += ` (${varName ?? "mem"} ← ${val})`;
      break;
    }

    case "add": {
      const reg = inst.register ?? "eax";
      const val = inst.literal ?? (inst.targetVariable ? (nextSharedMemory[inst.targetVariable] ?? 0) : 0);
      const prev = activeThread.registers[reg] ?? 0;
      activeThread.registers[reg] = prev + val;
      activeThread.programCounter++;
      stepLog += ` (${reg} = ${activeThread.registers[reg]})`;
      break;
    }

    case "sub": {
      const reg = inst.register ?? "eax";
      const val = inst.literal ?? (inst.targetVariable ? (nextSharedMemory[inst.targetVariable] ?? 0) : 0);
      const prev = activeThread.registers[reg] ?? 0;
      activeThread.registers[reg] = prev - val;
      activeThread.programCounter++;
      stepLog += ` (${reg} = ${activeThread.registers[reg]})`;
      break;
    }

    case "lock": {
      const lockId = inst.syncObject ?? "mutex";
      const res = acquireLock(nextLocks, lockId, threadId);
      nextLocks = res.locks;

      if (res.acquired) {
        activeThread.programCounter++;
        activeThread.state = "running";
        activeThread.blockedOn = undefined;
        stepLog += ` (lock '${lockId}' acquisito)`;
      } else {
        activeThread.state = "blocked";
        activeThread.blockedOn = {
          type: "lock",
          syncObject: lockId,
          ticket: res.ticket
        };
        stepLog += ` (lock '${lockId}' conteso, thread bloccato in coda)`;
      }
      break;
    }

    case "unlock": {
      const lockId = inst.syncObject ?? "mutex";
      const res = releaseLock(nextLocks, lockId, threadId);
      nextLocks = res.locks;
      activeThread.programCounter++;

      stepLog += ` (lock '${lockId}' rilasciato)`;
      if (res.unblockedThreadId) {
        const unblockedIdx = nextThreads.findIndex((t) => t.id === res.unblockedThreadId);
        if (unblockedIdx !== -1) {
          const unb = nextThreads[unblockedIdx]!;
          unb.state = "ready";
          if (unb.instructions[unb.programCounter]?.op !== "wait") {
            unb.programCounter++;
          }
          unb.blockedOn = undefined;
          stepLog += ` [risvegliato ${res.unblockedThreadId}]`;
        }
      }
      break;
    }

    case "wait": {
      const cvId = inst.syncObject ?? "cond";
      let shouldWait = true;

      if (inst.condition) {
        const conditionMet = evaluateCondition(inst.condition, nextSharedMemory, nextBuffer);
        shouldWait = conditionMet;
      }

      if (shouldWait) {
        const res = waitCondition(nextCvs, nextLocks, cvId, threadId);
        nextCvs = res.conditionVariables;
        nextLocks = res.locks;

        activeThread.state = "blocked";
        activeThread.blockedOn = {
          type: "condition",
          syncObject: cvId
        };
        stepLog += ` (in attesa su CV '${cvId}', mutex rilasciato)`;

        if (res.unblockedLockThreadId) {
          const unblockedIdx = nextThreads.findIndex((t) => t.id === res.unblockedLockThreadId);
          if (unblockedIdx !== -1) {
            const unb = nextThreads[unblockedIdx]!;
            unb.state = "ready";
            if (unb.instructions[unb.programCounter]?.op !== "wait") {
              unb.programCounter++;
            }
            unb.blockedOn = undefined;
            stepLog += ` [mutex trasferito a ${res.unblockedLockThreadId}]`;
          }
        }
      } else {
        activeThread.programCounter++;
        stepLog += ` (condizione non verificata, wait superata)`;
      }
      break;
    }

    case "signal": {
      const cvId = inst.syncObject ?? "cond";
      const res = signalCondition(nextCvs, nextLocks, cvId);
      nextCvs = res.conditionVariables;
      nextLocks = res.locks;
      activeThread.programCounter++;

      stepLog += ` (signal su CV '${cvId}')`;
      if (res.awakenedThreadId) {
        const awakenedIdx = nextThreads.findIndex((t) => t.id === res.awakenedThreadId);
        if (awakenedIdx !== -1) {
          const awk = nextThreads[awakenedIdx]!;
          if (res.immediatelyAcquired) {
            awk.state = "ready";
            if (awk.instructions[awk.programCounter]?.op !== "wait") {
              awk.programCounter++;
            }
            awk.blockedOn = undefined;
            stepLog += ` [${res.awakenedThreadId} ha riacquisito il lock]`;
          } else {
            awk.blockedOn = {
              type: "lock",
              syncObject: nextCvs[cvId]?.associatedLock ?? "mutex"
            };
            stepLog += ` [${res.awakenedThreadId} accodato al lock]`;
          }
        }
      }
      break;
    }

    case "sem_wait": {
      const semId = inst.syncObject ?? "sem";
      const res = semWait(nextSemaphores, semId, threadId);
      nextSemaphores = res.semaphores;

      if (res.acquired) {
        activeThread.programCounter++;
        activeThread.state = "running";
        activeThread.blockedOn = undefined;
        stepLog += ` (sem_wait '${semId}' superata, valore=${nextSemaphores[semId]?.value})`;
      } else {
        activeThread.state = "blocked";
        activeThread.blockedOn = {
          type: "semaphore",
          syncObject: semId
        };
        stepLog += ` (sem_wait '${semId}' bloccata, valore=${nextSemaphores[semId]?.value})`;
      }
      break;
    }

    case "sem_post": {
      const semId = inst.syncObject ?? "sem";
      const res = semPost(nextSemaphores, semId, threadId);
      nextSemaphores = res.semaphores;
      activeThread.programCounter++;

      stepLog += ` (sem_post '${semId}', valore=${nextSemaphores[semId]?.value})`;
      if (res.unblockedThreadId) {
        const unblockedIdx = nextThreads.findIndex((t) => t.id === res.unblockedThreadId);
        if (unblockedIdx !== -1) {
          const unb = nextThreads[unblockedIdx]!;
          unb.state = "ready";
          if (unb.instructions[unb.programCounter]?.op !== "wait") {
            unb.programCounter++;
          }
          unb.blockedOn = undefined;
          stepLog += ` [risvegliato ${res.unblockedThreadId}]`;
        }
      }
      break;
    }
  }

  if (activeThread.state !== "blocked" && activeThread.programCounter >= activeThread.instructions.length) {
    activeThread.state = "terminated";
    stepLog += ` [terminato]`;
  }

  const intermediateState: ConcurrencyScenarioState = {
    ...state,
    threads: nextThreads,
    sharedMemory: nextSharedMemory,
    activeThreadId: threadId,
    locks: nextLocks,
    semaphores: nextSemaphores,
    conditionVariables: nextCvs,
    boundedBuffer: nextBuffer,
    stepCount: state.stepCount + 1,
    executionHistory: [...state.executionHistory, stepLog]
  };

  intermediateState.rag = buildRAG(intermediateState);

  return intermediateState;
}

export function stepActive(state: ConcurrencyScenarioState): ConcurrencyScenarioState {
  if (state.activeThreadId && canThreadStep(state, state.activeThreadId)) {
    return stepThread(state, state.activeThreadId);
  }

  const nextReady = state.threads.find((t) => canThreadStep(state, t.id));
  if (nextReady) {
    return stepThread(state, nextReady.id);
  }

  return state;
}
