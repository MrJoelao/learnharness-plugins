export type Bit = 0 | 1;
export type HexString = `0x${string}`;

export interface AddressSplit {
  raw: number;
  hex: string;
  binary: string;
  components: Record<string, { bits: number; value: number; binary: string }>;
}

export interface SimulationStepLog {
  stepIndex: number;
  timestamp: string;
  title: string;
  description: string;
  formulaApplied?: string;
  status: "ok" | "violation" | "fault" | "hit" | "miss" | "blocked" | "deadlock";
}

export interface BoundaryParser<T> {
  parse(raw: unknown): { success: true; data: T } | { success: false; error: string };
}

export function isBit(val: unknown): val is Bit {
  return val === 0 || val === 1;
}

export function isHexString(val: unknown): val is HexString {
  return typeof val === "string" && /^0x[0-9a-fA-F]+$/.test(val);
}

export const bitParser: BoundaryParser<Bit> = {
  parse(raw: unknown) {
    if (isBit(raw)) {
      return { success: true, data: raw };
    }
    return { success: false, error: "Invalid bit: expected 0 or 1" };
  }
};

export const hexStringParser: BoundaryParser<HexString> = {
  parse(raw: unknown) {
    if (isHexString(raw)) {
      return { success: true, data: raw };
    }
    return { success: false, error: "Invalid hex string: expected 0x followed by hex digits" };
  }
};
