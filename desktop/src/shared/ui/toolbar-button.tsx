import { cn } from "@/lib/utils";

interface ToolbarButtonProps {
  icon: React.ReactNode;
  tip?: string;
  onClick?: () => void;
  act?: boolean;
  activeColor?: string;
  disabled?: boolean;
}

export function ToolbarButton({ icon, tip, onClick, act, activeColor, disabled }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={tip}
      aria-label={tip || undefined}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center border-none rounded-[5px] px-[5px] py-[3px]",
        "bg-transparent shrink-0 transition-colors duration-150",
        disabled
          ? "cursor-not-allowed text-input"
          : "cursor-pointer hover:bg-white/[.06]",
        !act && !disabled && "text-[var(--text-dim)] hover:text-[var(--text-secondary)]",
      )}
      style={act && !disabled ? { color: activeColor ?? "var(--primary)" } : undefined}
    >
      {icon}
    </button>
  );
}

export { ToolbarButton as Tb };
