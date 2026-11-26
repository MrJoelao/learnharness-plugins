import { test } from "node:test";
import assert from "node:assert/strict";
import {
  savedExerciseBoundaryParser,
  exerciseListBoundaryParser,
  createExercise,
  markExerciseAsModified,
  updateExerciseMetadata,
  removeExercise,
  findExercise
} from "../src/core/exercise-manager.ts";
import type { SavedExercise } from "../src/types/ai.ts";

test("savedExerciseBoundaryParser: accepts valid SavedExercise and rejects malformed objects", () => {
  const validExercise: SavedExercise = {
    id: "ex-101",
    title: "Segmentation Addressing Test",
    date: new Date().toISOString(),
    consegna: "Calculate physical addresses for segment 0 and 1.",
    sourceTag: "ai",
    mode: "memory-lab",
    config: { base: 0x1000, limit: 0x500 }
  };

  const parsedValid = savedExerciseBoundaryParser.parse(validExercise);
  assert.equal(parsedValid.success, true);
  if (parsedValid.success) {
    assert.equal(parsedValid.data.id, "ex-101");
    assert.equal(parsedValid.data.sourceTag, "ai");
    assert.equal(parsedValid.data.mode, "memory-lab");
  }

  // Non-object
  assert.equal(savedExerciseBoundaryParser.parse(null).success, false);
  assert.equal(savedExerciseBoundaryParser.parse("string").success, false);

  // Missing / empty id
  assert.equal(
    savedExerciseBoundaryParser.parse({ ...validExercise, id: "  " }).success,
    false
  );

  // Missing / empty title
  assert.equal(
    savedExerciseBoundaryParser.parse({ ...validExercise, title: "" }).success,
    false
  );

  // Invalid ISO 8601 date
  assert.equal(
    savedExerciseBoundaryParser.parse({ ...validExercise, date: "not-a-valid-date" }).success,
    false
  );

  // Invalid sourceTag
  assert.equal(
    savedExerciseBoundaryParser.parse({ ...validExercise, sourceTag: "unknown" }).success,
    false
  );

  // Invalid mode
  assert.equal(
    savedExerciseBoundaryParser.parse({ ...validExercise, mode: "unknown-lab" }).success,
    false
  );

  // Missing consegna
  assert.equal(
    savedExerciseBoundaryParser.parse({ ...validExercise, consegna: 123 }).success,
    false
  );
});

test("exerciseListBoundaryParser: validates an array of exercises and rejects invalid elements", () => {
  const now = new Date().toISOString();
  const validList: SavedExercise[] = [
    {
      id: "ex-1",
      title: "Round Robin Quantum 2",
      date: now,
      consegna: "Observe turnaround time under RR.",
      sourceTag: "manual",
      mode: "cpu-lab",
      config: { quantum: 2 }
    },
    {
      id: "ex-2",
      title: "Bounded Buffer 2 CVs",
      date: now,
      consegna: "Ensure no deadlock occurs with empty and fill CVs.",
      sourceTag: "ai",
      mode: "concurrency-lab",
      config: { bufferSize: 5 }
    }
  ];

  const parsed = exerciseListBoundaryParser.parse(validList);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.length, 2);
  }

  // Not an array
  assert.equal(exerciseListBoundaryParser.parse({ not: "an array" }).success, false);

  // Array with invalid item
  const invalidList = [...validList, { id: "" }];
  assert.equal(exerciseListBoundaryParser.parse(invalidList).success, false);
});

test("createExercise: creates exercise with dynamic sourceTag ('ai' vs 'manual') and valid defaults", () => {
  const aiExercise = createExercise({
    title: "MLFQ Allotment Exhaustion",
    consegna: "Study priority demotion after cumulative allotment is spent.",
    mode: "cpu-lab",
    config: { allotment: 10 },
    isAiGenerated: true
  });

  assert.ok(aiExercise.id.length > 0);
  assert.equal(aiExercise.title, "MLFQ Allotment Exhaustion");
  assert.equal(aiExercise.mode, "cpu-lab");
  assert.equal(aiExercise.sourceTag, "ai");
  assert.ok(!Number.isNaN(Date.parse(aiExercise.date)));
  assert.deepEqual(aiExercise.config, { allotment: 10 });

  const manualExercise = createExercise({
    title: "Custom Linear Paging",
    consegna: "Manual page table inspection.",
    mode: "memory-lab",
    config: { vpnBits: 4 }
  });

  assert.equal(manualExercise.sourceTag, "manual");
});

test("markExerciseAsModified: converts sourceTag from 'ai' to 'manual' immutably and updates config", () => {
  const original = createExercise({
    title: "Belady Anomaly Detection",
    consegna: "Check page fault counts across 3 and 4 frames.",
    mode: "memory-lab",
    config: { frames: [3, 4] },
    isAiGenerated: true
  });

  assert.equal(original.sourceTag, "ai");

  const modified = markExerciseAsModified(original, { frames: [3, 4, 5] });
  assert.equal(modified.sourceTag, "manual");
  assert.deepEqual(modified.config, { frames: [3, 4, 5] });
  // Immutability check
  assert.equal(original.sourceTag, "ai");
  assert.notEqual(original, modified);

  // Without new config
  const modifiedSameConfig = markExerciseAsModified(original);
  assert.equal(modifiedSameConfig.sourceTag, "manual");
  assert.deepEqual(modifiedSameConfig.config, { frames: [3, 4] });
});

test("updateExerciseMetadata: updates title, consegna, and date immutably", () => {
  const ex = createExercise({
    title: "Old Title",
    consegna: "Old Consegna",
    mode: "concurrency-lab",
    config: {}
  });

  const updated = updateExerciseMetadata(ex, {
    title: "New Title",
    consegna: "New Consegna"
  });

  assert.equal(updated.title, "New Title");
  assert.equal(updated.consegna, "New Consegna");
  assert.equal(updated.id, ex.id);
  assert.equal(updated.mode, ex.mode);
  assert.notEqual(ex, updated);
});

test("removeExercise and findExercise: perform pure CRUD operations on exercise lists", () => {
  const ex1 = createExercise({
    title: "Ex 1",
    consegna: "C1",
    mode: "memory-lab",
    config: {}
  });
  const ex2 = createExercise({
    title: "Ex 2",
    consegna: "C2",
    mode: "cpu-lab",
    config: {}
  });

  const list = [ex1, ex2];

  // findExercise
  const found = findExercise(list, ex1.id);
  assert.deepEqual(found, ex1);
  assert.equal(findExercise(list, "non-existent-id"), undefined);

  // removeExercise
  const filtered = removeExercise(list, ex1.id);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, ex2.id);
  // Immutability: original list unchanged
  assert.equal(list.length, 2);
});
