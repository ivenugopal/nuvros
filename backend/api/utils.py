from django.db import connection
from datetime import datetime, date, timedelta
from django.utils.crypto import pbkdf2
import json
from django.core.cache import cache


# 🔹 Step 3: Get all brands once (cached)
def get_all_brands_from_db():
    cache_key = "all_brands"
    brands = cache.get(cache_key)
    if brands:
        return brands
    with connection.cursor() as c:
        c.execute("""
            SELECT DISTINCT brand
            FROM public.sales_master_consolidated_final_test
            WHERE brand IS NOT NULL
            ORDER BY brand
        """)
        brands = [r[0] for r in c.fetchall()]
    cache.set(cache_key, brands, timeout=600)  # cache 10 mins
    return brands

def get_allowed_brands_for_user(username: str):
    """
    Fetch allowed brands for a given username.

    Logic:
    - If allowed_brands = 'ALL' (case-insensitive) → return all brands from sales_master_consolidated_final_test.
    - Otherwise → return comma-separated brands from allowed_brands column.
    - If user or column missing → return empty list.
    """
    try:
        with connection.cursor() as cursor:
            # Fetch the allowed_brands value for the given user
            cursor.execute("""
                SELECT allowed_brands
                FROM public.users_data
                WHERE full_name = %s
            """, [username])
            result = cursor.fetchone()

            if not result or not result[0]:
                return []  # No entry or empty value

            allowed_value = result[0].strip()

            # ✅ Case 1: User has ALL access
            if allowed_value.upper() == "ALL":
                cursor.execute("""
                    SELECT DISTINCT brand
                    FROM public.sales_master_consolidated_final_test
                    WHERE brand IS NOT NULL
                    ORDER BY brand
                """)
                return [row[0] for row in cursor.fetchall()]

            # ✅ Case 2: User has specific brand list (comma-separated)
            brands = [b.strip() for b in allowed_value.split(',') if b.strip()]
            return brands

    except Exception as e:
        # Optional: log this error instead of raising
        print(f"[get_allowed_brands_for_user] Error for user {username}: {e}")
        return []

def parse_date(val):
    try:
        return datetime.strptime(val, "%Y-%m-%d").date() if val else None
    except ValueError:
        return None

# --- Helper to build WHERE clauses ---
def build_filter_clause(date1=None, date2=None, brand=None):
    filters, params = [], []
    if date1 and date2:
        filters.append("date BETWEEN %s AND %s")
        params.extend([date1, date2])
    elif date1:
        filters.append("date >= %s")
        params.append(date1)
    elif date2:
        filters.append("date <= %s")
        params.append(date2)
    if brand and brand != "All Brands":
        filters.append("brand = %s")
        params.append(brand)
    return (" WHERE " + " AND ".join(filters)) if filters else "", params

# Determine canonical column names
# Resolve AS-ON date column robustly (supports names like "As on")
def resolve_col(possible_names, column_names):
    lower_to_actual = {str(c).lower(): c for c in column_names}
    for cand in possible_names:
        if cand in lower_to_actual:
            return lower_to_actual[cand]
    return None

