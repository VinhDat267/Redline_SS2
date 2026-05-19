from app.core.config import Settings


def test_settings_expose_primary_and_fallback_ai_provider_env(monkeypatch):
    monkeypatch.setenv("REDLINE_AI_PRIMARY_PROVIDER", "gemini")
    monkeypatch.setenv("REDLINE_AI_FALLBACK_PROVIDER", "openai")
    monkeypatch.setenv("REDLINE_AI_GEMINI_MODEL", "gemini-2.5-flash")
    monkeypatch.setenv("REDLINE_AI_OPENAI_MODEL", "gpt-4.1-mini")
    monkeypatch.setenv("REDLINE_AI_OPENAI_BASE_URL", "https://example.com/v1")
    monkeypatch.setenv("REDLINE_AI_BATCH_WORKER_ENABLED", "true")
    monkeypatch.setenv("REDLINE_AI_BATCH_CONCURRENCY", "3")
    monkeypatch.setenv("REDLINE_AI_BATCH_POLL_INTERVAL_MS", "1500")
    monkeypatch.setenv("REDLINE_AI_BATCH_STALE_ITEM_SECONDS", "120")
    monkeypatch.setenv("REDLINE_AI_BATCH_STALE_JOB_SECONDS", "240")
    monkeypatch.setenv("REDLINE_AI_REVIEW_BATCH_SIZE", "4")

    settings = Settings()

    assert settings.ai_primary_provider == "gemini"
    assert settings.ai_fallback_provider == "openai"
    assert settings.ai_gemini_model == "gemini-2.5-flash"
    assert settings.ai_openai_model == "gpt-4.1-mini"
    assert settings.ai_openai_base_url == "https://example.com/v1"
    assert settings.ai_batch_worker_enabled is True
    assert settings.ai_batch_concurrency == 3
    assert settings.ai_batch_poll_interval_ms == 1500
    assert settings.ai_batch_stale_item_seconds == 120
    assert settings.ai_batch_stale_job_seconds == 240
    assert settings.ai_review_batch_size == 4


def test_settings_expose_rag_embedding_provider_env(monkeypatch):
    monkeypatch.setenv("REDLINE_RAG_EMBEDDING_PROVIDER", "openai_compatible")
    monkeypatch.setenv("REDLINE_RAG_EMBEDDING_BASE_URL", "http://localhost:20128/v1")
    monkeypatch.setenv("REDLINE_RAG_EMBEDDING_API_KEY", "test-key")
    monkeypatch.setenv("REDLINE_RAG_EMBEDDING_MODEL", "gemini/gemini-embedding-2-preview")
    monkeypatch.setenv("REDLINE_RAG_EMBEDDING_DIMENSIONS", "3072")
    monkeypatch.setenv("REDLINE_RAG_EMBEDDING_FALLBACK_TO_LOCAL_HASH", "true")

    settings = Settings()

    assert settings.rag_embedding_provider == "openai_compatible"
    assert settings.rag_embedding_base_url == "http://localhost:20128/v1"
    assert settings.rag_embedding_api_key == "test-key"
    assert settings.rag_embedding_model == "gemini/gemini-embedding-2-preview"
    assert settings.rag_embedding_dimensions == 3072
    assert settings.rag_embedding_fallback_to_local_hash is True


def test_settings_expose_pdf_ocr_env(monkeypatch):
    monkeypatch.setenv("REDLINE_PDF_OCR_ENABLED", "true")
    monkeypatch.setenv("REDLINE_TESSERACT_CMD", "C:/Program Files/Tesseract-OCR/tesseract.exe")
    monkeypatch.setenv("REDLINE_TESSDATA_PREFIX", "C:/Program Files/Tesseract-OCR/tessdata")
    monkeypatch.setenv("REDLINE_PDF_OCR_LANGUAGES", "eng+vie")
    monkeypatch.setenv("REDLINE_PDF_OCR_MIN_CONFIDENCE", "82")
    monkeypatch.setenv("REDLINE_PDF_OCR_MIN_RETAINED_TOKENS", "15")
    monkeypatch.setenv("REDLINE_PDF_OCR_MAX_LOW_CONFIDENCE_TOKEN_RATIO", "0.2")
    monkeypatch.setenv("REDLINE_PDF_OCR_DPI", "220")
    monkeypatch.setenv("REDLINE_PDF_TEXT_MIN_CHARS_PER_PAGE", "55")
    monkeypatch.setenv("REDLINE_PDF_TEXT_MIN_TOKENS_PER_PAGE", "11")
    monkeypatch.setenv("REDLINE_PDF_TEXT_MIN_PRINTABLE_RATIO", "0.9")
    monkeypatch.setenv("REDLINE_PDF_TEXT_MAX_DUPLICATE_TOKEN_RATIO", "0.3")
    monkeypatch.setenv("REDLINE_PDF_BLANK_PAGE_MAX_INK_RATIO", "0.004")

    settings = Settings()

    assert settings.pdf_ocr_enabled is True
    assert settings.tesseract_cmd == "C:/Program Files/Tesseract-OCR/tesseract.exe"
    assert settings.tessdata_prefix == "C:/Program Files/Tesseract-OCR/tessdata"
    assert settings.pdf_ocr_languages == "eng+vie"
    assert settings.pdf_ocr_min_confidence == 82.0
    assert settings.pdf_ocr_min_retained_tokens == 15
    assert settings.pdf_ocr_max_low_confidence_token_ratio == 0.2
    assert settings.pdf_ocr_dpi == 220
    assert settings.pdf_text_min_chars_per_page == 55
    assert settings.pdf_text_min_tokens_per_page == 11
    assert settings.pdf_text_min_printable_ratio == 0.9
    assert settings.pdf_text_max_duplicate_token_ratio == 0.3
    assert settings.pdf_blank_page_max_ink_ratio == 0.004
