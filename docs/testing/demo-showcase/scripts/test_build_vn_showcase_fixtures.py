from pathlib import Path

from build_vn_showcase_fixtures import build_all_fixtures, parse_fixtures


def test_parse_fixtures_finds_vietnamese_drafts(tmp_path: Path):
    source = tmp_path / "sample.md"
    source.write_text(
        """
# VN Showcase

## VN NDA v1 - Thoa thuan bao mat

### 1. Pham vi thong tin bao mat
Ben Nhan chi su dung Thong Tin Bao Mat cho muc dich danh gia hop tac.

## VN NDA v2 - Thoa thuan bao mat

### 1. Pham vi thong tin bao mat
Ben Nhan co the chia se Thong Tin Bao Mat voi nha thau phu can biet.
""".strip(),
        encoding="utf-8",
    )

    fixtures = parse_fixtures(source)

    assert [fixture.title for fixture in fixtures] == [
        "VN NDA v1 - Thoa thuan bao mat",
        "VN NDA v2 - Thoa thuan bao mat",
    ]
    assert fixtures[0].filename == "redline-vn-showcase-vn-nda-v1-thoa-thuan-bao-mat.docx"
    assert "Ben Nhan chi su dung" in fixtures[0].lines[1]


def test_build_all_fixtures_writes_docx_files(tmp_path: Path):
    source = tmp_path / "sample.md"
    output_dir = tmp_path / "fixtures"
    source.write_text(
        """
# VN Showcase

## VN SOW v1 - Hop dong dich vu trien khai

### 1. Nghiem thu
Khach Hang co 10 ngay lam viec de tu choi san pham khong phu hop.

## VN SOW v2 - Hop dong dich vu trien khai

### 1. Nghiem thu
San pham duoc xem la nghiem thu sau 3 ngay lam viec neu Khach Hang khong phan hoi.
""".strip(),
        encoding="utf-8",
    )

    generated = build_all_fixtures(source, output_dir)

    assert [path.name for path in generated] == [
        "redline-vn-showcase-vn-sow-v1-hop-dong-dich-vu-trien-khai.docx",
        "redline-vn-showcase-vn-sow-v2-hop-dong-dich-vu-trien-khai.docx",
    ]
    assert all(path.exists() and path.stat().st_size > 0 for path in generated)
