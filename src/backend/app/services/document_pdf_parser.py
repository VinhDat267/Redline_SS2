from __future__ import annotations

import os
import re
from collections import Counter
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from statistics import mean

import fitz
import pytesseract
from PIL import Image

from app.core.config import Settings, settings
from app.services.document_parser import (
    ParsedBlockDraft,
    ParsedDocumentDraft,
    ParsedSurfaceDraft,
    build_block_key,
    normalize_content,
)


_TOKEN_RE = re.compile(r"\w+", re.UNICODE)
_NUMBERED_HEADING_RE = re.compile(r"^(?P<number>\d+(?:\.\d+){0,5})\.?\s+\S")
_LIST_ITEM_RE = re.compile(r"^(?:\([A-Za-z0-9]+\)|[A-Za-z0-9]+[.)]|[-*+])\s+\S")
_LEGAL_HEADING_RE = re.compile(r"^(?:article|section|clause)\s+\d+", re.IGNORECASE)
_MATERIAL_TABLE_KEYWORDS = {
    "amount",
    "credit",
    "due",
    "fee",
    "milestone",
    "payment",
    "price",
    "pricing",
    "service",
    "sla",
}
_MONEY_OR_DATE_RE = re.compile(
    r"(?:[$]\s?\d|\b(?:EUR|GBP|USD|VND)\s?\d|\d{4}-\d{2}-\d{2}|\d+\s?%)",
    re.IGNORECASE,
)


@dataclass(slots=True)
class ParserDiagnostic:
    code: str
    severity: str
    message: str
    count: int = 1
    samples: list[str] = field(default_factory=list)
    metadata: dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        return {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "count": self.count,
            "samples": self.samples,
            "metadata": self.metadata,
        }


@dataclass(slots=True)
class ParserCoverage:
    policy_result: str
    canonical_text_length: int
    secondary_text_length: int
    expected_token_count: int
    retained_token_count: int
    low_confidence_token_ratio: float | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "policy_result": self.policy_result,
            "canonical_text_length": self.canonical_text_length,
            "secondary_text_length": self.secondary_text_length,
            "expected_token_count": self.expected_token_count,
            "retained_token_count": self.retained_token_count,
            "low_confidence_token_ratio": self.low_confidence_token_ratio,
        }


@dataclass(slots=True)
class PdfSummary:
    page_count: int
    text_layer_page_count: int
    ocr_page_count: int
    failed_page_count: int
    table_like_page_count: int
    extraction_modes_by_page: dict[int, str]
    ocr_languages: str
    average_ocr_confidence: float | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "page_count": self.page_count,
            "text_layer_page_count": self.text_layer_page_count,
            "ocr_page_count": self.ocr_page_count,
            "failed_page_count": self.failed_page_count,
            "table_like_page_count": self.table_like_page_count,
            "extraction_modes_by_page": {
                str(page_number): mode
                for page_number, mode in self.extraction_modes_by_page.items()
            },
            "ocr_languages": self.ocr_languages,
            "average_ocr_confidence": self.average_ocr_confidence,
        }


@dataclass(slots=True)
class ParserQualityReport:
    policy_result: str
    coverage: ParserCoverage
    diagnostics: list[ParserDiagnostic] = field(default_factory=list)
    failure_message: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "policy_result": self.policy_result,
            "coverage": self.coverage.to_dict(),
            "diagnostics": [diagnostic.to_dict() for diagnostic in self.diagnostics],
            "failure_message": self.failure_message,
        }


@dataclass(slots=True)
class OcrPageResult:
    text: str
    average_confidence: float
    retained_token_count: int
    low_confidence_token_ratio: float
    languages: str
    dpi: int


@dataclass(slots=True)
class _PageText:
    page_number: int
    text: str
    extraction_mode: str
    ocr_result: OcrPageResult | None = None


def build_pdf_document_draft(
    file_path: Path,
    *,
    parser_settings: Settings = settings,
) -> ParsedDocumentDraft:
    try:
        pdf_document = fitz.open(file_path)
    except Exception as exc:  # pragma: no cover - library-specific failure surface
        raise ValueError("Unable to open .pdf file") from exc

    diagnostics: list[ParserDiagnostic] = []
    warnings: list[str] = []
    pages: list[_PageText] = []
    extraction_modes_by_page: dict[int, str] = {}

    try:
        for page_index, page in enumerate(pdf_document):
            page_number = page_index + 1
            native_text = page.get_text("text") or ""
            if _text_layer_is_reliable(native_text, parser_settings):
                pages.append(
                    _PageText(
                        page_number=page_number,
                        text=native_text,
                        extraction_mode="text_layer",
                    )
                )
                extraction_modes_by_page[page_number] = "text_layer"
                continue

            if _page_ink_ratio(page, parser_settings) <= parser_settings.pdf_blank_page_max_ink_ratio:
                extraction_modes_by_page[page_number] = "ignored_blank"
                continue

            if not parser_settings.pdf_ocr_enabled:
                diagnostics.append(
                    ParserDiagnostic(
                        code="pdf_text_layer_unreliable",
                        severity="error",
                        message="PDF page has no reliable text layer and OCR is disabled.",
                        samples=[normalize_content(native_text)[:160]],
                        metadata={
                            "page": page_number,
                            "extraction_mode": "text_layer",
                        },
                    )
                )
                extraction_modes_by_page[page_number] = "failed"
                continue

            try:
                ocr_result = run_ocr_for_page(page, page_index, parser_settings)
            except Exception as exc:  # pragma: no cover - depends on local Tesseract
                diagnostics.append(
                    ParserDiagnostic(
                        code="pdf_ocr_runtime_failed",
                        severity="error",
                        message="PDF OCR fallback failed before producing trusted text.",
                        samples=[str(exc)],
                        metadata={
                            "page": page_number,
                            "extraction_mode": "ocr",
                            "languages": parser_settings.pdf_ocr_languages,
                        },
                    )
                )
                extraction_modes_by_page[page_number] = "failed"
                continue

            ocr_failure = _ocr_quality_failure(ocr_result, parser_settings)
            if ocr_failure is not None:
                diagnostics.append(
                    ParserDiagnostic(
                        code="pdf_ocr_quality_failed",
                        severity="error",
                        message=ocr_failure,
                        samples=[normalize_content(ocr_result.text)[:160]],
                        metadata={
                            "page": page_number,
                            "confidence": ocr_result.average_confidence,
                            "retained_token_count": ocr_result.retained_token_count,
                            "low_confidence_token_ratio": ocr_result.low_confidence_token_ratio,
                            "extraction_mode": "ocr",
                            "languages": ocr_result.languages,
                            "dpi": ocr_result.dpi,
                        },
                    )
                )
                extraction_modes_by_page[page_number] = "failed"
                continue

            pages.append(
                _PageText(
                    page_number=page_number,
                    text=ocr_result.text,
                    extraction_mode="ocr",
                    ocr_result=ocr_result,
                )
            )
            extraction_modes_by_page[page_number] = "ocr"
            warnings.append(f"PDF OCR fallback used on page {page_number}")
            diagnostics.append(
                ParserDiagnostic(
                    code="pdf_ocr_used",
                    severity="warning",
                    message="PDF page used local OCR fallback as parser truth.",
                    samples=[normalize_content(ocr_result.text)[:160]],
                    metadata={
                        "page": page_number,
                        "confidence": ocr_result.average_confidence,
                        "retained_token_count": ocr_result.retained_token_count,
                        "low_confidence_token_ratio": ocr_result.low_confidence_token_ratio,
                        "extraction_mode": "ocr",
                        "languages": ocr_result.languages,
                        "dpi": ocr_result.dpi,
                    },
                )
            )
    finally:
        page_count = pdf_document.page_count
        pdf_document.close()

    table_like_pages = [page.page_number for page in pages if _has_material_table_like_text(page.text)]
    if table_like_pages:
        diagnostics.append(
            ParserDiagnostic(
                code="pdf_material_table_unstructured",
                severity="error",
                message="PDF contains material table-like text that is not safe to flatten as parser truth.",
                count=len(table_like_pages),
                samples=[f"page {page_number}" for page_number in table_like_pages[:5]],
                metadata={
                    "pages": table_like_pages,
                    "impact_policy": "fail",
                    "extraction_mode": "text_or_ocr",
                },
            )
        )

    surfaces, canonical_text = _build_page_surfaces(pages)
    ocr_confidences = [
        page.ocr_result.average_confidence
        for page in pages
        if page.ocr_result is not None
    ]
    secondary_text = "\n".join(page.text for page in pages)
    total_tokens = _count_tokens(secondary_text)
    retained_tokens = sum(
        page.ocr_result.retained_token_count if page.ocr_result is not None else _count_tokens(page.text)
        for page in pages
    )
    max_low_confidence_ratio = max(
        (
            page.ocr_result.low_confidence_token_ratio
            for page in pages
            if page.ocr_result is not None
        ),
        default=None,
    )

    has_errors = any(diagnostic.severity == "error" for diagnostic in diagnostics)
    if not surfaces and not has_errors:
        diagnostics.append(
            ParserDiagnostic(
                code="pdf_no_extractable_truth",
                severity="error",
                message="PDF parser produced no valid page text blocks.",
                metadata={"impact_policy": "fail"},
            )
        )
        has_errors = True

    policy_result = "fail" if has_errors else "warn" if warnings else "pass"
    if policy_result == "fail":
        surfaces = []

    pdf_summary = PdfSummary(
        page_count=page_count,
        text_layer_page_count=sum(1 for page in pages if page.extraction_mode == "text_layer"),
        ocr_page_count=sum(1 for page in pages if page.extraction_mode == "ocr"),
        failed_page_count=sum(1 for mode in extraction_modes_by_page.values() if mode == "failed"),
        table_like_page_count=len(table_like_pages),
        extraction_modes_by_page=extraction_modes_by_page,
        ocr_languages=parser_settings.pdf_ocr_languages,
        average_ocr_confidence=round(mean(ocr_confidences), 2) if ocr_confidences else None,
    )
    quality_report = ParserQualityReport(
        policy_result=policy_result,
        coverage=ParserCoverage(
            policy_result=policy_result,
            canonical_text_length=len(canonical_text),
            secondary_text_length=len(secondary_text),
            expected_token_count=total_tokens,
            retained_token_count=retained_tokens,
            low_confidence_token_ratio=max_low_confidence_ratio,
        ),
        diagnostics=diagnostics,
        failure_message="PDF parser quality policy failed" if policy_result == "fail" else None,
    )

    return ParsedDocumentDraft(
        surfaces=surfaces,
        warnings=warnings,
        quality_report=quality_report,
        pdf_summary=pdf_summary,
    )


def run_ocr_for_page(
    page,
    page_index: int,
    parser_settings: Settings,
) -> OcrPageResult:
    if parser_settings.tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = parser_settings.tesseract_cmd
    if parser_settings.tessdata_prefix:
        os.environ["TESSDATA_PREFIX"] = parser_settings.tessdata_prefix

    dpi = parser_settings.pdf_ocr_dpi
    zoom = dpi / 72
    pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    image = Image.open(BytesIO(pixmap.tobytes("png")))
    data = pytesseract.image_to_data(
        image,
        lang=parser_settings.pdf_ocr_languages,
        output_type=pytesseract.Output.DICT,
    )

    words: list[str] = []
    confidences: list[float] = []
    low_confidence_count = 0
    for text, confidence_raw in zip(data.get("text", []), data.get("conf", []), strict=False):
        normalized_word = normalize_content(str(text))
        if not normalized_word:
            continue
        try:
            confidence = float(confidence_raw)
        except (TypeError, ValueError):
            continue
        if confidence < 0:
            continue
        words.append(normalized_word)
        confidences.append(confidence)
        if confidence < parser_settings.pdf_ocr_min_confidence:
            low_confidence_count += 1

    average_confidence = round(mean(confidences), 2) if confidences else 0.0
    retained_token_count = len(words)
    low_confidence_token_ratio = (
        low_confidence_count / retained_token_count
        if retained_token_count
        else 1.0
    )
    return OcrPageResult(
        text=" ".join(words),
        average_confidence=average_confidence,
        retained_token_count=retained_token_count,
        low_confidence_token_ratio=round(low_confidence_token_ratio, 4),
        languages=parser_settings.pdf_ocr_languages,
        dpi=dpi,
    )


def _text_layer_is_reliable(text: str, parser_settings: Settings) -> bool:
    normalized = normalize_content(text)
    if len(normalized) < parser_settings.pdf_text_min_chars_per_page:
        return False

    tokens = _tokens(normalized)
    if len(tokens) < parser_settings.pdf_text_min_tokens_per_page:
        return False

    non_space = [character for character in normalized if not character.isspace()]
    if not non_space:
        return False
    printable_ratio = sum(1 for character in non_space if character.isprintable()) / len(non_space)
    if printable_ratio < parser_settings.pdf_text_min_printable_ratio:
        return False

    token_counts = Counter(token.lower() for token in tokens)
    duplicate_ratio = sum(count - 1 for count in token_counts.values()) / len(tokens)
    return duplicate_ratio <= parser_settings.pdf_text_max_duplicate_token_ratio


def _page_ink_ratio(page, parser_settings: Settings) -> float:
    zoom = max(parser_settings.pdf_ocr_dpi / 72 / 8, 0.25)
    pixmap = page.get_pixmap(
        matrix=fitz.Matrix(zoom, zoom),
        colorspace=fitz.csGRAY,
        alpha=False,
    )
    if not pixmap.samples:
        return 0.0
    dark_pixels = sum(1 for sample in pixmap.samples if sample < 245)
    return dark_pixels / len(pixmap.samples)


def _ocr_quality_failure(
    ocr_result: OcrPageResult,
    parser_settings: Settings,
) -> str | None:
    if ocr_result.average_confidence < parser_settings.pdf_ocr_min_confidence:
        return "OCR average confidence is below the configured parser truth threshold."
    if ocr_result.retained_token_count < parser_settings.pdf_ocr_min_retained_tokens:
        return "OCR retained too few tokens for reliable parser truth."
    if (
        ocr_result.low_confidence_token_ratio
        > parser_settings.pdf_ocr_max_low_confidence_token_ratio
    ):
        return "OCR has too many low-confidence tokens for reliable parser truth."
    return None


def _build_page_surfaces(pages: list[_PageText]) -> tuple[list[ParsedSurfaceDraft], str]:
    surfaces: list[ParsedSurfaceDraft] = []
    canonical_parts: list[str] = []
    next_order_index = 0
    current_section_title: str | None = None

    for page in pages:
        blocks: list[ParsedBlockDraft] = []
        for raw_block in _split_text_blocks(page.text):
            normalized = normalize_content(raw_block)
            if not normalized:
                continue

            block_type, heading_level = _classify_pdf_block(normalized)
            section_title = current_section_title
            if block_type == "heading":
                section_title = normalized
                current_section_title = normalized

            blocks.append(
                ParsedBlockDraft(
                    block_key=build_block_key(next_order_index, block_type, normalized),
                    block_type=block_type,
                    section_title=section_title,
                    heading_level=heading_level,
                    order_index=next_order_index,
                    surface_order_index=len(blocks),
                    raw_content=raw_block,
                    normalized_content=normalized,
                )
            )
            canonical_parts.append(normalized)
            next_order_index += 1

        if not blocks:
            continue

        surfaces.append(
            ParsedSurfaceDraft(
                surface_type="page",
                surface_key=f"pdf-page-{page.page_number}",
                logical_order_index=len(surfaces),
                section_ref=f"page-{page.page_number}",
                notes=f"PDF extraction mode: {page.extraction_mode}",
                blocks=blocks,
                tables=[],
            )
        )

    return surfaces, "\n".join(canonical_parts)


def _split_text_blocks(text: str) -> list[str]:
    blocks: list[str] = []
    paragraph_lines: list[str] = []
    for line in text.splitlines():
        normalized_line = normalize_content(line)
        if not normalized_line:
            if paragraph_lines:
                blocks.append(" ".join(paragraph_lines))
                paragraph_lines = []
            continue
        blocks.append(normalized_line)
    if paragraph_lines:
        blocks.append(" ".join(paragraph_lines))
    return blocks


def _classify_pdf_block(normalized_content: str) -> tuple[str, int | None]:
    heading_level = _extract_heading_level(normalized_content)
    if heading_level is not None:
        return "heading", heading_level
    if _LIST_ITEM_RE.match(normalized_content):
        return "list_item", None
    return "paragraph", None


def _extract_heading_level(normalized_content: str) -> int | None:
    if len(normalized_content) > 120:
        return None
    match = _NUMBERED_HEADING_RE.match(normalized_content)
    if match is not None:
        segments = [segment for segment in match.group("number").split(".") if segment]
        return min(max(len(segments), 1), 6)
    if _LEGAL_HEADING_RE.match(normalized_content):
        return 1
    return None


def _has_material_table_like_text(text: str) -> bool:
    lines = [normalize_content(line).lower() for line in text.splitlines() if normalize_content(line)]
    if len(lines) < 2:
        return False

    keyword_hits = sum(
        1
        for keyword in _MATERIAL_TABLE_KEYWORDS
        if any(keyword in line for line in lines)
    )
    value_hits = sum(1 for line in lines if _MONEY_OR_DATE_RE.search(line))
    column_like_lines = sum(
        1
        for line in lines
        if len(_tokens(line)) >= 3 and ("  " in line or "\t" in line)
    )
    compact_column_lines = sum(
        1
        for line in lines
        if len(_tokens(line)) >= 4 and _MONEY_OR_DATE_RE.search(line)
    )
    return keyword_hits >= 2 and value_hits >= 1 and (column_like_lines >= 1 or compact_column_lines >= 1)


def _tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall(text)


def _count_tokens(text: str) -> int:
    return len(_tokens(text))
