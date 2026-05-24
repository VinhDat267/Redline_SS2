from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import time
from typing import Any, Callable, Iterable, Mapping

import httpx

from app.core.config import Settings, settings as app_settings

logger = logging.getLogger(__name__)

DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_TIMEOUT_SECONDS = 60.0
DEFAULT_MAX_RETRIES = 5
DEFAULT_RETRY_BASE_DELAY = 2.0
DEFAULT_RATE_LIMIT_FLOOR_DELAY = 8.0
ALLOWED_REVIEW_STATUSES = {"open", "in_review"}


class ProviderRetryableError(Exception):
    pass


class ProviderRateLimitError(ProviderRetryableError):
    """Raised specifically for 429 rate-limit responses; carries retry_after hint."""

    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class ProviderFatalError(Exception):
    pass


class ProviderRequestCancelled(Exception):
    pass


@dataclass(slots=True)
class NormalizedAIReviewDraft:
    suggested_assignee_user_id: int | None
    recommended_review_status: str
    explanation: str
    risk_level: str | None
    draft_comment: str | None
    suggested_checks: str | None
    confidence: float | None
    generation_status: str
    provider_used: str
    fallback_used: bool
    error_message: str | None



@dataclass(slots=True)
class NormalizedAISummaryDraft:
    summary_text: str
    provider_used: str
    fallback_used: bool
    error_message: str | None


@dataclass(slots=True)
class NormalizedContractChatAnswer:
    content: str
    provider_used: str
    fallback_used: bool
    error_message: str | None


@dataclass(slots=True)
class NormalizedRequirementCandidate:
    requirement_code: str
    title: str
    description: str | None
    source_section: str | None
    source_block_key: str | None
    confidence: float | None


@dataclass(slots=True)
class NormalizedRequirementExtractionResult:
    candidates: list[NormalizedRequirementCandidate]
    provider_used: str
    fallback_used: bool
    error_message: str | None




@dataclass(slots=True)
class NormalizedTraceabilitySuggestion:
    requirement_code: str
    title: str
    confidence: float
    rationale: str | None
    relevance_type: str  # "directly_affected" | "indirectly_affected" | "related"


@dataclass(slots=True)
class NormalizedTraceabilitySuggestionResult:
    suggestions: list[NormalizedTraceabilitySuggestion]
    provider_used: str
    fallback_used: bool
    error_message: str | None


class LLMAdapter:

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        client_factory: Callable[..., httpx.Client] | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_base_delay: float = DEFAULT_RETRY_BASE_DELAY,
    ) -> None:
        self.settings = settings or app_settings
        self._client_factory = client_factory or httpx.Client
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay

    def generate_ai_review_draft(self, payload: Mapping[str, Any]) -> NormalizedAIReviewDraft:
        providers = self._build_provider_chain()
        last_error: str | None = None

        for index, provider_name in enumerate(providers):
            fallback_used = index > 0
            try:
                raw_response = self._call_provider_with_retries(provider_name, payload)
                return self._normalize_result(
                    raw_response,
                    valid_assignee_ids=self._normalize_valid_assignee_ids(payload.get("valid_assignee_ids")),
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                )
            except ProviderRetryableError as exc:
                last_error = str(exc)
                logger.warning(
                    "Provider '%s' exhausted retries: %s. Moving to next provider.",
                    provider_name, exc,
                )
                continue
            except ProviderFatalError as exc:
                logger.error("Provider '%s' fatal error: %s", provider_name, exc)
                return self._build_failed_result(
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                    error_message=str(exc),
                )

        return self._build_failed_result(
            provider_used=providers[-1] if providers else self.settings.ai_primary_provider,
            fallback_used=len(providers) > 1,
            error_message=last_error or "No AI provider is configured.",
        )

    def generate_ai_review_drafts_batch(
        self,
        payloads: list[Mapping[str, Any]],
    ) -> list[NormalizedAIReviewDraft]:
        if not payloads:
            return []

        providers = self._build_provider_chain()
        last_error: str | None = None

        for index, provider_name in enumerate(providers):
            fallback_used = index > 0
            try:
                raw_response = self._call_provider_with_retries(
                    provider_name,
                    {"reviews": payloads},
                    task_type="review_batch",
                )
                return self._normalize_batch_results(
                    raw_response,
                    payloads=payloads,
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                )
            except ProviderRetryableError as exc:
                last_error = str(exc)
                logger.warning(
                    "Provider '%s' exhausted retries for batched review: %s. Moving to next provider.",
                    provider_name,
                    exc,
                )
                continue
            except ProviderFatalError as exc:
                logger.error("Provider '%s' fatal error for batched review: %s", provider_name, exc)
                return [
                    self._build_failed_result(
                        provider_used=provider_name,
                        fallback_used=fallback_used,
                        error_message=str(exc),
                    )
                    for _payload in payloads
                ]

        return [
            self._build_failed_result(
                provider_used=providers[-1] if providers else self.settings.ai_primary_provider,
                fallback_used=len(providers) > 1,
                error_message=last_error or "No AI provider is configured.",
            )
            for _payload in payloads
        ]

    def generate_ai_summary_draft(self, payload: Mapping[str, Any]) -> NormalizedAISummaryDraft:
        providers = self._build_provider_chain()
        last_error: str | None = None

        for index, provider_name in enumerate(providers):
            fallback_used = index > 0
            try:
                raw_response = self._call_provider_with_retries(provider_name, payload, task_type="summary")
                return NormalizedAISummaryDraft(
                    summary_text=self._normalize_optional_text(raw_response.get("summary_text")) or "Summary not generated.",
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                    error_message=None,
                )
            except ProviderRetryableError as exc:
                last_error = str(exc)
                logger.warning(
                    "Provider '%s' exhausted retries for summary: %s. Moving to next provider.",
                    provider_name, exc,
                )
                continue
            except ProviderFatalError as exc:
                logger.error("Provider '%s' fatal error for summary: %s", provider_name, exc)
                return NormalizedAISummaryDraft(
                    summary_text="",
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                    error_message=str(exc),
                )

        return NormalizedAISummaryDraft(
            summary_text="",
            provider_used=providers[-1] if providers else self.settings.ai_primary_provider,
            fallback_used=len(providers) > 1,
            error_message=last_error or "No AI provider is configured.",
        )

    def generate_requirement_candidates(
        self, payload: Mapping[str, Any]
    ) -> NormalizedRequirementExtractionResult:
        providers = self._build_provider_chain()
        last_error: str | None = None

        for index, provider_name in enumerate(providers):
            fallback_used = index > 0
            try:
                raw_response = self._call_provider_with_retries(
                    provider_name,
                    payload,
                    task_type="requirement_extraction",
                )
                return NormalizedRequirementExtractionResult(
                    candidates=self._normalize_requirement_candidates(raw_response),
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                    error_message=None,
                )
            except ProviderRetryableError as exc:
                last_error = str(exc)
                logger.warning(
                    "Provider '%s' exhausted retries for requirement extraction: %s. Moving to next provider.",
                    provider_name, exc,
                )
                continue
            except ProviderFatalError as exc:
                logger.error("Provider '%s' fatal error for requirement extraction: %s", provider_name, exc)
                return NormalizedRequirementExtractionResult(
                    candidates=[],
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                    error_message=str(exc),
                )

        return NormalizedRequirementExtractionResult(
            candidates=[],
            provider_used=providers[-1] if providers else self.settings.ai_primary_provider,
            fallback_used=len(providers) > 1,
            error_message=last_error or "No AI provider is configured.",
        )

    def generate_traceability_suggestions(
        self, payload: Mapping[str, Any]
    ) -> "NormalizedTraceabilitySuggestionResult":
        providers = self._build_provider_chain()
        last_error: str | None = None

        for index, provider_name in enumerate(providers):
            fallback_used = index > 0
            try:
                raw_response = self._call_provider_with_retries(
                    provider_name,
                    payload,
                    task_type="traceability_suggest",
                )
                return NormalizedTraceabilitySuggestionResult(
                    suggestions=self._normalize_traceability_suggestions(raw_response),
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                    error_message=None,
                )
            except ProviderRetryableError as exc:
                last_error = str(exc)
                logger.warning(
                    "Provider '%s' exhausted retries for traceability suggest: %s. Moving to next provider.",
                    provider_name, exc,
                )
                continue
            except ProviderFatalError as exc:
                logger.error("Provider '%s' fatal error for traceability suggest: %s", provider_name, exc)
                return NormalizedTraceabilitySuggestionResult(
                    suggestions=[],
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                    error_message=str(exc),
                )

        return NormalizedTraceabilitySuggestionResult(
            suggestions=[],
            provider_used=providers[-1] if providers else self.settings.ai_primary_provider,
            fallback_used=len(providers) > 1,
            error_message=last_error or "No AI provider is configured.",
        )

    def generate_contract_chat_answer(
        self,
        payload: Mapping[str, Any],
        *,
        should_cancel: Callable[[], bool] | None = None,
    ) -> NormalizedContractChatAnswer:
        self._raise_if_cancelled(should_cancel)
        providers = [
            provider_name
            for provider_name in self._build_provider_chain()
            if self._provider_has_credentials(provider_name)
        ]
        if not providers:
            return NormalizedContractChatAnswer(
                content="",
                provider_used=self.settings.ai_primary_provider,
                fallback_used=False,
                error_message="No AI provider is configured for Contract Q&A.",
            )

        last_error: str | None = None
        for index, provider_name in enumerate(providers):
            self._raise_if_cancelled(should_cancel)
            fallback_used = index > 0
            try:
                raw_response = self._call_provider_with_retries(
                    provider_name,
                    payload,
                    task_type="contract_chat",
                    should_cancel=should_cancel,
                )
                self._raise_if_cancelled(should_cancel)
                return NormalizedContractChatAnswer(
                    content=self._normalize_contract_chat_content(raw_response),
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                    error_message=None,
                )
            except ProviderRetryableError as exc:
                last_error = str(exc)
                logger.warning(
                    "Provider '%s' exhausted retries for contract chat: %s. Moving to next provider.",
                    provider_name, exc,
                )
                continue
            except ProviderFatalError as exc:
                logger.error("Provider '%s' fatal error for contract chat: %s", provider_name, exc)
                return NormalizedContractChatAnswer(
                    content="",
                    provider_used=provider_name,
                    fallback_used=fallback_used,
                    error_message=str(exc),
                )

        return NormalizedContractChatAnswer(
            content="",
            provider_used=providers[-1],
            fallback_used=len(providers) > 1,
            error_message=last_error or "No AI provider generated a Contract Q&A answer.",
        )

    def _provider_has_credentials(self, provider_name: str) -> bool:
        if provider_name == "gemini":
            return bool(self.settings.ai_gemini_api_key)
        if provider_name == "openai":
            return bool(self.settings.ai_openai_api_key)
        if provider_name == "openai_fallback":
            return bool(self.settings.ai_openai_fallback_api_key)
        return False

    def _call_provider_with_retries(
        self,
        provider_name: str,
        payload: Mapping[str, Any],
        task_type: str = "review",
        *,
        should_cancel: Callable[[], bool] | None = None,
    ) -> dict[str, Any]:
        last_exc: ProviderRetryableError | None = None
        for attempt in range(1, self.max_retries + 1):
            self._raise_if_cancelled(should_cancel)
            try:
                result = self._call_provider(provider_name, payload, task_type=task_type)
                self._raise_if_cancelled(should_cancel)
                return result
            except ProviderRetryableError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    delay = self._compute_retry_delay(exc, attempt)
                    logger.info(
                        "Provider '%s' attempt %d/%d failed (%s). Retrying in %.1fs...",
                        provider_name, attempt, self.max_retries, exc, delay,
                    )
                    self._sleep_with_cancel(delay, should_cancel)
                else:
                    logger.warning(
                        "Provider '%s' attempt %d/%d failed (%s). No more retries.",
                        provider_name, attempt, self.max_retries, exc,
                    )
        raise last_exc  # type: ignore[misc]

    def _compute_retry_delay(self, exc: ProviderRetryableError, attempt: int) -> float:
        """Compute delay before retrying, respecting Retry-After for rate-limits."""
        backoff_delay = self.retry_base_delay * (2 ** (attempt - 1))
        if isinstance(exc, ProviderRateLimitError):
            # For rate limits use at least the floor delay or retry_after hint
            floor = DEFAULT_RATE_LIMIT_FLOOR_DELAY
            if exc.retry_after is not None and exc.retry_after > 0:
                return max(exc.retry_after, floor)
            return max(backoff_delay, floor)
        return backoff_delay

    def _sleep_with_cancel(self, delay: float, should_cancel: Callable[[], bool] | None) -> None:
        if should_cancel is None:
            time.sleep(delay)
            return

        deadline = time.monotonic() + max(delay, 0.0)
        while True:
            self._raise_if_cancelled(should_cancel)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            time.sleep(min(remaining, 0.1))

    @staticmethod
    def _raise_if_cancelled(should_cancel: Callable[[], bool] | None) -> None:
        if should_cancel is not None and should_cancel():
            raise ProviderRequestCancelled()

    def _build_provider_chain(self) -> list[str]:
        providers = [self.settings.ai_primary_provider]
        fallback_provider = self.settings.ai_fallback_provider
        if fallback_provider and fallback_provider not in providers:
            providers.append(fallback_provider)
        return [provider for provider in providers if provider]

    def _call_provider(self, provider_name: str, payload: Mapping[str, Any], task_type: str = "review") -> dict[str, Any]:
        if provider_name == "gemini":
            return self._call_gemini(payload, task_type=task_type)
        if provider_name == "openai":
            return self._call_openai(payload, is_fallback=False, task_type=task_type)
        if provider_name == "openai_fallback":
            return self._call_openai(payload, is_fallback=True, task_type=task_type)
        raise ProviderFatalError(f"Unsupported AI provider '{provider_name}'.")

    def _call_gemini(self, payload: Mapping[str, Any], task_type: str = "review") -> dict[str, Any]:
        if not self.settings.ai_gemini_api_key:
            raise ProviderRetryableError("Gemini provider is not configured.")

        user_prompt = self._build_prompt_for_task(payload, task_type)
        request_payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_prompt}],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
            },
        }
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.settings.ai_gemini_model}:generateContent"
        )
        response_json = self._post_json(
            url,
            headers={"Content-Type": "application/json"},
            json_body=request_payload,
            params={"key": self.settings.ai_gemini_api_key},
            provider_name="gemini",
        )
        text = self._extract_gemini_text(response_json)
        return self._load_json_output(text, provider_name="gemini")

    def _call_openai(self, payload: Mapping[str, Any], is_fallback: bool = False, task_type: str = "review") -> dict[str, Any]:
        api_key = self.settings.ai_openai_fallback_api_key if is_fallback else self.settings.ai_openai_api_key
        model = self.settings.ai_openai_fallback_model if is_fallback else self.settings.ai_openai_model
        base_url = self.settings.ai_openai_fallback_base_url if is_fallback else self.settings.ai_openai_base_url

        if not api_key:
            raise ProviderRetryableError(f"{'Fallback' if is_fallback else 'Primary'} OpenAI-compatible provider is not configured.")

        base_url = (base_url or DEFAULT_OPENAI_BASE_URL).rstrip("/")
        system_prompt = self._build_system_prompt_for_task(task_type)
        user_prompt = self._build_prompt_for_task(payload, task_type)

        request_payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "stream": False,
        }
        response_json = self._post_json(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json_body=request_payload,
            provider_name="openai",
        )
        text = self._extract_openai_text(response_json)
        return self._load_json_output(text, provider_name="openai")

    def _post_json(
        self,
        url: str,
        *,
        headers: dict[str, str],
        json_body: dict[str, Any],
        provider_name: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            with self._client_factory(timeout=self.timeout_seconds) as client:
                response = client.post(url, headers=headers, json=json_body, params=params)
        except httpx.TimeoutException as exc:
            raise ProviderRetryableError(f"{provider_name} request timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderRetryableError(f"{provider_name} request failed before a response was returned.") from exc

        if response.status_code == 429:
            retry_after = self._parse_retry_after(response)
            raise ProviderRateLimitError(
                f"{provider_name} rate limited (429).",
                retry_after=retry_after,
            )
        if response.status_code in {408, 425} or response.status_code >= 500:
            raise ProviderRetryableError(
                f"{provider_name} request failed with status {response.status_code}."
            )
        if response.status_code >= 400:
            raise ProviderFatalError(
                f"{provider_name} request failed with status {response.status_code}."
            )

        try:
            response_json = response.json()
        except ValueError as exc:
            raise ProviderRetryableError(f"{provider_name} returned a non-JSON response.") from exc

        if not isinstance(response_json, dict):
            raise ProviderRetryableError(f"{provider_name} returned an unexpected response shape.")
        return response_json

    @staticmethod
    def _parse_retry_after(response: httpx.Response) -> float | None:
        """Extract Retry-After header value in seconds, if present."""
        raw = response.headers.get("retry-after")
        if raw is None:
            return None
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None

    def _normalize_result(
        self,
        raw_response: Mapping[str, Any],
        *,
        valid_assignee_ids: set[int],
        provider_used: str,
        fallback_used: bool,
    ) -> NormalizedAIReviewDraft:
        explanation = self._normalize_required_text(raw_response.get("explanation"), "explanation")
        recommended_review_status = self._normalize_review_status(
            raw_response.get("recommended_review_status")
        )
        suggested_assignee_user_id = self._normalize_assignee(
            raw_response.get("suggested_assignee_user_id"),
            valid_assignee_ids,
        )
        return NormalizedAIReviewDraft(
            suggested_assignee_user_id=suggested_assignee_user_id,
            recommended_review_status=recommended_review_status,
            explanation=explanation,
            risk_level=self._normalize_optional_text(raw_response.get("risk_level")),
            draft_comment=self._normalize_optional_text(raw_response.get("draft_comment")),
            suggested_checks=self._normalize_suggested_checks(raw_response.get("suggested_checks")),
            confidence=self._normalize_confidence(raw_response.get("confidence")),
            generation_status="generated",
            provider_used=provider_used,
            fallback_used=fallback_used,
            error_message=None,
        )

    def _normalize_batch_results(
        self,
        raw_response: Mapping[str, Any],
        *,
        payloads: list[Mapping[str, Any]],
        provider_used: str,
        fallback_used: bool,
    ) -> list[NormalizedAIReviewDraft]:
        raw_reviews = raw_response.get("reviews")
        if not isinstance(raw_reviews, list):
            raise ProviderRetryableError("AI batch output is missing a reviews array.")

        reviews_by_change_item_id: dict[int, Mapping[str, Any]] = {}
        positional_reviews: list[Mapping[str, Any]] = []
        for raw_review in raw_reviews:
            if not isinstance(raw_review, Mapping):
                raise ProviderRetryableError("AI batch output contains a non-object review.")
            positional_reviews.append(raw_review)
            raw_change_item_id = raw_review.get("change_item_id")
            if isinstance(raw_change_item_id, int):
                reviews_by_change_item_id[raw_change_item_id] = raw_review

        if len(positional_reviews) < len(payloads):
            raise ProviderRetryableError("AI batch output returned fewer reviews than requested.")

        normalized_results: list[NormalizedAIReviewDraft] = []
        for payload_index, payload in enumerate(payloads):
            raw_change_item_id = payload.get("change_item_id")
            raw_review = None
            if isinstance(raw_change_item_id, int):
                raw_review = reviews_by_change_item_id.get(raw_change_item_id)
            if raw_review is None:
                raw_review = positional_reviews[payload_index]

            normalized_results.append(
                self._normalize_result(
                    raw_review,
                    valid_assignee_ids=self._normalize_valid_assignee_ids(
                        payload.get("valid_assignee_ids")
                    ),
                    provider_used=provider_used,
                    fallback_used=fallback_used,
                )
            )

        return normalized_results

    def _extract_gemini_text(self, response_json: Mapping[str, Any]) -> str:
        candidates = response_json.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise ProviderRetryableError("gemini returned no candidates.")
        content = candidates[0].get("content")
        if not isinstance(content, dict):
            raise ProviderRetryableError("gemini response is missing content.")
        parts = content.get("parts")
        if not isinstance(parts, list) or not parts:
            raise ProviderRetryableError("gemini response is missing content parts.")
        text_parts = [
            part.get("text")
            for part in parts
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        ]
        text = "\n".join(text_parts).strip()
        if not text:
            raise ProviderRetryableError("gemini response text is empty.")
        return text

    def _extract_openai_text(self, response_json: Mapping[str, Any]) -> str:
        choices = response_json.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ProviderRetryableError("openai returned no choices.")
        message = choices[0].get("message")
        if not isinstance(message, dict):
            raise ProviderRetryableError("openai response is missing a message.")
        content = message.get("content")
        if isinstance(content, str):
            text = content.strip()
        elif isinstance(content, list):
            text = "\n".join(self._extract_text_parts(content)).strip()
        else:
            text = ""
        if not text:
            raise ProviderRetryableError("openai response text is empty.")
        return text

    def _extract_text_parts(self, parts: Iterable[Any]) -> list[str]:
        texts: list[str] = []
        for part in parts:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str):
                texts.append(text)
        return texts

    def _load_json_output(self, text: str, *, provider_name: str) -> dict[str, Any]:
        normalized_text = text.strip()
        if normalized_text.startswith("```"):
            normalized_text = normalized_text.strip("`")
            normalized_text = normalized_text.removeprefix("json").strip()

        json_candidate = normalized_text
        if not json_candidate.startswith("{"):
            start = normalized_text.find("{")
            end = normalized_text.rfind("}")
            if start != -1 and end != -1 and start < end:
                json_candidate = normalized_text[start : end + 1]

        try:
            payload = json.loads(json_candidate)
        except json.JSONDecodeError as exc:
            raise ProviderRetryableError(f"{provider_name} returned invalid JSON output.") from exc

        if not isinstance(payload, dict):
            raise ProviderRetryableError(f"{provider_name} returned a non-object JSON payload.")
        return payload

    def _build_system_prompt(self) -> str:
        return (
            "You are Redline AI Review Copilot. "
            "Return JSON only. "
            "Use only these keys: suggested_assignee_user_id, recommended_review_status, "
            "explanation, risk_level, draft_comment, suggested_checks, confidence. "
            "recommended_review_status must be open or in_review."
        )

    def _build_review_batch_system_prompt(self) -> str:
        return (
            "You are Redline AI Review Batch Copilot. "
            "Return JSON only. "
            "Use only this top-level key: reviews. "
            "reviews must be an array with one object for each requested review. "
            "Each object must include change_item_id and these keys: suggested_assignee_user_id, "
            "recommended_review_status, explanation, risk_level, draft_comment, suggested_checks, confidence. "
            "recommended_review_status must be open or in_review. "
            "Do not merge, skip, or reorder requested reviews."
        )

    def _build_user_prompt(self, payload: Mapping[str, Any]) -> str:
        prompt_payload = self._to_json_safe(payload)
        prompt_body = json.dumps(prompt_payload, ensure_ascii=True, sort_keys=True, indent=2)
        return (
            f"{self._build_system_prompt()}\n"
            "Use the review context below and respond with a single JSON object.\n"
            f"{prompt_body}"
        )

    def _build_review_batch_user_prompt(self, payload: Mapping[str, Any]) -> str:
        prompt_payload = self._to_json_safe(payload)
        prompt_body = json.dumps(prompt_payload, ensure_ascii=True, sort_keys=True, indent=2)
        return (
            f"{self._build_review_batch_system_prompt()}\n"
            "Use the review contexts below and respond with a single JSON object.\n"
            f"{prompt_body}"
        )

    def _build_summary_system_prompt(self) -> str:
        return (
            "You are Redline AI Review Summary Generator. "
            "Return JSON only. "
            "Use only this key: summary_text. "
            "Provide a coherent, export-ready draft summary of the provided document compare context."
        )

    def _build_summary_user_prompt(self, payload: Mapping[str, Any]) -> str:
        prompt_payload = self._to_json_safe(payload)
        prompt_body = json.dumps(prompt_payload, ensure_ascii=True, sort_keys=True, indent=2)
        return (
            f"{self._build_summary_system_prompt()}\\n"
            "Use the compare/review context below and respond with a single JSON object.\n"
            f"{prompt_body}"
        )

    def _build_requirement_extraction_system_prompt(self) -> str:
        return (
            "You are Redline AI Requirement Extractor. "
            "Return JSON only. "
            "Use only this top-level key: requirements. "
            "requirements must be an array of objects with these keys: requirement_code, title, "
            "description, source_section, source_block_key, confidence. "
            "Extract only concrete software requirements from the provided parsed blocks. "
            "Do not invent requirements that are not grounded in a block."
        )

    def _build_requirement_extraction_user_prompt(self, payload: Mapping[str, Any]) -> str:
        prompt_payload = self._to_json_safe(payload)
        prompt_body = json.dumps(prompt_payload, ensure_ascii=True, sort_keys=True, indent=2)
        return (
            f"{self._build_requirement_extraction_system_prompt()}\n"
            "Use the parsed DOCX blocks below and respond with a single JSON object.\n"
            f"{prompt_body}"
        )

    def _build_contract_chat_system_prompt(self) -> str:
        return (
            "You are Redline Contract Q&A Assistant. "
            "Return JSON only. "
            "Use only this top-level key: answer. "
            "Answer using only the supplied contract metadata, recent conversation, and cited evidence. "
            "For compare Q&A, explain only differences present in the supplied source/target evidence. "
            "Do not invent facts. If the evidence is insufficient, say that the supplied grounded evidence is not enough to answer. "
            "Preserve the user's language. When using evidence, cite it inline with bracket numbers like [1]."
        )

    def _build_contract_chat_user_prompt(self, payload: Mapping[str, Any]) -> str:
        prompt_payload = self._to_json_safe(payload)
        prompt_body = json.dumps(prompt_payload, ensure_ascii=False, sort_keys=True, indent=2)
        return (
            f"{self._build_contract_chat_system_prompt()}\n"
            "Use the Contract Q&A payload below and respond with a single JSON object.\n"
            f"{prompt_body}"
        )

    def _build_traceability_suggest_system_prompt(self) -> str:
        return (
            "You are Redline Traceability AI. "
            "Return JSON only. "
            "Use only this top-level key: suggestions. "
            "suggestions must be an array of objects, each with keys: "
            "requirement_code (string, must exactly match from the provided list), "
            "title (string, copy from provided list), "
            "confidence (float 0.0-1.0), "
            "rationale (string, max 2 sentences explaining the link), "
            "relevance_type (one of: directly_affected, indirectly_affected, related). "
            "Only include obligations with confidence >= 0.30. "
            "Sort by confidence descending. "
            "Do not include obligations not in the provided list. "
            "Do not invent or paraphrase requirement_codes."
        )

    def _build_traceability_suggest_user_prompt(self, payload: Mapping[str, Any]) -> str:
        prompt_payload = self._to_json_safe(payload)
        prompt_body = json.dumps(prompt_payload, ensure_ascii=True, sort_keys=True, indent=2)
        return (
            f"{self._build_traceability_suggest_system_prompt()}\n"
            "Use the change context and obligations list below and respond with a single JSON object.\n"
            f"{prompt_body}"
        )

    def _build_system_prompt_for_task(self, task_type: str) -> str:
        if task_type == "review_batch":
            return self._build_review_batch_system_prompt()
        if task_type == "summary":
            return self._build_summary_system_prompt()
        if task_type == "requirement_extraction":
            return self._build_requirement_extraction_system_prompt()
        if task_type == "contract_chat":
            return self._build_contract_chat_system_prompt()
        if task_type == "traceability_suggest":
            return self._build_traceability_suggest_system_prompt()
        return self._build_system_prompt()

    def _build_prompt_for_task(self, payload: Mapping[str, Any], task_type: str) -> str:
        if task_type == "review_batch":
            return self._build_review_batch_user_prompt(payload)
        if task_type == "summary":
            return self._build_summary_user_prompt(payload)
        if task_type == "requirement_extraction":
            return self._build_requirement_extraction_user_prompt(payload)
        if task_type == "contract_chat":
            return self._build_contract_chat_user_prompt(payload)
        if task_type == "traceability_suggest":
            return self._build_traceability_suggest_user_prompt(payload)
        return self._build_user_prompt(payload)

    def _to_json_safe(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {str(key): self._to_json_safe(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [self._to_json_safe(item) for item in value]
        if isinstance(value, set):
            return [self._to_json_safe(item) for item in sorted(value)]
        return value

    def _normalize_valid_assignee_ids(self, value: Any) -> set[int]:
        if not isinstance(value, (list, tuple, set)):
            return set()
        normalized: set[int] = set()
        for item in value:
            if isinstance(item, int):
                normalized.add(item)
        return normalized

    def _normalize_review_status(self, value: Any) -> str:
        if isinstance(value, str) and value in ALLOWED_REVIEW_STATUSES:
            return value
        return "open"

    def _normalize_assignee(self, value: Any, valid_assignee_ids: set[int]) -> int | None:
        if not isinstance(value, int):
            return None
        if value not in valid_assignee_ids:
            return None
        return value

    def _normalize_required_text(self, value: Any, field_name: str) -> str:
        normalized = self._normalize_optional_text(value)
        if normalized:
            return normalized
        raise ProviderRetryableError(f"AI output is missing required field '{field_name}'.")

    def _normalize_optional_text(self, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return str(value).strip() or None

    def _normalize_contract_chat_content(self, raw_response: Mapping[str, Any]) -> str:
        answer = self._normalize_optional_text(raw_response.get("answer"))
        if answer is None:
            answer = self._normalize_optional_text(raw_response.get("content"))
        if answer:
            return answer
        raise ProviderRetryableError("AI output is missing required field 'answer'.")

    def _normalize_suggested_checks(self, value: Any) -> str | None:
        if isinstance(value, list):
            normalized_items = [
                item.strip() for item in value if isinstance(item, str) and item.strip()
            ]
            return "\n".join(normalized_items) if normalized_items else None
        return self._normalize_optional_text(value)

    def _normalize_traceability_suggestions(
        self,
        raw_response: Mapping[str, Any],
    ) -> list[NormalizedTraceabilitySuggestion]:
        raw_items = raw_response.get("suggestions")
        if not isinstance(raw_items, list):
            raise ProviderRetryableError("AI output is missing a suggestions array.")

        valid_relevance_types = {"directly_affected", "indirectly_affected", "related"}
        suggestions: list[NormalizedTraceabilitySuggestion] = []
        seen_codes: set[str] = set()
        for item in raw_items:
            if not isinstance(item, Mapping):
                continue
            requirement_code = self._normalize_optional_text(item.get("requirement_code"))
            if not requirement_code:
                continue
            if requirement_code in seen_codes:
                continue
            seen_codes.add(requirement_code)
            confidence = self._normalize_confidence(item.get("confidence")) or 0.0
            if confidence < 0.30:
                continue
            relevance_type = self._normalize_optional_text(item.get("relevance_type")) or "related"
            if relevance_type not in valid_relevance_types:
                relevance_type = "related"
            suggestions.append(
                NormalizedTraceabilitySuggestion(
                    requirement_code=requirement_code[:100],
                    title=self._normalize_optional_text(item.get("title")) or requirement_code,
                    confidence=confidence,
                    rationale=self._normalize_optional_text(item.get("rationale")),
                    relevance_type=relevance_type,
                )
            )
        suggestions.sort(key=lambda s: s.confidence, reverse=True)
        return suggestions

    def _normalize_requirement_candidates(
        self,
        raw_response: Mapping[str, Any],
    ) -> list[NormalizedRequirementCandidate]:
        raw_items = raw_response.get("requirements")
        if raw_items is None:
            raw_items = raw_response.get("candidates")
        if not isinstance(raw_items, list):
            raise ProviderRetryableError("AI output is missing a requirements array.")

        candidates: list[NormalizedRequirementCandidate] = []
        seen_keys: set[tuple[str, str | None]] = set()
        for item in raw_items:
            if not isinstance(item, Mapping):
                continue
            requirement_code = self._normalize_optional_text(item.get("requirement_code"))
            title = self._normalize_optional_text(item.get("title"))
            description = self._normalize_optional_text(item.get("description"))
            source_block_key = self._normalize_optional_text(item.get("source_block_key"))
            if not requirement_code or not title:
                continue

            dedupe_key = (requirement_code, source_block_key)
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)

            candidates.append(
                NormalizedRequirementCandidate(
                    requirement_code=requirement_code[:100],
                    title=title[:255],
                    description=description,
                    source_section=self._normalize_optional_text(item.get("source_section")),
                    source_block_key=source_block_key,
                    confidence=self._normalize_confidence(item.get("confidence")),
                )
            )
        return candidates

    def _normalize_confidence(self, value: Any) -> float | None:
        if value is None:
            return None
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            return None
        return max(0.0, min(1.0, numeric_value))

    def _build_failed_result(
        self,
        *,
        provider_used: str,
        fallback_used: bool,
        error_message: str,
    ) -> NormalizedAIReviewDraft:
        return NormalizedAIReviewDraft(
            suggested_assignee_user_id=None,
            recommended_review_status="open",
            explanation="AI draft generation failed.",
            risk_level=None,
            draft_comment=None,
            suggested_checks=None,
            confidence=None,
            generation_status="failed",
            provider_used=provider_used,
            fallback_used=fallback_used,
            error_message=error_message,
        )
