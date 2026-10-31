"""Burns the MITRA EVENTS watermark into gallery photos, so screenshots and downloads stay branded."""

import io
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, ImageDraw, ImageFont, ImageOps

TEXT = "MITRA EVENTS"
FONT = Path(settings.BASE_DIR) / "templates/pdf/fonts/Marcellus-Regular.ttf"
WIDTH_SHARE = 0.38  # of the photo's width
OPACITY = 105  # of 255: see-through, but still readable on pale floors and walls
OUTLINE_OPACITY = 73  # a dark edge lifts the white letters off pale areas
MIN_SIZE = 10

# Kept as uploaded, so transparency and file type survive; anything else becomes a JPEG.
SAVE_OPTIONS = {"JPEG": {"quality": 88, "optimize": True}, "PNG": {"optimize": True}, "WEBP": {"quality": 88}}


def _layer(width: int, height: int) -> Image.Image:
    """One transparent line of text in the centre of a sheet the size of the photo."""
    measured = ImageFont.truetype(FONT, 100).getlength(TEXT)
    size = max(MIN_SIZE, round(100 * width * WIDTH_SHARE / measured))
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(sheet).text(
        (width / 2, height / 2),
        TEXT,
        font=ImageFont.truetype(FONT, size),
        anchor="mm",
        fill=(255, 255, 255, OPACITY),
        stroke_width=max(1, size // 40),
        stroke_fill=(0, 0, 0, OUTLINE_OPACITY),
    )
    return sheet


def watermarked(file, name: str) -> ContentFile:
    """A stamped copy of an image file. Camera details (including location) are dropped along the way."""
    file.seek(0)
    with Image.open(file) as source:
        kind = source.format if source.format in SAVE_OPTIONS else "JPEG"
        photo = ImageOps.exif_transpose(source).convert("RGBA")
    photo.alpha_composite(_layer(*photo.size))
    if kind == "JPEG":
        photo = photo.convert("RGB")

    out = io.BytesIO()
    photo.save(out, kind, **SAVE_OPTIONS[kind])
    return ContentFile(out.getvalue(), name=_file_name(name, kind))


def _file_name(name: str, kind: str) -> str:
    """The name as uploaded, unless the file type had to change."""
    path = Path(name)
    extensions = {"JPEG": (".jpg", ".jpeg"), "PNG": (".png",), "WEBP": (".webp",)}[kind]
    return path.name if path.suffix.lower() in extensions else f"{path.stem}{extensions[0]}"
