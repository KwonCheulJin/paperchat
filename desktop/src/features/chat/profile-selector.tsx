import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../../store/chat";
import { I } from "../../shared/ui/icons";
import { PROFILES } from "../../shared/profiles";
import { cn } from "@/lib/utils";

export default function ProfileSelector() {
  const { profile, setProfile } = useChatStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = PROFILES.find((p) => p.value === profile) ?? PROFILES[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`프로필 선택: ${current.label}`}
        className="flex items-center gap-[5px] bg-[var(--surface-2)] border border-input rounded-[6px] px-2 py-1 text-[12px] text-[var(--text-secondary)] cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-foreground hover:border-primary hover:bg-primary/5"
      >
        <span>{current.label}</span>
        {I.chevDown}
      </button>

      {open && (
        <div
          className="absolute bottom-[calc(100%+6px)] right-0 bg-card border border-border rounded-lg p-1 min-w-[160px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-[200]"
          style={{ animation: "fi 0.15s ease" }}
        >
          {PROFILES.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setProfile(p.value);
                setOpen(false);
              }}
              className={cn(
                "block w-full text-left border-none rounded-[6px] px-[10px] py-[7px] text-[12px] cursor-pointer transition-colors duration-100 font-[inherit]",
                p.value === profile
                  ? "bg-[var(--surface-2)] text-foreground"
                  : "bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]",
              )}
            >
              <span className="block">{p.label}</span>
              <span className="block text-[10px] text-[var(--text-dim)] mt-[1px]">{p.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
