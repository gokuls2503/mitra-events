"""Fill the website with PLACEHOLDER content and images for development/demo.

Everything here must be replaced with real Mitra content before launch —
especially testimonials, which must come from real clients.
"""

import io
import random
from urllib.parse import quote_plus

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from apps.core.choices import EventType as E
from apps.website.gallery import category_for_event_type
from apps.website.models import (
    EstimatorAddon,
    EstimatorEventType,
    EstimatorTier,
    GalleryImage,
    Package,
    Service,
    SiteSettings,
    Testimonial,
)

ADDRESS = "Door no – 268-1, KSP Complex,\nPollachi Main Rd, Sundrapuram,\nCoimbatore – 641024"
CONTACT = {
    "phone": "+91 98946 06292",
    "phone_2": "+91 94457 42696",
    "whatsapp": "919894606292",
    "email": "mitraeventmanagement@gmail.com",
    "address": ADDRESS,
    "map_embed_url": "https://www.google.com/maps?q=" + quote_plus(ADDRESS.replace("\n", " ").replace(" – ", " ")) + "&output=embed",
}

PALETTES = [
    ("#4a1d3d", "#c9a14a"),
    ("#742f5f", "#ead39c"),
    ("#33142b", "#8e3b74"),
    ("#5c2550", "#dcb86a"),
    ("#8e3b74", "#fbf4f8"),
    ("#2b1d33", "#c9a14a"),
]


def _hex(c):
    return tuple(int(c[i : i + 2], 16) for i in (1, 3, 5))


def placeholder_image(label: str, seed: int, size=(1600, 1067)) -> ContentFile:
    """Gradient + soft 'bokeh' lights, like a blurred decor photo, with a PLACEHOLDER tag."""
    rnd = random.Random(seed)
    top, bottom = (_hex(c) for c in PALETTES[seed % len(PALETTES)])
    w, h = size
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        draw.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))

    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for _ in range(38):
        r = rnd.randint(18, 110)
        x, y = rnd.randint(0, w), rnd.randint(0, h)
        tone = rnd.choice([(255, 228, 170), (255, 245, 225), (234, 211, 156), (240, 190, 215)])
        gdraw.ellipse([x - r, y - r, x + r, y + r], fill=(*tone, rnd.randint(40, 120)))
    glow = glow.filter(ImageFilter.GaussianBlur(14))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")

    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=34)
    text = f"PLACEHOLDER · {label}"
    tw = draw.textlength(text, font=font)
    draw.rounded_rectangle([40, h - 100, 80 + tw, h - 40], radius=12, fill=(0, 0, 0, 0), outline=(255, 255, 255))
    draw.text((60, h - 90), text, fill=(255, 255, 255), font=font)

    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82, optimize=True, progressive=True)
    return ContentFile(buf.getvalue())


SERVICES = [
    (E.WEDDING, "Wedding Decoration", 150000, True,
     "Mandap, stage and venue decor that turns your muhurtham into a memory.",
     ["Traditional & contemporary mandap designs", "Fresh flower and drape styling", "Entrance, aisle and dining decor", "Coordinated lighting"]),
    (E.RECEPTION, "Reception & Engagement Stages", 60000, True,
     "Statement stages and backdrops for receptions, engagements and nichayathartham.",
     ["Custom stage backdrops", "LED and ambient lighting", "Couple seating & photo corners"]),
    (E.BIRTHDAY, "Birthday Party Decoration", 15000, True,
     "Themed birthday setups for first birthdays, kids' parties and milestone celebrations.",
     ["Balloon and theme decor", "Cake table & backdrop", "Kids' activity corners"]),
    (E.BABY_SHOWER, "Baby Shower & Seemantham", 20000, False,
     "Graceful, traditional decor for valaikaapu, seemantham and baby showers.",
     ["Traditional swing (oonjal) setup", "Floral and banana-leaf decor", "Bangle ceremony corner"]),
    (E.HOUSEWARMING, "Housewarming (Griha Pravesham)", 12000, False,
     "Auspicious entrance, puja and hall decor for your new home.",
     ["Mango-leaf thoranam & kolam", "Puja area styling", "Guest seating decor"]),
    (E.CORPORATE, "Corporate Events", 40000, True,
     "Product launches, award nights, conferences and office celebrations.",
     ["Branded stage & backdrops", "Registration and photo walls", "AV and lighting coordination"]),
    (E.TRADITIONAL, "Traditional & Puja Decor", 10000, False,
     "Temple-style decor for pujas, ear-piercing ceremonies and family functions.",
     ["Fresh flower garlands & thoranams", "Brass and lamp arrangements", "Rangoli/kolam design"]),
]

PACKAGES = [
    ("Celebration Essentials", "For intimate home functions and birthdays", E.BIRTHDAY, 15000, "starting from", False,
     ["Theme backdrop (8×8 ft)", "Balloon or floral styling", "Cake table decor", "Setup & removal"]),
    ("Signature", "Our most-loved package for engagements & receptions", E.RECEPTION, 55000, "starting from", True,
     ["Custom stage backdrop", "Fresh flower styling", "Entrance decor", "Ambient & stage lighting", "Photo corner"]),
    ("Grand Wedding", "Complete wedding decor, muhurtham to reception", E.WEDDING, 175000, "starting from", False,
     ["Mandap & reception stage", "Entrance, aisle and dining decor", "Premium fresh flowers", "Full lighting design", "Dedicated event coordinator"]),
]

ESTIMATOR_EVENTS = [
    (E.WEDDING, 90000, 120, 100, 2000),
    (E.RECEPTION, 45000, 80, 100, 2000),
    (E.ENGAGEMENT, 30000, 60, 50, 1000),
    (E.BIRTHDAY, 10000, 40, 20, 500),
    (E.BABY_SHOWER, 15000, 40, 20, 500),
    (E.HOUSEWARMING, 10000, 30, 20, 500),
    (E.CORPORATE, 35000, 90, 30, 2000),
    (E.TRADITIONAL, 8000, 25, 20, 1000),
]

TIERS = [
    ("Classic", "Elegant, budget-friendly styling", "1.00"),
    ("Premium", "Richer florals, custom backdrops, more lighting", "1.40"),
    ("Luxury", "Designer concepts, premium fresh flowers, full lighting design", "1.90"),
]

ADDONS = [
    ("Entrance arch & welcome board", "FLAT", 8000),
    ("Photo booth / selfie corner", "FLAT", 12000),
    ("Stage & ambient lighting upgrade", "FLAT", 15000),
    ("Sound system & DJ", "FLAT", 18000),
    ("Photography & videography", "FLAT", 35000),
    ("Return gifts", "PER_GUEST", 120),
]

GALLERY = [
    (E.WEDDING, "Mandap with fresh flower drapes"),
    (E.WEDDING, "Wedding entrance decor"),
    (E.RECEPTION, "Reception stage with LED backdrop"),
    (E.ENGAGEMENT, "Engagement stage in gold and ivory"),
    (E.BIRTHDAY, "First birthday theme setup"),
    (E.BIRTHDAY, "Kids' party balloon decor"),
    (E.BABY_SHOWER, "Seemantham swing decor"),
    (E.HOUSEWARMING, "Griha pravesham entrance"),
    (E.CORPORATE, "Product launch stage"),
    (E.CORPORATE, "Award night backdrop"),
    (E.TRADITIONAL, "Puja decor with brass lamps"),
    (E.RECEPTION, "Dining area styling"),
]

TESTIMONIALS = [
    ("Sample Client A", E.WEDDING, "Coimbatore",
     "Placeholder review. Replace with a real client's words before launch. The decor was exactly what we imagined."),
    ("Sample Client B", E.BIRTHDAY, "Saravanampatti",
     "Placeholder review. Replace with a real client's words. The team set everything up on time and the kids loved it."),
    ("Sample Client C", E.CORPORATE, "Peelamedu",
     "Placeholder review. Replace with a real client's words. Professional, organised and great attention to branding."),
    ("Sample Client D", E.RECEPTION, "RS Puram",
     "Placeholder review. Replace with a real client's words. Our reception stage got so many compliments."),
    ("Sample Client E", E.BABY_SHOWER, "Vadavalli",
     "Placeholder review. Replace with a real client's words. Traditional and elegant, just what our family wanted."),
]


class Command(BaseCommand):
    help = "Seed the website with placeholder content and generated images (development only)."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing website content first.")

    @transaction.atomic
    def handle(self, *args, reset, **options):
        if not settings.DEBUG:
            raise CommandError("seed_website is for development only (DEBUG must be True).")
        if Service.objects.exists() and not reset:
            self.stdout.write("Website content already exists. Use --reset to replace it.")
            return
        if reset:
            for model in (Service, Package, GalleryImage, Testimonial, EstimatorEventType, EstimatorTier, EstimatorAddon):
                model.objects.all().delete()

        site = SiteSettings.load()
        site.business_name = "Mitra Events Management"
        site.tagline = "Decor that tells your story"
        # From the client's visiting card. Hours are left empty until the client confirms them.
        site.phone = CONTACT["phone"]
        site.phone_2 = CONTACT["phone_2"]
        site.whatsapp = CONTACT["whatsapp"]
        site.email = CONTACT["email"]
        site.address = CONTACT["address"]
        site.map_embed_url = CONTACT["map_embed_url"]
        site.business_hours = ""
        site.hero_title = "Celebrations, beautifully decorated"
        site.hero_subtitle = (
            "Weddings, receptions, birthdays and corporate events across Coimbatore — "
            "designed, decorated and managed by Mitra."
        )
        site.about_title = "Every celebration deserves a story"
        site.about_body = (
            "Placeholder about text. Mitra Events Management is an event decoration and management studio "
            "based in Coimbatore. We plan, design and execute weddings, family functions and corporate events "
            "with care for tradition and an eye for detail.\n\n"
            "Replace this with Mitra's real story: how it started, the founder, and what makes the team different."
        )
        site.stat_events, site.stat_years, site.stat_clients = 500, 8, 450
        site.hero_image.save("hero.jpg", placeholder_image("Hero", 101, (2000, 1200)), save=False)
        site.about_image.save("about.jpg", placeholder_image("About", 102, (1200, 1400)), save=False)
        site.save()

        for i, (cat, name, price, featured, short, highlights) in enumerate(SERVICES):
            svc = Service(
                name=name,
                category=cat,
                short_description=short,
                description=f"{short}\n\nPlaceholder description — replace with real details about how Mitra handles {name.lower()}.",
                highlights=highlights,
                starting_price=price,
                is_featured=featured,
                order=i,
            )
            svc.cover_image.save(f"{cat.lower()}.jpg", placeholder_image(name, i), save=False)
            svc.save()

        for i, (name, tagline, et, price, note, popular, items) in enumerate(PACKAGES):
            Package.objects.create(
                name=name, tagline=tagline, event_type=et, price=price, price_note=note,
                is_popular=popular, inclusions=items, order=i,
            )

        for i, (cat, caption) in enumerate(GALLERY):
            g = GalleryImage(
                category=cat, gallery_category=category_for_event_type(cat), caption=caption, alt_text=caption, is_featured=i < 6, order=i
            )
            g.image.save(f"gallery-{i + 1}.jpg", placeholder_image(caption, 20 + i), save=False)
            g.save()

        for i, (name, et, loc, quote) in enumerate(TESTIMONIALS):
            Testimonial.objects.create(
                client_name=name, event_type=et, event_location=loc, quote=quote, rating=5, is_featured=i < 3, order=i
            )

        for i, (et, base, per_guest, mn, mx) in enumerate(ESTIMATOR_EVENTS):
            EstimatorEventType.objects.create(
                event_type=et, base_price=base, per_guest_rate=per_guest, min_guests=mn, max_guests=mx, order=i
            )
        for i, (name, desc, mult) in enumerate(TIERS):
            EstimatorTier.objects.create(name=name, description=desc, multiplier=mult, order=i)
        for i, (name, pricing, price) in enumerate(ADDONS):
            EstimatorAddon.objects.create(name=name, pricing=pricing, price=price, order=i)

        self.stdout.write(self.style.SUCCESS("Website seeded with PLACEHOLDER content."))
        self.stdout.write(self.style.WARNING("Replace testimonials, contact details and images before launch."))
