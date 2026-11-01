export class ReplayBuffer {
  constructor({ emit, waiting = () => {}, now = Date.now, delay = 0 }) {
    this.emit = emit;
    this.waiting = waiting;
    this.now = now;
    this.delay = this.clamp(delay);
    this.reset();
  }
  clamp(value) {
    return Math.min(180, Math.max(0, Math.round((Number(value) || 0) / 5) * 5));
  }
  reset(key = '') {
    this.key = key;
    this.frames = [];
    this.last = null;
    this.waitingShown = false;
  }
  setDelay(seconds) {
    const next = this.clamp(seconds);
    if (next === this.delay) return false;
    this.delay = next;
    this.last = null;
    this.waitingShown = false;
    this.tick();
    return true;
  }
  push(data) {
    const key = data.game.leagueId + '/' + data.game.id;
    if (key !== this.key) this.reset(key);
    const at = this.now();
    this.frames.push({ at, data: structuredClone(data) });
    // Retain enough history to change the delay, with a strict memory bound.
    this.frames = this.frames.filter((f) => f.at >= at - 240000).slice(-128);
    this.tick();
  }
  tick() {
    const target = this.now() - this.delay * 1000;
    const frame = this.frames.findLast((f) => f.at <= target);
    if (!frame) {
      if (!this.waitingShown && this.frames.length) {
        this.waitingShown = true;
        this.waiting(this.frames[0].data.game);
      }
      return;
    }
    if (frame === this.last) return;
    this.waitingShown = false;
    this.last = frame;
    this.emit(structuredClone(frame.data));
  }
  remaining() {
    return this.frames.length && !this.last
      ? Math.max(
          0,
          Math.ceil(
            (this.frames[0].at + this.delay * 1000 - this.now()) / 1000,
          ),
        )
      : 0;
  }
}
