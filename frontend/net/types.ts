export interface Head {
  version: number;
  status: "live" | "done";
  shot: number;
  deadline: number;
  now: number;
  next: string | null;
  /** Spectators polling this table now. */
  watching: number;
  /** Spectator reactions after the cheer cursor. */
  cheers: { id: number; kind: number }[];
}

export type AppMsg = { t: string; [k: string]: unknown };

export interface SignalReply {
  msgs: { id: number; body: { sig?: string; app?: AppMsg; sdp?: RTCSessionDescriptionInit; cand?: RTCIceCandidateInit } }[];
  head: Head;
}
