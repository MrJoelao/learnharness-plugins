# LearnHarness Plugins

Raccolta centralizzata e kit di sviluppo (SDK & Tools) per i plugin esterni di [LearnHarness](https://github.com/MrJoelao/learnharness).

Questa repository contiene i sorgenti dei plugin modulari, la documentazione ufficiale della **Plugin API v1** e gli strumenti per sviluppare, validare, compilare ed installare estensioni in LearnHarness in modo completamente autonomo.

---

## 📦 Plugin Disponibili

| Plugin | Versione | Descrizione | Directory |
| :--- | :--- | :--- | :--- |
| **OS Simulator** | `1.0.0` | Laboratorio visivo e parametrico di Sistemi Operativi (OSTEP) con simulazione di Memoria Virtuale, Scheduling CPU (MLFQ/LDE), Concorrenza (Race Condition, Deadlock RAG, Mesa CV, Semafori) e AI Copilot didattico configurabile. | [`os-simulator/`](./os-simulator/) |

---

## 📚 Documentazione & Design System

- [**`AGENTS.md` (Istruzioni per Agenti AI)**](./AGENTS.md): Direttive ferree, filosofia *Experience First*, standard *$unslop*, guardrail architetturali e workflow sequenziale.
- [**Design System Base (`shared/plugin-base.css`)**](./shared/plugin-base.css): Classi CSS universali (`.lh-toolbar`, `.lh-btn`, `.lh-card`, `.lh-badge`, `.lh-workbench`, `.lh-copilot-pill`) che garantiscono coerenza visiva al 100%.
- [**Libreria di Pattern & Snippet (`docs/ui-patterns.md`)**](./docs/ui-patterns.md): Esempi di codice pronti per toolbar, telemetria, pillola assistente e modali.
- [**Guida all'Architettura dei Plugin**](./docs/plugin-architecture.md): Concetti chiave, separazione Frontend (browser) / Backend (Node), ciclo di vita e sandboxing.
- [**Guida all'Authoring di Plugin**](./docs/plugin-authoring.md): Guida passo-passo per creare un plugin da zero.
- [**Plugin UI & UX Guide ($unslop)**](./docs/plugin-ui-ux-guide.md): Standard di design, palette semantica host, assenza di slop AI e accessibilità.
- [**Specifiche Plugin API v1**](./docs/api/plugins.md): Contratti dettagliati di `PluginFrontendContext`, `PluginBackendContext`, storage e chiamate IPC.
- [**Widget Host Controllati (`PluginUi`)**](./docs/api/plugin-ui.md): Dialog, menu contestuali, selettori modello, markdown renderer e tree view.
- [**Modalità Study Hub**](./docs/plugin-mode-contract.md): Contratti per registrare workspace interattivi e laboratori.

---

## 🛠️ Strumenti di Sviluppo (`scripts/`)

Questa repository include utility dedicate nella cartella [`scripts/`](./scripts/) per automatizzare il workflow:

### 1. Creare un nuovo plugin (con Archetipi)
Scaffolda automaticamente la struttura completa del plugin integrando `shared/plugin-base.css`, manifest, tsconfig, script di build esbuild e test unitari:
```bash
# Template default (laboratorio interattivo Study Hub con toolbar, telemetria e Copilot AI):
npm run create:plugin <id-plugin> "Nome del Plugin" -- --template=lab

# Template per collezioni o deck a schede (tipo flashcards):
npm run create:plugin <id-plugin> "Nome del Plugin" -- --template=library

# Template a vista singola / workbench tool:
npm run create:plugin <id-plugin> "Nome del Plugin" -- --template=tool
```

### 2. Validare un plugin (Architettura & Anti-Slop)
Verifica la correttezza del manifest, l'assenza di import proibiti e il rispetto delle linee guida di stile UI:
```bash
npm run validate os-simulator
# Oppure per tutti:
npm run validate:all
```

### 3. Compilare e testare
Grazie agli npm workspaces, puoi lanciare i comandi su tutti i plugin dalla radice della repository:
```bash
npm run typecheck    # Verifica i tipi TypeScript su tutti i plugin
npm run test         # Esegue tutte le suite di test
npm run build        # Compila tutti i plugin nelle rispettive cartelle dist/
```

### 4. Installare un plugin in LearnHarness
Installa in modo atomico il plugin compilato nella cartella `data/plugins/` di LearnHarness:
```bash
# Se la cartella learnharness si trova allo stesso livello (default):
npm run install:plugin os-simulator

# Oppure specificando il percorso personalizzato:
node scripts/install-plugin.mjs os-simulator /percorso/a/learnharness/data/plugins
```

---

## 📁 Struttura della Repository

```text
learnharness-plugins/
├── package.json            # Root workspace e comandi aggregati
├── README.md               # Panoramica generale e guida allo sviluppo
├── docs/                   # Documentazione ufficiale Plugin API e linee guida UX
│   ├── plugin-architecture.md
│   ├── plugin-authoring.md
│   ├── plugin-ui-ux-guide.md
│   ├── plugin-mode-contract.md
│   └── api/                # Contratti e definizioni API v1 dettagliate
├── scripts/                # Strumenti di scaffolding, validazione e installazione
│   ├── create-plugin.mjs   # Scaffolding per nuovi plugin
│   ├── validate-plugin.mjs # Validatore statico e anti-slop
│   └── install-plugin.mjs  # Installer atomico per LearnHarness
└── os-simulator/           # Plugin OS Simulator
    ├── manifest.json
    ├── package.json
    ├── tsconfig.json
    ├── .sdk/               # Definizioni TypeScript portabili di learnharness-plugin-api
    ├── scripts/build.mjs
    ├── presets/
    ├── src/
    └── tests/
```

---

## 📄 Licenza

Ogni plugin in questa repository include il proprio file di licenza (`LICENSE`). Per il plugin `os-simulator`, la licenza applicata è **AGPL-3.0**.
