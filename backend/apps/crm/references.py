"""Lead references: who may see them, and how uploaded images and videos are checked and stored.

The browser already shrinks photos (1600px, JPEG ~80%); the server re-checks everything
and normalises the file anyway, so a direct API upload can't store a 40 MB PNG or a
file that only pretends to be an image. Videos can't be shrunk in the browser, so they are
stored as sent, after a size limit and a check that the file really is an MP4/MOV/WebM video.
"""

import io
import uuid

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db.models import Q
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.accounts.models import Role

from .models import Lead, LeadImage
from .views import staff_bookings

MAX_UPLOAD_MB = 5
MAX_SIDE = 1600
THUMB_SIDE = 480
MAX_IMAGES_PER_SECTION = 60
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_VIDEO_MB = 100
MAX_VIDEOS_PER_SECTION = 15

Image.MAX_IMAGE_PIXELS = 50_000_000  # refuse decompression bombs


def reference_leads(user):
    """Leads whose references the user may see.

    Same as the lead itself, plus — for staff — leads of events they coordinate or are
    assigned to, so the decor team can see the designs and venue photos after conversion.
    """
    if user.role != Role.STAFF:
        return Lead.objects.all()
    return Lead.objects.filter(Q(assigned_to=user) | Q(booking__in=staff_bookings(user).values("pk"))).distinct()


def _encode(img: Image.Image, side: int, quality: int) -> bytes:
    img = img.copy()
    img.thumbnail((side, side), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def process_upload(upload) -> tuple[ContentFile, ContentFile]:
    """Validates an uploaded file and returns (image, thumbnail) as JPEGs."""
    if upload.size > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationError({"image": f"Each image must be under {MAX_UPLOAD_MB} MB."})
    try:
        img = Image.open(upload)
        img.verify()  # checks the file structure without decoding everything
        upload.seek(0)
        img = Image.open(upload)
        fmt = img.format
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError):
        raise ValidationError({"image": "That file isn't a valid image."})
    if fmt not in ALLOWED_FORMATS:
        raise ValidationError({"image": "Upload a JPEG, PNG or WebP image."})

    img = ImageOps.exif_transpose(img)  # phone photos store rotation in EXIF
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    name = uuid.uuid4().hex[:16]
    return (
        ContentFile(_encode(img, MAX_SIDE, 82), name=f"{name}.jpg"),
        ContentFile(_encode(img, THUMB_SIDE, 78), name=f"{name}.jpg"),
    )


def check_video(upload) -> ContentFile:
    """Checks an uploaded video by its size and the signature at the start of the file."""
    if upload.size > MAX_VIDEO_MB * 1024 * 1024:
        raise ValidationError({"video": f"Each video must be under {MAX_VIDEO_MB} MB."})
    head = upload.read(12)
    upload.seek(0)
    if head[4:8] == b"ftyp":
        ext = "mov" if head[8:10] == b"qt" else "mp4"
    elif head[:4] == b"\x1aE\xdf\xa3":
        ext = "webm"
    else:
        raise ValidationError({"video": "Upload an MP4, MOV or WebM video."})
    upload.name = f"{uuid.uuid4().hex[:16]}.{ext}"
    return upload


def add_image(*, lead: Lead, upload=None, video=None, section: str, source: str, caption: str, user) -> LeadImage:
    """Adds a photo, or a video with an optional cover frame (`upload`)."""
    if video is not None:
        if lead.images.filter(section=section).exclude(video="").count() >= MAX_VIDEOS_PER_SECTION:
            raise ValidationError({"video": f"This section already has {MAX_VIDEOS_PER_SECTION} videos. Remove some first."})
        video = check_video(video)
    elif upload is None:
        raise ValidationError({"image": "Choose a photo or a video."})
    if lead.images.filter(section=section).count() >= MAX_IMAGES_PER_SECTION:
        raise ValidationError({"image": f"This section already has {MAX_IMAGES_PER_SECTION} images. Remove some first."})
    image, thumb = process_upload(upload) if upload is not None else (None, None)
    obj = LeadImage(
        lead=lead,
        section=section,
        source=source if section == LeadImage.Section.DESIGN else LeadImage.Source.OURS,
        caption=caption.strip(),
        uploaded_by=user,
    )
    if image is not None:
        obj.image.save(image.name, image, save=False)
        obj.thumbnail.save(thumb.name, thumb, save=False)
    if video is not None:
        obj.video.save(video.name, video, save=False)
    obj.save()
    return obj
