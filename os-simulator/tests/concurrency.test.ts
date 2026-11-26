import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOST_UPDATE_DEMO,
  TICKET_LOCK_DEMO,
  BOUNDED_BUFFER_MESA,
  BOUNDED_BUFFER_1CV_BUG,
  SEMAPHORE_DEADLOCK_ORDER,
  DINING_PHILOSOPHERS_DEADLOCK,
  DINING_PHILOSOPHERS_ASYMMETRIC
} from "../src/core/concurrency/presets.js";
import { canThreadStep, stepActive, stepThread } from "../src/core/concurrency/interleaving.js";
import { checkCoffmanConditions } from "../src/core/concurrency/rag.js";
import { semPost, semWait } from "../src/core/concurrency/sync-primitives.js";
import {
  parseInstruction,
  parseInstructionList,
  parseScenarioConfig
} from "../src/core/concurrency/types.js";
import { openCustomScenarioModal } from "../src/ui/concurrency/custom-scenario-modal.js";

import type { SemaphoreState } from "../src/core/concurrency/types.js";

test("Lost Update: Interleaving of two threads produces x=11 instead of x=12", () => {
  let state = LOST_UPDATE_DEMO;
  assert.equal(state.sharedMemory["x"], 10);

  // Normal serial execution would be: T1 (3 steps), T2 (3 steps) -> x=12.
  // We perform the race condition interleaving:
  // 1. T1 executes step 0: reads x=10 into eax.
  state = stepThread(state, "T1");
  const t1AfterRead = state.threads.find((t) => t.id === "T1")!;
  assert.equal(t1AfterRead.registers["eax"], 10);
  assert.equal(t1AfterRead.programCounter, 1);

  // 2. Preempt T1 and switch to T2. T2 runs to completion:
  state = stepThread(state, "T2"); // T2 read x=10
  state = stepThread(state, "T2"); // T2 add 1 -> eax=11
  state = stepThread(state, "T2"); // T2 write x=11
  const t2Terminated = state.threads.find((t) => t.id === "T2")!;
  assert.equal(t2Terminated.state, "terminated");
  assert.equal(state.sharedMemory["x"], 11);

  // 3. Switch back to T1 with stale eax=10:
  state = stepThread(state, "T1"); // T1 add 1 -> eax=11
  state = stepThread(state, "T1"); // T1 write x=11 (overwrites with stale update!)
  const t1Terminated = state.threads.find((t) => t.id === "T1")!;
  assert.equal(t1Terminated.state, "terminated");

  // Final anomaly verification: x is 11, lost update confirmed!
  assert.equal(state.sharedMemory["x"], 11);
});

test("Condition Variables Mesa: Wait atomically releases lock and signal unblocks thread which reacquires lock", () => {
  let state = BOUNDED_BUFFER_MESA;

  // Buffer is empty. Consumer C1 runs first.
  state = stepThread(state, "C1"); // C1 acquires mutex
  assert.equal(state.locks["mutex"]?.heldBy, "C1");

  state = stepThread(state, "C1"); // C1 evaluates while (count == 0) -> condition true, calls wait(fill, mutex)
  const c1Blocked = state.threads.find((t) => t.id === "C1")!;
  assert.equal(c1Blocked.state, "blocked");
  assert.equal(state.conditionVariables["fill"]?.waitQueue.includes("C1"), true);
  // Mutex MUST be released atomically!
  assert.equal(state.locks["mutex"]?.heldBy, null);

  // Now Producer P1 runs:
  state = stepThread(state, "P1"); // P1 acquires mutex
  assert.equal(state.locks["mutex"]?.heldBy, "P1");

  state = stepThread(state, "P1"); // P1 evaluates while (count == MAX) -> false, skips wait
  assert.equal(state.threads.find((t) => t.id === "P1")!.programCounter, 2);

  state = stepThread(state, "P1"); // P1 writes to buffer
  assert.equal(state.boundedBuffer?.items.length, 1);
  assert.equal(state.boundedBuffer?.items[0], 42);

  state = stepThread(state, "P1"); // P1 signals fill
  // C1 was in fill.waitQueue. Since P1 holds mutex, C1 is moved to mutex wait queue under Mesa semantics!
  assert.equal(state.conditionVariables["fill"]?.waitQueue.length, 0);

  state = stepThread(state, "P1"); // P1 unlocks mutex
  // Unlocking mutex transfers lock to C1!
  assert.equal(state.locks["mutex"]?.heldBy, "C1");
  const c1Unblocked = state.threads.find((t) => t.id === "C1")!;
  assert.equal(c1Unblocked.state, "ready");
  assert.equal(c1Unblocked.programCounter, 1);

  // C1 re-evaluates condition under Mesa semantics: buffer has item, so skips wait and consumes
  state = stepThread(state, "C1");
  assert.equal(state.threads.find((t) => t.id === "C1")!.programCounter, 2);
  state = stepThread(state, "C1"); // read buffer
  assert.equal(state.threads.find((t) => t.id === "C1")!.registers["eax"], 42);
  assert.equal(state.boundedBuffer?.items.length, 0);
  state = stepThread(state, "C1"); // signal empty
  state = stepThread(state, "C1"); // unlock mutex
  assert.equal(state.threads.find((t) => t.id === "C1")!.state, "terminated");
});

test("Bounded Buffer 1 CV vs 2 CV: Deadlock on single CV scenario vs correctness with 2 CVs", () => {
  let state = BOUNDED_BUFFER_1CV_BUG;
  assert.equal(state.boundedBuffer?.items.length, 0);

  // 1. C1 runs: acquires mutex, sees count == 0, waits on cond
  state = stepThread(state, "C1");
  assert.equal(state.locks["mutex"]?.heldBy, "C1");
  state = stepThread(state, "C1");
  assert.equal(state.threads.find((t) => t.id === "C1")!.state, "blocked");
  assert.deepEqual(state.conditionVariables["cond"]?.waitQueue, ["C1"]);
  assert.equal(state.locks["mutex"]?.heldBy, null);

  // 2. C2 runs: acquires mutex, sees count == 0, waits on cond
  state = stepThread(state, "C2");
  assert.equal(state.locks["mutex"]?.heldBy, "C2");
  state = stepThread(state, "C2");
  assert.equal(state.threads.find((t) => t.id === "C2")!.state, "blocked");
  assert.deepEqual(state.conditionVariables["cond"]?.waitQueue, ["C1", "C2"]);
  assert.equal(state.locks["mutex"]?.heldBy, null);

  // 3. P1 runs: acquires mutex, skips wait (count >= 1 is false), writes 100, signals cond, unlocks mutex
  state = stepThread(state, "P1");
  state = stepThread(state, "P1");
  assert.equal(state.threads.find((t) => t.id === "P1")!.programCounter, 2);
  state = stepThread(state, "P1"); // put(100)
  assert.equal(state.boundedBuffer?.items.length, 1);
  assert.equal(state.boundedBuffer?.items[0], 100);

  state = stepThread(state, "P1"); // signal cond -> wakes C1 (FIFO), C1 moved to mutex queue
  assert.deepEqual(state.conditionVariables["cond"]?.waitQueue, ["C2"]);

  state = stepThread(state, "P1"); // unlock mutex -> transfers lock to C1
  assert.equal(state.threads.find((t) => t.id === "P1")!.state, "terminated");
  assert.equal(state.locks["mutex"]?.heldBy, "C1");

  const c1AfterWake = state.threads.find((t) => t.id === "C1")!;
  assert.equal(c1AfterWake.state, "ready");
  assert.equal(c1AfterWake.programCounter, 1); // Mesa semantics: PC stays at wait to re-evaluate!

  // 4. C1 re-evaluates condition at PC 1: count is 1, so count <= 0 is false, wait passed!
  state = stepThread(state, "C1");
  assert.equal(state.threads.find((t) => t.id === "C1")!.programCounter, 2);

  state = stepThread(state, "C1"); // read buffer -> gets 100, buffer becomes empty
  assert.equal(state.threads.find((t) => t.id === "C1")!.registers["eax"], 100);
  assert.equal(state.boundedBuffer?.items.length, 0);

  state = stepThread(state, "C1"); // signal cond -> 1 CV bug: signals C2 instead of a producer!
  assert.equal(state.conditionVariables["cond"]?.waitQueue.length, 0);

  state = stepThread(state, "C1"); // unlock mutex -> transfers lock to C2
  assert.equal(state.threads.find((t) => t.id === "C1")!.state, "terminated");
  assert.equal(state.locks["mutex"]?.heldBy, "C2");

  const c2AfterWake = state.threads.find((t) => t.id === "C2")!;
  assert.equal(c2AfterWake.state, "ready");
  assert.equal(c2AfterWake.programCounter, 1); // Mesa semantics: PC stays at wait to re-evaluate!

  // 5. C2 re-evaluates while (count == 0) wait(&cond, &mutex).
  // Because buffer was emptied by C1, count <= 0 is TRUE!
  // Under Mesa semantics, C2 calls waitCondition and goes back to sleep on cond!
  state = stepThread(state, "C2");
  const c2Final = state.threads.find((t) => t.id === "C2")!;
  assert.equal(c2Final.state, "blocked");
  assert.equal(c2Final.blockedOn?.type, "condition");
  assert.equal(c2Final.blockedOn?.syncObject, "cond");
  assert.deepEqual(state.conditionVariables["cond"]?.waitQueue, ["C2"]);

  // 6. Deadlock verification: all active threads are blocked on cond, no thread can step
  assert.equal(canThreadStep(state, "P1"), false);
  assert.equal(canThreadStep(state, "C1"), false);
  assert.equal(canThreadStep(state, "C2"), false);
  assert.equal(state.threads.some((t) => canThreadStep(state, t.id)), false);
  assert.equal(stepActive(state), state);
});

test("Custom Scenario Modal: Attaches to targetContainer and cleans up properly on AbortSignal", () => {
  const windowListeners: Record<string, Function[]> = {};
  const globalWindow = {
    addEventListener: (type: string, fn: Function) => {
      windowListeners[type] = windowListeners[type] || [];
      windowListeners[type]!.push(fn);
    },
    removeEventListener: (type: string, fn: Function) => {
      if (windowListeners[type]) {
        windowListeners[type] = windowListeners[type]!.filter((f) => f !== fn);
      }
    }
  };

  class MockElement {
    children: MockElement[] = [];
    className = "";
    title = "";
    textContent = "";
    value = "";
    rows = 0;
    classList = {
      add: () => {},
      remove: () => {},
      contains: () => false
    };
    listeners: Record<string, Function[]> = {};
    addEventListener(type: string, fn: Function) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type]!.push(fn);
    }
    removeEventListener(type: string, fn: Function) {
      if (this.listeners[type]) {
        this.listeners[type] = this.listeners[type]!.filter((f) => f !== fn);
      }
    }
    appendChild(child: MockElement) {
      this.children.push(child);
      return child;
    }
    append(...children: MockElement[]) {
      this.children.push(...children);
    }
    setAttribute() {}
    remove() {
      const idx = mockContainer.children.indexOf(this);
      if (idx !== -1) {
        mockContainer.children.splice(idx, 1);
      }
    }
  }

  const mockContainer = new MockElement();
  const globalDocument = {
    body: new MockElement(),
    createElement: () => new MockElement(),
    createElementNS: () => new MockElement()
  };

  const oldWindow = (globalThis as any).window;
  const oldDocument = (globalThis as any).document;
  (globalThis as any).window = globalWindow;
  (globalThis as any).document = globalDocument;

  try {
    const ac = new AbortController();
    openCustomScenarioModal(
      LOST_UPDATE_DEMO,
      () => {},
      mockContainer as any,
      ac.signal
    );

    assert.equal(mockContainer.children.length, 1);
    ac.abort();
    assert.equal(mockContainer.children.length, 0);

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    const noopCleanup = openCustomScenarioModal(
      LOST_UPDATE_DEMO,
      () => {},
      mockContainer as any,
      alreadyAborted.signal
    );
    assert.equal(mockContainer.children.length, 0);
    noopCleanup();
  } finally {
    (globalThis as any).window = oldWindow;
    (globalThis as any).document = oldDocument;
  }
});

test("Dijkstra Semaphores: Negative count matches waiting queue and sem_post unblocks FIFO", () => {
  let sems: Record<string, SemaphoreState> = {
    s: { id: "s", value: 1, waitQueue: [], initialValue: 1, allocatedTo: [] }
  };

  // 1. Thread T1 calls sem_wait(s): value decrements to 0, succeeds
  const r1 = semWait(sems, "s", "T1");
  assert.equal(r1.acquired, true);
  assert.equal(r1.semaphores["s"]!.value, 0);
  assert.equal(r1.semaphores["s"]!.waitQueue.length, 0);
  sems = r1.semaphores;

  // 2. Thread T2 calls sem_wait(s): value decrements to -1 (< 0), blocks!
  const r2 = semWait(sems, "s", "T2");
  assert.equal(r2.acquired, false);
  assert.equal(r2.semaphores["s"]!.value, -1);
  assert.equal(r2.semaphores["s"]!.waitQueue.length, 1);
  assert.equal(r2.semaphores["s"]!.waitQueue[0], "T2");
  sems = r2.semaphores;

  // 3. Thread T3 calls sem_wait(s): value decrements to -2 (< 0), blocks!
  const r3 = semWait(sems, "s", "T3");
  assert.equal(r3.acquired, false);
  assert.equal(r3.semaphores["s"]!.value, -2);
  assert.equal(r3.semaphores["s"]!.waitQueue.length, 2);
  assert.deepEqual(r3.semaphores["s"]!.waitQueue, ["T2", "T3"]);
  sems = r3.semaphores;

  // 4. Thread T1 calls sem_post(s): value increments to -1 (<= 0), unblocks first thread (T2 FIFO)!
  const p1 = semPost(sems, "s", "T1");
  assert.equal(p1.unblockedThreadId, "T2");
  assert.equal(p1.semaphores["s"]!.value, -1);
  assert.deepEqual(p1.semaphores["s"]!.waitQueue, ["T3"]);
  sems = p1.semaphores;

  // 5. Another sem_post(s): unblocks T3 FIFO!
  const p2 = semPost(sems, "s", "T2");
  assert.equal(p2.unblockedThreadId, "T3");
  assert.equal(p2.semaphores["s"]!.value, 0);
  assert.equal(p2.semaphores["s"]!.waitQueue.length, 0);
  sems = p2.semaphores;

  // 6. Another sem_post(s): value increments to 1, no threads waiting
  const p3 = semPost(sems, "s", "T3");
  assert.equal(p3.unblockedThreadId, null);
  assert.equal(p3.semaphores["s"]!.value, 1);
});

test("Dijkstra Semaphores: Mutex ordering deadlock in Bounded Buffer", () => {
  let state = SEMAPHORE_DEADLOCK_ORDER;

  // Initial semaphore values: mutex=1, empty=1, fill=0.
  assert.equal(state.semaphores["fill"]?.value, 0);
  assert.equal(state.semaphores["fill"]?.waitQueue.length, 0);

  // Consumer runs sem_wait(mutex) -> mutex becomes 0, Consumer holds mutex
  state = stepThread(state, "Consumer");
  assert.equal(state.semaphores["mutex"]?.value, 0);

  // Consumer runs sem_wait(fill) -> fill becomes -1 (< 0)! Consumer blocks!
  state = stepThread(state, "Consumer");
  assert.equal(state.semaphores["fill"]?.value, -1);
  assert.equal(state.semaphores["fill"]?.waitQueue.length, 1);
  assert.equal(state.semaphores["fill"]?.waitQueue[0], "Consumer");

  // Producer runs sem_wait(empty) -> empty becomes 0, succeeds
  state = stepThread(state, "Producer");
  assert.equal(state.semaphores["empty"]?.value, 0);

  // Producer runs sem_wait(mutex) -> mutex was 0, now becomes -1! Producer blocks!
  state = stepThread(state, "Producer");
  assert.equal(state.semaphores["mutex"]?.value, -1);
  assert.equal(state.semaphores["mutex"]?.waitQueue.length, 1);
  assert.equal(state.semaphores["mutex"]?.waitQueue[0], "Producer");

  // Mutual deadlock verified!
  const coffman = checkCoffmanConditions(state);
  assert.equal(coffman.mutualExclusion.met, true);
  assert.equal(coffman.holdAndWait.met, true);
  assert.equal(coffman.noPreemption.met, true);
  assert.equal(coffman.circularWait.met, true);
  assert.equal(coffman.isDeadlocked, true);
});

test("Deadlock RAG: 5 symmetric philosophers deadlock with cycle of length 10, asymmetric breaks cycle", () => {
  // Symmetric test
  let symState = DINING_PHILOSOPHERS_DEADLOCK;

  // Each philosopher P0..P4 acquires their left fork:
  for (let i = 0; i < 5; i++) {
    symState = stepThread(symState, `P${i}`);
  }

  // All 5 left forks are held:
  for (let i = 0; i < 5; i++) {
    assert.equal(symState.locks[`fork${i}`]?.heldBy, `P${i}`);
  }

  // Each philosopher P0..P4 attempts to acquire right fork -> all 5 block!
  for (let i = 0; i < 5; i++) {
    symState = stepThread(symState, `P${i}`);
  }

  for (let i = 0; i < 5; i++) {
    const phil = symState.threads.find((t) => t.id === `P${i}`)!;
    assert.equal(phil.state, "blocked");
  }

  // Check RAG cycles:
  const symCycles = symState.rag.detectedCycles;
  assert.ok(symCycles.length >= 1);
  const cycle = symCycles[0]!;
  // Cycle contains 5 processes + 5 resources + return to start = 11 elements
  assert.equal(cycle.length, 11);

  const symCoffman = checkCoffmanConditions(symState);
  assert.equal(symCoffman.circularWait.met, true);
  assert.equal(symCoffman.isDeadlocked, true);

  // Asymmetric test: P4 inverts order
  let asymState = DINING_PHILOSOPHERS_ASYMMETRIC;

  // P0 takes fork0
  asymState = stepThread(asymState, "P0");
  assert.equal(asymState.locks["fork0"]?.heldBy, "P0");

  // P1 takes fork1
  asymState = stepThread(asymState, "P1");
  // P2 takes fork2
  asymState = stepThread(asymState, "P2");
  // P3 takes fork3
  asymState = stepThread(asymState, "P3");

  // P4 tries to take fork0 FIRST (since P4 is inverted):
  asymState = stepThread(asymState, "P4");
  // P4 blocks because fork0 is held by P0! P4 DOES NOT take fork4!
  const p4 = asymState.threads.find((t) => t.id === "P4")!;
  assert.equal(p4.state, "blocked");
  assert.equal(asymState.locks["fork4"]?.heldBy, null); // fork4 remains free!

  // Now P3 requests fork4 -> SUCCEEDS because fork4 is free!
  asymState = stepThread(asymState, "P3");
  const p3 = asymState.threads.find((t) => t.id === "P3")!;
  assert.notEqual(p3.state, "blocked");
  assert.equal(asymState.locks["fork4"]?.heldBy, "P3");

  // No cycle exists!
  const asymCycles = asymState.rag.detectedCycles;
  assert.equal(asymCycles.length, 0);
  const asymCoffman = checkCoffmanConditions(asymState);
  assert.equal(asymCoffman.circularWait.met, false);
  assert.equal(asymCoffman.isDeadlocked, false);
});

test("Ticket Lock: Fairness, ticket assignment, and turn progression", () => {
  let state = TICKET_LOCK_DEMO;

  // T1 acquires ticket_lock (gets ticket=0, turn=0)
  state = stepThread(state, "T1");
  assert.equal(state.locks["ticket_lock"]?.heldBy, "T1");
  assert.equal(state.locks["ticket_lock"]?.ticket, 1);
  assert.equal(state.locks["ticket_lock"]?.turn, 0);

  // T2 requests ticket_lock (gets ticket=1, blocks)
  state = stepThread(state, "T2");
  assert.equal(state.threads.find((t) => t.id === "T2")!.state, "blocked");
  assert.equal(state.locks["ticket_lock"]?.ticket, 2);

  // T3 requests ticket_lock (gets ticket=2, blocks)
  state = stepThread(state, "T3");
  assert.equal(state.threads.find((t) => t.id === "T3")!.state, "blocked");
  assert.equal(state.locks["ticket_lock"]?.ticket, 3);

  // T1 finishes critical section: read counter, add 1, write counter, unlock
  state = stepThread(state, "T1"); // read
  state = stepThread(state, "T1"); // add
  state = stepThread(state, "T1"); // write
  assert.equal(state.sharedMemory["counter"], 1);

  state = stepThread(state, "T1"); // unlock: turn becomes 1, unblocks T2 (ticket=1)!
  assert.equal(state.locks["ticket_lock"]?.turn, 1);
  assert.equal(state.locks["ticket_lock"]?.heldBy, "T2");
  assert.equal(state.threads.find((t) => t.id === "T2")!.state, "ready");
});

test("Boundary Parsers: Validate arbitrary instruction lists and scenario configs", () => {
  // Test valid instruction
  const validInst = parseInstruction({
    op: "add",
    register: "eax",
    literal: 5
  });
  assert.equal(validInst.success, true);
  if (validInst.success) {
    assert.equal(validInst.data.op, "add");
    assert.equal(validInst.data.literal, 5);
  }

  // Test invalid op
  const invalidOp = parseInstruction({
    op: "invalid_op_here"
  });
  assert.equal(invalidOp.success, false);

  // Test instruction list
  const listRes = parseInstructionList([
    { op: "read", targetVariable: "x", register: "eax" },
    { op: "add", register: "eax", literal: 1 },
    { op: "write", targetVariable: "x", register: "eax" }
  ]);
  assert.equal(listRes.success, true);
  if (listRes.success) {
    assert.equal(listRes.data.length, 3);
  }

  // Test scenario config
  const scenarioRes = parseScenarioConfig({
    scenarioId: "custom-test",
    name: "Custom Test",
    description: "A test custom scenario",
    threads: [
      {
        id: "T1",
        instructions: [{ op: "add", register: "eax", literal: 1 }]
      }
    ],
    sharedMemory: { val: 42 }
  });
  assert.equal(scenarioRes.success, true);
  if (scenarioRes.success) {
    assert.equal(scenarioRes.data.scenarioId, "custom-test");
    assert.equal(scenarioRes.data.threads[0]?.id, "T1");
    assert.equal(scenarioRes.data.sharedMemory["val"], 42);
  }
});
