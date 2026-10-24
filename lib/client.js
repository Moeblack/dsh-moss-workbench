window.__ModuleLoader__.load({
  id: "dsh-moss-workbench",
  factory(require) {
    const React = require("react");

    // === 1. Core MOSS Geometry & Compiler Engine ===
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



    // === 2. Scoped Styles ===
const MOSS_WORKBENCH_CSS = String.raw`
/* The resident active-session scrollport defaults to content-sized views. Only
   constrain it while MOSS is mounted; chat/gallery must retain their scrolling. */
.wSkVaW_root .wSkVaW_viewArea:has([data-slot="conversation.view"] .moss-wb-root){flex:1 1 0;min-height:0;padding:0;overflow:hidden}
.wSkVaW_viewArea .moss-wb-root{flex:1 1 0;min-height:0;height:auto;max-height:none}
.moss-wb-root{--mw-bg:var(--dsw-alias-bg-base,var(--dsw-alias-background,#10151e));--mw-surface:var(--dsw-alias-bg-l1,var(--dsw-alias-bg-base,#1b2331));--mw-raised:var(--dsw-alias-bg-l2,var(--dsw-alias-bg-base,#242e3d));--mw-text:var(--dsw-alias-label-primary,var(--dsw-alias-text,#edf3ff));--mw-muted:var(--dsw-alias-label-secondary,var(--dsw-alias-text-secondary,#9aacc3));--mw-border:var(--dsw-alias-border-l2,var(--dsw-alias-border,rgba(143,166,198,.22)));--mw-accent:var(--dsw-alias-brand-primary,var(--dsw-alias-primary,#9b8aff));--mw-motion:transform 220ms cubic-bezier(.22,1,.36,1),opacity 180ms ease,box-shadow 200ms ease,border-color 180ms ease;color:var(--mw-text);background:var(--mw-bg);font:13px/1.5 Inter,'Noto Sans SC','PingFang SC',system-ui,sans-serif;display:flex;flex-direction:column;flex:1 1 100%;width:100%;min-width:0;min-height:420px;height:100%;max-height:100%;overflow:hidden;isolation:isolate;color-scheme:light dark;container-type:inline-size;position:relative}
.moss-wb-root *{box-sizing:border-box}.moss-wb-root button,.moss-wb-root input,.moss-wb-root textarea,.moss-wb-root select{font:inherit;color:inherit}.moss-wb-root button,.moss-wb-root select{cursor:pointer}.moss-wb-root button{border:1px solid var(--mw-border);background:var(--mw-surface);border-radius:8px;padding:6px 9px;transition:var(--mw-motion);line-height:1.35}.moss-wb-root button:hover:not(:disabled){border-color:var(--mw-accent);box-shadow:0 2px 12px #0002;transform:translateY(-1px)}.moss-wb-root button:active:not(:disabled){transform:translateY(0) scale(.97)}.moss-wb-root button:disabled{opacity:.38;cursor:not-allowed}.moss-wb-root button:focus-visible,.moss-wb-root input:focus-visible,.moss-wb-root textarea:focus-visible,.moss-wb-root select:focus-visible{outline:2px solid var(--mw-accent);outline-offset:2px}.moss-wb-root input,.moss-wb-root textarea,.moss-wb-root select{min-width:0;border:1px solid var(--mw-border);border-radius:7px;background:var(--mw-bg);padding:7px 9px;outline:none}.moss-wb-root input:focus,.moss-wb-root textarea:focus{border-color:var(--mw-accent)}.moss-wb-root textarea{resize:vertical;min-height:72px}.moss-wb-root input[type=color]{padding:2px;width:34px;height:30px}.moss-wb-root input[type=range]{padding:0;accent-color:var(--mw-accent);width:110px}.moss-wb-root ::placeholder{color:var(--mw-muted);opacity:.8}.moss-wb-root .moss-wb-primary{color:#fff;background:linear-gradient(120deg,#7257e7,#4e73d6);border-color:#a99aff66;font-weight:650}.moss-wb-root .moss-wb-active{background:color-mix(in srgb,var(--mw-accent) 18%,var(--mw-surface));border-color:var(--mw-accent);color:var(--mw-accent)}.moss-wb-root .moss-wb-danger{color:#fb7185}.moss-wb-root .moss-wb-quiet{background:transparent;border-color:transparent;color:var(--mw-muted)}
.moss-wb-header{padding:12px 14px 10px;border-bottom:1px solid var(--mw-border);background:var(--mw-surface);flex:none}.moss-wb-brand{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.moss-wb-logo{font-weight:850;letter-spacing:.14em;font-size:15px;background:linear-gradient(100deg,#b8a5ff,#58d8e8);background-clip:text;-webkit-background-clip:text;color:transparent}.moss-wb-subtitle{color:var(--mw-muted);font-size:11px}.moss-wb-spacer{flex:1}.moss-wb-scene{display:flex;gap:8px;align-items:center}.moss-wb-scene>input{flex:1;background:var(--mw-bg);min-width:80px}.moss-wb-scene>label{white-space:nowrap;font-weight:600}.moss-wb-top-controls{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px}.moss-wb-top-controls select{max-width:180px}.moss-wb-toolbar{display:flex;gap:5px;flex-wrap:wrap;padding:9px 12px;border-bottom:1px solid var(--mw-border);background:var(--mw-surface);flex:none}.moss-wb-toolbar button{display:flex;gap:5px;align-items:center;white-space:nowrap}.moss-wb-key{font-size:10px;opacity:.52;min-width:12px}.moss-wb-subbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:6px 12px;min-height:39px;border-bottom:1px solid var(--mw-border);color:var(--mw-muted);font-size:12px;flex:none}.moss-wb-subbar label{display:inline-flex;gap:6px;align-items:center}.moss-wb-tabs{display:none;gap:4px;padding:7px 10px;border-bottom:1px solid var(--mw-border);flex:none}.moss-wb-tabs>button{flex:1}.moss-wb-body{display:grid;grid-template-columns:minmax(0,1fr) 310px;flex:1;min-height:0;overflow:hidden}.moss-wb-canvas-column{display:flex;min-width:0;min-height:260px;flex-direction:column;overflow:hidden}.moss-wb-canvas-stage{flex:1;position:relative;overflow:auto;min-height:260px;background-color:var(--mw-bg);background-image:radial-gradient(var(--mw-border) 1px,transparent 1px);background-size:18px 18px;padding:16px 20px 28px;display:flex;align-items:center;justify-content:center;overscroll-behavior:contain}.moss-wb-canvas-wrap{position:relative;width:min(100%,460px);margin:auto;flex-shrink:0;filter:drop-shadow(0 10px 25px #0003)}.moss-wb-svg{display:block;max-height:none;width:100%;height:auto;overflow:visible;touch-action:none;background:#f8fafc;border-radius:2px;user-select:none;-webkit-user-select:none}.moss-wb-svg[data-tool=select]{cursor:default}.moss-wb-svg[data-tool=rect],.moss-wb-svg[data-tool=knife],.moss-wb-svg[data-tool=polygon],.moss-wb-svg[data-tool=lasso],.moss-wb-svg[data-tool=bubble]{cursor:crosshair}.moss-wb-svg[data-tool=brush]{cursor:crosshair}.moss-wb-canvas-help{font-size:11px;color:var(--mw-muted);padding:7px 12px;display:flex;gap:8px;justify-content:space-between;border-top:1px solid var(--mw-border);flex:none}.moss-wb-shape{transition:opacity 180ms ease;cursor:move}.moss-wb-shape-new{animation:moss-wb-arrive 600ms cubic-bezier(.22,1,.36,1);transform-box:fill-box;transform-origin:center}.moss-wb-label{pointer-events:none;font-family:Inter,'Noto Sans SC',system-ui,sans-serif}.moss-wb-empty-label{animation:moss-wb-breathe 2.6s ease-in-out infinite}.moss-wb-selection{pointer-events:none;stroke:#7c66ed;stroke-width:1.4;stroke-dasharray:5 3;fill:none;vector-effect:non-scaling-stroke}.moss-wb-handle{fill:white;stroke:#7761df;stroke-width:1.5;vector-effect:non-scaling-stroke;transition:fill 100ms}.moss-wb-handle:hover{fill:#ddd6fe}.moss-wb-vertex{fill:#38bdf8;stroke:#fff;stroke-width:1.5;vector-effect:non-scaling-stroke;cursor:crosshair}.moss-wb-vertex:nth-of-type(even){fill:#f43f5e}.moss-wb-tail-handle{fill:#fbbf24;stroke:#92400e;stroke-width:2;vector-effect:non-scaling-stroke;cursor:grab}.moss-wb-laser{stroke:#f472b6;stroke-dasharray:10 5;stroke-width:3;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 4px #ec4899);animation:moss-wb-laser 600ms linear infinite;pointer-events:none}.moss-wb-quick-note{position:absolute;z-index:8;width:420px;max-width:calc(100% - 12px);padding:10px;border-radius:13px;border:1px solid color-mix(in srgb,var(--mw-accent) 45%,var(--mw-border));background:color-mix(in srgb,var(--mw-surface) 92%,transparent);box-shadow:0 12px 36px #0004,0 0 0 1px #ffffff0a;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);animation:moss-wb-pop 180ms cubic-bezier(.22,1,.36,1);transform:translateX(-50%)}.moss-wb-quick-head{display:flex;align-items:center;gap:6px;margin-bottom:7px;font-size:11px;color:var(--mw-muted)}.moss-wb-quick-head strong{color:var(--mw-text)}.moss-wb-quick-note input{width:100%;font-size:13px;padding:9px}.moss-wb-role-pills,.moss-wb-tags,.moss-wb-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.moss-wb-role-pills{margin-bottom:7px}.moss-wb-role-pills button{font-size:11px;padding:4px 6px;flex:1;white-space:nowrap}.moss-wb-tags{margin-top:7px}.moss-wb-tags button{font-size:11px;color:var(--mw-muted);padding:3px 7px;border-radius:20px}.moss-wb-quick-note .moss-wb-bubble-text{margin-top:7px;border-color:#fbbf2466}.moss-wb-quick-foot{display:flex;align-items:center;gap:6px;margin-top:7px;font-size:10px;color:var(--mw-muted)}.moss-wb-quick-foot button{margin-left:auto;padding:4px 8px;font-size:11px}
.moss-wb-inspector{border-left:1px solid var(--mw-border);background:var(--mw-surface);overflow:auto;min-height:0;scrollbar-width:thin}.moss-wb-section{padding:12px;border-bottom:1px solid var(--mw-border)}.moss-wb-section-title{display:flex;gap:6px;align-items:center;font-weight:650;margin:0 0 9px;font-size:12px}.moss-wb-section-title span{color:var(--mw-muted);font-weight:400;margin-left:auto;font-size:11px}.moss-wb-item-list{display:flex;flex-direction:column;gap:6px;max-height:330px;overflow:auto}.moss-wb-item-row{padding:8px;border:1px solid var(--mw-border);border-radius:9px;transition:var(--mw-motion);background:var(--mw-bg)}.moss-wb-item-row.moss-wb-selected{border-color:var(--mw-accent);box-shadow:inset 3px 0 var(--mw-accent)}.moss-wb-item-row[draggable=true]{cursor:grab}.moss-wb-item-head{display:flex;align-items:center;gap:5px;font-size:11px;margin-bottom:5px}.moss-wb-item-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.moss-wb-item-head button{padding:2px 4px;font-size:11px;border-color:transparent;background:transparent}.moss-wb-item-row input{width:100%;font-size:12px;padding:6px}.moss-wb-item-dot{width:7px;height:7px;display:inline-block;border-radius:50%;flex:none}.moss-wb-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.moss-wb-field{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--mw-muted)}.moss-wb-field-wide{grid-column:1/-1}.moss-wb-field input,.moss-wb-field select,.moss-wb-field textarea{width:100%;color:var(--mw-text)}.moss-wb-empty{padding:20px 10px;text-align:center;border:1px dashed var(--mw-border);border-radius:9px;color:var(--mw-muted);font-size:12px}.moss-wb-empty strong{display:block;color:var(--mw-text);margin-bottom:5px}.moss-wb-meta{font-size:11px;color:var(--mw-muted)}.moss-wb-coordinate{font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;color:var(--mw-muted);overflow-wrap:anywhere;margin:8px 0}.moss-wb-json{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.6 ui-monospace,SFMono-Regular,monospace;padding:10px;background:var(--mw-bg);border:1px solid var(--mw-border);border-radius:7px;max-height:300px;overflow:auto;margin:8px 0 0}.moss-wb-lint{display:flex;flex-direction:column;gap:6px}.moss-wb-lint-row{padding:7px 8px;border-radius:7px;background:#f59e0b0d;color:#d89a29;font-size:11px;display:flex;gap:6px;align-items:center}.moss-wb-lint-row span{flex:1}.moss-wb-lint-row button{padding:3px 6px;font-size:10px;white-space:nowrap}.moss-wb-good{color:#49b88e;font-size:11px}.moss-wb-actions{display:flex;gap:6px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid var(--mw-border);background:var(--mw-surface);flex:none}.moss-wb-actions>.moss-wb-primary{flex:1;min-width:180px}.moss-wb-actions button{font-size:12px}.moss-wb-toast{position:absolute;left:50%;bottom:68px;transform:translateX(-50%);z-index:20;max-width:90%;border:1px solid var(--mw-border);border-radius:12px;background:var(--mw-raised);color:var(--mw-text);box-shadow:0 6px 24px #0004;padding:10px 16px;font-size:12px;animation:moss-wb-pop 180ms ease;pointer-events:none}.moss-wb-error{color:#fb7185}.moss-wb-import{position:absolute;inset:12px;z-index:30;border:1px solid var(--mw-border);border-radius:14px;background:var(--mw-surface);box-shadow:0 20px 60px #0006;display:flex;flex-direction:column;gap:12px;padding:18px;animation:moss-wb-pop 180ms ease}.moss-wb-import textarea{flex:1;width:100%;font-family:ui-monospace,monospace;min-height:130px}.moss-wb-import h3{margin:0}.moss-wb-import p{margin:0;font-size:12px;color:var(--mw-muted)}.moss-wb-pill{border:1px solid var(--dsw-alias-border-l2,#7c66ed55);border-radius:20px;padding:5px 10px;cursor:pointer;background:var(--dsw-alias-bg-base,#27223d);color:var(--dsw-alias-label-primary,#ded5ff);font:12px/1.4 system-ui,sans-serif;display:inline-flex;align-items:center;gap:6px}.moss-wb-pill:hover{border-color:#9b8aff}.moss-wb-hint{font-size:11px;color:var(--mw-muted);margin:6px 0 0}.moss-wb-mobile-output{display:none}.moss-wb-palette{display:flex;gap:6px}.moss-wb-palette label{flex:1;font-size:10px;color:var(--mw-muted);display:flex;flex-direction:column;gap:3px}.moss-wb-palette input[type=color]{width:100%}.moss-wb-sync{font-size:10px;color:var(--mw-muted)}.moss-wb-sync[data-status=error]{color:#fb7185}
.moss-wb-size-controls{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:10px;padding-bottom:8px;border-bottom:1px solid var(--mw-border)}
.moss-wb-ratio-controls,.moss-wb-custom-ratio,.moss-wb-mp-control{display:flex;align-items:center;gap:5px}.moss-wb-ratio-controls>span{margin-right:3px;font-weight:600}.moss-wb-custom-ratio input{width:74px}.moss-wb-mp-control{white-space:nowrap}.moss-wb-mp-control input{width:100px}.moss-wb-size-summary{flex-basis:100%;font-size:11px;color:var(--mw-muted);overflow-wrap:anywhere}
.moss-wb-style-tags{display:flex;align-items:flex-end;gap:6px;margin-top:10px}.moss-wb-style-tags>label{flex:1;min-width:0}.moss-wb-style-tags>button{flex:none}
.moss-wb-palette-heading{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:12px}.moss-wb-palette-heading strong{font-size:11px;margin-right:auto}.moss-wb-palette-heading button{font-size:11px;padding:4px 6px}.moss-wb-palette{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.moss-wb-palette-color{display:flex;align-items:center;gap:4px;padding:4px 6px;border:1px solid var(--mw-border);border-radius:7px}.moss-wb-palette-color label{display:flex;align-items:center;gap:4px;font-size:11px}.moss-wb-palette-color>span{font:10px ui-monospace,monospace;color:var(--mw-muted)}.moss-wb-palette-color button{padding:3px 6px}
.moss-wb-root[data-narrow=true] .moss-wb-body{display:flex;flex-direction:column}.moss-wb-root[data-narrow=true] .moss-wb-tabs{display:flex}.moss-wb-root[data-narrow=true] .moss-wb-inspector{border-left:0;flex:1}.moss-wb-root[data-narrow=true][data-tab=canvas] .moss-wb-inspector{display:none}.moss-wb-root[data-narrow=true][data-tab=inspector] .moss-wb-canvas-column,.moss-wb-root[data-narrow=true][data-tab=json] .moss-wb-canvas-column{display:none}.moss-wb-root[data-narrow=true][data-tab=inspector] .moss-wb-output-section{display:none}.moss-wb-root[data-narrow=true][data-tab=json] .moss-wb-edit-section{display:none}.moss-wb-root[data-narrow=true] .moss-wb-canvas-stage{padding:28px 14px 130px}.moss-wb-root[data-narrow=true] .moss-wb-toolbar{gap:4px;padding:7px}.moss-wb-root[data-narrow=true] .moss-wb-toolbar button{font-size:11px;padding:6px}.moss-wb-root[data-narrow=true] .moss-wb-key{display:none}.moss-wb-root[data-narrow=true] .moss-wb-scene{align-items:flex-start;flex-direction:column;gap:4px}.moss-wb-root[data-narrow=true] .moss-wb-scene input{width:100%}.moss-wb-root[data-narrow=true] .moss-wb-header{padding:10px}.moss-wb-root[data-narrow=true] .moss-wb-subtitle{display:none}.moss-wb-root[data-narrow=true] .moss-wb-actions>.moss-wb-primary{flex-basis:100%}.moss-wb-root[data-narrow=true] .moss-wb-quick-note{padding:8px}.moss-wb-root[data-narrow=true] .moss-wb-role-pills button{font-size:10px;padding:4px}.moss-wb-root[data-narrow=true] .moss-wb-canvas-help{font-size:10px}.moss-wb-root[data-narrow=true] .moss-wb-top-controls select{max-width:145px}
@keyframes moss-wb-arrive{0%{opacity:.35;transform:scale(.965);filter:drop-shadow(0 0 8px #a78bfa)}60%{filter:drop-shadow(0 0 3px #a78bfa)}100%{opacity:1;transform:scale(1);filter:none}}@keyframes moss-wb-breathe{0%,100%{opacity:.55}50%{opacity:.95}}@keyframes moss-wb-laser{to{stroke-dashoffset:-30}}@keyframes moss-wb-pop{from{opacity:0;margin-top:4px}to{opacity:1;margin-top:0}}
.moss-wb-overlay-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 12px;border-bottom:1px solid var(--mw-border);background:color-mix(in srgb,var(--mw-accent) 9%,var(--mw-surface));font-size:11.5px;flex:none}.moss-wb-overlay-bar label{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.moss-wb-overlay-badge{font-weight:650;color:var(--mw-accent);display:inline-flex;align-items:center;gap:4px}
/* Studio workspace: one 42px options row, 28px document tabs and docked panels. */
.moss-wb-file-actions{display:flex;align-items:center;gap:3px;flex:none;padding-right:7px;border-right:1px solid #454a54}.moss-wb-file-actions .moss-wb-file-saved{color:#a5d5b6}
.moss-wb-document-bar{height:28px;min-height:28px;max-height:28px;flex:none;display:flex;align-items:stretch;gap:0;background:#20242b;border-bottom:1px solid #12161c;overflow:hidden}.moss-wb-document-tabs{display:flex;align-items:stretch;min-width:0;flex:1;overflow-x:auto;scrollbar-width:none}.moss-wb-document{display:flex;align-items:stretch;flex:none;max-width:320px;border-right:1px solid #171b22;border-top:2px solid transparent;background:#272c34}.moss-wb-document-active{background:var(--mw-surface-2);border-top-color:var(--mw-accent)}.moss-wb-document-bar button{border:0;border-radius:0;background:transparent;height:26px;font-size:10px;padding:2px 7px;white-space:nowrap}.moss-wb-document>[role=tab]{display:flex;align-items:center;gap:3px;min-width:0;max-width:285px;color:#9ba7b8}.moss-wb-document-active>[role=tab]{color:#eef3fb}.moss-wb-document-title{overflow:hidden;text-overflow:ellipsis;max-width:160px;white-space:nowrap}.moss-wb-document-size{font:9px ui-monospace,monospace;color:#a0abba}.moss-wb-document-dirty{color:#fff}.moss-wb-document .moss-wb-document-close{padding:1px 5px;font-size:14px;color:#98a4b5;flex:none}.moss-wb-document .moss-wb-document-close:hover{color:#fff;background:#5b3340}.moss-wb-document input{height:23px;max-width:220px;min-width:100px;margin:0 3px;padding:0 5px;font-size:10px}.moss-wb-document-bar>button{flex:none;color:#b7c4d7;border-left:1px solid #151920;font-size:10px}

.wSkVaW_root:has(.wSkVaW_viewArea [data-slot="conversation.view"] .moss-wb-root) .wSkVaW_widthHandle{display:none!important;pointer-events:none!important}
.wSkVaW_root:has(.wSkVaW_viewArea [data-slot="conversation.view"] .moss-wb-root) .wSkVaW_header::after{display:none!important}
.moss-wb-root{--mw-bg:#24272e;--mw-surface:#2c3038;--mw-raised:#343943;--mw-surface-2:#343943;--mw-text:#e1e5eb;--mw-muted:#a5adba;--mw-border:#414650;--mw-accent:#79acfa;color-scheme:dark;font:12px/1.45 Inter,'Noto Sans SC',system-ui,sans-serif;min-height:0}
.moss-wb-root button{border-radius:3px;padding:4px 7px;transition:background .12s,border-color .12s;white-space:nowrap}.moss-wb-root button:hover:not(:disabled){transform:none;box-shadow:none;background:#3d4654}.moss-wb-root button:active:not(:disabled){transform:none}.moss-wb-root input,.moss-wb-root select,.moss-wb-root textarea{border-radius:3px;padding:5px 7px;background:#23262c}.moss-wb-root .moss-wb-primary{background:#3974c4;border-color:#5b8fd3;color:#fff}.moss-wb-root .moss-wb-active{background:#374966;color:#c4dcff;border-color:#647fa5}.moss-wb-root input[type=number]{appearance:textfield;-moz-appearance:textfield}.moss-wb-root input::-webkit-outer-spin-button,.moss-wb-root input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.moss-wb-options-bar{height:42px;min-height:42px;max-height:42px;display:flex;align-items:center;flex-wrap:nowrap;gap:8px;padding:0 8px;flex:none;background:#2b2f37;border-bottom:1px solid #16191f;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;z-index:25}.moss-wb-options-bar button,.moss-wb-options-bar input{height:26px;font-size:11px;line-height:1;padding:3px 5px}.moss-wb-studio-brand{height:25px;width:35px;flex:none;background:#1b2e48;border:1px solid #4775a9;color:#a6ceff;font:bold 10px/23px ui-sans-serif;text-align:center;border-radius:3px}
.moss-wb-options-bar .moss-wb-size-controls{display:flex;flex:none;flex-wrap:nowrap;align-items:center;gap:4px;margin:0;padding:0 8px 0 0;border:0;border-right:1px solid #454a54;white-space:nowrap}.moss-wb-options-bar .moss-wb-select{height:26px;width:184px;max-width:220px;flex:none;padding:3px 22px 3px 7px;border:1px solid #4c5462;border-radius:3px;background-color:#232730;color:#e0e7f1;font-size:11px;line-height:1.2;color-scheme:dark}.moss-wb-select option{background:#252a33;color:#e0e7f1}.moss-wb-custom-ratio{gap:2px}.moss-wb-custom-ratio input{width:35px;text-align:center}.moss-wb-mp-control{gap:3px;color:#aeb7c7;font-size:10px}.moss-wb-mp-control input{width:56px;font:11px ui-monospace,monospace}.moss-wb-size-readout{font:10px ui-monospace,monospace;background:#20242a;border:1px solid #414752;border-radius:3px;padding:5px 4px;color:#c1cad8}
.moss-wb-context-options{display:flex;align-items:center;gap:4px;min-width:0;flex:1}.moss-wb-context-options label{display:flex;align-items:center;gap:4px;white-space:nowrap}.moss-wb-context-options input[type=range]{width:66px;height:20px}.moss-wb-context-options input[type=color]{width:26px}.moss-wb-top-actions{display:flex;gap:4px;align-items:center;flex:none;margin-left:auto;background:#2b2f37}.moss-wb-top-actions>button:nth-child(-n+2){width:26px;font-size:15px}.moss-wb-top-actions .moss-wb-primary{padding:0 9px;font-weight:600}
.moss-wb-root .moss-wb-body,.moss-wb-root[data-narrow=true] .moss-wb-body{display:grid;grid-template-columns:46px minmax(0,1fr) 300px;min-height:0;flex:1;overflow:hidden}.moss-wb-tool-dock{background:#2b2f37;border-right:1px solid #16191f;padding:8px 5px;display:flex;flex-direction:column;align-items:center;gap:4px;overflow-y:auto;scrollbar-width:none}.moss-wb-tool-dock>button{position:relative;width:34px;height:34px;display:grid;place-items:center;padding:0;background:transparent;border-color:transparent;flex:none;color:#bcc5d3}.moss-wb-tool-dock>button.moss-wb-active{background:#465267;color:#fff;border-color:#78879e;box-shadow:inset 2px 0 #9ac4ff}.moss-wb-tool-dock kbd{position:absolute;bottom:1px;right:2px;font:8px ui-sans-serif;opacity:.6}.moss-wb-tool-dock hr{width:26px;border:0;border-top:1px solid #494f5a;margin:8px 0}.moss-wb-role-swatch{font-size:9px;color:white;border-radius:3px;padding:5px 2px;min-width:28px;line-height:14px;border:1px solid #ffffff30}
.moss-wb-root .moss-wb-canvas-column,.moss-wb-root[data-narrow=true] .moss-wb-canvas-column{display:flex;min-height:0;overflow:hidden}.moss-wb-root .moss-wb-canvas-stage,.moss-wb-root[data-narrow=true] .moss-wb-canvas-stage{container-type:size;position:relative;min-height:0;min-width:0;flex:1;overflow:hidden;background:#1e222a radial-gradient(#ffffff0b .7px,transparent .7px);background-size:16px 16px;padding:30px 0;display:flex;align-items:center;justify-content:center}.moss-wb-canvas-wrap{flex:none;margin:0;max-width:none;max-height:none;box-shadow:0 8px 30px #0007,0 0 0 1px #0009;background:#f8fafc}.moss-wb-root .moss-wb-canvas-help{height:24px;min-height:24px;max-height:24px;flex:none;display:flex;align-items:center;gap:12px;justify-content:flex-start;padding:0 8px;border-top:1px solid #15191e;background:#292d35;color:#aab4c2;font:9px ui-monospace,monospace;white-space:nowrap;overflow:hidden}.moss-wb-canvas-help>.moss-wb-sync{margin-left:auto;font:9px ui-sans-serif;color:#8db7a2;overflow:hidden;text-overflow:ellipsis}.moss-wb-tool-hint{overflow:hidden;text-overflow:ellipsis}
.moss-wb-overlay-hud{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:20;max-width:calc(100% - 20px);display:flex;align-items:center;gap:5px;padding:4px 6px;border:1px solid #69768a66;border-radius:6px;background:#303844e8;box-shadow:0 3px 12px #0005;backdrop-filter:blur(12px);overflow:auto;white-space:nowrap;scrollbar-width:none;font-size:10px}.moss-wb-overlay-hud button{padding:3px 5px;height:23px;line-height:1;font-size:10px;background:transparent;border-color:transparent}.moss-wb-overlay-hud label{display:flex;align-items:center;gap:5px}.moss-wb-overlay-hud input[type=range]{width:66px}
.moss-wb-studio-panels{display:flex;flex-direction:column;min-height:0;overflow:hidden;background:#2c3038;border-left:1px solid #14181d}.moss-wb-scene-panel{padding:10px;flex:none;border-bottom:1px solid #191c22}.moss-wb-scene-panel>label{display:flex;flex-direction:column;gap:5px;font-size:10px;color:#aeb9c8}.moss-wb-scene-panel input{width:100%;height:29px;font-size:11px}.moss-wb-mode{display:flex;margin-top:7px;gap:4px}.moss-wb-mode button{flex:1;font-size:10px;padding:3px 5px}.moss-wb-property-panel,.moss-wb-layers-panel{display:flex;flex-direction:column;min-height:0;overflow:hidden}.moss-wb-property-panel{flex:1 1 54%;border-bottom:1px solid #15181d}.moss-wb-layers-panel{flex:1 1 46%}.moss-wb-panel-heading{display:flex;gap:8px;align-items:center;flex:none;height:28px;padding:0 10px;background:#252931;font-size:11px;font-weight:600}.moss-wb-panel-heading>span{margin-left:auto;color:#727f91;font-size:8px;letter-spacing:.1em}.moss-wb-panel-tabs{height:29px;flex:none;display:flex;background:#292d34;border-bottom:1px solid #1d2127;gap:0}.moss-wb-panel-tabs button{border:0;border-radius:0;background:transparent;color:#929eaf;padding:5px 12px;font-size:10px}.moss-wb-panel-tabs button[aria-selected=true]{background:#353b46;color:#e0e7f3;border-bottom:2px solid #83ace8}.moss-wb-panel-content{overflow:auto;min-height:0;flex:1;scrollbar-width:thin;scrollbar-color:#555e6d transparent}.moss-wb-panel-content .moss-wb-section{padding:10px;border:0}.moss-wb-panel-content .moss-wb-section-title{display:none}.moss-wb-panel-content .moss-wb-fields{gap:7px}.moss-wb-panel-content .moss-wb-field{font-size:10px}.moss-wb-panel-content textarea{min-height:54px}.moss-wb-panel-content .moss-wb-empty{padding:24px 12px;font-size:11px;border:0}.moss-wb-panel-content .moss-wb-item-list{max-height:none;gap:1px;overflow:visible}.moss-wb-panel-content .moss-wb-item-row{border:0;border-bottom:1px solid #3d424d;border-radius:0;background:#2a2e36;padding:6px}.moss-wb-panel-content .moss-wb-item-row.moss-wb-selected{background:#3a4b65}.moss-wb-panel-content .moss-wb-item-head{gap:4px;margin:0 0 4px}.moss-wb-panel-content .moss-wb-item-row input{background:transparent;border-color:transparent;padding:3px 4px;font-size:11px;height:23px}.moss-wb-panel-content .moss-wb-item-row input:focus{border-color:#79acfa;background:#20242c}.moss-wb-panel-content .moss-wb-item-title{font-size:10px}.moss-wb-panel-content .moss-wb-palette-heading{gap:4px}.moss-wb-panel-content .moss-wb-palette-heading button{font-size:9px}.moss-wb-panel-content .moss-wb-hint{font-size:10px;color:#a6b0bd}.moss-wb-panel-content .moss-wb-json{font-size:10px;max-height:none;overflow:visible;margin:6px 0;background:#22262d;padding:8px;border-radius:3px}.moss-wb-panel-content .moss-wb-meta{font-size:9px}.moss-wb-panel-content .moss-wb-role-pills{gap:3px}.moss-wb-panel-content .moss-wb-role-pills button{font-size:10px;padding:3px 4px}.moss-wb-alert{position:absolute;bottom:30px;left:55px;z-index:80;padding:8px;background:#433632;border:1px solid #80634e;max-width:80%}
.moss-wb-root .moss-wb-toast{bottom:34px;left:60px;right:auto;font-size:11px;max-width:calc(100% - 380px)}.moss-wb-root .moss-wb-import{background:#2c3038;color:#e1e5eb}
@container(max-width:1000px){.moss-wb-context-options{min-width:185px}.moss-wb-options-bar{gap:5px}.moss-wb-root .moss-wb-body,.moss-wb-root[data-narrow=true] .moss-wb-body{grid-template-columns:46px minmax(0,1fr) 260px}.moss-wb-tool-hint{display:none}.moss-wb-top-actions{position:sticky;right:0;padding-left:5px}.moss-wb-context-options button{font-size:10px}}
@container(max-width:600px){.moss-wb-root .moss-wb-body,.moss-wb-root[data-narrow=true] .moss-wb-body{grid-template-columns:42px minmax(180px,1fr) 230px;overflow-x:auto}.moss-wb-tool-dock{padding-left:3px;padding-right:3px}.moss-wb-root .moss-wb-toast{max-width:calc(100% - 70px)}}
@media(prefers-reduced-motion:reduce){.moss-wb-root *{animation:none!important;transition:none!important}}
`;


    // === 3. Persistent Document Store ===
const DOCUMENTS_STORAGE_KEY = 'dsh-moss-workbench-docs-v1';
const copy = value => JSON.parse(JSON.stringify(value));
const id = () => globalThis.crypto?.randomUUID?.() || `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function documentTitle(state) {
  return String(state.globalNoteZh || state.globalCaption || state.items?.find(item => item.noteZh)?.noteZh || `画布_${state.canvasWidth}x${state.canvasHeight}`).trim().slice(0, 60);
}
function documentFingerprint(state) {
  const value = JSON.stringify(state);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i); }
  return `${value.length}:${a >>> 0}:${b >>> 0}`;
}
function makeDocument(state, title = documentTitle(state), manualTitle = false) {
  return { id: id(), title, manualTitle, state: copy(state), savedFingerprint: documentFingerprint(state), savedAt: Date.now(), updatedAt: Date.now() };
}
function createDocumentStore(state, persisted) {
  if (persisted?.version === 1 && Array.isArray(persisted.documents)) {
    const seen = new Set();
    const documents = persisted.documents.filter(doc => {
      if (!doc?.id || seen.has(doc.id) || !Array.isArray(doc.state?.items) || !Array.isArray(doc.state?.strokes) || !(doc.state.canvasWidth > 0 && doc.state.canvasHeight > 0)) return false;
      seen.add(doc.id); return true;
    }).map(doc => ({ ...doc, title: String(doc.title || documentTitle(doc.state)).slice(0, 60) }));
    if (documents.length) return { version: 1, activeId: documents.some(doc => doc.id === persisted.activeId) ? persisted.activeId : documents[0].id, documents };
  }
  const doc = makeDocument(state);
  return { version: 1, activeId: doc.id, documents: [doc] };
}
function updateActiveDocument(store, state) {
  return { ...store, documents: store.documents.map(doc => doc.id === store.activeId ? { ...doc, state: copy(state), updatedAt: Date.now(), title: doc.manualTitle ? doc.title : (state.globalNoteZh?.trim() || state.globalCaption?.trim() || state.items?.some(item => item.noteZh?.trim())) ? documentTitle(state) : doc.title } : doc) };
}
function saveActiveDocument(store, state) {
  const next = updateActiveDocument(store, state);
  return { ...next, documents: next.documents.map(doc => doc.id === next.activeId ? { ...doc, savedFingerprint: documentFingerprint(state), savedAt: Date.now() } : doc) };
}
function newDocument(store, current, blank) {
  const next = saveActiveDocument(store, current);
  let n = next.documents.length + 1;
  while (next.documents.some(doc => doc.title === `未命名-${n}`)) n++;
  const doc = makeDocument(blank, `未命名-${n}`);
  return { ...next, activeId: doc.id, documents: [...next.documents, doc] };
}
function switchDocument(store, current, targetId) {
  if (!store.documents.some(doc => doc.id === targetId)) return store;
  return { ...updateActiveDocument(store, current), activeId: targetId };
}
function closeDocument(store, current, targetId, blank) {
  const next = updateActiveDocument(store, current), index = next.documents.findIndex(doc => doc.id === targetId);
  if (index < 0) return store;
  const documents = next.documents.filter(doc => doc.id !== targetId);
  if (!documents.length) { const doc = makeDocument(blank, '未命名-1'); return { ...next, activeId: doc.id, documents: [doc] }; }
  return { ...next, activeId: targetId === next.activeId ? documents[Math.min(index, documents.length - 1)].id : next.activeId, documents };
}
function renameDocument(store, targetId, title) {
  const clean = String(title).trim().slice(0, 60);
  if (!clean) return store;
  return { ...store, documents: store.documents.map(doc => doc.id === targetId ? { ...doc, title: clean, manualTitle: true } : doc) };
}


    // === 4. Workbench React Application ===



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
function renderWorkbenchToDataUrl(input) {
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
const renderWorkbenchSnapshotDataUrl = renderWorkbenchToDataUrl;
function createMossWorkbenchComponents({ React, syncStateToServer, insertIntoComposer, openWorkbenchTab }) {
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


    // === 4. DSH Client Slot Registration ===

const STATE_ROUTE = "/plugins/dsh-moss-workbench/state";
const SIDEBAR_TAB_ID = "moss-workbench";
const VIEW_TAB_ID = "moss-workbench";

function findComposerTextarea() {
  if (typeof document === "undefined") return null;
  const selectors = [
    'textarea[data-testid="composer-input"]',
    "textarea[data-composer-input]",
    "[data-composer-seat] textarea",
    ".dsh-composer textarea",
    "form textarea",
    "textarea",
  ];
  for (const sel of selectors) {
    const list = Array.from(document.querySelectorAll(sel));
    const visible = list.find((el) => {
      if (el.closest(".moss-wb-root")) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 80 && rect.height > 18;
    });
    if (visible) return visible;
  }
  return null;
}

function findComposerContentEditable() {
  if (typeof document === "undefined") return null;
  const selectors = [
    '[data-composer-seat] [contenteditable="true"]',
    '[data-conversation-region="composer"] [contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
  ];
  for (const sel of selectors) {
    const list = Array.from(document.querySelectorAll(sel));
    const visible = list.find((el) => {
      if (el.closest(".moss-wb-root")) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 80 && rect.height > 16;
    });
    if (visible) return visible;
  }
  return null;
}

function setTextareaNativeValue(textarea, nextValue) {
  if (!textarea) return false;
  const proto = Object.getPrototypeOf(textarea);
  const setter =
    Object.getOwnPropertyDescriptor(proto, "value")?.set ||
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) {
    setter.call(textarea, nextValue);
  } else {
    textarea.value = nextValue;
  }
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));
  textarea.focus();
  return true;
}
function createClientPlugin(React) {
  const h = React.createElement;

  let currentCtx = null;
  let activeInputActions = null;
  let activeSessionId = null;
  let activeOpenView = null;
  const overlayListeners = new Set();
  let overlayOpenState = false;

  function setOverlayOpen(next) {
    overlayOpenState = Boolean(next);
    for (const fn of overlayListeners) {
      try {
        fn(overlayOpenState);
      } catch {
        // Ignore
      }
    }
  }

  async function syncStateToServer(payload) {
    const res = await fetch(STATE_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data || data.ok === false) {
      throw new Error(data?.error || "同步画板状态失败");
    }
    return data;
  }

  function switchConversationViewTab(targetId) {
    if (targetId === "chat" && overlayOpenState) {
      setOverlayOpen(false);
    }
    if (typeof document !== "undefined") {
      const tabButtons = Array.from(
        document.querySelectorAll('[data-conversation-tabs] button[role="tab"]')
      );
      const match = tabButtons.find((btn) => {
        const text = (btn.textContent || "").trim().toLowerCase();
        if (targetId === VIEW_TAB_ID) {
          return text.includes("moss") || text.includes("分镜");
        }
        if (targetId === "chat") {
          return text.includes("chat") || text.includes("对话") || text.includes("聊天");
        }
        return false;
      });
      if (match) {
        match.click();
        return true;
      }
    }
    try {
      if (
        typeof activeOpenView === "function" &&
        typeof document !== "undefined" &&
        document.querySelector("[data-conversation-tabs]")
      ) {
        activeOpenView(targetId);
        return true;
      }
    } catch {
      // Ignore
    }
    return false;
  }

  async function insertIntoComposer(promptText) {
    if (!promptText) {
      throw new Error("生成的 MOSS 指令为空");
    }

    // Close overlay if open so user sees the composer immediately
    if (overlayOpenState) {
      setOverlayOpen(false);
    }

    // 1. Try DSH ConversationController / SessionInput service via activeSessionId
    try {
      const conv = currentCtx?.conversation || currentCtx?.get?.("conversation");
      const sessions = currentCtx?.sessions || currentCtx?.get?.("sessions");
      const sid =
        activeSessionId ||
        sessions?.current?.getSnapshot?.()?.id ||
        document
          ?.querySelector?.("[data-conversation-session]")
          ?.getAttribute?.("data-conversation-session");
      if (conv?.input?.for && sessions?.scope && sid) {
        const sessionInput = conv.input.for(sessions.scope(sid));
        if (sessionInput && typeof sessionInput.setDraft === "function") {
          const existing = sessionInput.state?.getSnapshot?.()?.draft || "";
          const combined = existing.trim()
            ? `${existing.trim()}\n\n${promptText}`
            : promptText;
          sessionInput.setDraft(combined);
          switchConversationViewTab("chat");
          sessionInput.focus?.();
          return { ok: true, mode: "session-input" };
        }
      }
    } catch {
      // Fall through to slot inputActions
    }

    // 2. Try slot-injected inputActions.setDraft
    try {
      if (activeInputActions && typeof activeInputActions.setDraft === "function") {
        activeInputActions.setDraft(promptText);
        switchConversationViewTab("chat");
        findComposerContentEditable()?.focus?.();
        return { ok: true, mode: "input-actions" };
      }
    } catch {
      // Fall through to DOM
    }

    // 3. Try native <textarea> composer
    try {
      const ta = findComposerTextarea();
      if (ta) {
        const existing = (ta.value || "").trim();
        const combined = existing ? `${existing}\n\n${promptText}` : promptText;
        if (setTextareaNativeValue(ta, combined)) {
          switchConversationViewTab("chat");
          return { ok: true, mode: "textarea" };
        }
      }
    } catch {
      // Fall through to Lexical contenteditable
    }

    // 4. Try Lexical contenteditable paste/insertText simulation
    try {
      const ce = findComposerContentEditable();
      if (ce) {
        switchConversationViewTab("chat");
        ce.focus();
        if (typeof document.execCommand === "function") {
          document.execCommand("selectAll", false, null);
          if (document.execCommand("insertText", false, promptText)) {
            return { ok: true, mode: "contenteditable" };
          }
        }
      }
    } catch {
      // Fall through to clipboard
    }

    // 5. Fallback to clipboard
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(promptText);
      switchConversationViewTab("chat");
      return { ok: true, mode: "clipboard" };
    }

    throw new Error("未找到可用的对话框输入组件");
  }

  function openWorkbenchTab() {
    // 1. Prefer opening the full-width Conversation View tab ("MOSS 分镜台") if inside a session
    if (switchConversationViewTab(VIEW_TAB_ID)) {
      return true;
    }
    // 2. Try opening the Right Sidebar tab via ctx.sidebarRight.openTab
    try {
      const sidebarRight =
        currentCtx?.sidebarRight || currentCtx?.get?.("sidebarRight");
      if (sidebarRight && typeof sidebarRight.openTab === "function") {
        sidebarRight.openTab(SIDEBAR_TAB_ID);
        return true;
      }
    } catch {
      // Fall through to full-viewport Studio Drawer Overlay (e.g. on New Session screen)
    }
    // 3. Open the built-in full-viewport Studio Drawer Overlay
    setOverlayOpen(!overlayOpenState);
    return true;
  }

  const { WorkbenchView, SidebarTabView, ComposerPill } =
    createMossWorkbenchComponents({
      React,
      syncStateToServer,
      insertIntoComposer,
      openWorkbenchTab,
    });

  function MossActivityBarIcon() {
    return h(
      "svg",
      {
        width: 16,
        height: 16,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.9,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
      },
      h("rect", { x: 3, y: 3, width: 18, height: 18, rx: 3 }),
      h("path", { d: "M3 11.5L21 8.5" }),
      h("path", { d: "M12 10L12 21" }),
      h("circle", { cx: 12, cy: 12, r: 1.6, fill: "currentColor" })
    );
  }

  return {
    inject: ["slots", "connection", "remote", "locale"],
    apply(ctx) {
      currentCtx = ctx;

      const isZh = () => {
        try {
          const lang = String(
            ctx.locale?.current?.() || ctx.locale?.lang || "zh"
          ).toLowerCase();
          return !lang.startsWith("en");
        } catch {
          return true;
        }
      };

      // 1. Register Full-Width Conversation View Tab ("MOSS 分镜台")
      ctx.slots.inject("conversation.view", () =>
        ctx.slots.register(
          {
            name: "conversation.view",
            id: VIEW_TAB_ID,
            order: 26,
            label: () => (isZh() ? "MOSS 分镜台" : "MOSS Layout"),
            // Slot inject is an optional callback, not a plugin dependency list.
            // No extra injected face is needed for this view.
          },
          (props) => {
            if (props?.openView) activeOpenView = props.openView;
            if (props?.inputActions) activeInputActions = props.inputActions;
            if (props?.sessionId) activeSessionId = props.sessionId;
            return h(WorkbenchView, { mode: "full" });
          }
        )
      );

      // 2. Register Right Sidebar Studio Tab ("MOSS 分镜拉框台")
      ctx.inject(["sidebarRightTabs"], (owner) => {
        const tabs = owner.get("sidebarRightTabs");
        tabs.register({
          id: SIDEBAR_TAB_ID,
          kind: SIDEBAR_TAB_ID,
          priority: "extension",
          title: () => (isZh() ? "MOSS 分镜拉框台" : "MOSS Workbench"),
          guide: () => ({
            icon: h(MossActivityBarIcon),
            title: isZh() ? "MOSS 异形分镜与拉框台" : "MOSS Layout Workbench",
            description: isZh()
              ? "一刀切分镜刀、四角变形斜框、气泡图章、手绘火柴人与 abs_centralized yxyx 坐标实时转换。"
              : "Split-Knife panel cutter, deformable quads, speech bubbles, sketch brush, and live abs_centralized yxyx coordinates.",
          }),
        });
        owner.slots.inject("sidebar.right.pane.tab", () =>
          owner.slots.register(
            {
              name: "sidebar.right.pane.tab",
              key: SIDEBAR_TAB_ID,
            },
            () => h(SidebarTabView || WorkbenchView, { mode: "sidebar", sidebar: true })
          )
        );
      });

      function ComposerPillWithDrawer() {
        const [open, setOpen] = React.useState(overlayOpenState);
        React.useEffect(() => {
          const listener = (v) => setOpen(v);
          overlayListeners.add(listener);
          return () => overlayListeners.delete(listener);
        }, []);
        React.useEffect(() => {
          if (!open) return;
          const onKey = (e) => {
            if (e.key === "Escape" && !e.defaultPrevented) {
              setOverlayOpen(false);
            }
          };
          window.addEventListener("keydown", onKey);
          return () => window.removeEventListener("keydown", onKey);
        }, [open]);

        return h(
          React.Fragment,
          null,
          h(ComposerPill),
          open
            ? h(
                "div",
                {
                  className: "moss-wb-drawer-backdrop",
                  style: {
                    position: "fixed",
                    inset: 0,
                    zIndex: 9998,
                    background: "rgba(2, 6, 23, 0.72)",
                    backdropFilter: "blur(6px)",
                    display: "flex",
                    flexDirection: "column",
                    padding: "16px 20px",
                  },
                  onClick: (e) => {
                    if (e.target === e.currentTarget) setOverlayOpen(false);
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      flex: 1,
                      minHeight: 0,
                      borderRadius: "14px",
                      overflow: "hidden",
                      border: "1px solid rgba(56, 189, 248, 0.28)",
                      boxShadow: "0 24px 64px rgba(0, 0, 0, 0.65)",
                      display: "flex",
                      flexDirection: "column",
                      position: "relative",
                      background: "var(--dsw-alias-bg-base, #0b1120)",
                    },
                  },
                  h(
                    "div",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 14px",
                        background: "rgba(15, 23, 42, 0.95)",
                        borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
                        fontSize: "12px",
                        color: "#e2e8f0",
                      },
                    },
                    h(
                      "span",
                      { style: { fontWeight: 600 } },
                      "🎨 MOSS 异形分镜与拉框工作台 · 悬浮全景窗（点击「✨ 插入提示词」将自动写回对话框并收起）"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => setOverlayOpen(false),
                        style: {
                          background: "rgba(244, 63, 94, 0.16)",
                          color: "#fda4af",
                          border: "1px solid rgba(244, 63, 94, 0.35)",
                          borderRadius: "6px",
                          padding: "3px 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        },
                      },
                      "✕ 收起工作台 (Esc)"
                    )
                  ),
                  h(
                    "div",
                    { style: { flex: 1, minHeight: 0, display: "flex" } },
                    h(WorkbenchView, { mode: "full" })
                  )
                )
              )
            : null
        );
      }

      // 3. Register Composer Quick-Action Pill ("▧ MOSS 分镜")
      if (ComposerPill) {
        ctx.slots.inject("conversation.input.right", () =>
          ctx.slots.register(
            {
              name: "conversation.input.right",
              id: "moss-workbench-pill",
              order: 48,
            },
            (props) => {
              if (props?.inputActions) activeInputActions = props.inputActions;
              if (props?.sessionId) activeSessionId = props.sessionId;
              return h(ComposerPillWithDrawer);
            }
          )
        );
      }
    },
  };
}


    return createClientPlugin(React);
  }
});
