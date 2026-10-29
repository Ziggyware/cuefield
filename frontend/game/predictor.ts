import type { AssistLevel, CueSpec, TableSpec } from "../../shared/catalog.ts";
import type { GameState, StrikeCmd } from "../../shared/game/types.ts";
import { preview, type Preview, type PreviewOptions } from "../preview.ts";

export interface PredictionRequest {
  id: number;
  state: GameState;
  cmd: StrikeCmd;
  cue: CueSpec;
  level: AssistLevel;
  options: PreviewOptions;
  table: TableSpec;
}
export interface PredictionResult { id: number; preview: Preview | null }
type Pending = { request: PredictionRequest; done: (value: Preview | null) => void };

/** At most one worker job and one replaceable pending job: stale aim changes cannot build an unbounded queue. */
export class Predictor {
  private worker: Worker | null = null;
  private started = false;
  private pending: Pending | null = null;
  private current: Pending | null = null;
  private serial = 0;
  private closed = false;

  private start(): void {
    if (this.started) return;
    this.started = true;
    try {
      this.worker = new Worker(new URL("../prediction-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<PredictionResult>) => this.finish(e.data);
      this.worker.onerror = (e) => {
        e.preventDefault();
        this.worker?.terminate();
        this.worker = null;
        if (!this.pending && this.current?.request.id === this.serial) this.pending = this.current;
        this.current = null;
        this.dispatch();
      };
    } catch { this.worker = null; }
  }

  request(req: Omit<PredictionRequest, "id">, done: (value: Preview | null) => void): void {
    if (this.closed) return;
    this.start();
    this.pending = { request: { ...req, id: ++this.serial }, done };
    this.dispatch();
  }

  invalidate(): void { this.serial++; this.pending = null; }
  stop(): void { this.closed = true; this.pending = null; this.current = null; this.worker?.terminate(); }

  private dispatch(): void {
    if (this.closed || this.current || !this.pending) return;
    this.current = this.pending;
    this.pending = null;
    const req = this.current.request;
    if (this.worker) this.worker.postMessage(req);
    else setTimeout(() => {
      if (this.closed || this.current?.request.id !== req.id) return;
      let value: Preview | null = null;
      try { value = preview(req.state, req.cmd, req.cue, req.level, req.options); } catch { /* invalid transient state */ }
      this.finish({ id: req.id, preview: value });
    }, 0);
  }

  private finish(result: PredictionResult): void {
    const current = this.current;
    if (!current || current.request.id !== result.id) return;
    this.current = null;
    if (result.id === this.serial && !this.closed) current.done(result.preview);
    this.dispatch();
  }
}
