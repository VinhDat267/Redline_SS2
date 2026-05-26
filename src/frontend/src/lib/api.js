const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const CSRF_HEADER_NAME = "X-CSRF-Token";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function formatErrorDetail(detailItem) {
  if (typeof detailItem === "string") {
    return detailItem;
  }

  if (!detailItem || typeof detailItem !== "object") {
    return "";
  }

  const fieldPath = Array.isArray(detailItem.loc)
    ? detailItem.loc.filter((segment) => segment !== "body").join(".")
    : "";

  if (fieldPath && typeof detailItem.msg === "string") {
    return `${fieldPath}: ${detailItem.msg}`;
  }

  if (typeof detailItem.msg === "string") {
    return detailItem.msg;
  }

  try {
    return JSON.stringify(detailItem);
  } catch {
    return "";
  }
}
/**
 * Maps raw backend error detail strings to polished, user-facing messages.
 * Any message not listed here passes through unchanged.
 */
const FRIENDLY_ERRORS = {
  // Auth & session
  "Authentication required": "Please sign in to continue.",
  "Your session has expired. Please sign in again.": "Your session has expired. Please sign in again.",
  "CSRF token is required": "Your session has expired. Please sign in again.",
  "Invalid CSRF token": "Your session has expired. Please sign in again.",
  "Access token has been revoked": "Your session has expired. Please sign in again.",
  "Internal Server Error": "A server error occurred while processing your request. Please try again later.",

  // Not found - resources
  "Project not found": "The requested project could not be found.",
  "Document not found": "The requested document could not be found.",
  "Document version not found": "The requested document version could not be found.",
  "Requirement not found": "The requested obligation could not be found.",
  "Test case not found": "The requested compliance check could not be found.",
  "Compare run not found": "The requested comparison could not be found.",
  "Change item not found": "The requested change item could not be found.",
  "Chat session not found": "This chat session could not be found. It may have been deleted.",
  "Chat attempt not found": "This chat message could not be found.",
  "Contract draft not found": "The requested contract draft could not be found.",
  "Project member not found": "The requested team member could not be found.",
  "User not found": "The specified user could not be found.",
  "Project invitation not found": "This invitation could not be found or has expired.",
  "Mapping not found": "This mapping could not be found. It may have already been removed.",
  "AI batch job not found": "The requested AI job could not be found.",
  "Assignee user not found": "The specified assignee could not be found.",
  "Comment author not found": "The comment author could not be found.",
  "Superseded attempt not found": "The referenced message could not be found.",

  // Conflict
  "Mapping already exists": "This mapping already exists.",
  "Version already exists": "A version with this label already exists. Please choose a different name.",
  "Member already exists": "This user is already a member of the project.",
  "Pending invitation already exists": "An invitation has already been sent to this user.",

  // Permission
  "Project owner access required": "You do not have permission to perform this action. Owner access is required.",
  "Document does not belong to project": "This document does not belong to the current project.",

  // Streaming
  "Contract chat streaming is disabled": "Chat streaming is not available at the moment. Please try again later.",
  "Attempt draft must match chat session draft": "This message is no longer valid for the current session.",
};

export function humanizeError(raw) {
  return FRIENDLY_ERRORS[raw] || raw;
}

export function extractErrorMessage(payload) {
  if (typeof payload?.detail === "string" && payload.detail.trim()) {
    return humanizeError(payload.detail);
  }

  if (Array.isArray(payload?.detail)) {
    const detailMessages = payload.detail.map(formatErrorDetail).filter(Boolean);
    if (detailMessages.length > 0) {
      return detailMessages.join("; ");
    }
  }

  if (typeof payload?.error?.message === "string" && payload.error.message.trim()) {
    return payload.error.message;
  }

  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  try {
    const fallbackMessage = JSON.stringify(payload);
    if (fallbackMessage && fallbackMessage !== "{}") {
      return fallbackMessage;
    }
  } catch {
    return "An unexpected error occurred. Please try again.";
  }

  return "An unexpected error occurred. Please try again.";
}

function buildHeaders(token, headers = {}, method = "GET") {
  const requestHeaders = { ...headers };
  if (token && UNSAFE_METHODS.has(method.toUpperCase()) && !requestHeaders[CSRF_HEADER_NAME]) {
    requestHeaders[CSRF_HEADER_NAME] = token;
  }
  return requestHeaders;
}

function normalizeContract(contract) {
  if (!contract) {
    return contract;
  }

  return {
    ...contract,
    document_type: contract.document_type ?? contract.contract_type ?? null
  };
}

function normalizeContractDraft(draft) {
  if (!draft) {
    return draft;
  }

  return {
    ...draft,
    document_id: draft.document_id ?? draft.contract_id,
    version_label: draft.version_label ?? draft.draft_label
  };
}

function normalizeContractCompareRun(compareRun) {
  if (!compareRun) {
    return compareRun;
  }

  return {
    ...compareRun,
    document: normalizeContract(compareRun.document ?? compareRun.contract),
    source_version: normalizeContractDraft(compareRun.source_version ?? compareRun.source_draft),
    target_version: normalizeContractDraft(compareRun.target_version ?? compareRun.target_draft),
    selected_change_item_id:
      compareRun.selected_change_item_id ?? compareRun.selected_clause_change_id ?? null,
    has_ai_review_drafts:
      compareRun.has_ai_review_drafts ?? compareRun.has_ai_clause_risk_analyses ?? false
  };
}

function buildContractPayload(payload) {
  return {
    title: payload.title,
    contract_type: payload.contract_type ?? payload.document_type ?? null,
    description: payload.description ?? null
  };
}

async function apiRequest(path, { method = "GET", token = null, body, headers = {} } = {}) {
  const requestHeaders = buildHeaders(token, headers, method);
  const requestInit = {
    method,
    headers: requestHeaders,
    credentials: "include"
  };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, requestInit);
  } catch (err) {
    throw new ApiError("Unable to connect to the server. Please check your network connection and try again.", 0, err);
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = extractErrorMessage(payload);
    throw new ApiError(message, response.status, payload);
  }

  return payload?.data ?? payload;
}

async function apiFormRequest(path, { method = "POST", token = null, formData, headers = {} } = {}) {
  const requestHeaders = buildHeaders(token, headers, method);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: formData,
      credentials: "include"
    });
  } catch (err) {
    throw new ApiError("Unable to connect to the server. Please check your network connection and try again.", 0, err);
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = extractErrorMessage(payload);
    throw new ApiError(message, response.status, payload);
  }

  return payload?.data ?? payload;
}

export function loginUser(payload) {
  return apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: payload
  });
}

export function loginWithGoogleCredential(credential) {
  return apiRequest("/api/v1/auth/google", {
    method: "POST",
    body: { credential }
  });
}

export function registerUser(payload) {
  return apiRequest("/api/v1/auth/register", {
    method: "POST",
    body: payload
  });
}

export function logoutUser(token) {
  return apiRequest("/api/v1/auth/logout", {
    method: "POST",
    token
  });
}

export function fetchCurrentUser(token) {
  return apiRequest("/api/v1/auth/me", { token });
}

export function updateCurrentUserProfile(token, payload) {
  return apiRequest("/api/v1/auth/me", {
    method: "PATCH",
    token,
    body: payload
  });
}

export function changeCurrentUserPassword(token, payload) {
  return apiRequest("/api/v1/auth/me/password", {
    method: "POST",
    token,
    body: payload
  });
}

export function uploadAvatar(token, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFormRequest("/api/v1/auth/me/avatar", { method: "POST", token, formData });
}

export function deleteAvatar(token) {
  return apiRequest("/api/v1/auth/me/avatar", { method: "DELETE", token });
}

export function listProjects(token) {
  return apiRequest("/api/v1/projects", { token });
}

export function createProject(token, payload) {
  return apiRequest("/api/v1/projects", {
    method: "POST",
    token,
    body: payload
  });
}

export function updateProject(token, projectId, payload) {
  return apiRequest(`/api/v1/projects/${projectId}`, {
    method: "PATCH",
    token,
    body: payload
  });
}

export function deleteProject(token, projectId) {
  return apiRequest(`/api/v1/projects/${projectId}`, {
    method: "DELETE",
    token
  });
}

export function seedDemoWorkspace(token) {
  return apiRequest("/api/v1/demo/seed", {
    method: "POST",
    token
  });
}

export function getProject(token, projectId) {
  return apiRequest(`/api/v1/projects/${projectId}`, { token });
}

export function getProjectAnalytics(token, projectId) {
  return apiRequest(`/api/v1/projects/${projectId}/analytics`, { token });
}

export function listProjectActivityLogs(token, projectId) {
  return apiRequest(`/api/v1/projects/${projectId}/activity-logs`, { token });
}

export function listProjectMembers(token, projectId) {
  return apiRequest(`/api/v1/projects/${projectId}/members`, { token });
}

export function createProjectMember(token, projectId, payload) {
  return apiRequest(`/api/v1/projects/${projectId}/members`, {
    method: "POST",
    token,
    body: payload
  });
}

export function listProjectInvitations(token, projectId) {
  return apiRequest(`/api/v1/projects/${projectId}/invitations`, { token });
}

export function deleteProjectInvitation(token, projectId, invitationId) {
  return apiRequest(`/api/v1/projects/${projectId}/invitations/${invitationId}`, {
    method: "DELETE",
    token
  });
}

export function acceptProjectInvitation(token, invitationId) {
  return apiRequest(`/api/v1/auth/project-invitations/${invitationId}/accept`, {
    method: "POST",
    token
  });
}

export function deleteProjectMember(token, projectId, memberId) {
  return apiRequest(`/api/v1/projects/${projectId}/members/${memberId}`, {
    method: "DELETE",
    token
  });
}

export function listProjectDocuments(token, projectId) {
  return apiRequest(`/api/v1/projects/${projectId}/documents`, { token });
}

export async function listProjectContracts(token, projectId) {
  const payload = await apiRequest(`/api/v1/projects/${projectId}/contracts`, { token });
  return Array.isArray(payload) ? payload.map(normalizeContract) : [];
}

export function createDocument(token, projectId, payload) {
  return apiRequest(`/api/v1/projects/${projectId}/documents`, {
    method: "POST",
    token,
    body: payload
  });
}

export function updateDocument(token, documentId, payload) {
  return apiRequest(`/api/v1/documents/${documentId}`, {
    method: "PATCH",
    token,
    body: payload
  });
}

export function deleteDocument(token, documentId) {
  return apiRequest(`/api/v1/documents/${documentId}`, {
    method: "DELETE",
    token
  });
}

export function getDocument(token, documentId) {
  return apiRequest(`/api/v1/documents/${documentId}`, { token });
}

export async function createContract(token, projectId, payload) {
  const contract = await apiRequest(`/api/v1/projects/${projectId}/contracts`, {
    method: "POST",
    token,
    body: buildContractPayload(payload)
  });
  return normalizeContract(contract);
}

export async function updateContract(token, contractId, payload) {
  const contract = await apiRequest(`/api/v1/contracts/${contractId}`, {
    method: "PATCH",
    token,
    body: buildContractPayload(payload)
  });
  return normalizeContract(contract);
}

export function deleteContract(token, contractId) {
  return apiRequest(`/api/v1/contracts/${contractId}`, {
    method: "DELETE",
    token
  });
}

export async function getContract(token, contractId) {
  const contract = await apiRequest(`/api/v1/contracts/${contractId}`, { token });
  return normalizeContract(contract);
}

export function listDocumentVersions(token, documentId) {
  return apiRequest(`/api/v1/documents/${documentId}/versions`, { token });
}

export async function listContractDrafts(token, contractId) {
  const drafts = await apiRequest(`/api/v1/contracts/${contractId}/drafts`, { token });
  return Array.isArray(drafts) ? drafts.map(normalizeContractDraft) : [];
}

export function createDocumentVersion(token, documentId, payload) {
  const formData = new FormData();
  formData.set("version_label", payload.versionLabel);
  if (payload.notes && payload.notes.trim()) {
    formData.set("notes", payload.notes.trim());
  }
  formData.set("file", payload.file);

  return apiFormRequest(`/api/v1/documents/${documentId}/versions`, {
    method: "POST",
    token,
    formData
  });
}

export async function createContractDraft(token, contractId, payload) {
  const formData = new FormData();
  formData.set("draft_label", payload.draftLabel ?? payload.versionLabel);
  if (payload.notes && payload.notes.trim()) {
    formData.set("notes", payload.notes.trim());
  }
  formData.set("file", payload.file);

  const draft = await apiFormRequest(`/api/v1/contracts/${contractId}/drafts`, {
    method: "POST",
    token,
    formData
  });
  return normalizeContractDraft(draft);
}

export function updateDocumentVersion(token, versionId, payload) {
  return apiRequest(`/api/v1/document-versions/${versionId}`, {
    method: "PATCH",
    token,
    body: payload
  });
}

export function deleteDocumentVersion(token, versionId) {
  return apiRequest(`/api/v1/document-versions/${versionId}`, {
    method: "DELETE",
    token
  });
}

export async function updateContractDraft(token, draftId, payload) {
  const draft = await apiRequest(`/api/v1/contract-drafts/${draftId}`, {
    method: "PATCH",
    token,
    body: {
      draft_label: payload.draft_label ?? payload.version_label ?? null,
      notes: payload.notes ?? null
    }
  });
  return normalizeContractDraft(draft);
}

export function deleteContractDraft(token, draftId) {
  return apiRequest(`/api/v1/contract-drafts/${draftId}`, {
    method: "DELETE",
    token
  });
}

export function parseDocumentVersion(token, versionId) {
  return apiRequest(`/api/v1/document-versions/${versionId}/parse`, {
    method: "POST",
    token
  });
}

export async function parseContractDraft(token, draftId) {
  const draft = await apiRequest(`/api/v1/contract-drafts/${draftId}/parse`, {
    method: "POST",
    token
  });
  return normalizeContractDraft(draft);
}

export function getParserWorkspace(token, documentId, versionId = null) {
  const query = versionId ? `?version_id=${encodeURIComponent(versionId)}` : "";
  return apiRequest(`/api/v1/documents/${documentId}/parser-workspace${query}`, { token });
}

export function getParserSurface(token, versionId, surfaceId) {
  return apiRequest(`/api/v1/document-versions/${versionId}/parser-surfaces/${surfaceId}`, { token });
}

export function listRequirementCandidates(token, versionId) {
  return apiRequest(`/api/v1/document-versions/${versionId}/requirement-candidates`, { token });
}

export function generateRequirementCandidates(token, versionId, payload = { force_regenerate: false }) {
  return apiRequest(`/api/v1/document-versions/${versionId}/requirement-candidates/generate`, {
    method: "POST",
    token,
    body: payload
  });
}

export function acceptRequirementCandidate(token, candidateId) {
  return apiRequest(`/api/v1/requirement-candidates/${candidateId}/accept`, {
    method: "POST",
    token
  });
}

export function rejectRequirementCandidate(token, candidateId, reason = "") {
  return apiRequest(`/api/v1/requirement-candidates/${candidateId}/reject`, {
    method: "POST",
    token,
    body: { reason }
  });
}

export function createCompareRun(token, documentId, payload) {
  return apiRequest(`/api/v1/documents/${documentId}/compare-runs`, {
    method: "POST",
    token,
    body: payload
  });
}

export async function createContractCompareRun(token, contractId, payload) {
  const compareRun = await apiRequest(`/api/v1/contracts/${contractId}/compare-runs`, {
    method: "POST",
    token,
    body: {
      source_draft_id: payload.source_draft_id ?? payload.source_version_id,
      target_draft_id: payload.target_draft_id ?? payload.target_version_id
    }
  });
  return normalizeContractCompareRun(compareRun);
}

export async function listContractCompareRuns(token, contractId, options = {}) {
  const params = new URLSearchParams();
  if (options.latestPerPair) params.set("latest_per_pair", "true");
  if (options.freshOnly) params.set("fresh_only", "true");
  const query = params.toString();
  const compareRuns = await apiRequest(
    `/api/v1/contracts/${contractId}/compare-runs${query ? `?${query}` : ""}`,
    { token }
  );
  return (Array.isArray(compareRuns) ? compareRuns : []).map(normalizeContractCompareRun);
}

export function getCompareRun(token, compareRunId) {
  return apiRequest(`/api/v1/compare-runs/${compareRunId}`, { token });
}

export async function getContractCompareRun(token, compareRunId) {
  const compareRun = await apiRequest(`/api/v1/contract-compare-runs/${compareRunId}`, { token });
  return normalizeContractCompareRun(compareRun);
}

export function listCompareRunChangeItems(token, compareRunId) {
  return apiRequest(`/api/v1/compare-runs/${compareRunId}/change-items`, { token });
}

export function listContractClauseChanges(token, compareRunId) {
  return apiRequest(`/api/v1/contract-compare-runs/${compareRunId}/clause-changes`, { token });
}

export function generateCompareRunAiDrafts(token, compareRunId, payload = { force_regenerate: false }) {
  return apiRequest(`/api/v1/compare-runs/${compareRunId}/ai-review-drafts/generate`, {
    method: "POST",
    token,
    body: payload
  });
}

export function getAiBatchJob(token, jobId) {
  return apiRequest(`/api/v1/ai-batch-jobs/${jobId}`, { token });
}

export function getChangeItem(token, changeItemId) {
  return apiRequest(`/api/v1/change-items/${changeItemId}`, { token });
}

export function updateChangeItem(token, changeItemId, payload) {
  return apiRequest(`/api/v1/change-items/${changeItemId}`, {
    method: "PATCH",
    token,
    body: payload
  });
}

export function createChangeItemComment(token, changeItemId, payload) {
  return apiRequest(`/api/v1/change-items/${changeItemId}/comments`, {
    method: "POST",
    token,
    body: payload
  });
}

export function regenerateChangeItemAiDraft(
  token,
  changeItemId,
  payload = { force_regenerate: true }
) {
  return apiRequest(`/api/v1/change-items/${changeItemId}/ai-review-draft/generate`, {
    method: "POST",
    token,
    body: payload
  });
}

export function generateCompareRunAiSummaryDraft(token, compareRunId) {
  return apiRequest(`/api/v1/compare-runs/${compareRunId}/ai-summary-drafts/generate`, {
    method: "POST",
    token
  });
}

export async function exportCompareRunDocx(token, compareRunId, summaryText = null) {
  const params = new URLSearchParams();
  if (summaryText) {
    params.set("summary_text", summaryText);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/v1/compare-runs/${compareRunId}/export/docx${query}`, {
    headers: buildHeaders(token),
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "Export failed");
    throw new ApiError(text, response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch ? filenameMatch[1] : `redline-report-CR-${compareRunId}.docx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function listProjectRequirements(token, projectId) {
  return apiRequest(`/api/v1/projects/${projectId}/requirements`, { token });
}

export function createProjectRequirement(token, projectId, payload) {
  return apiRequest(`/api/v1/projects/${projectId}/requirements`, {
    method: "POST",
    token,
    body: payload
  });
}

export function updateRequirement(token, requirementId, payload) {
  return apiRequest(`/api/v1/requirements/${requirementId}`, {
    method: "PATCH",
    token,
    body: payload
  });
}

export function deleteRequirement(token, requirementId) {
  return apiRequest(`/api/v1/requirements/${requirementId}`, {
    method: "DELETE",
    token
  });
}

export function createRequirementLink(token, changeItemId, requirementId, notes = "") {
  return apiRequest(`/api/v1/change-items/${changeItemId}/requirement-links`, {
    method: "POST",
    token,
    body: { requirement_id: requirementId, notes }
  });
}

export function acceptTraceabilitySuggestion(token, changeItemId, requirementId, suggestionToken, notes = "") {
  return apiRequest(`/api/v1/change-items/${changeItemId}/requirement-links/ai-suggested`, {
    method: "POST",
    token,
    body: { requirement_id: requirementId, suggestion_token: suggestionToken, notes }
  });
}

export function suggestTraceabilityLinks(token, changeItemId) {
  return apiRequest(`/api/v1/change-items/${changeItemId}/suggest-links`, {
    method: "POST",
    token
  });
}

export function deleteRequirementLink(token, changeItemId, requirementId) {
  return apiRequest(`/api/v1/change-items/${changeItemId}/requirement-links/${requirementId}`, {
    method: "DELETE",
    token
  });
}

export function listProjectTestCases(token, projectId) {
  return apiRequest(`/api/v1/projects/${projectId}/test-cases`, { token });
}

export function createProjectTestCase(token, projectId, payload) {
  return apiRequest(`/api/v1/projects/${projectId}/test-cases`, {
    method: "POST",
    token,
    body: payload
  });
}

export function updateTestCase(token, testCaseId, payload) {
  return apiRequest(`/api/v1/test-cases/${testCaseId}`, {
    method: "PATCH",
    token,
    body: payload
  });
}

export function deleteTestCase(token, testCaseId) {
  return apiRequest(`/api/v1/test-cases/${testCaseId}`, {
    method: "DELETE",
    token
  });
}

export function listRequirementTestCaseMappings(token, requirementId) {
  return apiRequest(`/api/v1/requirements/${requirementId}/test-case-mappings`, { token });
}

export function createRequirementTestCaseMapping(token, requirementId, testCaseId, notes = "") {
  return apiRequest(`/api/v1/requirements/${requirementId}/test-case-mappings`, {
    method: "POST",
    token,
    body: { test_case_id: testCaseId, notes }
  });
}

export function deleteRequirementTestCaseMapping(token, requirementId, testCaseId) {
  return apiRequest(`/api/v1/requirements/${requirementId}/test-case-mappings/${testCaseId}`, {
    method: "DELETE",
    token
  });
}

export function listContractChatSessions(token, contractId) {
  return apiRequest(`/api/v1/contracts/${contractId}/chat/sessions`, { token });
}

export function createContractChatSession(token, contractId, payload) {
  return apiRequest(`/api/v1/contracts/${contractId}/chat/sessions`, {
    method: "POST",
    token,
    body: payload
  });
}

export function listContractChatMessages(token, contractId, sessionId) {
  return apiRequest(`/api/v1/contracts/${contractId}/chat/sessions/${sessionId}/messages`, { token });
}

export function sendContractChatMessage(token, contractId, sessionId, payload) {
  return apiRequest(`/api/v1/contracts/${contractId}/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    token,
    body: payload
  });
}

export function createContractChatAttempt(token, contractId, sessionId, payload) {
  return apiRequest(`/api/v1/contracts/${contractId}/chat/sessions/${sessionId}/attempts`, {
    method: "POST",
    token,
    body: payload
  });
}

export function cancelContractChatAttempt(token, contractId, sessionId, attemptId) {
  return apiRequest(`/api/v1/contracts/${contractId}/chat/sessions/${sessionId}/attempts/${attemptId}/cancel`, {
    method: "POST",
    token
  });
}
