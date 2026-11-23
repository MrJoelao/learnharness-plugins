# Fase 1: Laboratorio di Virtualizzazione della Memoria (`memory-lab`)

Questa fase descrive l'architettura tecnica, i modelli matematici e l'interfaccia utente del modulo **Memory Virtualization Lab**.
Il simulatore deve supportare qualsiasi esercizio parametrico senza alcuna costante hardcoded.

---

## 1. Modello Dati e Tipi di Dominio (`src/core/memory/types.ts`)

```typescript
export type GrowthDirection = 'positive' | 'negative';

export interface SegmentConfig {
  id: number;
  name: string;
  base: number;
  limit: number;
  growth: GrowthDirection;
  permissions: { read: boolean; write: boolean; execute: boolean };
}

export interface SegmentationSystemConfig {
  addressSpaceBits: number;   // Es. 10 bit (1024 B) o 14 bit (16384 B)
  segmentBits: number;        // Es. 1 bit (SEG0, SEG1) o 2 bit (Code, Heap, Stack)
  physicalMemorySize: number; // Es. 16384 B (16 KB) o 65536 B (64 KB)
  segments: SegmentConfig[];
}

export interface LinearPagingConfig {
  addressSpaceBits: number;
  pageSize: number;           // Es. 64 B, 512 B, 4096 B
  physicalMemorySize: number;
  pageTable: Array<{
    vpn: number;
    valid: boolean;
    pfn: number;
    dirty?: boolean;
    accessed?: boolean;
  }>;
}

export interface MultiLevelPagingConfig {
  addressSpaceBits: number;   // Es. 32 bit
  pageSize: number;           // Es. 4096 B (12 bit offset)
  pdeBits: number;            // Es. 10 bit (1024 PDE)
  pteBits: number;            // Es. 10 bit (1024 PTE)
  pageDirectory: Array<{
    pdIndex: number;
    valid: boolean;
    ptPfn: number;
    table?: Array<{
      ptIndex: number;
      valid: boolean;
      pfn: number;
    }>;
  }>;
}

export interface TlbEntry {
  vpn: number;
  pfn: number;
  valid: boolean;
  asid: number;
  dirty: boolean;
  lastUsedCycle: number;
}

export interface TlbConfig {
  capacity: number;           // Es. 4, 8, 16, 64 entries
  entries: TlbEntry[];
  asidSupport: boolean;
}

export interface PageReplacementConfig {
  frameCount: number;
  policy: 'fifo' | 'opt' | 'lru' | 'clock' | 'modified-clock';
  referenceString: number[];  // Es. [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5]
  clockHand?: number;
  useBits?: Record<number, boolean>;
  dirtyBits?: Record<number, boolean>;
}

export interface TranslationResult {
  va: number;
  pa: number | null;
  status: 'valid' | 'segmentation-violation' | 'invalid-page' | 'tlb-hit' | 'tlb-miss' | 'page-fault';
  displacement?: number;
  extractedComponents: Record<string, number>;
  stepExplanations: string[];
}
```

---

## 2. Motori di Calcolo Funzionali Puri

### 2.1 Segmentazione con Crescita Positiva e Negativa (`src/core/memory/segmentation.ts`)
Implementa l'algoritmo esatto descritto nelle dispense UNIMI senza assunzioni di valori prefissati:

```typescript
export function translateSegmentation(
  va: number,
  config: SegmentationSystemConfig
): TranslationResult {
  const offsetBits = config.addressSpaceBits - config.segmentBits;
  const windowSize = 1 << offsetBits;
  const addressSpaceSize = 1 << config.addressSpaceBits;
  
  const segmentId = va >> offsetBits;
  const rawOffset = va & (windowSize - 1);
  const segment = config.segments.find(s => s.id === segmentId);
  
  if (!segment) {
    return {
      va,
      pa: null,
      status: 'segmentation-violation',
      extractedComponents: { segmentId, rawOffset },
      stepExplanations: [`Segmento ${segmentId} inesistente nella configurazione.`]
    };
  }

  let displacement = 0;
  let isValid = false;

  if (segment.growth === 'positive') {
    displacement = rawOffset;
    isValid = displacement >= 0 && displacement < segment.limit;
  } else {
    // Crescita negativa (es. Stack, SEG1)
    displacement = rawOffset - windowSize; // Equivale a va - addressSpaceSize
    isValid = displacement >= -segment.limit && displacement < 0;
  }

  if (!isValid) {
    return {
      va,
      pa: null,
      status: 'segmentation-violation',
      displacement,
      extractedComponents: { segmentId, rawOffset, displacement, limit: segment.limit },
      stepExplanations: [
        `Accesso fuori limite: spostamento d=${displacement} non compreso nei bound consentiti.`
      ]
    };
  }

  const pa = segment.base + displacement;
  return {
    va,
    pa,
    status: 'valid',
    displacement,
    extractedComponents: { segmentId, rawOffset, displacement, base: segment.base },
    stepExplanations: [
      `Spostamento d=${displacement} valido rispetto al limite ${segment.limit}.`,
      `Indirizzo fisico PA = Base (${segment.base}) + d (${displacement}) = ${pa} (0x${pa.toString(16)}).`
    ]
  };
}
```

### 2.2 Paging a 1 e 2 Livelli (`src/core/memory/paging.ts`)
- **Paging Lineare**: estrazione dinamica di `VPN` e `Offset`, verifica del bit `Valid` (supporto sia a MSB `0x80000000` che a flag separati), generazione di violazione o sintesi di `PA`.
- **Paging a 2 Livelli**: estrazione di `PDIndex`, `PTIndex`, `Offset`. Verifica `PDE.valid` e calcolo immediato del risparmio in byte rispetto alla tabella lineare.

### 2.3 Algoritmi di Rimpiazzo Pagine (`src/core/memory/replacement.ts`)
- **FIFO**: tiene traccia della coda di inserimento. Rileva automaticamente l'**Anomalia di Belàdy** su tracce note.
- **Optimal (MIN)**: ispezione futura dell'array di riferimenti per trovare la pagina che verrà richiesta più in là nel tempo.
- **LRU**: ordinamento temporale in base all'ultimo accesso.
- **Clock Algorithm**: buffer circolare con cursore `clockHand` e reset del bit `Use` da 1 a 0.
- **Modified Clock**: scansione ciclica con valutazione delle quattro classi `(Use, Dirty)`: (0,0), (0,1), (1,0), (1,1).

---

## 3. Interfaccia Utente e Controlli Parametrici (Applicazione `$unslop`)

1. **Toolbar Superiore**:
   - Selettore del sottosistema: Segmentazione, Paging Lineare, Multi-Livello, TLB, Rimpiazzo Swapping.
   - Pulsante **"Load Preset"**: menù sobrio con i preset d'esame (`segmentazione-seed-0`, `paging-seed-0`, `belady-anomaly-trace`, `multilevel-sparse-space`).
   - Pulsante **"Custom Input"**: modale pulita per inserire tracce arbitrarie (indirizzi in hex/decimale o stringa di pagine).
2. **Visualizzatore di Bit (One Bright Element)**:
   - Scomposizione grafica dei singoli bit dell'indirizzo virtuale (Segment/VPN in colore primario calmo, Offset in colore secondario).
   - Conversione real-time: Binario $\leftrightarrow$ Decimale $\leftrightarrow$ Esadecimale.
3. **Mappa della Memoria Fisica**:
   - Griglia pulita dei frame con evidenziazione del frame selezionato.
4. **Pannello di Spiegazione Analitica**:
   - Mostra la sequenza di passaggi e formule matematiche esatte per replicare il ragionamento dello studente all'esame.

---

## 4. Criteri di Accettazione e Verifica Terminale

- Test unitario completo che verifica i calcoli numerici esatti su:
  - `segmentazione-esercizio-soluzioni.pdf` (tutti i 5 indirizzi d'esame).
  - `paging-problema-soluzioni.pdf` (tutte le traduzioni).
  - Simulazione Belàdy su 3 vs 4 frame.
- Nessuna costante hardcoded: il motore deve accettare qualsiasi input JSON/stringa valido.
