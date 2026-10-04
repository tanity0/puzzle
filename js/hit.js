// アイテム形状（画像ピクセル座標）の当たり判定とバウンディングボックス。
// ゲーム本体とシーンエディタで共有する。
//
//   rect   : [x, y, w, h]
//   circle : [cx, cy, r]
//   poly   : [x1, y1, x2, y2, ...]

export function bbox(it) {
  const c = it.coords;
  if (it.shape === 'circle') return { x: c[0] - c[2], y: c[1] - c[2], w: c[2] * 2, h: c[2] * 2 };
  if (it.shape === 'poly') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < c.length; i += 2) {
      x0 = Math.min(x0, c[i]); x1 = Math.max(x1, c[i]);
      y0 = Math.min(y0, c[i + 1]); y1 = Math.max(y1, c[i + 1]);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return { x: c[0], y: c[1], w: c[2], h: c[3] };
}

export function center(it) {
  const b = bbox(it);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// tol: 指で押しやすくするための余白（画像ピクセル単位）
export function hitTest(it, px, py, tol = 0) {
  const c = it.coords;
  if (it.shape === 'circle') return Math.hypot(px - c[0], py - c[1]) <= c[2] + tol;
  if (it.shape === 'poly') {
    if (inPoly(c, px, py)) return true;
    if (tol <= 0) return false;
    const n = c.length;
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n;
      if (segDist(px, py, c[i], c[i + 1], c[j], c[j + 1]) <= tol) return true;
    }
    return false;
  }
  return px >= c[0] - tol && px <= c[0] + c[2] + tol && py >= c[1] - tol && py <= c[1] + c[3] + tol;
}

function inPoly(c, px, py) {
  let inside = false;
  for (let i = 0, j = c.length - 2; i < c.length; j = i, i += 2) {
    const xi = c[i], yi = c[i + 1], xj = c[j], yj = c[j + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// アイテム形状をそのまま SVG 要素にする（エディタの描画用）
export function shapeElement(it, attrs = {}) {
  const c = it.coords;
  if (it.shape === 'circle') return svgEl('circle', { cx: c[0], cy: c[1], r: c[2], ...attrs });
  if (it.shape === 'poly') return svgEl('polygon', { points: c.join(' '), ...attrs });
  return svgEl('rect', { x: c[0], y: c[1], width: c[2], height: c[3], ...attrs });
}
