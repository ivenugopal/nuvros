from django.db import models


class AppUser(models.Model):
    """ORM mapping for existing `users` table in PostgreSQL.

    This model is not managed by Django migrations. It mirrors the columns
    shown in the provided schema screenshot.
    """

    id = models.AutoField(primary_key=True)
    username = models.CharField(max_length=50)
    email = models.CharField(max_length=255, blank=True, null=True)
    password_hash = models.TextField()
    full_name = models.CharField(max_length=100, blank=True, null=True)
    module_brand_mapping = models.JSONField(default=dict)  # ✅ store module access map
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        # Explicitly qualify schema to avoid search_path issues
        db_table = '"public"."users_data"'

    def __str__(self) -> str:  # noqa: D401
        return self.username

