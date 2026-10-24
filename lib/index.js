import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// === Embedded Core: src/core/moss-engine.js ===

// Core MOSS-Image Geometry, Split-Knife Polygon Clipper, Linter & Prompt Compiler Engine
// Pure ES module (zero Node/DOM dependencies) shared by Host Server & Browser Client.
const MOSS_LOCKED_NEGATIVE_PROMPT =
  "<|texture_and_style_neg|>, <|age_and_body_neg|>, <|universal_anatomy_neg|>";
const MOSS_RESOLUTIONS = [
  {
    id: "1024x1536",
    label: "1024×1536 (多格条漫/海报竖版 · 推荐)",
    width: 1024,
    height: 1536,
    steps: 50,
    cfg: 3.5,
    slg: "22",
  },
  {
    id: "640x960",
    label: "640×960 (标准竖构图 2:3)",
    width: 640,
    height: 960,
    steps: 25,
    cfg: 3.5,
    slg: "",
  },
  {
    id: "960x640",
    label: "960×640 (标准横构图 3:2)",
    width: 960,
    height: 640,
    steps: 25,
    cfg: 3.5,
    slg: "",
  },
  {
    id: "1536x1024",
    label: "1536×1024 (宽银幕横版跨页 3:2)",
    width: 1536,
    height: 1024,
    steps: 50,
    cfg: 3.5,
    slg: "22",
  },
  {
    id: "1760x896",
    label: "1760×896 (超宽电影镜头画幅 2:1)",
    width: 1760,
    height: 896,
    steps: 50,
    cfg: 3.5,
    slg: "22",
  },
  {
    id: "896x1760",
    label: "896×1760 (竖长屏条漫 1:2)",
    width: 896,
    height: 1760,
    steps: 50,
    cfg: 3.5,
    slg: "22",
  },
  {
    id: "1024x1024",
    label: "1024×1024 (1:1 方形精绘)",
    width: 1024,
    height: 1024,
    steps: 35,
    cfg: 3.5,
    slg: "22",
  },
];

// Size controls separate composition from pixel budget. Legacy resolutions above
// remain available for existing integrations and sampling recommendations only.
const MOSS_ASPECT_RATIOS = [
  { id: '1:1', width: 1, height: 1, label: '1:1 (Square · 正方)' },
  { id: '2:3', width: 2, height: 3, label: '2:3 (Portrait Photo · 竖版摄影)' },
  { id: '3:2', width: 3, height: 2, label: '3:2 (Photo · 横版摄影)' },
  { id: '3:4', width: 3, height: 4, label: '3:4 (Portrait Standard · 竖版标准)' },
  { id: '4:3', width: 4, height: 3, label: '4:3 (Standard · 横版标准)' },
  { id: '9:16', width: 9, height: 16, label: '9:16 (Portrait Widescreen · 竖屏)' },
  { id: '16:9', width: 16, height: 9, label: '16:9 (Widescreen · 宽屏)' },
  { id: '1:2', width: 1, height: 2, label: '1:2 / 9:18 (Portrait 2:1 · 竖屏2:1)' },
  { id: '2:1', width: 2, height: 1, label: '2:1 / 18:9 (Landscape 2:1 · 横屏2:1)' },
  { id: '9:19.5', width: 6, height: 13, label: '9:19.5 (iPhone XR/全面屏竖屏)' },
  { id: '19.5:9', width: 13, height: 6, label: '19.5:9 (iPhone XR/全面屏横屏)' },
  { id: '9:21', width: 3, height: 7, label: '9:21 (Portrait Ultrawide · 竖版超宽)' },
  { id: '21:9', width: 21, height: 9, label: '21:9 (Ultrawide · 电影超宽屏)' },
];
function matchCanvasAspectRatio(width, height) {
  if (!(width > 0 && height > 0)) return undefined;
  // Independent rounding to 32px may move either axis by up to 16px.
  return MOSS_ASPECT_RATIOS.filter(p => Math.abs(width * p.height - height * p.width) / (p.width + p.height) <= 16.000001)
    .sort((a, b) => Math.abs(Math.log(width / height / (a.width / a.height))) - Math.abs(Math.log(width / height / (b.width / b.height))))[0];
}
function canvasSizeFromRatioAndMegapixels(ratioWidth, ratioHeight, megapixels) {
  const rw = Number(ratioWidth), rh = Number(ratioHeight), mp = Number(megapixels);
  if (![rw, rh].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("比例的宽和高都必须是大于 0 的数字。");
  }
  if (!Number.isFinite(mp) || mp <= 0) {
    throw new Error("请输入大于 0 的总像素数，单位为 MP（百万像素）。");
  }
  const ratio = rw / rh, pixels = mp * 1_000_000;
  // MOSS generation uses 32-pixel spatial units. The displayed pixel size is
  // authoritative; the requested ratio and MP are approximate after alignment.
  const width = Math.round(Math.sqrt(pixels * ratio) / 32) * 32;
  const height = Math.round(Math.sqrt(pixels / ratio) / 32) * 32;
  if (![width, height].every(value => Number.isFinite(value) && value >= 64 && value <= 8192)) {
    throw new Error("计算后的宽高须在 64–8192 px 之间，请调整比例或 MP。");
  }
  return { width, height };
}
const MOSS_META_PRESETS = [
  { id: "comic", labelZh: "漫画 (comic)" },
  { id: "multi_panel", labelZh: "多格分镜 (multi_panel)" },
  { id: "digital_painting", labelZh: "厚涂插画 (digital_painting)" },
  { id: "anime_screencap", labelZh: "动画截图 (anime_screencap)" },
  { id: "cel_shading", labelZh: "赛璐璐平涂 (cel_shading)" },
  { id: "cinematic_lighting", labelZh: "电影光影 (cinematic_lighting)" },
  { id: "watercolor", labelZh: "水彩手绘 (watercolor)" },
  { id: "monochrome_manga", labelZh: "黑白日漫 (monochrome_manga)" },
  { id: "poster_design", labelZh: "海报排版 (poster_design)" },
];
const MOSS_PALETTE_PRESETS = [
  {
    id: "cyber_neon",
    name: "Cyberpunk Neon",
    labelZh: "赛博霓虹 (冷蓝+荧光粉)",
    colors: ["#0F172A", "#1E293B", "#38BDF8", "#F43F5E", "#F8FAFC"],
  },
  {
    id: "twilight_warm",
    name: "Warm Twilight",
    labelZh: "黄昏暖调 (琥珀+深靛)",
    colors: ["#1C1917", "#7C2D12", "#EA580C", "#FBBF24", "#FEF3C7"],
  },
  {
    id: "manga_ink",
    name: "Manga Ink & Accent",
    labelZh: "黑白网点+朱红点睛",
    colors: ["#09090B", "#3F3F46", "#D4D4D8", "#FAFAFA", "#EF4444"],
  },
  {
    id: "pastel_youth",
    name: "Pastel Youth",
    labelZh: "青春通透 (天青+樱粉)",
    colors: ["#1E3A8A", "#60A5FA", "#F472B6", "#FDE047", "#FFFBEB"],
  },
  {
    id: "noir_thriller",
    name: "Noir Suspense",
    labelZh: "悬疑冷翠 (墨黑+幽绿)",
    colors: ["#050807", "#11221C", "#10B981", "#94A3B8", "#E2E8F0"],
  },
];
const MOSS_BUBBLE_STYLES = [
  {
    id: "oval",
    shortZh: "💬 说话椭圆(带尾巴)",
    labelZh: "标准说话椭圆气泡 (带指向尾巴)",
    hasTail: true,
    templateEn: (speakerName = "the character", dir = "bottom", dirCaps = "DOWN") =>
      `Clean vertical Chinese spoken dialogue spoken by ${speakerName} inside a rounded oval comic speech bubble, with a clear pointer tail on its ${dir} edge pointing straight ${dirCaps} to ${speakerName}'s head.`,
  },
  {
    id: "burst",
    shortZh: "💥 咆哮锯齿(带尾巴)",
    labelZh: "情绪爆发锯齿气泡 (短句怒吼/震惊)",
    hasTail: true,
    templateEn: (speakerName = "the character", dir = "bottom", dirCaps = "DOWN") =>
      `Clean vertical Chinese shouted exclamation spoken by ${speakerName} inside a jagged burst comic speech bubble, with a sharp pointer tail on its ${dir} edge pointing straight ${dirCaps} to ${speakerName}'s head.`,
  },
  {
    id: "thought",
    shortZh: "💭 心声独白(无尾椭圆)",
    labelZh: "画外音/内心独白无尾椭圆气泡 (防串味)",
    hasTail: false,
    templateEn: () =>
      `Clean vertical Chinese inner-monologue text inside a tail-less vertical oval thought bubble (smooth oval outline with NO pointer tail pointing to any character).`,
  },
  {
    id: "rect",
    shortZh: "🪧 旁白方框(无尾黑框)",
    labelZh: "直角白底黑框旁白/设定铭牌 (无尾巴)",
    hasTail: false,
    templateEn: () =>
      `Clean vertical Chinese text inside a sharp-cornered white rectangular character profile label box with a thin black border (no bubble tail).`,
  },
];
const MOSS_QUICK_TAGS = {
  character: [
    "半身特写 (waist-up)",
    "七分身中景 (thigh-up)",
    "侧脸回眸",
    "前景背影虚化",
    "双手抱胸冷笑",
    "震惊瞳孔收缩",
  ],
  object: [
    "眼部微距特写 (仅眼睛防多头)",
    "手部动作特写 (仅手部)",
    "唇部微距特写",
    "关键道具大特写",
    "背景建筑环境",
  ],
  text: [
    "女主台词",
    "男主台词",
    "画外音独白",
    "顶部时间地点旁白",
    "震惊短句咆哮",
  ],
  panel: [
    "第1格：远景建立环境",
    "第2格：角色对峙中景",
    "第3格：情绪爆发斜切特写",
    "底部左格：局部微距",
    "底部右格：反应镜头",
  ],
};

function clampNum(v, min, max) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
function rectToPoints(x, y, width, height) {
  const x1 = Number(x) || 0;
  const y1 = Number(y) || 0;
  const x2 = x1 + Math.max(1, Number(width) || 1);
  const y2 = y1 + Math.max(1, Number(height) || 1);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}
function screenRectToMossBbox(
  xMin,
  yMin,
  xMax,
  yMax,
  canvasWidth = 1024,
  canvasHeight = 1536
) {
  const W = Math.max(2, Number(canvasWidth) || 1024);
  const H = Math.max(2, Number(canvasHeight) || 1536);
  const halfW = W / 2;
  const halfH = H / 2;

  const sx1 = clampNum(Math.min(xMin, xMax), 0, W);
  const sx2 = clampNum(Math.max(xMin, xMax), 0, W);
  const sy1 = clampNum(Math.min(yMin, yMax), 0, H);
  const sy2 = clampNum(Math.max(yMin, yMax), 0, H);

  let mossYMin = Math.floor(sy1 - halfH);
  let mossXMin = Math.floor(sx1 - halfW);
  let mossYMax = Math.ceil(sy2 - halfH);
  let mossXMax = Math.ceil(sx2 - halfW);

  mossYMin = clampNum(mossYMin, -Math.floor(halfH), Math.ceil(halfH) - 1);
  mossXMin = clampNum(mossXMin, -Math.floor(halfW), Math.ceil(halfW) - 1);
  mossYMax = clampNum(Math.max(mossYMin + 1, mossYMax), -Math.floor(halfH) + 1, Math.ceil(halfH));
  mossXMax = clampNum(Math.max(mossXMin + 1, mossXMax), -Math.floor(halfW) + 1, Math.ceil(halfW));

  return [mossYMin, mossXMin, mossYMax, mossXMax];
}
function mossBboxToScreenRect(
  bbox,
  canvasWidth = 1024,
  canvasHeight = 1536
) {
  const W = Math.max(2, Number(canvasWidth) || 1024);
  const H = Math.max(2, Number(canvasHeight) || 1536);
  const halfW = W / 2;
  const halfH = H / 2;
  const [yMin = 0, xMin = 0, yMax = 100, xMax = 100] = Array.isArray(bbox) ? bbox : [];
  const sx1 = clampNum(xMin + halfW, 0, W);
  const sy1 = clampNum(yMin + halfH, 0, H);
  const sx2 = clampNum(Math.max(sx1 + 1, xMax + halfW), 0, W);
  const sy2 = clampNum(Math.max(sy1 + 1, yMax + halfH), 0, H);
  return {
    x: sx1,
    y: sy1,
    xMin: sx1,
    yMin: sy1,
    xMax: sx2,
    yMax: sy2,
    width: sx2 - sx1,
    height: sy2 - sy1,
  };
}
function resizeWorkbenchCanvas(
  state,
  newWidth,
  newHeight,
  options = { scaleItems: true }
) {
  const prevW = Math.max(64, Number(state?.canvasWidth) || 1024);
  const prevH = Math.max(64, Number(state?.canvasHeight) || 1536);
  const nextW = Math.max(64, Math.round(Number(newWidth) || prevW));
  const nextH = Math.max(64, Math.round(Number(newHeight) || prevH));
  if (prevW === nextW && prevH === nextH) {
    return { ...state, canvasWidth: nextW, canvasHeight: nextH };
  }

  const scaleItems = options?.scaleItems !== false;
  const sx = scaleItems ? nextW / prevW : 1;
  const sy = scaleItems ? nextH / prevH : 1;

  const scalePt = (p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return p;
    return {
      x: Math.round(clampNum(p.x * sx, 0, nextW)),
      y: Math.round(clampNum(p.y * sy, 0, nextH)),
    };
  };

  const nextItems = Array.isArray(state?.items)
    ? state.items.map((it) => {
        if (!it) return it;
        const pts = Array.isArray(it.points) ? it.points.map(scalePt) : [];
        return {
          ...it,
          points: pts,
          tailPoint: it.tailPoint ? scalePt(it.tailPoint) : null,
        };
      })
    : [];

  const nextStrokes = Array.isArray(state?.strokes)
    ? state.strokes.map((st) => {
        if (!st) return st;
        return {
          ...st,
          size: Number.isFinite(st.size)
            ? Math.max(1, Math.round(st.size * ((sx + sy) / 2)))
            : 4,
          points: Array.isArray(st.points) ? st.points.map(scalePt) : [],
        };
      })
    : [];

  const nextGutter = Number.isFinite(Number(state?.gutterWidth))
    ? Math.max(0, Math.round(Number(state.gutterWidth) * ((sx + sy) / 2)))
    : 16;

  return {
    ...state,
    canvasWidth: nextW,
    canvasHeight: nextH,
    gutterWidth: nextGutter,
    items: nextItems,
    strokes: nextStrokes,
  };
}
function pointsToAABB(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return { xMin: 0, yMin: 0, xMax: 1, yMax: 1, width: 1, height: 1, centerX: 0.5, centerY: 0.5 };
  }
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < xMin) xMin = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.x > xMax) xMax = p.x;
    if (p.y > yMax) yMax = p.y;
  }
  if (!Number.isFinite(xMin)) {
    return { xMin: 0, yMin: 0, xMax: 1, yMax: 1, width: 1, height: 1, centerX: 0.5, centerY: 0.5 };
  }
  const width = Math.max(1, xMax - xMin);
  const height = Math.max(1, yMax - yMin);
  return {
    xMin,
    yMin,
    xMax: xMin + width,
    yMax: yMin + height,
    width,
    height,
    centerX: xMin + width / 2,
    centerY: yMin + height / 2,
  };
}
function getItemAABB(item, canvasWidth = 1024, canvasHeight = 1536) {
  const pts =
    item && Array.isArray(item.points) && item.points.length > 0
      ? item.points
      : item && Array.isArray(item.bbox) && item.bbox.length === 4
      ? (() => {
          const r = mossBboxToScreenRect(item.bbox, canvasWidth, canvasHeight);
          return rectToPoints(r.xMin, r.yMin, r.width, r.height);
        })()
      : rectToPoints(0, 0, 100, 100);
  const aabb = pointsToAABB(pts);
  const mossBbox = screenRectToMossBbox(
    aabb.xMin,
    aabb.yMin,
    aabb.xMax,
    aabb.yMax,
    canvasWidth,
    canvasHeight
  );
  return {
    ...aabb,
    mossBbox,
  };
}

// Ramer-Douglas-Peucker polyline simplification
function simplifyPolyline(points = [], tolerance = 3) {
  if (!Array.isArray(points) || points.length <= 2) return points ? points.slice() : [];
  const sqTol = tolerance * tolerance;

  function getSqSegDist(p, p1, p2) {
    let x = p1.x;
    let y = p1.y;
    let dx = p2.x - x;
    let dy = p2.y - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2.x;
        y = p2.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  }

  function simplifyDPStep(pts, first, last, sqTolerance, simplified) {
    let maxSqDist = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const sqDist = getSqSegDist(pts[i], pts[first], pts[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    if (maxSqDist > sqTolerance && index !== -1) {
      if (index - first > 1) simplifyDPStep(pts, first, index, sqTolerance, simplified);
      simplified.push(pts[index]);
      if (last - index > 1) simplifyDPStep(pts, index, last, sqTolerance, simplified);
    }
  }

  const last = points.length - 1;
  const simplified = [points[0]];
  simplifyDPStep(points, 0, last, sqTol, simplified);
  simplified.push(points[last]);
  return simplified;
}
function describeShapeGeometry(item, canvasWidth = 1024, canvasHeight = 1536) {
  const pts = Array.isArray(item?.points) ? item.points : [];
  if (pts.length < 3) {
    return {
      isIrregular: false,
      shapeLabelEn: "axis-aligned rectangular region",
      shapePromptHintEn: "standard rectangular bounding region",
      badgeZh: "标准矩形",
      slantAnglesDeg: [],
    };
  }

  const slantAnglesDeg = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) < 4) continue;
    let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    while (deg <= -90) deg += 180;
    while (deg > 90) deg -= 180;
    const mod90 = Math.abs(((deg % 90) + 90) % 90);
    const deviation = Math.min(mod90, 90 - mod90);
    if (deviation >= 3) {
      slantAnglesDeg.push(deg);
    }
  }

  const isAxisAlignedQuad = pts.length === 4 && slantAnglesDeg.length === 0;
  if (item?.label === "text" && item?.bubbleStyle) {
    const styleObj = MOSS_BUBBLE_STYLES.find((s) => s.id === item.bubbleStyle);
    return {
      isIrregular: item.bubbleStyle !== "rect",
      shapeLabelEn: `speech bubble (${item.bubbleStyle})`,
      shapePromptHintEn: styleObj ? styleObj.labelZh : "comic speech bubble",
      badgeZh: styleObj ? styleObj.shortZh : "气泡框",
      slantAnglesDeg,
    };
  }

  if (isAxisAlignedQuad) {
    return {
      isIrregular: false,
      shapeLabelEn: "rectangular frame",
      shapePromptHintEn: "clean axis-aligned rectangular panel/region",
      badgeZh: "矩形框",
      slantAnglesDeg: [],
    };
  }

  if (pts.length === 4) {
    const primaryAngle = slantAnglesDeg[0] ?? 15;
    return {
      isIrregular: true,
      shapeLabelEn: `dynamic slanted trapezoidal quad (${primaryAngle}° diagonal edge)`,
      shapePromptHintEn: `dynamic slanted trapezoidal panel with ${primaryAngle}° diagonal border cut`,
      badgeZh: `斜切四角框 (${primaryAngle}°)`,
      slantAnglesDeg,
    };
  }

  if (item?.shapeType === "lasso") {
    const aabb = pointsToAABB(pts);
    const diag = aabb.width > aabb.height * 1.25 ? "horizontal-sweeping" : aabb.height > aabb.width * 1.25 ? "vertical-sweeping" : "diagonal-flowing";
    return {
      isIrregular: true,
      shapeLabelEn: `organic freehand lasso silhouette (${pts.length} vertices, ${diag})`,
      shapePromptHintEn: `organic ${diag} freehand silhouette contour inside this bounding box`,
      badgeZh: `自由套索 (${pts.length}点)`,
      slantAnglesDeg,
    };
  }

  const primaryAngle = slantAnglesDeg[0] ?? 0;
  return {
    isIrregular: true,
    shapeLabelEn: `irregular ${pts.length}-gon polygon${primaryAngle ? ` (${primaryAngle}° cut)` : ""}`,
    shapePromptHintEn: `irregular ${pts.length}-vertex polygon panel${primaryAngle ? ` with ${primaryAngle}° diagonal gutter cut` : ""}`,
    badgeZh: `${pts.length}边形异形框`,
    slantAnglesDeg,
  };
}

function polygonSignedArea(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

function polygonArea(pts) {
  return Math.abs(polygonSignedArea(pts));
}

function dedupePolygonPoints(pts, eps = 0.5) {
  const out = [];
  for (const p of pts) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > eps) {
      out.push({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) });
    }
  }
  if (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= eps) {
    out.pop();
  }
  return out;
}

// Clip a polygon against a half-plane defined by n·p >= c
function clipPolygonHalfPlane(points, nx, ny, c) {
  const pts = dedupePolygonPoints(points);
  if (pts.length < 3) return [];
  const out = [];
  const eps = 1e-6;
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    const dCurr = nx * curr.x + ny * curr.y - c;
    const dPrev = nx * prev.x + ny * prev.y - c;
    const currInside = dCurr >= -eps;
    const prevInside = dPrev >= -eps;

    if (currInside !== prevInside) {
      const denom = dPrev - dCurr;
      const t = Math.abs(denom) > 1e-9 ? dPrev / denom : 0.5;
      out.push({
        x: prev.x + (curr.x - prev.x) * t,
        y: prev.y + (curr.y - prev.y) * t,
      });
    }
    if (currInside) {
      out.push(curr);
    }
  }
  return dedupePolygonPoints(out);
}
function splitPolygonByLine(
  polygonPoints,
  lineStart,
  lineEnd,
  gutterWidth = 14
) {
  const pts = dedupePolygonPoints(polygonPoints);
  if (pts.length < 3 || !lineStart || !lineEnd) {
    return { didSplit: false, polygons: [], cutAngleDeg: 0 };
  }
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) {
    return { didSplit: false, polygons: [], cutAngleDeg: 0 };
  }

  const cutAngleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
  // Unit normal perpendicular to the cut line
  const nx = -dy / len;
  const ny = dx / len;
  const c0 = nx * lineStart.x + ny * lineStart.y;

  // Check if the infinite line actually crosses the polygon interior
  let minProj = Infinity;
  let maxProj = -Infinity;
  for (const p of pts) {
    const proj = nx * p.x + ny * p.y - c0;
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  }

  const halfGutter = Math.max(0, Number(gutterWidth) || 0) / 2;
  const minMargin = Math.max(8, halfGutter + 4);
  if (minProj > -minMargin || maxProj < minMargin) {
    return { didSplit: false, polygons: [], cutAngleDeg };
  }

  const polyA = clipPolygonHalfPlane(pts, nx, ny, c0 + halfGutter);
  const polyB = clipPolygonHalfPlane(pts, -nx, -ny, -(c0 - halfGutter));

  if (polyA.length < 3 || polyB.length < 3 || polygonArea(polyA) < 120 || polygonArea(polyB) < 120) {
    return { didSplit: false, polygons: [], cutAngleDeg };
  }

  // Sort the two resulting polygons in manga reading order (top-to-bottom, then left-to-right)
  const aabbA = pointsToAABB(polyA);
  const aabbB = pointsToAABB(polyB);
  const ordered =
    Math.abs(aabbA.centerY - aabbB.centerY) > 40
      ? aabbA.centerY <= aabbB.centerY
        ? [polyA, polyB]
        : [polyB, polyA]
      : aabbA.centerX <= aabbB.centerX
      ? [polyA, polyB]
      : [polyB, polyA];

  return {
    didSplit: true,
    polygons: ordered,
    cutAngleDeg,
  };
}
function applyKnifeCutToState(
  state,
  lineStart,
  lineEnd,
  options = {}
) {
  const W = Number(state?.canvasWidth) || 1024;
  const H = Number(state?.canvasHeight) || 1536;
  const gutterWidth = Number(options.gutterWidth ?? state?.gutterWidth ?? 16);
  let end = { ...lineEnd };
  if (options.snapAngle) {
    const dx = end.x - lineStart.x;
    const dy = end.y - lineStart.y;
    const dist = Math.hypot(dx, dy);
    const snapRad = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
    end = {
      x: lineStart.x + Math.cos(snapRad) * dist,
      y: lineStart.y + Math.sin(snapRad) * dist,
    };
  }

  const items = Array.isArray(state?.items) ? state.items.slice() : [];
  const hasPanel = items.some((it) => it && it.label === "panel" && !it.hidden);

  // If no panel exists yet, create a full-canvas base panel and slice it!
  if (!hasPanel) {
    const pad = 16;
    const basePoly = rectToPoints(pad, pad, W - pad * 2, H - pad * 2);
    const splitRes = splitPolygonByLine(basePoly, lineStart, end, gutterWidth);
    if (!splitRes.didSplit) return state;
    const newPanels = splitRes.polygons.map((pts, idx) => ({
      id: `panel-${Date.now().toString(36)}-${idx + 1}`,
      label: "panel",
      shapeType: "split-panel",
      points: pts,
      noteZh: "",
      roleTag: `分镜${idx + 1}`,
      caption: "",
      text: "",
      color: "#64748b",
    }));
    return {
      ...state,
      items: [...newPanels, ...items],
    };
  }

  const nextItems = [];
  let splitCount = 0;
  let panelIndex = 1;

  for (const item of items) {
    const canCut =
      item &&
      item.label === "panel" &&
      !item.hidden &&
      !item.locked &&
      (!options.targetItemId || item.id === options.targetItemId);

    if (canCut) {
      const res = splitPolygonByLine(item.points, lineStart, end, gutterWidth);
      if (res.didSplit) {
        splitCount++;
        for (let i = 0; i < res.polygons.length; i++) {
          nextItems.push({
            ...item,
            id: `panel-${Date.now().toString(36)}-${splitCount}-${i + 1}`,
            shapeType: "split-panel",
            points: res.polygons[i],
            noteZh: i === 0 ? item.noteZh || "" : "",
            roleTag: `分镜${panelIndex++}`,
          });
        }
        continue;
      }
    }
    if (item?.label === "panel") {
      panelIndex++;
    }
    nextItems.push(item);
  }

  if (splitCount === 0) return state;
  return {
    ...state,
    items: nextItems,
  };
}
function snapRowYMin(
  state,
  canvasWidth = 1024,
  canvasHeight = 1536,
  thresholdPx = 18
) {
  const W = Number(canvasWidth || state?.canvasWidth) || 1024;
  const H = Number(canvasHeight || state?.canvasHeight) || 1536;
  const items = Array.isArray(state?.items) ? state.items.map((it) => ({ ...it, points: it.points?.map((p) => ({ ...p })) || [] })) : [];

  const aabbs = items.map((it) => getItemAABB(it, W, H));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].hidden || items[j].hidden) continue;
      const bi = aabbs[i];
      const bj = aabbs[j];
      const horizDisjoint = bi.xMax <= bj.xMin + 24 || bj.xMax <= bi.xMin + 24;
      const yDiff = Math.abs(bi.yMin - bj.yMin);
      if (horizDisjoint && yDiff > 0 && yDiff <= thresholdPx) {
        const targetYMin = Math.round((bi.yMin + bj.yMin) / 2);
        for (const [idx, b] of [
          [i, bi],
          [j, bj],
        ]) {
          const oldYMin = b.yMin;
          items[idx].points = items[idx].points.map((p) =>
            Math.abs(p.y - oldYMin) <= thresholdPx
              ? { x: p.x, y: targetYMin }
              : p
          );
          aabbs[idx] = getItemAABB(items[idx], W, H);
        }
      }
    }
  }
  return {
    ...state,
    items,
  };
}

const CN_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const CN_UNITS = ["", "十", "百", "千"];
function numberToChinese(numStr) {
  const clean = String(numStr).trim();
  if (!/^\d+$/.test(clean)) return clean;
  const n = Number(clean);
  if (!Number.isSafeInteger(n) || clean.length > 8) {
    return clean
      .split("")
      .map((d) => CN_DIGITS[Number(d)])
      .join("");
  }
  if (n === 0) return "零";

  function sectionToChinese(sec) {
    let str = "";
    let zero = false;
    for (let i = 0; i < 4 && sec > 0; i++) {
      const d = sec % 10;
      if (d === 0) {
        if (!zero && str.length > 0) {
          zero = true;
          str = "零" + str;
        }
      } else {
        zero = false;
        str = CN_DIGITS[d] + CN_UNITS[i] + str;
      }
      sec = Math.floor(sec / 10);
    }
    return str.replace(/^一十/, "十");
  }

  const wan = Math.floor(n / 10000);
  const rest = n % 10000;
  if (wan === 0) return sectionToChinese(rest);
  const wanStr = sectionToChinese(wan) + "万";
  if (rest === 0) return wanStr;
  const needZero = rest < 1000;
  return wanStr + (needZero ? "零" : "") + sectionToChinese(rest);
}
function normalizeVerticalChineseText(text = "") {
  if (!text) return "";
  let out = String(text);
  // Convert Arabic numbers to Chinese numerals
  out = out.replace(/\d+/g, (m) => numberToChinese(m));
  // Remove spaces between CJK characters
  out = out.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, "$1$2");
  out = out.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, "$1$2");
  return out.trim();
}
function validateMossLayout(state) {
  const warnings = [];
  const W = Number(state?.canvasWidth) || 1024;
  const H = Number(state?.canvasHeight) || 1536;
  const items = (Array.isArray(state?.items) ? state.items : []).filter((it) => it && !it.hidden);

  // 1. Check missing noteZh & caption
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const hasDesc = Boolean((it.noteZh && it.noteZh.trim()) || (it.caption && it.caption.trim()) || (it.label === "text" && it.text && it.text.trim()));
    if (!hasDesc) {
      warnings.push({
        id: `empty-desc-${it.id}`,
        severity: "warn",
        code: "EMPTY_DESCRIPTION",
        itemId: it.id,
        title: `#${i + 1} 框还没有写简述`,
        message: "双击画板上的框或在列表中写一句中文（如“女主侧脸冷笑”），AI 才知道这里画什么。",
        fixAction: null,
      });
    }
  }

  // 2. Check side-by-side panels/items with slightly misaligned y_min
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].label === "text" || items[j].label === "text") continue;
      const bi = getItemAABB(items[i], W, H);
      const bj = getItemAABB(items[j], W, H);
      const horizDisjoint = bi.xMax <= bj.xMin + 24 || bj.xMax <= bi.xMin + 24;
      const yDiff = Math.abs(bi.mossBbox[0] - bj.mossBbox[0]);
      if (horizDisjoint && yDiff > 0 && yDiff <= 18) {
        warnings.push({
          id: `row-ymin-${items[i].id}-${items[j].id}`,
          severity: "warn",
          code: "ROW_YMIN_MISALIGNED",
          itemId: items[i].id,
          title: `同行并排框顶部 y_min 相差 ${yDiff}px`,
          message: `MOSS 要求并排分镜顶部 y_min 严格一致，否则人物容易跨格破框。`,
          fixAction: { type: "SNAP_ROW_YMIN" },
        });
      }
    }
  }

  // 3. Check small character box that might cause extra head or should be object close-up
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.label !== "character") continue;
    const b = getItemAABB(it, W, H);
    const areaRatio = (b.width * b.height) / (W * H);
    const note = `${it.noteZh || ""} ${it.caption || ""}`;
    if (areaRatio < 0.08 && /眼|唇|嘴|手|指|脚|锁骨|耳|eye|lip|hand|finger/i.test(note)) {
      warnings.push({
        id: `small-char-${it.id}`,
        severity: "warn",
        code: "CLOSEUP_SHOULD_BE_OBJECT",
        itemId: it.id,
        title: `#${i + 1} 局部微距建议改为「🔍 物体/特写 (object)」`,
        message: "MOSS 在小分镜画眼睛/嘴唇/手部特写时，用 character 容易多长一颗头，切换为 object 最稳。",
        fixAction: { type: "SET_ITEM_LABEL", itemId: it.id, label: "object" },
      });
    }
  }

  // 4. Check speech bubble rules (Arabic numerals, long text in narrow box)
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.label !== "text") continue;
    const rawText = String(it.text || "");
    if (/\d/.test(rawText)) {
      warnings.push({
        id: `arabic-num-${it.id}`,
        severity: "warn",
        code: "ARABIC_DIGITS_IN_BUBBLE",
        itemId: it.id,
        title: `#${i + 1} 气泡台词含阿拉伯数字 "${rawText.match(/\d+/)?.[0]}"`,
        message: "MOSS 竖排气泡渲染阿拉伯数字容易扭曲，建议转为中文数字（如 七百二十）。",
        fixAction: { type: "NORMALIZE_BUBBLE_TEXT", itemId: it.id },
      });
    }
    const b = getItemAABB(it, W, H);
    if (Array.from(rawText).length > 15 && b.width < 220) {
      warnings.push({
        id: `narrow-bubble-${it.id}`,
        severity: "warn",
        code: "LONG_BUBBLE_TOO_NARROW",
        itemId: it.id,
        title: `#${i + 1} 长台词气泡宽度不足 220px (当前 ${Math.round(b.width)}px)`,
        message: "超过 15 字的台词建议加宽到 ≥220px 并使用圆角气泡，防止竖排吞字。",
        fixAction: { type: "WIDEN_BUBBLE", itemId: it.id, minWidth: 228 },
      });
    }
  }

  return warnings;
}
function applyLintFix(state, fixAction) {
  if (!fixAction || !state) return state;
  const W = Number(state.canvasWidth) || 1024;
  const H = Number(state.canvasHeight) || 1536;

  if (fixAction.type === "SNAP_ROW_YMIN") {
    return snapRowYMin(state, W, H, 18);
  }
  if (fixAction.type === "SET_ITEM_LABEL") {
    return {
      ...state,
      items: (state.items || []).map((it) =>
        it.id === fixAction.itemId ? { ...it, label: fixAction.label } : it
      ),
    };
  }
  if (fixAction.type === "NORMALIZE_BUBBLE_TEXT") {
    return {
      ...state,
      items: (state.items || []).map((it) =>
        it.id === fixAction.itemId
          ? { ...it, text: normalizeVerticalChineseText(it.text || "") }
          : it
      ),
    };
  }
  if (fixAction.type === "WIDEN_BUBBLE") {
    const minW = Number(fixAction.minWidth) || 228;
    return {
      ...state,
      items: (state.items || []).map((it) => {
        if (it.id !== fixAction.itemId) return it;
        const b = getItemAABB(it, W, H);
        if (b.width >= minW) return { ...it, bubbleStyle: "oval" };
        const x1 = clampNum(b.centerX - minW / 2, 0, W - minW);
        return {
          ...it,
          bubbleStyle: "oval",
          points: rectToPoints(x1, b.yMin, minW, b.height),
        };
      }),
    };
  }
  return state;
}

function buildItemEnglishCaption(item, state, index, allItems) {
  const W = Number(state?.canvasWidth) || 1024;
  const H = Number(state?.canvasHeight) || 1536;
  const b = getItemAABB(item, W, H);
  const geom = describeShapeGeometry(item, W, H);

  if (item.caption && item.caption.trim()) {
    return item.caption.trim();
  }

  if (item.label === "text") {
    const styleId = item.bubbleStyle || "oval";
    const styleObj = MOSS_BUBBLE_STYLES.find((s) => s.id === styleId) || MOSS_BUBBLE_STYLES[0];
    let speakerName = item.roleTag || "the speaker";
    let dir = "bottom";
    let dirCaps = "DOWN";

    const speaker = item.speakerItemId
      ? allItems.find((cand) => cand.id === item.speakerItemId)
      : null;
    if (speaker) {
      speakerName = speaker.roleTag || speaker.noteZh || speakerName;
    }
    if (item.tailPoint) {
      const dx = item.tailPoint.x - b.centerX;
      const dy = item.tailPoint.y - b.centerY;
      if (Math.abs(dx) > Math.abs(dy)) {
        dir = dx < 0 ? "left" : "right";
        dirCaps = dx < 0 ? "LEFT" : "RIGHT";
      } else {
        dir = dy < 0 ? "top" : "bottom";
        dirCaps = dy < 0 ? "UP" : "DOWN";
      }
    }
    const baseBubbleEn = styleObj.templateEn(speakerName, dir, dirCaps);
    const noteHint = item.noteZh ? ` (${item.noteZh.trim()})` : "";
    return `${baseBubbleEn}${noteHint}`;
  }

  const areaRatio = (b.width * b.height) / (W * H);
  const rolePrefix = item.roleTag ? `[${item.roleTag}] ` : "";
  const userDesc = item.noteZh
    ? item.noteZh.trim()
    : `Region #${index + 1} (${item.label})`;
  const isMicroCloseup = /眼|瞳|唇|嘴|手|指|足|脚|微距|特写|切面|局部|inset|close-up/i.test(userDesc);
  const shotHint =
    item.label === "object"
      ? isMicroCloseup
        ? "Extreme close-up inset detail shot (ONLY the specified detail/object, NO extra full head or torso)"
        : "Scene object / environment element"
      : areaRatio < 0.18
      ? "Medium close-up waist-up shot"
      : "Detailed subject shot";
  const shapeSuffix = geom.isIrregular ? ` — framed inside a ${geom.shapePromptHintEn}.` : ".";

  return `${shotHint}: ${rolePrefix}${userDesc}${shapeSuffix}`;
}
function compileMossBlueprint(state) {
  const W = Number(state?.canvasWidth) || 1024;
  const H = Number(state?.canvasHeight) || 1536;
  const canvasMode = state?.canvasMode || "multi_panel";
  const meta = Array.isArray(state?.meta) ? state.meta : [];
  // An empty palette explicitly means no color constraint; never refill it.
  const palette = Array.isArray(state?.palette) ? state.palette : [];

  const visibleItems = (Array.isArray(state?.items) ? state.items : []).filter(
    (it) => it && !it.hidden
  );

  // Panels describe panel structure; character/object/text are emitted into MOSS items[]
  // If a panel has no inner character/object covering it, emit the panel itself as character/object so MOSS renders it!
  const nonPanelItems = visibleItems.filter((it) => it.label !== "panel");
  const panelItems = visibleItems.filter((it) => it.label === "panel");

  const effectiveMossSourceItems = [];
  for (const panel of panelItems) {
    const pb = getItemAABB(panel, W, H);
    const hasChildInside = nonPanelItems.some((child) => {
      if (child.label === "text") return false;
      const cb = getItemAABB(child, W, H);
      return (
        cb.centerX >= pb.xMin &&
        cb.centerX <= pb.xMax &&
        cb.centerY >= pb.yMin &&
        cb.centerY <= pb.yMax
      );
    });
    if (!hasChildInside) {
      effectiveMossSourceItems.push({
        ...panel,
        label: /眼|手|唇|物|特写|道具/.test(panel.noteZh || "") ? "object" : "character",
        _fromPanel: true,
      });
    }
  }
  effectiveMossSourceItems.push(...nonPanelItems);

  const mossItems = effectiveMossSourceItems.map((it, idx) => {
    const b = getItemAABB(it, W, H);
    const mossLabel =
      it.label === "text"
        ? "text"
        : it.label === "object"
        ? "object"
        : "character";
    const entry = {
      label: mossLabel,
      caption: buildItemEnglishCaption(it, state, idx, visibleItems),
      bbox: b.mossBbox,
    };
    if (mossLabel === "text") {
      entry.text = it.text || it.noteZh || "";
    }
    return entry;
  });

  const itemSummaries = visibleItems.map((it, idx) => {
    const b = getItemAABB(it, W, H);
    const geom = describeShapeGeometry(it, W, H);
    return {
      index: idx + 1,
      id: it.id,
      label: it.label,
      roleTag: it.roleTag || "",
      noteZh: it.noteZh || "",
      text: it.text || "",
      bbox: b.mossBbox,
      screenRect: {
        xMin: Math.round(b.xMin),
        yMin: Math.round(b.yMin),
        xMax: Math.round(b.xMax),
        yMax: Math.round(b.yMax),
      },
      shapeType: it.shapeType || "rect",
      isIrregular: geom.isIrregular,
      badgeZh: geom.badgeZh,
      shapePromptHintEn: geom.shapePromptHintEn,
    };
  });

  const panelOverviewEn =
    panelItems.length > 0
      ? `A ${panelItems.length}-panel manga/comic page (${W}x${H}) with clean panel borders and gutters. `
      : `A ${canvasMode} composition (${W}x${H}). `;

  const globalCaption =
    state?.globalCaption && state.globalCaption.trim()
      ? state.globalCaption.trim()
      : `${panelOverviewEn}${
          state?.globalNoteZh
            ? `Global theme & scene: ${state.globalNoteZh.trim()}. `
            : ""
        }` +
        itemSummaries
          .filter((s) => s.noteZh || s.text)
          .map(
            (s) =>
              `[#${s.index} ${s.roleTag || s.label} at yxyx ${JSON.stringify(s.bbox)}: ${
                s.noteZh || s.text
              }${s.isIrregular ? ` (${s.badgeZh})` : ""}]`
          )
          .join(" ");

  const mossJson = {
    summary: {
      meta,
      canvas: canvasMode,
      palette,
      caption: globalCaption.trim(),
    },
    items: mossItems,
    bbox_coord_space: "abs_centralized",
    bbox_format: "yxyx",
  };

  const mossJsonString = JSON.stringify(mossJson, null, 2);
  const warnings = validateMossLayout(state);

  const resPreset =
    MOSS_RESOLUTIONS.find((r) => r.width === W && r.height === H) ||
    (W * H >= 1024 * 1024
      ? { width: W, height: H, steps: 50, cfg: 3.5, slg: "22" }
      : { width: W, height: H, steps: 25, cfg: 3.5, slg: "" });

  const recommendedComfyParams = {
    width: W,
    height: H,
    steps: resPreset.steps,
    cfg: resPreset.cfg,
    slg: resPreset.slg,
    negativePrompt: MOSS_LOCKED_NEGATIVE_PROMPT,
  };

  const notesTableLines = itemSummaries.map(
    (s) =>
      `- **#${s.index} [${s.label}${s.roleTag ? ` · ${s.roleTag}` : ""}]** \`bbox(yxyx): ${JSON.stringify(
        s.bbox
      )}\` (${s.badgeZh})：${s.noteZh || "（未填简述）"}${
        s.text ? ` ｜ 台词：「${s.text}」` : ""
      }`
  );

  const agentPromptMarkdown = [
    `### 📐 MOSS 分镜与异形拉框蓝图 (${W}×${H} · \`abs_centralized\` \`yxyx\`)`,
    state?.globalNoteZh ? `- **全局画面总述**：${state.globalNoteZh}` : null,
    `- **推荐参数**：分辨率 \`${W}×${H}\` | Steps \`${recommendedComfyParams.steps}\` | CFG \`${recommendedComfyParams.cfg}\` | SLG \`"${recommendedComfyParams.slg}"\``,
    `- **用户各框中文简述（请据此扩写英文 caption，严禁改动 bbox 数值）**：`,
    ...(notesTableLines.length > 0 ? notesTableLines : ["  - （当前画板暂无框）"]),
    "",
    "```json",
    mossJsonString,
    "```",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    mossJson,
    mossJsonString,
    negativePrompt: MOSS_LOCKED_NEGATIVE_PROMPT,
    recommendedComfyParams,
    itemSummaries,
    warnings,
    agentPromptMarkdown,
  };
}
function parseMossJsonToState(
  jsonInput,
  canvasWidth = 1024,
  canvasHeight = 1536
) {
  const parsed =
    typeof jsonInput === "string" ? JSON.parse(jsonInput) : jsonInput;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("输入不是有效的 JSON 对象");
  }
  const W = Number(parsed.canvasWidth || canvasWidth) || 1024;
  const H = Number(parsed.canvasHeight || canvasHeight) || 1536;
  const summary = parsed.summary || {};
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

  const items = rawItems.map((it, idx) => {
    const label = ["character", "object", "text", "panel"].includes(it.label)
      ? it.label
      : "character";
    const points =
      Array.isArray(it.points) && it.points.length >= 3
        ? it.points
        : (() => {
            const r = mossBboxToScreenRect(it.bbox || [-200, -200, 200, 200], W, H);
            return rectToPoints(r.xMin, r.yMin, r.width, r.height);
          })();
    const bubbleStyle =
      label === "text"
        ? /jagged|burst/i.test(it.caption || "")
          ? "burst"
          : /thought|tail-less/i.test(it.caption || "")
          ? "thought"
          : /rectangular|sharp-cornered/i.test(it.caption || "")
          ? "rect"
          : "oval"
        : "oval";
    return {
      id: it.id || `imported-${idx + 1}`,
      label,
      shapeType: it.shapeType || (label === "text" ? "bubble" : "rect"),
      points,
      noteZh: it.noteZh || it.caption || "",
      roleTag: it.roleTag || "",
      caption: it.caption || "",
      text: it.text || "",
      bubbleStyle,
      tailPoint: it.tailPoint || null,
      speakerItemId: it.speakerItemId || null,
    };
  });

  return {
    canvasWidth: W,
    canvasHeight: H,
    canvasMode: summary.canvas || parsed.canvasMode || "multi_panel",
    meta: Array.isArray(summary.meta) ? summary.meta : [],
    palette: Array.isArray(summary.palette) ? summary.palette : [],
    globalNoteZh: parsed.globalNoteZh || "",
    globalCaption: summary.caption || parsed.globalCaption || "",
    gutterWidth: Number(parsed.gutterWidth) || 16,
    items,
    strokes: Array.isArray(parsed.strokes) ? parsed.strokes : [],
  };
}
const MOSS_TEMPLATES = [
  {
    id: "diagonal-3-panel",
    badge: "⚡",
    name: "三格斜切热血对峙 (含斜分镜+双气泡)",
    description: "顶格广角对峙、中格 -12° 动态斜切特写、底格反应镜头与台词气泡",
    createState() {
      return {
        canvasWidth: 1024,
        canvasHeight: 1536,
        canvasMode: "multi_panel",
        meta: ["comic", "multi_panel", "digital_painting", "cinematic_lighting"],
        palette: ["#0F172A", "#1E293B", "#38BDF8", "#F43F5E", "#F8FAFC"],
        globalNoteZh: "雨夜赛博朋克便利店门前，银发少女与黑衣特工拔刀对峙，三格斜切条漫",
        globalCaption: "",
        gutterWidth: 16,
        items: [
          {
            id: "tpl-p1",
            label: "panel",
            shapeType: "split-panel",
            points: [
              { x: 24, y: 24 },
              { x: 1000, y: 24 },
              { x: 1000, y: 460 },
              { x: 24, y: 520 },
            ],
            noteZh: "第1格背景分镜：便利店雨夜霓虹远景",
            roleTag: "分镜1",
            color: "#64748b",
          },
          {
            id: "tpl-c1",
            label: "character",
            shapeType: "rect",
            points: rectToPoints(60, 48, 620, 430),
            noteZh: "银发少女半身侧脸回眸，握着发光太刀刀柄，眼神冰冷",
            roleTag: "女主",
            color: "#7c5ce5",
          },
          {
            id: "tpl-b1",
            label: "text",
            shapeType: "bubble",
            bubbleStyle: "oval",
            points: rectToPoints(720, 64, 240, 320),
            tailPoint: { x: 580, y: 210 },
            speakerItemId: "tpl-c1",
            noteZh: "女主冷淡警告台词",
            text: "退后三步，否则别怪刀不长眼。",
            roleTag: "女主台词",
            color: "#d97706",
          },
          {
            id: "tpl-p2",
            label: "panel",
            shapeType: "split-panel",
            points: [
              { x: 24, y: 538 },
              { x: 1000, y: 478 },
              { x: 1000, y: 1010 },
              { x: 24, y: 950 },
            ],
            noteZh: "第2格斜切分镜：动态速度线特写",
            roleTag: "分镜2",
            color: "#64748b",
          },
          {
            id: "tpl-o1",
            label: "object",
            shapeType: "quad",
            points: [
              { x: 54, y: 556 },
              { x: 970, y: 500 },
              { x: 970, y: 990 },
              { x: 54, y: 932 },
            ],
            noteZh: "眼部微距特写：绯红瞳孔映出刀光与雨滴（仅画眼部，防多头）",
            roleTag: "眼部微距",
            color: "#0891b2",
          },
          {
            id: "tpl-p3",
            label: "panel",
            shapeType: "split-panel",
            points: [
              { x: 24, y: 968 },
              { x: 1000, y: 1028 },
              { x: 1000, y: 1512 },
              { x: 24, y: 1512 },
            ],
            noteZh: "第3格底部大格：黑衣男主拔枪仰视反应",
            roleTag: "分镜3",
            color: "#64748b",
          },
          {
            id: "tpl-c2",
            label: "character",
            shapeType: "rect",
            points: rectToPoints(280, 1036, 680, 456),
            noteZh: "黑衣特工半身特写，嘴角上扬露出苦笑，举手示意停火",
            roleTag: "男主",
            color: "#7c5ce5",
          },
          {
            id: "tpl-b2",
            label: "text",
            shapeType: "bubble",
            bubbleStyle: "burst",
            points: rectToPoints(52, 1040, 210, 320),
            tailPoint: { x: 340, y: 1180 },
            speakerItemId: "tpl-c2",
            noteZh: "男主急促喊停",
            text: "等等！自己人！",
            roleTag: "男主台词",
            color: "#d97706",
          },
        ],
        strokes: [],
      };
    },
  },
  {
    id: "four-panel-koma",
    badge: "▤",
    name: "四格日常反转条漫 (顶格建立+并排双底格)",
    description: "上二格横向铺垫 + 底部左右并排双格（严格对齐 y_min=-240 防破框）",
    createState() {
      return {
        canvasWidth: 1024,
        canvasHeight: 1536,
        canvasMode: "multi_panel",
        meta: ["comic", "multi_panel", "cel_shading"],
        palette: ["#1E3A8A", "#60A5FA", "#F472B6", "#FDE047", "#FFFBEB"],
        globalNoteZh: "校园天台午休日常，傲娇学姐递便当的四格漫画",
        globalCaption: "",
        gutterWidth: 16,
        items: [
          {
            id: "koma-1",
            label: "character",
            shapeType: "rect",
            points: rectToPoints(32, 32, 960, 440),
            noteZh: "第1格：学姐双手背在身后站在天台铁丝网前，脸颊微红",
            roleTag: "第1格·学姐",
            color: "#7c5ce5",
          },
          {
            id: "koma-2",
            label: "object",
            shapeType: "rect",
            points: rectToPoints(32, 492, 960, 460),
            noteZh: "第2格手部特写：双手猛地把包着樱花布巾的双层便当盒推到镜头前（仅手与便当）",
            roleTag: "第2格·递便当特写",
            color: "#0891b2",
          },
          {
            id: "koma-3",
            label: "character",
            shapeType: "rect",
            points: rectToPoints(32, 976, 470, 528),
            noteZh: "第3格左底框：学姐别过头嘴硬傲娇表情，半身特写",
            roleTag: "第3格·左底框",
            color: "#7c5ce5",
          },
          {
            id: "koma-4",
            label: "character",
            shapeType: "rect",
            points: rectToPoints(522, 976, 470, 528),
            noteZh: "第4格右底框：学弟捧着便当双眼放光感动流泪，半身特写",
            roleTag: "第4格·右底框",
            color: "#7c5ce5",
          },
          {
            id: "koma-b1",
            label: "text",
            shapeType: "bubble",
            bubbleStyle: "oval",
            points: rectToPoints(48, 996, 180, 280),
            tailPoint: { x: 260, y: 1160 },
            speakerItemId: "koma-3",
            noteZh: "学姐傲娇台词",
            text: "只是顺手多做了一份而已！",
            roleTag: "学姐台词",
            color: "#d97706",
          },
        ],
        strokes: [],
      };
    },
  },
  {
    id: "single-hero-poster",
    badge: "🎬",
    name: "单幅电影感海报构图 (前景虚化+主视觉+标题框)",
    description: "适合单张高精插画：主角色 + 前景道具虚化框 + 顶部旁白/标题框",
    createState() {
      return {
        canvasWidth: 1024,
        canvasHeight: 1536,
        canvasMode: "single",
        meta: ["digital_painting", "cinematic_lighting", "poster_design"],
        palette: ["#1C1917", "#7C2D12", "#EA580C", "#FBBF24", "#FEF3C7"],
        globalNoteZh: "黄昏废墟上的机甲少女海报，逆光夕阳与飘散火星",
        globalCaption: "",
        gutterWidth: 16,
        items: [
          {
            id: "hero-title",
            label: "text",
            shapeType: "bubble",
            bubbleStyle: "rect",
            points: rectToPoints(64, 48, 220, 420),
            noteZh: "左上角直角黑框旁白铭牌",
            text: "第七防卫区·最后的黄昏",
            roleTag: "海报旁白框",
            color: "#d97706",
          },
          {
            id: "hero-main",
            label: "character",
            shapeType: "rect",
            points: rectToPoints(180, 180, 760, 1180),
            noteZh: "机甲少女站在残破高塔边缘回望镜头，披风被烈风吹起，逆光金边",
            roleTag: "核心主角",
            color: "#7c5ce5",
          },
          {
            id: "hero-fg",
            label: "object",
            shapeType: "lasso",
            points: [
              { x: 32, y: 1080 },
              { x: 460, y: 1160 },
              { x: 520, y: 1500 },
              { x: 32, y: 1500 },
            ],
            noteZh: "左前景景深虚化：插在废墟里的断裂重剑与燃烧余烬",
            roleTag: "前景虚化道具",
            color: "#0891b2",
          },
        ],
        strokes: [],
      };
    },
  },
  {
    id: "blank-canvas",
    badge: "⬜",
    name: "空白画板 (从零自由一刀切/拉框)",
    description: "清空所有框与涂鸦，从零开始自由拉框或用分镜刀切分",
    createState() {
      return {
        canvasWidth: 1024,
        canvasHeight: 1536,
        canvasMode: "multi_panel",
        meta: [],
        palette: [],
        globalNoteZh: "",
        globalCaption: "",
        gutterWidth: 16,
        items: [],
        strokes: [],
      };
    },
  },
];
function createDefaultWorkbenchState() {
  return MOSS_TEMPLATES.find(template => template.id === "blank-canvas").createState();
}



// === Server Entry: src/server/index.js ===

const STATE_ROUTE = "/plugins/dsh-moss-workbench/state";
const ACTION_ROUTE = "/plugins/dsh-moss-workbench/action";
const CACHE_FILE = "/tmp/dsh-moss-workbench-state-v1.json";
const MAX_BODY_BYTES = 15 * 1024 * 1024;

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return undefined;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return undefined;
  const header = dataUrl.slice(5, comma);
  const body = dataUrl.slice(comma + 1);
  const semi = header.indexOf(";");
  const mediaType = (semi >= 0 ? header.slice(0, semi) : header) || "image/png";
  if (!header.includes("base64") || !body) return undefined;
  const data = Buffer.from(body, "base64");
  if (data.byteLength === 0) return undefined;
  return { data, mediaType };
}

function detectImageDimensions(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return { width: 0, height: 0, mediaType: "image/png" };
  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      mediaType: "image/png",
    };
  }
  // JPEG: FF D8
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
          mediaType: "image/jpeg",
        };
      }
      const segLen = buf.readUInt16BE(offset + 2);
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
    return { width: 0, height: 0, mediaType: "image/jpeg" };
  }
  // WebP: RIFF....WEBP
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 " && buf.length >= 30) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
        mediaType: "image/webp",
      };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        mediaType: "image/webp",
      };
    }
  }
  return { width: 0, height: 0, mediaType: "image/png" };
}

function loadImageFileAsOverlay(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  const buf = readFileSync(filePath);
  const { width, height, mediaType } = detectImageDimensions(buf);
  if (!width || !height) return null;
  const dataUrl = `data:${mediaType};base64,${buf.toString("base64")}`;
  return {
    dataUrl,
    width,
    height,
    name: filePath.split("/").pop() || "overlay.png",
    opacity: 0.72,
    fitMode: "stretch",
    wireframe: true,
    visible: true,
    updatedAt: Date.now(),
  };
}

function findLatestAttachmentOverlay(snapshotBuffer) {
  const roots = [
    join(homedir(), ".dsh", "attachments", "v1", "objects"),
  ];
  const candidates = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    try {
      for (const sub of readdirSync(root)) {
        const subDir = join(root, sub);
        let st;
        try {
          st = statSync(subDir);
        } catch {
          continue;
        }
        if (!st.isDirectory()) continue;
        for (const f of readdirSync(subDir)) {
          const full = join(subDir, f);
          try {
            const fst = statSync(full);
            if (fst.isFile() && fst.size > 1024 && fst.size < 14 * 1024 * 1024) {
              candidates.push({ path: full, mtimeMs: fst.mtimeMs, size: fst.size });
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const c of candidates.slice(0, 16)) {
    try {
      const buf = readFileSync(c.path);
      if (snapshotBuffer && buf.length === snapshotBuffer.length && buf.equals(snapshotBuffer)) {
        continue;
      }
      const info = detectImageDimensions(buf);
      if (info.width > 0 && info.height > 0) {
        return {
          dataUrl: `data:${info.mediaType};base64,${buf.toString("base64")}`,
          width: info.width,
          height: info.height,
          name: `最新会话图片 (${info.width}×${info.height})`,
          opacity: 0.72,
          fitMode: "stretch",
          wireframe: true,
          visible: true,
          updatedAt: Date.now(),
        };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

class MossWorkbenchMirror {
  constructor() {
    this.state = createDefaultWorkbenchState();
    this.snapshot = undefined;
    this.snapshotDataUrl = undefined;
    this.serverRevision = 1;
    this.updatedAt = Date.now();
    this.connected = false;
    this.lastSource = "init";
    this._loadPersisted();
  }

  _loadPersisted() {
    try {
      if (existsSync(CACHE_FILE)) {
        const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
        if (raw && raw.state && typeof raw.state === "object") {
          this.state = raw.state;
          this.serverRevision = Number(raw.serverRevision) || 1;
          this.updatedAt = Number(raw.updatedAt) || Date.now();
          this.connected = Boolean(raw.connected);
          if (typeof raw.snapshotDataUrl === "string") {
            this.snapshotDataUrl = raw.snapshotDataUrl;
            this.snapshot = parseDataUrl(raw.snapshotDataUrl);
          }
        }
      }
    } catch {
      // Ignore corrupted cache file
    }
  }

  _persist() {
    try {
      writeFileSync(
        CACHE_FILE,
        JSON.stringify({
          state: this.state,
          serverRevision: this.serverRevision,
          updatedAt: this.updatedAt,
          connected: this.connected,
          snapshotDataUrl: this.snapshotDataUrl,
        }),
        "utf8"
      );
    } catch {
      // Ignore cache write errors
    }
  }

  updateFromClient(payload = {}) {
    if (payload.state && typeof payload.state === "object") {
      this.state = payload.state;
    }
    if (typeof payload.snapshotDataUrl === "string" && payload.snapshotDataUrl.startsWith("data:image/")) {
      this.snapshotDataUrl = payload.snapshotDataUrl;
      this.snapshot = parseDataUrl(payload.snapshotDataUrl);
    } else if (payload.clearSnapshot) {
      this.snapshotDataUrl = undefined;
      this.snapshot = undefined;
    }
    this.connected = true;
    this.lastSource = payload.source || "client";
    this.serverRevision += 1;
    this.updatedAt = Date.now();
    this._persist();
    return this.getSnapshotSummary();
  }

  updateFromAgent(nextState, source = "agent") {
    this.state = nextState;
    this.connected = true;
    this.lastSource = source;
    this.serverRevision += 1;
    this.updatedAt = Date.now();
    this._persist();
    return this.getSnapshotSummary();
  }

  getCompiled() {
    return compileMossBlueprint(this.state);
  }

  getSnapshotSummary() {
    const compiled = this.getCompiled();
    return {
      ok: true,
      connected: this.connected,
      serverRevision: this.serverRevision,
      updatedAt: this.updatedAt,
      lastSource: this.lastSource,
      hasSnapshot: Boolean(this.snapshot),
      state: this.state,
      compiled,
    };
  }

  describeForSystemPrompt() {
    const items = Array.isArray(this.state?.items) ? this.state.items.filter((i) => !i.hidden) : [];
    const strokes = Array.isArray(this.state?.strokes) ? this.state.strokes : [];
    if (!this.connected && items.length === 0 && strokes.length === 0) {
      return "MOSS Layout Workbench (`dsh-moss-workbench`): ready in the right sidebar / conversation view tab. The user can draw rectangles, Split-Knife panels, deformable quads, polygons, speech bubbles, and freehand sketches with simple Chinese notes (`noteZh`), or you can call `moss_workbench_update` to populate a visual layout for them.";
    }
    const w = Number(this.state?.canvasWidth) || 1024;
    const h = Number(this.state?.canvasHeight) || 1536;
    const compiled = this.getCompiled();
    const lines = [
      `MOSS Layout Workbench (\`dsh-moss-workbench\`) is active: canvas ${w}×${h} (\`abs_centralized\` \`yxyx\`, origin [0,0] at center, Y in [${-h / 2}, ${h / 2}], X in [${-w / 2}, ${w / 2}]), mode="${this.state?.canvasMode || "multi_panel"}", ${items.length} box(es), ${strokes.length} sketch stroke(s).`,
    ];
    if (this.state?.globalNoteZh) {
      lines.push(`- Global Scene Note (用户全局画面简述): ${JSON.stringify(this.state.globalNoteZh)}`);
    }
    if (this.state?.globalCaption) {
      lines.push(`- Global English Caption: ${JSON.stringify(this.state.globalCaption)}`);
    }
    items.slice(0, 16).forEach((item, idx) => {
      const aabb = getItemAABB(item, w, h);
      const geom = describeShapeGeometry(item, w, h);
      const role = item.roleTag ? `[${item.roleTag}] ` : "";
      const note = item.noteZh ? `简述=${JSON.stringify(item.noteZh)}` : item.caption ? `caption=${JSON.stringify(item.caption.slice(0, 80))}` : "(未填简述)";
      const textPart = item.label === "text" && item.text ? ` 台词=${JSON.stringify(item.text)} (${item.bubbleStyle || "oval"})` : "";
      lines.push(
        `  #${idx + 1} ${role}label="${item.label}" shape="${geom.badgeZh || item.shapeType}" bbox=[${aabb.mossBbox.join(", ")}] ([y_min, x_min, y_max, x_max]) — ${note}${textPart}`
      );
    });
    if (compiled.warnings && compiled.warnings.length > 0) {
      lines.push(`- Layout Warnings: ${compiled.warnings.map((wItem) => wItem.message).join(" | ")}`);
    }
    lines.push(
      `Tools available: call \`moss_workbench_state\` for the full compiled MOSS JSON skeleton, \`moss_workbench_view\` to view the rendered canvas image (boxes + hand-drawn poses/strokes), or \`moss_workbench_update\` to push/refine boxes and captions on the user's canvas.`
    );
    return lines.join("\n");
  }
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) throw new Error("request too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, value) {
  if (res.headersSent || res.writableEnded || res.destroyed) return;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}
const name = "dsh-moss-workbench";
const inject = ["tools", "attachments", "webServer"];
function apply(ctx) {
  const mirror = new MossWorkbenchMirror();

  // 1. Register HTTP routes for browser workbench <-> host synchronization
  ctx.effect(() =>
    ctx.webServer.register({
      kind: "exact",
      path: STATE_ROUTE,
      handler: async (req, res) => {
        try {
          if (req.method === "GET") {
            sendJson(res, 200, mirror.getSnapshotSummary());
            return;
          }
          if (req.method === "POST") {
            const raw = await readBody(req);
            const parsed = raw ? JSON.parse(raw) : {};
            const summary = mirror.updateFromClient(parsed);
            sendJson(res, 200, summary);
            return;
          }
          res.statusCode = 405;
          res.setHeader("allow", "GET, POST");
          res.end();
        } catch (err) {
          sendJson(res, 400, { ok: false, error: err?.message || String(err) });
        }
      },
    })
  );

  ctx.effect(() =>
    ctx.webServer.register({
      kind: "exact",
      path: ACTION_ROUTE,
      handler: async (req, res) => {
        try {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("allow", "POST");
            res.end();
            return;
          }
          const raw = await readBody(req);
          const body = raw ? JSON.parse(raw) : {};
          if (body.action === "apply_template") {
            const tpl = MOSS_TEMPLATES.find((t) => t.id === body.templateId) || MOSS_TEMPLATES[0];
            if (tpl) {
              mirror.updateFromAgent(tpl.createState(), "template");
            }
          } else if (body.action === "import_json" && body.json) {
            const imported = parseMossJsonToState(
              body.json,
              Number(body.canvasWidth) || mirror.state.canvasWidth || 1024,
              Number(body.canvasHeight) || mirror.state.canvasHeight || 1536
            );
            mirror.updateFromAgent(imported, "import_json");
          } else if (body.action === "lint_fix" && body.fixAction) {
            const fixed = applyLintFix(mirror.state, body.fixAction);
            mirror.updateFromAgent(fixed, "lint_fix");
          } else if (body.action === "resize_canvas") {
            const resized = resizeWorkbenchCanvas(
              mirror.state,
              Number(body.width) || mirror.state.canvasWidth || 1024,
              Number(body.height) || mirror.state.canvasHeight || 1536,
              { scaleItems: body.scaleItems !== false }
            );
            mirror.updateFromAgent(resized, "resize_canvas");
          } else if (body.action === "load_latest_image") {
            const overlay = findLatestAttachmentOverlay(mirror.snapshot?.data);
            if (!overlay) {
              sendJson(res, 404, { ok: false, error: "未在当前会话附件中找到可叠入的图片" });
              return;
            }
            const nextState = {
              ...mirror.state,
              overlayImage: overlay,
            };
            mirror.updateFromAgent(nextState, "load_latest_image");
          }
          sendJson(res, 200, mirror.getSnapshotSummary());
        } catch (err) {
          sendJson(res, 400, { ok: false, error: err?.message || String(err) });
        }
      },
    })
  );

  // 2. Inject live MOSS workbench state into system prompt
  ctx.inject(["systemPrompt"], (promptCtx) => {
    promptCtx.systemPrompt.context({
      name: "moss-workbench",
      order: 63,
      text: () => mirror.describeForSystemPrompt(),
    });
  });

  // 3. Register Agent Tools
  // Tool 1: moss_workbench_state
  ctx.tools.register({
    name: "moss_workbench_state",
    description:
      "Read the current state of the MOSS Layout & Sketch Workbench (`dsh-moss-workbench`): canvas resolution, `abs_centralized` `yxyx` `[y_min, x_min, y_max, x_max]` bounding boxes, irregular shape / Split-Knife panel geometry, user's simple Chinese box descriptions (`noteZh`), speech bubble texts and speaker targets, MOSS rule validation warnings, and the pre-compiled MOSS Layout JSON.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          connected: { type: "boolean" },
          canvasWidth: { type: "number" },
          canvasHeight: { type: "number" },
          canvasMode: { type: "string" },
          globalNoteZh: { type: "string" },
          itemCount: { type: "number" },
          strokeCount: { type: "number" },
          hasSnapshot: { type: "boolean" },
          mossJsonString: { type: "string" },
          agentPromptMarkdown: { type: "string" },
        },
        required: [
          "connected",
          "canvasWidth",
          "canvasHeight",
          "canvasMode",
          "globalNoteZh",
          "itemCount",
          "strokeCount",
          "hasSnapshot",
          "mossJsonString",
          "agentPromptMarkdown",
        ],
        additionalProperties: false,
      },
      render(_args, value) {
        return [
          {
            type: "text",
            text: value.agentPromptMarkdown || value.mossJsonString,
          },
        ];
      },
    },
    async execute() {
      const compiled = mirror.getCompiled();
      const state = mirror.state || createDefaultWorkbenchState();
      return {
        connected: mirror.connected,
        canvasWidth: Number(state.canvasWidth) || 1024,
        canvasHeight: Number(state.canvasHeight) || 1536,
        canvasMode: String(state.canvasMode || "multi_panel"),
        globalNoteZh: String(state.globalNoteZh || ""),
        itemCount: Array.isArray(state.items) ? state.items.length : 0,
        strokeCount: Array.isArray(state.strokes) ? state.strokes.length : 0,
        hasSnapshot: Boolean(mirror.snapshot),
        mossJsonString: compiled.mossJsonString,
        agentPromptMarkdown: compiled.agentPromptMarkdown,
      };
    },
  });

  // Tool 2: moss_workbench_view
  ctx.tools.register({
    name: "moss_workbench_view",
    description:
      "View the rendered visual snapshot of the user's MOSS Layout Workbench canvas as an image attachment (showing all Split-Knife panels, color-coded boxes, irregular polygons, speech bubble tails, `[y_min, x_min, y_max, x_max]` coordinate badges, Chinese `noteZh` labels, and hand-drawn brush strokes/poses).",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          attachment: {
            type: "object",
            properties: {
              attachmentId: { type: "string" },
              mediaType: { type: "string" },
              bytes: { type: "integer" },
              width: { type: "integer" },
              height: { type: "integer" },
              name: { type: "string" },
            },
            required: ["attachmentId", "mediaType", "bytes", "width", "height"],
            additionalProperties: false,
          },
        },
        required: ["summary"],
        additionalProperties: false,
      },
      render(_args, value) {
        if (!value.attachment) {
          return [{ type: "text", text: value.summary }];
        }
        return [
          {
            type: "text",
            text: `${value.summary}\nThe rendered MOSS Workbench canvas snapshot is attached below.`,
          },
          {
            type: "image",
            attachment: value.attachment,
          },
        ];
      },
    },
    async execute() {
      const compiled = mirror.getCompiled();
      const baseSummary = `MOSS Workbench canvas (${mirror.state?.canvasWidth || 1024}×${mirror.state?.canvasHeight || 1536}, ${(mirror.state?.items || []).length} boxes, ${(mirror.state?.strokes || []).length} sketch strokes).\n\n${compiled.agentPromptMarkdown}`;
      if (!mirror.snapshot) {
        return {
          summary: `${baseSummary}\n\n(No rendered PNG snapshot pushed from the browser yet; above is the complete vector & coordinate state.)`,
        };
      }
      const saved = await ctx.attachments.saveImage({
        data: mirror.snapshot.data,
        mediaType: mirror.snapshot.mediaType,
        name: "moss-workbench-canvas.png",
      });
      return {
        summary: baseSummary,
        attachment: {
          attachmentId: saved.attachmentId || saved.id,
          mediaType: saved.mediaType || "image/png",
          bytes: saved.bytes || mirror.snapshot.data.byteLength,
          width: saved.width || Number(mirror.state?.canvasWidth) || 1024,
          height: saved.height || Number(mirror.state?.canvasHeight) || 1536,
          name: saved.name || "moss-workbench-canvas.png",
        },
      };
    },
  });

  // Tool 3: moss_workbench_update
  ctx.tools.register({
    name: "moss_workbench_update",
    description:
      "Push or update a MOSS Layout directly onto the user's live MOSS Workbench canvas! You can load a starter template (`template_id`), import a complete MOSS Layout JSON (`moss_json`), or update the global scene caption/notes and individual bounding boxes (`items` with `bbox: [y_min, x_min, y_max, x_max]` in `abs_centralized` `yxyx` order, `label`, `noteZh`, `caption`, `text`, `bubbleStyle`). The browser workbench immediately animates and displays the updated boxes.",
    parameters: {
      type: "object",
      properties: {
        template_id: {
          type: "string",
          description:
            "Optional built-in template id to load onto the canvas (e.g. 'classic-3-panel', 'diagonal-action-2-panel', 'four-panel-koma', 'vertical-webtoon', 'dual-standoff', 'single-hero-poster').",
        },
        moss_json: {
          type: "string",
          description:
            "Optional complete MOSS Layout JSON string (`{ summary, items, bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx' }`) to visualize and load onto the workbench canvas.",
        },
        canvas_width: {
          type: "number",
          description: "Optional canvas width (e.g. 1024, 1536, 640, 960, 1760).",
        },
        canvas_height: {
          type: "number",
          description: "Optional canvas height (e.g. 1536, 1024, 960, 640, 896).",
        },
        scale_items_on_resize: {
          type: "boolean",
          description:
            "When changing canvas_width/canvas_height without replacing items, proportionally scale all existing boxes and strokes (default true).",
        },
        overlay_image_path: {
          type: "string",
          description:
            "Optional local file path of a generated/reference image (or 'latest' for the latest session attachment, or 'clear' to remove) to overlay onto the workbench for bbox alignment inspection.",
        },
        canvas_mode: {
          type: "string",
          enum: ["single", "multi_panel", "collage"],
          description: "Optional MOSS summary.canvas mode.",
        },
        global_note_zh: {
          type: "string",
          description: "Optional Chinese summary note shown in the top scene bar of the workbench.",
        },
        global_caption: {
          type: "string",
          description: "Optional English `summary.caption` for the MOSS Layout JSON.",
        },
        palette: {
          type: "array",
          items: { type: "string" },
          description: "Optional array of hex colors (e.g. ['#0F172A', '#38BDF8', '#F43F5E']).",
        },
        items: {
          type: "array",
          description:
            "Optional replacement list of boxes in `abs_centralized` `yxyx` coordinates `[y_min, x_min, y_max, x_max]`.",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                enum: ["character", "object", "text", "panel"],
              },
              roleTag: { type: "string" },
              noteZh: { type: "string" },
              caption: { type: "string" },
              text: { type: "string" },
              bubbleStyle: {
                type: "string",
                enum: ["oval", "thought", "rect", "burst"],
              },
              bbox: {
                type: "array",
                items: { type: "number" },
                description: "`[y_min, x_min, y_max, x_max]` in `abs_centralized` coordinates.",
              },
            },
            required: ["label", "bbox"],
          },
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          serverRevision: { type: "number" },
          canvasWidth: { type: "number" },
          canvasHeight: { type: "number" },
          itemCount: { type: "number" },
          mossJsonString: { type: "string" },
        },
        required: ["serverRevision", "canvasWidth", "canvasHeight", "itemCount", "mossJsonString"],
        additionalProperties: false,
      },
      render(_args, value) {
        return [
          {
            type: "text",
            text: `Updated MOSS Workbench (rev ${value.serverRevision}, ${value.canvasWidth}×${value.canvasHeight}, ${value.itemCount} items):\n${value.mossJsonString}`,
          },
        ];
      },
    },
    async execute(args) {
      let nextState = structuredClone(mirror.state || createDefaultWorkbenchState());
      const prevW = Number(nextState.canvasWidth) || 1024;
      const prevH = Number(nextState.canvasHeight) || 1536;
      const w = Number(args.canvas_width) || prevW;
      const h = Number(args.canvas_height) || prevH;

      if (
        (w !== prevW || h !== prevH) &&
        !args.template_id &&
        !args.moss_json &&
        !Array.isArray(args.items)
      ) {
        nextState = resizeWorkbenchCanvas(nextState, w, h, {
          scaleItems: args.scale_items_on_resize !== false,
        });
      } else {
        nextState.canvasWidth = w;
        nextState.canvasHeight = h;
      }

      if (args.template_id) {
        const tpl =
          MOSS_TEMPLATES.find((t) => t.id === args.template_id) || MOSS_TEMPLATES[0];
        if (tpl) {
          nextState = tpl.createState();
        }
      } else if (args.moss_json) {
        nextState = parseMossJsonToState(args.moss_json, w, h);
      }

      if (args.canvas_mode) nextState.canvasMode = args.canvas_mode;
      if (typeof args.global_note_zh === "string") nextState.globalNoteZh = args.global_note_zh;
      if (typeof args.global_caption === "string") nextState.globalCaption = args.global_caption;
      if (Array.isArray(args.palette)) nextState.palette = args.palette;

      if (typeof args.overlay_image_path === "string" && args.overlay_image_path.trim()) {
        const p = args.overlay_image_path.trim();
        if (p === "clear" || p === "none") {
          nextState.overlayImage = null;
        } else if (p === "latest") {
          const ov = findLatestAttachmentOverlay(mirror.snapshot?.data);
          if (ov) nextState.overlayImage = ov;
        } else {
          const ov = loadImageFileAsOverlay(p);
          if (ov) nextState.overlayImage = ov;
        }
      }

      if (Array.isArray(args.items)) {
        nextState.items = args.items.map((raw, idx) => {
          const bbox = Array.isArray(raw.bbox) && raw.bbox.length >= 4 ? raw.bbox : [-200, -200, 200, 200];
          const rect = mossBboxToScreenRect(bbox, w, h);
          return {
            id: `item_${Date.now()}_${idx + 1}`,
            label: raw.label || "character",
            shapeType: raw.label === "text" ? "bubble" : "rect",
            points: rectToPoints(rect.xMin, rect.yMin, rect.width, rect.height),
            roleTag: raw.roleTag || `${raw.label}#${idx + 1}`,
            noteZh: raw.noteZh || "",
            caption: raw.caption || "",
            text: raw.text || "",
            bubbleStyle: raw.bubbleStyle || "oval",
            tailPoint: null,
            speakerItemId: null,
          };
        });
      }

      const summary = mirror.updateFromAgent(nextState, "moss_workbench_update");
      return {
        serverRevision: summary.serverRevision,
        canvasWidth: Number(nextState.canvasWidth) || 1024,
        canvasHeight: Number(nextState.canvasHeight) || 1536,
        itemCount: Array.isArray(nextState.items) ? nextState.items.length : 0,
        mossJsonString: summary.compiled.mossJsonString,
      };
    },
  });
}


export { name, inject, apply, STATE_ROUTE, ACTION_ROUTE };
