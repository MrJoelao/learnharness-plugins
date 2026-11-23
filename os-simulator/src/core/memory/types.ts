import type { BoundaryParser } from "../../types/common.js";
import type { SavedExercise } from "../../types/ai.js";

export type GrowthDirection = "positive" | "negative";

export interface SegmentConfig {
  id: number;
  name: string;
  base: number;
  limit: number;
  growth: GrowthDirection;
  permissions?: { read: boolean; write: boolean; execute: boolean };
}

export interface SegmentationSystemConfig {
  addressSpaceBits: number;
  segmentBits: number;
  physicalMemorySize: number;
  segments: SegmentConfig[];
}

export interface LinearPageTableEntry {
  vpn: number;
  valid: boolean;
  pfn: number;
  dirty?: boolean;
  accessed?: boolean;
  rawEntry?: number;
}

export interface LinearPagingConfig {
  addressSpaceBits: number;
  pageSize: number;
  physicalMemorySize: number;
  pageTable: LinearPageTableEntry[];
}

export interface PageTableEntry {
  ptIndex: number;
  valid: boolean;
  pfn: number;
  dirty?: boolean;
  accessed?: boolean;
}

export interface PageDirectoryEntry {
  pdIndex: number;
  valid: boolean;
  ptPfn: number;
  table?: PageTableEntry[];
}

export interface MultiLevelPagingConfig {
  addressSpaceBits: number;
  pageSize: number;
  pdeBits: number;
  pteBits: number;
  pageDirectory: PageDirectoryEntry[];
}

export interface TlbEntry {
  vpn: number;
  pfn: number;
  valid: boolean;
  asid: number;
  dirty: boolean;
  lastUsedCycle: number;
  insertedCycle?: number;
}

export interface TlbConfig {
  capacity: number;
  entries: TlbEntry[];
  asidSupport: boolean;
  replacementPolicy: "lru" | "fifo";
}

export type PageReplacementPolicy = "fifo" | "opt" | "lru" | "clock" | "modified-clock";

export interface PageReplacementConfig {
  frameCount: number;
  policy: PageReplacementPolicy;
  referenceString: number[];
  dirtyBits?: Record<number, boolean>;
}

export type TranslationStatus =
  | "valid"
  | "segmentation-violation"
  | "invalid-page"
  | "tlb-hit"
  | "tlb-miss"
  | "page-fault";

export interface TranslationResult {
  va: number;
  pa: number | null;
  status: TranslationStatus;
  displacement?: number;
  extractedComponents: Record<string, number>;
  stepExplanations: string[];
  savingsBytes?: number;
}

export interface PageReplacementStep {
  stepIndex: number;
  page: number;
  hit: boolean;
  fault: boolean;
  frames: (number | null)[];
  victim: number | null;
  clockHand?: number;
  useBits?: Record<number, boolean>;
  dirtyBits?: Record<number, boolean>;
  explanation: string;
}

export interface PageReplacementSimulationResult {
  steps: PageReplacementStep[];
  totalFaults: number;
  totalHits: number;
  faultRate: number;
  hitRate: number;
  beladyAnomalyDetected?: boolean;
  beladyComparison?: {
    frames3Faults: number;
    frames4Faults: number;
    hasAnomaly: boolean;
  };
}

export type MemoryLabSubsystem = "segmentation" | "linear-paging" | "multi-level" | "tlb" | "replacement";

export interface MemoryLabState {
  workspaceId: string;
  subsystem: MemoryLabSubsystem;
  currentVa: number;
  vaInputString: string;
  segmentationConfig: SegmentationSystemConfig;
  linearPagingConfig: LinearPagingConfig;
  multiLevelPagingConfig: MultiLevelPagingConfig;
  tlbConfig: TlbConfig;
  replacementConfig: PageReplacementConfig;
  trace: number[];
  currentTraceIndex: number;
  activePresetId: string | null;
  exerciseHistory?: SavedExercise[];
  activeExerciseId?: string | null;
  lastUpdated: string;
}

export interface BoundaryValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function parseNumberInRange(val: unknown, min: number, max: number, name: string): BoundaryValidationResult<number> {
  const num = typeof val === "number" ? val : (typeof val === "string" && val.trim() !== "" ? Number(val) : NaN);
  if (Number.isNaN(num) || !Number.isInteger(num)) {
    return { success: false, error: `${name} must be a valid integer.` };
  }
  if (num < min || num > max) {
    return { success: false, error: `${name} must be between ${min} and ${max}.` };
  }
  return { success: true, data: num };
}

export function parseAddressInput(raw: string): BoundaryValidationResult<number> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { success: false, error: "Address cannot be empty." };
  }
  let parsed: number;
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    parsed = parseInt(trimmed, 16);
  } else {
    parsed = parseInt(trimmed, 10);
  }
  if (Number.isNaN(parsed) || parsed < 0) {
    return { success: false, error: `Invalid address: "${raw}". Must be a non-negative integer or hex string.` };
  }
  return { success: true, data: parsed };
}

export function parseReferenceString(raw: string): BoundaryValidationResult<number[]> {
  const parts = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { success: false, error: "Reference string cannot be empty." };
  }
  const result: number[] = [];
  for (const part of parts) {
    const num = Number(part);
    if (Number.isNaN(num) || !Number.isInteger(num) || num < 0) {
      return { success: false, error: `Invalid page reference: "${part}". Must be non-negative integer.` };
    }
    result.push(num);
  }
  return { success: true, data: result };
}

export interface MemoryLabPreset {
  id: string;
  name: string;
  description: string;
  subsystem: MemoryLabSubsystem;
  trace: number[];
  segmentationConfig?: SegmentationSystemConfig;
  linearPagingConfig?: LinearPagingConfig;
  multiLevelPagingConfig?: MultiLevelPagingConfig;
  tlbConfig?: TlbConfig;
  replacementConfig?: PageReplacementConfig;
  comparisonConfig?: {
    secondaryFrameCount?: number;
    expectedFrames3Faults?: number;
    expectedFrames4Faults?: number;
  };
}

export const memoryPresetBoundaryParser: BoundaryParser<MemoryLabPreset> = {
  parse(raw: unknown) {
    if (typeof raw !== "object" || raw === null) {
      return { success: false, error: "Preset must be a non-null object." };
    }
    const rec = raw as Record<string, unknown>;
    const id = rec.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      return { success: false, error: "Preset must have a non-empty string 'id'." };
    }
    const name = rec.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      return { success: false, error: "Preset must have a non-empty string 'name'." };
    }
    const description = typeof rec.description === "string" ? rec.description : "";
    const validSubsystems: MemoryLabSubsystem[] = ["segmentation", "linear-paging", "multi-level", "tlb", "replacement"];
    const subsystem = rec.subsystem as MemoryLabSubsystem;
    if (!validSubsystems.includes(subsystem)) {
      return { success: false, error: `Invalid subsystem: '${String(rec.subsystem)}'. Must be one of: ${validSubsystems.join(", ")}.` };
    }
    if (!Array.isArray(rec.trace)) {
      return { success: false, error: "Preset 'trace' must be an array of numbers." };
    }
    const trace: number[] = [];
    for (let i = 0; i < rec.trace.length; i++) {
      const val = rec.trace[i];
      if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
        return { success: false, error: `Trace item at index ${i} is not a valid non-negative integer: ${String(val)}.` };
      }
      trace.push(val);
    }

    const preset: MemoryLabPreset = {
      id: id.trim(),
      name: name.trim(),
      description,
      subsystem,
      trace
    };

    if (rec.segmentationConfig !== undefined) {
      if (typeof rec.segmentationConfig !== "object" || rec.segmentationConfig === null) {
        return { success: false, error: "segmentationConfig must be an object." };
      }
      const sc = rec.segmentationConfig as Record<string, unknown>;
      if (typeof sc.addressSpaceBits !== "number" || sc.addressSpaceBits < 1) {
        return { success: false, error: "segmentationConfig.addressSpaceBits must be an integer >= 1." };
      }
      if (typeof sc.segmentBits !== "number" || sc.segmentBits < 1) {
        return { success: false, error: "segmentationConfig.segmentBits must be an integer >= 1." };
      }
      if (typeof sc.physicalMemorySize !== "number" || sc.physicalMemorySize < 1) {
        return { success: false, error: "segmentationConfig.physicalMemorySize must be an integer >= 1." };
      }
      if (!Array.isArray(sc.segments)) {
        return { success: false, error: "segmentationConfig.segments must be an array." };
      }
      preset.segmentationConfig = {
        addressSpaceBits: sc.addressSpaceBits,
        segmentBits: sc.segmentBits,
        physicalMemorySize: sc.physicalMemorySize,
        segments: sc.segments as SegmentConfig[]
      };
    }

    if (rec.linearPagingConfig !== undefined) {
      if (typeof rec.linearPagingConfig !== "object" || rec.linearPagingConfig === null) {
        return { success: false, error: "linearPagingConfig must be an object." };
      }
      const pc = rec.linearPagingConfig as Record<string, unknown>;
      if (typeof pc.addressSpaceBits !== "number" || pc.addressSpaceBits < 1) {
        return { success: false, error: "linearPagingConfig.addressSpaceBits must be an integer >= 1." };
      }
      if (typeof pc.pageSize !== "number" || pc.pageSize < 1) {
        return { success: false, error: "linearPagingConfig.pageSize must be an integer >= 1." };
      }
      if (typeof pc.physicalMemorySize !== "number" || pc.physicalMemorySize < 1) {
        return { success: false, error: "linearPagingConfig.physicalMemorySize must be an integer >= 1." };
      }
      if (!Array.isArray(pc.pageTable)) {
        return { success: false, error: "linearPagingConfig.pageTable must be an array." };
      }
      preset.linearPagingConfig = {
        addressSpaceBits: pc.addressSpaceBits,
        pageSize: pc.pageSize,
        physicalMemorySize: pc.physicalMemorySize,
        pageTable: pc.pageTable as LinearPageTableEntry[]
      };
    }

    if (rec.replacementConfig !== undefined) {
      if (typeof rec.replacementConfig !== "object" || rec.replacementConfig === null) {
        return { success: false, error: "replacementConfig must be an object." };
      }
      const rc = rec.replacementConfig as Record<string, unknown>;
      if (typeof rc.frameCount !== "number" || rc.frameCount < 1) {
        return { success: false, error: "replacementConfig.frameCount must be an integer >= 1." };
      }
      const validPolicies = ["fifo", "opt", "lru", "clock", "modified-clock"];
      if (typeof rc.policy !== "string" || !validPolicies.includes(rc.policy)) {
        return { success: false, error: `Invalid replacement policy: ${String(rc.policy)}.` };
      }
      if (!Array.isArray(rc.referenceString)) {
        return { success: false, error: "replacementConfig.referenceString must be an array." };
      }
      preset.replacementConfig = {
        frameCount: rc.frameCount,
        policy: rc.policy as PageReplacementConfig["policy"],
        referenceString: rc.referenceString as number[]
      };
    }

    if (rec.comparisonConfig !== undefined && typeof rec.comparisonConfig === "object" && rec.comparisonConfig !== null) {
      preset.comparisonConfig = rec.comparisonConfig as MemoryLabPreset["comparisonConfig"];
    }

    if (rec.multiLevelPagingConfig !== undefined && typeof rec.multiLevelPagingConfig === "object" && rec.multiLevelPagingConfig !== null) {
      preset.multiLevelPagingConfig = rec.multiLevelPagingConfig as MultiLevelPagingConfig;
    }

    if (rec.tlbConfig !== undefined && typeof rec.tlbConfig === "object" && rec.tlbConfig !== null) {
      preset.tlbConfig = rec.tlbConfig as TlbConfig;
    }

    return { success: true, data: preset };
  }
};

export function parseMemoryPreset(raw: unknown) {
  return memoryPresetBoundaryParser.parse(raw);
}
