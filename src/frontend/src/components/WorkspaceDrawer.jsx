import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function WorkspaceDrawer({
  open,
  title,
  subtitle,
  children,
  onClose,
  isBusy = false
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !isBusy) {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBusy, onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-[#1E2026]/40 backdrop-blur-sm flex justify-end"
      onClick={() => {
        if (!isBusy) {
          onClose();
        }
      }}
    >
      <aside
        aria-describedby={subtitle ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full sm:w-[448px] bg-[#FFFFFF] shadow-[-8px_0_24px_rgba(32,32,37,0.08)] h-full overflow-hidden flex flex-col transform transition-transform duration-300"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex-1 overflow-y-auto flex flex-col border-l border-[#E6E8EA]">
          <div className="px-6 py-6 border-b border-[#E6E8EA] flex justify-between items-start bg-[#FAFAFA]">
            <div>
              <p className="font-label text-[11px] font-semibold text-[#848E9C] uppercase tracking-wider mb-1.5">Operator drawer</p>
              <h2 className="font-bold text-[20px] font-bold text-[#1E2026] tracking-tight" id={titleId}>
                {title}
              </h2>
              {subtitle ? (
                <p className="font-sans text-[13px] text-[#474D57] mt-1" id={descriptionId}>
                  {subtitle}
                </p>
              ) : null}
            </div>

            <button
              className="px-3 py-1.5 rounded-[50px] text-[#848E9C] font-semibold text-[13px] border border-[#E6E8EA] bg-[#FFFFFF] hover:text-[#1E2026] hover:bg-[#F5F5F5] transition-colors"
              disabled={isBusy}
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="flex-1 bg-[#FFFFFF]">{children}</div>
        </div>
      </aside>
    </div>,
    document.body
  );
}
