import { CodeBlock } from "./code-block";

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
        <strong key={k++} className="text-foreground font-semibold">
          {fm.m[1]}
        </strong>
      );
    } else {
      parts.push(
        <code
          key={k++}
          className="bg-[color-mix(in_oklch,var(--text-muted)_15%,transparent)] text-[var(--text-secondary)] px-[6px] py-[2px] rounded-[4px] text-[0.88em] font-mono"
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
    <div className="overflow-x-auto my-[10px]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {header?.map((h, i) => (
              <th
                key={i}
                className="px-[12px] py-2 text-left border-b border-border text-[var(--text-secondary)] font-semibold bg-[var(--surface-2)] whitespace-nowrap"
              >
                {parseInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-white/[.04]">
              {row.map((cell, ci) => (
                <td key={ci} className="px-[12px] py-[7px] text-foreground">
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

    const hm = L.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      const sz: Record<number, number> = { 1: 18, 2: 16, 3: 14 };
      el.push(
        <div
          key={k++}
          className="font-bold text-foreground mt-[14px] mb-[6px]"
          style={{ fontSize: sz[hm[1].length] }}
        >
          {parseInline(hm[2])}
        </div>
      );
      i++;
      continue;
    }

    if (/^---+$/.test(L.trim())) {
      el.push(
        <hr key={k++} className="border-none border-t border-white/[.06] my-[14px]" />
      );
      i++;
      continue;
    }

    if (L.startsWith(">")) {
      const ql: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        ql.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      el.push(
        <div
          key={k++}
          className="my-[10px] text-[var(--text-secondary)] bg-primary/5 px-[14px] py-[10px] rounded-lg border border-primary/15"
        >
          {ql.map((q, qi) => (
            <div key={qi} className="leading-[1.7]">
              {parseInline(q)}
            </div>
          ))}
        </div>
      );
      continue;
    }

    if (/^[-*]\s/.test(L.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s/, ""));
        i++;
      }
      el.push(
        <ul key={k++} className="my-2 pl-[18px] list-none">
          {items.map((it, ii) => (
            <li key={ii} className="relative pl-[14px] mb-[3px] leading-[1.7]">
              <span className="absolute left-0 text-[var(--text-muted)]">•</span>
              {parseInline(it)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(L.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      el.push(
        <ol key={k++} className="my-2 pl-1 list-none">
          {items.map((it, ii) => (
            <li key={ii} className="flex gap-[10px] mb-[3px] leading-[1.7]">
              <span className="text-[var(--text-muted)] font-semibold text-[13px] min-w-[18px]">
                {ii + 1}.
              </span>
              <span>{parseInline(it)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

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

    if (L.trim() === "") {
      i++;
      continue;
    }

    el.push(
      <p key={k++} className="my-[5px] leading-[1.7]">
        {parseInline(L)}
      </p>
    );
    i++;
  }

  return el;
}

export { parseInline as pI };
