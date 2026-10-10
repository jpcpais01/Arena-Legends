// Arena Cup lobby over the same peer-to-peer rooms as online duels. The host
// opens a room (its code starts with CUP_PREFIX), friends join with their hero,
// and when the host starts, everyone gets the drawn cup and plays it on their
// own device: fights are deterministic, so no connection is needed after that.
import { parseCharacter, type PlayerCharacter } from '../character/profile';
import { MAX_HUMANS, parseCup, type Cup } from '../cup/cup';
import { Channel, GuestLink, HostLink } from './link';
import { newRoomCode, PROTOCOL, type Msg } from './protocol';

export interface LobbyMember { pid: string; build: PlayerCharacter; level: number }
/** Characters per piece of the cup sent at the start (well under the 16 KB message cap even for 3-byte characters). */
const PART = 5000;

export type CupLobbyError = 'offline' | 'browser' | 'no-room' | 'full' | 'version' | 'started' | 'closed';

/** The hero as sent over the wire. */
function member(raw: { pid?: unknown; build?: unknown; level?: unknown }): LobbyMember | null {
  const build = parseCharacter(raw.build);
  const pid = typeof raw.pid === 'string' ? raw.pid.slice(0, 64) : '';
  if (!build || !pid) return null;
  return { pid, build, level: Math.max(1, Math.min(9999, Math.floor(Number(raw.level)) || 1)) };
}

export class CupHost {
  code = newRoomCode(true);
  state: 'opening' | 'open' | 'error' = 'opening';
  error: CupLobbyError | null = null;
  readonly members: LobbyMember[];
  onChange: () => void = () => {};
  private link: HostLink | null = null;
  private chans = new Map<Channel, string>();
  private closed = false;
  private started = false;

  constructor(me: LobbyMember) {
    this.members = [me];
  }

  get isStarted(): boolean { return this.started; }

  async start(): Promise<void> {
    this.state = 'opening';
    this.error = null;
    this.onChange();
    for (let attempt = 0; attempt < 6 && !this.closed; attempt++) {
      try {
        this.link = await HostLink.open(this.code, {
          message: (ch, m) => this.onMessage(ch, m),
          closed: (ch) => this.onClosed(ch),
          server: () => {},
        });
        if (this.closed) { this.link.close(); return; }
        this.state = 'open';
        this.onChange();
        return;
      } catch (e) {
        const why = (e as Error).message;
        if (why === 'taken') { this.code = newRoomCode(true); continue; }
        this.fail(why === 'browser' ? 'browser' : 'offline');
        return;
      }
    }
    if (!this.closed) this.fail('offline');
  }

  private fail(e: CupLobbyError): void {
    this.state = 'error';
    this.error = e;
    this.onChange();
  }

  private onMessage(ch: Channel, m: Msg): void {
    if (this.closed) return;
    if (m.t === 'bye') { this.onClosed(ch); ch.drop(); return; }
    if (m.t !== 'cupJoin') return;
    const reject = (reason: 'version' | 'full' | 'started') => {
      ch.send({ t: 'reject', reason, version: __APP_VERSION__ });
      setTimeout(() => ch.drop(), 800);
    };
    if (m.proto !== PROTOCOL || m.version !== __APP_VERSION__) { reject('version'); return; }
    if (this.started) { reject('started'); return; }
    const who = member(m);
    if (!who || who.pid === this.members[0].pid) { reject('full'); return; }
    const i = this.members.findIndex((x) => x.pid === who.pid);
    if (i < 0 && this.members.length >= MAX_HUMANS) { reject('full'); return; }
    // The same player again (a reload, a second tab): the newer channel replaces the old one.
    for (const [c, pid] of this.chans) if (pid === who.pid && c !== ch) { this.chans.delete(c); c.drop(); }
    if (i >= 0) this.members[i] = who; else this.members.push(who);
    this.chans.set(ch, who.pid);
    this.broadcast();
  }

  private onClosed(ch: Channel): void {
    const pid = this.chans.get(ch);
    if (pid === undefined) return;
    this.chans.delete(ch);
    if (this.started || this.closed) return;
    const i = this.members.findIndex((x) => x.pid === pid);
    if (i > 0) this.members.splice(i, 1);
    this.broadcast();
  }

  private broadcast(): void {
    const msg: Msg = { t: 'cupRoom', members: this.members.map((x) => ({ pid: x.pid, build: x.build, level: x.level })) };
    for (const c of this.chans.keys()) c.send(msg);
    this.onChange();
  }

  /** Sends the drawn cup to everyone, then closes the room once it has had time to arrive. */
  begin(cup: Cup): void {
    this.started = true;
    const json = JSON.stringify(cup);
    const n = Math.ceil(json.length / PART);
    for (const c of this.chans.keys()) {
      for (let i = 0; i < n; i++) c.send({ t: 'cupPart', id: cup.id, i, n, data: json.slice(i * PART, (i + 1) * PART) });
    }
    setTimeout(() => this.close(), 8000);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.started) for (const c of this.chans.keys()) c.send({ t: 'bye' });
    const link = this.link;
    // Let the last messages leave before the room goes.
    setTimeout(() => { for (const c of this.chans.keys()) c.drop(); link?.close(); }, 300);
  }
}

export class CupGuest {
  state: 'joining' | 'in' | 'error' = 'joining';
  error: CupLobbyError | null = null;
  members: LobbyMember[] = [];
  onChange: () => void = () => {};
  onStart: (cup: Cup) => void = () => {};
  private link: GuestLink;
  private ch: Channel | null = null;
  private done = false;
  /** Pieces of the cup arriving at the start. */
  private parts: { id: string; got: string[]; left: number } | null = null;

  constructor(readonly code: string, private readonly me: LobbyMember) {
    this.link = new GuestLink(code, {
      open: (ch) => {
        this.ch = ch;
        ch.send({ t: 'cupJoin', proto: PROTOCOL, version: __APP_VERSION__, pid: me.pid, build: me.build, level: me.level });
      },
      message: (m) => this.onMessage(m),
      lost: () => { if (this.state === 'in') { this.state = 'joining'; this.onChange(); } },
      noRoom: () => this.fail('no-room'),
      offline: (why) => this.fail(why),
    }, false);
  }

  start(): void {
    this.onChange();
    void this.link.start();
  }

  private fail(e: CupLobbyError): void {
    if (this.done) return;
    this.state = 'error';
    this.error = e;
    this.link.close();
    this.onChange();
  }

  private onMessage(m: Msg): void {
    if (this.done) return;
    if (m.t === 'cupRoom') {
      this.members = (Array.isArray(m.members) ? m.members : []).map((x) => member(x)).filter((x): x is LobbyMember => !!x);
      this.state = 'in';
      this.onChange();
    } else if (m.t === 'cupPart') {
      const n = Math.floor(Number(m.n)), i = Math.floor(Number(m.i));
      if (!(n > 0 && n < 200 && i >= 0 && i < n) || typeof m.data !== 'string') return;
      if (this.parts?.id !== m.id || this.parts.got.length !== n) this.parts = { id: String(m.id), got: new Array<string>(n), left: n };
      const p = this.parts;
      if (p.got[i] === undefined) { p.got[i] = m.data; p.left--; }
      if (p.left > 0) return;
      let cup: Cup | null = null;
      try { cup = parseCup(JSON.parse(p.got.join(''))); } catch { cup = null; }
      const me = cup?.entrants.findIndex((e) => e.pid === this.me.pid) ?? -1;
      if (!cup || me < 0) { this.fail('closed'); return; }
      this.done = true;
      this.link.close();
      this.onStart({ ...cup, me });
    } else if (m.t === 'reject') {
      this.fail(m.reason === 'version' ? 'version' : m.reason === 'started' ? 'started' : 'full');
    } else if (m.t === 'bye') {
      this.fail('closed');
    }
  }

  /** Leaves the lobby, telling the host. */
  close(): void {
    this.done = true;
    this.ch?.send({ t: 'bye' });
    const link = this.link;
    setTimeout(() => link.close(), 200);
  }
}
