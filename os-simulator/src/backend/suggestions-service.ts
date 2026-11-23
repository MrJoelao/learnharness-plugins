import fs from "node:fs";
import path from "node:path";
import type { PluginBackendContext } from "learnharness-plugin-api";
import type { LabMode } from "../types/ai.js";
import { OSTEP_PROMPT_CHIPS, type CopilotPromptChip } from "../ui/ai/types.js";

export type SuggestionsMode = "ai" | "static" | "disabled";

export interface CopilotSettings {
  suggestionsMode: SuggestionsMode;
  refreshIntervalDays: number;
}

export interface SuggestionsResponse {
  enabled: boolean;
  mode: SuggestionsMode;
  chips: CopilotPromptChip[];
  source: "ai-cached" | "ai-fresh" | "static" | "disabled";
}

interface CachedModeSuggestions {
  chips: CopilotPromptChip[];
  generatedAt: number;
}

type SuggestionsCache = Partial<Record<LabMode, CachedModeSuggestions>>;

const DEFAULT_SETTINGS: CopilotSettings = {
  suggestionsMode: "ai",
  refreshIntervalDays: 7
};

const VALID_MODES: readonly SuggestionsMode[] = ["ai", "static", "disabled"];
const VALID_LAB_MODES: readonly LabMode[] = ["memory-lab", "cpu-lab", "concurrency-lab"];
const MS_PER_DAY = 86_400_000;

function settingsPath(dataDirectory: string): string {
  return path.join(dataDirectory, "copilot-settings.json");
}

function cachePath(dataDirectory: string): string {
  return path.join(dataDirectory, "copilot-suggestions-cache.json");
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function loadCopilotSettings(dataDirectory?: string): CopilotSettings {
  if (!dataDirectory) return { ...DEFAULT_SETTINGS };
  const raw = readJsonFile<Partial<CopilotSettings>>(settingsPath(dataDirectory));
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };

  const suggestionsMode = VALID_MODES.includes(raw.suggestionsMode as SuggestionsMode)
    ? (raw.suggestionsMode as SuggestionsMode)
    : DEFAULT_SETTINGS.suggestionsMode;
  const refreshIntervalDays =
    typeof raw.refreshIntervalDays === "number" && Number.isFinite(raw.refreshIntervalDays) && raw.refreshIntervalDays >= 1
      ? Math.min(90, Math.round(raw.refreshIntervalDays))
      : DEFAULT_SETTINGS.refreshIntervalDays;

  return { suggestionsMode, refreshIntervalDays };
}

export function saveCopilotSettings(dataDirectory: string | undefined, patch: unknown): CopilotSettings {
  const current = loadCopilotSettings(dataDirectory);
  const input = patch && typeof patch === "object" ? (patch as Record<string, unknown>) : {};

  const next: CopilotSettings = {
    suggestionsMode: VALID_MODES.includes(input.suggestionsMode as SuggestionsMode)
      ? (input.suggestionsMode as SuggestionsMode)
      : current.suggestionsMode,
    refreshIntervalDays:
      typeof input.refreshIntervalDays === "number" && Number.isFinite(input.refreshIntervalDays) && input.refreshIntervalDays >= 1
        ? Math.min(90, Math.round(input.refreshIntervalDays))
        : current.refreshIntervalDays
  };

  if (dataDirectory) {
    writeJsonFile(settingsPath(dataDirectory), next);
  }
  return next;
}

function parseGeneratedChips(rawText: string, mode: LabMode): CopilotPromptChip[] | null {
  const match = rawText.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    const chips: CopilotPromptChip[] = [];
    for (let i = 0; i < parsed.length && chips.length < 4; i++) {
      const item = parsed[i];
      if (item && typeof item === "object" && typeof item.label === "string" && typeof item.prompt === "string") {
        const label = item.label.trim();
        const prompt = item.prompt.trim();
        if (label.length > 0 && label.length <= 40 && prompt.length > 0) {
          chips.push({
            id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `${mode}-ai-${i + 1}`,
            label,
            prompt
          });
        }
      }
    }
    return chips.length >= 2 ? chips : null;
  } catch {
    return null;
  }
}

async function generateAiChips(ctx: PluginBackendContext, mode: LabMode): Promise<CopilotPromptChip[] | null> {
  if (!ctx.inference || typeof ctx.inference.complete !== "function") return null;

  let modelSpec: { provider: string; id: string } | null = null;
  try {
    if (typeof ctx.inference.catalog === "function") {
      const catalog = await ctx.inference.catalog();
      const first = catalog?.models?.[0];
      if (first && typeof first.provider === "string" && typeof first.id === "string") {
        modelSpec = { provider: first.provider, id: first.id };
      }
    }
  } catch {
    return null;
  }

  if (!modelSpec) return null;

  const modeTopic =
    mode === "memory-lab"
      ? "Memory Virtualization (segmentazione, paging lineare/2-livelli, TLB, ASID, algoritmi di rimpiazzo, anomalia di Belàdy)"
      : mode === "cpu-lab"
        ? "CPU Scheduling & Hardware (FIFO, SJF, STCF, Round Robin, MLFQ 5 regole, Limited Direct Execution)"
        : "Concurrency & Deadlock (Lost Update, lock, condition variables semantica Mesa, semafori, Bounded Buffer, 5 filosofi, RAG)";

  try {
    const result = await ctx.inference.complete({
      model: modelSpec,
      purpose: "background",
      options: { maxTokens: 450, temperature: 0.7 },
      context: {
        systemPrompt:
          "Genera esattamente 4 suggerimenti brevi in italiano per uno studente di Sistemi Operativi (OSTEP). Rispondi SOLO con un array JSON valido di oggetti {\"id\": string, \"label\": string (max 28 caratteri), \"prompt\": string (1 frase)}.",
        messages: [
          {
            role: "user",
            content: `Genera 4 suggerimenti pratici e variati per la modalità ${mode}: ${modeTopic}.`,
            timestamp: Date.now()
          }
        ]
      }
    });

    const text = (result?.content ?? [])
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");

    return parseGeneratedChips(text, mode);
  } catch {
    return null;
  }
}

export async function handleGetSuggestions(
  ctx: PluginBackendContext,
  input: unknown
): Promise<SuggestionsResponse> {
  const rawMode = input && typeof input === "object" ? (input as { mode?: unknown }).mode : undefined;
  const mode: LabMode = VALID_LAB_MODES.includes(rawMode as LabMode) ? (rawMode as LabMode) : "memory-lab";
  const settings = loadCopilotSettings(ctx.dataDirectory);

  if (settings.suggestionsMode === "disabled") {
    return { enabled: false, mode: "disabled", chips: [], source: "disabled" };
  }

  const fallbackChips = [...(OSTEP_PROMPT_CHIPS[mode] ?? [])];

  if (settings.suggestionsMode === "static") {
    return { enabled: true, mode: "static", chips: fallbackChips, source: "static" };
  }

  const file = ctx.dataDirectory ? cachePath(ctx.dataDirectory) : null;
  const cache: SuggestionsCache = file ? (readJsonFile<SuggestionsCache>(file) ?? {}) : {};
  const cached = cache[mode];
  const ttlMs = settings.refreshIntervalDays * MS_PER_DAY;

  if (cached && Array.isArray(cached.chips) && cached.chips.length > 0 && Date.now() - cached.generatedAt < ttlMs) {
    return { enabled: true, mode: "ai", chips: cached.chips, source: "ai-cached" };
  }

  const generated = await generateAiChips(ctx, mode);
  if (generated && generated.length > 0) {
    if (file) {
      cache[mode] = { chips: generated, generatedAt: Date.now() };
      writeJsonFile(file, cache);
    }
    return { enabled: true, mode: "ai", chips: generated, source: "ai-fresh" };
  }

  return { enabled: true, mode: "ai", chips: fallbackChips, source: "static" };
}
