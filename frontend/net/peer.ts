import { api } from "../api.ts";
import type { AppMsg, Head, SignalReply } from "./types.ts";

export type { AppMsg, Head };

/**
 * Peer link: WebRTC data channel negotiated through the match mailbox (seat 0 offers, seat 1 is polite),
 * with automatic fallback to relaying app messages through the same mailbox. The poll doubles as heartbeat.
 */
export class Peer {
  pc: RTCPeerConnection | null = null;
  dc: RTCDataChannel | null = null;
  cursor = 0;
  alive = true;
  timer = 0;
  outbox: unknown[] = [];
  /** Highest spectator cheer id seen; -1 until the first head seeds it without replaying history. */
  cheer = -1;

  constructor(
    public match: string,
    public seat: 0 | 1,
    public ice: RTCIceServer[],
    public onApp: (m: AppMsg, relayed: boolean) => void,
    public onHead: (h: Head) => void,
  ) {
    this.connect();
    this.poll();
  }

  get direct(): boolean {
    return this.dc?.readyState === "open";
  }

  private connect(): void {
    try {
      this.pc?.close();
      const pc = new RTCPeerConnection({ iceServers: this.ice });
      this.pc = pc;
      pc.onicecandidate = (e) => e.candidate && this.signal({ sig: "ice", cand: e.candidate.toJSON() });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" && this.seat === 0 && this.alive) this.offer(true).catch(() => {});
      };
      if (this.seat === 0) {
        this.wire(pc.createDataChannel("game", { ordered: true }));
        this.offer(false).catch(() => {
          /* negotiation failed: the mailbox relay carries the match */
        });
      } else pc.ondatachannel = (e) => this.wire(e.channel);
    } catch {
      this.pc = null;
    }
  }

  private async offer(restart: boolean): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    await pc.setLocalDescription(await pc.createOffer({ iceRestart: restart }));
    this.signal({ sig: "offer", sdp: pc.localDescription!.toJSON() });
  }

  private wire(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onmessage = (e) => {
      try {
        this.onApp(JSON.parse(e.data), false);
      } catch {
        /* malformed peer frame */
      }
    };
  }

  private signal(body: unknown): void {
    this.outbox.push(body);
    if (this.outbox.length === 1) queueMicrotask(() => this.flush());
  }

  private async flush(): Promise<void> {
    while (this.outbox.length && this.alive) {
      const msg = this.outbox.shift();
      try {
        this.handle(await api<SignalReply>(`/match/${this.match}/signal`, { msg, after: this.cursor, cheer: this.cheer }));
      } catch {
        this.outbox.unshift(msg);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  private async poll(): Promise<void> {
    if (!this.alive) return;
    try {
      this.handle(await api<SignalReply>(`/match/${this.match}/signal`, { after: this.cursor, cheer: this.cheer }));
    } catch {
      /* transient: next poll retries */
    }
    this.timer = setTimeout(() => this.poll(), this.direct ? 2000 : 700);
  }

  /** Replies from the poll and the flush can overlap; a chain keeps processing ordered and once-only. */
  private chain: Promise<void> = Promise.resolve();
  private handle(r: SignalReply): Promise<void> {
    this.chain = this.chain.then(() => this.process(r));
    return this.chain;
  }

  private async process(r: SignalReply): Promise<void> {
    const seeded = this.cheer >= 0, fresh = r.head.cheers.filter((c) => c.id > this.cheer);
    this.cheer = Math.max(this.cheer, 0, ...r.head.cheers.map((c) => c.id));
    this.onHead({ ...r.head, cheers: seeded ? fresh : [] });
    for (const m of r.msgs) {
      if (m.id <= this.cursor) continue;
      this.cursor = m.id;
      const b = m.body;
      if (b.app) {
        this.onApp(b.app, true);
        continue;
      }
      const pc = this.pc;
      if (!pc) continue;
      try {
        if (b.sig === "offer" && b.sdp) {
          await pc.setRemoteDescription(b.sdp);
          await pc.setLocalDescription(await pc.createAnswer());
          this.signal({ sig: "answer", sdp: pc.localDescription!.toJSON() });
        } else if (b.sig === "answer" && b.sdp) await pc.setRemoteDescription(b.sdp);
        else if (b.sig === "ice" && b.cand) await pc.addIceCandidate(b.cand);
      } catch {
        /* stale negotiation message */
      }
    }
  }

  /** Reliable delivery: data channel when open, mailbox relay otherwise. `lossy` frames are dropped without a direct path. */
  send(m: AppMsg, lossy = false): void {
    if (this.direct) this.dc!.send(JSON.stringify(m));
    else if (!lossy) this.signal({ app: m });
  }

  close(): void {
    this.alive = false;
    clearTimeout(this.timer);
    this.dc?.close();
    this.pc?.close();
  }
}
