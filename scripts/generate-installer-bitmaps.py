#!/usr/bin/env python3
"""
paperchat NSIS installer bitmap generator.
Produces header.bmp (150×57) and sidebar.bmp (164×314).

Renders at 2× then downsamples with LANCZOS for sharper text.

Usage:
    pip install Pillow
    python scripts/generate-installer-bitmaps.py [--version 0.4.1]
"""

import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow not found.  Run:  pip install Pillow")
    sys.exit(1)

# ── Palette (matches app dark theme, OKLCH-approximated to sRGB) ──────────────
BG         = (13,  12,  19)   # near-black, faint blue-purple tint
BG_WARM    = (24,  21,  38)   # top-gradient start (slightly lighter)
ACCENT     = (128,  84, 220)  # purple accent
ACCENT_DIM = (52,  46,  82)   # muted purple — lines, right-edge rule
TEXT_HI    = (220, 217, 232)  # near-white with slight purple cast
TEXT_LO    = (118, 113, 142)  # muted gray-purple

SCALE = 2  # supersample factor for cleaner text rendering

# ── Font helpers ──────────────────────────────────────────────────────────────
_WIN_FONTS = Path(r"C:\Windows\Fonts")

_FONT_CANDIDATES = {
    "light":    ["segoeuil.ttf", "seguisl.ttf", "segoeui.ttf", "malgun.ttf"],
    "regular":  ["malgun.ttf", "segoeui.ttf"],
    "semibold": ["malgunbd.ttf", "seguisb.ttf", "segoeuib.ttf"],
    "bold":     ["malgunbd.ttf", "segoeuib.ttf", "seguisb.ttf"],
}


def load_font(style: str, size: int) -> ImageFont.FreeTypeFont:
    for name in _FONT_CANDIDATES.get(style, _FONT_CANDIDATES["regular"]):
        path = _WIN_FONTS / name
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except Exception:
                pass
    return ImageFont.load_default()


def tw(draw: ImageDraw.Draw, text: str, font) -> int:
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0]


def th(draw: ImageDraw.Draw, text: str, font) -> int:
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[3] - bb[1]


# ── Sidebar 164×314 ───────────────────────────────────────────────────────────
def generate_sidebar(version: str) -> Image.Image:
    W, H = 164 * SCALE, 314 * SCALE
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Subtle top gradient: BG_WARM → BG over 48 rows
    grad_h = 48 * SCALE
    for y in range(grad_h):
        t = y / grad_h
        c = tuple(int(BG_WARM[i] * (1 - t) + BG[i] * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)

    # Brand mark: "paper" (light, muted) + "chat" (bold, purple), stacked
    f_paper = load_font("light",  24 * SCALE)
    f_chat  = load_font("bold",   26 * SCALE)

    paper_w = tw(d, "paper", f_paper)
    chat_w  = tw(d, "chat",  f_chat)
    paper_h = th(d, "paper", f_paper)

    paper_y = int(58 * SCALE)
    chat_y  = paper_y + paper_h + int(4 * SCALE)

    d.text(((W - paper_w) // 2, paper_y), "paper", font=f_paper, fill=TEXT_LO)
    d.text(((W - chat_w)  // 2, chat_y),  "chat",  font=f_chat,  fill=ACCENT)

    # Separator line
    sep_y  = chat_y + th(d, "chat", f_chat) + int(16 * SCALE)
    sep_x0 = int(20 * SCALE)
    sep_x1 = int(144 * SCALE)
    d.line([(sep_x0, sep_y), (sep_x1, sep_y)], fill=ACCENT_DIM, width=SCALE)

    # Feature list
    f_body = load_font("regular", 11 * SCALE)
    features_ko = [
        "완전 오프라인 동작",
        "문서 외부 전송 없음",
        "로컬 AI PDF 분석",
    ]
    dot_x   = int(18 * SCALE)
    dot_r   = int(3  * SCALE)
    text_x  = int(30 * SCALE)
    feat_y0 = sep_y + int(20 * SCALE)
    row_h   = int(22 * SCALE)

    for i, feat in enumerate(features_ko):
        fy     = feat_y0 + i * row_h
        dot_cy = fy + th(d, feat, f_body) // 2
        d.ellipse(
            [(dot_x - dot_r, dot_cy - dot_r),
             (dot_x + dot_r, dot_cy + dot_r)],
            fill=ACCENT,
        )
        d.text((text_x, fy), feat, font=f_body, fill=TEXT_HI)

    # Version label, bottom-centered
    f_ver  = load_font("regular", 9 * SCALE)
    ver_str = f"v{version}"
    vw     = tw(d, ver_str, f_ver)
    ver_y  = int(292 * SCALE)
    d.text(((W - vw) // 2, ver_y), ver_str, font=f_ver, fill=ACCENT_DIM)

    # 1 px right-edge rule
    d.line([(W - SCALE, 0), (W - SCALE, H)], fill=ACCENT_DIM, width=SCALE)

    return img.resize((164, 314), Image.LANCZOS)


# ── Header 150×57 ─────────────────────────────────────────────────────────────
def generate_header() -> Image.Image:
    W, H = 150 * SCALE, 57 * SCALE
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    f_paper = load_font("light",    15 * SCALE)
    f_chat  = load_font("semibold", 15 * SCALE)

    pw = tw(d, "paper", f_paper)
    cw = tw(d, "chat",  f_chat)
    ph = th(d, "paper", f_paper)
    x  = (W - pw - cw) // 2
    y  = (H - ph) // 2 - int(2 * SCALE)

    d.text((x,      y), "paper", font=f_paper, fill=TEXT_LO)
    d.text((x + pw, y), "chat",  font=f_chat,  fill=ACCENT)

    # 2 px bottom accent line
    d.line([(0, H - 2 * SCALE), (W, H - 2 * SCALE)], fill=ACCENT_DIM, width=2 * SCALE)

    return img.resize((150, 57), Image.LANCZOS)


# ── Entry point ───────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate paperchat NSIS installer bitmaps"
    )
    parser.add_argument(
        "--version", default="0.4.1",
        help="App version shown in the sidebar (e.g. 0.4.1)",
    )
    args = parser.parse_args()

    out_dir = Path(__file__).parent.parent / "desktop" / "src-tauri" / "nsis"
    out_dir.mkdir(parents=True, exist_ok=True)

    sidebar = generate_sidebar(args.version)
    sidebar_path = out_dir / "sidebar.bmp"
    sidebar.save(sidebar_path, "BMP")
    print(f"OK sidebar.bmp  ->  {sidebar_path}  (164x314)")

    header = generate_header()
    header_path = out_dir / "header.bmp"
    header.save(header_path, "BMP")
    print(f"OK header.bmp   ->  {header_path}  (150x57)")


if __name__ == "__main__":
    main()
