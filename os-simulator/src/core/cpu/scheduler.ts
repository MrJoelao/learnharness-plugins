import type {
  CpuAlgorithm,
  MlfqConfig,
  MlfqQueueConfig,
  ProcessBurst,
  ProcessWorkload,
  SchedulerMetrics,
  SchedulerTimelineStep
} from "./types.js";

export interface ScheduleSimulationOptions {
  quantum?: number;
  mlfqConfig?: MlfqConfig;
  maxTicks?: number;
}

export interface ScheduleSimulationResult {
  timeline: SchedulerTimelineStep[];
  metrics: SchedulerMetrics[];
  averages: {
    turnaround: number;
    response: number;
    wait: number;
  };
  totalTicks: number;
}

interface RuntimeProcess {
  id: string;
  arrivalTime: number;
  priority: number;
  bursts: ProcessBurst[];
  burstIndex: number;
  remainingBurst: number;
  totalCpuDuration: number;
  totalIoDuration: number;
  firstRunTime: number | null;
  completionTime: number | null;
  currentQueue: number;
  allotmentSpent: number;
  timeSliceSpent: number;
  remainingIo: number;
}

function cloneWorkloadToRuntime(workload: ProcessWorkload[]): RuntimeProcess[] {
  return workload.map((p) => {
    const totalCpuDuration = p.bursts.reduce((sum, b) => (b.type === "cpu" ? sum + b.duration : sum), 0);
    const totalIoDuration = p.bursts.reduce((sum, b) => (b.type === "io" ? sum + b.duration : sum), 0);
    const initialBurst = p.bursts[0];
    return {
      id: p.id,
      arrivalTime: p.arrivalTime,
      priority: p.priority ?? 0,
      bursts: p.bursts.map((b) => ({ ...b })),
      burstIndex: 0,
      remainingBurst: initialBurst ? initialBurst.duration : 0,
      totalCpuDuration,
      totalIoDuration,
      firstRunTime: null,
      completionTime: null,
      currentQueue: p.priority ?? 0,
      allotmentSpent: 0,
      timeSliceSpent: 0,
      remainingIo: 0
    };
  });
}

export function simulateSchedule(
  algorithm: CpuAlgorithm,
  workload: ProcessWorkload[],
  options: ScheduleSimulationOptions = {}
): ScheduleSimulationResult {
  if (workload.length === 0) {
    return {
      timeline: [],
      metrics: [],
      averages: { turnaround: 0, response: 0, wait: 0 },
      totalTicks: 0
    };
  }

  const quantum = options.quantum ?? 2;
  const mlfqConfig: MlfqConfig = options.mlfqConfig ?? {
    queues: [
      { priority: 0, timeSlice: 10, allotment: 20 },
      { priority: 1, timeSlice: 20, allotment: 40 },
      { priority: 2, timeSlice: 40, allotment: 80 }
    ],
    priorityBoostInterval: 100
  };
  const maxTicks = options.maxTicks ?? 10000;

  const processes = cloneWorkloadToRuntime(workload);
  const sortedQueues = [...mlfqConfig.queues].sort((a, b) => a.priority - b.priority);
  const maxQueuePriority = Math.max(...mlfqConfig.queues.map((q) => q.priority));

  const timeline: SchedulerTimelineStep[] = [];
  const readyQueue: string[] = [];
  const blockedQueue: Array<{ id: string; remainingIo: number }> = [];
  const mlfqQueues: Record<number, string[]> = {};

  function getMlfqQueue(priority: number): string[] {
    let q = mlfqQueues[priority];
    if (!q) {
      q = [];
      mlfqQueues[priority] = q;
    }
    return q;
  }

  for (const q of mlfqConfig.queues) {
    mlfqQueues[q.priority] = [];
  }

  let running: RuntimeProcess | null = null;
  let previousRunningId: string | null = null;
  let tick = 0;

  const arrivedSet = new Set<string>();

  function getProcess(id: string): RuntimeProcess {
    const found = processes.find((p) => p.id === id);
    if (!found) {
      throw new Error(`Process ${id} not found.`);
    }
    return found;
  }

  function getQueueConfig(priority: number): MlfqQueueConfig {
    return (
      mlfqConfig.queues.find((q) => q.priority === priority) ?? {
        priority,
        timeSlice: 10,
        allotment: 20
      }
    );
  }

  while (tick < maxTicks) {
    const allTerminated = processes.every((p) => p.completionTime !== null);
    if (allTerminated) {
      break;
    }

    if (algorithm === "MLFQ" && tick > 0 && tick % mlfqConfig.priorityBoostInterval === 0) {
      for (const p of processes) {
        if (p.completionTime === null) {
          p.currentQueue = 0;
          p.allotmentSpent = 0;
          p.timeSliceSpent = 0;
        }
      }
      for (const q of mlfqConfig.queues) {
        mlfqQueues[q.priority] = [];
      }
      for (const p of processes) {
        if (p.completionTime === null && arrivedSet.has(p.id) && p.remainingIo === 0 && (!running || running.id !== p.id)) {
          const q0 = getMlfqQueue(0);
          if (!q0.includes(p.id)) {
            q0.push(p.id);
          }
        }
      }
    }

    for (let i = blockedQueue.length - 1; i >= 0; i--) {
      const b = blockedQueue[i];
      if (!b) continue;
      if (b.remainingIo <= 0) {
        blockedQueue.splice(i, 1);
        const p = getProcess(b.id);
        p.remainingIo = 0;
        p.timeSliceSpent = 0;
        p.burstIndex++;
        if (p.burstIndex < p.bursts.length) {
          const nextBurst = p.bursts[p.burstIndex];
          if (nextBurst && nextBurst.type === "cpu") {
            p.remainingBurst = nextBurst.duration;
            if (algorithm === "MLFQ") {
              const qTarget = p.currentQueue;
              const q = getMlfqQueue(qTarget);
              if (!q.includes(p.id)) {
                q.push(p.id);
              }
            } else {
              if (!readyQueue.includes(p.id)) {
                readyQueue.push(p.id);
              }
            }
          } else if (nextBurst) {
            p.remainingIo = nextBurst.duration;
            blockedQueue.push({ id: p.id, remainingIo: nextBurst.duration });
          }
        } else {
          p.completionTime = tick;
        }
      }
    }

    for (const p of processes) {
      if (p.arrivalTime === tick && !arrivedSet.has(p.id)) {
        arrivedSet.add(p.id);
        p.burstIndex = 0;
        const firstBurst = p.bursts[0];
        if (firstBurst) {
          if (firstBurst.type === "cpu") {
            p.remainingBurst = firstBurst.duration;
            if (algorithm === "MLFQ") {
              p.currentQueue = 0;
              p.allotmentSpent = 0;
              p.timeSliceSpent = 0;
              const q0 = getMlfqQueue(0);
              if (!q0.includes(p.id)) {
                q0.push(p.id);
              }
            } else {
              if (!readyQueue.includes(p.id)) {
                readyQueue.push(p.id);
              }
            }
          } else {
            p.remainingIo = firstBurst.duration;
            blockedQueue.push({ id: p.id, remainingIo: firstBurst.duration });
          }
        }
      }
    }

    if (algorithm === "FIFO") {
      if (!running && readyQueue.length > 0) {
        const nextId = readyQueue.shift()!;
        running = getProcess(nextId);
      }
    } else if (algorithm === "SJF") {
      if (!running && readyQueue.length > 0) {
        let bestIndex = 0;
        let bestProc = getProcess(readyQueue[0]!);
        for (let i = 1; i < readyQueue.length; i++) {
          const candId = readyQueue[i];
          if (!candId) continue;
          const candidate = getProcess(candId);
          if (
            candidate.remainingBurst < bestProc.remainingBurst ||
            (candidate.remainingBurst === bestProc.remainingBurst && candidate.arrivalTime < bestProc.arrivalTime)
          ) {
            bestIndex = i;
            bestProc = candidate;
          }
        }
        readyQueue.splice(bestIndex, 1);
        running = bestProc;
      }
    } else if (algorithm === "STCF") {
      const candidates: RuntimeProcess[] = [];
      if (running) {
        candidates.push(running);
      }
      for (const id of readyQueue) {
        candidates.push(getProcess(id));
      }

      if (candidates.length > 0) {
        let best = candidates[0]!;
        for (let i = 1; i < candidates.length; i++) {
          const c = candidates[i];
          if (c && c.remainingBurst < best.remainingBurst) {
            best = c;
          }
        }

        if (running && running.id !== best.id) {
          if (!readyQueue.includes(running.id)) {
            readyQueue.push(running.id);
          }
          const winnerIndex = readyQueue.indexOf(best.id);
          if (winnerIndex !== -1) {
            readyQueue.splice(winnerIndex, 1);
          }
          running = best;
        } else if (!running) {
          const winnerIndex = readyQueue.indexOf(best.id);
          if (winnerIndex !== -1) {
            readyQueue.splice(winnerIndex, 1);
          }
          running = best;
        }
      }
    } else if (algorithm === "RR") {
      if (running && running.timeSliceSpent >= quantum) {
        running.timeSliceSpent = 0;
        if (readyQueue.length > 0) {
          readyQueue.push(running.id);
          const nextId = readyQueue.shift()!;
          running = getProcess(nextId);
        }
      } else if (!running && readyQueue.length > 0) {
        const nextId = readyQueue.shift()!;
        running = getProcess(nextId);
        running.timeSliceSpent = 0;
      }
    } else if (algorithm === "MLFQ") {
      if (running) {
        const qConf = getQueueConfig(running.currentQueue);
        const hasHigherPriority = sortedQueues.some(
          (q) => q.priority < running!.currentQueue && getMlfqQueue(q.priority).length > 0
        );

        if (running.allotmentSpent >= qConf.allotment) {
          const nextQ = Math.min(running.currentQueue + 1, maxQueuePriority);
          running.currentQueue = nextQ;
          running.allotmentSpent = 0;
          running.timeSliceSpent = 0;
          getMlfqQueue(nextQ).push(running.id);
          running = null;
        } else if (hasHigherPriority) {
          const currQ = getMlfqQueue(running.currentQueue);
          currQ.unshift(running.id);
          running = null;
        } else if (running.timeSliceSpent >= qConf.timeSlice) {
          running.timeSliceSpent = 0;
          const currQ = getMlfqQueue(running.currentQueue);
          if (currQ.length > 0) {
            currQ.push(running.id);
            running = null;
          }
        }
      }

      if (!running) {
        for (const q of sortedQueues) {
          const queue = getMlfqQueue(q.priority);
          if (queue.length > 0) {
            const nextId = queue.shift()!;
            running = getProcess(nextId);
            break;
          }
        }
      }
    }

    const isContextSwitch =
      previousRunningId !== null &&
      running !== null &&
      running.id !== previousRunningId;

    let eventDescription = "";
    if (running) {
      eventDescription = `Process ${running.id} running on CPU (burst left: ${running.remainingBurst} tick)`;
      if (algorithm === "MLFQ") {
        eventDescription += ` [Q${running.currentQueue}, allot: ${running.allotmentSpent}/${getQueueConfig(running.currentQueue).allotment}]`;
      }
    } else if (blockedQueue.length > 0) {
      eventDescription = `CPU Idle - waiting for I/O (${blockedQueue.map((b) => `${b.id}:${b.remainingIo}`).join(", ")})`;
    } else {
      eventDescription = "CPU Idle";
    }

    const currentMlfqSnapshot: Record<number, string[]> = {};
    for (const q of sortedQueues) {
      currentMlfqSnapshot[q.priority] = [...(getMlfqQueue(q.priority))];
    }

    timeline.push({
      tick,
      runningProcessId: running ? running.id : null,
      readyQueue: [...readyQueue],
      blockedQueue: blockedQueue.map((b) => ({ ...b })),
      mlfqQueues: algorithm === "MLFQ" ? currentMlfqSnapshot : undefined,
      eventDescription,
      isContextSwitch
    });

    for (const b of blockedQueue) {
      b.remainingIo--;
      const p = getProcess(b.id);
      p.remainingIo = b.remainingIo;
    }

    if (running) {
      if (running.firstRunTime === null) {
        running.firstRunTime = tick;
      }
      running.remainingBurst--;
      running.timeSliceSpent++;
      running.allotmentSpent++;

      if (running.remainingBurst === 0) {
        running.burstIndex++;
        if (running.burstIndex < running.bursts.length) {
          const nextBurst = running.bursts[running.burstIndex];
          if (nextBurst && nextBurst.type === "io") {
            running.remainingIo = nextBurst.duration;
            blockedQueue.push({ id: running.id, remainingIo: nextBurst.duration });
            running.timeSliceSpent = 0;
            running = null;
          } else if (nextBurst) {
            running.remainingBurst = nextBurst.duration;
            running.timeSliceSpent = 0;
          }
        } else {
          running.completionTime = tick + 1;
          running = null;
        }
      }
    }

    previousRunningId = running ? running.id : null;
    tick++;
  }

  const metrics: SchedulerMetrics[] = processes.map((p) => {
    const arrivalTime = p.arrivalTime;
    const firstRunTime = p.firstRunTime ?? arrivalTime;
    const completionTime = p.completionTime ?? tick;
    const turnaroundTime = completionTime - arrivalTime;
    const responseTime = firstRunTime - arrivalTime;
    const waitTime = Math.max(0, turnaroundTime - p.totalCpuDuration - p.totalIoDuration);

    return {
      processId: p.id,
      arrivalTime,
      firstRunTime,
      completionTime,
      turnaroundTime,
      responseTime,
      waitTime
    };
  });

  const totalProcs = metrics.length;
  const sumTurnaround = metrics.reduce((acc, m) => acc + m.turnaroundTime, 0);
  const sumResponse = metrics.reduce((acc, m) => acc + m.responseTime, 0);
  const sumWait = metrics.reduce((acc, m) => acc + m.waitTime, 0);

  const averages = {
    turnaround: totalProcs > 0 ? Number((sumTurnaround / totalProcs).toFixed(2)) : 0,
    response: totalProcs > 0 ? Number((sumResponse / totalProcs).toFixed(2)) : 0,
    wait: totalProcs > 0 ? Number((sumWait / totalProcs).toFixed(2)) : 0
  };

  return {
    timeline,
    metrics,
    averages,
    totalTicks: tick
  };
}
