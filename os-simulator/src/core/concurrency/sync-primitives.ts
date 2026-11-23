import type { ConditionVarState, LockState, SemaphoreState } from "./types.js";

export function acquireLock(
  locks: Record<string, LockState>,
  lockId: string,
  threadId: string
): { locks: Record<string, LockState>; acquired: boolean; ticket?: number } {
  const current = locks[lockId];
  if (!current) {
    const newLock: LockState = {
      id: lockId,
      heldBy: threadId,
      waitQueue: [],
      type: "mutex"
    };
    return {
      locks: { ...locks, [lockId]: newLock },
      acquired: true
    };
  }

  const updated: LockState = {
    ...current,
    waitQueue: [...current.waitQueue],
    threadTickets: { ...current.threadTickets }
  };

  if (current.type === "ticket") {
    let myTicket = updated.threadTickets?.[threadId];
    if (myTicket === undefined) {
      myTicket = updated.ticket ?? 0;
      updated.ticket = myTicket + 1;
      if (!updated.threadTickets) updated.threadTickets = {};
      updated.threadTickets[threadId] = myTicket;
    }

    if (updated.turn === myTicket && updated.heldBy === null) {
      updated.heldBy = threadId;
      return {
        locks: { ...locks, [lockId]: updated },
        acquired: true,
        ticket: myTicket
      };
    }

    if (!updated.waitQueue.includes(threadId)) {
      updated.waitQueue.push(threadId);
    }

    return {
      locks: { ...locks, [lockId]: updated },
      acquired: false,
      ticket: myTicket
    };
  }

  if (updated.heldBy === null) {
    updated.heldBy = threadId;
    return {
      locks: { ...locks, [lockId]: updated },
      acquired: true
    };
  }

  if (updated.heldBy === threadId) {
    return {
      locks,
      acquired: true
    };
  }

  if (!updated.waitQueue.includes(threadId)) {
    updated.waitQueue.push(threadId);
  }

  return {
    locks: { ...locks, [lockId]: updated },
    acquired: false
  };
}

export function releaseLock(
  locks: Record<string, LockState>,
  lockId: string,
  threadId: string
): { locks: Record<string, LockState>; unblockedThreadId: string | null } {
  const current = locks[lockId];
  if (!current || current.heldBy !== threadId) {
    return { locks, unblockedThreadId: null };
  }

  const updated: LockState = {
    ...current,
    waitQueue: [...current.waitQueue],
    threadTickets: { ...current.threadTickets }
  };

  updated.heldBy = null;

  if (current.type === "ticket") {
    if (updated.threadTickets) {
      delete updated.threadTickets[threadId];
    }
    updated.turn = (updated.turn ?? 0) + 1;

    let unblocked: string | null = null;
    const targetTurn = updated.turn;
    const nextIdx = updated.waitQueue.findIndex((t) => updated.threadTickets?.[t] === targetTurn);

    if (nextIdx !== -1) {
      unblocked = updated.waitQueue[nextIdx]!;
      updated.waitQueue.splice(nextIdx, 1);
      updated.heldBy = unblocked;
    }

    return {
      locks: { ...locks, [lockId]: updated },
      unblockedThreadId: unblocked
    };
  }

  let unblocked: string | null = null;
  if (updated.waitQueue.length > 0) {
    unblocked = updated.waitQueue.shift()!;
    updated.heldBy = unblocked;
  }

  return {
    locks: { ...locks, [lockId]: updated },
    unblockedThreadId: unblocked
  };
}

export function waitCondition(
  conditionVariables: Record<string, ConditionVarState>,
  locks: Record<string, LockState>,
  cvId: string,
  threadId: string
): {
  conditionVariables: Record<string, ConditionVarState>;
  locks: Record<string, LockState>;
  unblockedLockThreadId: string | null;
} {
  const cv = conditionVariables[cvId] ?? {
    id: cvId,
    associatedLock: "mutex",
    waitQueue: []
  };

  const { locks: nextLocks, unblockedThreadId } = releaseLock(locks, cv.associatedLock, threadId);

  const nextCv: ConditionVarState = {
    ...cv,
    waitQueue: cv.waitQueue.includes(threadId) ? cv.waitQueue : [...cv.waitQueue, threadId]
  };

  return {
    conditionVariables: { ...conditionVariables, [cvId]: nextCv },
    locks: nextLocks,
    unblockedLockThreadId: unblockedThreadId
  };
}

export function signalCondition(
  conditionVariables: Record<string, ConditionVarState>,
  locks: Record<string, LockState>,
  cvId: string
): {
  conditionVariables: Record<string, ConditionVarState>;
  locks: Record<string, LockState>;
  awakenedThreadId: string | null;
  immediatelyAcquired: boolean;
} {
  const cv = conditionVariables[cvId];
  if (!cv || cv.waitQueue.length === 0) {
    return {
      conditionVariables,
      locks,
      awakenedThreadId: null,
      immediatelyAcquired: false
    };
  }

  const awakenedThreadId = cv.waitQueue[0]!;
  const nextCv: ConditionVarState = {
    ...cv,
    waitQueue: cv.waitQueue.slice(1)
  };

  const lock = locks[cv.associatedLock];
  if (!lock) {
    const newLock: LockState = {
      id: cv.associatedLock,
      heldBy: awakenedThreadId,
      waitQueue: [],
      type: "mutex"
    };
    return {
      conditionVariables: { ...conditionVariables, [cvId]: nextCv },
      locks: { ...locks, [cv.associatedLock]: newLock },
      awakenedThreadId,
      immediatelyAcquired: true
    };
  }

  const updatedLock: LockState = {
    ...lock,
    waitQueue: [...lock.waitQueue],
    threadTickets: { ...lock.threadTickets }
  };

  if (updatedLock.heldBy === null) {
    updatedLock.heldBy = awakenedThreadId;
    return {
      conditionVariables: { ...conditionVariables, [cvId]: nextCv },
      locks: { ...locks, [cv.associatedLock]: updatedLock },
      awakenedThreadId,
      immediatelyAcquired: true
    };
  }

  if (!updatedLock.waitQueue.includes(awakenedThreadId)) {
    updatedLock.waitQueue.push(awakenedThreadId);
  }

  return {
    conditionVariables: { ...conditionVariables, [cvId]: nextCv },
    locks: { ...locks, [cv.associatedLock]: updatedLock },
    awakenedThreadId,
    immediatelyAcquired: false
  };
}

export function semWait(
  semaphores: Record<string, SemaphoreState>,
  semId: string,
  threadId: string
): { semaphores: Record<string, SemaphoreState>; acquired: boolean } {
  const current = semaphores[semId] ?? {
    id: semId,
    value: 1,
    waitQueue: [],
    initialValue: 1,
    allocatedTo: []
  };

  const nextVal = current.value - 1;
  const waitQueue = [...current.waitQueue];
  const allocatedTo = current.allocatedTo ? [...current.allocatedTo] : [];

  if (nextVal < 0) {
    if (!waitQueue.includes(threadId)) {
      waitQueue.push(threadId);
    }
    const updated: SemaphoreState = {
      ...current,
      value: nextVal,
      waitQueue,
      allocatedTo
    };
    return {
      semaphores: { ...semaphores, [semId]: updated },
      acquired: false
    };
  }

  allocatedTo.push(threadId);
  const updated: SemaphoreState = {
    ...current,
    value: nextVal,
    waitQueue,
    allocatedTo
  };

  return {
    semaphores: { ...semaphores, [semId]: updated },
    acquired: true
  };
}

export function semPost(
  semaphores: Record<string, SemaphoreState>,
  semId: string,
  postingThreadId?: string
): { semaphores: Record<string, SemaphoreState>; unblockedThreadId: string | null } {
  const current = semaphores[semId];
  if (!current) {
    const updated: SemaphoreState = {
      id: semId,
      value: 1,
      waitQueue: [],
      initialValue: 1,
      allocatedTo: []
    };
    return {
      semaphores: { ...semaphores, [semId]: updated },
      unblockedThreadId: null
    };
  }

  const nextVal = current.value + 1;
  const waitQueue = [...current.waitQueue];
  let allocatedTo = current.allocatedTo ? [...current.allocatedTo] : [];

  if (postingThreadId && allocatedTo.includes(postingThreadId)) {
    const idx = allocatedTo.indexOf(postingThreadId);
    allocatedTo.splice(idx, 1);
  } else if (allocatedTo.length > 0) {
    allocatedTo.shift();
  }

  let unblocked: string | null = null;
  if (nextVal <= 0 && waitQueue.length > 0) {
    unblocked = waitQueue.shift()!;
    allocatedTo.push(unblocked);
  }

  const updated: SemaphoreState = {
    ...current,
    value: nextVal,
    waitQueue,
    allocatedTo
  };

  return {
    semaphores: { ...semaphores, [semId]: updated },
    unblockedThreadId: unblocked
  };
}
