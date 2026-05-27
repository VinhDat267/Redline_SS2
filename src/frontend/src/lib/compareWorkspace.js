import { encodeId } from "./idCodec";

function normalizeId(value) {
  const nextValue = Number(value);
  return Number.isInteger(nextValue) && nextValue > 0 ? nextValue : null;
}

export function formatCompareRunCode(compareRunId) {
  const normalizedId = normalizeId(compareRunId) ?? 0;
  return `CR-${String(normalizedId).padStart(4, "0")}`;
}

export function formatChangeType(changeType) {
  const normalizedValue = String(changeType ?? "change").replace(/_/g, " ");
  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

export function formatReviewStatus(reviewStatus) {
  const normalizedValue = String(reviewStatus ?? "open").replace(/_/g, " ");
  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

export function formatAiGenerationStatus(aiGenerationStatus) {
  const normalizedValue = String(aiGenerationStatus ?? "not_requested").toLowerCase();

  if (normalizedValue === "generated") {
    return "AI Ready";
  }

  if (normalizedValue === "failed") {
    return "AI Failed";
  }

  if (normalizedValue === "pending") {
    return "Generating";
  }

  return "Not Requested";
}

export function getChangeTypeTone(changeType) {
  const normalizedValue = String(changeType ?? "").toLowerCase();

  if (normalizedValue === "added") {
    return "workspace-chip-teal";
  }

  if (normalizedValue === "removed") {
    return "workspace-chip-amber";
  }

  return "workspace-chip-sky";
}

export function getReviewStatusTone(reviewStatus) {
  const normalizedValue = String(reviewStatus ?? "").toLowerCase();

  if (normalizedValue === "resolved") {
    return "workspace-chip-teal";
  }

  if (normalizedValue === "in_review") {
    return "workspace-chip-sky";
  }

  return "workspace-chip-amber";
}

export function getAiGenerationTone(aiGenerationStatus) {
  const normalizedValue = String(aiGenerationStatus ?? "not_requested").toLowerCase();

  if (normalizedValue === "generated" || normalizedValue === "ready" || normalizedValue === "completed") {
    return "workspace-chip-teal";
  }

  if (normalizedValue === "failed" || normalizedValue === "partial failure" || normalizedValue === "completed with failures") {
    return "workspace-chip-amber";
  }

  if (normalizedValue === "pending" || normalizedValue === "generating" || normalizedValue === "queued" || normalizedValue === "running") {
    return "workspace-chip-sky";
  }

  return "workspace-chip-slate";
}

export function formatAiBatchJobStatus(status) {
  const normalizedValue = String(status ?? "not_requested").toLowerCase();

  if (normalizedValue === "completed_with_failures") {
    return "Completed with failures";
  }

  if (normalizedValue === "completed") {
    return "Completed";
  }

  if (normalizedValue === "queued") {
    return "Queued";
  }

  if (normalizedValue === "running") {
    return "Running";
  }

  if (normalizedValue === "failed") {
    return "Failed";
  }

  return "Not requested";
}

export function buildCompareRunLabel(compareRun) {
  if (!compareRun?.source_version || !compareRun?.target_version) {
    return "Compare Run";
  }

  return `Compare ${compareRun.source_version.version_label} to ${compareRun.target_version.version_label}`;
}

export function buildCompareRunPath(compareRunId, suffix = "", changeItemId = null) {
  const encodedRunId = encodeId(compareRunId);
  const basePath = `/compare-runs/${encodedRunId}${suffix}`;
  const normalizedChangeItemId = normalizeId(changeItemId);

  if (!normalizedChangeItemId) {
    return basePath;
  }

  return `${basePath}?change=${encodeId(normalizedChangeItemId)}`;
}

export function resolveSelectedChangeId(compareRun, queue = [], requestedChangeId = null) {
  const requestedId = normalizeId(requestedChangeId);
  if (requestedId && queue.some((item) => item.id === requestedId)) {
    return requestedId;
  }

  const compareRunSelectedId = normalizeId(compareRun?.selected_change_item_id);
  if (compareRunSelectedId && queue.some((item) => item.id === compareRunSelectedId)) {
    return compareRunSelectedId;
  }

  return queue[0]?.id ?? null;
}

export function summarizeReviewCounts(queue = []) {
  return queue.reduce(
    (summary, item) => {
      summary.total += 1;

      if (String(item.review_status ?? "").toLowerCase() === "resolved") {
        summary.resolved += 1;
      } else if (String(item.review_status ?? "").toLowerCase() === "in_review") {
        summary.inReview += 1;
      } else {
        summary.open += 1;
      }

      return summary;
    },
    {
      total: 0,
      open: 0,
      inReview: 0,
      resolved: 0
    }
  );
}

export function summarizeAiGeneration(queue = []) {
  return queue.reduce(
    (summary, item) => {
      summary.total += 1;

      const normalizedValue = String(item.ai_generation_status ?? "not_requested").toLowerCase();
      if (normalizedValue === "generated") {
        summary.generated += 1;
      } else if (normalizedValue === "failed") {
        summary.failed += 1;
      } else if (normalizedValue === "pending") {
        summary.pending += 1;
      } else {
        summary.notRequested += 1;
      }

      return summary;
    },
    {
      total: 0,
      generated: 0,
      failed: 0,
      pending: 0,
      notRequested: 0
    }
  );
}

export function describeAiBatchState(queue = [], { isGenerating = false } = {}) {
  const summary = summarizeAiGeneration(queue);

  if (isGenerating) {
    return "Generating";
  }

  if (summary.failed > 0) {
    return "Partial failure";
  }

  if (summary.generated > 0 && summary.notRequested === 0 && summary.pending === 0) {
    return "Ready";
  }

  if (summary.pending > 0) {
    return "Generating";
  }

  return "Not requested";
}

export function getSelectedQueueItem(queue = [], selectedChangeId = null) {
  return queue.find((item) => item.id === selectedChangeId) ?? null;
}

export function buildChangeHeadline(changeItem) {
  if (!changeItem) {
    return "No change item selected";
  }

  return changeItem.summary || `${formatChangeType(changeItem.change_type)} - ${changeItem.section_title || changeItem.surface_key}`;
}
