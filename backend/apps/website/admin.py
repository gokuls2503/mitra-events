from django.contrib import admin

from . import models

admin.site.register(
    [
        models.SiteSettings,
        models.Service,
        models.Package,
        models.GalleryImage,
        models.Testimonial,
        models.EstimatorEventType,
        models.EstimatorTier,
        models.EstimatorAddon,
    ]
)
