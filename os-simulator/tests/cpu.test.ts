import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateSchedule } from "../src/core/cpu/scheduler.js";
import {
  FIFO_VS_SJF_CONVOY,
  STCF_PREEMPTION,
  RR_QUANTUM_DEMO,
  MLFQ_GAMING_WORKLOAD,
  MLFQ_PRIORITY_BOOST
} from "../src/core/cpu/presets.js";
import {
  LDE_STEPS,
  getLdeStep,
  simulateLdeProtocol
} from "../src/core/cpu/privilege.js";
import {
  parseMlfqConfig,
  parseQuantum,
  parseWorkloadInput
} from "../src/core/cpu/types.js";

test("FIFO vs SJF: Convoy effect is demonstrated with turnaround dropped from 110 to 50", () => {
  const workload = FIFO_VS_SJF_CONVOY.workload;

  // Run FIFO
  const fifoResult = simulateSchedule("FIFO", workload);
  assert.equal(fifoResult.metrics.length, 3);

  const fifoP1 = fifoResult.metrics.find((m) => m.processId === "P1")!;
  const fifoP2 = fifoResult.metrics.find((m) => m.processId === "P2")!;
  const fifoP3 = fifoResult.metrics.find((m) => m.processId === "P3")!;

  assert.equal(fifoP1.turnaroundTime, 100);
  assert.equal(fifoP2.turnaroundTime, 110);
  assert.equal(fifoP3.turnaroundTime, 120);
  assert.equal(fifoResult.averages.turnaround, 110);
  assert.equal(fifoResult.averages.wait, 70);

  // Run SJF
  const sjfResult = simulateSchedule("SJF", workload);
  assert.equal(sjfResult.metrics.length, 3);

  const sjfP1 = sjfResult.metrics.find((m) => m.processId === "P1")!;
  const sjfP2 = sjfResult.metrics.find((m) => m.processId === "P2")!;
  const sjfP3 = sjfResult.metrics.find((m) => m.processId === "P3")!;

  assert.equal(sjfP2.turnaroundTime, 10);
  assert.equal(sjfP3.turnaroundTime, 20);
  assert.equal(sjfP1.turnaroundTime, 120);
  assert.equal(sjfResult.averages.turnaround, 50);
  assert.equal(sjfResult.averages.wait, 10);
});

test("STCF: Preemption occurs when shorter job arrives", () => {
  const workload = STCF_PREEMPTION.workload;
  const result = simulateSchedule("STCF", workload);

  const p1 = result.metrics.find((m) => m.processId === "P1")!;
  const p2 = result.metrics.find((m) => m.processId === "P2")!;

  assert.ok(p1 && p2);
  assert.equal(p1.firstRunTime, 0);
  assert.equal(p2.firstRunTime, 10); // P2 arrives at tick 10 and immediately preempts P1
  assert.equal(p2.completionTime, 30); // P2 runs 20 ticks (10..30)
  assert.equal(p1.completionTime, 120); // P1 resumes at 30 and finishes at 120

  // Verify timeline at tick 9 (P1 running) vs tick 10 (P2 running due to preemption)
  const stepAt9 = result.timeline[9];
  const stepAt10 = result.timeline[10];

  assert.equal(stepAt9?.runningProcessId, "P1");
  assert.equal(stepAt10?.runningProcessId, "P2");
  assert.equal(stepAt10?.isContextSwitch, true);
});

test("Round Robin: Alternates execution every quantum ticks minimizing response time", () => {
  const workload = RR_QUANTUM_DEMO.workload;
  const result = simulateSchedule("RR", workload, { quantum: 2 });

  const p1 = result.metrics.find((m) => m.processId === "P1")!;
  const p2 = result.metrics.find((m) => m.processId === "P2")!;
  const p3 = result.metrics.find((m) => m.processId === "P3")!;

  // First runs should be rotated: P1 at 0, P2 at 2, P3 at 4
  assert.equal(p1.firstRunTime, 0);
  assert.equal(p2.firstRunTime, 2);
  assert.equal(p3.firstRunTime, 4);

  // Response times
  assert.equal(p1.responseTime, 0);
  assert.equal(p2.responseTime, 2);
  assert.equal(p3.responseTime, 4);
  assert.equal(result.averages.response, 2);

  // Ticks 0,1 -> P1; 2,3 -> P2; 4,5 -> P3; 6,7 -> P1; 8,9 -> P2; 10,11 -> P3; 12 -> P1; 13 -> P2; 14 -> P3
  assert.equal(result.timeline[0]?.runningProcessId, "P1");
  assert.equal(result.timeline[1]?.runningProcessId, "P1");
  assert.equal(result.timeline[2]?.runningProcessId, "P2");
  assert.equal(result.timeline[3]?.runningProcessId, "P2");
  assert.equal(result.timeline[4]?.runningProcessId, "P3");
  assert.equal(result.timeline[5]?.runningProcessId, "P3");
});

test("MLFQ Rule 4: Process doing frequent I/O is demoted once cumulative allotment is exhausted", () => {
  const workload = MLFQ_GAMING_WORKLOAD.workload;
  const config = MLFQ_GAMING_WORKLOAD.mlfqConfig!;
  const result = simulateSchedule("MLFQ", workload, { mlfqConfig: config });

  // P2 attempts gaming: bursts of cpu 9, then io 2.
  // In Q0, timeSlice is 10, allotment is 20.
  // Burst 1: 9 ticks CPU. Allotment spent = 9.
  // Burst 2: I/O for 2 ticks.
  // Burst 3: 9 ticks CPU. Allotment spent = 18.
  // Burst 4: I/O for 2 ticks.
  // Burst 5: 2 ticks CPU -> Allotment reaches 20! Demotion to Q1 occurs!
  const p2Steps = result.timeline.filter((s) => s.runningProcessId === "P2");
  assert.ok(p2Steps.length >= 20);

  // Verify that P2 eventually runs in Q1
  const runningInQ1 = result.timeline.some((s) => {
    return s.runningProcessId === "P2" && s.mlfqQueues && !s.mlfqQueues[0]?.includes("P2") && s.eventDescription.includes("Q1");
  });
  assert.equal(runningInQ1, true, "P2 must be demoted to Q1 under Rule 4 cumulative allotment.");
});

test("MLFQ Rule 5: Priority boost resets all processes to Q0 every S ticks", () => {
  const workload = MLFQ_PRIORITY_BOOST.workload;
  const config = MLFQ_PRIORITY_BOOST.mlfqConfig!;
  const S = config.priorityBoostInterval; // S = 25

  const result = simulateSchedule("MLFQ", workload, { mlfqConfig: config });

  // At tick 24, both CPU-bound processes have demoted to Q1
  const stepBeforeBoost = result.timeline[24];
  assert.ok(stepBeforeBoost);

  // At tick 25, priority boost triggers: all uncompleted jobs must be in Q0
  const stepAtBoost = result.timeline[25];
  assert.ok(stepAtBoost);
  assert.ok(stepAtBoost.mlfqQueues);
  // Q1 must be empty right after boost
  assert.deepEqual(stepAtBoost.mlfqQueues[1], []);
});

test("LDE Hardware Transitions: Stepper traverses Ring 0/3 privilege states with Trap Frame correctly", () => {
  const steps = simulateLdeProtocol();
  assert.equal(steps.length, 9);

  // Stage 0: Boot (CPL 0)
  const step0 = getLdeStep(0);
  assert.equal(step0.cpl, 0);
  assert.equal(step0.savedTrapFrame, null);
  assert.ok(step0.currentInstruction.includes("lidt"));

  // Stage 2: User Execution (CPL 3)
  const step2 = getLdeStep(2);
  assert.equal(step2.cpl, 3);
  assert.equal(step2.savedTrapFrame, null);

  // Stage 4: Hardware Trap Frame saved on Kernel Stack (CPL 0)
  const step4 = getLdeStep(4);
  assert.equal(step4.cpl, 0);
  assert.ok(step4.savedTrapFrame);
  assert.equal(step4.savedTrapFrame.cs, 0x23);
  assert.equal(step4.savedTrapFrame.ss, 0x2b);
  assert.equal(step4.savedTrapFrame.eip, 0x08048422);
  assert.ok(step4.kernelStack.length >= 5);

  // Stage 6: Kernel syscall handler sys_write execution (CPL 0)
  const step6 = getLdeStep(6);
  assert.equal(step6.cpl, 0);
  assert.ok(step6.currentInstruction.includes("sys_write"));

  // Stage 8: Hardware return from trap with iret (CPL 3)
  const step8 = getLdeStep(8);
  assert.equal(step8.cpl, 3);
  assert.equal(step8.savedTrapFrame, null);
});

test("Boundary Parsers: Validate workload, quantum, and MLFQ configurations", () => {
  // Valid workload
  const validWorkload = [
    {
      id: "P1",
      arrivalTime: 0,
      bursts: [{ type: "cpu", duration: 10 }]
    }
  ];
  const p1Res = parseWorkloadInput(validWorkload);
  assert.equal(p1Res.success, true);

  // Invalid: empty array
  const emptyRes = parseWorkloadInput([]);
  assert.equal(emptyRes.success, false);

  // Invalid: duplicate ID
  const dupRes = parseWorkloadInput([
    { id: "P1", arrivalTime: 0, bursts: [{ type: "cpu", duration: 1 }] },
    { id: "P1", arrivalTime: 1, bursts: [{ type: "cpu", duration: 1 }] }
  ]);
  assert.equal(dupRes.success, false);

  // Invalid: negative duration
  const negRes = parseWorkloadInput([
    { id: "P1", arrivalTime: 0, bursts: [{ type: "cpu", duration: -5 }] }
  ]);
  assert.equal(negRes.success, false);

  // Valid MLFQ Config
  const validMlfq = {
    queues: [
      { priority: 0, timeSlice: 5, allotment: 10 },
      { priority: 1, timeSlice: 10, allotment: 20 }
    ],
    priorityBoostInterval: 50
  };
  const mlfqRes = parseMlfqConfig(validMlfq);
  assert.equal(mlfqRes.success, true);

  // Invalid MLFQ: duplicate priority
  const dupMlfq = parseMlfqConfig({
    queues: [
      { priority: 0, timeSlice: 5, allotment: 10 },
      { priority: 0, timeSlice: 10, allotment: 20 }
    ],
    priorityBoostInterval: 50
  });
  assert.equal(dupMlfq.success, false);

  // Valid Quantum
  assert.equal(parseQuantum(4).success, true);
  assert.equal(parseQuantum(-1).success, false);
  assert.equal(parseQuantum(0).success, false);
  assert.equal(parseQuantum("abc").success, false);
});

test("MLFQ Rule 1: Higher priority queue arrival preempts running process in lower priority queue", () => {
  const workload = [
    {
      id: "P1",
      arrivalTime: 0,
      bursts: [{ type: "cpu" as const, duration: 50 }]
    },
    {
      id: "P2",
      arrivalTime: 10,
      bursts: [{ type: "cpu" as const, duration: 5 }]
    }
  ];

  const mlfqConfig = {
    queues: [
      { priority: 0, timeSlice: 5, allotment: 5 },
      { priority: 1, timeSlice: 10, allotment: 20 },
      { priority: 2, timeSlice: 20, allotment: 40 }
    ],
    priorityBoostInterval: 1000
  };

  const result = simulateSchedule("MLFQ", workload, { mlfqConfig });

  assert.equal(result.timeline[9]?.runningProcessId, "P1");
  assert.equal(result.timeline[10]?.runningProcessId, "P2");
  assert.equal(result.timeline[10]?.isContextSwitch, true);
  assert.ok(result.timeline[10]?.mlfqQueues?.[1]?.includes("P1"));

  const p2Metric = result.metrics.find((m) => m.processId === "P2")!;
  assert.equal(p2Metric.firstRunTime, 10);
  assert.equal(p2Metric.completionTime, 15);

  assert.equal(result.timeline[15]?.runningProcessId, "P1");
});

test("I/O burst timing: blocked for exact duration (D=1 and D>1) and waitTime excludes I/O duration", () => {
  const workloadD1 = [
    {
      id: "P1",
      arrivalTime: 0,
      bursts: [
        { type: "cpu" as const, duration: 2 },
        { type: "io" as const, duration: 1 },
        { type: "cpu" as const, duration: 2 }
      ]
    }
  ];

  const resultD1 = simulateSchedule("FIFO", workloadD1);
  const p1Metric = resultD1.metrics.find((m) => m.processId === "P1")!;

  assert.equal(resultD1.timeline[0]?.runningProcessId, "P1");
  assert.equal(resultD1.timeline[1]?.runningProcessId, "P1");
  assert.equal(resultD1.timeline[2]?.runningProcessId, null);
  assert.deepEqual(resultD1.timeline[2]?.blockedQueue, [{ id: "P1", remainingIo: 1 }]);
  assert.equal(resultD1.timeline[3]?.runningProcessId, "P1");
  assert.equal(resultD1.timeline[4]?.runningProcessId, "P1");

  const blockedStepsD1 = resultD1.timeline.filter((s) => s.blockedQueue.some((b) => b.id === "P1"));
  assert.equal(blockedStepsD1.length, 1, "I/O of duration 1 must be blocked for exactly 1 tick.");

  assert.equal(p1Metric.turnaroundTime, 5);
  assert.equal(p1Metric.waitTime, 0);

  const workloadD3 = [
    {
      id: "PA",
      arrivalTime: 0,
      bursts: [
        { type: "cpu" as const, duration: 2 },
        { type: "io" as const, duration: 3 },
        { type: "cpu" as const, duration: 2 }
      ]
    },
    {
      id: "PB",
      arrivalTime: 0,
      bursts: [{ type: "cpu" as const, duration: 4 }]
    }
  ];

  const resultD3 = simulateSchedule("FIFO", workloadD3);
  const paMetric = resultD3.metrics.find((m) => m.processId === "PA")!;

  const paBlockedSteps = resultD3.timeline.filter((s) => s.blockedQueue.some((b) => b.id === "PA"));
  assert.equal(paBlockedSteps.length, 3, "I/O of duration 3 must be blocked for exactly 3 ticks.");

  assert.equal(paMetric.turnaroundTime, 8);
  assert.equal(paMetric.waitTime, 1);
});
