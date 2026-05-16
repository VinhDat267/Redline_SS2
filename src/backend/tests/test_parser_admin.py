from subprocess import CompletedProcess

from app.core.config import Settings
from app.parser_admin import collect_pdf_ocr_health


def test_collect_pdf_ocr_health_reports_configured_languages():
    commands = []

    def fake_runner(command, **kwargs):
        commands.append(command)
        if command[-1] == "--version":
            return CompletedProcess(command, 0, stdout="tesseract 5.3.0\n leptonica\n", stderr="")
        if command[-1] == "--list-langs":
            return CompletedProcess(command, 0, stdout="List of available languages (3):\neng\nvie\nosd\n", stderr="")
        raise AssertionError(f"Unexpected command: {command}")

    report = collect_pdf_ocr_health(
        command_runner=fake_runner,
        parser_settings=Settings(
            _env_file=None,
            tesseract_cmd="C:/Program Files/Tesseract-OCR/tesseract.exe",
            pdf_ocr_languages="eng+vie",
        ),
    )

    assert report["healthy"] is True
    assert report["executable"] == "C:/Program Files/Tesseract-OCR/tesseract.exe"
    assert report["version"] == "tesseract 5.3.0"
    assert report["configured_languages"] == ["eng", "vie"]
    assert report["installed_languages"] == ["eng", "osd", "vie"]
    assert report["missing_languages"] == []
    assert commands == [
        ["C:/Program Files/Tesseract-OCR/tesseract.exe", "--version"],
        ["C:/Program Files/Tesseract-OCR/tesseract.exe", "--list-langs"],
    ]


def test_collect_pdf_ocr_health_uses_configured_tessdata_prefix():
    environments = []

    def fake_runner(command, **kwargs):
        environments.append(kwargs.get("env"))
        if command[-1] == "--version":
            return CompletedProcess(command, 0, stdout="tesseract 5.5.0\n", stderr="")
        if command[-1] == "--list-langs":
            return CompletedProcess(command, 0, stdout="List of available languages (2):\neng\nvie\n", stderr="")
        raise AssertionError(f"Unexpected command: {command}")

    report = collect_pdf_ocr_health(
        command_runner=fake_runner,
        parser_settings=Settings(
            _env_file=None,
            tessdata_prefix="C:/Users/Vinh Dat/AppData/Local/RedlineSS2/tessdata",
            pdf_ocr_languages="eng+vie",
        ),
    )

    assert report["healthy"] is True
    assert [environment.get("TESSDATA_PREFIX") for environment in environments] == [
        "C:/Users/Vinh Dat/AppData/Local/RedlineSS2/tessdata",
        "C:/Users/Vinh Dat/AppData/Local/RedlineSS2/tessdata",
    ]


def test_collect_pdf_ocr_health_marks_missing_language_pack_unhealthy():
    def fake_runner(command, **kwargs):
        if command[-1] == "--version":
            return CompletedProcess(command, 0, stdout="tesseract 5.3.0\n", stderr="")
        if command[-1] == "--list-langs":
            return CompletedProcess(command, 0, stdout="List of available languages (1):\neng\n", stderr="")
        raise AssertionError(f"Unexpected command: {command}")

    report = collect_pdf_ocr_health(
        command_runner=fake_runner,
        parser_settings=Settings(_env_file=None, pdf_ocr_languages="eng+vie"),
    )

    assert report["healthy"] is False
    assert report["executable"] == "tesseract"
    assert report["configured_languages"] == ["eng", "vie"]
    assert report["installed_languages"] == ["eng"]
    assert report["missing_languages"] == ["vie"]
