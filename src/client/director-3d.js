import * as M3 from '../core/moss-3d.js';

export const DIRECTOR_3D_CSS = String.raw`
.moss-director-stage{position:relative;min-width:0;min-height:240px;flex:1;overflow:hidden;background:#1d2128;color:#cdd5e1;font:11px/1.4 Inter,'Noto Sans SC',sans-serif;touch-action:none}.moss-director-stage canvas{display:block;width:100%;height:100%;position:absolute;inset:0;outline:none;touch-action:none}.moss-director-toolbar{position:absolute;top:9px;left:9px;right:9px;display:flex;gap:5px;align-items:center;pointer-events:none;flex-wrap:wrap}.moss-director-toolbar>*{pointer-events:auto}.moss-director-pills{display:flex;gap:1px;background:#292e37ed;padding:2px;border:1px solid #4a5361;border-radius:4px}.moss-director-toolbar button,.moss-director-properties button{font:inherit;color:inherit;border:1px solid #4a5361;border-radius:3px;padding:4px 7px;background:#303640;cursor:pointer}.moss-director-pills button{border:0;background:transparent}.moss-director-pills button[aria-pressed=true],.moss-director-properties button[aria-pressed=true]{background:#45618a;color:#e5efff}.moss-director-toolbar button:hover,.moss-director-properties button:hover{background:#42516a}.moss-director-toolbar .moss-director-live{margin-left:auto;display:flex;align-items:center;gap:5px;background:#292e37ed;padding:4px 6px;border:1px solid #4a5361;border-radius:3px}.moss-director-help{position:absolute;bottom:0;left:0;right:0;padding:5px 9px;background:#252a32e8;border-top:1px solid #424956;color:#9daabc;font-size:10px;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.moss-director-properties{font:11px/1.45 Inter,'Noto Sans SC',sans-serif;color:#d8dfe9;background:#2c3038;overflow:auto;min-height:0;scrollbar-width:thin}.moss-director-section{padding:10px;border-bottom:1px solid #1c2027}.moss-director-heading{display:flex;align-items:center;gap:6px;margin:0 0 9px;font-size:11px;font-weight:650}.moss-director-heading small{margin-left:auto;color:#91a0b4;font-size:9px;font-weight:400}.moss-director-properties label{color:#aeb9c9}.moss-director-properties input,.moss-director-properties select{font:inherit;color:#dce5f2;background:#22272f;border:1px solid #49515e;border-radius:3px;min-width:0;padding:3px 5px;height:25px}.moss-director-properties select{width:100%;margin-bottom:7px}.moss-director-row{display:grid;grid-template-columns:65px minmax(30px,1fr) 52px;gap:6px;align-items:center;margin:6px 0}.moss-director-row input[type=range]{width:100%;padding:0;height:18px;accent-color:#8db7f6;background:transparent;border:0}.moss-director-row input[type=number]{width:52px;text-align:right}.moss-director-check{display:flex;align-items:center;gap:6px;margin:6px 0}.moss-director-check input[type=checkbox]{height:13px;accent-color:#8db7f6}.moss-director-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.moss-director-actions button{flex:1;white-space:nowrap;font-size:10px}.moss-director-note{color:#98a6ba;font-size:10px;margin:7px 0 0}.moss-director-joints{border-top:1px solid #414853;margin-top:8px;padding-top:7px}.moss-director-joints summary{cursor:pointer;color:#c0cddd}.moss-director-empty{padding:12px;color:#9daabc;text-align:center}.moss-director-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin:6px 0 10px}.moss-director-properties .moss-director-presets button{padding:5px 2px;font-size:10px;white-space:normal;min-height:27px}.moss-director-joint-pills{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:9px}.moss-director-properties .moss-director-joint-pills button{padding:3px 6px;font-size:10px}.moss-director-properties button:focus-visible{outline:2px solid #9fc8ff;outline-offset:1px}.moss-director-overlay{pointer-events:none}.moss-director-overlay [data-joint]{pointer-events:all;cursor:move}.moss-director-overlay [data-item]{pointer-events:visiblePainted;cursor:pointer}
`;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rad = v => v * Math.PI / 180;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => mul(a, 1 / (Math.hypot(...a) || 1));
const xyz = p => Array.isArray(p) ? p : [p.x, p.y, p.z || 0];
const xy = p => Array.isArray(p) ? { x: p[0], y: p[1], depth: p[2] || 0 } : p;
const colorOf = item => item.color || ({ character: '#af9be8', object: '#77b9c9', panel: '#8292a8', text: '#d4b176' }[item.label] || '#8ba5c9');
const nameOf = (item, index = 0) => item.noteZh || item.roleTag || `体块 ${index + 1}`;
const boundsOf = item => {
  const points = item.points || [];
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const bodyOf = (item, state) => M3.normalizeBody(item.body || M3.estimateBody(item, state), item, state);
const baseFocal = state => state.canvasHeight / 2 / Math.tan(rad(25));
const FACES = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [3, 2, 6, 7], [0, 3, 7, 4], [1, 5, 6, 2]];
const tint = (color, amount) => {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : '#a6b6ce';
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${rgb.map(c => Math.round(clamp(c * amount, 0, 255))).join(',')})`;
};

const SEGMENTS = [
  ['neck', 'head', .10], ['pelvis', 'chest', .19], ['chest', 'neck', .15],
  ['l_shoulder', 'l_elbow', .075], ['l_elbow', 'l_wrist', .06], ['r_shoulder', 'r_elbow', .075], ['r_elbow', 'r_wrist', .06],
  ['l_hip', 'l_knee', .10], ['l_knee', 'l_ankle', .075], ['r_hip', 'r_knee', .10], ['r_knee', 'r_ankle', .075],
  ['l_ankle', 'l_toe', .055], ['r_ankle', 'r_toe', .055],
];

/** Shared shaded geometry for SVG and full-resolution Canvas PNG export. */
function mannequinShapes(projection) {
  const skeleton = projection?.skeleton || projection;
  if (!skeleton?.joints) return [];
  const joints = Object.fromEntries(Object.entries(skeleton.joints).filter(([, p]) => p).map(([key, p]) => [key, xy(p)]));
  const points = Object.values(joints);
  if (!points.length) return [];
  const height = Math.max(12, Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)));
  const shapes = [];
  const segments = skeleton.segments?.length ? skeleton.segments : SEGMENTS;
  for (const segment of segments) {
    const [from, to, width] = Array.isArray(segment) ? segment : [segment.a || segment.from, segment.b || segment.to, segment.radius];
    const a = typeof from === 'string' ? joints[from] : from ? xy(from) : null;
    const b = typeof to === 'string' ? joints[to] : to ? xy(to) : null;
    if (!a || !b) continue;
    const r = Math.max(.8, Array.isArray(segment) ? height * (width || .055) : width || height * .03);
    shapes.push({ kind: 'capsule', a, b, r, depth: ((a.depth || a.z || 0) + (b.depth || b.z || 0)) / 2 });
  }
  const torso = ['l_shoulder', 'r_shoulder', 'r_hip', 'l_hip'].map(key => joints[key]);
  if (torso.every(Boolean)) shapes.push({ kind: 'torso', points: torso, depth: torso.reduce((s, p) => s + (p.depth || p.z || 0), 0) / 4 });
  const head = skeleton.head?.center ? xy(skeleton.head.center) : joints.head || joints.head_top;
  if (head) {
    const radius = skeleton.head?.ry || skeleton.headRadius || height * .072;
    shapes.push({ kind: 'head', p: head, r: Math.max(1, radius), rx: skeleton.head?.rx || radius * .82, ry: skeleton.head?.ry || radius * 1.12, outline: skeleton.head?.outline, direction: skeleton.head?.direction, visor: { a: { x: head.x - (skeleton.head?.rx || radius * .82) * .65, y: head.y }, b: { x: head.x + (skeleton.head?.rx || radius * .82) * .65, y: head.y } }, depth: head.depth || head.z || 0 });
  }
  for (const [key, p] of Object.entries(joints)) {
    if (/elbow|knee|shoulder|hip|wrist|ankle/.test(key)) shapes.push({ kind: 'joint', p, r: Math.max(1.6, height * (/shoulder|hip/.test(key) ? .025 : .018)), depth: p.depth || p.z || 0 });
  }
  return shapes.sort((a, b) => b.depth - a.depth);
}

export function drawMannequin2D(ctx, projection, color = '#b9c6d9', options = {}) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha *= options.opacity ?? 1;
  for (const shape of mannequinShapes(projection)) {
    const p = shape.p || shape.a || shape.points[0];
    const r = shape.r || 18;
    const gradient = ctx.createLinearGradient(p.x - r, p.y - r, p.x + r, p.y + r);
    gradient.addColorStop(0, tint(color, 1.16)); gradient.addColorStop(.45, color); gradient.addColorStop(1, tint(color, .48));
    ctx.fillStyle = gradient; ctx.strokeStyle = tint(color, .5); ctx.lineWidth = 1;
    if (shape.kind === 'capsule') {
      ctx.beginPath(); ctx.moveTo(shape.a.x, shape.a.y); ctx.lineTo(shape.b.x, shape.b.y);
      ctx.strokeStyle = tint(color, .45); ctx.lineWidth = shape.r * 2 + 1.5; ctx.stroke();
      ctx.strokeStyle = gradient; ctx.lineWidth = shape.r * 2; ctx.stroke();
    } else if (shape.kind === 'torso') {
      ctx.beginPath(); shape.points.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      if (shape.outline?.length) { shape.outline.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath(); }
      else ctx.ellipse(shape.p.x, shape.p.y, shape.rx || shape.r, shape.ry || shape.r, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (shape.visor) { ctx.beginPath(); ctx.moveTo(shape.visor.a.x, shape.visor.a.y); ctx.lineTo(shape.visor.b.x, shape.visor.b.y); ctx.strokeStyle = tint(color, .4); ctx.lineWidth = Math.max(1, shape.r * .09); ctx.stroke(); }
      if (shape.direction) { ctx.beginPath(); ctx.moveTo(shape.direction.a.x, shape.direction.a.y); ctx.lineTo(shape.direction.b.x, shape.direction.b.y); ctx.strokeStyle = tint(color, .4); ctx.lineWidth = Math.max(1, shape.r * .09); ctx.stroke(); }
    }
  }
  ctx.restore();
}

function makeObserver(state, size, observer, view) {
  if (view === 'shot') {
    const frame = M3.getCameraProjection(state);
    const scale = Math.min((size.w - 70) / state.canvasWidth, (size.h - 100) / state.canvasHeight);
    return { ...frame, origin: [size.w / 2 + observer.panX, size.h / 2 + observer.panY], scale: scale * observer.zoom, shot: true };
  }
  const unit = baseFocal(state), target = [0, 0, unit * 1.8];
  const yaw = rad(view === 'top' ? 0 : view === 'side' ? 90 : observer.yaw);
  const pitch = rad(view === 'top' ? 89.9 : view === 'side' ? 0 : observer.pitch);
  const fwd = norm([-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]);
  const right = norm(cross([0, 1, 0], fwd)), down = norm(cross(fwd, right));
  const dist = unit * 6;
  return { C: sub(target, mul(fwd, dist)), right, down, fwd, f: Math.min(size.w, size.h) * 1.5 * observer.zoom, near: 1, origin: [size.w / 2 + observer.panX, size.h / 2 + observer.panY], scale: 1, shot: false };
}
function projectPoint(p, frame) {
  const v = sub(xyz(p), frame.C), depth = dot(v, frame.fwd);
  if (depth <= frame.near) return null;
  return { x: frame.origin[0] + dot(v, frame.right) * frame.f / depth * frame.scale, y: frame.origin[1] + dot(v, frame.down) * frame.f / depth * frame.scale, depth };
}
function rayPlane(p, frame, point, normal) {
  const dir = norm(add(frame.fwd, add(mul(frame.right, (p.x - frame.origin[0]) / (frame.f * frame.scale)), mul(frame.down, (p.y - frame.origin[1]) / (frame.f * frame.scale)))));
  const denom = dot(dir, normal);
  if (Math.abs(denom) < 1e-5) return null;
  const t = dot(sub(point, frame.C), normal) / denom;
  return t > 0 ? add(frame.C, mul(dir, t)) : null;
}
function inside(p, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
function projectSkeleton(world, frame) {
  if (!world?.joints) return null;
  const joints = Object.fromEntries(Object.entries(world.joints).map(([key, p]) => [key, projectPoint(p, frame)]));
  const visible = Object.values(joints).filter(Boolean);
  const height = visible.length ? Math.max(...visible.map(p => p.y)) - Math.min(...visible.map(p => p.y)) : 0;
  const segments = (world.segments || []).map(segment => {
    const a = projectPoint(segment.a, frame), b = projectPoint(segment.b, frame);
    if (!a || !b) return null;
    const depth = (a.depth + b.depth) / 2;
    return { ...segment, a, b, depth, radius: segment.radius * frame.f * frame.scale / depth };
  }).filter(Boolean);
  const center = world.head && projectPoint(world.head.center, frame);
  const surface = world.head?.surface?.map(p => projectPoint(p, frame)).filter(Boolean) || [];
  const nose = world.head && projectPoint(world.head.nose, frame);
  const head = center && surface.length ? { center, rx: (Math.max(...surface.map(p => p.x)) - Math.min(...surface.map(p => p.x))) / 2, ry: (Math.max(...surface.map(p => p.y)) - Math.min(...surface.map(p => p.y))) / 2, direction: nose ? { a: center, b: nose } : null } : null;
  return { joints, segments, head, headRadius: height * .072 };
}
function updateItem(state, id, patch) {
  return { ...state, items: state.items.map(item => item.id === id ? { ...item, ...patch } : item) };
}
function poseDrag(item, key, dx, dy) {
  const mannequin = M3.normalizeMannequin(item.mannequin), joints = { ...mannequin.joints };
  const side = key.startsWith('l_') ? 'l' : 'r';
  const target = /wrist|elbow|shoulder/.test(key) ? `${side}_arm` : /ankle|knee|hip|toe/.test(key) ? `${side}_leg` : key === 'head' ? 'head' : 'body';
  const part = { ...(joints[target] || {}) };
  if (/arm|leg/.test(target)) { part.raise = clamp((part.raise || 0) - dy * .7, -180, 180); part.straddle = clamp((part.straddle || 0) + dx * .7, -120, 120); }
  else { const bendKey = target === 'head' ? 'nod' : 'bend'; part[bendKey] = clamp((part[bendKey] || 0) + dy * .7, -90, 90); part.turn = clamp((part.turn || 0) + dx * .7, -180, 180); }
  joints[target] = part;
  if (/elbow|knee/.test(key)) { const hinge = `${side}_${key.includes('elbow') ? 'elbow' : 'knee'}`; joints[hinge] = { ...(joints[hinge] || {}), bend: clamp((joints[hinge]?.bend || 0) - dy, 0, 160) }; }
  return { ...mannequin, preset: '', joints };
}

export function createDirector3DComponents(React) {
  const h = React.createElement;
  const { useState, useEffect, useRef, useMemo } = React;
  const button = (text, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, text);
  const style = () => h('style', null, DIRECTOR_3D_CSS);
  function Range({ label, value, min, max, step = 1, onChange }) {
    const change = event => { const n = Number(event.target.value); if (Number.isFinite(n)) onChange(clamp(n, min, max)); };
    return h('label', { className: 'moss-director-row' }, h('span', null, label), h('input', { type: 'range', min, max, step, value, onChange: change, 'aria-label': label }), h('input', { type: 'number', min, max, step, value: Number(Number(value).toFixed(2)), onChange: change, 'aria-label': `${label}数值` }));
  }
  function Check({ label, checked, onChange }) {
    return h('label', { className: 'moss-director-check' }, h('input', { type: 'checkbox', checked, onChange: e => onChange(e.target.checked) }), label);
  }
  function Section({ title, tag, children }) { return h('section', { className: 'moss-director-section' }, h('h3', { className: 'moss-director-heading' }, title, tag && h('small', null, tag)), children); }

  function DirectorStage({ state, onChange, selectedItemId, onSelect = () => {}, onGestureStart, onGestureEnd }) {
    const wrap = useRef(null), canvas = useRef(null), hit = useRef({ items: [], joints: [] }), frameRef = useRef(null), gesture = useRef(null);
    const [size, setSize] = useState({ w: 640, h: 450 });
    const [view, setView] = useState('persp'), [grid, setGrid] = useState(true);
    const [observer, setObserver] = useState({ yaw: -32, pitch: 24, zoom: 1, panX: 0, panY: 0 });
    const [cursor, setCursor] = useState('grab');
    const live = state.camera?.liveSync !== false;
    useEffect(() => {
      const el = wrap.current; if (!el) return;
      const resize = () => { const rect = el.getBoundingClientRect(); setSize({ w: Math.max(200, rect.width), h: Math.max(240, rect.height) }); };
      resize();
      if (typeof ResizeObserver === 'undefined') { globalThis.addEventListener?.('resize', resize); return () => globalThis.removeEventListener?.('resize', resize); }
      const observer = new ResizeObserver(resize); observer.observe(el); return () => observer.disconnect();
    }, []);
    useEffect(() => {
      const el = canvas.current; if (!el) return;
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      el.width = Math.round(size.w * dpr); el.height = Math.round(size.h * dpr);
      const ctx = el.getContext('2d'); if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ctx.createLinearGradient(0, 0, 0, size.h); bg.addColorStop(0, '#1a1e25'); bg.addColorStop(1, '#2a303a'); ctx.fillStyle = bg; ctx.fillRect(0, 0, size.w, size.h);
      const frame = makeObserver(state, size, observer, view); frameRef.current = frame;
      const unit = baseFocal(state), floor = state.canvasHeight * .52;
      const trace = (points, fill, stroke, width = 1) => {
        if (points.some(p => !p)) return;
        ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        if (fill) { ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
      };
      trace([[-unit * 4, floor, -unit * 2], [unit * 4, floor, -unit * 2], [unit * 4, floor, unit * 6], [-unit * 4, floor, unit * 6]].map(p => projectPoint(p, frame)), '#35404b22', null);
      if (grid) {
        for (let i = -8; i <= 12; i++) {
          const v = i * unit / 2;
          trace([projectPoint([-unit * 4, floor, v], frame), projectPoint([unit * 4, floor, v], frame)], null, i === 0 ? '#7e657080' : '#7b8da022');
          trace([projectPoint([v, floor, -unit * 4], frame), projectPoint([v, floor, unit * 6], frame)], null, i === 0 ? '#6083ac80' : '#7b8da022');
        }
      }
      const nextHit = { items: [], joints: [], camera: null }, faces = [], skeletons = [];
      const scene = M3.projectLayout3D(state);
      for (const [index, item] of state.items.entries()) {
        if (item.hidden || item.label === 'text' || item.label === 'panel') continue;
        const body = bodyOf(item, state); if (body.anchor !== 'world') continue;
        const geometry = scene.geometry[item.id], worldCorners = geometry.corners;
        const corners = worldCorners.map(p => projectPoint(p, frame));
        const selected = selectedItemId === item.id;
        const hasMannequin = item.label === 'character' && item.mannequin?.enabled !== false;
        if (hasMannequin) {
          const skeleton = projectSkeleton(scene.worldSkeletons[item.id], frame);
          if (skeleton) skeletons.push({ item, skeleton, depth: dot(sub(geometry.center, frame.C), frame.fwd), selected });
        }
        for (const [fi, face] of FACES.entries()) {
          const poly = face.map(i => corners[i]); if (poly.some(p => !p)) continue;
          faces.push({ poly, depth: face.reduce((s, i) => s + corners[i].depth, 0) / 4, item, selected, fi, mannequin: hasMannequin });
        }
        const valid = corners.filter(Boolean); if (!valid.length) continue;
        const label = projectPoint(geometry.center, frame);
        nextHit.items.push({ id: item.id, polygons: FACES.map(face => face.map(i => corners[i])).filter(poly => poly.every(Boolean)), depth: dot(sub(geometry.center, frame.C), frame.fwd) });
        if (label) { ctx.font = '10px Inter,sans-serif'; ctx.fillStyle = selected ? '#e4efff' : '#b3bfd0'; ctx.fillText(nameOf(item, index).slice(0, 18), label.x + 8, Math.min(...valid.map(p => p.y)) - 8); }
      }
      const drawables = [...faces, ...skeletons].sort((a, b) => b.depth - a.depth);
      for (const entry of drawables) {
        if (entry.skeleton) drawMannequin2D(ctx, entry.skeleton, colorOf(entry.item));
        else trace(entry.poly, entry.mannequin ? null : tint(colorOf(entry.item), [.67, .5, .8, .6, .7, .9][entry.fi]), entry.selected ? '#c4ddff' : `${colorOf(entry.item)}99`, entry.selected ? 1.8 : .8);
      }
      for (const entry of skeletons) {
        if (entry.selected) for (const [key, p] of Object.entries(entry.skeleton.joints)) {
          if (!p || !/head|wrist|elbow|knee|ankle|pelvis/.test(key)) continue;
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#e8f2ff'; ctx.fill(); ctx.strokeStyle = '#487bad'; ctx.lineWidth = 1.5; ctx.stroke(); nextHit.joints.push({ ...p, id: entry.item.id, key });
        }
      }
      if (view !== 'shot') {
        const camera = M3.getCameraProjection(state), reach = unit * 1.3;
        const pyramid = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => add(camera.C, add(mul(camera.fwd, reach), add(mul(camera.right, x * state.canvasWidth / (2 * camera.f) * reach), mul(camera.down, y * state.canvasHeight / (2 * camera.f) * reach)))));
        const origin = projectPoint(camera.C, frame), rect = pyramid.map(p => projectPoint(p, frame));
        if (origin) { for (const p of rect) trace([origin, p], null, '#e9be7180'); trace([...rect, rect[0]], null, '#edc887', 1.4); ctx.beginPath(); ctx.arc(origin.x, origin.y, 6, 0, Math.PI * 2); ctx.fillStyle = '#f1c678'; ctx.fill(); nextHit.camera = origin; ctx.fillStyle = '#edd7ac'; ctx.font = '10px sans-serif'; ctx.fillText('CAM', origin.x + 10, origin.y + 3); }
      } else {
        const w = state.canvasWidth * frame.scale, hh = state.canvasHeight * frame.scale;
        ctx.strokeStyle = '#b1c5e1'; ctx.lineWidth = 1; ctx.strokeRect(frame.origin[0] - w / 2, frame.origin[1] - hh / 2, w, hh);
        ctx.strokeStyle = '#ffffff20'; for (const k of [1 / 3, 2 / 3]) { ctx.beginPath(); ctx.moveTo(frame.origin[0] - w / 2 + w * k, frame.origin[1] - hh / 2); ctx.lineTo(frame.origin[0] - w / 2 + w * k, frame.origin[1] + hh / 2); ctx.stroke(); }
      }
      nextHit.items.sort((a, b) => a.depth - b.depth); hit.current = nextHit;
      el.__directorHit = nextHit;
    }, [state, selectedItemId, size, observer, view, grid]);
    const local = e => { const r = canvas.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hitTest = p => {
      const joint = hit.current.joints.find(j => Math.hypot(j.x - p.x, j.y - p.y) < 9); if (joint) return { kind: 'joint', ...joint };
      if (hit.current.camera && Math.hypot(hit.current.camera.x - p.x, hit.current.camera.y - p.y) < 11) return { kind: 'camera' };
      const item = hit.current.items.find(entry => entry.polygons.some(poly => inside(p, poly))); return item ? { kind: 'item', id: item.id } : null;
    };
    const down = e => {
      if (e.button > 2) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      const p = local(e), found = e.button === 0 && !e.altKey ? hitTest(p) : null;
      const kind = found?.kind || (e.button !== 0 || e.altKey || e.shiftKey ? 'pan' : 'orbit');
      const item = found?.id && state.items.find(item => item.id === found.id);
      if (item) onSelect(item.id);
      const center = item ? M3.projectLayout3D(state).geometry[item.id].center : [0, 0, baseFocal(state)];
      const horizontalNormal = norm([frameRef.current.fwd[0], 0, frameRef.current.fwd[2]]);
      const plane = e.shiftKey || Math.abs(frameRef.current.fwd[1]) < .05 ? horizontalNormal : [0, 1, 0];
      gesture.current = { kind, x: p.x, y: p.y, state, observer, view, item, key: found?.key, frame: frameRef.current, center, plane, point: rayPlane(p, frameRef.current, center, plane), vertical: e.shiftKey };
      if (item || kind === 'camera' || (kind === 'orbit' && view === 'shot')) onGestureStart?.();
      setCursor(kind === 'orbit' || kind === 'pan' ? 'grabbing' : 'move');
    };
    const move = e => {
      const p = local(e), d = gesture.current;
      if (!d) { setCursor(hitTest(p) ? 'move' : 'grab'); return; }
      const dx = p.x - d.x, dy = p.y - d.y;
      if (d.kind === 'pan') { setObserver({ ...d.observer, panX: d.observer.panX + dx, panY: d.observer.panY + dy }); return; }
      if (d.kind === 'orbit') {
        if (d.view === 'shot') { onChange({ ...d.state, camera: M3.normalizeCamera({ ...d.state.camera, enabled: true, orbit: (d.state.camera?.orbit || 0) + dx * .35, pitch: (d.state.camera?.pitch || 0) - dy * .3 }) }); }
        else { setView('persp'); setObserver({ ...d.observer, yaw: d.observer.yaw - dx * .4, pitch: clamp(d.observer.pitch - dy * .3, -80, 85) }); } return;
      }
      if (d.kind === 'camera') { onChange({ ...d.state, camera: M3.normalizeCamera({ ...d.state.camera, enabled: true, orbit: (d.state.camera?.orbit || 0) + dx * .4, pitch: (d.state.camera?.pitch || 0) - dy * .3 }) }); return; }
      if (!d.item || d.item.locked) return;
      if (d.kind === 'joint') { onChange(updateItem(d.state, d.item.id, { mannequin: poseDrag(d.item, d.key, dx, dy) })); return; }
      const point = rayPlane(p, d.frame, d.center, d.plane); if (!point || !d.point) return;
      const delta = sub(point, d.point), body = bodyOf(d.item, d.state);
      const translation = d.vertical ? [0, delta[1], 0] : [delta[0], 0, delta[2]];
      const z = clamp(body.z + translation[2] / baseFocal(d.state), .15, 12);
      const transform = body.transform || { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], origin: [0, 0, 0] };
      const nextBody = { ...body, z, source: body.source || { bbox: boundsOf(d.item), z: body.z }, transform: { ...transform, origin: add(transform.origin, translation) } };
      let next = updateItem(d.state, d.item.id, { body: nextBody });
      const projected = M3.projectLayout3D(next).items[d.item.id];
      if (projected?.raw) { const [x1, y1, x2, y2] = projected.raw; next = updateItem(next, d.item.id, { points: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }] }); }
      onChange(next);
    };
    const up = e => { if (gesture.current && (['item', 'joint', 'camera'].includes(gesture.current.kind) || (gesture.current.kind === 'orbit' && gesture.current.view === 'shot'))) onGestureEnd?.(); gesture.current = null; setCursor('grab'); if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); };
    const reset = () => { setView('persp'); setObserver({ yaw: -32, pitch: 24, zoom: 1, panX: 0, panY: 0 }); };
    return h('div', { className: 'moss-director-stage', ref: wrap }, style(), h('canvas', { ref: canvas, tabIndex: 0, style: { cursor }, 'aria-label': '3D 镜头调度舞台；空白处拖动环绕，右键平移，滚轮缩放', onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onContextMenu: e => e.preventDefault(), onDoubleClick: reset, onWheel: e => { e.preventDefault(); setObserver(o => ({ ...o, zoom: clamp(o.zoom * Math.exp(-e.deltaY * .001), .15, 7) })); }, onKeyDown: e => { if (e.key === 'Home') reset(); } }), h('div', { className: 'moss-director-toolbar' }, h('div', { className: 'moss-director-pills', role: 'group', 'aria-label': '观察视角' }, [['persp', '透视 Persp'], ['top', '顶视 Top'], ['side', '侧面 Side'], ['shot', '机位视角 Shot']].map(([id, title]) => button(title, () => setView(id), { key: id, 'aria-pressed': view === id }))), button('网格', () => setGrid(v => !v), { 'aria-pressed': grid }), button('归位', reset), h('label', { className: 'moss-director-live' }, h('input', { type: 'checkbox', checked: live, onChange: e => onChange({ ...state, camera: { ...M3.normalizeCamera(state.camera), enabled: true, liveSync: e.target.checked } }) }), '实时联动 2D 框'), button('🎯 烘焙投影到 2D 框', () => onChange(M3.bakeCameraToItems(state)), { title: '将当前投影写回二维框，重置机位；可用工作台撤销恢复' })), h('div', { className: 'moss-director-help' }, '拖空白：环绕 · 右键 / Alt：平移 · 滚轮：缩放 · 拖体块：地面站位 · Shift 拖：高度 · 白点：关节 · 双击：归位'));
  }

  function DirectorProperties({ state, onChange, selectedItemId, onSelect = () => {} }) {
    const camera = M3.normalizeCamera(state.camera), item = state.items.find(item => item.id === selectedItemId);
    const body = item ? bodyOf(item, state) : null, mannequin = item ? M3.normalizeMannequin(item.mannequin) : null;
    const [jointKey, setJointKey] = useState('body');
    const cameraChange = patch => onChange({ ...state, camera: M3.normalizeCamera({ ...camera, enabled: true, ...patch }) });
    const itemChange = patch => item && onChange(updateItem(state, item.id, patch));
    const bodyChange = patch => {
      const nextBody = { ...body, ...patch };
      if (patch.z != null && body.source) nextBody.source = { ...body.source, z: body.source.z * patch.z / body.z };
      itemChange({ body: nextBody });
    };
    const mannequinChange = patch => itemChange({ mannequin: M3.normalizeMannequin({ ...mannequin, ...patch }) });
    const cameras = M3.CAMERA_PRESETS || [], poses = M3.POSE_PRESETS || [];
    const cameraLabels = { orbit: '环绕', pitch: '俯仰', roll: '倾斜', fov: '视角 FOV', distance: '推拉距离', dist: '推拉距离', pan_x: '水平偏移', pan_y: '垂直偏移', pan_z: '纵深偏移' };
    const jointNames = { body: '全身', pelvis: '骨盆', torso: '胸腔', head: '头部', l_wrist: '左手腕', r_wrist: '右手腕', l_arm: '左上臂', r_arm: '右上臂', l_elbow: '左肘', r_elbow: '右肘', l_leg: '左大腿', r_leg: '右大腿', l_knee: '左膝', r_knee: '右膝', l_ankle: '左脚踝', r_ankle: '右脚踝' };
    const knownJoints = Object.keys(mannequin?.joints || {});
    const keys = knownJoints.length ? knownJoints : Object.keys(jointNames);
    const activeJoint = keys.includes(jointKey) ? jointKey : keys[0];
    const values = mannequin?.joints?.[activeJoint] || {};
    const parameters = Object.keys(values).length ? Object.keys(values) : /elbow|knee|ankle/.test(activeJoint) ? ['bend'] : /arm|leg/.test(activeJoint) ? ['raise', 'straddle', 'turn'] : ['bend', 'turn', 'tilt'];
    return h('div', { className: 'moss-director-properties' }, style(),
      h(Section, { title: '拍摄机位', tag: 'CAMERA' }, h(Check, { label: '实时联动 2D 框', checked: camera.liveSync !== false, onChange: liveSync => cameraChange({ liveSync }) }),
        h('div', { className: 'moss-director-presets', role: 'group', 'aria-label': '13 种机位预设' }, cameras.map(preset => button(preset.labelZh || preset.label || preset.id, () => cameraChange({ ...M3.defaultCamera(), ...preset.camera, enabled: true }), { key: preset.id, title: preset.labelZh || preset.id, 'aria-pressed': Object.keys(M3.CAMERA_LIMITS).every(key => Math.abs(camera[key] - (preset.camera[key] ?? M3.defaultCamera()[key])) < .01) }))),
        Object.entries(M3.CAMERA_LIMITS || {}).map(([key, range]) => h(Range, { key, label: cameraLabels[key] || key, value: camera[key] ?? 0, min: range[0], max: range[1], step: /pan|dist/.test(key) ? .01 : 1, onChange: value => cameraChange({ [key]: value }) })),
        h('p', { className: 'moss-director-note' }, `${(36 / (2 * Math.tan(camera.fov * Math.PI / 360))).toFixed(0)} mm · 35mm 全画幅`),
        h('div', { className: 'moss-director-actions' }, button('重置机位', () => onChange({ ...state, camera: M3.defaultCamera() })), button('烘焙投影', () => onChange(M3.bakeCameraToItems(state)))), h('p', { className: 'moss-director-note' }, '实时联动写入二维框；烘焙固定当前机位。描述与 caption 不会自动改写。')),
      h(Section, { title: '体块与站位', tag: 'BODY' }, h('select', { value: selectedItemId || '', 'aria-label': '选择体块', onChange: e => onSelect(e.target.value || null) }, h('option', { value: '' }, '选择一个图层…'), state.items.filter(it => !it.hidden).map((it, index) => h('option', { key: it.id, value: it.id }, nameOf(it, index)))),
        item ? h(React.Fragment, null,
          h('select', { value: body.anchor, 'aria-label': '体块锚定方式', onChange: e => bodyChange({ anchor: e.target.value }) }, h('option', { value: 'world' }, '世界 · 随机位透视'), h('option', { value: 'backdrop' }, '背景板 · 远景'), h('option', { value: 'screen' }, '屏幕 · 固定二维')),
          h(Range, { label: '纵深 Z', value: body.z, min: .3, max: 8, step: .01, onChange: z => bodyChange({ z }) }), h(Range, { label: '厚度', value: body.thickness, min: 0, max: 2, step: .01, onChange: thickness => bodyChange({ thickness }) }), h(Range, { label: '朝向', value: body.yaw, min: -180, max: 180, onChange: yaw => bodyChange({ yaw }) }),
          item.label === 'object' && h(React.Fragment, null, h('label', null, '道具附着'), h('select', { value: item.attachment?.joint === 'none' ? 'none' : item.attachment?.holderId || 'auto', 'aria-label': '附着角色', onChange: e => itemChange({ attachment: e.target.value === 'none' ? { holderId: '', joint: 'none', offset: [0, 0, 0] } : { holderId: e.target.value, joint: ['l_wrist', 'r_wrist', 'body'].includes(item.attachment?.joint) ? item.attachment.joint : 'auto', offset: item.attachment?.offset || [0, 0, 0] } }) }, h('option', { value: 'none' }, '独立体块'), h('option', { value: 'auto' }, '自动识别重叠角色'), state.items.filter(it => it.id !== item.id && it.label === 'character').map(it => h('option', { key: it.id, value: it.id }, nameOf(it)))), item.attachment?.holderId && h(React.Fragment, null, h('select', { value: item.attachment.joint || 'auto', 'aria-label': '附着手腕', onChange: e => itemChange({ attachment: { ...item.attachment, joint: e.target.value } }) }, h('option', { value: 'auto' }, '自动手腕'), h('option', { value: 'r_wrist' }, '右手腕'), h('option', { value: 'l_wrist' }, '左手腕')), ['X', 'Y', 'Z'].map((axis, i) => h(Range, { key: axis, label: `偏移 ${axis}`, value: item.attachment.offset?.[i] || 0, min: -state.canvasHeight, max: state.canvasHeight, step: 1, onChange: value => { const offset = [...(item.attachment.offset || [0, 0, 0])]; offset[i] = value; itemChange({ attachment: { ...item.attachment, offset } }); } })))),
          h('div', { className: 'moss-director-actions' }, button('重新估算体块', () => itemChange({ body: M3.estimateBody(item, state) })))) : h('div', { className: 'moss-director-empty' }, '先在舞台或图层中选择一个体块。')),
      item?.label === 'character' && h(Section, { title: '关节人偶', tag: 'MANNEQUIN' }, h(Check, { label: '显示立体人偶', checked: !!mannequin.enabled, onChange: enabled => mannequinChange({ enabled }) }), mannequin.enabled && h(React.Fragment, null,
        h('select', { value: mannequin.type || 'Female', 'aria-label': '人偶体型', onChange: e => mannequinChange({ type: e.target.value }) }, ['Female', 'Male', 'Child'].map(type => h('option', { key: type, value: type }, { Female: '女性 · Female', Male: '男性 · Male', Child: '儿童 · Child' }[type]))),
        h(Check, { label: '自动适配框体', checked: mannequin.autoFit !== false, onChange: autoFit => mannequinChange({ autoFit }) }),
        h('div', { className: 'moss-director-presets', role: 'group', 'aria-label': '12 种漫画姿态预设' }, poses.map(preset => button(preset.labelZh || preset.label || preset.id, () => mannequinChange({ preset: preset.id, joints: JSON.parse(JSON.stringify(preset.joints)) }), { key: preset.id, 'aria-pressed': mannequin.preset === preset.id }))),
        h('div', { className: 'moss-director-joints' }, h('div', { className: 'moss-director-joint-pills', role: 'group', 'aria-label': '编辑关节' }, keys.map(key => button(jointNames[key] || key, () => setJointKey(key), { key, 'aria-pressed': activeJoint === key }))), parameters.map(key => h(Range, { key, label: { bend: '弯曲', nod: '点头', turn: '扭转', tilt: '侧倾', raise: '抬起', straddle: '张开' }[key] || key, value: values[key] || 0, min: -180, max: 180, onChange: value => mannequinChange({ preset: '', joints: { ...mannequin.joints, [activeJoint]: { ...values, [key]: value } } }) }))),
        h('div', { className: 'moss-director-actions' }, button('镜像姿态', () => itemChange({ mannequin: M3.mirrorPose(mannequin) })), button('重置姿态', () => mannequinChange({ preset: poses[0]?.id || '', joints: poses[0]?.joints || {} }))), h('p', { className: 'moss-director-note' }, '选中人偶后拖白色关节点；精细角度在此调整。'))));
  }

  function MannequinOverlay({ state, projection, item, selectedItemId, onSelect, onChange, onGestureStart, onGestureEnd }) {
    const projected = useMemo(() => projection || M3.projectLayout3D(state), [projection, state]);
    const drag = useRef(null);
    const entries = item ? [item] : state.items;
    const gradientPrefix = React.useId ? React.useId().replace(/:/g, '') : 'moss-mannequin';
    return h('g', { className: 'moss-director-overlay' }, entries.filter(it => !it.hidden && it.label === 'character' && it.mannequin?.enabled !== false).map(it => {
      const skeleton = projected.items?.[it.id]?.skeleton; if (!skeleton) return null;
      const selected = it.id === selectedItemId, color = colorOf(it), id = `${gradientPrefix}-${it.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const shapes = mannequinShapes(skeleton);
      const handles = Object.entries(skeleton.joints || {}).filter(([key, p]) => p && /head|wrist|elbow|knee|ankle|pelvis/.test(key));
      return h('g', { key: it.id, 'data-item': it.id, onPointerDown: onSelect ? e => { e.stopPropagation(); onSelect(it.id); } : undefined },
        h('defs', null, h('linearGradient', { id, x1: '0%', y1: '0%', x2: '100%', y2: '70%' }, h('stop', { offset: '0%', stopColor: tint(color, 1.16) }), h('stop', { offset: '42%', stopColor: color }), h('stop', { offset: '100%', stopColor: tint(color, .48) }))),
        shapes.map((shape, i) => {
          const props = { key: i, fill: `url(#${id})`, stroke: tint(color, .45), strokeWidth: 1, strokeLinejoin: 'round' };
          if (shape.kind === 'capsule') return h('g', { key: i }, h('line', { x1: shape.a.x, y1: shape.a.y, x2: shape.b.x, y2: shape.b.y, stroke: tint(color, .45), strokeWidth: shape.r * 2 + 1.5, strokeLinecap: 'round' }), h('line', { x1: shape.a.x, y1: shape.a.y, x2: shape.b.x, y2: shape.b.y, stroke: `url(#${id})`, strokeWidth: shape.r * 2, strokeLinecap: 'round' }));
          if (shape.kind === 'torso') return h('polygon', { ...props, points: shape.points.map(p => `${p.x},${p.y}`).join(' ') });
          const headShape = shape.outline?.length ? h('polygon', { ...props, points: shape.outline.map(p => `${p.x},${p.y}`).join(' ') }) : h('ellipse', { ...props, cx: shape.p.x, cy: shape.p.y, rx: shape.rx || shape.r, ry: shape.ry || shape.r });
          return h('g', { key: i }, headShape, shape.visor && h('line', { x1: shape.visor.a.x, y1: shape.visor.a.y, x2: shape.visor.b.x, y2: shape.visor.b.y, stroke: tint(color, .4), strokeWidth: Math.max(1, shape.r * .09), strokeLinecap: 'round' }), shape.direction && h('line', { x1: shape.direction.a.x, y1: shape.direction.a.y, x2: shape.direction.b.x, y2: shape.direction.b.y, stroke: tint(color, .4), strokeWidth: Math.max(1, shape.r * .09), strokeLinecap: 'round' }));
        }),
        selected && onChange && handles.map(([key, point]) => { const p = xy(point); return h('circle', { key, 'data-joint': key, cx: p.x, cy: p.y, r: Math.max(4, state.canvasWidth / 220), fill: '#f0f7ff', stroke: '#5287c3', strokeWidth: 1.5, onPointerDown: e => { e.stopPropagation(); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, item: it, state }; onGestureStart?.(); }, onPointerMove: e => { if (!drag.current) return; e.stopPropagation(); const el = e.currentTarget.ownerSVGElement, ctm = el?.getScreenCTM?.(); const sx = ctm ? Math.hypot(ctm.a, ctm.b) : 1; onChange(updateItem(drag.current.state, it.id, { mannequin: poseDrag(drag.current.item, key, (e.clientX - drag.current.x) / sx, (e.clientY - drag.current.y) / sx) })); }, onPointerUp: e => { if (drag.current) onGestureEnd?.(); drag.current = null; e.stopPropagation(); e.currentTarget.releasePointerCapture?.(e.pointerId); }, onPointerCancel: () => { drag.current = null; onGestureEnd?.(); } }); }));
    }));
  }
  return { DirectorStage, DirectorProperties, MannequinOverlay };
}
