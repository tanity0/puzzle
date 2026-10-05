// 依頼エディタ：写真の上に「核」と「痕跡」の当たり判定を描き、request.json を書き出す。

import { bbox, hitTest, shapeElement, svgEl } from './hit.js';

const $ = (s) => document.querySelector(s);
const AUTOSAVE = 'kakuresama.editor.v2';

const svg = $('#svg');
const img = $('#img');
const canvas = $('#canvas');
const wrap = $('#canvas-wrap');

const st = {
  req: blankRequest(),
  imgBlob: null,
  imgURL: null,
  imgName: '',
  zoom: 1,
  tool: 'rect',
  sel: null,
  draft: null,
  drag: null,
  hover: null,
};

function blankRequest() {
  return {
    id: '002', title: '', client: '', letter: [], image: 'photo.webp', width: 0, height: 0,
    flashlight: false, exorcised: '', epilogue: [], truth: [], items: [],
  };
}

// ---------------------------------------------------------------- 保存・読み込み

let autosaveTimer = 0;
function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try { localStorage.setItem(AUTOSAVE, JSON.stringify(st.req)); } catch { /* 容量不足等は無視 */ }
  }, 300);
  validate();
}

function restore() {
  try {
    const raw = localStorage.getItem(AUTOSAVE);
    if (!raw) return false;
    setRequest(JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

function setRequest(data) {
  st.req = { ...blankRequest(), ...data, items: (data.items || []).map((it) => ({ ...it, coords: it.coords.slice() })) };
  st.sel = null;
  st.draft = null;
  syncForm();
  render();
  renderList();
  autosave();
}

function setImage(blob, name) {
  if (st.imgURL) URL.revokeObjectURL(st.imgURL);
  st.imgBlob = blob;
  st.imgName = name || '';
  st.imgURL = URL.createObjectURL(blob);
  img.onload = () => {
    st.req.width = img.naturalWidth;
    st.req.height = img.naturalHeight;
    svg.setAttribute('viewBox', `0 0 ${st.req.width} ${st.req.height}`);
    canvas.classList.add('has-img');
    $('#empty').hidden = true;
    fitZoom();
    render();
    autosave();
  };
  img.src = st.imgURL;
}

function buildRequest() {
  const s = st.req;
  return {
    id: s.id,
    title: s.title,
    client: s.client,
    letter: s.letter,
    image: s.image,
    width: s.width,
    height: s.height,
    flashlight: !!s.flashlight,
    exorcised: s.exorcised,
    epilogue: s.epilogue,
    truth: s.truth,
    items: s.items.map((it) => {
      const o = { id: it.id, name: it.name, shape: it.shape, coords: it.coords.map((v) => Math.round(v)) };
      if (it.core) o.core = true;
      if (it.text) o.text = it.text;
      return o;
    }),
  };
}

// 座標配列は1行にまとめて読みやすくする
function toJSON() {
  return `${JSON.stringify(buildRequest(), null, 2).replace(/\[\s+([-\d.,\s]+?)\s+\]/g, (_, inner) => `[${inner.replace(/\s+/g, ' ').replace(/ ,/g, ',')}]`)}\n`;
}

async function openServerRequest(id) {
  try {
    const r = await fetch(`requests/${id}/request.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`request.json (${r.status})`);
    const data = await r.json();
    setRequest({ ...data, id: data.id || id });
    const ir = await fetch(`requests/${id}/${data.image}`, { cache: 'no-cache' });
    if (!ir.ok) {
      setStatus(`requests/${id}/${data.image} が見つかりません。画像をそのフォルダに置くか「画像を開く」で読み込んでください。`, true);
      return;
    }
    setImage(await ir.blob(), data.image);
  } catch (err) {
    setStatus(`読み込み失敗: ${err.message}`, true);
  }
}

async function loadServerList() {
  try {
    const r = await fetch('requests/index.json', { cache: 'no-cache' });
    const idx = await r.json();
    const sel = $('#server-requests');
    for (const id of idx.requests) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id;
      sel.appendChild(o);
    }
  } catch {
    $('#server-requests').hidden = true;
  }
}

function handleFiles(files) {
  for (const f of files) {
    if (f.type.startsWith('image/')) setImage(f, f.name);
    else if (f.name.endsWith('.json')) {
      f.text().then((t) => {
        try { setRequest(JSON.parse(t)); } catch (err) { setStatus(`JSONが読めません: ${err.message}`, true); }
      });
    }
  }
}

// ---------------------------------------------------------------- フォーム

function syncForm() {
  const s = st.req;
  $('#f-id').value = s.id;
  $('#f-title').value = s.title;
  $('#f-client').value = s.client || '';
  $('#f-image').value = s.image;
  $('#f-flashlight').checked = !!s.flashlight;
  $('#f-letter').value = (s.letter || []).join('\n');
  $('#f-exorcised').value = s.exorcised || '';
  $('#f-epilogue').value = fromLines(s.epilogue || []);
  $('#f-truth').value = fromLines(s.truth || []);
}

// 鑑定結果・真相は 1行＝1画面。画面内の改行は「\n」と書く。依頼文は書いたままの行（空行＝段落の区切り）。
const toLines = (v) => v.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/\\n/g, '\n'));
const fromLines = (a) => a.map((l) => l.replace(/\n/g, '\\n')).join('\n');

function bindForm() {
  const bind = (sel, key, conv = (v) => v) => $(sel).addEventListener('input', (e) => {
    st.req[key] = conv(e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    autosave();
  });
  bind('#f-id', 'id');
  bind('#f-title', 'title');
  bind('#f-client', 'client');
  bind('#f-image', 'image');
  bind('#f-flashlight', 'flashlight');
  bind('#f-letter', 'letter', (v) => v.replace(/\s+$/, '').split('\n').map((l) => l.trimEnd()));
  bind('#f-exorcised', 'exorcised');
  bind('#f-epilogue', 'epilogue', toLines);
  bind('#f-truth', 'truth', toLines);
}

// ---------------------------------------------------------------- 描画

function render() {
  svg.innerHTML = '';
  svg.classList.toggle('select', st.tool === 'select');
  const fs = 14 / st.zoom;
  for (const it of st.req.items) {
    const cls = ['shape'];
    if (it.id === st.sel) cls.push('sel');
    if (it.core) cls.push('core');
    if (!it.name) cls.push('unnamed');
    svg.appendChild(shapeElement(it, { class: cls.join(' '), 'data-id': it.id }));
    const b = bbox(it);
    const label = svgEl('text', { class: 'label', x: b.x, y: b.y - 4 / st.zoom, 'font-size': fs });
    label.textContent = it.name || '（名前未設定）';
    svg.appendChild(label);
  }
  renderDraft();
}

function renderDraft() {
  svg.querySelectorAll('.draft, .draft-pt').forEach((el) => el.remove());
  const d = st.draft;
  if (!d) return;
  if (d.shape === 'poly') {
    const pts = d.coords.slice();
    if (st.hover) pts.push(st.hover.x, st.hover.y);
    svg.appendChild(svgEl('polyline', { class: 'draft', points: pts.join(' ') }));
    for (let i = 0; i < d.coords.length; i += 2) {
      svg.appendChild(svgEl('circle', { class: 'draft-pt', cx: d.coords[i], cy: d.coords[i + 1], r: 4 / st.zoom }));
    }
  } else {
    svg.appendChild(shapeElement(d, { class: 'draft' }));
  }
}

function renderList() {
  const ol = $('#items');
  ol.innerHTML = '';
  st.req.items.forEach((it, i) => {
    const li = document.createElement('li');
    li.dataset.id = it.id;
    li.classList.toggle('sel', it.id === st.sel);
    li.classList.toggle('core', !!it.core);

    const no = document.createElement('span');
    no.className = 'no';
    no.textContent = i + 1;

    const name = document.createElement('input');
    name.type = 'text';
    name.value = it.name;
    name.placeholder = '名前（例：障子の隙間の目）';
    name.addEventListener('input', () => { it.name = name.value.trim(); render(); autosave(); });

    // 核は 1 つだけ。チェックすると他の核は外れる
    const core = document.createElement('label');
    core.className = 'core-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!it.core;
    cb.addEventListener('change', () => {
      st.req.items.forEach((o) => { o.core = o === it ? cb.checked : false; });
      render();
      renderList();
      autosave();
    });
    core.append(cb, '核');

    const del = document.createElement('button');
    del.className = 'del';
    del.title = '削除';
    del.textContent = '✕';
    del.addEventListener('click', (e) => { e.stopPropagation(); removeItem(it.id); });

    const text = document.createElement('div');
    text.className = 'text';
    const ti = document.createElement('input');
    ti.type = 'text';
    ti.value = it.text || '';
    ti.placeholder = it.core ? '核に触れた時の一文（任意）' : '所見：見つけた時に出す一文';
    ti.addEventListener('input', () => { it.text = ti.value; autosave(); });
    text.appendChild(ti);

    li.append(no, name, core, del, text);
    li.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') { if (st.sel !== it.id) select(it.id, false); return; }
      select(it.id);
    });
    ol.appendChild(li);
  });
  $('#item-count').textContent = `${st.req.items.length} 個`;
}

function select(id, scroll = true) {
  st.sel = id;
  render();
  document.querySelectorAll('#items li').forEach((li) => li.classList.toggle('sel', li.dataset.id === id));
  if (scroll && id) document.querySelector(`#items li[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
}

function removeItem(id) {
  st.req.items = st.req.items.filter((it) => it.id !== id);
  if (st.sel === id) st.sel = null;
  render();
  renderList();
  autosave();
}

function setStatus(text, warn = false) {
  const el = $('#status');
  el.textContent = text;
  el.classList.toggle('warn', warn);
}

function validate() {
  const s = st.req;
  const w = [];
  if (!st.imgURL) w.push('写真が未読み込みです。');
  const cores = s.items.filter((it) => it.core).length;
  if (!cores) w.push('霊障の核がありません。どれか 1 つに「核」のチェックを入れてください。');
  if (!s.items.some((it) => !it.core)) w.push('痕跡がありません。');
  if (!s.letter?.some((l) => l.trim())) w.push('依頼文が空です。');
  const unnamed = s.items.filter((it) => !it.name).length;
  if (unnamed) w.push(`名前のない当たり判定が ${unnamed} 個あります。`);
  const names = s.items.map((it) => it.name).filter(Boolean);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) w.push(`同じ名前があります：${[...new Set(dup)].join('、')}`);
  if (st.imgName && s.image && st.imgName !== s.image) {
    w.push(`読み込んだ写真「${st.imgName}」と画像ファイル名「${s.image}」が違います。requests/${s.id}/${s.image} として置いてください。`);
  }
  if (w.length) setStatus(w.join('\n'), true);
  else setStatus(`OK：核 1 つ・痕跡 ${s.items.length - 1} 個。requests/${s.id}/ に ${s.image} と request.json を置いてください。`);
}

// ---------------------------------------------------------------- ズーム

function setZoom(z) {
  st.zoom = Math.min(8, Math.max(0.1, z));
  canvas.style.width = `${st.req.width * st.zoom}px`;
  canvas.style.height = `${st.req.height * st.zoom}px`;
  $('#zoom-label').textContent = `${Math.round(st.zoom * 100)}%`;
  render();
}

function fitZoom() {
  if (!st.req.width) return;
  const r = wrap.getBoundingClientRect();
  setZoom(Math.min((r.width - 48) / st.req.width, (r.height - 48) / st.req.height));
}

// ---------------------------------------------------------------- 描画操作

function imgPt(e) {
  const r = svg.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * st.req.width,
    y: ((e.clientY - r.top) / r.height) * st.req.height,
  };
}

function uniqueId() {
  let n = st.req.items.length + 1;
  while (st.req.items.some((it) => it.id === `item${n}`)) n++;
  return `item${n}`;
}

function commitDraft() {
  const d = st.draft;
  st.draft = null;
  if (!d) return;
  let coords = d.coords;
  if (d.shape === 'poly') {
    // ダブルクリックで重複した頂点を除く
    const pts = [];
    for (let i = 0; i < coords.length; i += 2) {
      const [x, y] = [coords[i], coords[i + 1]];
      const n = pts.length;
      if (!n || Math.hypot(x - pts[n - 2], y - pts[n - 1]) > 2) pts.push(x, y);
    }
    if (pts.length < 6) return render();
    coords = pts;
  }
  const it = { id: uniqueId(), name: '', shape: d.shape, coords: coords.map((v) => Math.round(v)) };
  st.req.items.push(it);
  st.sel = it.id;
  render();
  renderList();
  autosave();
  document.querySelector(`#items li[data-id="${it.id}"] input[type="text"]`)?.focus();
}

svg.addEventListener('pointerdown', (e) => {
  if (!st.imgURL || e.button !== 0) return;
  const p = imgPt(e);
  if (st.tool === 'select') {
    const hit = [...st.req.items].reverse().find((it) => hitTest(it, p.x, p.y, 4 / st.zoom));
    select(hit?.id ?? null);
    if (hit) {
      st.drag = { it: hit, start: p, orig: hit.coords.slice() };
      svg.setPointerCapture(e.pointerId);
    }
    return;
  }
  if (st.tool === 'poly') {
    if (!st.draft) st.draft = { shape: 'poly', coords: [p.x, p.y] };
    else {
      const c = st.draft.coords;
      if (c.length >= 6 && Math.hypot(p.x - c[0], p.y - c[1]) < 10 / st.zoom) return commitDraft();
      c.push(p.x, p.y);
    }
    return renderDraft();
  }
  st.draft = { shape: st.tool, start: p, coords: st.tool === 'rect' ? [p.x, p.y, 0, 0] : [p.x, p.y, 0] };
  svg.setPointerCapture(e.pointerId);
  renderDraft();
});

svg.addEventListener('pointermove', (e) => {
  if (!st.imgURL) return;
  const p = imgPt(e);
  st.hover = p;
  if (st.drag) {
    const { it, start, orig } = st.drag;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (it.shape === 'poly') it.coords = orig.map((v, i) => v + (i % 2 ? dy : dx));
    else it.coords = [orig[0] + dx, orig[1] + dy, ...orig.slice(2)];
    return render();
  }
  const d = st.draft;
  if (!d) return;
  if (d.shape === 'rect') {
    d.coords = [Math.min(d.start.x, p.x), Math.min(d.start.y, p.y), Math.abs(p.x - d.start.x), Math.abs(p.y - d.start.y)];
  } else if (d.shape === 'circle') {
    d.coords = [d.start.x, d.start.y, Math.hypot(p.x - d.start.x, p.y - d.start.y)];
  }
  renderDraft();
});

svg.addEventListener('pointerup', () => {
  if (st.drag) {
    st.drag.it.coords = st.drag.it.coords.map((v) => Math.round(v));
    st.drag = null;
    autosave();
    return;
  }
  const d = st.draft;
  if (!d || d.shape === 'poly') return;
  const big = d.shape === 'rect' ? d.coords[2] > 4 && d.coords[3] > 4 : d.coords[2] > 3;
  if (big) commitDraft();
  else { st.draft = null; renderDraft(); }
});

svg.addEventListener('dblclick', () => {
  if (st.draft?.shape === 'poly') commitDraft();
});

function setTool(t) {
  st.tool = t;
  st.draft = null;
  document.querySelector(`input[name="tool"][value="${t}"]`).checked = true;
  render();
}

document.querySelectorAll('input[name="tool"]').forEach((r) => r.addEventListener('change', () => setTool(r.value)));

document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    st.draft = null;
    renderDraft();
    if (typing) document.activeElement.blur();
    return;
  }
  if (typing) return;
  if (e.key === 'Enter' && st.draft?.shape === 'poly') return commitDraft();
  if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel) {
    e.preventDefault();
    return removeItem(st.sel);
  }
  const tools = { v: 'select', r: 'rect', c: 'circle', p: 'poly' };
  if (!e.ctrlKey && !e.metaKey && tools[e.key.toLowerCase()]) setTool(tools[e.key.toLowerCase()]);
});

wrap.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey) || !st.imgURL) return;
  e.preventDefault();
  setZoom(st.zoom * Math.exp(-e.deltaY * 0.002));
}, { passive: false });

// ---------------------------------------------------------------- ファイル入出力

$('#file-img').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
$('#file-json').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
$('#server-requests').addEventListener('change', (e) => {
  if (e.target.value) openServerRequest(e.target.value);
  e.target.value = '';
});

wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('drag'); });
wrap.addEventListener('dragleave', () => wrap.classList.remove('drag'));
wrap.addEventListener('drop', (e) => {
  e.preventDefault();
  wrap.classList.remove('drag');
  handleFiles(e.dataTransfer.files);
});

$('#zoom-in').onclick = () => setZoom(st.zoom * 1.25);
$('#zoom-out').onclick = () => setZoom(st.zoom / 1.25);
$('#zoom-fit').onclick = fitZoom;

$('#btn-export').onclick = () => {
  const blob = new Blob([toJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'request.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('#btn-copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(toJSON());
    setStatus('request.json の内容をクリップボードにコピーしました。');
  } catch {
    setStatus('コピーできませんでした。「request.json を保存」を使ってください。', true);
  }
};

$('#btn-preview').onclick = () => {
  if (!st.imgBlob) return setStatus('先に背景画像を読み込んでください。', true);
  if (!st.req.items.some((it) => it.core)) return setStatus('「核」を 1 つ指定してください。', true);
  const win = window.open('index.html?preview', 'kakure-preview');
  const onMsg = (e) => {
    if (e.source !== win || e.data?.type !== 'kakure-preview-ready') return;
    window.removeEventListener('message', onMsg);
    win.postMessage({ type: 'kakure-preview', request: buildRequest(), image: st.imgBlob }, location.origin);
  };
  window.addEventListener('message', onMsg);
};

window.addEventListener('resize', () => { if (st.imgURL && !st.req.items.length) fitZoom(); });

// ---------------------------------------------------------------- 起動

bindForm();
loadServerList();
if (restore()) setStatus('前回の作業を復元しました（画像はもう一度開いてください）。');
else { syncForm(); renderList(); validate(); }
