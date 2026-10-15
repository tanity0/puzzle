// シーン画像のパン・ピンチズーム・タップ判定。
// content 要素を translate + scale で動かし、タップ位置を画像座標に変換して返す。

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const TAP_SLOP = 8; // px。これ以上動いたらドラッグ扱い
const TAP_TIME = 600; // ms

export class Viewport {
  constructor(stage, content, opts = {}) {
    this.stage = stage;
    this.content = content;
    this.opts = opts;
    this.w = 1;
    this.h = 1;
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.min = 0.1;
    this.max = 4;
    this.locked = false;
    this.ready = false;
    this.pointers = new Map();
    this.gesture = null;

    stage.addEventListener('pointerdown', (e) => this.down(e));
    stage.addEventListener('pointermove', (e) => this.move(e));
    stage.addEventListener('pointerup', (e) => this.up(e, false));
    stage.addEventListener('pointercancel', (e) => this.up(e, true));
    stage.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    new ResizeObserver(() => this.fit(true)).observe(stage);
  }

  rect() {
    return this.stage.getBoundingClientRect();
  }

  local(e) {
    const r = this.rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  toImage(p) {
    return { x: (p.x - this.tx) / this.scale, y: (p.y - this.ty) / this.scale };
  }

  toStage(ip) {
    return { x: ip.x * this.scale + this.tx, y: ip.y * this.scale + this.ty };
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.content.style.width = `${w}px`;
    this.content.style.height = `${h}px`;
    this.ready = false;
    this.fit(false);
  }

  // 初期表示は画面を埋める（cover）。ピンチアウトで全体表示（contain）まで引ける。
  fit(keep) {
    const r = this.rect();
    if (!r.width || !r.height) return;
    const contain = Math.min(r.width / this.w, r.height / this.h);
    const cover = Math.max(r.width / this.w, r.height / this.h);
    this.min = contain;
    this.max = Math.max(cover * 2.5, contain * 4);
    if (keep && this.ready) {
      const c = this.toImage({ x: this.lastW / 2, y: this.lastH / 2 });
      this.scale = clamp(this.scale, this.min, this.max);
      this.tx = r.width / 2 - c.x * this.scale;
      this.ty = r.height / 2 - c.y * this.scale;
    } else {
      this.scale = cover;
      this.tx = (r.width - this.w * cover) / 2;
      this.ty = (r.height - this.h * cover) / 2;
    }
    this.lastW = r.width;
    this.lastH = r.height;
    this.ready = true;
    this.clamp();
    this.apply();
  }

  clamp() {
    const r = this.rect();
    const cw = this.w * this.scale;
    const ch = this.h * this.scale;
    this.tx = cw <= r.width ? (r.width - cw) / 2 : clamp(this.tx, r.width - cw, 0);
    this.ty = ch <= r.height ? (r.height - ch) / 2 : clamp(this.ty, r.height - ch, 0);
  }

  apply() {
    this.content.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    this.opts.onChange?.();
  }

  zoomAt(sx, sy, next) {
    next = clamp(next, this.min, this.max);
    const ix = (sx - this.tx) / this.scale;
    const iy = (sy - this.ty) / this.scale;
    this.scale = next;
    this.tx = sx - ix * next;
    this.ty = sy - iy * next;
    this.clamp();
    this.apply();
  }

  zoomBy(f) {
    const r = this.rect();
    this.animate();
    this.zoomAt(r.width / 2, r.height / 2, this.scale * f);
  }

  centerOn(ix, iy, scale = this.scale) {
    const r = this.rect();
    this.scale = clamp(scale, this.min, this.max);
    this.tx = r.width / 2 - ix * this.scale;
    this.ty = r.height / 2 - iy * this.scale;
    this.clamp();
    this.animate();
    this.apply();
  }

  animate() {
    this.content.classList.add('anim');
    clearTimeout(this.animTimer);
    this.animTimer = setTimeout(() => this.content.classList.remove('anim'), 450);
  }

  down(e) {
    if (this.locked) return;
    this.content.classList.remove('anim');
    this.stage.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.gesture = { type: 'pan', start: p, last: p, t: performance.now(), moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = { type: 'pinch', dist: dist(a, b), scale: this.scale, mid: mid(a, b) };
    }
    this.opts.onPointer?.(p);
  }

  move(e) {
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') this.opts.onPointer?.(p);
      return;
    }
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;
    if (g.type === 'pan') {
      if (!g.moved && dist(p, g.start) > TAP_SLOP) g.moved = true;
      if (g.moved) {
        this.tx += p.x - g.last.x;
        this.ty += p.y - g.last.y;
        this.clamp();
        this.apply();
      }
      g.last = p;
    } else if (g.type === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const m = mid(a, b);
      this.zoomAt(m.x, m.y, (g.scale * dist(a, b)) / g.dist);
      this.tx += m.x - g.mid.x;
      this.ty += m.y - g.mid.y;
      g.mid = m;
      this.clamp();
      this.apply();
    }
    this.opts.onPointer?.(p);
  }

  up(e, cancelled) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (g && g.type === 'pan' && !g.moved && !cancelled && !this.locked && performance.now() - g.t < TAP_TIME) {
      this.opts.onTap?.(this.toImage(p), p);
    }
    if (this.pointers.size === 1) {
      // ピンチの途中で一本指が離れた → 残りの指でパンを継続（タップにはしない）
      const q = [...this.pointers.values()][0];
      this.gesture = { type: 'pan', start: q, last: q, t: 0, moved: true };
    } else if (this.pointers.size === 0) {
      this.gesture = null;
    }
  }

  wheel(e) {
    e.preventDefault();
    if (this.locked) return;
    const p = this.local(e);
    this.zoomAt(p.x, p.y, this.scale * Math.exp(-e.deltaY * 0.0015));
  }
}
