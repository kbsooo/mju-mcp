// 순수 React 서버 컴포넌트 — A2UI JSON → 프로 디자인 UI
// No Lit / No @a2ui renderer / No client JS
import type { Types } from "@a2ui/react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Comp = Record<string, any>;

/* ─────────────────────────────────────────────────────────────
   Parsing helpers
───────────────────────────────────────────────────────────── */
function parseMessages(messages: Types.ServerToClientMessage[]) {
  const map = new Map<string, Comp>();
  let rootId: string | null = null;
  for (const msg of messages) {
    if (msg.beginRendering) rootId = msg.beginRendering.root;
    if (msg.surfaceUpdate)
      for (const c of msg.surfaceUpdate.components)
        map.set(c.id, c.component as Comp);
  }
  return { map, rootId };
}

const tv = (t: unknown): string => {
  if (!t || typeof t !== "object") return "";
  const o = t as Record<string, unknown>;
  return String(o.literalString ?? o.literal ?? "");
};

const kids = (c: unknown): string[] => {
  if (!c || typeof c !== "object") return [];
  const l = (c as Record<string, unknown>).explicitList;
  return Array.isArray(l) ? (l as string[]) : [];
};

/* ─────────────────────────────────────────────────────────────
   Smart content parsers — emoji → CSS visual
───────────────────────────────────────────────────────────── */
const STATUS_MAP: Record<string, { fg: string; bg: string; label: string }> = {
  "🟢": { fg: "#15803d", bg: "#dcfce7", label: "출석" },
  "🔴": { fg: "#b91c1c", bg: "#fee2e2", label: "결석" },
  "🟡": { fg: "#a16207", bg: "#fef9c3", label: "지각" },
  "🟠": { fg: "#c2410c", bg: "#ffedd5", label: "조퇴" },
  "⚪": { fg: "#64748b", bg: "#f1f5f9", label: "휴강" },
  "❓": { fg: "#64748b", bg: "#f1f5f9", label: "미확인" },
  "🔵": { fg: "#1e40af", bg: "#dbeafe", label: "안읽음" },
  "📎": { fg: "#7c3aed", bg: "#ede9fe", label: "첨부" },
};

// "🟢 출석 5  🟡 지각 0  🔴 결석 0  🟠 조퇴 0" → parsed chips
type StatChip = { emoji: string; label: string; count: number };
function parseStats(text: string): StatChip[] | null {
  const rx = /([🟢🟡🔴🟠⚪❓])\s*([\wㄱ-ㅎ가-힣]+)\s+(\d+)/gu;
  const hits = [...text.matchAll(rx)];
  if (hits.length < 2) return null;
  return hits.map((m) => ({
    emoji: m[1],
    label: m[2],
    count: parseInt(m[3]),
  }));
}

// "🟢 2026/03/04(수) 출석" → { emoji, date, status }
type SessionRow = { emoji: string; date: string; status: string };
function parseSession(text: string): SessionRow | null {
  const m = text.match(/^([🟢🟡🔴🟠⚪❓🔵📎])\s+(.+?)\s{2,}(.+)$/u);
  if (m) return { emoji: m[1], date: m[2].trim(), status: m[3].trim() };
  const m2 = text.match(/^([🟢🟡🔴🟠⚪❓🔵📎])\s+(.+)$/u);
  if (m2) return { emoji: m2[1], date: m2[2].trim(), status: "" };
  return null;
}

/* ─────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────── */
function StatChips({ chips }: { chips: StatChip[] }) {
  const total = chips.reduce((s, c) => s + c.count, 0);
  const attended = chips.find((c) => c.emoji === "🟢")?.count ?? 0;
  const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
  const rateColor =
    rate >= 90 ? "#15803d" : rate >= 75 ? "#a16207" : "#b91c1c";

  return (
    <div className="flex flex-col gap-3">
      {/* Chips row */}
      <div className="flex flex-row flex-wrap gap-[6px]">
        {chips.map((chip) => {
          const s = STATUS_MAP[chip.emoji] ?? STATUS_MAP["❓"];
          const isZero = chip.count === 0;
          return (
            <span
              key={chip.emoji}
              style={{
                backgroundColor: isZero ? "#f8fafc" : s.bg,
                color: isZero ? "#94a3b8" : s.fg,
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 99,
                letterSpacing: "0.01em",
                border: `1px solid ${isZero ? "#e2e8f0" : s.bg}`,
              }}
            >
              {chip.label}&nbsp;
              <span style={{ fontWeight: 700 }}>{chip.count}</span>
            </span>
          );
        })}
      </div>
      {/* Attendance rate bar */}
      {total > 0 && (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 rounded-full overflow-hidden"
            style={{ height: 4, backgroundColor: "#f1f5f9" }}
          >
            <div
              style={{
                width: `${rate}%`,
                height: "100%",
                backgroundColor: rateColor,
                borderRadius: 99,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: rateColor,
              minWidth: 32,
              textAlign: "right",
            }}
          >
            {rate}%
          </span>
        </div>
      )}
    </div>
  );
}

function SessionItem({ row }: { row: SessionRow }) {
  const s = STATUS_MAP[row.emoji] ?? STATUS_MAP["❓"];
  return (
    <div className="flex items-center justify-between gap-3 py-[2px]">
      <span
        style={{
          fontSize: 14,
          color: "#475569",
          fontWeight: 400,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {row.date}
      </span>
      {row.status && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: s.fg,
            backgroundColor: s.bg,
            padding: "3px 9px",
            borderRadius: 99,
            whiteSpace: "nowrap",
          }}
        >
          {row.status}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Node renderer
───────────────────────────────────────────────────────────── */
type Ctx = "root" | "card" | "list";

function N({ id, map, ctx = "root" }: { id: string; map: Map<string, Comp>; ctx?: Ctx }) {
  const c = map.get(id);
  if (!c) return null;

  /* ── Text ───────────────────────────────────────────────── */
  if ("Text" in c && c.Text) {
    const v = tv(c.Text.text);
    const h = c.Text.usageHint;

    if (h === "h1")
      return (
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color: "#0f172a",
            margin: 0,
          }}
        >
          {v}
        </h1>
      );

    if (h === "h2" || h === "h3")
      return (
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.35,
            letterSpacing: "-0.01em",
            color: "#0f172a",
            margin: 0,
          }}
        >
          {v}
        </h3>
      );

    if (h === "h4" || h === "h5")
      return (
        <h4 style={{ fontSize: 14, fontWeight: 600, color: "#334155", margin: 0 }}>
          {v}
        </h4>
      );

    if (h === "caption")
      return (
        <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, fontWeight: 400 }}>
          {v}
        </p>
      );

    // Body text — smart detect
    if (ctx === "list") {
      const session = parseSession(v);
      if (session) return <SessionItem row={session} />;
      return <p style={{ fontSize: 14, color: "#475569", margin: 0, lineHeight: 1.5 }}>{v}</p>;
    }

    if (ctx === "card") {
      const stats = parseStats(v);
      if (stats) return <StatChips chips={stats} />;
      return <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>{v}</p>;
    }

    // root — subtitle etc.
    return (
      <p
        style={{
          fontSize: 14,
          color: "#64748b",
          margin: 0,
          lineHeight: 1.5,
          fontWeight: 400,
        }}
      >
        {v}
      </p>
    );
  }

  /* ── Divider ────────────────────────────────────────────── */
  if ("Divider" in c)
    return (
      <div
        style={{
          height: 1,
          backgroundColor: "#f1f5f9",
          marginTop: 2,
          marginBottom: 2,
        }}
      />
    );

  /* ── Card ───────────────────────────────────────────────── */
  if ("Card" in c && c.Card)
    return (
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: 20,
          border: "1px solid rgba(0,0,0,0.05)",
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        {c.Card.child && <N id={c.Card.child} map={map} ctx="card" />}
      </div>
    );

  /* ── Column ─────────────────────────────────────────────── */
  if ("Column" in c && c.Column) {
    const ch = kids(c.Column.children);

    if (ctx === "card")
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 20px 16px" }}>
          {ch.map((cid) => (
            <N key={cid} id={cid} map={map} ctx="card" />
          ))}
        </div>
      );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ch.map((cid) => (
          <N key={cid} id={cid} map={map} ctx="root" />
        ))}
      </div>
    );
  }

  /* ── Row ────────────────────────────────────────────────── */
  if ("Row" in c && c.Row) {
    const ch = kids(c.Row.children);
    return (
      <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {ch.map((cid) => (
          <N key={cid} id={cid} map={map} ctx={ctx} />
        ))}
      </div>
    );
  }

  /* ── List ───────────────────────────────────────────────── */
  if ("List" in c && c.List) {
    const ch = kids(c.List.children);

    if (c.List.direction === "horizontal")
      return (
        <div style={{ display: "flex", flexDirection: "row", gap: 8, overflowX: "auto" }}>
          {ch.map((cid) => (
            <N key={cid} id={cid} map={map} ctx="card" />
          ))}
        </div>
      );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {ch.map((cid, i) => (
          <div
            key={cid}
            style={{
              paddingTop: 11,
              paddingBottom: 11,
              borderTop: i > 0 ? "1px solid #f8fafc" : "none",
            }}
          >
            <N id={cid} map={map} ctx="list" />
          </div>
        ))}
      </div>
    );
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────
   Page shell
───────────────────────────────────────────────────────────── */
export default function A2UICustomViewer({
  messages,
}: {
  messages: Types.ServerToClientMessage[];
}) {
  const { map, rootId } = parseMessages(messages);

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "#f8fafc",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Pretendard', 'Segoe UI', Roboto, sans-serif",
        WebkitFontSmoothing: "antialiased" as const,
        MozOsxFontSmoothing: "grayscale" as const,
      }}
    >
      {/* 헤더 배경 — 아주 연한 인디고 그라데이션 */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 80% 40% at 50% -5%, rgba(99,102,241,0.10) 0%, transparent 70%)",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 480,
          margin: "0 auto",
          padding: "32px 16px 60px",
        }}
      >
        {rootId ? (
          <N id={rootId} map={map} />
        ) : (
          <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            내용 없음
          </p>
        )}
      </div>
    </div>
  );
}
