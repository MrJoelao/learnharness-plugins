# LearnHarness Plugins

Raccolta centralizzata dei plugin esterni e community per [LearnHarness](https://github.com/MrJoelao/learnharness).

Questa repository contiene i sorgenti e la documentazione dei plugin modulari sviluppati al di fuori del core di LearnHarness, pronti per essere compilati, testati e installati nell'applicazione.

---

## 📦 Plugin Disponibili

| Plugin | Versione | Descrizione | Directory |
| :--- | :--- | :--- | :--- |
| **OS Simulator** | `1.0.0` | Laboratorio visivo e parametrico di Sistemi Operativi (OSTEP) con simulazione di Memoria Virtuale, Scheduling CPU (MLFQ/LDE), Concorrenza (Race Condition, Deadlock RAG, Mesa CV, Semafori) e AI Copilot didattico configurabile. | [`os-simulator/`](./os-simulator/) |

---

## 📁 Struttura della Repository

Ogni plugin è una cartella autonoma conforme alle specifiche **Plugin API v1** di LearnHarness:

```text
learnharness-plugins/
├── README.md               # Panoramica generale e guida allo sviluppo
├── .gitignore              # Ignora artefatti di build globali
└── os-simulator/           # Plugin OS Simulator
    ├── manifest.json       # Metadata, entrypoint e permessi del plugin
    ├── package.json        # Script npm e dipendenze
    ├── tsconfig.json       # Configurazione TypeScript strict
    ├── README.md           # Documentazione specifica del plugin
    ├── LICENSE             # Licenza (AGPL-3.0)
    ├── .sdk/               # Definizioni TypeScript portabili di learnharness-plugin-api
    ├── scripts/
    │   └── build.mjs       # Script di bundling con esbuild
    ├── presets/            # Preset JSON iniziali per le simulazioni
    ├── src/
    │   ├── main.ts         # Entry point Frontend (browser ES module)
    │   ├── backend.ts      # Entry point Backend (Node CommonJS module)
    │   ├── styles.css      # Stili CSS del plugin
    │   ├── core/           # Motori deterministici di simulazione (CPU, Memoria, Concorrenza)
    │   └── ui/             # Viste interattive, diagrammi e componenti UI
    ├── tests/              # Suite completa di test unitari e di integrazione (Node test runner)
    └── docs/               # Specifiche architetturali e contratti di fase
```

---

## 🛠️ Sviluppo e Compilazione

### 1. Prerequisiti
- **Node.js** v20 o superiore
- **npm** v10 o superiore

### 2. Lavorare su un plugin (es. `os-simulator`)
Entra nella cartella del plugin desiderato ed installa le dipendenze:

```bash
cd os-simulator
npm install
```

### 3. Comandi disponibili
All'interno di ciascun plugin:

- **Typecheck:** verifica la correttezza dei tipi TypeScript:
  ```bash
  npm run typecheck
  ```
- **Test:** esegue i test con il test runner nativo di Node e `tsx`:
  ```bash
  npm test
  ```
- **Build:** compila il bundle frontend (`dist/main.js`), il backend (`dist/backend.cjs`) e copia asset/preset in `dist/`:
  ```bash
  npm run build
  ```

---

## 🚀 Installazione Locale in LearnHarness

I plugin compilati possono essere installati direttamente nella directory `data/plugins/` della propria istanza locale di LearnHarness tramite lo script di installazione fornito dal core di LearnHarness:

```bash
# Esempio: dalla cartella del plugin compilato (es. os-simulator):
node /percorso/a/learnharness/scripts/install-plugin-local.mjs /percorso/a/learnharness/data/plugins
```

Lo script installerà in modo atomico il bundle in:
```text
learnharness/data/plugins/<plugin-id>/dist/
```

Successivamente, avviare o ricaricare LearnHarness e abilitare il plugin dalle **Impostazioni → Plugin** o tramite `data/plugins-state.json`.

---

## ➕ Aggiungere un Nuovo Plugin

Per aggiungere un nuovo plugin a questa repository:

1. Crea una nuova cartella con il nome identificativo del plugin (es. `my-awesome-plugin/`).
2. Definisci il `manifest.json` rispettando `apiVersion: 1`.
3. Configura `package.json` con dipendenza locale `"learnharness-plugin-api": "file:.sdk"`.
4. Implementa il frontend (`src/main.ts`) e opzionalmente il backend (`src/backend.ts`).
5. Aggiungi i test nella cartella `tests/`.
6. Aggiorna la tabella in questo README con il nuovo plugin.

---

## 📄 Licenza

Ogni plugin in questa repository include il proprio file di licenza (`LICENSE`). Per il plugin `os-simulator`, la licenza applicata è **AGPL-3.0**.
