"""Estimator prices the stage per square foot instead of per guest, and drops decor levels."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("website", "0014_event_type_puberty_label"),
    ]

    operations = [
        migrations.AlterField(
            model_name="estimatoreventtype",
            name="base_price",
            field=models.DecimalField(decimal_places=0, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="estimatoreventtype",
            name="rate_per_sqft",
            field=models.DecimalField(decimal_places=0, default=25, max_digits=8),
        ),
        migrations.AddField(
            model_name="estimatoreventtype",
            name="min_sqft",
            field=models.PositiveIntegerField(default=50),
        ),
        migrations.AddField(
            model_name="estimatoreventtype",
            name="max_sqft",
            field=models.PositiveIntegerField(default=2000),
        ),
        migrations.RemoveField(model_name="estimatoreventtype", name="per_guest_rate"),
        migrations.RemoveField(model_name="estimatoreventtype", name="min_guests"),
        migrations.RemoveField(model_name="estimatoreventtype", name="max_guests"),
        migrations.DeleteModel(name="EstimatorTier"),
    ]
