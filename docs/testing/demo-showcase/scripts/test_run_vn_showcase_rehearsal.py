from run_vn_showcase_rehearsal import parse_sse_events, select_ai_review_changes


def test_parse_sse_events_decodes_attempt_stream_frames():
    events = parse_sse_events(
        [
            "event: metadata",
            'data: {"attempt_id":1,"sequence":1}',
            "",
            "event: delta",
            'data: {"content":"hello"}',
            "",
            "event: done",
            'data: {"status":"done","assistant_message":{"id":7}}',
            "",
        ]
    )

    assert [event["event"] for event in events] == ["metadata", "delta", "done"]
    assert events[1]["data"]["content"] == "hello"
    assert events[2]["data"]["assistant_message"]["id"] == 7


def test_select_ai_review_changes_prefers_keyword_matches_without_duplicates():
    clause_changes = [
        {
            "id": 10,
            "clause_title": "Thanh toan",
            "old_text": "Thanh toan sau nghiem thu.",
            "new_text": "Khach Hang thanh toan tra truoc 40%.",
            "summary": "",
        },
        {
            "id": 11,
            "clause_title": "So huu san pham",
            "old_text": "Nha Cung Cap so huu ma nguon.",
            "new_text": "Khach Hang so huu san pham sau khi thanh toan.",
            "summary": "",
        },
        {
            "id": 12,
            "clause_title": "Nghiem thu",
            "old_text": "10 ngay lam viec.",
            "new_text": "3 ngay lam viec.",
            "summary": "",
        },
    ]

    selected = select_ai_review_changes(
        clause_changes,
        [["so huu", "san pham"], ["thanh toan", "tra truoc"]],
        limit=2,
    )

    assert [change["id"] for change in selected] == [11, 10]
