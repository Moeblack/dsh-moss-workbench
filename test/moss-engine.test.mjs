import test from "node:test";
import assert from "node:assert/strict";
import {
  screenRectToMossBbox,
  mossBboxToScreenRect,
  rectToPoints,
  getItemAABB,
  splitPolygonByLine,
  applyKnifeCutToState,
  snapRowYMin,
  normalizeVerticalChineseText,
  validateMossLayout,
  applyLintFix,
  compileMossBlueprint,
  parseMossJsonToState,
  resizeWorkbenchCanvas,
  MOSS_TEMPLATES,
  MOSS_ASPECT_RATIOS,
  canvasSizeFromRatioAndMegapixels,
  matchCanvasAspectRatio,
  createDefaultWorkbenchState,
} from "../src/core/moss-engine.js";

test("canvas size separates all requested aspect ratios from a free MP budget", () => {
  assert.deepEqual(MOSS_ASPECT_RATIOS.map(p => p.id), ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '1:2', '2:1', '9:19.5', '19.5:9', '9:21', '21:9']);
  for (const preset of MOSS_ASPECT_RATIOS) {
    assert.ok(preset.label.includes(preset.id));
    const size = canvasSizeFromRatioAndMegapixels(preset.width, preset.height, 1.5);
    assert.equal(size.width % 32, 0); assert.equal(size.height % 32, 0);
    assert.equal(matchCanvasAspectRatio(size.width, size.height).id, preset.id);
    const inverse = MOSS_ASPECT_RATIOS.find(p => Math.abs(p.width / p.height - preset.height / preset.width) < 1e-12);
    assert.equal(matchCanvasAspectRatio(size.height, size.width).id, inverse.id);
  }
  assert.deepEqual(canvasSizeFromRatioAndMegapixels(9, 19.5, 1.5), canvasSizeFromRatioAndMegapixels(6, 13, 1.5));
  assert.deepEqual(canvasSizeFromRatioAndMegapixels(19.5, 9, 1.5), canvasSizeFromRatioAndMegapixels(13, 6, 1.5));
  assert.equal(matchCanvasAspectRatio(1536, 1024).id, '3:2');
  assert.equal(matchCanvasAspectRatio(2500, 1000), undefined);
  assert.equal(matchCanvasAspectRatio(0, 1024), undefined);
  assert.deepEqual(canvasSizeFromRatioAndMegapixels(1, 1, 1.048576), { width: 1024, height: 1024 });
  assert.deepEqual(canvasSizeFromRatioAndMegapixels(16, 9, 2.0736), { width: 1920, height: 1088 });
  const landscape = canvasSizeFromRatioAndMegapixels(3, 2, 1.5);
  const portrait = canvasSizeFromRatioAndMegapixels(2, 3, 1.5);
  assert.deepEqual(portrait, { width: landscape.height, height: landscape.width });
  for (const [rw, rh, mp] of [[3, 2, 1], [2.39, 1, 1.6], [9, 21, .7]]) {
    const { width, height } = canvasSizeFromRatioAndMegapixels(rw, rh, mp);
    assert.equal(width % 32, 0);
    assert.equal(height % 32, 0);
    assert.ok(Math.abs(width - Math.sqrt(mp * 1e6 * rw / rh)) <= 16);
    assert.ok(Math.abs(height - Math.sqrt(mp * 1e6 * rh / rw)) <= 16);
  }
});

test("invalid sizing drafts cannot resize or silently clamp the canvas", () => {
  for (const args of [[0, 1, 1], [-1, 1, 1], ['', 1, 1], [1, Infinity, 1], [1, 1, 0], [1, 1, NaN], [1000, 1, 1], [1, 1, 100], [1, 1, .00001]]) {
    assert.throws(() => canvasSizeFromRatioAndMegapixels(...args));
  }
});

test("cleared or unspecified palettes stay unconstrained through compile and import", () => {
  for (const palette of [[], undefined]) {
    const state = { canvasWidth: 1024, canvasHeight: 1024, items: [], palette };
    const compiled = compileMossBlueprint(state);
    assert.deepEqual(compiled.mossJson.summary.palette, []);
    const imported = parseMossJsonToState(compiled.mossJsonString, 1024, 1024);
    assert.deepEqual(imported.palette, []);
    assert.deepEqual(compileMossBlueprint(imported).mossJson.summary.palette, []);
  }
  const unspecified = parseMossJsonToState({ summary: {}, items: [] }, 1024, 1024);
  assert.deepEqual(unspecified.palette, []);
  const chosen = ["#123456", "#abcdef"];
  assert.deepEqual(compileMossBlueprint({ palette: chosen, items: [] }).mossJson.summary.palette, chosen);
});

test("new workbenches are blank and optional style hints stay empty", () => {
  const state = createDefaultWorkbenchState();
  assert.deepEqual(state.items, []);
  assert.deepEqual(state.palette, []);
  assert.deepEqual(state.meta, []);
  assert.equal(state.globalCaption, "");
  for (const meta of [[], undefined]) {
    const compiled = compileMossBlueprint({ items: [], meta });
    assert.deepEqual(compiled.mossJson.summary.meta, []);
    assert.deepEqual(parseMossJsonToState(compiled.mossJsonString).meta, []);
  }
});

test("screenRectToMossBbox converts top-left screen coords to abs_centralized yxyx", () => {
  // Full 1024x1536 canvas -> [-768, -512, 768, 512]
  assert.deepEqual(screenRectToMossBbox(0, 0, 1024, 1536, 1024, 1536), [
    -768, -512, 768, 512,
  ]);
  // Top-left quadrant (0..512, 0..768) -> [-768, -512, 0, 0]
  assert.deepEqual(screenRectToMossBbox(0, 0, 512, 768, 1024, 1536), [
    -768, -512, 0, 0,
  ]);
  // Round-trip via mossBboxToScreenRect
  const rect = mossBboxToScreenRect([-700, -450, -100, 300], 1024, 1536);
  assert.equal(rect.xMin, 62);
  assert.equal(rect.yMin, 68);
  assert.equal(rect.xMax, 812);
  assert.equal(rect.yMax, 668);
});

test("splitPolygonByLine slices a rectangle across a diagonal line with gutter", () => {
  const poly = rectToPoints(0, 0, 1000, 1500);
  const res = splitPolygonByLine(
    poly,
    { x: -50, y: 700 },
    { x: 1050, y: 800 },
    16
  );
  assert.equal(res.didSplit, true);
  assert.equal(res.polygons.length, 2);
  assert.ok(res.polygons[0].length >= 4);
  assert.ok(res.polygons[1].length >= 4);
});

test("applyKnifeCutToState slices empty canvas or existing panel into two split-panels", () => {
  const initial = {
    canvasWidth: 1024,
    canvasHeight: 1536,
    gutterWidth: 16,
    items: [],
    strokes: [],
  };
  const afterFirstCut = applyKnifeCutToState(
    initial,
    { x: 0, y: 500 },
    { x: 1024, y: 560 },
    { gutterWidth: 16 }
  );
  assert.equal(afterFirstCut.items.length, 2);
  assert.equal(afterFirstCut.items[0].label, "panel");
  assert.equal(afterFirstCut.items[1].label, "panel");
});

test("normalizeVerticalChineseText converts Arabic digits and strips CJK spaces", () => {
  assert.equal(
    normalizeVerticalChineseText("一共 720 元，28 号见"),
    "一共七百二十元，二十八号见"
  );
  assert.equal(normalizeVerticalChineseText("林 晚 舟"), "林晚舟");
});

test("snapRowYMin aligns side-by-side panels within threshold", () => {
  const state = {
    canvasWidth: 1024,
    canvasHeight: 1536,
    items: [
      { id: "left", label: "character", points: rectToPoints(30, 900, 440, 500) },
      { id: "right", label: "character", points: rectToPoints(520, 910, 440, 500) },
    ],
  };
  const snapped = snapRowYMin(state, 1024, 1536, 18);
  const b1 = getItemAABB(snapped.items[0], 1024, 1536);
  const b2 = getItemAABB(snapped.items[1], 1024, 1536);
  assert.equal(b1.mossBbox[0], b2.mossBbox[0]);
});

test("compileMossBlueprint and parseMossJsonToState round-trip MOSS JSON", () => {
  const tplState = MOSS_TEMPLATES[0].createState();
  const compiled = compileMossBlueprint(tplState);
  assert.equal(compiled.mossJson.bbox_coord_space, "abs_centralized");
  assert.equal(compiled.mossJson.bbox_format, "yxyx");
  assert.ok(compiled.mossJson.items.length >= 4);
  for (const item of compiled.mossJson.items) {
    assert.equal(item.bbox.length, 4);
    assert.ok(item.bbox[0] < item.bbox[2]);
    assert.ok(item.bbox[1] < item.bbox[3]);
  }
  const roundTripped = parseMossJsonToState(compiled.mossJsonString, 1024, 1536);
  assert.equal(roundTripped.items.length, compiled.mossJson.items.length);
});

test("validateMossLayout detects and fixes lint issues", () => {
  const state = {
    canvasWidth: 1024,
    canvasHeight: 1536,
    items: [
      {
        id: "b1",
        label: "text",
        points: rectToPoints(100, 100, 180, 260),
        text: "这件装备要 720 元，总共超过了十五个字的台词长度测试！",
        noteZh: "台词",
      },
    ],
  };
  const warnings = validateMossLayout(state);
  assert.ok(warnings.some((w) => w.code === "ARABIC_DIGITS_IN_BUBBLE"));
  assert.ok(warnings.some((w) => w.code === "LONG_BUBBLE_TOO_NARROW"));
  let fixed = state;
  for (const w of warnings) {
    if (w.fixAction) fixed = applyLintFix(fixed, w.fixAction);
  }
  assert.ok(fixed.items[0].text.includes("七百二十"));
  assert.ok(getItemAABB(fixed.items[0], 1024, 1536).width >= 220);
});

test("resizeWorkbenchCanvas proportionally scales all boxes and preserves relative yxyx ratios", () => {
  const state = {
    canvasWidth: 1536,
    canvasHeight: 1024,
    items: [
      {
        id: "hero",
        label: "character",
        noteZh: "男主上半身，依靠在栏杆上",
        points: rectToPoints(194 + 768, -423 + 512, 768 - 194, 512 - -423),
      },
    ],
    strokes: [],
  };
  const beforeBbox = getItemAABB(state.items[0], 1536, 1024).mossBbox;
  assert.deepEqual(beforeBbox, [-423, 194, 512, 768]);

  const resized = resizeWorkbenchCanvas(state, 960, 640, { scaleItems: true });
  assert.equal(resized.canvasWidth, 960);
  assert.equal(resized.canvasHeight, 640);
  const afterBbox = getItemAABB(resized.items[0], 960, 640).mossBbox;
  assert.deepEqual(afterBbox, [-264, 121, 320, 480]);
});

