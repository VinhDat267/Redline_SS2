import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isProcessing = false
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !isProcessing) {
        onCancel();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    cancelButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProcessing, onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(30, 32, 38, 0.4)", backdropFilter: "blur(4px)" }}
      onClick={() => {
        if (!isProcessing) {
          onCancel();
        }
      }}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-white border border-[#E6E8EA] overflow-hidden"
        style={{
          borderRadius: "12px",
          boxShadow: "rgba(32, 32, 37, 0.05) 0px 3px 5px 0px",
          width: "100%",
          maxWidth: "420px",
          animation: "modalFadeIn 0.2s ease-out",
        }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {/* Header — Heading 4: 20px/600 per spec */}
        <div className="px-6 pt-6 pb-2">
          <p className="text-[12px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1">Confirm action</p>
          <h2 className="text-[20px] font-semibold text-[#1E2026]" id={titleId} style={{ lineHeight: "1.25" }}>
            {title}
          </h2>
        </div>

        {/* Description — Body: 16px/500 per spec */}
        <div className="px-6 pb-6">
          <p className="text-[16px] font-medium text-[#848E9C]" id={descriptionId} style={{ lineHeight: "1.50" }}>
            {description}
          </p>
        </div>

        {/* Actions — 6px radius buttons per spec */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E6E8EA]">
          {/* Secondary button — White outlined per spec */}
          <button
            className="px-6 py-1.5 bg-white border border-[#E6E8EA] text-[#32313A] text-[16px] font-semibold cursor-pointer hover:bg-[#F5F5F5] hover:border-[#1A1A1A] hover:text-[#1A1A1A] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderRadius: "6px", transition: "all 200ms ease", letterSpacing: "0.16px" }}
            disabled={isProcessing}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {cancelLabel}
          </button>
          {/* Primary button — Binance Yellow with Focus Blue hover per spec */}
          <button
            className="px-6 py-1.5 bg-[#F0B90B] border-none text-[#1E2026] text-[16px] font-semibold cursor-pointer hover:bg-[#1EAEDB] hover:text-white disabled:bg-[#E6E8EA] disabled:text-[#848E9C] disabled:cursor-not-allowed"
            style={{ borderRadius: "6px", transition: "background 200ms ease, color 200ms ease", letterSpacing: "0.16px" }}
            disabled={isProcessing}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`@keyframes modalFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
