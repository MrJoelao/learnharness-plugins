import type {
  CoffmanReport,
  ConcurrencyScenarioState,
  ResourceAllocationGraph
} from "./types.js";

function normalizeCycle(nodes: string[]): string {
  if (nodes.length <= 1) return "";
  const cycleNodes = nodes.slice(0, nodes.length - 1);
  let minIdx = 0;
  for (let i = 1; i < cycleNodes.length; i++) {
    if (cycleNodes[i]! < cycleNodes[minIdx]!) {
      minIdx = i;
    }
  }

  const rotated: string[] = [];
  for (let i = 0; i < cycleNodes.length; i++) {
    rotated.push(cycleNodes[(minIdx + i) % cycleNodes.length]!);
  }
  rotated.push(rotated[0]!);
  return rotated.join("->");
}

export function detectCycles(rag: ResourceAllocationGraph): string[][] {
  const adj = new Map<string, string[]>();

  for (const p of rag.processes) {
    if (!adj.has(p)) adj.set(p, []);
  }
  for (const r of rag.resources) {
    if (!adj.has(r)) adj.set(r, []);
  }

  for (const req of rag.requests) {
    const list = adj.get(req.fromProcess) ?? [];
    if (!list.includes(req.toResource)) {
      list.push(req.toResource);
    }
    adj.set(req.fromProcess, list);
  }

  for (const alloc of rag.allocations) {
    const list = adj.get(alloc.fromResource) ?? [];
    if (!list.includes(alloc.toProcess)) {
      list.push(alloc.toProcess);
    }
    adj.set(alloc.fromResource, list);
  }

  const allNodes = Array.from(adj.keys()).sort();
  const foundCycles: string[][] = [];
  const seenCycleKeys = new Set<string>();

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(u: string) {
    visited.add(u);
    inStack.add(u);
    path.push(u);

    const neighbors = adj.get(u) ?? [];
    for (const v of neighbors) {
      if (!visited.has(v)) {
        dfs(v);
      } else if (inStack.has(v)) {
        const startIdx = path.indexOf(v);
        if (startIdx !== -1) {
          const rawCycle = [...path.slice(startIdx), v];
          const cycleKey = normalizeCycle(rawCycle);
          if (cycleKey.length > 0 && !seenCycleKeys.has(cycleKey)) {
            seenCycleKeys.add(cycleKey);
            const cycleArray = cycleKey.split("->");
            foundCycles.push(cycleArray);
          }
        }
      }
    }

    path.pop();
    inStack.delete(u);
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return foundCycles;
}

export function buildRAG(state: ConcurrencyScenarioState): ResourceAllocationGraph {
  const processes = state.threads.map((t) => t.id);
  const resources: string[] = [];

  for (const lockId of Object.keys(state.locks)) {
    if (!resources.includes(lockId)) resources.push(lockId);
  }
  for (const semId of Object.keys(state.semaphores)) {
    if (!resources.includes(semId)) resources.push(semId);
  }
  for (const cvId of Object.keys(state.conditionVariables)) {
    if (!resources.includes(cvId)) resources.push(cvId);
  }

  const requests: Array<{ fromProcess: string; toResource: string }> = [];
  const allocations: Array<{ fromResource: string; toProcess: string }> = [];

  for (const lock of Object.values(state.locks)) {
    if (lock.heldBy !== null) {
      allocations.push({ fromResource: lock.id, toProcess: lock.heldBy });
    }
    for (const waitingThread of lock.waitQueue) {
      requests.push({ fromProcess: waitingThread, toResource: lock.id });
    }
  }

  for (const sem of Object.values(state.semaphores)) {
    if (sem.allocatedTo) {
      for (const holder of sem.allocatedTo) {
        allocations.push({ fromResource: sem.id, toProcess: holder });
      }
    }
    for (const waitingThread of sem.waitQueue) {
      requests.push({ fromProcess: waitingThread, toResource: sem.id });
    }
    if (sem.waitQueue.length > 0) {
      for (const t of state.threads) {
        const canPost = t.instructions.some(
          (inst) => inst.op === "sem_post" && inst.syncObject === sem.id
        );
        if (canPost && !allocations.some((a) => a.fromResource === sem.id && a.toProcess === t.id)) {
          allocations.push({ fromResource: sem.id, toProcess: t.id });
        }
      }
    }
  }

  for (const cv of Object.values(state.conditionVariables)) {
    for (const waitingThread of cv.waitQueue) {
      requests.push({ fromProcess: waitingThread, toResource: cv.id });
    }
    if (cv.waitQueue.length > 0) {
      for (const t of state.threads) {
        const canSignal = t.instructions.some(
          (inst) => inst.op === "signal" && inst.syncObject === cv.id
        );
        if (canSignal && !allocations.some((a) => a.fromResource === cv.id && a.toProcess === t.id)) {
          allocations.push({ fromResource: cv.id, toProcess: t.id });
        }
      }
    }
  }

  const preliminaryRag: ResourceAllocationGraph = {
    processes,
    resources,
    requests,
    allocations,
    detectedCycles: []
  };

  preliminaryRag.detectedCycles = detectCycles(preliminaryRag);

  return preliminaryRag;
}

export function checkCoffmanConditions(state: ConcurrencyScenarioState): CoffmanReport {
  const rag = state.rag;

  const hasExclusiveResources =
    Object.keys(state.locks).length > 0 ||
    Object.values(state.semaphores).some((s) => s.initialValue <= 1);

  const mutualExclusion = {
    met: hasExclusiveResources,
    explanation: hasExclusiveResources
      ? "Almeno una risorsa (lock o semaforo binario) è trattenuta in modo mutualmente esclusivo."
      : "Nessuna risorsa mutualmente esclusiva presente nel sistema."
  };

  const holdingThreads = new Set<string>(rag.allocations.map((a) => a.toProcess));
  const waitingThreads = new Set<string>(rag.requests.map((r) => r.fromProcess));

  const holdAndWaitThreads = Array.from(holdingThreads).filter((t) => waitingThreads.has(t));
  const holdAndWaitMet = holdAndWaitThreads.length > 0;

  const holdAndWait = {
    met: holdAndWaitMet,
    explanation: holdAndWaitMet
      ? `Thread che trattengono risorse e ne attendono altre: ${holdAndWaitThreads.join(", ")}.`
      : "Nessun thread trattiene contemporaneamente una risorsa mentre ne richiede un'altra."
  };

  const noPreemption = {
    met: true,
    explanation: "Le risorse non possono essere revocate forzatamente; vengono rilasciate solo volontariamente."
  };

  const cycles = rag.detectedCycles;
  const circularWaitMet = cycles.length > 0;

  const circularWait = {
    met: circularWaitMet,
    explanation: circularWaitMet
      ? `Ciclo di attesa circolare rilevato nel grafo RAG: ${cycles.map((c) => c.join(" → ")).join("; ")}.`
      : "Nessuna catena circolare di attesa rilevata nel grafo."
  };

  const isDeadlocked = mutualExclusion.met && holdAndWait.met && noPreemption.met && circularWait.met;

  return {
    mutualExclusion,
    holdAndWait,
    noPreemption,
    circularWait,
    isDeadlocked,
    cycles
  };
}
