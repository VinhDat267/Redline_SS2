import { useState } from "react";
import { diffWords } from "diff";
import { Columns2, Rows3, FileText } from "lucide-react";

const VIEW_MODES = {
  PLAIN: "plain",
  SIDE_BY_SIDE: "side-by-side",
  UNIFIED: "unified",
};

function computeWordDiff(oldText, newText) {
  return diffWords(oldText || "", newText || "");
}

function DiffTokenSpan({ part }) {
  if (part.added) {
    return <span className="diff-token diff-token-added">{part.value}</span>;
  }

  if (part.removed) {
    return <span className="diff-token diff-token-removed">{part.value}</span>;
  }

  return <span className="diff-token">{part.value}</span>;
}

function SideBySideView({ oldText, newText }) {
  const parts = computeWordDiff(oldText, newText);

  const oldTokens = parts
    .filter((part) => !part.added)
    .map((part, i) => <DiffTokenSpan key={i} part={part} />);

  const newTokens = parts
    .filter((part) => !part.removed)
    .map((part, i) => <DiffTokenSpan key={i} part={part} />);

  return (
    <div className="workspace-layout workspace-layout-halves">
      <div
        className="workspace-subpanel"
        style={{
          background: "rgba(187,122,54,0.05)",
          borderLeft: "3px solid var(--amber-500)",
        }}
      >
        <p
          className="workspace-kicker"
          style={{ display: "flex", alignItems: "center" }}
        >
          Old content
        </p>
        <p
          className="diff-content"
          style={{ fontSize: "0.8rem", lineHeight: 1.6 }}
        >
          {oldText ? oldTokens : "\u2014"}
        </p>
      </div>
      <div
        className="workspace-subpanel"
        style={{
          background: "rgba(79,103,132,0.05)",
          borderLeft: "3px solid var(--sky-600)",
        }}
      >
        <p
          className="workspace-kicker"
          style={{ display: "flex", alignItems: "center" }}
        >
          New content
        </p>
        <p
          className="diff-content"
          style={{ fontSize: "0.8rem", lineHeight: 1.6 }}
        >
          {newText ? newTokens : "\u2014"}
        </p>
      </div>
    </div>
  );
}

function UnifiedView({ oldText, newText }) {
  const parts = computeWordDiff(oldText, newText);

  return (
    <div
      className="workspace-subpanel"
      style={{
        background: "rgba(79,103,132,0.03)",
        borderLeft: "3px solid var(--slate-500)",
      }}
    >
      <p
        className="workspace-kicker"
        style={{ display: "flex", alignItems: "center" }}
      >
        Unified Diff
      </p>
      <p
        className="diff-content"
        style={{ fontSize: "0.8rem", lineHeight: 1.6 }}
      >
        {parts.map((part, i) => (
          <DiffTokenSpan key={i} part={part} />
        ))}
      </p>
    </div>
  );
}

function PlainView({ oldText, newText, oldIcon, newIcon }) {
  return (
    <div className="workspace-layout workspace-layout-halves">
      <div
        className="workspace-subpanel"
        style={{
          background: "rgba(187,122,54,0.05)",
          borderLeft: "3px solid var(--amber-500)",
        }}
      >
        <p
          className="workspace-kicker"
          style={{ display: "flex", alignItems: "center" }}
        >
          {oldIcon}
          Old content
        </p>
        <p
          className="workspace-diff-copy"
          style={{ fontSize: "0.8rem", lineHeight: 1.6 }}
        >
          {oldText || "\u2014"}
        </p>
      </div>
      <div
        className="workspace-subpanel"
        style={{
          background: "rgba(79,103,132,0.05)",
          borderLeft: "3px solid var(--sky-600)",
        }}
      >
        <p
          className="workspace-kicker"
          style={{ display: "flex", alignItems: "center" }}
        >
          {newIcon}
          New content
        </p>
        <p
          className="workspace-diff-copy"
          style={{ fontSize: "0.8rem", lineHeight: 1.6 }}
        >
          {newText || "\u2014"}
        </p>
      </div>
    </div>
  );
}

export function InlineDiff({
  oldText,
  newText,
  oldIcon = null,
  newIcon = null,
  defaultMode = VIEW_MODES.SIDE_BY_SIDE,
}) {
  const [viewMode, setViewMode] = useState(defaultMode);

  const hasContent = Boolean(oldText) || Boolean(newText);
  const hasBothSides = Boolean(oldText) && Boolean(newText);

  return (
    <div className="diff-wrapper">
      {hasContent && hasBothSides ? (
        <div className="diff-toolbar">
          <span className="workspace-field-label" style={{ fontSize: "0.7rem" }}>
            View mode
          </span>
          <div className="diff-mode-group">
            <button
              className={`diff-mode-btn ${viewMode === VIEW_MODES.PLAIN ? "diff-mode-btn-active" : ""}`}
              onClick={() => setViewMode(VIEW_MODES.PLAIN)}
              title="Plain text (no highlighting)"
              type="button"
            >
              <FileText size={13} />
              <span>Plain</span>
            </button>
            <button
              className={`diff-mode-btn ${viewMode === VIEW_MODES.SIDE_BY_SIDE ? "diff-mode-btn-active" : ""}`}
              onClick={() => setViewMode(VIEW_MODES.SIDE_BY_SIDE)}
              title="Side-by-side with word highlighting"
              type="button"
            >
              <Columns2 size={13} />
              <span>Side-by-side</span>
            </button>
            <button
              className={`diff-mode-btn ${viewMode === VIEW_MODES.UNIFIED ? "diff-mode-btn-active" : ""}`}
              onClick={() => setViewMode(VIEW_MODES.UNIFIED)}
              title="Unified inline diff"
              type="button"
            >
              <Rows3 size={13} />
              <span>Unified</span>
            </button>
          </div>
        </div>
      ) : null}

      {!hasContent ? (
        <div className="workspace-layout workspace-layout-halves">
          <div
            className="workspace-subpanel"
            style={{
              background: "rgba(187,122,54,0.05)",
              borderLeft: "3px solid var(--amber-500)",
            }}
          >
            <p className="workspace-kicker">Old content</p>
            <p className="workspace-diff-copy" style={{ fontSize: "0.8rem" }}>
              {"\u2014"}
            </p>
          </div>
          <div
            className="workspace-subpanel"
            style={{
              background: "rgba(79,103,132,0.05)",
              borderLeft: "3px solid var(--sky-600)",
            }}
          >
            <p className="workspace-kicker">New content</p>
            <p className="workspace-diff-copy" style={{ fontSize: "0.8rem" }}>
              {"\u2014"}
            </p>
          </div>
        </div>
      ) : !hasBothSides ? (
        <PlainView
          newText={newText}
          oldIcon={oldIcon}
          oldText={oldText}
          newIcon={newIcon}
        />
      ) : viewMode === VIEW_MODES.UNIFIED ? (
        <UnifiedView newText={newText} oldText={oldText} />
      ) : viewMode === VIEW_MODES.SIDE_BY_SIDE ? (
        <SideBySideView newText={newText} oldText={oldText} />
      ) : (
        <PlainView
          newText={newText}
          oldIcon={oldIcon}
          oldText={oldText}
          newIcon={newIcon}
        />
      )}
    </div>
  );
}

export { VIEW_MODES };
