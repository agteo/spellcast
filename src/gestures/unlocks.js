export const GESTURE_CATALOG = [
  { id: 'fingerHeart', icon: '♥', label: 'Finger Heart' },
  { id: 'strangeCircle', icon: '◎', label: 'Strange Circle' },
  { id: 'dab', icon: '↗', label: 'Dab' },
  { id: 'armsV', icon: 'Ⅴ', label: 'Arms V' },
  { id: 'fingerGun', icon: '⌁', label: 'Finger Gun' },
];

const COMBO_WINDOW_MS = 4500;

/** Session-only discovery tracker; no backend or persistent identity. */
export class UnlockTracker {
  constructor(container) {
    this.container = container;
    this.unlocked = new Set();
    this.items = new Map();
    this.bestCombo = 0;
    this._combo = 0;
    this._lastFireAt = 0;
    for (const gesture of GESTURE_CATALOG) {
      const item = document.createElement('div');
      item.className = 'unlock-item';
      item.dataset.gesture = gesture.id;
      item.innerHTML = `
        <span class="unlock-icon" aria-hidden="true">${gesture.icon}</span>
        <span class="unlock-label">${gesture.label}</span>
      `;
      container.appendChild(item);
      this.items.set(gesture.id, item);
    }
    this.#updateCount();
  }

  /**
   * Mark a gesture as discovered (first time) and advance the session combo.
   * @returns {boolean} true if this was a first unlock
   */
  unlock(id) {
    this.#noteFire();
    if (this.unlocked.has(id)) return false;
    const item = this.items.get(id);
    if (!item) return false;
    this.unlocked.add(id);
    item.classList.add('unlocked');
    item.animate(
      [
        { transform: 'scale(0.92)', filter: 'brightness(1)' },
        { transform: 'scale(1.08)', filter: 'brightness(1.8)' },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      { duration: 500, easing: 'ease-out' },
    );
    this.#updateCount();
    return true;
  }

  /** Snapshot for share-card rendering. */
  snapshot() {
    return {
      unlocked: new Set(this.unlocked),
      unlockedCount: this.unlocked.size,
      bestCombo: this.bestCombo,
    };
  }

  #noteFire() {
    const now = performance.now();
    if (now - this._lastFireAt <= COMBO_WINDOW_MS) this._combo += 1;
    else this._combo = 1;
    this._lastFireAt = now;
    if (this._combo > this.bestCombo) this.bestCombo = this._combo;
  }

  #updateCount() {
    const count = document.getElementById('unlock-count');
    if (count) count.textContent = `${this.unlocked.size}/${GESTURE_CATALOG.length}`;
  }
}
