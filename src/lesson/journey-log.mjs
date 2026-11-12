/**
 * Truthful record of how each step ended. Stable step ids, explicit statuses, no index arithmetic.
 *   in-progress | independent | demonstrated | assisted | skipped
 * "independent" means the learner did it with no demonstration and no assistance.
 * "demonstrated" means they watched how, then did it themselves.
 */
export const STATUS = ['not-started', 'in-progress', 'independent', 'demonstrated', 'assisted', 'skipped'];

export class JourneyLog {
  constructor(ids = []) { this.ids = ids.slice(); this.status = new Map(ids.map((i) => [i, 'not-started'])); this.flags = new Map(); }
  start(id) { this.status.set(id, 'in-progress'); this.flags.set(id, { demo: false, assist: false }); }
  noteDemo(id) { const f = this.flags.get(id); if (f) f.demo = true; }
  noteAssist(id) { const f = this.flags.get(id); if (f) f.assist = true; }
  /** Learner finished the task (their own action). */
  complete(id) {
    const f = this.flags.get(id) || { demo: false, assist: false };
    this.status.set(id, f.assist ? 'assisted' : f.demo ? 'demonstrated' : 'independent');
  }
  skip(id) { if (this.status.get(id) !== 'independent' && this.status.get(id) !== 'assisted' && this.status.get(id) !== 'demonstrated') this.status.set(id, 'skipped'); }
  get(id) { return this.status.get(id) || 'not-started'; }
  counts() { const c = { independent: 0, demonstrated: 0, assisted: 0, skipped: 0, 'not-started': 0, 'in-progress': 0 }; for (const i of this.ids) c[this.get(i)]++; return c; }

  /** Plain-language summary. Never claims more than happened. */
  summary(names = {}) {
    const c = this.counts(), name = (i) => names[i] || i;
    const list = (s) => this.ids.filter((i) => this.get(i) === s).map(name);
    const parts = [];
    if (c.independent) parts.push(`On your own: ${list('independent').join(', ')}.`);
    if (c.demonstrated) parts.push(`After a demonstration: ${list('demonstrated').join(', ')}.`);
    if (c.assisted) parts.push(`With help: ${list('assisted').join(', ')}.`);
    if (c.skipped) parts.push(`Skipped: ${list('skipped').join(', ')}.`);
    if (c['not-started'] || c['in-progress']) parts.push(`Not finished: ${[...list('not-started'), ...list('in-progress')].join(', ')}.`);
    return parts.join(' ');
  }
  retryable() { return this.ids.filter((i) => ['assisted', 'skipped', 'demonstrated'].includes(this.get(i))); }
}
