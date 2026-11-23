import type {
  TlbConfig,
  TlbEntry,
  LinearPagingConfig,
  TranslationResult
} from "./types.js";
import { translateLinearPaging } from "./paging.js";

export function lookupTlb(
  vpn: number,
  asid: number,
  config: TlbConfig
): { hit: boolean; entry?: TlbEntry } {
  const entry = config.entries.find((e) => {
    if (!e.valid) return false;
    if (e.vpn !== vpn) return false;
    if (config.asidSupport && e.asid !== asid) return false;
    return true;
  });

  return {
    hit: Boolean(entry),
    entry
  };
}

export function updateTlb(
  config: TlbConfig,
  entryData: Omit<TlbEntry, "lastUsedCycle">,
  currentCycle: number
): { nextConfig: TlbConfig; evictedEntry?: TlbEntry } {
  const newEntry: TlbEntry = {
    ...entryData,
    lastUsedCycle: currentCycle,
    insertedCycle: entryData.insertedCycle ?? currentCycle
  };
  const entries = [...config.entries];

  const existingIndex = entries.findIndex((e) => {
    if (!e.valid) return false;
    if (e.vpn !== entryData.vpn) return false;
    if (config.asidSupport && e.asid !== entryData.asid) return false;
    return true;
  });

  if (existingIndex !== -1) {
    const existing = entries[existingIndex];
    entries[existingIndex] = {
      ...newEntry,
      insertedCycle: existing?.insertedCycle ?? currentCycle
    };
    return { nextConfig: { ...config, entries } };
  }

  if (entries.length < config.capacity) {
    entries.push(newEntry);
    return { nextConfig: { ...config, entries } };
  }

  const invalidIndex = entries.findIndex((e) => !e.valid);
  if (invalidIndex !== -1) {
    entries[invalidIndex] = newEntry;
    return { nextConfig: { ...config, entries } };
  }

  let victimIndex = 0;
  if (config.replacementPolicy === "lru") {
    let oldestCycle = Infinity;
    entries.forEach((e, idx) => {
      if (e.lastUsedCycle < oldestCycle) {
        oldestCycle = e.lastUsedCycle;
        victimIndex = idx;
      }
    });
  } else {
    let earliestCycle = Infinity;
    entries.forEach((e, idx) => {
      const cycle = e.insertedCycle ?? e.lastUsedCycle ?? idx;
      if (cycle < earliestCycle) {
        earliestCycle = cycle;
        victimIndex = idx;
      }
    });
  }

  const evictedEntry = entries[victimIndex];
  entries[victimIndex] = newEntry;

  return {
    nextConfig: { ...config, entries },
    evictedEntry
  };
}

export function translateWithTlb(
  va: number,
  asid: number,
  tlbConfig: TlbConfig,
  pagingConfig: LinearPagingConfig,
  currentCycle: number
): TranslationResult & { tlbHit: boolean; updatedTlbConfig: TlbConfig } {
  const vpn = Math.floor(va / pagingConfig.pageSize);
  const offset = va % pagingConfig.pageSize;
  const tlbCheck = lookupTlb(vpn, asid, tlbConfig);

  if (tlbCheck.hit && tlbCheck.entry) {
    const pfn = tlbCheck.entry.pfn;
    const pa = pfn * pagingConfig.pageSize + offset;
    const paHex = "0x" + pa.toString(16);

    const updatedEntries = tlbConfig.entries.map((e) =>
      e === tlbCheck.entry ? { ...e, lastUsedCycle: currentCycle } : e
    );
    const updatedTlbConfig = { ...tlbConfig, entries: updatedEntries };

    return {
      va,
      pa,
      status: "valid",
      tlbHit: true,
      updatedTlbConfig,
      extractedComponents: { vpn, offset, pfn },
      stepExplanations: [
        `Traduzione indirizzo VA = ${va} con TLB (${tlbConfig.asidSupport ? `ASID ${asid}` : "no ASID"}).`,
        `Estrazione VPN = ${vpn}, Offset = ${offset}.`,
        `Ricerca nel TLB: HIT! Voce trovata con VPN = ${vpn} -> PFN = ${pfn}.`,
        `Accesso diretto al frame fisico senza consultare la Page Table in memoria!`,
        `Indirizzo fisico PA = ${pfn} * ${pagingConfig.pageSize} + ${offset} = ${pa} (${paHex}).`
      ]
    };
  }

  const pageTableResult = translateLinearPaging(va, pagingConfig);
  let updatedTlbConfig = tlbConfig;

  if (pageTableResult.status === "valid" && pageTableResult.extractedComponents.pfn !== undefined) {
    const pfn = pageTableResult.extractedComponents.pfn;
    const updateResult = updateTlb(
      tlbConfig,
      {
        vpn,
        pfn,
        valid: true,
        asid: tlbConfig.asidSupport ? asid : 0,
        dirty: false
      },
      currentCycle
    );
    updatedTlbConfig = updateResult.nextConfig;

    const explanations = [
      `Traduzione indirizzo VA = ${va} con TLB.`,
      `Estrazione VPN = ${vpn}, Offset = ${offset}.`,
      `Ricerca nel TLB: MISS (nessuna voce valida corrisponde a VPN ${vpn}).`,
      `Consultazione della Page Table in memoria:`,
      ...pageTableResult.stepExplanations.map((line) => `  ${line}`),
      `Aggiornamento TLB: inserita mappatura VPN ${vpn} -> PFN ${pfn}${updateResult.evictedEntry ? ` (sfrattata voce VPN ${updateResult.evictedEntry.vpn})` : ""}.`
    ];

    return {
      ...pageTableResult,
      tlbHit: false,
      updatedTlbConfig,
      stepExplanations: explanations
    };
  }

  return {
    ...pageTableResult,
    tlbHit: false,
    updatedTlbConfig,
    stepExplanations: [
      `Traduzione indirizzo VA = ${va} con TLB.`,
      `Ricerca nel TLB: MISS.`,
      ...pageTableResult.stepExplanations
    ]
  };
}
