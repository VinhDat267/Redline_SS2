import { useEffect, useState } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

/**
 * Toast — Binance-spec transient notification
 * Slides in from bottom-right, auto-dismisses after `duration` ms.
 *
 * Props:
 *   message   {string}           – text to display
 *   type      {"success"|"error"} – color variant
 *   onClose   {() => void}       – called when dismissed
 *   duration  {number}           – ms before auto-close (default 3000)
 */
export function Toast({ message, type = "success", onClose, duration = 3000 }) {
    const [visible, setVisible] = useState(false);

    // Slide in on mount
    useEffect(() => {
        const showTimer = setTimeout(() => setVisible(true), 10);
        return () => clearTimeout(showTimer);
    }, []);

    // Auto-dismiss
    useEffect(() => {
        const hideTimer = setTimeout(() => {
            setVisible(false);
            // Wait for exit animation then call onClose
            setTimeout(onClose, 300);
        }, duration);
        return () => clearTimeout(hideTimer);
    }, [duration, onClose]);

    const isSuccess = type === "success";
    const Icon = isSuccess ? CheckCircle : XCircle;
    const accentColor = isSuccess ? "#0ECB81" : "#F6465D";

    return (
        <div
            role="alert"
            aria-live="polite"
            style={{
                position: "fixed",
                bottom: "24px",
                right: "24px",
                zIndex: 9999,
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(12px)",
                transition: "opacity 280ms ease, transform 280ms ease",
                pointerEvents: visible ? "auto" : "none",
            }}
        >
            <div
                className="flex items-start gap-3 bg-white border border-[#E6E8EA] px-4 py-3.5"
                style={{
                    borderRadius: "10px",
                    boxShadow: "rgba(32, 32, 37, 0.12) 0px 4px 16px",
                    minWidth: "260px",
                    maxWidth: "360px",
                    borderLeft: `3px solid ${accentColor}`,
                }}
            >
                <Icon size={18} style={{ color: accentColor, flexShrink: 0, marginTop: "1px" }} />
                <span className="text-[14px] font-medium text-[#1E2026] flex-1" style={{ lineHeight: "1.43" }}>
                    {message}
                </span>
                <button
                    aria-label="Dismiss notification"
                    className="text-[#848E9C] hover:text-[#1E2026] bg-transparent border-none cursor-pointer p-0 flex-shrink-0"
                    style={{ transition: "color 150ms ease" }}
                    onClick={() => {
                        setVisible(false);
                        setTimeout(onClose, 300);
                    }}
                    type="button"
                >
                    <X size={15} />
                </button>
            </div>
        </div>
    );
}
