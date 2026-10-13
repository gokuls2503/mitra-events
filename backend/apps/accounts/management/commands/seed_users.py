from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import Role, User

DEMO_USERS = [
    ("owner@mitra.local", "Mitra Owner", Role.OWNER),
    ("manager@mitra.local", "Event Manager", Role.MANAGER),
    ("staff@mitra.local", "Decor Staff", Role.STAFF),
    ("accounts@mitra.local", "Accountant", Role.ACCOUNTANT),
]


class Command(BaseCommand):
    help = "Create one demo user per role for local development."

    def add_arguments(self, parser):
        parser.add_argument("--password", default="Mitra@2026")

    def handle(self, *args, password, **options):
        if not settings.DEBUG:
            raise CommandError("seed_users is for development only (DEBUG must be True).")
        for email, name, role in DEMO_USERS:
            user, created = User.objects.get_or_create(
                email=email, defaults={"full_name": name, "role": role}
            )
            if created:
                user.set_password(password)
                if role == Role.OWNER:
                    user.is_staff = user.is_superuser = True
                user.save()
            self.stdout.write(f"{'created' if created else 'exists '}  {role:<11} {email}")
        self.stdout.write(self.style.SUCCESS(f"Done. Password for new users: {password}"))
