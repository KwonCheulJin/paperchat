import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  zIndex: 100,
  animation: "fadeIn 0.15s ease",
};

const contentStyle: React.CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 101,
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "24px",
  width: 360,
  maxWidth: "calc(100vw - 32px)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  animation: "slideUp 0.15s ease",
};

const titleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "var(--foreground)",
  marginBottom: 8,
};

const descStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  lineHeight: 1.6,
  marginBottom: 20,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "7px 16px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-secondary)",
  fontSize: 13,
  cursor: "pointer",
};

const actionBtnStyle: React.CSSProperties = {
  padding: "7px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--destructive)",
  color: "var(--destructive-foreground)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

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
        <AlertDialogPrimitive.Overlay style={overlayStyle} />
        <AlertDialogPrimitive.Content style={contentStyle}>
          <AlertDialogPrimitive.Title style={titleStyle}>
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description style={descStyle}>
            {description}
          </AlertDialogPrimitive.Description>
          <div style={footerStyle}>
            <AlertDialogPrimitive.Cancel
              style={cancelBtnStyle}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--input)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              style={actionBtnStyle}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background =
                  "color-mix(in oklch, var(--destructive) 85%, black)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--destructive)")
              }
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
