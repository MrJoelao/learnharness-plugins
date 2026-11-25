import type { PluginUi } from "learnharness-plugin-api";
import type { LabMode, SavedExercise, ControlAction, AiTurnRequest, AiTurnResponse } from "../../types/ai.js";

export type CopilotUiMode = "pill" | "sheet" | "drawer" | "minimized";

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  generatedExercise?: SavedExercise;
  controlActions?: ControlAction[];
  toolCalls?: unknown[];
  error?: string;
}

export interface CopilotDrawerOptions {
  mode: LabMode;
  initialState?: CopilotUiMode;
  onApplyExercise?: (exercise: SavedExercise) => void;
  onExecuteControlAction?: (action: ControlAction) => void;
  getSimulatorSnapshot?: () => unknown;
  onHistoryChange?: (exercises: SavedExercise[]) => void;
  initialExercises?: SavedExercise[];
  backendCall?: (request: AiTurnRequest) => Promise<AiTurnResponse>;
  targetContainer?: HTMLElement;
  signal?: AbortSignal;
  ui?: PluginUi;
  autoApplyExercise?: boolean;
  onTurnResponse?: (response: AiTurnResponse) => void;
}
