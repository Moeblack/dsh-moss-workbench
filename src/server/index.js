import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  MOSS_RESOLUTIONS,
  MOSS_BUBBLE_STYLES,
  MOSS_TEMPLATES,
  createDefaultWorkbenchState,
  getItemAABB,
  describeShapeGeometry,
  compileMossBlueprint,
  parseMossJsonToState,
  validateMossLayout,
  applyLintFix,
  snapRowYMin,
  mossBboxToScreenRect,
  rectToPoints,
  resizeWorkbenchCanvas,
} from "../core/moss-engine.js";

export const STATE_ROUTE = "/plugins/dsh-moss-workbench/state";
export const ACTION_ROUTE = "/plugins/dsh-moss-workbench/action";
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

export const name = "dsh-moss-workbench";
export const inject = ["tools", "attachments", "webServer"];

export function apply(ctx) {
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
        const prevItems = Array.isArray(nextState.items) ? nextState.items : [];
        nextState.items = args.items.map((raw, idx) => {
          const prev = prevItems[idx] && prevItems[idx].label === (raw.label || "character") ? prevItems[idx] : null;
          const bbox = Array.isArray(raw.bbox) && raw.bbox.length >= 4 ? raw.bbox : [-200, -200, 200, 200];
          const rect = mossBboxToScreenRect(bbox, w, h);
          return {
            ...(prev || {}),
            id: prev?.id || `item_${Date.now()}_${idx + 1}`,
            label: raw.label || "character",
            shapeType: prev?.shapeType || (raw.label === "text" ? "bubble" : "rect"),
            points: rectToPoints(rect.xMin, rect.yMin, rect.width, rect.height),
            roleTag: raw.roleTag || prev?.roleTag || `${raw.label}#${idx + 1}`,
            noteZh: raw.noteZh ?? prev?.noteZh ?? "",
            caption: raw.caption ?? prev?.caption ?? "",
            text: raw.text ?? prev?.text ?? "",
            bubbleStyle: raw.bubbleStyle || prev?.bubbleStyle || "oval",
            tailPoint: prev?.tailPoint || null,
            speakerItemId: prev?.speakerItemId || null,
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
