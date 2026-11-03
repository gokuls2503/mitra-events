"""Burns the MITRA EVENTS watermark and the lotus logo into gallery photos, so screenshots and downloads stay branded."""

import io
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

TEXT = "MITRA EVENTS"
FONT = Path(settings.BASE_DIR) / "templates/pdf/fonts/Marcellus-Regular.ttf"
WIDTH_SHARE = 0.38  # of the photo's width
OPACITY = 105  # of 255: see-through, but still readable on pale floors and walls
OUTLINE_OPACITY = 73  # a dark edge lifts the white letters off pale areas
MIN_SIZE = 10

LOGO = Path(settings.BASE_DIR) / "templates/pdf/lotus.png"
LOGO_WIDTH_SHARE = 0.12  # of the photo's width, in the top-left corner
LOGO_MARGIN_SHARE = 0.04  # of the photo's shorter side
LOGO_SHADOW_OPACITY = 90  # a soft shadow keeps the colours clear on pale photos

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


def _logo(width: int, height: int) -> tuple[Image.Image, Image.Image, int]:
    """The full-colour logo sized for the photo, its blurred shadow, and the corner margin."""
    with Image.open(LOGO) as source:
        art = source.convert("RGBA")
    logo_width = min(width, max(12, round(width * LOGO_WIDTH_SHARE)))
    logo = art.resize((logo_width, max(1, round(art.height * logo_width / art.width))), Image.LANCZOS)
    shadow = Image.new("RGBA", logo.size, (0, 0, 0, 0))
    shadow.putalpha(logo.getchannel("A").point(lambda a: a * LOGO_SHADOW_OPACITY // 255))
    return logo, shadow.filter(ImageFilter.GaussianBlur(max(1, logo_width // 40))), round(min(width, height) * LOGO_MARGIN_SHARE)


def watermarked(file, name: str, *, centre: bool = True) -> ContentFile:
    """A stamped copy of an image file: the centred name (unless it's already there) and the logo.
    Camera details (including location) are dropped along the way."""
    file.seek(0)
    with Image.open(file) as source:
        kind = source.format if source.format in SAVE_OPTIONS else "JPEG"
        photo = ImageOps.exif_transpose(source).convert("RGBA")
    if centre:
        photo.alpha_composite(_layer(*photo.size))
    logo, shadow, margin = _logo(*photo.size)
    offset = max(1, logo.width // 60)
    photo.alpha_composite(shadow, (margin + offset, margin + offset))
    photo.alpha_composite(logo, (margin, margin))
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
