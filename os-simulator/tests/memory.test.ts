import { test } from "node:test";
import assert from "node:assert/strict";
import { translateSegmentation } from "../src/core/memory/segmentation.js";
import { translateLinearPaging, translateMultiLevelPaging } from "../src/core/memory/paging.js";
import { lookupTlb, updateTlb, translateWithTlb } from "../src/core/memory/tlb.js";
import { simulatePageReplacement, detectBeladyAnomaly } from "../src/core/memory/replacement.js";
import {
  SEGMENTATION_UNIMI_SEED_0,
  PAGING_UNIMI_SEED_0,
  MULTILEVEL_SPARSE_SPACE
} from "../src/core/memory/presets.js";
import {
  parseAddressInput,
  parseReferenceString,
  parseNumberInRange
} from "../src/core/memory/types.js";

test("Segmentation UNIMI seed 0 translates the 5 exam addresses exactly", () => {
  const config = SEGMENTATION_UNIMI_SEED_0.segmentationConfig!;
  assert.ok(config);

  // VA 0: 523 -> SEG1, displacement -501, limit 450 -> violation
  const res0 = translateSegmentation(523, config);
  assert.equal(res0.status, "segmentation-violation");
  assert.equal(res0.pa, null);
  assert.equal(res0.displacement, -501);

  // VA 1: 414 -> SEG0, displacement 414, limit 472 -> PA 7304
  const res1 = translateSegmentation(414, config);
  assert.equal(res1.status, "valid");
  assert.equal(res1.pa, 7304);
  assert.equal(res1.displacement, 414);

  // VA 2: 802 -> SEG1, displacement -222, limit 450 -> PA 4470 (4692 - 222)
  const res2 = translateSegmentation(802, config);
  assert.equal(res2.status, "valid");
  assert.equal(res2.pa, 4470);
  assert.equal(res2.displacement, -222);

  // VA 3: 310 -> SEG0, displacement 310, limit 472 -> PA 7200
  const res3 = translateSegmentation(310, config);
  assert.equal(res3.status, "valid");
  assert.equal(res3.pa, 7200);
  assert.equal(res3.displacement, 310);

  // VA 4: 488 -> SEG0, displacement 488, limit 472 -> violation (488 >= 472)
  const res4 = translateSegmentation(488, config);
  assert.equal(res4.status, "segmentation-violation");
  assert.equal(res4.pa, null);
  assert.equal(res4.displacement, 488);
});

test("Linear Paging UNIMI seed 0 translates the 5 exam addresses exactly", () => {
  const config = PAGING_UNIMI_SEED_0.linearPagingConfig!;
  assert.ok(config);

  // VA 0: 12841 -> VPN 3, offset 553, PFN 6 -> PA 25129
  const res0 = translateLinearPaging(12841, config);
  assert.equal(res0.status, "valid");
  assert.equal(res0.pa, 25129);
  assert.equal(res0.extractedComponents.vpn, 3);
  assert.equal(res0.extractedComponents.offset, 553);

  // VA 1: 4969 -> VPN 1, offset 873 -> invalid
  const res1 = translateLinearPaging(4969, config);
  assert.equal(res1.status, "invalid-page");
  assert.equal(res1.pa, null);
  assert.equal(res1.extractedComponents.vpn, 1);
  assert.equal(res1.extractedComponents.offset, 873);

  // VA 2: 7808 -> VPN 1, offset 3712 -> invalid
  const res2 = translateLinearPaging(7808, config);
  assert.equal(res2.status, "invalid-page");
  assert.equal(res2.pa, null);
  assert.equal(res2.extractedComponents.vpn, 1);
  assert.equal(res2.extractedComponents.offset, 3712);

  // VA 3: 9558 -> VPN 2, offset 1366 -> invalid
  const res3 = translateLinearPaging(9558, config);
  assert.equal(res3.status, "invalid-page");
  assert.equal(res3.pa, null);
  assert.equal(res3.extractedComponents.vpn, 2);
  assert.equal(res3.extractedComponents.offset, 1366);

  // VA 4: 14878 -> VPN 3, offset 2590, PFN 6 -> PA 27166
  const res4 = translateLinearPaging(14878, config);
  assert.equal(res4.status, "valid");
  assert.equal(res4.pa, 27166);
  assert.equal(res4.extractedComponents.vpn, 3);
  assert.equal(res4.extractedComponents.offset, 2590);
});

test("Belàdy Anomaly is detected on reference string [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]", () => {
  const refString = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
  const sim3 = simulatePageReplacement({
    frameCount: 3,
    policy: "fifo",
    referenceString: refString
  });
  const sim4 = simulatePageReplacement({
    frameCount: 4,
    policy: "fifo",
    referenceString: refString
  });

  assert.equal(sim3.totalFaults, 9);
  assert.equal(sim4.totalFaults, 10);
  assert.ok(sim4.totalFaults > sim3.totalFaults);

  const check = detectBeladyAnomaly(refString);
  assert.equal(check.hasAnomaly, true);
  assert.equal(check.frames3Faults, 9);
  assert.equal(check.frames4Faults, 10);
});

test("Page replacement policies: OPT, LRU, Clock, and Modified Clock run correctly", () => {
  const ref = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

  // OPT should have fewer or equal faults compared to FIFO
  const optSim = simulatePageReplacement({
    frameCount: 3,
    policy: "opt",
    referenceString: ref
  });
  assert.ok(optSim.totalFaults <= 9);

  // LRU
  const lruSim = simulatePageReplacement({
    frameCount: 3,
    policy: "lru",
    referenceString: ref
  });
  assert.ok(lruSim.totalFaults > 0);

  // Clock
  const clockSim = simulatePageReplacement({
    frameCount: 3,
    policy: "clock",
    referenceString: ref
  });
  assert.ok(clockSim.totalFaults > 0);

  // Modified Clock
  const modClockSim = simulatePageReplacement({
    frameCount: 3,
    policy: "modified-clock",
    referenceString: ref,
    dirtyBits: { 2: true, 4: true }
  });
  assert.ok(modClockSim.totalFaults > 0);
});

test("Multi-Level Paging translates correctly and calculates byte savings", () => {
  const config = MULTILEVEL_SPARSE_SPACE.multiLevelPagingConfig!;
  assert.ok(config);

  // VA 0 -> PDIndex 0, PTIndex 0, offset 0 -> PFN 50 -> PA 50 * 4096 = 204800
  const res0 = translateMultiLevelPaging(0, config);
  assert.equal(res0.status, "valid");
  assert.equal(res0.pa, 50 * 4096);
  assert.ok((res0.savingsBytes ?? 0) > 0);

  // VA 4096 -> PDIndex 0, PTIndex 1, offset 0 -> PFN 51 -> PA 51 * 4096 = 208896
  const res4096 = translateMultiLevelPaging(4096, config);
  assert.equal(res4096.status, "valid");
  assert.equal(res4096.pa, 51 * 4096);

  // Unmapped address -> invalid page
  const resUnmapped = translateMultiLevelPaging(0x10000000, config);
  assert.equal(resUnmapped.status, "invalid-page");
  assert.equal(resUnmapped.pa, null);
});

test("TLB lookup, update, and translation work with ASID and LRU", () => {
  const pagingConfig = PAGING_UNIMI_SEED_0.linearPagingConfig!;
  const initialTlb = {
    capacity: 2,
    asidSupport: true,
    replacementPolicy: "lru" as const,
    entries: []
  };

  // First translation: MISS, falls back to Page Table, populates TLB
  const res1 = translateWithTlb(12841, 1, initialTlb, pagingConfig, 1);
  assert.equal(res1.status, "valid");
  assert.equal(res1.tlbHit, false);
  assert.equal(res1.updatedTlbConfig.entries.length, 1);
  const entry0 = res1.updatedTlbConfig.entries[0];
  assert.ok(entry0);
  assert.equal(entry0.vpn, 3);
  assert.equal(entry0.pfn, 6);

  // Second translation for same address: HIT!
  const res2 = translateWithTlb(12841, 1, res1.updatedTlbConfig, pagingConfig, 2);
  assert.equal(res2.status, "valid");
  assert.equal(res2.tlbHit, true);
  assert.equal(res2.pa, 25129);

  // Different ASID: MISS because ASID doesn't match
  const resDifferentAsid = translateWithTlb(12841, 2, res1.updatedTlbConfig, pagingConfig, 3);
  assert.equal(resDifferentAsid.tlbHit, false);
});

test("Boundary parsers validate address, numbers, and reference strings", () => {
  assert.deepEqual(parseAddressInput("12841"), { success: true, data: 12841 });
  assert.deepEqual(parseAddressInput("0x3229"), { success: true, data: 12841 });
  assert.equal(parseAddressInput("abc").success, false);
  assert.equal(parseAddressInput("").success, false);

  assert.deepEqual(parseReferenceString("1, 2, 3, 4"), { success: true, data: [1, 2, 3, 4] });
  assert.deepEqual(parseReferenceString("1 2 5 10"), { success: true, data: [1, 2, 5, 10] });
  assert.equal(parseReferenceString("1, -2, 3").success, false);

  assert.deepEqual(parseNumberInRange(10, 1, 32, "Bits"), { success: true, data: 10 });
  assert.equal(parseNumberInRange(50, 1, 32, "Bits").success, false);
});

test("TLB FIFO eviction evicts entries strictly in first-in first-out order at capacity", () => {
  const tlbConfig: import("../src/core/memory/types.js").TlbConfig = {
    capacity: 3,
    asidSupport: false,
    replacementPolicy: "fifo",
    entries: []
  };

  const u1 = updateTlb(tlbConfig, { vpn: 1, pfn: 100, valid: true, asid: 0, dirty: false }, 10);
  assert.equal(u1.nextConfig.entries.length, 1);
  assert.equal(u1.evictedEntry, undefined);

  const u2 = updateTlb(u1.nextConfig, { vpn: 2, pfn: 200, valid: true, asid: 0, dirty: false }, 20);
  assert.equal(u2.nextConfig.entries.length, 2);
  assert.equal(u2.evictedEntry, undefined);

  const u3 = updateTlb(u2.nextConfig, { vpn: 3, pfn: 300, valid: true, asid: 0, dirty: false }, 30);
  assert.equal(u3.nextConfig.entries.length, 3);
  assert.equal(u3.evictedEntry, undefined);

  // TLB hit on entry 1 at cycle 40 updates lastUsedCycle, but FIFO insertion order must remain 10
  const u1Hit = updateTlb(u3.nextConfig, { vpn: 1, pfn: 100, valid: true, asid: 0, dirty: false }, 40);
  assert.equal(u1Hit.nextConfig.entries.length, 3);
  assert.equal(u1Hit.evictedEntry, undefined);

  // Insert entry 4 at cycle 50: must evict entry 1 (earliest inserted)
  const u4 = updateTlb(u1Hit.nextConfig, { vpn: 4, pfn: 400, valid: true, asid: 0, dirty: false }, 50);
  assert.equal(u4.evictedEntry?.vpn, 1);
  assert.equal(u4.nextConfig.entries.some((e) => e.vpn === 1), false);
  assert.equal(u4.nextConfig.entries.some((e) => e.vpn === 4), true);

  // Insert entry 5 at cycle 60: must evict entry 2
  const u5 = updateTlb(u4.nextConfig, { vpn: 5, pfn: 500, valid: true, asid: 0, dirty: false }, 60);
  assert.equal(u5.evictedEntry?.vpn, 2);
  assert.equal(u5.nextConfig.entries.some((e) => e.vpn === 2), false);

  // Insert entry 6 at cycle 70: must evict entry 3
  const u6 = updateTlb(u5.nextConfig, { vpn: 6, pfn: 600, valid: true, asid: 0, dirty: false }, 70);
  assert.equal(u6.evictedEntry?.vpn, 3);
  assert.equal(u6.nextConfig.entries.some((e) => e.vpn === 3), false);
});

test("Modified Clock replacement stops Scan 2 immediately when (0, 1) is found without zeroing subsequent frames", () => {
  const sim = simulatePageReplacement({
    frameCount: 3,
    policy: "modified-clock",
    referenceString: [1, 2, 3, 4, 5],
    dirtyBits: { 2: true, 3: true }
  });

  const step4 = sim.steps[4];
  assert.ok(step4);
  assert.equal(step4.page, 5);
  assert.equal(step4.victim, 2);
  assert.equal(step4.useBits?.[4], true);
});
