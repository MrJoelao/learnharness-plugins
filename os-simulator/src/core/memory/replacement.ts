import type {
  PageReplacementConfig,
  PageReplacementSimulationResult,
  PageReplacementStep
} from "./types.js";

export function detectBeladyAnomaly(
  referenceString: number[]
): { frames3Faults: number; frames4Faults: number; hasAnomaly: boolean } {
  const res3 = simulatePageReplacement(
    {
      frameCount: 3,
      policy: "fifo",
      referenceString
    },
    true
  );
  const res4 = simulatePageReplacement(
    {
      frameCount: 4,
      policy: "fifo",
      referenceString
    },
    true
  );

  return {
    frames3Faults: res3.totalFaults,
    frames4Faults: res4.totalFaults,
    hasAnomaly: res4.totalFaults > res3.totalFaults
  };
}

export function simulatePageReplacement(
  config: PageReplacementConfig,
  skipBeladyCheck = false
): PageReplacementSimulationResult {
  const { frameCount, policy, referenceString } = config;
  if (frameCount <= 0 || referenceString.length === 0) {
    return {
      steps: [],
      totalFaults: 0,
      totalHits: 0,
      faultRate: 0,
      hitRate: 0
    };
  }

  const steps: PageReplacementStep[] = [];
  const frames: (number | null)[] = Array.from({ length: frameCount }, () => null);
  const insertionOrders: number[] = [];
  const lastAccessTimes: Record<number, number> = {};
  const useBits: Record<number, boolean> = {};
  const dirtyBits: Record<number, boolean> = { ...(config.dirtyBits || {}) };
  let clockHand = 0;

  let totalFaults = 0;
  let totalHits = 0;

  for (let stepIdx = 0; stepIdx < referenceString.length; stepIdx++) {
    const page = referenceString[stepIdx];
    if (page === undefined) continue;

    const frameIndex = frames.indexOf(page);
    const isHit = frameIndex !== -1;

    let victim: number | null = null;
    let stepExplanation = "";

    if (isHit) {
      totalHits++;
      lastAccessTimes[page] = stepIdx;
      useBits[page] = true;
      stepExplanation = `Riferimento pagina ${page}: HIT nel frame ${frameIndex}.`;
    } else {
      totalFaults++;
      const emptyIndex = frames.indexOf(null);

      if (emptyIndex !== -1) {
        frames[emptyIndex] = page;
        insertionOrders.push(page);
        lastAccessTimes[page] = stepIdx;
        useBits[page] = true;
        clockHand = (clockHand + 1) % frameCount;
        stepExplanation = `Riferimento pagina ${page}: FAULT. Inserita nello slot libero (frame ${emptyIndex}).`;
      } else {
        let replaceIndex = 0;

        switch (policy) {
          case "fifo": {
            const victimPage = insertionOrders.shift();
            if (victimPage !== undefined) {
              replaceIndex = frames.indexOf(victimPage);
              victim = victimPage;
              frames[replaceIndex] = page;
              insertionOrders.push(page);
              stepExplanation = `Riferimento pagina ${page}: FAULT. Politica FIFO: sfrattata la pagina ${victim} (frame ${replaceIndex}).`;
            }
            break;
          }

          case "opt": {
            let furthestIdx = -1;
            let maxDistance = -1;

            for (let f = 0; f < frameCount; f++) {
              const residentPage = frames[f];
              if (residentPage === null || residentPage === undefined) continue;
              const nextOccurrence = referenceString.slice(stepIdx + 1).indexOf(residentPage);

              if (nextOccurrence === -1) {
                replaceIndex = f;
                break;
              } else if (nextOccurrence > maxDistance) {
                maxDistance = nextOccurrence;
                furthestIdx = f;
              }
            }

            if (furthestIdx !== -1 && maxDistance !== -1) {
              replaceIndex = furthestIdx;
            }

            victim = frames[replaceIndex] ?? null;
            frames[replaceIndex] = page;
            stepExplanation = `Riferimento pagina ${page}: FAULT. Politica OPT (MIN): sfrattata la pagina ${victim} (frame ${replaceIndex}), riutilizzata più avanti nel tempo o mai più.`;
            break;
          }

          case "lru": {
            let oldestAccess = Infinity;
            for (let f = 0; f < frameCount; f++) {
              const residentPage = frames[f];
              if (residentPage === null || residentPage === undefined) continue;
              const lastAccess = lastAccessTimes[residentPage] ?? -1;
              if (lastAccess < oldestAccess) {
                oldestAccess = lastAccess;
                replaceIndex = f;
              }
            }
            victim = frames[replaceIndex] ?? null;
            frames[replaceIndex] = page;
            stepExplanation = `Riferimento pagina ${page}: FAULT. Politica LRU: sfrattata la pagina ${victim} (frame ${replaceIndex}), con accesso più remoto al passo ${oldestAccess}.`;
            break;
          }

          case "clock": {
            while (true) {
              const currentResident = frames[clockHand];
              if (currentResident !== null && currentResident !== undefined && useBits[currentResident]) {
                useBits[currentResident] = false;
                clockHand = (clockHand + 1) % frameCount;
              } else {
                replaceIndex = clockHand;
                victim = frames[replaceIndex] ?? null;
                frames[replaceIndex] = page;
                useBits[page] = true;
                clockHand = (clockHand + 1) % frameCount;
                break;
              }
            }
            stepExplanation = `Riferimento pagina ${page}: FAULT. Politica Clock: cursore a ${replaceIndex}, sfrattata la pagina ${victim} (Use bit = 0). Cursore avanza a ${clockHand}.`;
            break;
          }

          case "modified-clock": {
            let found = false;

            // Scan 1: cerca (0, 0) senza modificare Use bit
            for (let i = 0; i < frameCount; i++) {
              const idx = (clockHand + i) % frameCount;
              const resPage = frames[idx];
              if (resPage === null || resPage === undefined) continue;
              const u = Boolean(useBits[resPage]);
              const d = Boolean(dirtyBits[resPage]);
              if (!u && !d) {
                replaceIndex = idx;
                clockHand = (idx + 1) % frameCount;
                found = true;
                break;
              }
            }

            // Scan 2: cerca (0, 1), azzerando i bit Use dei frame esaminati
            if (!found) {
              for (let i = 0; i < frameCount; i++) {
                const idx = (clockHand + i) % frameCount;
                const resPage = frames[idx];
                if (resPage === null || resPage === undefined) continue;
                const u = Boolean(useBits[resPage]);
                const d = Boolean(dirtyBits[resPage]);
                if (!u && d) {
                  replaceIndex = idx;
                  clockHand = (idx + 1) % frameCount;
                  found = true;
                  break;
                }
                useBits[resPage] = false;
              }
            }

            // Scan 3: se ancora non trovato, cerca nuovamente (0, 0)
            if (!found) {
              for (let i = 0; i < frameCount; i++) {
                const idx = (clockHand + i) % frameCount;
                const resPage = frames[idx];
                if (resPage === null || resPage === undefined) continue;
                const u = Boolean(useBits[resPage]);
                const d = Boolean(dirtyBits[resPage]);
                if (!u && !d) {
                  replaceIndex = idx;
                  clockHand = (idx + 1) % frameCount;
                  found = true;
                  break;
                }
              }
            }

            // Scan 4: fallback a qualsiasi (0, 1)
            if (!found) {
              for (let i = 0; i < frameCount; i++) {
                const idx = (clockHand + i) % frameCount;
                const resPage = frames[idx];
                if (resPage === null || resPage === undefined) continue;
                const d = Boolean(dirtyBits[resPage]);
                if (d) {
                  replaceIndex = idx;
                  clockHand = (idx + 1) % frameCount;
                  found = true;
                  break;
                }
              }
            }

            if (!found) {
              replaceIndex = clockHand;
              clockHand = (clockHand + 1) % frameCount;
            }

            victim = frames[replaceIndex] ?? null;
            frames[replaceIndex] = page;
            useBits[page] = true;
            stepExplanation = `Riferimento pagina ${page}: FAULT. Politica Modified Clock (Use, Dirty): sfrattata la pagina ${victim} nel frame ${replaceIndex}. Cursore avanza a ${clockHand}.`;
            break;
          }
        }

        lastAccessTimes[page] = stepIdx;
        useBits[page] = true;
      }
    }

    steps.push({
      stepIndex: stepIdx,
      page,
      hit: isHit,
      fault: !isHit,
      frames: [...frames],
      victim,
      clockHand,
      useBits: { ...useBits },
      dirtyBits: { ...dirtyBits },
      explanation: stepExplanation
    });
  }

  const belady = (policy === "fifo" && !skipBeladyCheck) ? detectBeladyAnomaly(referenceString) : undefined;

  return {
    steps,
    totalFaults,
    totalHits,
    faultRate: totalFaults / referenceString.length,
    hitRate: totalHits / referenceString.length,
    beladyAnomalyDetected: belady?.hasAnomaly,
    beladyComparison: belady
  };
}
