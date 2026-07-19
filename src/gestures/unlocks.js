export const GESTURE_CATALOG = [
  { id: 'fingerHeart', icon: '♥', label: 'Finger Heart' },
  { id: 'strangeCircle', icon: '◎', label: 'Strange Circle' },
  { id: 'dab', icon: '↗', label: 'Dab' },
  { id: 'armsV', icon: 'Ⅴ', label: 'Arms V' },
  { id: 'fingerGun', icon: '⌁', label: 'Finger Gun' },
];

/** Session-only discovery tracker; no backend or persistent identity. */
export class UnlockTracker {
  constructor(container) {
    this.container = container;
    this.unlocked = new Set();
    this.items = new Map();
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

  unlock(id) {
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

  #updateCount() {
    const count = document.getElementById('unlock-count');
    if (count) count.textContent = `${this.unlocked.size}/${GESTURE_CATALOG.length}`;
  }
}
