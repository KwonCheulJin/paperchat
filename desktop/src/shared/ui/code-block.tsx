import { useState } from "react";
import { Tb } from "./toolbar-button";
import { I } from "./icons";

const SC = {
  kw: "#c678dd",
  str: "#98c379",
  cmt: "#5c6370",
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

    // Continue block comment from previous line
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
      // Line comment
      if (rem.startsWith("//")) {
        tokens.push(<span key={tk++} style={{ color: SC.cmt, fontStyle: "italic" }}>{rem}</span>);
        rem = "";
        continue;
      }
      // Block comment start
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
      // String literal
      const sm = rem.match(/^(['"`])(?:(?!\1).)*\1/);
      if (sm) {
        tokens.push(<span key={tk++} style={{ color: SC.str }}>{sm[0]}</span>);
        rem = rem.slice(sm[0].length);
        continue;
      }
      // Number literal
      const nm = rem.match(/^\b\d+(\.\d+)?\b/);
      if (nm) {
        tokens.push(<span key={tk++} style={{ color: SC.num }}>{nm[0]}</span>);
        rem = rem.slice(nm[0].length);
        continue;
      }
      // Word (keyword / type / function / identifier)
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
      // Operator / punctuation
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
      <div key={li} style={{ display: "flex", minHeight: "1.5em" }}>
        <span
          style={{
            color: "var(--text-dim)",
            userSelect: "none",
            width: 36,
            textAlign: "right",
            paddingRight: 14,
            flexShrink: 0,
            fontSize: "0.85em",
          }}
        >
          {li + 1}
        </span>
        <span style={{ flex: 1 }}>{tokens}</span>
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

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: 10,
        margin: "10px 0",
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "5px 10px",
          background: "var(--surface-2)",
          borderBottom: collapsed ? "none" : "1px solid var(--border)",
        }}
      >
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "monospace",
            textTransform: "uppercase",
          }}
        >
          {language || "code"}
        </span>
        <div style={{ display: "flex", gap: 1 }}>
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
        <pre
          style={{
            margin: 0,
            padding: "10px 6px",
            overflow: "auto",
            fontSize: 13,
            lineHeight: 1.5,
            fontFamily: "monospace",
            maxHeight: 380,
          }}
        >
          <code>{hlCode(code)}</code>
        </pre>
      )}
    </div>
  );
}
