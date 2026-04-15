import { CodeBlock } from "./code-block";

/** 인라인 포맷 파싱: **bold**, `code` */
export function parseInline(t: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let rem = t;
  let k = 0;

  while (rem.length > 0) {
    const bm = rem.match(/\*\*(.+?)\*\*/);
    const cm = rem.match(/`([^`]+)`/);
    let fm: { t: "b" | "c"; m: RegExpMatchArray } | null = null;
    let fmIdx = Infinity;

    if (bm) {
      const idx = rem.indexOf(bm[0]);
      if (idx < fmIdx) { fmIdx = idx; fm = { t: "b", m: bm }; }
    }
    if (cm) {
      const idx = rem.indexOf(cm[0]);
      if (idx < fmIdx) { fmIdx = idx; fm = { t: "c", m: cm }; }
    }

    if (!fm) {
      parts.push(rem);
      break;
    }

    if (fmIdx > 0) parts.push(rem.slice(0, fmIdx));

    if (fm.t === "b") {
      parts.push(
        <strong key={k++} style={{ color: "#e4e4e7", fontWeight: 600 }}>
          {fm.m[1]}
        </strong>
      );
    } else {
      parts.push(
        <code
          key={k++}
          style={{
            background: "rgba(113,113,122,0.15)",
            color: "#a1a1aa",
            padding: "2px 6px",
            borderRadius: 4,
            fontSize: "0.88em",
            fontFamily: "monospace",
          }}
        >
          {fm.m[1]}
        </code>
      );
    }
    rem = rem.slice(fmIdx + fm.m[0].length);
  }

  return parts;
}

function MdTable({ lines }: { lines: string[] }) {
  const rows = lines.map((l) =>
    l
      .split("|")
      .filter((_, i, a) => i > 0 && i < a.length - 1)
      .map((c) => c.trim())
  );
  const [header, , ...body] = rows;
  return (
    <div style={{ overflowX: "auto", margin: "10px 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {header?.map((h, i) => (
              <th
                key={i}
                style={{
                  padding: "8px 12px",
                  textAlign: "left",
                  borderBottom: "1px solid #27272a",
                  color: "#a1a1aa",
                  fontWeight: 600,
                  background: "#1f1f23",
                  whiteSpace: "nowrap",
                }}
              >
                {parseInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: "7px 12px", color: "#d4d4d8" }}>
                  {parseInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const el: React.ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const L = lines[i];

    // Fenced code block
    if (L.startsWith("```")) {
      const lang = L.slice(3).trim();
      const cl: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        cl.push(lines[i]);
        i++;
      }
      i++;
      el.push(<CodeBlock key={k++} language={lang} code={cl.join("\n")} />);
      continue;
    }

    // Headings
    const hm = L.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      const sz: Record<number, number> = { 1: 18, 2: 16, 3: 14 };
      el.push(
        <div
          key={k++}
          style={{ fontSize: sz[hm[1].length], fontWeight: 700, color: "#d4d4d8", margin: "14px 0 6px" }}
        >
          {parseInline(hm[2])}
        </div>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(L.trim())) {
      el.push(
        <hr
          key={k++}
          style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", margin: "14px 0" }}
        />
      );
      i++;
      continue;
    }

    // Blockquote
    if (L.startsWith(">")) {
      const ql: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        ql.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      el.push(
        <div
          key={k++}
          style={{
            borderLeft: "3px solid #52525b",
            margin: "10px 0",
            color: "#a1a1aa",
            background: "rgba(255,255,255,0.02)",
            padding: "10px 14px",
            borderRadius: "0 8px 8px 0",
          }}
        >
          {ql.map((q, qi) => (
            <div key={qi} style={{ lineHeight: 1.7 }}>
              {parseInline(q)}
            </div>
          ))}
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(L.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s/, ""));
        i++;
      }
      el.push(
        <ul key={k++} style={{ margin: "8px 0", paddingLeft: 18, listStyle: "none" }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ position: "relative", paddingLeft: 14, marginBottom: 3, lineHeight: 1.7 }}>
              <span style={{ position: "absolute", left: 0, color: "#71717a" }}>•</span>
              {parseInline(it)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(L.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      el.push(
        <ol key={k++} style={{ margin: "8px 0", paddingLeft: 4, listStyle: "none" }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ display: "flex", gap: 10, marginBottom: 3, lineHeight: 1.7 }}>
              <span style={{ color: "#71717a", fontWeight: 600, fontSize: 13, minWidth: 18 }}>
                {ii + 1}.
              </span>
              <span>{parseInline(it)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Table
    if (L.includes("|") && L.trim().startsWith("|")) {
      const tl: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        tl.push(lines[i]);
        i++;
      }
      if (tl.length >= 2) {
        el.push(<MdTable key={k++} lines={tl} />);
        continue;
      }
    }

    // Empty line
    if (L.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    el.push(
      <p key={k++} style={{ margin: "5px 0", lineHeight: 1.7 }}>
        {parseInline(L)}
      </p>
    );
    i++;
  }

  return el;
}

// 하위 호환 alias
export { parseInline as pI };
