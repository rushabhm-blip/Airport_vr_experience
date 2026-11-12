/**
 * Presentation coordinator: exactly one *mode* decides which surfaces may be visible and which inputs are live.
 * There is never more than one primary surface. Pure logic (no three.js) so it can be unit-tested.
 *
 * Modes
 *   scene   the airport and the current task objects; one compact caption/guide + the quiet utility row
 *   phone   the virtual phone is the reading surface; the guide shrinks to a one-line cue
 *   staff   a short conversation with a person; it REPLACES the guide content (never a second card)
 *   demo    a demonstration is playing; the guide shows what is being shown, lesson objects are locked
 *   settings the settings card only
 *   paused  the pause card only (Resume / Exit)
 *   safety  boundary / tracking loss: nothing but the safety card
 */
export const MODES = ['scene', 'phone', 'staff', 'demo', 'settings', 'paused', 'safety'];

export const SURFACES = ['guide', 'utility', 'phone', 'settings', 'pause', 'safety', 'staffBubble'];

const RULES = {
  scene:    { surfaces: ['guide', 'utility', 'staffBubble'], lessonInput: true,  systemInput: true },
  phone:    { surfaces: ['guide', 'utility', 'phone'],       lessonInput: true,  systemInput: true },
  staff:    { surfaces: ['guide', 'utility'],                lessonInput: true,  systemInput: true },
  demo:     { surfaces: ['guide', 'utility'],                lessonInput: false, systemInput: true },
  settings: { surfaces: ['settings'],                        lessonInput: false, systemInput: true },
  paused:   { surfaces: ['pause'],                           lessonInput: false, systemInput: true },
  safety:   { surfaces: ['safety'],                          lessonInput: false, systemInput: true },
};

// Which modes may be entered from which. Safety and pause can interrupt anything; settings only from calm modes.
const ALLOWED = {
  scene:    ['phone', 'staff', 'demo', 'settings', 'paused', 'safety'],
  phone:    ['scene', 'staff', 'settings', 'paused', 'safety'],
  staff:    ['scene', 'phone', 'demo', 'settings', 'paused', 'safety'],
  demo:     ['scene', 'staff', 'paused', 'safety'],
  settings: ['scene', 'phone', 'staff', 'paused', 'safety'],
  paused:   ['scene', 'phone', 'staff', 'demo', 'settings', 'safety'],
  safety:   ['scene', 'phone', 'paused'],
};

export class Presentation {
  constructor(onChange = () => {}) { this.mode = 'scene'; this.stack = []; this.onChange = onChange; this.conversation = null; }

  rules() { return RULES[this.mode]; }
  visible(surface) { return RULES[this.mode].surfaces.includes(surface); }
  lessonInputLive() { return RULES[this.mode].lessonInput; }
  systemInputLive() { return RULES[this.mode].systemInput; }
  /** The one surface the learner is meant to be reading right now. */
  primary() { return { scene: 'guide', phone: 'phone', staff: 'guide', demo: 'guide', settings: 'settings', paused: 'pause', safety: 'safety' }[this.mode]; }

  /** Request a mode. Returns true if it was entered. Entering the same mode is a harmless no-op. */
  enter(mode, info = null) {
    if (!MODES.includes(mode)) throw new Error('unknown mode ' + mode);
    if (mode === this.mode) { if (mode === 'staff') this.conversation = info ?? this.conversation; return true; }
    if (!ALLOWED[this.mode].includes(mode)) return false;
    // modes that can be returned from remember where we came from
    if (['settings', 'paused', 'safety', 'staff', 'demo'].includes(mode)) this.stack.push(this.mode);
    this.mode = mode; this.conversation = mode === 'staff' ? info : null;
    this.onChange(this.mode); return true;
  }

  /** Leave the current interrupting mode and go back to what was underneath (default scene). */
  back() {
    const to = this.stack.pop() || 'scene';
    this.mode = to; this.conversation = null; this.onChange(this.mode); return to;
  }

  /** Selecting a person: returns what should happen. Repeated selection never duplicates anything. */
  selectPerson(id) {
    if (this.mode === 'staff' && this.conversation === id) return 'repeat';        // say the same short line again, no new surface
    if (['settings', 'paused', 'safety', 'demo'].includes(this.mode)) return 'ignored';
    this.enter('staff', id); return 'started';
  }
}
