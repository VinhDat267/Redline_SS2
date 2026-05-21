from pathlib import Path

import fitz

from app.services import document_pdf_parser


def _write_text_pdf(path: Path, pages: list[str]) -> None:
    document = fitz.open()
    for page_text in pages:
        page = document.new_page(width=612, height=792)
        y = 72
        for line in page_text.splitlines():
            page.insert_text((72, y), line, fontsize=11)
            y += 18
    document.save(path)
    document.close()


def _write_pdf_with_blank_then_text(path: Path) -> None:
    document = fitz.open()
    document.new_page(width=612, height=792)
    page = document.new_page(width=612, height=792)
    y = 72
    for line in [
        "1. Definitions",
        "Agreement means this services agreement.",
        "(a) Confidential Information includes business terms.",
        "The receiving party must protect it.",
    ]:
        page.insert_text((72, y), line, fontsize=11)
        y += 18
    document.save(path)
    document.close()


def _write_blank_pdf(path: Path) -> None:
    document = fitz.open()
    page = document.new_page(width=612, height=792)
    page.draw_rect(fitz.Rect(72, 72, 220, 220), color=(0, 0, 0), fill=(0, 0, 0))
    document.save(path)
    document.close()


def _diagnostic_codes(draft) -> set[str]:
    return {diagnostic.code for diagnostic in draft.quality_report.diagnostics}


def test_text_layer_pdf_becomes_page_surface_with_legal_blocks(tmp_path: Path):
    file_path = tmp_path / "agreement.pdf"
    _write_text_pdf(
        file_path,
        [
            "\n".join(
                [
                    "1. Definitions",
                    "Agreement means this software services agreement.",
                    "(a) Confidential Information includes business terms.",
                    "The receiving party must protect the information.",
                ]
            )
        ],
    )

    draft = document_pdf_parser.build_pdf_document_draft(file_path)

    assert draft.quality_report.policy_result == "pass"
    assert draft.pdf_summary is not None
    assert draft.pdf_summary.page_count == 1
    assert draft.pdf_summary.extraction_modes_by_page == {1: "text_layer"}
    assert [surface.surface_type for surface in draft.surfaces] == ["page"]
    assert draft.surfaces[0].surface_key == "pdf-page-1"
    assert [block.block_type for block in draft.surfaces[0].blocks] == [
        "heading",
        "paragraph",
        "list_item",
        "paragraph",
    ]
    assert draft.surfaces[0].blocks[0].heading_level == 1
    assert draft.surfaces[0].blocks[1].section_title == "1. Definitions"


def test_blank_pdf_pages_are_ignored_without_failing_truth_policy(tmp_path: Path):
    file_path = tmp_path / "agreement-with-blank-page.pdf"
    _write_pdf_with_blank_then_text(file_path)

    draft = document_pdf_parser.build_pdf_document_draft(file_path)

    assert draft.quality_report.policy_result == "pass"
    assert draft.pdf_summary.extraction_modes_by_page == {
        1: "ignored_blank",
        2: "text_layer",
    }
    assert [surface.surface_key for surface in draft.surfaces] == ["pdf-page-2"]


def test_ocr_fallback_can_be_parser_truth_with_warnings(monkeypatch, tmp_path: Path):
    file_path = tmp_path / "scan.pdf"
    _write_blank_pdf(file_path)

    def fake_ocr(page, page_index, settings):
        return document_pdf_parser.OcrPageResult(
            text="1. Payment Terms\nInvoices are due within thirty days.",
            average_confidence=92.0,
            retained_token_count=12,
            low_confidence_token_ratio=0.05,
            languages="eng+vie",
            dpi=200,
        )

    monkeypatch.setattr(document_pdf_parser, "run_ocr_for_page", fake_ocr)

    draft = document_pdf_parser.build_pdf_document_draft(file_path)

    assert draft.quality_report.policy_result == "warn"
    assert draft.pdf_summary is not None
    assert draft.pdf_summary.extraction_modes_by_page == {1: "ocr"}
    assert draft.pdf_summary.average_ocr_confidence == 92.0
    assert draft.warnings == ["PDF OCR fallback used on page 1"]
    assert _diagnostic_codes(draft) == {"pdf_ocr_used"}
    assert draft.surfaces[0].blocks[0].normalized_content == "1. Payment Terms"


def test_low_confidence_ocr_fails_truth_policy(monkeypatch, tmp_path: Path):
    file_path = tmp_path / "low-confidence-scan.pdf"
    _write_blank_pdf(file_path)

    def fake_ocr(page, page_index, settings):
        return document_pdf_parser.OcrPageResult(
            text="1. Indemnity\nThe supplier shall indemnify the customer.",
            average_confidence=54.0,
            retained_token_count=7,
            low_confidence_token_ratio=0.55,
            languages="eng+vie",
            dpi=200,
        )

    monkeypatch.setattr(document_pdf_parser, "run_ocr_for_page", fake_ocr)

    draft = document_pdf_parser.build_pdf_document_draft(file_path)

    assert draft.quality_report.policy_result == "fail"
    assert draft.surfaces == []
    assert "pdf_ocr_quality_failed" in _diagnostic_codes(draft)


def test_material_table_like_pdf_text_fails_truth_policy(tmp_path: Path):
    file_path = tmp_path / "commercial-table.pdf"
    _write_text_pdf(
        file_path,
        [
            "\n".join(
                [
                    "Statement of Work",
                    "Milestone        Price        Due Date",
                    "Phase 1          $1000        2026-05-01",
                    "Phase 2          $1500        2026-06-01",
                ]
            )
        ],
    )

    draft = document_pdf_parser.build_pdf_document_draft(file_path)

    assert draft.quality_report.policy_result == "warn"
    assert len(draft.surfaces) == 1
    assert "pdf_material_table_unstructured" in _diagnostic_codes(draft)


def _write_encrypted_pdf(path: Path) -> None:
    document = fitz.open()
    page = document.new_page(width=612, height=792)
    page.insert_text((72, 72), "This is secret text.", fontsize=11)
    document.save(
        path,
        encryption=fitz.PDF_ENCRYPT_AES_256,
        owner_pw="owner",
        user_pw="user",
    )
    document.close()


def test_encrypted_pdf_fails_fast(tmp_path: Path):
    file_path = tmp_path / "encrypted.pdf"
    _write_encrypted_pdf(file_path)

    import pytest
    with pytest.raises(ValueError, match="PDF is password-protected"):
        document_pdf_parser.build_pdf_document_draft(file_path)


def test_short_ocr_signature_page_passes_with_high_confidence(monkeypatch, tmp_path: Path):
    file_path = tmp_path / "signature-page.pdf"
    _write_blank_pdf(file_path)

    # Giả lập trang chữ ký quét có 6 token (dưới ngưỡng 12) nhưng độ tự tin 92.0 (>= 85.0)
    def fake_ocr(page, page_index, settings):
        return document_pdf_parser.OcrPageResult(
            text="Signed: John Doe Date: 2026-05-21",
            average_confidence=92.0,
            retained_token_count=6,
            low_confidence_token_ratio=0.0,
            languages="eng+vie",
            dpi=200,
        )

    monkeypatch.setattr(document_pdf_parser, "run_ocr_for_page", fake_ocr)

    draft = document_pdf_parser.build_pdf_document_draft(file_path)

    # Không bị báo lỗi fail, mà chuyển thành warn (vì dùng OCR và có cảnh báo)
    assert draft.quality_report.policy_result == "warn"
    assert len(draft.surfaces) == 1
    assert draft.pdf_summary.ocr_page_count == 1
    assert "pdf_ocr_used" in _diagnostic_codes(draft)
    assert "pdf_ocr_quality_failed" not in _diagnostic_codes(draft)


def test_ligature_normalization_in_parsing():
    # Kiểm tra trực tiếp hàm _clean_pdf_text để bỏ qua giới hạn font chữ của PyMuPDF
    raw_text = "The ﬁnancial ﬂow of this agreement is stable."
    cleaned = document_pdf_parser._clean_pdf_text(raw_text)
    assert "financial flow" in cleaned

    # Kiểm tra trực tiếp hàm normalize_content của document_parser
    from app.services.document_parser import normalize_content
    assert normalize_content("The ﬁnancial ﬂow") == "The financial flow"


def test_hyphenation_normalization_in_parsing(tmp_path: Path):
    file_path = tmp_path / "hyphenation.pdf"
    # Từ "represen-tative" bị ngắt dòng bằng gạch nối
    _write_text_pdf(
        file_path,
        [
            "We need a represen-\ntative to sign this."
        ]
    )

    draft = document_pdf_parser.build_pdf_document_draft(file_path)

    assert draft.quality_report.policy_result == "pass"
    assert len(draft.surfaces) == 1
    block = draft.surfaces[0].blocks[0]
    # Dấu gạch nối và xuống dòng phải được ghép lại thành "representative"
    assert "representative" in block.normalized_content
