import { useState, useMemo } from "react";
import { Tb } from "./toolbar-button";
import { I } from "./icons";
import { cn } from "@/lib/utils";

const SC = {
  kw: "#c678dd",
  str: "#98c379",
  cmt: "#8a8a9e",
  fn: "#61afef",
  num: "#d19a66",
  tp: "#e5c07b",
  op: "#56b6c2",
};

const KW = [
  "import", "export", "from", "const", "let", "var", "function", "return",
  "if", "else", "try", "catch", "throw", "new", "async", "await", "class",
  "interface", "type", "extends", "typeof", "void", "null", "true", "false",
  "default", "for", "while", "of", "in",
];

export function hlCode(code: string): React.ReactNode[] {
  let inBlockComment = false;

  return code.split("\n").map((line, li) => {
    const tokens: React.ReactNode[] = [];
    let rem = line;
    let tk = 0;

    if (inBlockComment) {
      const closeIdx = rem.indexOf("*/");
      if (closeIdx === -1) {
        tokens.push(<span key={tk++} style={{ color: SC.cmt, fontStyle: "italic" }}>{rem}</span>);
        rem = "";
      } else {
        tokens.push(<span key={tk++} style={{ color: SC.cmt, fontStyle: "italic" }}>{rem.slice(0, closeIdx + 2)}</span>);
        rem = rem.slice(closeIdx + 2);
        inBlockComment = false;
      }
    }

    while (rem.length > 0) {
      if (rem.startsWith("//")) {
        tokens.push(<span key={tk++} style={{ color: SC.cmt, fontStyle: "italic" }}>{rem}</span>);
        rem = "";
        continue;
      }
      if (rem.startsWith("/*")) {
        const closeIdx = rem.indexOf("*/", 2);
        if (closeIdx === -1) {
          tokens.push(<span key={tk++} style={{ color: SC.cmt, fontStyle: "italic" }}>{rem}</span>);
          inBlockComment = true;
          rem = "";
        } else {
          tokens.push(<span key={tk++} style={{ color: SC.cmt, fontStyle: "italic" }}>{rem.slice(0, closeIdx + 2)}</span>);
          rem = rem.slice(closeIdx + 2);
        }
        continue;
      }
      const sm = rem.match(/^(['"`])(?:(?!\1).)*\1/);
      if (sm) {
        tokens.push(<span key={tk++} style={{ color: SC.str }}>{sm[0]}</span>);
        rem = rem.slice(sm[0].length);
        continue;
      }
      const nm = rem.match(/^\b\d+(\.\d+)?\b/);
      if (nm) {
        tokens.push(<span key={tk++} style={{ color: SC.num }}>{nm[0]}</span>);
        rem = rem.slice(nm[0].length);
        continue;
      }
      const wm = rem.match(/^[a-zA-Z_$][\w$]*/);
      if (wm) {
        const w = wm[0];
        let c = "#abb2bf";
        if (KW.includes(w)) c = SC.kw;
        else if (/^[A-Z]/.test(w)) c = SC.tp;
        else if (rem.slice(w.length).match(/^\s*[({]/)) c = SC.fn;
        tokens.push(<span key={tk++} style={{ color: c }}>{w}</span>);
        rem = rem.slice(w.length);
        continue;
      }
      const om = rem.match(/^[=<>!&|+\-*/%.?:;,{}()[\]@#~^]/);
      if (om) {
        tokens.push(<span key={tk++} style={{ color: SC.op }}>{om[0]}</span>);
        rem = rem.slice(1);
        continue;
      }
      tokens.push(rem[0]);
      rem = rem.slice(1);
    }

    return (
      <div key={li} className="flex min-h-[1.5em]">
        <span className="text-[var(--text-dim)] select-none w-9 text-right pr-3.5 shrink-0 text-[0.85em]">
          {li + 1}
        </span>
        <span className="flex-1">{tokens}</span>
      </div>
    );
  });
}

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const lineCount = code.split("\n").length;

  const highlighted = useMemo(() => hlCode(code), [code]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-card rounded-[10px] my-2.5 overflow-hidden border border-border">
      <div
        className={cn(
          "flex justify-between items-center px-2.5 py-[5px] bg-[var(--surface-2)]",
          !collapsed && "border-b border-border",
        )}
      >
        <span className="text-xs font-semibold text-[var(--text-muted)] font-mono uppercase">
          {language || "code"}
        </span>
        <div className="flex gap-[1px]">
          {lineCount > 15 && (
            <Tb
              icon={collapsed ? I.expand : I.collapse}
              tip={collapsed ? "펼치기" : "접기"}
              onClick={() => setCollapsed(!collapsed)}
            />
          )}
          <Tb
            icon={copied ? I.check : I.copy}
            tip={copied ? "복사됨" : "복사"}
            act={copied}
            activeColor="var(--success)"
            onClick={handleCopy}
          />
        </div>
      </div>
      {!collapsed && (
        <pre className="m-0 px-1.5 py-2.5 overflow-auto text-sm leading-[1.5] font-mono max-h-[380px]">
          <code>{highlighted}</code>
        </pre>
      )}
    </div>
  );
}
