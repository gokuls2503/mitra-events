from django.contrib import admin

from .models import Lead, MaterialCatalog


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "event_type", "event_date", "status", "source", "created_at"]
    list_filter = ["status", "source", "event_type"]
    search_fields = ["name", "phone", "email"]


@admin.register(MaterialCatalog)
class MaterialCatalogAdmin(admin.ModelAdmin):
    list_display = ["name", "default_unit", "default_rate", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name"]
