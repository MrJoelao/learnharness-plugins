# Fase 4: Integrazione, Persistenza, Audit `$unslop` e Suite di Test

Questa fase definisce la persistenza nei workspace di LearnHarness Study Hub, il catalogo dei preset d'esame UNIMI, la checklist di revisione `$unslop` e la suite completa di test automatizzati.

---

## 1. Persistenza nei Workspace di Study Hub (`docs/study-hub-workspaces.md`)

Ogni workspace aperto in Study Hub deve salvare e ripristinare il proprio stato in modo completamente isolato e atomico:

```typescript
// Esempio nel mount handler del renderer frontend
export function mountMemoryLab(container: HTMLElement, context: ModeMountContext) {
  const { workspace, storage, signal } = context;

  // Caricamento iniziale dallo storage persistente del workspace
  storage.get<MemoryLabState>("memory-state").then(savedState => {
    const initialState = savedState || createDefaultMemoryState();
    renderApp(container, initialState, (newState) => {
      // Salvataggio asincrono persistente
      storage.set("memory-state", newState);
    });
  });

  // Pulizia obbligatoria alla chiusura del workspace
  signal.addEventListener("abort", () => {
    cleanupDom(container);
  });
}
```

---

## 2. Catalogo Preset Didattici (Esercizi Esame UNIMI & OSTEP)

I preset sono salvati come file JSON puri caricabili dall'utente tramite il pulsante "Load Preset" nella toolbar di ciascun laboratorio:

1. **`segmentation-unimi-seed-0.json`**:
   - Spazio virtuale: 1 KB (10 bit), Memoria fisica: 16 KB.
   - SEG0: Base 6890, Limit 472, crescita positiva.
   - SEG1: Base 4692, Limit 450, crescita negativa (Stack).
   - Traccia: 523, 414, 802, 310, 488.
2. **`paging-unimi-seed-0.json`**:
   - Spazio virtuale: 16384 B (14 bit, pagine da 4096 B, 2 bit VPN, 12 bit Offset).
   - Memoria fisica: 64 KB (16 frame).
   - Tabella: VPN 0 (PFN 12, Valid 1), VPN 1 (Invalid), VPN 2 (Invalid), VPN 3 (PFN 6, Valid 1).
   - Traccia: 12841, 4969, 7808, 9558, 14878.
3. **`belady-anomaly-reference.json`**:
   - Sequenza: `1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5`.
   - Confronto automatico tra 3 frame (9 page fault) e 4 frame (10 page fault!).
4. **`mlfq-gaming-workload.json`**:
   - Job CPU-bound lungo contro Job interattivo che tenta di effettuare I/O al 99% del quanto per aggirare lo scheduler.
5. **`lost-update-thread-demo.json`**:
   - Due thread con assembly `read`, `add`, `write` sulla variabile condivisa $x=10$.
6. **`dining-philosophers-deadlock.json`**:
   - 5 filosofi, 5 forchette con deadlock simmetrico vs risoluzione con filosofo asimmetrico.

---

## 3. Checklist di Revisione `$unslop` (Craft over Slop)

Prima di dichiarare completato il plugin, ogni vista deve superare questo audit:

- [ ] **Palette e Token**: Usate esclusivamente le classi native dell'host (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`). Nessun codice colore esadecimale hardcoded nel CSS/inline style.
- [ ] **Nessun Gradiente Slop**: Assenza totale di gradienti porpora/viola, bordi neon e box-shadow colorate.
- [ ] **Un Solo Elemento Luminoso per Vista**: L'elemento principale attira l'attenzione (bit decodificati, anello di buffer, Gantt), tutto il resto del chrome è calmo e neutro.
- [ ] **Zero Emoji**: Nessun emoji nei pulsanti, titoli o intestazioni di colonna. Solo icone Lucide a tratto uniforme (`size-4`).
- [ ] **Tipografia**: Titoli in `font-title` (CMU Serif), cifre, registri, bit e indirizzi in `font-mono` (`tabular-nums`), etichette in `Source Sans 3`.
- [ ] **Griglia a 4px**: Tutti i margini, padding e gap sono multipli di 4px (`p-4`, `gap-2`, `gap-4`, `h-9`).
- [ ] **Animazioni Sobrie**: Nessun `animate-pulse` o `animate-spin` su elementi a riposo. Transizioni con curve sobrie (`transition-all duration-200 ease-out`).

---

## 4. Piano di Test Automatizzati

1. **Test Matematici Unitari (`tests/memory.test.ts`)**:
   - Verifica di ogni singola formula di offset positivo e negativo.
   - Verifica della tabella a 2 livelli con calcolo del risparmio in byte.
2. **Test di Scheduling (`tests/cpu.test.ts`)**:
   - Verifica di turnaround e response time su carichi di lavoro noti.
   - Verifica della regola 4 (allotment demotion) e regola 5 (boost periodico) in MLFQ.
3. **Test di Sincronizzazione (`tests/concurrency.test.ts`)**:
   - Rilevamento esatto del ciclo RAG di deadlock.
   - Verifica del contatore negativo dei semafori OSTEP.
4. **Comando di Esecuzione Test**:
   ```bash
   npm test
   ```
