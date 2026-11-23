import type {
  LinearPagingConfig,
  MultiLevelPagingConfig,
  TranslationResult
} from "./types.js";

export function translateLinearPaging(
  va: number,
  config: LinearPagingConfig
): TranslationResult {
  const offsetBits = Math.round(Math.log2(config.pageSize));
  const vpnBits = config.addressSpaceBits - offsetBits;
  const vpn = Math.floor(va / config.pageSize);
  const offset = va % config.pageSize;

  const vaHex = "0x" + va.toString(16).padStart(Math.ceil(config.addressSpaceBits / 4), "0");
  const vaBin = va.toString(2).padStart(config.addressSpaceBits, "0");

  const entry = config.pageTable.find((e) => e.vpn === vpn) ?? config.pageTable[vpn];

  let isValid = false;
  let pfn = 0;
  let rawHexStr = "0x00000000";

  if (entry) {
    if (entry.rawEntry !== undefined) {
      const raw = entry.rawEntry >>> 0;
      rawHexStr = "0x" + raw.toString(16).padStart(8, "0");
      isValid = (raw >>> 31) === 1;
      pfn = raw & 0x7fffffff;
    } else {
      isValid = entry.valid;
      pfn = entry.pfn;
      rawHexStr = isValid ? `0x8000000${pfn.toString(16)}` : "0x00000000";
    }
  }

  const explanations: string[] = [
    `Indirizzo virtuale VA = ${va} (${vaHex}, binario: ${vaBin}).`,
    `Spazio virtuale: ${config.addressSpaceBits} bit (${1 << config.addressSpaceBits} B), Dimensione pagina: ${config.pageSize} B (${offsetBits} bit offset).`,
    `Scomposizione: VPN a ${vpnBits} bit, Offset a ${offsetBits} bit.`,
    `Calcolo: VPN = floor(${va} / ${config.pageSize}) = ${vpn} (0x${vpn.toString(16)}), Offset = ${va} mod ${config.pageSize} = ${offset} (0x${offset.toString(16)}).`,
    `Consultazione Page Table all'indice VPN ${vpn}: Voce = ${rawHexStr}.`
  ];

  if (!entry || !isValid) {
    explanations.push(
      `Bit VALID = 0 -> Pagina non valida o non presente in memoria fisica.`,
      `Risultato: INVALID PAGE (Page Fault). Nessun indirizzo fisico valido.`
    );
    return {
      va,
      pa: null,
      status: "invalid-page",
      extractedComponents: { vpn, offset },
      stepExplanations: explanations
    };
  }

  const frameBase = pfn * config.pageSize;
  const pa = frameBase + offset;
  const paHex = "0x" + pa.toString(16).padStart(Math.ceil(Math.log2(config.physicalMemorySize) / 4), "0");

  explanations.push(
    `Bit VALID = 1 -> Voce valida. PFN estratto = ${pfn} (0x${pfn.toString(16)}).`,
    `Inizio del frame fisico: PFN * PageSize = ${pfn} * ${config.pageSize} = ${frameBase} (0x${frameBase.toString(16)}).`,
    `Indirizzo fisico finale: PA = FrameBase (${frameBase}) + Offset (${offset}) = ${pa} (${paHex}).`,
    `Risultato: ACCESSO VALIDO -> PA = ${pa} (${paHex}).`
  );

  return {
    va,
    pa,
    status: "valid",
    extractedComponents: { vpn, offset, pfn, frameBase },
    stepExplanations: explanations
  };
}

export function translateMultiLevelPaging(
  va: number,
  config: MultiLevelPagingConfig
): TranslationResult {
  const offsetBits = Math.round(Math.log2(config.pageSize));
  const offsetMask = (1 << offsetBits) - 1;
  const ptMask = (1 << config.pteBits) - 1;
  const pdMask = (1 << config.pdeBits) - 1;

  const offset = va & offsetMask;
  const ptIndex = (Math.floor(va / config.pageSize)) & ptMask;
  const pdIndex = (Math.floor(va / (config.pageSize * (1 << config.pteBits)))) & pdMask;

  const vaHex = "0x" + (va >>> 0).toString(16).padStart(Math.ceil(config.addressSpaceBits / 4), "0");

  const pde = config.pageDirectory.find((d) => d.pdIndex === pdIndex);

  const totalVpns = Math.pow(2, config.addressSpaceBits - offsetBits);
  const linearBytes = totalVpns * 4;
  const allocatedPtCount = config.pageDirectory.filter((d) => d.valid && d.table && d.table.length > 0).length;
  const multiLevelBytes = ((1 << config.pdeBits) * 4) + (allocatedPtCount * (1 << config.pteBits) * 4);
  const savingsBytes = Math.max(0, linearBytes - multiLevelBytes);

  const explanations: string[] = [
    `Indirizzo virtuale VA = ${va} (${vaHex}).`,
    `Scomposizione a 2 livelli: PD Index (${config.pdeBits} bit), PT Index (${config.pteBits} bit), Offset (${offsetBits} bit).`,
    `Valori estratti: PDIndex = ${pdIndex} (0x${pdIndex.toString(16)}), PTIndex = ${ptIndex} (0x${ptIndex.toString(16)}), Offset = ${offset} (0x${offset.toString(16)}).`,
    `Livello 1: Ricerca nella Page Directory al PDIndex ${pdIndex}.`
  ];

  if (!pde || !pde.valid) {
    explanations.push(
      `PDE non presente o con VALID = 0.`,
      `Intera tabella di secondo livello non allocata.`,
      `Risultato: INVALID PAGE (Page Fault al livello Page Directory).`
    );
    return {
      va,
      pa: null,
      status: "invalid-page",
      extractedComponents: { pdIndex, ptIndex, offset },
      stepExplanations: explanations,
      savingsBytes
    };
  }

  explanations.push(
    `PDE valida: Page Table allocata al PFN ${pde.ptPfn}.`,
    `Livello 2: Ricerca nella Page Table all'indice PTIndex ${ptIndex}.`
  );

  const pte = pde.table?.find((t) => t.ptIndex === ptIndex);
  if (!pte || !pte.valid) {
    explanations.push(
      `PTE non presente o con VALID = 0.`,
      `Risultato: INVALID PAGE (Page Fault al livello Page Table).`
    );
    return {
      va,
      pa: null,
      status: "invalid-page",
      extractedComponents: { pdIndex, ptIndex, offset, ptPfn: pde.ptPfn },
      stepExplanations: explanations,
      savingsBytes
    };
  }

  const frameBase = pte.pfn * config.pageSize;
  const pa = frameBase + offset;
  const paHex = "0x" + pa.toString(16);

  explanations.push(
    `PTE valida: Frame fisico PFN = ${pte.pfn} (0x${pte.pfn.toString(16)}).`,
    `Calcolo PA: PFN * PageSize + Offset = ${pte.pfn} * ${config.pageSize} + ${offset} = ${pa} (${paHex}).`,
    `Risparmio di memoria della tabella a 2 livelli: ${savingsBytes.toLocaleString()} byte risparmiati rispetto alla tabella lineare.`
  );

  return {
    va,
    pa,
    status: "valid",
    extractedComponents: { pdIndex, ptIndex, offset, ptPfn: pde.ptPfn, pfn: pte.pfn, frameBase },
    stepExplanations: explanations,
    savingsBytes
  };
}
