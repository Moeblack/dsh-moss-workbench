import {
  MOSS_ASPECT_RATIOS, canvasSizeFromRatioAndMegapixels, matchCanvasAspectRatio, MOSS_BUBBLE_STYLES,
  MOSS_QUICK_TAGS, rectToPoints, getItemAABB, simplifyPolyline,
  describeShapeGeometry, splitPolygonByLine, applyKnifeCutToState, snapRowYMin,
  normalizeVerticalChineseText, validateMossLayout, applyLintFix,
  compileMossBlueprint, parseMossJsonToState, resizeWorkbenchCanvas,
} from '../core/moss-engine.js';
import { MOSS_WORKBENCH_CSS } from './styles.js';
import { DOCUMENTS_STORAGE_KEY, createDocumentStore, documentFingerprint, updateActiveDocument, saveActiveDocument, newDocument, switchDocument, closeDocument, renameDocument } from './document-store.js';

const STORAGE_KEY = 'dsh-moss-workbench-state-v1';
const MAX_HISTORY = 40;
const overlayDomImageCache = new Map();
const LABELS = { character: '👤 角色', object: '🔍 物体/特写', text: '💬 气泡台词', panel: '🖼️ 分镜底框' };
const COLORS = { character: '#7c5ce5', object: '#0891b2', text: '#d97706', panel: '#64748b' };
const TOOLS = [ ['select', '↖', '选择', 'V', '1'], ['rect', '▭', '拉框', 'R', '2'], ['knife', '╱', '分镜刀', 'K', '3'], ['polygon', '⬠', '多边形', 'P', '4'], ['lasso', '◌', '套索', 'L', '5'], ['bubble', '☏', '气泡', 'B', '6'], ['brush', '✎', '涂鸦', 'D', '7'] ];
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const clone = value => JSON.parse(JSON.stringify(value));
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const isTyping = target => !!target?.closest?.('input,textarea,select,[contenteditable=true]');
const pathFrom = (points, close = true) => points.length ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}${close ? ' Z' : ''}` : '';
const colorFor = item => item.color || COLORS[item.label] || COLORS.panel;
const tailEnabled = item => item.label === 'text' && ['oval', 'burst'].includes(item.bubbleStyle);
const baseState = () => ({ canvasWidth: 1024, canvasHeight: 1536, canvasMode: 'multi_panel', meta: [], palette: [], globalNoteZh: '', globalCaption: '', gutterWidth: 16, overlayImage: null, items: [], strokes: [] });
function normalizeState(input) {
  const state = { ...baseState(), ...input };
  state.canvasWidth = clamp(Number(state.canvasWidth) || 1024, 64, 8192);
  state.canvasHeight = clamp(Number(state.canvasHeight) || 1536, 64, 8192);
  state.items = (Array.isArray(state.items) ? state.items : []).filter(item => item && Array.isArray(item.points) && item.points.length >= 3 && item.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).map(item => ({ ...item, id: item.id || uid('box'), label: LABELS[item.label] ? item.label : 'object', noteZh: String(item.noteZh || ''), text: String(item.text || '') }));
  state.strokes = (Array.isArray(state.strokes) ? state.strokes : []).filter(s => Array.isArray(s.points) && s.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  state.meta = Array.isArray(state.meta) ? state.meta : [];
  state.palette = Array.isArray(state.palette) ? state.palette : [];
  if (input?.overlayImage && typeof input.overlayImage === 'object' && typeof input.overlayImage.dataUrl === 'string' && input.overlayImage.dataUrl) {
    state.overlayImage = {
      opacity: 0.72,
      fitMode: 'stretch',
      wireframe: true,
      visible: true,
      width: state.canvasWidth,
      height: state.canvasHeight,
      name: '叠图参考',
      ...input.overlayImage,
    };
  } else {
    state.overlayImage = null;
  }
  return state;
}
function defaultState() { return baseState(); }
function sizeDraftFromCanvas(width, height, config) {
  try {
    const size = canvasSizeFromRatioAndMegapixels(config?.ratioWidth, config?.ratioHeight, config?.megapixels);
    if (size.width === width && size.height === height) return { ...config };
  } catch { /* Legacy/imported canvases need no stored size configuration. */ }
  // Preserve legacy dimensions instead of silently mapping them to a preset.
  const preset = matchCanvasAspectRatio(width, height);
  let a = width, b = height;
  while (b) { const remainder = a % b; a = b; b = remainder; }
  return {
    ratioWidth: String(preset?.width || width / a),
    ratioHeight: String(preset?.height || height / a),
    megapixels: String(Number((width * height / 1_000_000).toFixed(6))),
  };
}
function bounds(item, state) { return getItemAABB(item, state.canvasWidth, state.canvasHeight); }
function bubblePoints(item, state) {
  if (item.label !== 'text' || !item.bubbleStyle || item.bubbleStyle === 'rect') return item.points;
  const b = bounds(item, state), points = [], burst = item.bubbleStyle === 'burst', thought = item.bubbleStyle === 'thought';
  const count = burst ? 48 : 96;
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2;
    const r = burst ? (i % 2 ? .8 : 1) : thought ? 1 + .045 * Math.sin(angle * 14) : 1;
    points.push({ x: b.centerX + Math.cos(angle) * b.width / 2 * r, y: b.centerY + Math.sin(angle) * b.height / 2 * r });
  }
  return points;
}
function tailPoints(item, state) {
  if (!tailEnabled(item) || !item.tailPoint) return [];
  const b = bounds(item, state), target = item.tailPoint;
  const dx = target.x - b.centerX, dy = target.y - b.centerY;
  const denom = Math.sqrt((dx / Math.max(b.width / 2, 1)) ** 2 + (dy / Math.max(b.height / 2, 1)) ** 2) || 1;
  const anchor = { x: b.centerX + dx / denom * .91, y: b.centerY + dy / denom * .91 };
  const len = Math.hypot(dx, dy) || 1, half = Math.min(b.width, b.height) * .07;
  return [{ x: anchor.x - dy / len * half, y: anchor.y + dx / len * half }, target, { x: anchor.x + dy / len * half, y: anchor.y - dx / len * half }];
}
function labelLines(item, maxChars = 28) {
  const content = item.noteZh || '✏️ 点击输入简述 (告诉AI这是什么)';
  const lines = Array.from(String(content).replace(/\s+/g, ' ')).reduce((out, c) => { if (!out.length || Array.from(out[out.length - 1]).length >= maxChars) out.push(c); else out[out.length - 1] += c; return out; }, []);
  if (lines.length > 3) { lines.length = 3; lines[2] = `${lines[2].slice(0, -1)}…`; }
  if (item.label === 'text' && item.text) lines.push(`「台词：${item.text}」`);
  return lines;
}
function makeItem(state, label, shapeType, points, bubbleStyle = 'oval') {
  const item = { id: uid('box'), label, shapeType, points, noteZh: '', roleTag: '', caption: '', text: '', bubbleStyle, tailPoint: null, speakerItemId: null };
  if (tailEnabled(item)) {
    const b = bounds(item, state);
    item.tailPoint = { x: b.centerX, y: clamp(b.yMax + state.canvasHeight * .055, 0, state.canvasHeight) };
  }
  return item;
}
function snapLine(start, end, enabled) {
  if (!enabled) return end;
  const len = distance(start, end), a = Math.round(Math.atan2(end.y - start.y, end.x - start.x) / (Math.PI / 12)) * Math.PI / 12;
  return { x: start.x + Math.cos(a) * len, y: start.y + Math.sin(a) * len };
}
function pointInPolygon(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function scaledState(state, width, height, scaleItems = true) {
  return resizeWorkbenchCanvas(state, width, height, { scaleItems });
}

/** Offscreen, full-resolution export. No DOM serialization or external fonts/images required. */
export function renderWorkbenchToDataUrl(input) {
  if (typeof document === 'undefined') throw new Error('PNG 导出需要浏览器 Canvas 环境');
  const state = normalizeState(input), canvas = document.createElement('canvas');
  canvas.width = state.canvasWidth; canvas.height = state.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器无法创建 2D 画布');
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ov = state.overlayImage;
  const hasOverlay = !!(ov && ov.visible !== false && ov.dataUrl);
  const wireframe = hasOverlay && ov.wireframe !== false;
  if (hasOverlay) {
    const cachedImg = overlayDomImageCache.get(ov.dataUrl);
    if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(Number(ov.opacity ?? 0.72), 0.05, 1);
      if (ov.fitMode === 'contain') {
        const scale = Math.min(canvas.width / cachedImg.naturalWidth, canvas.height / cachedImg.naturalHeight);
        const dw = cachedImg.naturalWidth * scale, dh = cachedImg.naturalHeight * scale;
        ctx.drawImage(cachedImg, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      } else {
        ctx.drawImage(cachedImg, 0, 0, canvas.width, canvas.height);
      }
      ctx.restore();
    }
  }
  const unit = Math.max(1, canvas.width / 1024);
  const trace = points => { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };
  const ordered = state.items.map((item, index) => ({ item, index })).sort((a, b) => Number(b.item.label === 'panel') - Number(a.item.label === 'panel'));
  for (const { item, index } of ordered) {
    if (item.hidden) continue;
    const color = colorFor(item), b = bounds(item, state), points = bubblePoints(item, state);
    const tail = tailPoints(item, state);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = (item.label === 'panel' ? 3 : wireframe ? 2.6 : 2) * unit; ctx.lineJoin = 'round';
    if (tail.length) { trace(tail); ctx.fillStyle = wireframe ? '#fffbeb55' : '#fffbeb'; ctx.fill(); ctx.stroke(); }
    trace(points); ctx.fillStyle = wireframe ? `${color}08` : (item.label === 'text' ? '#fffbeb' : `${color}12`); ctx.fill(); ctx.stroke();
    if (item.label === 'text' && item.bubbleStyle === 'thought') {
      ctx.beginPath(); ctx.arc(b.centerX + b.width * .24, b.yMax + 8 * unit, 5 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.centerX + b.width * .28, b.yMax + 22 * unit, 3 * unit, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const font = Math.max(12, 14 * unit), pad = 6 * unit;
    ctx.font = `600 ${font}px 'Noto Sans SC','PingFang SC',sans-serif`; ctx.textBaseline = 'top';
    const geometry = describeShapeGeometry(item, state.canvasWidth, state.canvasHeight);
    const isPanel = item.label === 'panel';
    const showTopNote = isPanel || wireframe;
    const title = `#${index + 1} ${LABELS[item.label]}${item.roleTag ? ` · ${item.roleTag}` : ''}${geometry.isIrregular ? ` · ${geometry.badgeZh}` : ''}${showTopNote && item.noteZh ? ` — ${item.noteZh}` : ''}`;
    const badge = (text, x, y, right = false, bg = color, fg = '#fff') => {
      const maxWidth = Math.max(30, b.width - 8 * unit), tw = Math.min(ctx.measureText(text).width + pad * 2, maxWidth), bh = font + pad * 2;
      const bx = right ? x - tw : x;
      ctx.fillStyle = bg; ctx.fillRect(bx, y, tw, bh); ctx.fillStyle = fg; ctx.fillText(text, bx + pad, y + pad, tw - pad * 2); return bh;
    };
    badge(title, b.xMin + 3 * unit, b.yMin + 3 * unit);
    ctx.font = `${Math.max(10, 11 * unit)}px ui-monospace,monospace`;
    const coordYCanvas = isPanel ? b.yMin + 3 * unit : (wireframe ? Math.max(b.yMin + 24 * unit, b.yMax - 22 * unit) : b.yMin + 34 * unit);
    badge(`[y:${b.mossBbox[0]}, x:${b.mossBbox[1]}, y:${b.mossBbox[2]}, x:${b.mossBbox[3]}]`, b.xMax - 3 * unit, coordYCanvas, true, '#0f172add');
    if (!showTopNote) {
      ctx.font = `600 ${Math.max(13, 18 * unit)}px 'Noto Sans SC','PingFang SC',sans-serif`;
      const chars = Math.max(4, Math.floor(b.width / (18 * unit)) - 2), lines = labelLines(item, chars), lineHeight = 26 * unit;
      let y = Math.max(b.yMin + 65 * unit, b.centerY - lines.length * lineHeight / 2);
      for (const line of lines) {
        const tw = Math.min(ctx.measureText(line).width + 16 * unit, Math.max(25, b.width - 12 * unit)), x = b.centerX - tw / 2;
        ctx.fillStyle = '#fffffff0'; ctx.fillRect(x, y, tw, lineHeight); ctx.fillStyle = item.noteZh || item.text ? '#182236' : '#64748b';
        ctx.fillText(line, x + 8 * unit, y + 3 * unit, tw - 16 * unit); y += lineHeight + 3 * unit;
      }
    }
    ctx.restore();
  }
  for (const stroke of state.strokes) {
    if (!stroke.points.length) continue;
    ctx.beginPath(); ctx.strokeStyle = stroke.color || '#f43f5e'; ctx.lineWidth = stroke.width || 4; ctx.lineCap = ctx.lineJoin = 'round';
    stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    if (stroke.points.length === 1) { const p = stroke.points[0]; ctx.lineTo(p.x + .1, p.y + .1); }
    ctx.stroke();
  }
  if (state.globalNoteZh) {
    ctx.font = `600 ${16 * unit}px 'Noto Sans SC',sans-serif`; ctx.fillStyle = '#0f172ae8'; ctx.fillRect(0, canvas.height - 38 * unit, canvas.width, 38 * unit);
    ctx.fillStyle = '#fff'; ctx.fillText(`全局：${state.globalNoteZh}`, 12 * unit, canvas.height - 14 * unit, canvas.width - 24 * unit);
  }
  return canvas.toDataURL('image/png');
}
export const renderWorkbenchSnapshotDataUrl = renderWorkbenchToDataUrl;

export function createMossWorkbenchComponents({ React, syncStateToServer, insertIntoComposer, openWorkbenchTab }) {
  const h = React.createElement;
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  let history = { past: [], present: defaultState(), future: [] };
  let storageWarning = '', revision = -1, groupKey = '', groupTime = 0, activeGestureCount = 0;
  const listeners = new Set();
  try {
    const saved = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    if (saved) { const parsed = JSON.parse(saved); revision = Number.isFinite(parsed.serverRevision) ? parsed.serverRevision : -1; history = { past: (parsed.past || []).slice(-MAX_HISTORY).map(normalizeState), present: normalizeState(parsed.present || parsed.state || parsed), future: (parsed.future || []).slice(-MAX_HISTORY).map(normalizeState) }; }
  } catch { storageWarning = '本地存档无法读取；本次画板仍可正常使用。'; }
  let documents, seedDocuments = true;
  const documentHistories = new Map();
  try {
    const saved = localStorage.getItem(DOCUMENTS_STORAGE_KEY);
    documents = createDocumentStore(history.present, saved ? JSON.parse(saved) : null);
    seedDocuments = !saved;
    const active = documents.documents.find(doc => doc.id === documents.activeId);
    if (saved && documentFingerprint(active.state) !== documentFingerprint(history.present)) history = { past: [], present: normalizeState(active.state), future: [] };
  } catch { documents = createDocumentStore(history.present); storageWarning = '文档夹无法读取，当前画板已保留；请导出文件备份。'; }
  function persistDocuments(next) {
    localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(next));
    documents = next;
  }
  function stripOverlayForHistory(s) {
    if (!s || !s.overlayImage) return s;
    return { ...s, overlayImage: null };
  }
  function emit(persist = true) {
    if (persist) {
      documents = updateActiveDocument(documents, history.present);
      try { persistDocuments(documents); } catch { storageWarning = '文档夹空间不足或不可用：当前画板仍在，请导出 JSON；新建与关闭已保护性禁用。'; }
      try {
        const lightHistory = {
          past: history.past.map(stripOverlayForHistory),
          present: history.present,
          future: history.future.map(stripOverlayForHistory),
          serverRevision: revision,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lightHistory));
      } catch {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              past: history.past.map(stripOverlayForHistory),
              present: stripOverlayForHistory(history.present),
              future: history.future.map(stripOverlayForHistory),
              serverRevision: revision,
            })
          );
        } catch {
          storageWarning = '本地存储空间不足或被禁用，请导出 JSON 保存。';
        }
      }
    }
    listeners.forEach(fn => fn(history));
  }
  function commit(next, group = '', hydrateDocument = false) {
    const value = normalizeState(typeof next === 'function' ? next(history.present) : next);
    if (JSON.stringify(value) === JSON.stringify(history.present)) return;
    const now = Date.now(), coalesce = group && groupKey === group && now - groupTime < 900;
    history = { past: coalesce ? history.past : [...history.past, history.present].slice(-MAX_HISTORY), present: value, future: [] };
    if (hydrateDocument) documents = saveActiveDocument(documents, value);
    seedDocuments = false;
    groupKey = group; groupTime = now; emit();
  }
  function undo() { if (!history.past.length) return; history = { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future].slice(0, MAX_HISTORY) }; groupKey = ''; emit(); }
  function redo() { if (!history.future.length) return; history = { past: [...history.past, history.present].slice(-MAX_HISTORY), present: history.future[0], future: history.future.slice(1) }; groupKey = ''; emit(); }
  let syncQueue = Promise.resolve(), pendingDocumentSync = 0;
  function syncDocumentState(next) {
    if (typeof syncStateToServer !== 'function') return Promise.reject(new Error('同步接口不可用'));
    pendingDocumentSync++;
    const task = syncQueue.catch(() => {}).then(async () => {
      const result = await syncStateToServer({ state: next, snapshotDataUrl: renderWorkbenchToDataUrl(next), serverRevision: revision });
      if (!result || result.ok === false) throw new Error('服务器未确认保存');
      const nextRev = Number(result.serverRevision ?? result.data?.serverRevision);
      if (Number.isFinite(nextRev)) revision = nextRev;
      return result;
    }).finally(() => { pendingDocumentSync--; });
    syncQueue = task;
    return task;
  }
  function useHistory() {
    const [snapshot, setSnapshot] = useState(history);
    useEffect(() => { listeners.add(setSnapshot); setSnapshot(history); return () => listeners.delete(setSnapshot); }, []);
    return snapshot;
  }
  function WorkbenchView(props = {}) {
    const snapshot = useHistory(), state = snapshot.present;
    const rootRef = useRef(null), svgRef = useRef(null), noteRef = useRef(null), wrapRef = useRef(null), fileInputRef = useRef(null);
    const gestureRef = useRef(null), polygonRef = useRef([]), focusedTokenRef = useRef(0), dragId = useRef(null), toastTimer = useRef(null), sendingRef = useRef(false);
    const [width, setWidth] = useState(1000), [tab, setTab] = useState('canvas');
    const [tool, setTool] = useState('select'), [label, setLabel] = useState('character'), [bubbleStyle, setBubbleStyle] = useState('oval');
    const [selectedId, setSelectedId] = useState(null), [quickOpen, setQuickOpen] = useState(false), [focusToken, setFocusToken] = useState(0);
    const [draft, setDraft] = useState(null), [gesture, setGesture] = useState(null), [polygon, setPolygon] = useState([]);
    const [brushColor, setBrushColor] = useState('#f43f5e'), [brushWidth, setBrushWidth] = useState(5);
    const [toast, setToast] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [syncStatus, setSyncStatus] = useState('等待同步');
    const [importOpen, setImportOpen] = useState(false), [importText, setImportText] = useState(''), [importError, setImportError] = useState('');
    const [newIds, setNewIds] = useState([]);
    const [renamingDoc, setRenamingDoc] = useState(null);
    const renameCancelled = useRef(false);
    const activeDocument = documents.documents.find(doc => doc.id === documents.activeId);
    const documentDirty = activeDocument.savedFingerprint !== documentFingerprint(state);
    const [styleTagDraft, setStyleTagDraft] = useState('');
    const [propertiesTab, setPropertiesTab] = useState('selection'), [layersTab, setLayersTab] = useState('layers');
    useEffect(() => { if (selectedId) setPropertiesTab('selection'); }, [selectedId]);
    useEffect(() => { rootRef.current?.querySelector('.moss-wb-document-tabs [aria-selected=true]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [activeDocument.id]);
    useEffect(() => {
      function fileShortcut(event) {
        if (event.defaultPrevented || isTyping(event.target) || importOpen || !rootRef.current?.getClientRects().length) return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveFile(); }
        else if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'n') { event.preventDefault(); createFile(); }
      }
      window.addEventListener('keydown', fileShortcut); return () => window.removeEventListener('keydown', fileShortcut);
    });
    const [autoScaleBoxes, setAutoScaleBoxes] = useState(true);
    const [sizeDraft, setSizeDraft] = useState(() => sizeDraftFromCanvas(state.canvasWidth, state.canvasHeight, state.canvasSizeConfig));
    const [customRatio, setCustomRatio] = useState(false);
    useEffect(() => {
      setSizeDraft(current => {
        try {
          const size = canvasSizeFromRatioAndMegapixels(current.ratioWidth, current.ratioHeight, current.megapixels);
          if (size.width === state.canvasWidth && size.height === state.canvasHeight) return current;
        } catch { /* Undo, import, or remote resize replaces an invalid draft. */ }
        const next = sizeDraftFromCanvas(state.canvasWidth, state.canvasHeight, state.canvasSizeConfig);
        return next;
      });
    }, [state.canvasWidth, state.canvasHeight]);
    const [peekOriginal, setPeekOriginal] = useState(false);
    const [, setOverlayLoadedTick] = useState(0);
    const live = draft || state, selected = live.items.find(item => item.id === selectedId), narrow = width <= 760;
    const compiled = useMemo(() => { try { return compileMossBlueprint(state); } catch (e) { return { mossJsonString: '{}', agentPromptMarkdown: '', warnings: [], error: e.message }; } }, [state]);
    const lint = useMemo(() => { try { return validateMossLayout(state); } catch (e) { return [{ id: 'invalid', title: '布局无法校验', message: e.message }]; } }, [state]);
    const notify = useCallback(message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4200); }, []);
    useEffect(() => () => { clearTimeout(toastTimer.current); if (gestureRef.current) activeGestureCount = Math.max(0, activeGestureCount - 1); }, []);
    useEffect(() => {
      const node = rootRef.current;
      if (!node) return undefined;
      const measure = () => setWidth(node.getBoundingClientRect().width || 360);
      measure();
      if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
      const observer = new ResizeObserver(measure); observer.observe(node); return () => observer.disconnect();
    }, []);
    useEffect(() => {
      if (!focusToken || !quickOpen || focusedTokenRef.current === focusToken) return;
      const id = requestAnimationFrame(() => { if (noteRef.current) { focusedTokenRef.current = focusToken; noteRef.current.focus({ preventScroll: true }); noteRef.current.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } });
      return () => cancelAnimationFrame(id);
    }, [focusToken, quickOpen, selectedId]);
    useEffect(() => {
      if (selectedId && !state.items.some(item => item.id === selectedId)) { setSelectedId(null); setQuickOpen(false); }
    }, [state, selectedId]);
    useEffect(() => {
      if (!newIds.length) return undefined;
      const timer = setTimeout(() => setNewIds([]), 800); return () => clearTimeout(timer);
    }, [newIds]);
    useEffect(() => {
      let stopped = false, inFlight = false, controller;
      async function poll() {
        if (inFlight || stopped || (typeof document !== 'undefined' && document.hidden)) return;
        inFlight = true; controller = new AbortController();
        try {
          const response = await fetch('/plugins/dsh-moss-workbench/state', { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const body = await response.json(), payload = body.data || body;
          const nextRevision = Number(payload.serverRevision ?? body.serverRevision ?? 0), remote = payload.state || payload.workbenchState;
          const editing = activeGestureCount > 0 || (document.activeElement?.closest?.('.moss-wb-root') && isTyping(document.activeElement));
          if (remote && nextRevision > revision && !editing && !sendingRef.current && !pendingDocumentSync) {
            revision = nextRevision;
            commit(remote, '', seedDocuments); setSyncStatus('已接收 AI / 服务器更新');
          } else if (!remote) setSyncStatus('画板已就绪');
          else if (!editing) setSyncStatus('已连接服务器');
        } catch (e) { if (!stopped && e.name !== 'AbortError') setSyncStatus('离线编辑 · 稍后自动重连'); }
        finally { inFlight = false; }
      }
      poll(); const timer = setInterval(poll, 5000);
      return () => { stopped = true; clearInterval(timer); controller?.abort(); };
    }, []);
    useEffect(() => {
      if (typeof syncStateToServer !== 'function') return undefined;
      const timer = setTimeout(async () => {
        if (sendingRef.current || activeGestureCount > 0) return;
        try {
          await syncDocumentState(state);
          setSyncStatus('✓ 已实时同步 AI (含草图)');
        } catch {
          // Ignore background auto-sync errors
        }
      }, 450);
      return () => clearTimeout(timer);
    }, [state]);
    useEffect(() => {
      function remoteStorage(event) {
        if (event.key !== STORAGE_KEY || !event.newValue || gestureRef.current) return;
        try { const incoming = JSON.parse(event.newValue); if (incoming.present) { history = { past: (incoming.past || []).slice(-40).map(normalizeState), present: normalizeState(incoming.present), future: (incoming.future || []).slice(-40).map(normalizeState) }; emit(false); } } catch { /* Keep the last known good board. */ }
      }
      window.addEventListener('storage', remoteStorage); return () => window.removeEventListener('storage', remoteStorage);
    }, []);
    useEffect(() => {
      const url = state.overlayImage?.dataUrl;
      if (!url || typeof Image === 'undefined' || overlayDomImageCache.has(url)) return;
      const img = new Image();
      img.onload = () => {
        overlayDomImageCache.set(url, img);
        setOverlayLoadedTick(t => t + 1);
      };
      img.src = url;
    }, [state.overlayImage?.dataUrl]);
    function loadOverlayFromFile(file) {
      if (!file || !file.type?.startsWith('image/')) { notify('请选择图片文件 (PNG / JPG / WebP)'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
          overlayDomImageCache.set(dataUrl, img);
          const w = img.naturalWidth || state.canvasWidth, h = img.naturalHeight || state.canvasHeight;
          commit(current => ({
            ...current,
            overlayImage: {
              dataUrl,
              width: w,
              height: h,
              name: file.name || `叠图 (${w}×${h})`,
              opacity: current.overlayImage?.opacity ?? 0.72,
              fitMode: current.overlayImage?.fitMode || 'stretch',
              wireframe: current.overlayImage?.wireframe ?? true,
              visible: true,
              updatedAt: Date.now(),
            },
          }));
          notify(`✓ 已叠入图片「${file.name || '参考图'}」(${w}×${h})，开启线框透视检查`);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
    async function loadLatestOverlayFromServer() {
      try {
        const res = await fetch('/plugins/dsh-moss-workbench/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ action: 'load_latest_image' }),
        });
        const body = await res.json();
        if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
        const remote = body.state || body.data?.state;
        const nextRev = Number(body.serverRevision ?? body.data?.serverRevision);
        if (Number.isFinite(nextRev)) revision = nextRev;
        if (remote) {
          commit(remote);
          const ov = remote.overlayImage;
          notify(ov ? `✓ 已叠入${ov.name || '最新会话图片'}，可对比各框位置偏差` : '已同步最新图');
        }
      } catch (e) {
        notify(`叠入最新图失败：${e.message}`);
      }
    }
    function applyCanvasResize(newW, newH, sizeConfig = null) {
      const targetW = clamp(Math.round(Number(newW) || state.canvasWidth), 64, 8192);
      const targetH = clamp(Math.round(Number(newH) || state.canvasHeight), 64, 8192);
      if (targetW === state.canvasWidth && targetH === state.canvasHeight) return;
      const next = scaledState(state, targetW, targetH, autoScaleBoxes);
      commit({ ...next, canvasSizeConfig: sizeConfig ? { ...sizeConfig } : null });
      notify(
        autoScaleBoxes && state.items.length
          ? `已切换至 ${targetW}×${targetH}，${state.items.length} 个框已按比例自动缩放适配`
          : `已切换画布分辨率至 ${targetW}×${targetH}`
      );
    }
    function exportCanvasPng() {
      try {
        const dataUrl = renderWorkbenchToDataUrl(state);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `moss-workbench-${state.canvasWidth}x${state.canvasHeight}${state.overlayImage?.visible ? '-overlay' : ''}.png`;
        a.click();
        notify('已导出高清画板 PNG');
      } catch (e) {
        notify(`导出失败：${e.message}`);
      }
    }
    function editOverlay(patch, group = 'overlay') {
      commit(current => current.overlayImage ? { ...current, overlayImage: { ...current.overlayImage, ...patch } } : current, group);
    }
    function editItem(id, patch, group = '') { commit(current => ({ ...current, items: current.items.map(item => item.id === id ? { ...item, ...patch } : item) }), group); }
    function editItemBounds(item, key, raw) {
      const number = Number(raw); if (!Number.isFinite(number)) return;
      const b = bounds(item, state), box = { x: b.xMin, y: b.yMin, width: b.width, height: b.height, [key]: number };
      box.x = clamp(box.x, 0, state.canvasWidth - 8); box.y = clamp(box.y, 0, state.canvasHeight - 8);
      box.width = clamp(box.width, 8, state.canvasWidth - box.x); box.height = clamp(box.height, 8, state.canvasHeight - box.y);
      editItem(item.id, { points: item.points.map(p => ({ x: box.x + (p.x - b.xMin) / Math.max(1, b.width) * box.width, y: box.y + (p.y - b.yMin) / Math.max(1, b.height) * box.height })) }, `bounds-${item.id}-${key}`);
    }
    function editMossBoundary(item, index, raw) {
      const value = Number(raw); if (raw === '' || !Number.isFinite(value) || item.locked) return;
      const b = bounds(item, state), bbox = b.mossBbox.slice(); bbox[index] = value;
      const x1 = clamp(bbox[1] + state.canvasWidth / 2, 0, state.canvasWidth - 8), y1 = clamp(bbox[0] + state.canvasHeight / 2, 0, state.canvasHeight - 8);
      const x2 = clamp(bbox[3] + state.canvasWidth / 2, x1 + 8, state.canvasWidth), y2 = clamp(bbox[2] + state.canvasHeight / 2, y1 + 8, state.canvasHeight);
      editItem(item.id, { points: item.points.map(p => ({ x: x1 + (p.x - b.xMin) / Math.max(1, b.width) * (x2 - x1), y: y1 + (p.y - b.yMin) / Math.max(1, b.height) * (y2 - y1) })) }, `moss-bounds-${item.id}-${index}`);
    }
    function selectItem(item, focus = false) { setSelectedId(item.id); setQuickOpen(true); if (focus) { setTab('canvas'); setFocusToken(n => n + 1); } }
    function finishNew(next, ids) {
      commit(next); setNewIds(ids); if (ids.length) { setSelectedId(ids[0]); setQuickOpen(true); setTab('canvas'); setFocusToken(n => n + 1); }
      setTool('select');
    }
    function deleteItem(id) { commit(current => ({ ...current, items: current.items.filter(item => item.id !== id).map(item => item.speakerItemId === id ? { ...item, speakerItemId: null } : item) })); if (id === selectedId) { setSelectedId(null); setQuickOpen(false); } }
    function duplicateItem(id) {
      const source = state.items.find(item => item.id === id); if (!source) return;
      const b = bounds(source, state), dx = Math.min(22, state.canvasWidth - b.xMax), dy = Math.min(22, state.canvasHeight - b.yMax);
      const item = { ...clone(source), id: uid('box'), points: source.points.map(p => ({ x: p.x + dx, y: p.y + dy })), tailPoint: source.tailPoint ? { x: clamp(source.tailPoint.x + dx, 0, state.canvasWidth), y: clamp(source.tailPoint.y + dy, 0, state.canvasHeight) } : null };
      const index = state.items.findIndex(existing => existing.id === id), items = state.items.slice(); items.splice(index + 1, 0, item); finishNew({ ...state, items }, [item.id]);
    }
    function reorder(id, destination) {
      const items = state.items.slice(), index = items.findIndex(item => item.id === id); if (index < 0) return;
      const target = clamp(destination, 0, items.length - 1); items.splice(target, 0, items.splice(index, 1)[0]); commit({ ...state, items });
    }
    function finishPolygon() {
      const points = polygonRef.current; if (points.length < 3) { notify('多边形至少需要 3 个顶点'); return; }
      const item = makeItem(state, label, 'polygon', points); polygonRef.current = []; setPolygon([]); finishNew({ ...state, items: [...state.items, item] }, [item.id]);
    }
    function setActiveTool(next) { if (gestureRef.current) cancelGesture(); polygonRef.current = []; setPolygon([]); setTool(next); setQuickOpen(false); }
    useEffect(() => {
      const node = rootRef.current;
      function keydown(event) {
        if (isTyping(event.target) || importOpen) return;
        if (event.key === 'Escape') { event.preventDefault(); cancelGesture(); setPolygon([]); polygonRef.current = []; setQuickOpen(false); setTool('select'); return; }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveFile(); return; }
        if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'n') { event.preventDefault(); createFile(); return; }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === 'Enter' && tool === 'polygon') { event.preventDefault(); finishPolygon(); return; }
        if (event.key === 'Enter' && selected) { event.preventDefault(); selectItem(selected, true); return; }
        if (['Delete', 'Backspace'].includes(event.key) && selected && !selected.locked) { event.preventDefault(); deleteItem(selected.id); return; }
        const found = TOOLS.find(entry => entry[3].toLowerCase() === event.key.toLowerCase() || entry[4] === event.key);
        if (found) { event.preventDefault(); setActiveTool(found[0]); }
      }
      node?.addEventListener('keydown', keydown); return () => node?.removeEventListener('keydown', keydown);
    });
    function canvasPoint(event) {
      const svg = svgRef.current, matrix = svg?.getScreenCTM?.();
      if (matrix && typeof DOMPoint !== 'undefined') { const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); return { x: clamp(p.x, 0, live.canvasWidth), y: clamp(p.y, 0, live.canvasHeight) }; }
      const r = svg.getBoundingClientRect(); return { x: clamp((event.clientX - r.left) / r.width * live.canvasWidth, 0, live.canvasWidth), y: clamp((event.clientY - r.top) / r.height * live.canvasHeight, 0, live.canvasHeight) };
    }
    function startGesture(event, type, data = {}) {
      if (event.button !== 0 || gestureRef.current) return;
      event.preventDefault(); event.stopPropagation(); rootRef.current?.focus({ preventScroll: true });
      const start = canvasPoint(event), value = { type, start, end: start, points: [start], base: state, pointerId: event.pointerId, ...data };
      gestureRef.current = value; activeGestureCount++; setGesture(value); setQuickOpen(false);
      try { svgRef.current.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events may not support capture. */ }
    }
    function onCanvasDown(event) {
      if (event.button !== 0) return;
      if (tool === 'polygon') {
        event.preventDefault(); rootRef.current?.focus({ preventScroll: true }); const p = canvasPoint(event), previous = polygonRef.current;
        const threshold = state.canvasWidth / Math.max(wrapRef.current?.clientWidth || 400, 1) * 14;
        if (previous.length >= 3 && distance(previous[0], p) < threshold) finishPolygon();
        else { polygonRef.current = [...previous, p]; setPolygon(polygonRef.current); }
        return;
      }
      if (tool === 'select') { setSelectedId(null); setQuickOpen(false); return; }
      startGesture(event, tool);
    }
    function transformedGesture(g, end) {
      if (!['move', 'resize', 'vertex', 'tail'].includes(g.type)) return null;
      const current = g.base.items.find(item => item.id === g.itemId); if (!current) return null;
      let patch = {};
      if (g.type === 'move') {
        const b = bounds(current, g.base), dx = clamp(end.x - g.start.x, -b.xMin, g.base.canvasWidth - b.xMax), dy = clamp(end.y - g.start.y, -b.yMin, g.base.canvasHeight - b.yMax);
        patch = { points: current.points.map(p => ({ x: p.x + dx, y: p.y + dy })), tailPoint: current.tailPoint ? { x: clamp(current.tailPoint.x + dx, 0, g.base.canvasWidth), y: clamp(current.tailPoint.y + dy, 0, g.base.canvasHeight) } : null };
      } else if (g.type === 'vertex') {
        patch = { shapeType: current.points.length === 4 ? 'quad' : 'polygon', points: current.points.map((p, i) => i === g.vertex ? { x: clamp(p.x + end.x - g.start.x, 0, g.base.canvasWidth), y: clamp(p.y + end.y - g.start.y, 0, g.base.canvasHeight) } : p) };
      } else if (g.type === 'resize') {
        const b = bounds(current, g.base), handle = g.handle; let x1 = b.xMin, x2 = b.xMax, y1 = b.yMin, y2 = b.yMax;
        if (handle.includes('w')) x1 = Math.min(end.x, x2 - 8); if (handle.includes('e')) x2 = Math.max(end.x, x1 + 8);
        if (handle.includes('n')) y1 = Math.min(end.y, y2 - 8); if (handle.includes('s')) y2 = Math.max(end.y, y1 + 8);
        x1 = clamp(x1, 0, g.base.canvasWidth); x2 = clamp(x2, 0, g.base.canvasWidth); y1 = clamp(y1, 0, g.base.canvasHeight); y2 = clamp(y2, 0, g.base.canvasHeight);
        patch = { points: current.points.map(p => ({ x: x1 + (p.x - b.xMin) / Math.max(b.width, 1) * (x2 - x1), y: y1 + (p.y - b.yMin) / Math.max(b.height, 1) * (y2 - y1) })) };
      } else {
        const target = [...g.base.items].reverse().find(item => item.label === 'character' && !item.hidden && pointInPolygon(end, item.points));
        const speakerBounds = target ? bounds(target, g.base) : null;
        patch = { tailPoint: speakerBounds ? { x: speakerBounds.centerX, y: speakerBounds.yMin + speakerBounds.height * .2 } : end, speakerItemId: target?.id || null };
      }
      return { ...g.base, items: g.base.items.map(item => item.id === current.id ? { ...item, ...patch } : item) };
    }
    function onPointerMove(event) {
      const g = gestureRef.current; if (!g || event.pointerId !== g.pointerId) return;
      const raw = canvasPoint(event), end = g.type === 'knife' ? snapLine(g.start, raw, event.shiftKey) : raw;
      const points = ['brush', 'lasso'].includes(g.type) && distance(g.points[g.points.length - 1], end) > 1.5 ? [...g.points, end] : g.points;
      const next = { ...g, end, points, shiftKey: event.shiftKey }; gestureRef.current = next; setGesture(next);
      const changed = transformedGesture(next, end); if (changed) setDraft(changed);
    }
    function cancelGesture() {
      const g = gestureRef.current; gestureRef.current = null; if (g) activeGestureCount = Math.max(0, activeGestureCount - 1); setGesture(null); setDraft(null);
      if (g) { try { svgRef.current?.releasePointerCapture(g.pointerId); } catch { /* Capture already lost. */ } }
    }
    function finishKnife(base, start, end) {
      try {
        const next = applyKnifeCutToState(base, start, end, { gutterWidth: base.gutterWidth ?? 16, snapAngle: false, targetItemId: selected?.label === 'panel' && !selected.locked ? selected.id : null });
        const before = new Set(base.items.map(item => item.id)), ids = next.items.filter(item => !before.has(item.id)).map(item => item.id);
        if (!ids.length) { notify('这一刀没有穿过可切分的底框：请从框的一侧拖到另一侧'); return; }
        finishNew(next, ids); notify(`已切出 ${ids.length} 个分镜，写一句简述告诉 AI 每格是什么`);
      } catch (e) { notify(`切分失败：${e.message}`); }
    }
    function onPointerUp(event) {
      let g = gestureRef.current; if (!g || event.pointerId !== g.pointerId) return;
      const raw = canvasPoint(event), end = g.type === 'knife' ? snapLine(g.start, raw, event.shiftKey) : raw;
      const points = ['brush', 'lasso'].includes(g.type) && distance(g.points[g.points.length - 1], end) > 1.5 ? [...g.points, end] : g.points;
      g = { ...g, end, points }; const changed = transformedGesture(g, end);
      cancelGesture();
      if (changed) { commit(changed); setQuickOpen(true); return; }
      if (g.type === 'knife') { if (distance(g.start, end) > 5) finishKnife(g.base, g.start, end); return; }
      if (g.type === 'brush') {
        const points = g.points.length === 1 ? [g.start, { x: g.start.x + .1, y: g.start.y + .1 }] : g.points;
        commit({ ...g.base, strokes: [...g.base.strokes, { id: uid('stroke'), color: brushColor, width: brushWidth, points: simplifyPolyline(points, .8) }] }); return;
      }
      if (g.type === 'lasso') {
        const points = simplifyPolyline(g.points, Math.max(3, state.canvasWidth / 180));
        if (points.length < 3) { notify('套索范围太小，请画一个闭合轮廓'); return; }
        const item = makeItem(g.base, label, 'lasso', points); finishNew({ ...g.base, items: [...g.base.items, item] }, [item.id]); return;
      }
      const w = Math.abs(end.x - g.start.x), height = Math.abs(end.y - g.start.y);
      if (w < 8 || height < 8) { notify('拖出一个框即可，然后立即写中文简述'); return; }
      const item = makeItem(g.base, g.type === 'bubble' ? 'text' : label, g.type === 'bubble' ? 'bubble' : 'rect', rectToPoints(Math.min(end.x, g.start.x), Math.min(end.y, g.start.y), w, height), bubbleStyle);
      finishNew({ ...g.base, items: [...g.base.items, item] }, [item.id]);
    }
    function accessibleCut(angle) {
      const b = selected?.label === 'panel' ? bounds(selected, state) : { centerX: state.canvasWidth / 2, centerY: state.canvasHeight / 2 };
      const a = angle * Math.PI / 180, length = Math.hypot(state.canvasWidth, state.canvasHeight) * 2;
      finishKnife(state, { x: b.centerX - Math.cos(a) * length, y: b.centerY - Math.sin(a) * length }, { x: b.centerX + Math.cos(a) * length, y: b.centerY + Math.sin(a) * length });
    }
    async function sendToAI() {
      if (sendingRef.current) return;
      sendingRef.current = true; setBusy(true); setError('');
      try {
        if (compiled.error) throw new Error(compiled.error);
        if (typeof syncStateToServer !== 'function' || typeof insertIntoComposer !== 'function') throw new Error('当前宿主未连接同步或对话框接口');
        if (document.fonts?.ready) await document.fonts.ready;
        const result = await syncDocumentState(state);
        if (result === null || result === false || result?.ok === false) throw new Error('服务器未确认画板同步');
        const nextRevision = Number(result?.serverRevision ?? result?.data?.serverRevision);
        if (Number.isFinite(nextRevision)) { revision = nextRevision; emit(); }
        const inserted = await insertIntoComposer(compiled.agentPromptMarkdown);
        if (inserted === false) throw new Error('画板已同步，但未找到对话输入框；请打开对话后重试，或复制 MOSS JSON');
        setSyncStatus('画板与 PNG 已同步'); notify('已同步画板草图并将 MOSS 分镜指令填入对话框！');
      } catch (e) { setError(`发送失败：${e.message}。画板已保留，可重试。`); }
      finally { sendingRef.current = false; setBusy(false); }
    }
    async function copyJson() {
      try { await navigator.clipboard.writeText(compiled.mossJsonString); notify('MOSS JSON 已复制'); }
      catch { setImportText(compiled.mossJsonString); setImportError('剪贴板不可用：可直接选择下方 JSON 复制。'); setImportOpen(true); }
    }
    function importJson() {
      try { const parsed = parseMossJsonToState(importText, state.canvasWidth, state.canvasHeight); commit(parsed); setImportOpen(false); setImportError(''); setSelectedId(null); notify('JSON 已导入画板，可撤销恢复原布局'); }
      catch (e) { setImportError(`无法导入：${e.message}`); }
    }
    const button = (text, onClick, options = {}) => h('button', { type: 'button', onClick, ...options }, text);
    const field = (title, value, onChange, options = {}) => h('label', { key: options.key, className: `moss-wb-field${options.wide ? ' moss-wb-field-wide' : ''}` }, title, h(options.multiline ? 'textarea' : 'input', { value: value ?? '', onChange: event => onChange(event.target.value), ...Object.fromEntries(Object.entries(options).filter(([key]) => !['wide', 'multiline'].includes(key))) }));
    function rolePills(item) { return h('div', { className: 'moss-wb-role-pills', role: 'group', 'aria-label': '框的角色类型' }, Object.entries(LABELS).map(([key, title]) => button(title, () => { editItem(item.id, { label: key }); setLabel(key); }, { key, className: item.label === key ? 'moss-wb-active' : '', 'aria-pressed': item.label === key }))); }
    function tagChips(item) { return h('div', { className: 'moss-wb-tags' }, (MOSS_QUICK_TAGS[item.label] || []).map(tag => button(`+ ${tag}`, () => editItem(item.id, { noteZh: [item.noteZh, tag].filter(Boolean).join('，') }, `note-${item.id}`), { key: tag }))); }
    function bubbleControls(item) {
      return h(React.Fragment, null,
        h('input', { className: 'moss-wb-bubble-text', value: item.text || '', placeholder: '台词原文：如 七百二十元！', 'aria-label': '台词原文', onChange: event => editItem(item.id, { text: event.target.value }, `text-${item.id}`), onKeyDown: event => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing) { event.preventDefault(); setQuickOpen(false); rootRef.current?.focus(); } } }),
        h('div', { className: 'moss-wb-tags' }, MOSS_BUBBLE_STYLES.map(style => button(style.shortZh || style.labelZh, () => {
          const patch = { bubbleStyle: style.id, shapeType: 'bubble' };
          if (style.hasTail && !item.tailPoint) { const b = bounds(item, state); patch.tailPoint = { x: b.centerX, y: clamp(b.yMax + 60, 0, state.canvasHeight) }; }
          editItem(item.id, patch);
        }, { key: style.id, className: item.bubbleStyle === style.id ? 'moss-wb-active' : '' })), button('720→七百二十', () => editItem(item.id, { text: normalizeVerticalChineseText(item.text || '') }), { title: '将台词里的数字转换为适合竖排的中文' })),
        item.speakerItemId ? h('p', { className: 'moss-wb-hint' }, '🎯 已绑定说话人：', state.items.find(i => i.id === item.speakerItemId)?.noteZh || item.speakerItemId) : null);
    }
    function quickNote() {
      if (!selected || !quickOpen || selected.hidden) return null;
      const b = bounds(selected, live), wrapWidth = wrapRef.current?.clientWidth || Math.max(280, width - 80), noteWidth = Math.min(420, wrapWidth - 12);
      const leftPx = clamp(b.centerX / state.canvasWidth * wrapWidth, noteWidth / 2 + 6, wrapWidth - noteWidth / 2 - 6);
      const wrapHeight = wrapWidth * state.canvasHeight / state.canvasWidth, noteHeight = selected.label === 'text' ? 310 : 210;
      const belowY = b.yMax / state.canvasHeight * wrapHeight + 10, aboveY = b.yMin / state.canvasHeight * wrapHeight - noteHeight - 10;
      const noteY = clamp(belowY + noteHeight < wrapHeight ? belowY : aboveY, 8, Math.max(8, wrapHeight - noteHeight - 8));
      return h('div', { className: 'moss-wb-quick-note', style: { left: `${leftPx / wrapWidth * 100}%`, top: `${noteY}px` }, onPointerDown: event => event.stopPropagation(), 'aria-label': '就地描述浮窗' },
        h('div', { className: 'moss-wb-quick-head' }, h('strong', null, '✏️ 这个框是什么？'), h('span', null, `#${state.items.findIndex(i => i.id === selected.id) + 1}`), h('span', { className: 'moss-wb-spacer' }), button('×', () => setQuickOpen(false), { className: 'moss-wb-quiet', 'aria-label': '关闭描述浮窗' })),
        rolePills(selected),
        h('input', { ref: noteRef, value: selected.noteZh || '', placeholder: '写一句简述给AI，如：银发少女侧身回眸冷笑 / 眼部极端特写…', 'aria-label': '中文简述 noteZh', onChange: event => editItem(selected.id, { noteZh: event.target.value }, `note-${selected.id}`), onKeyDown: event => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing) { event.preventDefault(); setQuickOpen(false); rootRef.current?.focus(); } if (event.key === 'Escape') { setQuickOpen(false); rootRef.current?.focus(); } } }),
        tagChips(selected), selected.label === 'text' ? bubbleControls(selected) : null,
        h('div', { className: 'moss-wb-quick-foot' }, 'Enter 完成 · 双击框再次编辑', button('✓ 完成', () => { setQuickOpen(false); rootRef.current?.focus(); })));
    }
    const displayScale = state.canvasWidth / Math.max(240, wrapRef.current?.clientWidth || (narrow ? width - 30 : width - 370));
    const handleSize = displayScale * 8;
    function itemSvg(item, index) {
      if (item.hidden) return null;
      const b = bounds(item, live), color = colorFor(item), geometry = describeShapeGeometry(item, live.canvasWidth, live.canvasHeight), tail = tailPoints(item, live), shape = bubblePoints(item, live);
      const unit = state.canvasWidth / 1024, fontSize = 14 * unit, small = 10 * unit, pad = 5 * unit;
      const ov = live.overlayImage;
      const wireframe = !!(ov && ov.visible !== false && ov.wireframe !== false);
      const isPanel = item.label === 'panel';
      const showTopNote = isPanel || wireframe;
      const title = `#${index + 1} ${LABELS[item.label]}${item.roleTag ? ` · ${item.roleTag}` : ''}${geometry.isIrregular ? ` · ${geometry.badgeZh}` : ''}${showTopNote && item.noteZh ? ` — ${item.noteZh}` : ''}`;
      const coord = `[y:${b.mossBbox[0]}, x:${b.mossBbox[1]}, y:${b.mossBbox[2]}, x:${b.mossBbox[3]}]`;
      const coordsWidth = Math.min(b.width - 6 * unit, coord.length * small * .61 + 8 * unit);
      const maxTitleWidth = isPanel ? Math.max(80 * unit, b.width - coordsWidth - 12 * unit) : b.width - 4 * unit;
      const titleWidth = Math.min(maxTitleWidth, Math.max(80 * unit, Array.from(title).length * fontSize * .7));
      const lines = showTopNote ? [] : labelLines(item, Math.max(4, Math.floor(b.width / (17 * unit)) - 2)), lineHeight = 25 * unit;
      const textStart = Math.max(b.yMin + 58 * unit, b.centerY - lines.length * lineHeight / 2);
      const coordY = isPanel ? b.yMin + 3 * unit : (wireframe ? Math.max(b.yMin + 24 * unit, b.yMax - 21 * unit) : b.yMin + 32 * unit);
      const shapeOpacity = peekOriginal ? 0.08 : (item.locked ? .75 : 1);
      return h('g', { key: item.id, className: `moss-wb-shape${newIds.includes(item.id) ? ' moss-wb-shape-new' : ''}`, opacity: shapeOpacity, onPointerDown: event => {
        if (tool !== 'select') return;
        selectItem(item); if (item.locked) { event.stopPropagation(); return; }
        startGesture(event, 'move', { itemId: item.id });
      }, onDoubleClick: event => { if (tool === 'select') { event.stopPropagation(); selectItem(item, true); } }, 'aria-label': `${title} ${item.noteZh || '尚未描述'}` },
        tail.length ? h('path', { d: pathFrom(tail), fill: wireframe ? '#fffbeb44' : '#fffbeb', stroke: color, strokeWidth: 2 * unit, strokeLinejoin: 'round' }) : null,
        h('path', { d: pathFrom(shape), fill: wireframe ? `${color}08` : (item.label === 'text' ? '#fffbeb' : `${color}12`), stroke: color, strokeWidth: (item.id === selectedId ? 3.2 : wireframe ? 2.6 : 2) * unit, strokeLinejoin: 'round' }),
        item.label === 'text' && item.bubbleStyle === 'thought' ? h('g', { fill: '#fffbeb', stroke: color, strokeWidth: unit }, h('circle', { cx: b.centerX + b.width * .24, cy: b.yMax + 8 * unit, r: 5 * unit }), h('circle', { cx: b.centerX + b.width * .28, cy: b.yMax + 22 * unit, r: 3 * unit })) : null,
        h('g', { className: 'moss-wb-label' },
          h('rect', { x: b.xMin + 2 * unit, y: b.yMin + 2 * unit, width: Math.max(0, titleWidth), height: fontSize + pad * 2, rx: 3 * unit, fill: color }),
          h('text', { x: b.xMin + 6 * unit, y: b.yMin + fontSize + pad, fontSize, fontWeight: 650, fill: '#fff', textLength: titleWidth > 0 ? Math.min(Array.from(title).length * fontSize * .7 - 6 * unit, titleWidth - 8 * unit) : undefined, lengthAdjust: 'spacingAndGlyphs' }, title),
          h('rect', { x: b.xMax - coordsWidth - 3 * unit, y: coordY, width: Math.max(0, coordsWidth), height: 18 * unit, rx: 3 * unit, fill: '#0f172adb' }),
          h('text', { x: b.xMax - 6 * unit, y: coordY + 13 * unit, textAnchor: 'end', fontSize: small, fill: '#e2e8f0', fontFamily: 'ui-monospace,monospace', textLength: Math.max(1, coordsWidth - 7 * unit), lengthAdjust: 'spacingAndGlyphs' }, coord),
          lines.map((line, lineIndex) => {
            const textWidth = Math.min(Math.max(b.width - 12 * unit, 25 * unit), Array.from(line).length * 17 * unit + 16 * unit), y = textStart + lineIndex * (lineHeight + 3 * unit);
            return h('g', { key: lineIndex, className: !item.noteZh && lineIndex === 0 ? 'moss-wb-empty-label' : '' }, h('rect', { x: b.centerX - textWidth / 2, y, width: textWidth, height: lineHeight, rx: 6 * unit, fill: '#fffffff0', stroke: `${color}33`, strokeWidth: unit }), h('text', { x: b.centerX, y: y + 18 * unit, textAnchor: 'middle', fontSize: 16 * unit, fontWeight: item.noteZh ? 650 : 400, fill: item.noteZh || item.text ? '#182236' : '#64748b', textLength: Math.max(1, Math.min(textWidth - 12 * unit, Array.from(line).length * 16 * unit)), lengthAdjust: 'spacingAndGlyphs' }, line));
          })));
    }
    function selectionSvg() {
      if (!selected || selected.hidden) return null;
      const b = bounds(selected, live), positions = [ [b.xMin, b.yMin], [b.centerX, b.yMin], [b.xMax, b.yMin], [b.xMax, b.centerY], [b.xMax, b.yMax], [b.centerX, b.yMax], [b.xMin, b.yMax], [b.xMin, b.centerY] ];
      return h('g', { key: 'selection' },
        h('rect', { className: 'moss-wb-selection', x: b.xMin - 2 * displayScale, y: b.yMin - 2 * displayScale, width: b.width + 4 * displayScale, height: b.height + 4 * displayScale }),
        !selected.locked && tool === 'select' ? positions.map(([x, y], index) => h('rect', { key: HANDLES[index], className: 'moss-wb-handle', x: x - handleSize / 2, y: y - handleSize / 2, width: handleSize, height: handleSize, style: { cursor: `${HANDLES[index]}-resize` }, onPointerDown: event => startGesture(event, 'resize', { itemId: selected.id, handle: HANDLES[index] }), role: 'button', 'aria-label': `缩放 ${HANDLES[index]}` })) : null,
        !selected.locked && tool === 'select' && ['rect', 'quad', 'polygon', 'split-panel', 'lasso'].includes(selected.shapeType) ? selected.points.map((p, index) => {
          // Offset the diamond away from the AABB handle: both controls remain independently reachable.
          const dx = p.x < b.centerX ? -handleSize * 1.65 : handleSize * 1.65, dy = p.y < b.centerY ? -handleSize * 1.65 : handleSize * 1.65;
          return h('g', { key: `v-${index}` }, h('line', { x1: p.x, y1: p.y, x2: p.x + dx, y2: p.y + dy, stroke: '#38bdf8', strokeWidth: displayScale, pointerEvents: 'none' }), h('path', { className: 'moss-wb-vertex', d: pathFrom([{ x: p.x + dx, y: p.y + dy - handleSize * .7 }, { x: p.x + dx + handleSize * .7, y: p.y + dy }, { x: p.x + dx, y: p.y + dy + handleSize * .7 }, { x: p.x + dx - handleSize * .7, y: p.y + dy }]), onPointerDown: event => startGesture(event, 'vertex', { itemId: selected.id, vertex: index }), role: 'button', 'aria-label': `单独拖动第 ${index + 1} 个顶点` }, h('title', null, '拖动菱形：单角斜切 / 梯形变形')));
        }) : null,
        !selected.locked && tailEnabled(selected) && selected.tailPoint ? h('g', null, h('line', { x1: b.centerX, y1: b.centerY, x2: selected.tailPoint.x, y2: selected.tailPoint.y, stroke: '#f59e0b', strokeDasharray: `${4 * displayScale} ${3 * displayScale}`, strokeWidth: displayScale, pointerEvents: 'none' }), h('circle', { className: 'moss-wb-tail-handle', cx: selected.tailPoint.x, cy: selected.tailPoint.y, r: handleSize * .9, onPointerDown: event => startGesture(event, 'tail', { itemId: selected.id }), role: 'button', 'aria-label': '拖向说话人头部' }, h('title', null, '🎯 拖向说话人头部；落入角色框自动绑定'))) : null);
    }
    function gestureSvg() {
      if (!gesture) return null;
      const g = gesture;
      if (g.type === 'knife') {
        const panels = state.items.filter(item => item.label === 'panel' && !item.hidden && !item.locked), sources = panels.length ? panels : [{ points: rectToPoints(0, 0, state.canvasWidth, state.canvasHeight) }];
        const parts = sources.flatMap(item => { try { return splitPolygonByLine(item.points, g.start, g.end, state.gutterWidth ?? 16).polygons || []; } catch { return []; } });
        const angle = Math.round(Math.atan2(g.end.y - g.start.y, g.end.x - g.start.x) * 180 / Math.PI), text = `${angle}° 斜切 · 按住 Shift 吸附角度`, boxW = Math.min(300 * displayScale, state.canvasWidth - 12 * displayScale), x = clamp((g.start.x + g.end.x) / 2, boxW / 2, state.canvasWidth - boxW / 2), y = clamp((g.start.y + g.end.y) / 2 - 22 * displayScale, 24 * displayScale, state.canvasHeight - 20 * displayScale);
        return h('g', { pointerEvents: 'none' }, parts.map((points, index) => h('path', { key: index, d: pathFrom(points), fill: index % 2 ? '#38bdf828' : '#a78bfa28', stroke: '#a78bfa66', strokeWidth: displayScale })), h('line', { className: 'moss-wb-laser', x1: g.start.x, y1: g.start.y, x2: g.end.x, y2: g.end.y }), h('rect', { x: x - boxW / 2, y: y - 18 * displayScale, width: boxW, height: 28 * displayScale, rx: 8 * displayScale, fill: '#30213eee' }), h('text', { x, y, fontSize: 12 * displayScale, textAnchor: 'middle', fill: '#f9a8d4' }, text));
      }
      if (['brush', 'lasso'].includes(g.type)) return h('path', { d: pathFrom(g.points, g.type === 'lasso'), fill: g.type === 'lasso' ? `${COLORS[label]}15` : 'none', stroke: g.type === 'brush' ? brushColor : COLORS[label], strokeWidth: g.type === 'brush' ? brushWidth : 2 * displayScale, strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: g.type === 'lasso' ? `${5 * displayScale} ${3 * displayScale}` : undefined, pointerEvents: 'none' });
      if (['rect', 'bubble'].includes(g.type)) return h(g.type === 'bubble' && bubbleStyle !== 'rect' ? 'ellipse' : 'rect', { x: Math.min(g.start.x, g.end.x), y: Math.min(g.start.y, g.end.y), width: Math.abs(g.end.x - g.start.x), height: Math.abs(g.end.y - g.start.y), cx: (g.start.x + g.end.x) / 2, cy: (g.start.y + g.end.y) / 2, rx: Math.abs(g.end.x - g.start.x) / 2, ry: Math.abs(g.end.y - g.start.y) / 2, fill: '#a78bfa20', stroke: '#8b5cf6', strokeWidth: 2 * displayScale, strokeDasharray: `${5 * displayScale} ${3 * displayScale}`, pointerEvents: 'none' });
      return null;
    }
    function renderCanvas() {
      const ordered = live.items.map((item, index) => ({ item, index })).sort((a, b) => Number(b.item.label === 'panel') - Number(a.item.label === 'panel'));
      const ov = live.overlayImage;
      const showOverlay = !!(ov && ov.visible !== false && ov.dataUrl);
      return h('section', { className: 'moss-wb-canvas-column', 'aria-label': '交互画板', onDragOver: event => { if (event.dataTransfer?.types?.includes?.('Files')) event.preventDefault(); }, onDrop: event => { const file = event.dataTransfer?.files?.[0]; if (file && file.type?.startsWith('image/')) { event.preventDefault(); loadOverlayFromFile(file); } } },
        renderDocumentTabs(),
        h('div', { className: 'moss-wb-canvas-stage' }, renderOverlayHud(), h('div', { className: 'moss-wb-canvas-wrap', ref: wrapRef, style: { aspectRatio: `${state.canvasWidth}/${state.canvasHeight}`, width: `min(calc(100cqw - 56px), calc((100cqh - 96px) * ${state.canvasWidth / state.canvasHeight}))` } },
          h('svg', { ref: svgRef, className: 'moss-wb-svg', 'data-tool': tool, xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${state.canvasWidth} ${state.canvasHeight}`, onPointerDown: onCanvasDown, onPointerMove, onPointerUp, onPointerCancel: cancelGesture, onLostPointerCapture: () => { if (gestureRef.current) cancelGesture(); }, role: 'img', 'aria-label': 'MOSS 分镜画板。选择工具后拖动绘制，双击框编辑中文简述。' },
            h('rect', { width: state.canvasWidth, height: state.canvasHeight, fill: '#f8fafc' }),
            showOverlay ? h('image', { href: ov.dataUrl, x: 0, y: 0, width: state.canvasWidth, height: state.canvasHeight, preserveAspectRatio: ov.fitMode === 'contain' ? 'xMidYMid meet' : 'none', opacity: peekOriginal ? 1 : clamp(Number(ov.opacity ?? 0.72), 0.05, 1), style: { pointerEvents: 'none' } }) : null,
            ordered.map(({ item, index }) => itemSvg(item, index)),
            live.strokes.map(stroke => h('path', { key: stroke.id, d: pathFrom(stroke.points, false), stroke: stroke.color, strokeWidth: stroke.width, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none', pointerEvents: 'none' })),
            polygon.length ? h('g', { pointerEvents: 'none' }, h('path', { d: pathFrom(polygon, false), fill: '#a78bfa12', stroke: '#8b5cf6', strokeWidth: 2 * displayScale, strokeDasharray: `${5 * displayScale} ${3 * displayScale}` }), polygon.map((p, i) => h('circle', { key: i, cx: p.x, cy: p.y, r: (i === 0 ? 6 : 4) * displayScale, fill: i === 0 ? '#38bdf8' : '#8b5cf6', stroke: '#fff', strokeWidth: displayScale }))) : null,
            selectionSvg(), gestureSvg()), quickNote())),
        h('div', { className: 'moss-wb-canvas-help' }, h('span', null, `${state.canvasWidth} × ${state.canvasHeight} px (${(state.canvasWidth * state.canvasHeight / 1e6).toFixed(2)} MP)  |  abs_centralized yxyx`), h('span', { className: 'moss-wb-tool-hint' }, tool === 'select' ? '拖动移动 · 白点缩放 · 蓝点变形 · 双击简述' : tool === 'knife' ? '横穿边框切分 · Shift 吸附角度' : tool === 'polygon' ? '逐点点击 · Enter 闭合 · Esc 取消' : '拖动绘制 · Esc 取消'), h('span', { className: 'moss-wb-sync', role: 'status' }, syncStatus)));

    }
    function itemList() {
      return h('section', { className: 'moss-wb-section moss-wb-edit-section' }, h('h3', { className: 'moss-wb-section-title' }, '框列表 · 阅读顺序', h('span', null, `${state.items.length} 个框`)),
        !state.items.length ? h('div', { className: 'moss-wb-empty' }, h('strong', null, '先画框，再告诉 AI 这是什么'), '按 R 拉框 / K 一刀分镜 / B 放气泡；从空白画板自由开始。') : h('div', { className: 'moss-wb-item-list' }, state.items.map((item, index) => h('div', { key: item.id, className: `moss-wb-item-row${selectedId === item.id ? ' moss-wb-selected' : ''}`, draggable: true, onDragStart: event => { if (isTyping(event.target)) { event.preventDefault(); return; } dragId.current = item.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id); }, onDragOver: event => { if (dragId.current) event.preventDefault(); }, onDrop: event => { event.preventDefault(); if (dragId.current) reorder(dragId.current, index); dragId.current = null; }, onDragEnd: () => { dragId.current = null; }, onClick: () => { setSelectedId(item.id); setQuickOpen(true); } },
          h('div', { className: 'moss-wb-item-head' }, h('span', { className: 'moss-wb-item-dot', style: { background: colorFor(item) } }), h('span', { className: 'moss-wb-item-title' }, `#${index + 1} ${LABELS[item.label]}${item.roleTag ? ` · ${item.roleTag}` : ''}`),
            button(item.hidden ? '◯' : '◉', event => { event.stopPropagation(); editItem(item.id, { hidden: !item.hidden }); }, { title: item.hidden ? '显示框' : '隐藏框', 'aria-label': `${item.hidden ? '显示' : '隐藏'}第 ${index + 1} 个框`, 'aria-pressed': !item.hidden }),
            button('↑', event => { event.stopPropagation(); reorder(item.id, index - 1); }, { disabled: index === 0, 'aria-label': '上移阅读顺序' }), button('↓', event => { event.stopPropagation(); reorder(item.id, index + 1); }, { disabled: index === state.items.length - 1, 'aria-label': '下移阅读顺序' }),
            button('⧉', event => { event.stopPropagation(); duplicateItem(item.id); }, { title: '复制框', 'aria-label': '复制框' }), button('×', event => { event.stopPropagation(); deleteItem(item.id); }, { className: 'moss-wb-danger', title: '删除框（可撤销）', 'aria-label': '删除框' })),
          h('input', { value: item.noteZh || '', placeholder: '✏️ 写一句中文简述告诉 AI 这是什么', 'aria-label': `第 ${index + 1} 个框的中文简述`, onChange: event => editItem(item.id, { noteZh: event.target.value }, `note-${item.id}`), onClick: event => { event.stopPropagation(); setSelectedId(item.id); } })))));
    }
    function selectedEditor() {
      return h('section', { className: 'moss-wb-section moss-wb-edit-section' }, h('h3', { className: 'moss-wb-section-title' }, '所选框属性', selected ? button('✏️ 就地编辑', () => selectItem(selected, true), { className: 'moss-wb-quiet' }) : null), selected ? h(React.Fragment, null,
        rolePills(selected), h('div', { className: 'moss-wb-fields' },
          field('中文简述 · AI 理解这个框的关键', selected.noteZh, value => editItem(selected.id, { noteZh: value }, `note-${selected.id}`), { wide: true, multiline: true, placeholder: '如：女主：震惊捂嘴，半身侧脸' }),
          field('身份 / 简短标签', selected.roleTag, value => editItem(selected.id, { roleTag: value }, `role-${selected.id}`), { placeholder: '女主 / 分镜1' }),
          h('label', { className: 'moss-wb-field' }, '标记颜色', h('input', { type: 'color', value: /^#[\da-f]{6}$/i.test(colorFor(selected)) ? colorFor(selected) : COLORS[selected.label], onChange: event => editItem(selected.id, { color: event.target.value }) })),
          field('英文 caption（可选覆盖）', selected.caption, value => editItem(selected.id, { caption: value }, `caption-${selected.id}`), { wide: true, placeholder: '留空时由引擎生成结构化英文描述' })),
        tagChips(selected), selected.label === 'text' ? bubbleControls(selected) : null,
        h('div', { className: 'moss-wb-fields', style: { marginTop: '10px' } }, [['x', '左侧 X'], ['y', '顶部 Y'], ['width', '宽度'], ['height', '高度']].map(([key, title]) => {
          const b = bounds(selected, state), value = key === 'x' ? b.xMin : key === 'y' ? b.yMin : b[key];
          return field(`${title} (px)`, Math.round(value), next => editItemBounds(selected, key, next), { key, type: 'number', min: ['width', 'height'].includes(key) ? 8 : 0, step: 1, disabled: !!selected.locked });
        })),
        h('p', { className: 'moss-wb-coordinate' }, 'MOSS · abs_centralized yxyx'),
        h('div', { className: 'moss-wb-fields' }, ['y_min', 'x_min', 'y_max', 'x_max'].map((key, index) => field(key, bounds(selected, state).mossBbox[index], next => editMossBoundary(selected, index, next), { key, type: 'number', step: 1, disabled: !!selected.locked }))),
        button('重置为矩形顶点', () => { const b = bounds(selected, state); editItem(selected.id, { shapeType: 'rect', points: rectToPoints(b.xMin, b.yMin, b.width, b.height) }); }, { disabled: !!selected.locked, title: '保留外接范围，将异形顶点重置为矩形；可撤销' }),
        h('div', { className: 'moss-wb-row' }, button(selected.locked ? '🔒 解锁' : '🔓 锁定', () => editItem(selected.id, { locked: !selected.locked })), button('⧉ 复制', () => duplicateItem(selected.id)), button('删除（可撤销）', () => deleteItem(selected.id), { className: 'moss-wb-danger' })),
        h('p', { className: 'moss-wb-hint' }, selected.label === 'text' ? '🎯 琥珀色靶点拖向角色框，自动绑定说话人。' : '画板上的蓝色菱形可单独拖动角点，做梯形 / 斜切异形。')) : h('div', { className: 'moss-wb-empty' }, '点击画板或列表中的框查看属性'));
    }
    function globalEditor() {
      return h('section', { className: 'moss-wb-section moss-wb-edit-section' }, h('h3', { className: 'moss-wb-section-title' }, '全局风格与配色'),
        h('div', { className: 'moss-wb-fields' },
          field('全局英文 caption（可选）', state.globalCaption, value => commit({ ...state, globalCaption: value }, 'global-caption'), { wide: true })),
        h('form', { className: 'moss-wb-style-tags', onSubmit: event => { event.preventDefault(); const tags = styleTagDraft.split(/[,，]/).map(value => value.trim()).filter(Boolean); if (tags.length) { commit({ ...state, meta: [...new Set([...state.meta, ...tags])] }); setStyleTagDraft(''); } } }, h('label', { className: 'moss-wb-field' }, '风格标签（可选，自由填写）', h('input', { value: styleTagDraft, placeholder: '输入标签，多个用逗号分隔', onChange: event => setStyleTagDraft(event.target.value) })), h('button', { type: 'submit', disabled: !styleTagDraft.trim() }, '添加标签')),
        h('div', { className: 'moss-wb-tags' }, state.meta.map((tag, index) => button(`${tag} ×`, () => commit({ ...state, meta: state.meta.filter((_, i) => i !== index) }), { key: `${tag}-${index}`, title: '移除这个风格提示（可撤销）', 'aria-label': `删除风格标签 ${tag}` }))),
        h('div', { className: 'moss-wb-palette-heading' }, h('strong', null, '画面配色提示（可选）'), button('＋ 添加颜色', () => commit({ ...state, palette: [...state.palette, '#808080'] })), button('清空配色', () => { commit({ ...state, palette: [] }); notify('已清空画面配色提示，不再限制配色；可撤销'); }, { disabled: !state.palette.length, title: '清空给 AI 的配色提示，不影响框线或画笔颜色；可撤销' })),
        h('p', { className: 'moss-wb-hint' }, '写入 MOSS JSON 的 summary.palette，供 AI 参考画面配色；不是强制取色，也不改变框线或画笔。留空即不指定配色。'),
        state.palette.length ? h('div', { className: 'moss-wb-palette' }, state.palette.map((color, index) => h('div', { key: index, className: 'moss-wb-palette-color' }, h('label', null, `色 ${index + 1}`, h('input', { type: 'color', value: color, onChange: event => commit({ ...state, palette: state.palette.map((old, i) => i === index ? event.target.value : old) }, `palette-${index}`), 'aria-label': `画面配色 ${index + 1}` })), h('span', null, color), button('×', () => commit({ ...state, palette: state.palette.filter((_, i) => i !== index) }), { 'aria-label': `删除配色 ${index + 1}`, title: '删除这个配色提示（可撤销）' })))) : h('p', { className: 'moss-wb-hint', role: 'status' }, '未指定配色 · AI 可自由决定；需要时添加颜色。'));
    }
    function outputEditor() {
      return h(React.Fragment, null,
        h('section', { className: 'moss-wb-section moss-wb-output-section' }, h('h3', { className: 'moss-wb-section-title' }, 'MOSS 规则检查', h('span', null, `${lint.length} 条提示`)),
          lint.length ? h('div', { className: 'moss-wb-lint' }, lint.map((warning, index) => h('div', { className: 'moss-wb-lint-row', key: `${warning.id || warning.code || 'lint'}-${index}` }, h('span', null, `${warning.severity === 'error' ? '⛔' : '⚠'} ${warning.title || warning.message}`, warning.title && warning.message ? h('div', { className: 'moss-wb-hint' }, warning.message) : null), warning.fixAction ? button('一键修复', () => { try { commit(applyLintFix(state, warning.fixAction)); notify('已修复，可撤销'); } catch (e) { notify(`修复失败：${e.message}`); } }) : null))) : h('div', { className: 'moss-wb-good' }, '✓ 坐标、分镜与描述检查通过')),
        h('section', { className: 'moss-wb-section moss-wb-output-section' }, h('h3', { className: 'moss-wb-section-title' }, 'Live MOSS JSON', button('复制', copyJson, { className: 'moss-wb-quiet' })), compiled.error ? h('p', { className: 'moss-wb-error', role: 'alert' }, compiled.error) : null, h('pre', { className: 'moss-wb-json', tabIndex: 0, 'aria-label': '实时 MOSS JSON' }, compiled.mossJsonString), compiled.recommendedComfyParams ? h('p', { className: 'moss-wb-meta' }, `推荐参数：${JSON.stringify(compiled.recommendedComfyParams)}`) : null));
    }
    function toolIcon(id) {
      const paths = { select: 'M4 3l14 10-7 1-3 7z M14 15l5 6', rect: 'M4 5h16v14H4z', knife: 'M4 20L18 3l3 3L7 21z M5 9l10 8', polygon: 'M4 6l9-3 8 8-5 10-12-4z', lasso: 'M6 18c-7-5-3-14 7-14 11 0 12 12 1 14-6 1-8-3-4-4 4-1 5 4 0 8', bubble: 'M5 4h14a2 2 0 012 2v10a2 2 0 01-2 2h-8l-6 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z', brush: 'M14 13l-3-3 7-8 4 3z M11 14c0 8-8 7-9 7 3-2 0-6 5-8z' };
      return h('svg', { width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[id] }));
    }
    function renderToolDock() {
      const roles = ['character', 'object', 'text', 'panel'], roleNames = { character: '角色', object: '物体', text: '台词', panel: '分镜' };
      return h('nav', { className: 'moss-wb-tool-dock', 'aria-label': '画板工具' },
        TOOLS.map(([id, icon, title, key, number]) => button(h(React.Fragment, null, toolIcon(id), h('kbd', null, key)), () => setActiveTool(id), { key: id, className: tool === id ? 'moss-wb-active' : '', 'aria-pressed': tool === id, 'aria-label': `${title}工具`, title: `${title}工具 (${key} / ${number})` })),
        h('hr'), button(h('span', { className: 'moss-wb-role-swatch', style: { background: COLORS[label] } }, roleNames[label]), () => setLabel(roles[(roles.indexOf(label) + 1) % roles.length]), { title: `新框角色：${roleNames[label]}，点击切换`, 'aria-label': `切换新框角色，当前${roleNames[label]}` }),
        button('◉', () => state.overlayImage ? editOverlay({ visible: state.overlayImage.visible === false }) : fileInputRef.current?.click(), { 'aria-label': '切换叠图显示', title: '显示 / 隐藏叠图；没有叠图时选择图片' }));
    }
    function renderOverlayHud() {
      const ov = state.overlayImage;
      if (!ov) return null;
      return h('div', { className: 'moss-wb-overlay-hud', role: 'region', 'aria-label': '叠图检查控制栏' },
        button('◉', () => editOverlay({ visible: ov.visible === false }), { 'aria-pressed': ov.visible !== false, 'aria-label': '显示叠图', title: `${ov.name || '参考图'} · 显示 / 隐藏` }),
        button('▧', () => editOverlay({ wireframe: ov.wireframe === false }), { 'aria-pressed': ov.wireframe !== false, 'aria-label': '线框透视', title: '线框透视' }),
        h('button', { type: 'button', onPointerDown: () => setPeekOriginal(true), onPointerUp: () => setPeekOriginal(false), onPointerLeave: () => setPeekOriginal(false), onFocus: () => {}, onKeyDown: event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setPeekOriginal(true); } }, onKeyUp: () => setPeekOriginal(false), onBlur: () => setPeekOriginal(false), title: '按住只看原图，松开恢复', 'aria-label': '按住只看原图' }, '原图'),
        h('label', null, h('input', { type: 'range', min: 10, max: 100, value: Math.round(clamp(Number(ov.opacity ?? .72), .05, 1) * 100), 'aria-label': '叠图透明度', onChange: event => editOverlay({ opacity: Number(event.target.value) / 100 }, 'overlay-opacity') }), `${Math.round((ov.opacity ?? .72) * 100)}%`),
        button(ov.fitMode === 'contain' ? '比例' : '拉伸', () => editOverlay({ fitMode: ov.fitMode === 'contain' ? 'stretch' : 'contain' }), { title: '叠图保持比例 / 拉伸铺满' }),
        button('适配', () => applyCanvasResize(ov.width, ov.height), { title: `按叠图 ${ov.width}×${ov.height} 适配画布尺寸` }),
        button('↓ PNG', exportCanvasPng, { title: '导出叠图对比 PNG' }), button('×', () => commit({ ...state, overlayImage: null }), { title: '移除叠图（可撤销）', 'aria-label': '移除叠图' }));
    }
    function blankDocumentState() {
      return { ...baseState(), canvasWidth: history.present.canvasWidth, canvasHeight: history.present.canvasHeight, canvasMode: history.present.canvasMode, canvasSizeConfig: history.present.canvasSizeConfig };
    }
    function saveFile() {
      try {
        persistDocuments(saveActiveDocument(documents, history.present));
        seedDocuments = false; storageWarning = ''; history = { ...history }; emit();
        notify('✓ 已保存到文档夹');
        syncDocumentState(history.present).then(() => setSyncStatus('✓ 文件已保存并同步归档')).catch(() => { setSyncStatus('本地已保存 · 服务器同步失败'); notify('文件已在本地保存；服务器暂未确认，可再次保存重试'); });
      } catch { notify('保存失败：文档夹空间不足或不可用，请立即导出 JSON；当前画布未丢失'); }
    }
    function activateDocuments(next) {
      try { persistDocuments(next); } catch { notify('文档夹无法写入：操作已取消，请先导出当前文件，避免丢失'); return; }
      documentHistories.set(activeDocument.id, history);
      const doc = next.documents.find(entry => entry.id === next.activeId);
      const previous = documentHistories.get(doc.id);
      history = previous ? { ...previous, present: normalizeState(doc.state) } : { past: [], present: normalizeState(doc.state), future: [] };
      seedDocuments = false; groupKey = ''; storageWarning = ''; cancelGesture(); setPolygon([]); polygonRef.current = []; setRenamingDoc(null); setSelectedId(null); setQuickOpen(false); emit();
      syncDocumentState(history.present).then(() => setSyncStatus('✓ 活动文档已同步 AI')).catch(() => { setSyncStatus('文档已在本地切换 · 同步失败'); notify('文档已保留在本地，AI 同步失败；点击保存重试'); });
    }
    function createFile() { activateDocuments(newDocument(documents, history.present, blankDocumentState())); }
    function selectDocument(id) { if (id !== documents.activeId) activateDocuments(switchDocument(documents, history.present, id)); }
    function removeDocument(doc) {
      if (!window.confirm(`关闭并删除文档「${doc.title}」？此操作无法撤销，请先导出文件备份。`)) return;
      activateDocuments(closeDocument(documents, history.present, doc.id, blankDocumentState()));
      documentHistories.delete(doc.id);
    }
    function finishDocumentRename() {
      if (!renamingDoc || renameCancelled.current) return;
      try { persistDocuments(renameDocument(documents, renamingDoc.id, renamingDoc.title)); history = { ...history }; emit(); setRenamingDoc(null); }
      catch { notify('重命名未能保存：请导出备份并检查本地存储空间'); }
    }
    function exportFile() {
      try {
        const blob = new Blob([compiled.mossJsonString], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `${activeDocument.title.replace(/[\\/:*?"<>|]/g, '_')}.moss.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); notify('已导出 .moss.json 文件');
      } catch (e) { notify(`导出失败：${e.message}`); }
    }
    function renderDocumentTabs() {
      return h('div', { className: 'moss-wb-document-bar' },
        h('div', { className: 'moss-wb-document-tabs', role: 'tablist', 'aria-label': '打开的文档', onKeyDown: panelTabKeys }, documents.documents.map(doc => {
          const active = doc.id === documents.activeId, docState = active ? state : doc.state, dirty = doc.savedFingerprint !== documentFingerprint(docState);
          return h('div', { key: doc.id, className: `moss-wb-document${active ? ' moss-wb-document-active' : ''}` },
            renamingDoc?.id === doc.id ? h('input', { autoFocus: true, value: renamingDoc.title, maxLength: 60, 'aria-label': '文档名称', onFocus: event => event.target.select(), onChange: event => setRenamingDoc({ id: doc.id, title: event.target.value }), onBlur: finishDocumentRename, onKeyDown: event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); finishDocumentRename(); } if (event.key === 'Escape') { renameCancelled.current = true; setRenamingDoc(null); } } }) : button(h(React.Fragment, null, h('span', { className: 'moss-wb-document-title' }, `📄 ${doc.title}`), h('span', { className: 'moss-wb-document-size' }, ` @ ${docState.canvasWidth}×${docState.canvasHeight} (${docState.items.length}框)`), dirty ? h('span', { className: 'moss-wb-document-dirty', 'aria-label': '未保存' }, ' *') : null), () => selectDocument(doc.id), { role: 'tab', 'aria-selected': active, 'aria-label': `文档 ${doc.title}`, tabIndex: active ? 0 : -1, title: `${doc.title} · ${docState.canvasWidth}×${docState.canvasHeight} · ${dirty ? '未保存' : '已保存'}；双击重命名`, onDoubleClick: () => { selectDocument(doc.id); renameCancelled.current = false; setRenamingDoc({ id: doc.id, title: doc.title }); } }),
            button('×', () => removeDocument(doc), { className: 'moss-wb-document-close', 'aria-label': `关闭并删除文档 ${doc.title}`, title: '关闭并删除此文档（需确认；不可撤销）' }));
        })),
        button('＋ 新建', createFile, { 'aria-label': '新建文档标签', title: '自动保存当前文档，新建空白文件' }),
        button('💾 保存', saveFile, { 'aria-label': '保存当前文档', title: '保存文档 Ctrl / Cmd + S' }));
    }
    function renderContextOptions() {
      if (tool === 'knife') return h(React.Fragment, null, h('label', null, '间距', h('input', { type: 'range', min: 0, max: 36, value: state.gutterWidth ?? 16, 'aria-label': '分镜沟槽宽度', onChange: event => commit({ ...state, gutterWidth: Number(event.target.value) }, 'gutter') })), button('横切 0°', () => accessibleCut(0)), button('竖切 90°', () => accessibleCut(90)), button('斜切 −15°', () => accessibleCut(-15)));
      if (tool === 'bubble') return MOSS_BUBBLE_STYLES.map(style => button(({ oval: '椭圆', thought: '心声', rect: '旁白', burst: '咆哮' })[style.id], () => setBubbleStyle(style.id), { key: style.id, 'aria-pressed': bubbleStyle === style.id, className: bubbleStyle === style.id ? 'moss-wb-active' : '' }));
      if (tool === 'brush') return h(React.Fragment, null, h('input', { type: 'color', value: brushColor, 'aria-label': '画笔颜色', onChange: event => setBrushColor(event.target.value) }), h('label', null, `${brushWidth}px`, h('input', { type: 'range', min: 1, max: 32, value: brushWidth, 'aria-label': '画笔宽度', onChange: event => setBrushWidth(Number(event.target.value)) })), button('清涂鸦', () => commit({ ...state, strokes: [] }), { disabled: !state.strokes.length }));
      return h(React.Fragment, null, tool === 'polygon' && polygon.length ? button(`闭合 (${polygon.length})`, finishPolygon, { disabled: polygon.length < 3 }) : null,
        button('对齐 y_min', () => { commit(snapRowYMin(state, state.canvasWidth, state.canvasHeight)); notify('同行底框已对齐'); }, { title: '对齐同行底框顶部 y_min（可撤销）' }), button('⚡叠入最新图', loadLatestOverlayFromServer, { title: '叠入当前对话最新图片' }), button('叠图…', () => fileInputRef.current?.click(), { title: '选择叠图，也支持拖入 / 粘贴' }));
    }
    function panelTabKeys(event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...event.currentTarget.querySelectorAll('[role=tab]')], index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); tabs[next].click();
    }
    function renderStudioInspector() {
      return h('aside', { className: 'moss-wb-studio-panels', 'aria-label': '属性与图层' },
        h('section', { className: 'moss-wb-scene-panel' }, h('label', null, h('span', null, '全局画面简述'), h('input', { value: state.globalNoteZh || '', placeholder: '一句话描述这幅画面…', 'aria-label': '全局画面简述', onChange: event => commit({ ...state, globalNoteZh: event.target.value }, 'global-note') })), h('div', { className: 'moss-wb-mode', role: 'group', 'aria-label': '画布模式' }, [['single', '单幅'], ['multi_panel', '多格'], ['collage', '拼贴']].map(([id, title]) => button(title, () => commit({ ...state, canvasMode: id }), { key: id, 'aria-pressed': state.canvasMode === id, className: state.canvasMode === id ? 'moss-wb-active' : '' })))),
        h('section', { className: 'moss-wb-property-panel' }, h('div', { className: 'moss-wb-panel-heading' }, '属性', h('span', null, 'PROPERTIES')), h('div', { className: 'moss-wb-panel-tabs', role: 'tablist', onKeyDown: panelTabKeys, 'aria-label': '属性面板' }, [['selection', '当前选中框'], ['style', '风格与色板']].map(([id, title]) => button(title, () => setPropertiesTab(id), { key: id, role: 'tab', 'aria-selected': propertiesTab === id }))), h('div', { className: 'moss-wb-panel-content', role: 'tabpanel', 'aria-label': propertiesTab === 'selection' ? '当前选中框' : '风格与色板' }, propertiesTab === 'selection' ? selectedEditor() : globalEditor())),
        h('section', { className: 'moss-wb-layers-panel' }, h('div', { className: 'moss-wb-panel-heading' }, '图层', h('span', null, 'LAYERS')), h('div', { className: 'moss-wb-panel-tabs', role: 'tablist', onKeyDown: panelTabKeys, 'aria-label': '图层面板' }, [['layers', `图层列表 (${state.items.length})`], ['json', 'MOSS JSON']].map(([id, title]) => button(title, () => setLayersTab(id), { key: id, role: 'tab', 'aria-selected': layersTab === id }))), h('div', { className: 'moss-wb-panel-content', role: 'tabpanel', 'aria-label': layersTab === 'layers' ? '图层列表' : 'MOSS JSON' }, layersTab === 'layers' ? itemList() : outputEditor())));
    }
    let sizePreview = null, sizeError = '';
    try { sizePreview = canvasSizeFromRatioAndMegapixels(sizeDraft.ratioWidth, sizeDraft.ratioHeight, sizeDraft.megapixels); } catch (e) { sizeError = e.message; }
    const ratioPreset = MOSS_ASPECT_RATIOS.find(p => Number(sizeDraft.ratioWidth) / Number(sizeDraft.ratioHeight) === p.width / p.height);
    const showCustomRatio = customRatio || !ratioPreset;
    const sizeChanged = sizePreview && (sizePreview.width !== state.canvasWidth || sizePreview.height !== state.canvasHeight);
    const ov = state.overlayImage;
    return h('div', { ref: rootRef, className: 'moss-wb-root', 'data-narrow': String(narrow), 'data-tab': tab, tabIndex: -1, style: props.style, 'aria-label': 'MOSS 分镜与草图工作台', onPaste: event => {
      if (isTyping(event.target)) return;
      const items = event.clipboardData?.items || [];
      for (const item of items) {
        if (item.type?.startsWith('image/')) {
          const file = item.getAsFile?.();
          if (file) { event.preventDefault(); loadOverlayFromFile(file); break; }
        }
      }
    } },
      h('style', null, MOSS_WORKBENCH_CSS),
      h('input', { ref: fileInputRef, type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: event => { const file = event.target.files?.[0]; if (file) loadOverlayFromFile(file); event.target.value = ''; } }),
      h('header', { className: 'moss-wb-options-bar' },
        h('span', { className: 'moss-wb-studio-brand', title: 'MOSS Studio' }, 'MOSS'),
        h('div', { className: 'moss-wb-file-actions', role: 'group', 'aria-label': '文件操作' },
          button('📄 新建', createFile, { 'aria-label': '新建文件', title: '新建空白画布 (自动保存当前文档标签)' }),
          button(!documentDirty && activeDocument.savedAt ? '✓ 已保存' : '💾 保存', saveFile, { 'aria-label': '保存文件', title: '一键保存当前画布到文档夹并同步归档', className: !documentDirty ? 'moss-wb-file-saved' : '' }),
          button('⬇ 导出', exportFile, { 'aria-label': '导出文件', title: '下载 .moss.json 文件到本地' })),
        h('form', { className: 'moss-wb-size-controls', 'aria-label': '画布比例与像素', title: sizeError || '1 MP = 100万像素，宽高按 32px 就近对齐；修改后应用尺寸', onSubmit: event => { event.preventDefault(); if (sizePreview && !sizeError) applyCanvasResize(sizePreview.width, sizePreview.height, sizeDraft); } },
          h('select', { className: 'moss-wb-select', 'aria-label': '画布比例', value: showCustomRatio ? 'custom' : ratioPreset.id, onChange: event => {
            const preset = MOSS_ASPECT_RATIOS.find(p => p.id === event.target.value);
            if (!preset) { setCustomRatio(true); return; }
            const nextDraft = { ...sizeDraft, ratioWidth: String(preset.width), ratioHeight: String(preset.height) };
            setCustomRatio(false); setSizeDraft(nextDraft);
            try { const size = canvasSizeFromRatioAndMegapixels(nextDraft.ratioWidth, nextDraft.ratioHeight, nextDraft.megapixels); applyCanvasResize(size.width, size.height, nextDraft); } catch (error) { notify(error.message); }
          } }, MOSS_ASPECT_RATIOS.map(p => h('option', { key: p.id, value: p.id }, p.label)), h('option', { value: 'custom' }, '自定义比例 (Custom W:H)')),
          showCustomRatio ? h('div', { className: 'moss-wb-custom-ratio' }, h('input', { type: 'number', step: 'any', min: '.000001', value: sizeDraft.ratioWidth, 'aria-label': '自定义比例宽', 'aria-invalid': !!sizeError, onChange: event => setSizeDraft({ ...sizeDraft, ratioWidth: event.target.value }) }), h('span', null, ':'), h('input', { type: 'number', step: 'any', min: '.000001', value: sizeDraft.ratioHeight, 'aria-label': '自定义比例高', 'aria-invalid': !!sizeError, onChange: event => setSizeDraft({ ...sizeDraft, ratioHeight: event.target.value }) })) : null,
          h('label', { className: 'moss-wb-mp-control' }, 'MP', h('input', { type: 'number', min: '.000001', step: 'any', value: sizeDraft.megapixels, 'aria-label': '总像素（百万像素 MP）', 'aria-invalid': !!sizeError, onChange: event => setSizeDraft({ ...sizeDraft, megapixels: event.target.value }) })),
          h('button', { type: 'submit', disabled: !sizeChanged || !!sizeError, title: sizeError || (sizePreview ? `应用 ${sizePreview.width}×${sizePreview.height} px` : '') , 'aria-label': '应用尺寸' }, '应用'),
          h('span', { className: 'moss-wb-size-readout', title: sizeError || `实际 ${(state.canvasWidth * state.canvasHeight / 1e6).toFixed(3)} MP${sizeChanged ? ` → ${sizePreview.width}×${sizePreview.height}` : ''}`, role: 'status' }, `${state.canvasWidth}×${state.canvasHeight}`),
          button('⇄', () => {
            const flipped = sizeDraftFromCanvas(state.canvasHeight, state.canvasWidth, state.canvasSizeConfig ? { ...state.canvasSizeConfig, ratioWidth: state.canvasSizeConfig.ratioHeight, ratioHeight: state.canvasSizeConfig.ratioWidth } : null);
            setCustomRatio(false); setSizeDraft(flipped); applyCanvasResize(state.canvasHeight, state.canvasWidth, flipped);
          }, { 'aria-label': '横竖互换', title: '立即互换画布宽高，并匹配横竖比例；可撤销' }),
          button('链', () => setAutoScaleBoxes(v => !v), { 'aria-label': '自动适配框', 'aria-pressed': autoScaleBoxes, className: autoScaleBoxes ? 'moss-wb-active' : '', title: '改变尺寸时按比例适配框和线条；可撤销' })),
        h('div', { className: 'moss-wb-context-options', 'aria-label': '当前工具选项' }, renderContextOptions()),
        h('div', { className: 'moss-wb-top-actions' }, button('↶', undo, { disabled: !snapshot.past.length, 'aria-label': '↶ 撤销', title: '撤销 Ctrl / Cmd + Z' }), button('↷', redo, { disabled: !snapshot.future.length, 'aria-label': '↷ 重做', title: '重做 Ctrl / Cmd + Shift + Z' }), button('复制 JSON', copyJson, { title: '复制 MOSS JSON' }), button('导入', () => { setImportOpen(true); setImportText(''); setImportError(''); }, { title: '导入 JSON 到画板' }), button(busy ? '同步…' : '发送给 AI ↗', sendToAI, { className: 'moss-wb-primary', disabled: busy, title: '发送分镜与描述给 AI，填入对话框' }))),
      h('div', { className: 'moss-wb-body' }, renderToolDock(), renderCanvas(), renderStudioInspector()),
      storageWarning ? h('div', { className: 'moss-wb-alert', role: 'status' }, storageWarning) : null,
      error ? h('div', { className: 'moss-wb-alert moss-wb-error', role: 'alert' }, error, button('关闭', () => setError(''))) : null,
      toast ? h('div', { className: 'moss-wb-toast', role: 'status', 'aria-live': 'polite' }, toast) : null,
      importOpen ? h('section', { className: 'moss-wb-import', role: 'dialog', 'aria-modal': true, 'aria-label': '导入 MOSS JSON', onKeyDown: event => { if (event.key === 'Escape') setImportOpen(false); } },
        h('div', { className: 'moss-wb-row' }, h('h3', null, '📥 导入 JSON 到画板'), h('span', { className: 'moss-wb-spacer' }), button('×', () => setImportOpen(false), { 'aria-label': '关闭导入' })), h('p', null, '粘贴 MOSS JSON。导入会替换当前布局，随时可撤销。'), h('textarea', { autoFocus: true, value: importText, onChange: event => setImportText(event.target.value), placeholder: '{ "meta": [...], "items": [...] }', 'aria-label': '粘贴 MOSS JSON', spellCheck: false }), importError ? h('p', { className: 'moss-wb-error', role: 'alert' }, importError) : null, h('div', { className: 'moss-wb-row' }, button('可视化到画板', importJson, { className: 'moss-wb-primary', disabled: !importText.trim() }), button('取消', () => setImportOpen(false)))) : null);
  }
  function SidebarTabView(props = {}) { return h(WorkbenchView, { ...props, sidebar: true }); }
  function ComposerPill() {
    const { present } = useHistory();
    return h(React.Fragment, null, h('style', null, MOSS_WORKBENCH_CSS), h('button', { type: 'button', className: 'moss-wb-pill', onClick: () => openWorkbenchTab?.(), title: '打开分镜画板，框出位置并写中文简述', 'aria-label': '打开 MOSS 分镜工作台' }, `▧ MOSS 分镜 ${present.items.length ? `· ${present.items.length} 框` : ''}`));
  }
  return { WorkbenchView, SidebarTabView, ComposerPill };
}
