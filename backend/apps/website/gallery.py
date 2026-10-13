"""Gallery category helpers shared by the API and the demo seed."""

from apps.core.choices import EventType

from .models import GalleryCategory

# Starter categories that match an event type; other event types get a category of their own name.
FROM_EVENT_TYPE = {EventType.WEDDING: "Wedding", EventType.ENGAGEMENT: "Engagement", EventType.BIRTHDAY: "Birthday", EventType.CORPORATE: "Corporate"}


def category_for_event_type(event_type: str) -> GalleryCategory:
    name = FROM_EVENT_TYPE.get(event_type) or EventType(event_type).label
    found = GalleryCategory.objects.filter(name__iexact=name).first()
    return found or GalleryCategory.objects.create(name=name, order=next_order())


def next_order() -> int:
    last = GalleryCategory.objects.order_by("-order").first()
    return last.order + 1 if last else 0
