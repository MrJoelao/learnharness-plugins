import type { BoundaryParser } from "../types/common.js";
import type { SavedExercise, LabMode } from "../types/ai.js";

export const savedExerciseBoundaryParser: BoundaryParser<SavedExercise> = {
  parse(raw: unknown) {
    if (typeof raw !== "object" || raw === null) {
      return { success: false, error: "SavedExercise must be a non-null object." };
    }

    const rec = raw as Record<string, unknown>;

    const id = rec.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      return { success: false, error: "id must be a non-empty string." };
    }

    const title = rec.title;
    if (typeof title !== "string" || title.trim().length === 0) {
      return { success: false, error: "title must be a non-empty string." };
    }

    const date = rec.date;
    if (typeof date !== "string" || Number.isNaN(Date.parse(date))) {
      return { success: false, error: "date must be a valid ISO 8601 string." };
    }

    const consegna = rec.consegna;
    if (typeof consegna !== "string") {
      return { success: false, error: "consegna must be a string." };
    }

    const sourceTag = rec.sourceTag;
    if (sourceTag !== "ai" && sourceTag !== "manual") {
      return { success: false, error: "sourceTag must be 'ai' or 'manual'." };
    }

    const mode = rec.mode;
    if (mode !== "memory-lab" && mode !== "cpu-lab" && mode !== "concurrency-lab") {
      return { success: false, error: "mode must be 'memory-lab', 'cpu-lab', or 'concurrency-lab'." };
    }

    if (rec.config === undefined) {
      return { success: false, error: "config must be defined." };
    }

    const exercise: SavedExercise = {
      id,
      title,
      date,
      consegna,
      sourceTag,
      mode,
      config: rec.config
    };

    return { success: true, data: exercise };
  }
};

export const exerciseListBoundaryParser: BoundaryParser<SavedExercise[]> = {
  parse(raw: unknown) {
    if (!Array.isArray(raw)) {
      return { success: false, error: "Expected an array of SavedExercise." };
    }

    const exercises: SavedExercise[] = [];
    for (let i = 0; i < raw.length; i++) {
      const itemParsed = savedExerciseBoundaryParser.parse(raw[i]);
      if (!itemParsed.success) {
        return { success: false, error: `Invalid exercise at index ${i}: ${itemParsed.error}` };
      }
      exercises.push(itemParsed.data);
    }

    return { success: true, data: exercises };
  }
};

export function createExercise<TConfig = unknown>({
  title,
  consegna,
  mode,
  config,
  isAiGenerated = false
}: {
  title: string;
  consegna: string;
  mode: LabMode;
  config: TConfig;
  isAiGenerated?: boolean;
}): SavedExercise<TConfig> {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `ex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    id,
    title,
    date: new Date().toISOString(),
    consegna,
    sourceTag: isAiGenerated ? "ai" : "manual",
    mode,
    config
  };
}

export function markExerciseAsModified<TConfig = unknown>(
  exercise: SavedExercise<TConfig>,
  newConfig?: TConfig
): SavedExercise<TConfig> {
  return {
    ...exercise,
    sourceTag: "manual",
    config: newConfig !== undefined ? newConfig : exercise.config
  };
}

export function updateExerciseMetadata<TConfig = unknown>(
  exercise: SavedExercise<TConfig>,
  updates: {
    title?: string;
    consegna?: string;
    date?: string;
  }
): SavedExercise<TConfig> {
  return {
    ...exercise,
    title: updates.title !== undefined ? updates.title : exercise.title,
    consegna: updates.consegna !== undefined ? updates.consegna : exercise.consegna,
    date: updates.date !== undefined ? updates.date : exercise.date
  };
}

export function removeExercise<TConfig = unknown>(list: SavedExercise<TConfig>[], id: string): SavedExercise<TConfig>[] {
  return list.filter((item) => item.id !== id);
}

export function findExercise<TConfig = unknown>(
  list: SavedExercise<TConfig>[],
  id: string
): SavedExercise<TConfig> | undefined {
  return list.find((item) => item.id === id);
}
