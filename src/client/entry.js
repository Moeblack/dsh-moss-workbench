import { createMossWorkbenchComponents } from "./workbench-app.js";

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

export function createClientPlugin(React) {
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
