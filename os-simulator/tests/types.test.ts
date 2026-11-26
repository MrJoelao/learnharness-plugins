import assert from "node:assert/strict";
import { it } from "node:test";
import {
  bitParser,
  hexStringParser,
  isBit,
  isHexString,
  type AddressSplit,
  type SimulationStepLog
} from "../src/types/common.ts";

it("isBit identifies valid bit values", () => {
  assert.equal(isBit(0), true);
  assert.equal(isBit(1), true);
  assert.equal(isBit(2), false);
  assert.equal(isBit(-1), false);
  assert.equal(isBit("0"), false);
});

it("isHexString identifies valid hex strings", () => {
  assert.equal(isHexString("0x0"), true);
  assert.equal(isHexString("0x1a2b"), true);
  assert.equal(isHexString("0xDEADBEEF"), true);
  assert.equal(isHexString("123"), false);
  assert.equal(isHexString("0x"), false);
});

it("bitParser validates boundaries for Bit", () => {
  assert.deepEqual(bitParser.parse(0), { success: true, data: 0 });
  assert.deepEqual(bitParser.parse(1), { success: true, data: 1 });
  assert.equal(bitParser.parse(2).success, false);
  assert.equal(bitParser.parse("1").success, false);
});

it("hexStringParser validates boundaries for HexString", () => {
  assert.deepEqual(hexStringParser.parse("0x1000"), { success: true, data: "0x1000" });
  assert.equal(hexStringParser.parse("1000").success, false);
  assert.equal(hexStringParser.parse(1000).success, false);
});

it("AddressSplit conforms to expected shape", () => {
  const split: AddressSplit = {
    raw: 42,
    hex: "0x2a",
    binary: "00101010",
    components: {
      vpn: { bits: 4, value: 2, binary: "0010" },
      offset: { bits: 4, value: 10, binary: "1010" }
    }
  };
  assert.equal(split.raw, 42);
  assert.equal(split.components["vpn"]?.value, 2);
});

it("SimulationStepLog conforms to expected status union", () => {
  const log: SimulationStepLog = {
    stepIndex: 0,
    timestamp: new Date().toISOString(),
    title: "Address Translation",
    description: "Translated virtual address 0x1000",
    status: "ok"
  };
  assert.equal(log.status, "ok");
});
