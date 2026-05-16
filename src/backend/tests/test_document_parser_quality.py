from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from docx import Document as DocxDocument

from app.services.document_parser_quality import analyze_docx_parser_quality


def _save_docx(path: Path, paragraphs: list[str]) -> None:
    document = DocxDocument()
    for text in paragraphs:
        document.add_paragraph(text)
    document.save(path)


def _replace_zip_part(path: Path, part_name: str, content: str) -> None:
    temp_path = path.with_suffix(".tmp.docx")
    with ZipFile(path, "r") as source, ZipFile(temp_path, "w", ZIP_DEFLATED) as target:
        for item in source.infolist():
            if item.filename == part_name:
                continue
            target.writestr(item, source.read(item.filename))
        target.writestr(part_name, content.encode("utf-8"))
    temp_path.replace(path)


def _read_zip_text(path: Path, part_name: str) -> str:
    with ZipFile(path, "r") as archive:
        return archive.read(part_name).decode("utf-8")


def _inject_textbox(path: Path, text: str) -> None:
    document_xml = _read_zip_text(path, "word/document.xml")
    textbox_xml = f"""
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData>
                <wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                  <wps:txbx>
                    <w:txbxContent>
                      <w:p><w:r><w:t>{text}</w:t></w:r></w:p>
                    </w:txbxContent>
                  </wps:txbx>
                </wps:wsp>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    """
    _replace_zip_part(path, "word/document.xml", document_xml.replace("</w:body>", f"{textbox_xml}</w:body>"))


def test_analyze_docx_parser_quality_reports_unsupported_textbox(tmp_path: Path):
    file_path = tmp_path / "textbox.docx"
    _save_docx(file_path, ["This agreement has ordinary body text."])
    _inject_textbox(file_path, "Limitation of liability survives termination.")

    report = analyze_docx_parser_quality(
        file_path,
        canonical_texts=["This agreement has ordinary body text."],
        canonical_block_count=1,
    )

    assert report.policy_result == "warn"
    assert report.coverage.policy_result == "warn"
    assert report.coverage.diagnostic_only_token_count > 0
    assert report.diagnostics

    textbox_diagnostic = report.diagnostics[0]
    assert textbox_diagnostic.code == "unsupported_textbox"
    assert textbox_diagnostic.category == "unsupported_content"
    assert textbox_diagnostic.policy_impact == "warn"
    assert textbox_diagnostic.source_part == "word/document.xml"
    assert textbox_diagnostic.source_path
    assert textbox_diagnostic.occurrence_key.startswith("unsupported_textbox:word/document.xml:")
    assert textbox_diagnostic.text_samples == ["Limitation of liability survives termination."]


def test_analyze_docx_parser_quality_fails_when_expected_text_is_not_covered(tmp_path: Path):
    file_path = tmp_path / "coverage-fail.docx"
    _save_docx(
        file_path,
        [
            "This agreement contains payment obligations confidentiality clauses "
            "termination rights indemnity duties audit rights notice mechanics "
            "and governing law survival requirements."
        ],
    )

    report = analyze_docx_parser_quality(file_path, canonical_texts=[], canonical_block_count=0)

    assert report.policy_result == "fail"
    assert report.coverage.policy_result == "fail"
    assert report.coverage.expected_token_count >= 20
    assert report.coverage.matched_expected_token_count == 0
    assert report.coverage.coverage_ratio == 0
    assert report.error_message == "Parser coverage is too low to trust compare/RAG for this file."


def test_analyze_docx_parser_quality_passes_when_expected_text_is_covered(tmp_path: Path):
    file_path = tmp_path / "coverage-pass.docx"
    text = "The supplier shall provide monthly service reports."
    _save_docx(file_path, [text])

    report = analyze_docx_parser_quality(file_path, canonical_texts=[text], canonical_block_count=1)

    assert report.policy_result == "pass"
    assert report.coverage.policy_result == "pass"
    assert report.coverage.expected_token_count > 0
    assert report.coverage.matched_expected_token_count == report.coverage.expected_token_count
    assert report.coverage.coverage_ratio == 1
    assert report.diagnostics == []
