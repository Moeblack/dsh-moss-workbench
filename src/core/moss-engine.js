// Core MOSS-Image Geometry, Split-Knife Polygon Clipper, Linter & Prompt Compiler Engine
// Pure ES module (zero Node/DOM dependencies) shared by Host Server & Browser Client.
export * from './moss-3d.js';

export const MOSS_LOCKED_NEGATIVE_PROMPT =
  "<|texture_and_style_neg|>, <|age_and_body_neg|>, <|universal_anatomy_neg|>";

export const MOSS_RESOLUTIONS = [
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
export const MOSS_ASPECT_RATIOS = [
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

export function matchCanvasAspectRatio(width, height) {
  if (!(width > 0 && height > 0)) return undefined;
  // Independent rounding to 32px may move either axis by up to 16px.
  return MOSS_ASPECT_RATIOS.filter(p => Math.abs(width * p.height - height * p.width) / (p.width + p.height) <= 16.000001)
    .sort((a, b) => Math.abs(Math.log(width / height / (a.width / a.height))) - Math.abs(Math.log(width / height / (b.width / b.height))))[0];
}

export function canvasSizeFromRatioAndMegapixels(ratioWidth, ratioHeight, megapixels) {
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

export const MOSS_META_PRESETS = [
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

export const MOSS_PALETTE_PRESETS = [
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

export const MOSS_BUBBLE_STYLES = [
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

export const MOSS_QUICK_TAGS = {
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

export function rectToPoints(x, y, width, height) {
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

export function screenRectToMossBbox(
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

export function mossBboxToScreenRect(
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

export function resizeWorkbenchCanvas(
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

export function pointsToAABB(points = []) {
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

export function getItemAABB(item, canvasWidth = 1024, canvasHeight = 1536) {
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
export function simplifyPolyline(points = [], tolerance = 3) {
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

export function describeShapeGeometry(item, canvasWidth = 1024, canvasHeight = 1536) {
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

export function splitPolygonByLine(
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

export function applyKnifeCutToState(
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

export function snapRowYMin(
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

export function numberToChinese(numStr) {
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

export function normalizeVerticalChineseText(text = "") {
  if (!text) return "";
  let out = String(text);
  // Convert Arabic numbers to Chinese numerals
  out = out.replace(/\d+/g, (m) => numberToChinese(m));
  // Remove spaces between CJK characters
  out = out.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, "$1$2");
  out = out.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, "$1$2");
  return out.trim();
}

export function validateMossLayout(state) {
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

export function applyLintFix(state, fixAction) {
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

export function compileMossBlueprint(state) {
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

export function parseMossJsonToState(
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

export const MOSS_TEMPLATES = [
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

export function createDefaultWorkbenchState() {
  return MOSS_TEMPLATES.find(template => template.id === "blank-canvas").createState();
}

