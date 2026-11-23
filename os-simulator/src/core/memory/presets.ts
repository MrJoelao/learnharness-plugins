import type {
  SegmentationSystemConfig,
  LinearPagingConfig,
  MultiLevelPagingConfig,
  TlbConfig,
  PageReplacementConfig,
  MemoryLabSubsystem,
  MemoryLabPreset
} from "./types.js";

export type { MemoryLabPreset };

export const SEGMENTATION_UNIMI_SEED_0: MemoryLabPreset = {
  id: "segmentation-unimi-seed-0",
  name: "Segmentazione UNIMI (seed 0)",
  description: "Esercizio d'esame con crescita opposta: SEG0 positiva (Base 6890, Lim 472), SEG1 negativa (Base 4692, Lim 450).",
  subsystem: "segmentation",
  trace: [523, 414, 802, 310, 488],
  segmentationConfig: {
    addressSpaceBits: 10,
    segmentBits: 1,
    physicalMemorySize: 16384,
    segments: [
      {
        id: 0,
        name: "SEG0 (Codice/Heap)",
        base: 6890,
        limit: 472,
        growth: "positive",
        permissions: { read: true, write: true, execute: true }
      },
      {
        id: 1,
        name: "SEG1 (Stack)",
        base: 4692,
        limit: 450,
        growth: "negative",
        permissions: { read: true, write: true, execute: false }
      }
    ]
  }
};

export const PAGING_UNIMI_SEED_0: MemoryLabPreset = {
  id: "paging-unimi-seed-0",
  name: "Paging Lineare UNIMI (seed 0)",
  description: "Esercizio d'esame: spazio 16 KB (14 bit), pagine 4 KB (12 bit offset), memoria 64 KB. PT con MSB come VALID bit.",
  subsystem: "linear-paging",
  trace: [12841, 4969, 7808, 9558, 14878],
  linearPagingConfig: {
    addressSpaceBits: 14,
    pageSize: 4096,
    physicalMemorySize: 65536,
    pageTable: [
      { vpn: 0, valid: true, pfn: 12, rawEntry: 0x8000000c },
      { vpn: 1, valid: false, pfn: 0, rawEntry: 0x00000000 },
      { vpn: 2, valid: false, pfn: 0, rawEntry: 0x00000000 },
      { vpn: 3, valid: true, pfn: 6, rawEntry: 0x80000006 }
    ]
  }
};

export const MULTILEVEL_SPARSE_SPACE: MemoryLabPreset = {
  id: "multilevel-sparse-space",
  name: "Paging a 2 Livelli (Spazio Sparso)",
  description: "Spazio a 32 bit con PDE a 10 bit, PTE a 10 bit e pagine da 4 KB. Dimostra il risparmio di frame non allocati.",
  subsystem: "multi-level",
  trace: [0, 4096, 0x00400000, 0xfffff000],
  multiLevelPagingConfig: {
    addressSpaceBits: 32,
    pageSize: 4096,
    pdeBits: 10,
    pteBits: 10,
    pageDirectory: [
      {
        pdIndex: 0,
        valid: true,
        ptPfn: 100,
        table: [
          { ptIndex: 0, valid: true, pfn: 50 },
          { ptIndex: 1, valid: true, pfn: 51 }
        ]
      },
      {
        pdIndex: 1023,
        valid: true,
        ptPfn: 200,
        table: [
          { ptIndex: 1023, valid: true, pfn: 88 }
        ]
      }
    ]
  }
};

export const TLB_CACHED_TRANSLATION: MemoryLabPreset = {
  id: "tlb-cached-translation",
  name: "TLB con Supporto ASID",
  description: "Traduzione assistita da TLB a 4 voci con ASID, hit detection e fallback su Page Table.",
  subsystem: "tlb",
  trace: [4096, 12841, 4096, 14878, 8192],
  linearPagingConfig: {
    addressSpaceBits: 14,
    pageSize: 4096,
    physicalMemorySize: 65536,
    pageTable: [
      { vpn: 0, valid: true, pfn: 12, rawEntry: 0x8000000c },
      { vpn: 1, valid: true, pfn: 15, rawEntry: 0x8000000f },
      { vpn: 2, valid: true, pfn: 22, rawEntry: 0x80000016 },
      { vpn: 3, valid: true, pfn: 6, rawEntry: 0x80000006 }
    ]
  },
  tlbConfig: {
    capacity: 4,
    asidSupport: true,
    replacementPolicy: "lru",
    entries: [
      { vpn: 1, pfn: 15, valid: true, asid: 1, dirty: false, lastUsedCycle: 1 }
    ]
  }
};

export const BELADY_ANOMALY_PRESET: MemoryLabPreset = {
  id: "belady-anomaly-reference",
  name: "Anomalia di Belàdy Reference",
  description: "Traccia classica che dimostra come con FIFO 4 frame generino più page fault (10) rispetto a 3 frame (9).",
  subsystem: "replacement",
  trace: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
  replacementConfig: {
    frameCount: 3,
    policy: "fifo",
    referenceString: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]
  },
  comparisonConfig: {
    secondaryFrameCount: 4,
    expectedFrames3Faults: 9,
    expectedFrames4Faults: 10
  }
};

export const MEMORY_PRESETS: MemoryLabPreset[] = [
  SEGMENTATION_UNIMI_SEED_0,
  PAGING_UNIMI_SEED_0,
  MULTILEVEL_SPARSE_SPACE,
  TLB_CACHED_TRANSLATION,
  BELADY_ANOMALY_PRESET
];
