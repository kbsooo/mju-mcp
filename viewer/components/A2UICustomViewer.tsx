// 순수 React 서버 컴포넌트 – A2UI JSON → 커스텀 아름다운 UI
// Lit / @a2ui/react 렌더러 불필요. 의존성 0.
import type { Types } from "@a2ui/react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Comp = Record<string, any>;

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function parseMessages(messages: Types.ServerToClientMessage[]) {
  const map = new Map<string, Comp>();
  let rootId: string | null = null;
  for (const msg of messages) {
    if (msg.beginRendering) rootId = msg.beginRendering.root;
    if (msg.surfaceUpdate)
      for (const c of msg.surfaceUpdate.components) map.set(c.id, c.component as Comp);
  }
  return { map, rootId };
}

const tv = (t: unknown): string => {
  if (!t || typeof t !== "object") return "";
  const o = t as Record<string, unknown>;
  return String(o.literalString ?? o.literal ?? "");
};

const kids = (children: unknown): string[] => {
  if (!children || typeof children !== "object") return [];
  const list = (children as Record<string, unknown>).explicitList;
  return Array.isArray(list) ? (list as string[]) : [];
};

/* ── Context ─────────────────────────────────────────────────────────────── */
type Ctx = "root" | "card" | "list";

/* ── Node renderer ───────────────────────────────────────────────────────── */
function N({ id, map, ctx = "root" }: { id: string; map: Map<string, Comp>; ctx?: Ctx }) {
  const c = map.get(id);
  if (!c) return null;

  /* Text */
  if ("Text" in c && c.Text) {
    const v = tv(c.Text.text);
    const h = c.Text.usageHint;

    if (h === "h1")
      return (
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">
          {v}
        </h1>
      );
    if (h === "h2")
      return <h2 className="text-[18px] font-semibold text-slate-800 leading-snug">{v}</h2>;
    if (h === "h3")
      return (
        <h3 className="text-[15px] font-semibold text-slate-800 leading-snug tracking-[-0.01em]">
          {v}
        </h3>
      );
    if (h === "h4" || h === "h5")
      return <h4 className="text-[14px] font-medium text-slate-700">{v}</h4>;
    if (h === "caption")
      return <p className="text-[12px] text-slate-400 font-normal">{v}</p>;
    // body
    if (ctx === "list")
      return (
        <p className="text-[14px] text-slate-600 leading-relaxed">{v}</p>
      );
    if (ctx === "root")
      return <p className="text-[14px] text-slate-500">{v}</p>;
    return <p className="text-[13px] text-slate-500 leading-snug">{v}</p>;
  }

  /* Divider */
  if ("Divider" in c)
    return <div className="h-px bg-slate-100 rounded-full" />;

  /* Card */
  if ("Card" in c && c.Card)
    return (
      <div
        className="bg-white rounded-[20px] overflow-hidden border border-black/[0.04]"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)" }}
      >
        {c.Card.child && <N id={c.Card.child} map={map} ctx="card" />}
      </div>
    );

  /* Column */
  if ("Column" in c && c.Column) {
    const ch = kids(c.Column.children);
    if (ctx === "card")
      return (
        <div className="flex flex-col gap-[10px] p-[18px]">
          {ch.map((cid) => (
            <N key={cid} id={cid} map={map} ctx="root" />
          ))}
        </div>
      );
    // root column: first items are "header", rest are cards
    return (
      <div className="flex flex-col gap-3">
        {ch.map((cid) => (
          <N key={cid} id={cid} map={map} ctx="root" />
        ))}
      </div>
    );
  }

  /* Row */
  if ("Row" in c && c.Row) {
    const ch = kids(c.Row.children);
    return (
      <div className="flex flex-row flex-wrap items-center gap-3">
        {ch.map((cid) => (
          <N key={cid} id={cid} map={map} ctx={ctx} />
        ))}
      </div>
    );
  }

  /* List */
  if ("List" in c && c.List) {
    const ch = kids(c.List.children);
    if (c.List.direction === "horizontal")
      return (
        <div className="flex flex-row gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {ch.map((cid) => (
            <N key={cid} id={cid} map={map} ctx="card" />
          ))}
        </div>
      );
    return (
      <div className="flex flex-col">
        {ch.map((cid, i) => (
          <div
            key={cid}
            className={`py-[11px] ${i > 0 ? "border-t border-slate-50" : ""}`}
          >
            <N id={cid} map={map} ctx="list" />
          </div>
        ))}
      </div>
    );
  }

  return null;
}

/* ── Page shell ──────────────────────────────────────────────────────────── */
export default function A2UICustomViewer({
  messages,
}: {
  messages: Types.ServerToClientMessage[];
}) {
  const { map, rootId } = parseMessages(messages);

  if (!rootId)
    return (
      <div className="flex items-center justify-center min-h-dvh bg-slate-50">
        <p className="text-slate-400 text-sm">내용 없음</p>
      </div>
    );

  return (
    <div
      className="min-h-dvh bg-slate-50"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      {/* 상단 그라데이션 헤더 배경 */}
      <div
        className="absolute inset-x-0 top-0 h-48 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(99,102,241,0.08) 0%, rgba(248,250,252,0) 100%)",
        }}
        aria-hidden
      />

      <div className="relative max-w-[500px] mx-auto px-4 pt-8 pb-16">
        <N id={rootId} map={map} />
      </div>
    </div>
  );
}
