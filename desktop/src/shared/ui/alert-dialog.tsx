import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel?: string;
  actionLabel?: string;
  onAction: () => void;
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = "취소",
  actionLabel = "삭제",
  onAction,
}: AlertDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay
          className="fixed inset-0 bg-black/60 z-[100]"
          style={{ animation: "fadeIn 0.15s ease" }}
        />
        <AlertDialogPrimitive.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] bg-card border border-border rounded-xl p-6 w-[360px] max-w-[calc(100vw-32px)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          style={{ animation: "slideUp 0.15s ease" }}
        >
          <AlertDialogPrimitive.Title className="text-base font-semibold text-foreground mb-2">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-sm text-[var(--text-muted)] leading-relaxed mb-5">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel className="px-4 py-[7px] rounded-lg border border-border bg-transparent text-[var(--text-secondary)] text-sm cursor-pointer hover:border-input transition-colors">
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              className="px-4 py-[7px] rounded-lg bg-destructive text-destructive-foreground text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity"
              onClick={onAction}
            >
              {actionLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
