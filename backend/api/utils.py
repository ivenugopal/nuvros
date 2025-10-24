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
    Fetch allowed brands for all modules for the given username.
    Expands "ALL" dynamically to actual brand list from the database.

    Returns:
        dict(module_name -> list of brands)
        Example:
        {
          "Sales": ["Clear", "Bindu"],
          "Hygiene": ["Kyzile", "Bislere"],
          "DRR": ["Clear", "Bindu", "Dove"]
        }
    """

    if not username:
        return {}

    # 🔹 Step 1: Fetch mapping from DB
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT module_brand_mapping
            FROM public.users_data
            WHERE full_name = %s
        """, [username])
        result = cursor.fetchone()

    if not result or not result[0]:
        return {}

    # 🔹 Step 2: Safely parse JSONB column
    try:
        mapping = json.loads(result[0]) if isinstance(result[0], str) else result[0]
    except (TypeError, json.JSONDecodeError):
        return {}

    all_brands = get_all_brands_from_db()
    expanded_mapping = {}

    # 🔹 Step 4: Expand "ALL" per module
    for module, brands in (mapping or {}).items():
        if not isinstance(brands, list):
            continue
        if any(str(b).upper() == "ALL" for b in brands):
            expanded_mapping[module] = all_brands.copy()
        else:
            expanded_mapping[module] = [b.strip() for b in brands if b and b.strip()]

    return expanded_mapping

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

