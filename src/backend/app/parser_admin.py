from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from collections.abc import Callable

from app.core.config import Settings, settings


CommandRunner = Callable[..., subprocess.CompletedProcess[str]]


def collect_pdf_ocr_health(
    *,
    command_runner: CommandRunner = subprocess.run,
    parser_settings: Settings = settings,
) -> dict[str, object]:
    executable = parser_settings.tesseract_cmd or "tesseract"
    configured_languages = _split_tesseract_languages(parser_settings.pdf_ocr_languages)
    tesseract_env = _build_tesseract_env(parser_settings)

    try:
        version_result = command_runner(
            [executable, "--version"],
            capture_output=True,
            text=True,
            check=False,
            env=tesseract_env,
        )
        languages_result = command_runner(
            [executable, "--list-langs"],
            capture_output=True,
            text=True,
            check=False,
            env=tesseract_env,
        )
    except OSError as exc:
        return {
            "healthy": False,
            "executable": executable,
            "tessdata_prefix": parser_settings.tessdata_prefix,
            "version": None,
            "configured_languages": configured_languages,
            "installed_languages": [],
            "missing_languages": configured_languages,
            "error": str(exc),
        }

    version = _parse_tesseract_version(version_result.stdout)
    installed_languages = _parse_tesseract_languages(languages_result.stdout)
    missing_languages = [
        language
        for language in configured_languages
        if language not in installed_languages
    ]
    healthy = (
        version_result.returncode == 0
        and languages_result.returncode == 0
        and not missing_languages
    )

    return {
        "healthy": healthy,
        "executable": executable,
        "tessdata_prefix": parser_settings.tessdata_prefix,
        "version": version,
        "configured_languages": configured_languages,
        "installed_languages": installed_languages,
        "missing_languages": missing_languages,
        "version_return_code": version_result.returncode,
        "list_languages_return_code": languages_result.returncode,
    }


def _build_tesseract_env(parser_settings: Settings) -> dict[str, str] | None:
    if not parser_settings.tessdata_prefix:
        return None
    env = os.environ.copy()
    env["TESSDATA_PREFIX"] = parser_settings.tessdata_prefix
    return env


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Document parser maintenance utilities.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    health_parser = subparsers.add_parser(
        "pdf-ocr-health",
        help="Check local Tesseract executable and OCR language packs.",
    )
    health_parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when Tesseract or configured languages are unavailable.",
    )

    args = parser.parse_args(argv)
    if args.command == "pdf-ocr-health":
        report = collect_pdf_ocr_health()
        print(json.dumps(report, indent=2, sort_keys=True))
        if args.strict and not report["healthy"]:
            raise SystemExit(1)
        return

    raise SystemExit(f"Unsupported command: {args.command}")


def _split_tesseract_languages(languages: str) -> list[str]:
    return [
        language.strip()
        for language in re.split(r"[+,]", languages)
        if language.strip()
    ]


def _parse_tesseract_version(stdout: str) -> str | None:
    first_line = next((line.strip() for line in stdout.splitlines() if line.strip()), None)
    return first_line


def _parse_tesseract_languages(stdout: str) -> list[str]:
    languages = []
    for line in stdout.splitlines():
        candidate = line.strip()
        if not candidate:
            continue
        if candidate.lower().startswith("list of available languages"):
            continue
        languages.append(candidate)
    return sorted(set(languages))


if __name__ == "__main__":
    main()
