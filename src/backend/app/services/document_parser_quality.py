import re
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from zipfile import ZipFile

from lxml import etree


_TOKEN_RE = re.compile(r"\w+", re.UNICODE)
_WHITESPACE_RE = re.compile(r"\s+")
_WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
_V_NS = "urn:schemas-microsoft-com:vml"
_DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_WORD_NSMAP = {"w": _WORD_NS}
_SUPPORTED_AUTO_FIELDS = {
    "PAGE",
    "NUMPAGES",
    "SECTIONPAGES",
    "DATE",
    "PRINTDATE",
    "SAVEDATE",
    "TIME",
}
_NAMESPACE_PREFIXES = {
    _WORD_NS: "w",
    _V_NS: "v",
    _DRAWING_NS: "a",
    _REL_NS: "r",
}
_WORD_STORY_PART_PATTERNS = (
    "word/document.xml",
    "word/header",
    "word/footer",
    "word/footnotes.xml",
    "word/endnotes.xml",
)
_REVISION_TAGS = {
    f"{{{_WORD_NS}}}ins",
    f"{{{_WORD_NS}}}del",
    f"{{{_WORD_NS}}}moveFrom",
    f"{{{_WORD_NS}}}moveTo",
}
_DRAWING_TAGS = {
    f"{{{_WORD_NS}}}drawing",
    f"{{{_WORD_NS}}}pict",
    f"{{{_WORD_NS}}}txbxContent",
    f"{{{_V_NS}}}textbox",
}
_DIAGNOSTIC_SEVERITY_ORDER = {"error": 0, "warning": 1, "info": 2}


@dataclass(slots=True)
class ParserDiagnostic:
    code: str
    severity: str
    category: str
    policy_impact: str
    source_part: str
    source_path: str | None
    relationship_id: str | None
    occurrence_key: str
    surface_type: str | None
    message: str
    count: int
    text_samples: list[str]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(slots=True)
class ParserCoverage:
    policy_result: str
    canonical_text_length: int
    secondary_text_length: int
    expected_token_count: int
    matched_expected_token_count: int
    diagnostic_only_token_count: int
    ignored_token_count: int
    coverage_ratio: float
    unmatched_text_samples: list[str]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(slots=True)
class ParserQualityReport:
    policy_result: str
    diagnostics: list[ParserDiagnostic]
    coverage: ParserCoverage
    warnings: list[str]
    error_message: str | None

    def to_summary_payload(self) -> dict[str, object]:
        return {
            "diagnostics": [diagnostic.to_dict() for diagnostic in self.diagnostics],
            "coverage": self.coverage.to_dict(),
        }


@dataclass(slots=True)
class _TextBuckets:
    expected_segments: list[str]
    diagnostic_only_segments: list[str]
    ignored_segments: list[str]


def analyze_docx_parser_quality(
    file_path: Path,
    *,
    canonical_texts: list[str],
    canonical_block_count: int,
) -> ParserQualityReport:
    diagnostics = _scan_diagnostics(file_path)
    text_buckets = _extract_text_buckets(file_path)
    coverage = _build_coverage(
        canonical_texts=canonical_texts,
        text_buckets=text_buckets,
        canonical_block_count=canonical_block_count,
        diagnostics=diagnostics,
    )
    warnings = _build_human_warnings(diagnostics, coverage)
    error_message = (
        "Parser coverage is too low to trust compare/RAG for this file."
        if coverage.policy_result == "fail"
        else None
    )
    return ParserQualityReport(
        policy_result=coverage.policy_result,
        diagnostics=diagnostics,
        coverage=coverage,
        warnings=warnings,
        error_message=error_message,
    )


def _scan_diagnostics(file_path: Path) -> list[ParserDiagnostic]:
    diagnostics: list[ParserDiagnostic] = []
    with ZipFile(file_path) as archive:
        for part_name in sorted(archive.namelist()):
            if not _is_word_xml_part(part_name):
                continue
            root = _read_xml_part(archive, part_name)
            if root is None:
                continue
            diagnostics.extend(_scan_part_diagnostics(part_name, root))

    return sorted(
        diagnostics,
        key=lambda diagnostic: (
            _DIAGNOSTIC_SEVERITY_ORDER.get(diagnostic.severity, 99),
            diagnostic.code,
            diagnostic.source_part,
            diagnostic.occurrence_key,
        ),
    )


def _scan_part_diagnostics(part_name: str, root) -> list[ParserDiagnostic]:
    diagnostics: list[ParserDiagnostic] = []

    for element in root.iter():
        if element.tag in {f"{{{_WORD_NS}}}txbxContent", f"{{{_V_NS}}}textbox"}:
            diagnostics.append(
                _build_diagnostic(
                    code="unsupported_textbox",
                    category="unsupported_content",
                    policy_impact="warn",
                    source_part=part_name,
                    element=element,
                    surface_type=_surface_type_for_part(part_name),
                    message="DOCX contains text box content that is not part of parser truth.",
                    text_samples=[_normalize_text(_collect_text(element))],
                )
            )
            continue

        if element.tag == f"{{{_DRAWING_NS}}}blip":
            diagnostics.append(
                _build_diagnostic(
                    code="unsupported_image",
                    category="unsupported_content",
                    policy_impact="warn",
                    source_part=part_name,
                    element=element,
                    surface_type=_surface_type_for_part(part_name),
                    message="DOCX contains an image that is not part of parser truth.",
                    relationship_id=element.get(f"{{{_REL_NS}}}embed"),
                    text_samples=[],
                )
            )
            continue

        if element.tag in _REVISION_TAGS:
            diagnostics.append(
                _build_diagnostic(
                    code="tracked_revision",
                    category="revision",
                    policy_impact="warn",
                    source_part=part_name,
                    element=element,
                    surface_type=_surface_type_for_part(part_name),
                    message="DOCX contains tracked revision text that is not treated as final parser truth.",
                    text_samples=[_normalize_text(_collect_text(element))],
                )
            )
            continue

        if element.tag == f"{{{_WORD_NS}}}sdt":
            diagnostics.append(
                _build_diagnostic(
                    code="content_control",
                    category="unsupported_content",
                    policy_impact="warn",
                    source_part=part_name,
                    element=element,
                    surface_type=_surface_type_for_part(part_name),
                    message="DOCX contains a content control; parser coverage should be reviewed.",
                    text_samples=[_normalize_text(_collect_text(element))],
                )
            )
            continue

        if element.tag == f"{{{_WORD_NS}}}fldSimple":
            instruction = (element.get(f"{{{_WORD_NS}}}instr") or "").strip()
            if not _is_supported_field_instruction(instruction):
                diagnostics.append(
                    _build_diagnostic(
                        code="unsupported_field",
                        category="field",
                        policy_impact="warn",
                        source_part=part_name,
                        element=element,
                        surface_type=_surface_type_for_part(part_name),
                        message="DOCX contains an unsupported simple field.",
                        text_samples=[instruction[:160]] if instruction else [],
                    )
                )
            continue

        if element.tag == f"{{{_WORD_NS}}}instrText":
            instruction = (element.text or "").strip()
            if instruction and not _is_supported_field_instruction(instruction):
                diagnostics.append(
                    _build_diagnostic(
                        code="unsupported_field",
                        category="field",
                        policy_impact="warn",
                        source_part=part_name,
                        element=element,
                        surface_type=_surface_type_for_part(part_name),
                        message="DOCX contains an unsupported complex field instruction.",
                        text_samples=[instruction[:160]],
                    )
                )

    if part_name == "word/comments.xml":
        comment_text = _normalize_text(_collect_text(root))
        if comment_text:
            diagnostics.append(
                _build_diagnostic(
                    code="unsupported_comments",
                    category="unsupported_content",
                    policy_impact="warn",
                    source_part=part_name,
                    element=root,
                    surface_type="comments",
                    message="DOCX contains comments that are not part of parser truth.",
                    text_samples=[comment_text],
                )
            )

    return _deduplicate_diagnostics(diagnostics)


def _build_diagnostic(
    *,
    code: str,
    category: str,
    policy_impact: str,
    source_part: str,
    element,
    surface_type: str | None,
    message: str,
    text_samples: list[str],
    relationship_id: str | None = None,
) -> ParserDiagnostic:
    source_path = _build_source_path(element)
    occurrence_key = f"{code}:{source_part}:{source_path}"
    normalized_samples = [
        sample[:160]
        for sample in (_normalize_text(text_sample) for text_sample in text_samples)
        if sample
    ][:3]
    return ParserDiagnostic(
        code=code,
        severity="warning" if policy_impact == "warn" else "error",
        category=category,
        policy_impact=policy_impact,
        source_part=source_part,
        source_path=source_path,
        relationship_id=relationship_id,
        occurrence_key=occurrence_key,
        surface_type=surface_type,
        message=message,
        count=1,
        text_samples=normalized_samples,
    )


def _deduplicate_diagnostics(diagnostics: list[ParserDiagnostic]) -> list[ParserDiagnostic]:
    diagnostics_by_key: dict[str, ParserDiagnostic] = {}
    for diagnostic in diagnostics:
        current = diagnostics_by_key.get(diagnostic.occurrence_key)
        if current is None:
            diagnostics_by_key[diagnostic.occurrence_key] = diagnostic
            continue
        current.count += diagnostic.count
        for sample in diagnostic.text_samples:
            if sample not in current.text_samples and len(current.text_samples) < 3:
                current.text_samples.append(sample)
    return list(diagnostics_by_key.values())


def _extract_text_buckets(file_path: Path) -> _TextBuckets:
    expected_segments: list[str] = []
    diagnostic_only_segments: list[str] = []
    ignored_segments: list[str] = []

    with ZipFile(file_path) as archive:
        referenced_note_ids = _collect_referenced_note_ids(archive)
        for part_name in sorted(archive.namelist()):
            if not _is_word_xml_part(part_name):
                continue
            root = _read_xml_part(archive, part_name)
            if root is None:
                continue
            for text_element in root.iter(f"{{{_WORD_NS}}}t"):
                text = _normalize_text(text_element.text or "")
                if not text:
                    ignored_segments.append(text)
                    continue
                bucket = _classify_text_element(
                    part_name,
                    text_element,
                    referenced_note_ids=referenced_note_ids,
                )
                if bucket == "expected":
                    expected_segments.append(text)
                elif bucket == "diagnostic":
                    diagnostic_only_segments.append(text)
                else:
                    ignored_segments.append(text)

    return _TextBuckets(
        expected_segments=expected_segments,
        diagnostic_only_segments=diagnostic_only_segments,
        ignored_segments=ignored_segments,
    )


def _classify_text_element(
    part_name: str,
    element,
    *,
    referenced_note_ids: dict[str, set[int]],
) -> str:
    if part_name == "word/comments.xml":
        return "diagnostic"
    if not _is_supported_story_part(part_name):
        return "ignored"

    ancestors = list(element.iterancestors())
    if part_name in {"word/footnotes.xml", "word/endnotes.xml"}:
        note_kind = "footnote" if part_name == "word/footnotes.xml" else "endnote"
        note_tag = f"{{{_WORD_NS}}}{note_kind}"
        note_element = next(
            (ancestor for ancestor in ancestors if ancestor.tag == note_tag),
            None,
        )
        note_id = _read_int_attribute(note_element, f"{{{_WORD_NS}}}id")
        if note_id is None or note_id not in referenced_note_ids[note_kind]:
            return "ignored"

    if any(ancestor.tag in _REVISION_TAGS for ancestor in ancestors):
        return "diagnostic"
    if any(ancestor.tag in _DRAWING_TAGS for ancestor in ancestors):
        return "diagnostic"
    if any(
        ancestor.tag == f"{{{_WORD_NS}}}fldSimple"
        and _is_supported_field_instruction(
            (ancestor.get(f"{{{_WORD_NS}}}instr") or "").strip()
        )
        for ancestor in ancestors
    ):
        return "ignored"
    if _is_supported_complex_field_result(element):
        return "ignored"
    return "expected"


def _collect_referenced_note_ids(archive: ZipFile) -> dict[str, set[int]]:
    referenced_note_ids: dict[str, set[int]] = {"footnote": set(), "endnote": set()}
    root = _read_xml_part(archive, "word/document.xml")
    if root is None:
        return referenced_note_ids

    for note_kind in referenced_note_ids:
        for note_id_raw in root.xpath(
            f".//w:{note_kind}Reference/@w:id",
            namespaces=_WORD_NSMAP,
        ):
            try:
                note_id = int(note_id_raw)
            except (TypeError, ValueError):
                continue
            if note_id > 0:
                referenced_note_ids[note_kind].add(note_id)

    return referenced_note_ids


def _is_supported_complex_field_result(element) -> bool:
    paragraph = next(
        (ancestor for ancestor in element.iterancestors() if ancestor.tag == f"{{{_WORD_NS}}}p"),
        None,
    )
    if paragraph is None:
        return False

    inside_field = False
    instruction_parts: list[str] = []
    collecting_supported_result = False
    for node in paragraph.iter():
        if node is element:
            return collecting_supported_result

        if node.tag == f"{{{_WORD_NS}}}fldChar":
            field_char_type = node.get(f"{{{_WORD_NS}}}fldCharType")
            if field_char_type == "begin":
                inside_field = True
                instruction_parts = []
                collecting_supported_result = False
            elif field_char_type == "separate" and inside_field:
                collecting_supported_result = _is_supported_field_instruction(
                    "".join(instruction_parts).strip()
                )
            elif field_char_type == "end":
                inside_field = False
                instruction_parts = []
                collecting_supported_result = False
            continue

        if inside_field and node.tag == f"{{{_WORD_NS}}}instrText":
            instruction_parts.append(node.text or "")

    return False


def _read_int_attribute(element, attribute_name: str) -> int | None:
    if element is None:
        return None
    raw_value = element.get(attribute_name)
    if raw_value is None:
        return None
    try:
        return int(raw_value)
    except (TypeError, ValueError):
        return None


def _build_coverage(
    *,
    canonical_texts: list[str],
    text_buckets: _TextBuckets,
    canonical_block_count: int,
    diagnostics: list[ParserDiagnostic],
) -> ParserCoverage:
    canonical_text = _normalize_text(" ".join(canonical_texts))
    expected_text = _normalize_text(" ".join(text_buckets.expected_segments))
    diagnostic_only_text = _normalize_text(" ".join(text_buckets.diagnostic_only_segments))
    ignored_text = _normalize_text(" ".join(text_buckets.ignored_segments))

    canonical_tokens = _tokens(canonical_text)
    expected_tokens = _tokens(expected_text)
    diagnostic_only_tokens = _tokens(diagnostic_only_text)
    ignored_tokens = _tokens(ignored_text)

    canonical_counter = Counter(canonical_tokens)
    expected_counter = Counter(expected_tokens)
    matched_expected_token_count = sum((canonical_counter & expected_counter).values())
    expected_token_count = len(expected_tokens)
    coverage_ratio = (
        matched_expected_token_count / expected_token_count
        if expected_token_count
        else 1.0
    )

    policy_result = "pass"
    if canonical_block_count == 0 and expected_token_count >= 20:
        policy_result = "fail"
    elif expected_token_count > 0 and coverage_ratio < 0.50:
        policy_result = "fail"
    elif expected_token_count > 0 and coverage_ratio < 0.85:
        policy_result = "warn"

    if any(diagnostic.policy_impact == "fail" for diagnostic in diagnostics):
        policy_result = "fail"
    elif policy_result == "pass" and any(
        diagnostic.policy_impact == "warn" for diagnostic in diagnostics
    ):
        policy_result = "warn"

    return ParserCoverage(
        policy_result=policy_result,
        canonical_text_length=len(canonical_text),
        secondary_text_length=len(_normalize_text(f"{expected_text} {diagnostic_only_text}")),
        expected_token_count=expected_token_count,
        matched_expected_token_count=matched_expected_token_count,
        diagnostic_only_token_count=len(diagnostic_only_tokens),
        ignored_token_count=len(ignored_tokens),
        coverage_ratio=round(coverage_ratio, 4),
        unmatched_text_samples=_build_unmatched_samples(
            text_buckets.expected_segments,
            canonical_counter,
        ),
    )


def _build_human_warnings(
    diagnostics: list[ParserDiagnostic],
    coverage: ParserCoverage,
) -> list[str]:
    warnings: list[str] = []
    for diagnostic in diagnostics:
        if diagnostic.policy_impact in {"warn", "fail"}:
            warnings.append(diagnostic.message)
    if coverage.policy_result == "warn":
        warnings.append(
            f"Parser coverage warning: matched {coverage.matched_expected_token_count}/{coverage.expected_token_count} expected tokens"
        )
    if coverage.policy_result == "fail":
        warnings.append(
            f"Parser coverage failure: matched {coverage.matched_expected_token_count}/{coverage.expected_token_count} expected tokens"
        )
    return list(dict.fromkeys(warnings))


def _build_unmatched_samples(
    expected_segments: list[str],
    canonical_counter: Counter,
) -> list[str]:
    samples: list[str] = []
    for segment in expected_segments:
        segment_tokens = _tokens(segment)
        if not segment_tokens:
            continue
        token_counter = Counter(segment_tokens)
        if token_counter - canonical_counter:
            samples.append(segment[:160])
        if len(samples) >= 3:
            break
    return samples


def _is_word_xml_part(part_name: str) -> bool:
    return part_name.startswith("word/") and part_name.endswith(".xml")


def _is_supported_story_part(part_name: str) -> bool:
    return part_name == "word/document.xml" or any(
        part_name.startswith(pattern) for pattern in _WORD_STORY_PART_PATTERNS[1:]
    )


def _read_xml_part(archive: ZipFile, part_name: str):
    try:
        return etree.fromstring(archive.read(part_name))
    except (KeyError, etree.XMLSyntaxError):
        return None


def _collect_text(element) -> str:
    return "".join(
        descendant.text or ""
        for descendant in element.iter(f"{{{_WORD_NS}}}t")
    )


def _normalize_text(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text).strip()


def _tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.casefold())


def _is_supported_field_instruction(instruction: str) -> bool:
    if not instruction:
        return True
    field_name = instruction.strip().split()[0].upper()
    return field_name in _SUPPORTED_AUTO_FIELDS


def _surface_type_for_part(part_name: str) -> str | None:
    if part_name == "word/document.xml":
        return "body"
    if part_name.startswith("word/header"):
        return "header"
    if part_name.startswith("word/footer"):
        return "footer"
    if part_name == "word/footnotes.xml":
        return "footnote"
    if part_name == "word/endnotes.xml":
        return "endnote"
    return None


def _build_source_path(element) -> str:
    parts: list[str] = []
    current = element
    while current is not None:
        parent = current.getparent()
        same_tag_index = 1
        if parent is not None:
            same_tag_siblings = [
                child for child in parent.iterchildren() if child.tag == current.tag
            ]
            same_tag_index = same_tag_siblings.index(current) + 1
        parts.append(f"{_qualified_name(current.tag)}[{same_tag_index}]")
        current = parent
    return "/" + "/".join(reversed(parts))


def _qualified_name(tag: str) -> str:
    if not isinstance(tag, str) or not tag.startswith("{"):
        return str(tag)
    namespace, local_name = tag[1:].split("}", maxsplit=1)
    prefix = _NAMESPACE_PREFIXES.get(namespace)
    return f"{prefix}:{local_name}" if prefix else local_name
