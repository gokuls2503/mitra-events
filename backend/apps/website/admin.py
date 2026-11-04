from django.contrib import admin

from . import models


class ServiceImageInline(admin.TabularInline):
    model = models.ServiceImage
    extra = 0


@admin.register(models.Service)
class ServiceAdmin(admin.ModelAdmin):
    inlines = [ServiceImageInline]


admin.site.register(
    [
        models.SiteSettings,
        models.Package,
        models.GalleryImage,
        models.Testimonial,
        models.Faq,
        models.EstimatorEventType,
        models.EstimatorAddon,
    ]
)
