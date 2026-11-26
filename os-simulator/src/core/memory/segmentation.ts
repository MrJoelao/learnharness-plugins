import type { SegmentationSystemConfig, TranslationResult } from "./types.js";

export function translateSegmentation(
  va: number,
  config: SegmentationSystemConfig
): TranslationResult {
  const offsetBits = config.addressSpaceBits - config.segmentBits;
  const windowSize = 1 << offsetBits;
  const segmentId = va >> offsetBits;
  const rawOffset = va & (windowSize - 1);
  const segment = config.segments.find((s) => s.id === segmentId);

  const vaHex = "0x" + va.toString(16).padStart(Math.ceil(config.addressSpaceBits / 4), "0");
  const vaBin = va.toString(2).padStart(config.addressSpaceBits, "0");

  if (!segment) {
    return {
      va,
      pa: null,
      status: "segmentation-violation",
      extractedComponents: { segmentId, rawOffset },
      stepExplanations: [
        `Indirizzo virtuale VA = ${va} (${vaHex}, binario: ${vaBin}).`,
        `Spazio virtuale: ${config.addressSpaceBits} bit (${1 << config.addressSpaceBits} byte). Segment selector: ${config.segmentBits} bit, Offset: ${offsetBits} bit (finestra = ${windowSize} B).`,
        `Segment ID = ${segmentId}, Offset grezzo o = ${rawOffset}.`,
        `ERRORE: Segmento ${segmentId} inesistente nella configurazione.`,
        `Risultato: SEGMENTATION VIOLATION.`
      ]
    };
  }

  const segName = segment.name || `SEG${segment.id}`;
  let displacement = 0;
  let isValid = false;
  const explanations: string[] = [
    `Indirizzo virtuale VA = ${va} (${vaHex}, binario: ${vaBin}).`,
    `Spazio virtuale: ${config.addressSpaceBits} bit (${1 << config.addressSpaceBits} byte). Segment selector: ${config.segmentBits} bit, Offset: ${offsetBits} bit (dimensione finestra = ${windowSize} B).`,
    `Estrazione bit: Segment ID = ${segmentId} (${segName}), Offset grezzo o = ${rawOffset} (0x${rawOffset.toString(16)}).`
  ];

  if (segment.growth === "positive") {
    displacement = rawOffset;
    isValid = displacement >= 0 && displacement < segment.limit;

    explanations.push(
      `Direzione di crescita: POSITIVA.`,
      `Formula spostamento: d = o = ${displacement}.`,
      `Condizione di validità: 0 <= d < Limit (${segment.limit}).`,
      `Verifica: 0 <= ${displacement} < ${segment.limit} -> ${isValid ? "VERA (accesso valido)" : "FALSA (violazione di limite)"}.`
    );
  } else {
    displacement = rawOffset - windowSize;
    isValid = displacement >= -segment.limit && displacement < 0;

    explanations.push(
      `Direzione di crescita: NEGATIVA (es. Stack).`,
      `Formula spostamento: d = o - finestra = ${rawOffset} - ${windowSize} = ${displacement}.`,
      `Condizione di validità: -Limit (-${segment.limit}) <= d < 0.`,
      `Verifica: -${segment.limit} <= ${displacement} < 0 -> ${isValid ? "VERA (accesso valido)" : "FALSA (violazione di limite)"}.`
    );
  }

  if (!isValid) {
    explanations.push(`Risultato: SEGMENTATION VIOLATION (${segName}).`);
    return {
      va,
      pa: null,
      status: "segmentation-violation",
      displacement,
      extractedComponents: {
        segmentId,
        rawOffset,
        displacement,
        base: segment.base,
        limit: segment.limit
      },
      stepExplanations: explanations
    };
  }

  const pa = segment.base + displacement;
  const paHex = "0x" + pa.toString(16).padStart(4, "0");

  explanations.push(
    `Calcolo indirizzo fisico: PA = Base (${segment.base}) + d (${displacement}) = ${pa} (${paHex}).`,
    `Risultato: ACCESSO VALIDO -> PA = ${pa} (${paHex}).`
  );

  return {
    va,
    pa,
    status: "valid",
    displacement,
    extractedComponents: {
      segmentId,
      rawOffset,
      displacement,
      base: segment.base,
      limit: segment.limit
    },
    stepExplanations: explanations
  };
}
