import { registerTable } from "../shared/catalog.ts";
import { preview } from "./preview.ts";
import type { PredictionRequest, PredictionResult } from "./game/predictor.ts";

const scope = self as unknown as Worker;
scope.onmessage = (e: MessageEvent<PredictionRequest>) => {
  const { id, state, cmd, cue, level, options, table } = e.data;
  try {
    registerTable(table);
    const result: PredictionResult = { id, preview: preview(state, cmd, cue, level, options) };
    scope.postMessage(result);
  } catch {
    scope.postMessage({ id, preview: null } satisfies PredictionResult);
  }
};
