from django.db import connection
from datetime import datetime, date, timedelta
from django.utils.crypto import pbkdf2
import json
from django.core.cache import cache
import logging
from decimal import Decimal, InvalidOperation

import math
from .mock_data import *
logger = logging.getLogger(__name__)

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

    # 🔹 Step 4: Expand "ALL" per module and sort alphabetically
    for module, brands in (mapping or {}).items():
        if not isinstance(brands, list):
            continue
        if any(str(b).upper() == "ALL" for b in brands):
            expanded_mapping[module] = all_brands.copy()  # already sorted from get_all_brands_from_db
        else:
            # Sort user-specific brands alphabetically
            expanded_mapping[module] = sorted([b.strip() for b in brands if b and b.strip()])

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

# Calculate hygiene scores from percentage values
def calculate_average_percentage_hygiene_mock(column_name):
    """Calculate average of percentage values from a column (e.g., '100%', '50%', '0%')"""
    values = []
    for record in hygiene_overviewmock_data:
        hygiene_value = record.get(column_name, '')
        if hygiene_value and isinstance(hygiene_value, str):
            try:
                # Handle common error strings
                clean_value = hygiene_value.strip()
                if clean_value in ['#ERROR!', 'N/A', 'NULL', 'null', '']:
                    continue

                # Remove % and convert to float
                if '%' in clean_value:
                    numeric_value = float(clean_value.replace('%', '').strip())
                else:
                    numeric_value = float(clean_value)
                values.append(numeric_value)
            except (ValueError, AttributeError):
                # Skip invalid values
                continue
    logger.debug(f"Mock {column_name} values: %s", values)
    return (sum(values) / len(values)) if values else 0


def _parse_percent_number(value):
    """
    Accepts '85%', '85', 85, Decimal('85'), etc.
    Returns float in [0, +inf) or None if invalid/NaN/Inf.
    Strips '%' and whitespace. Skips error tokens and NaN/Inf.
    """
    ERROR_STRINGS = {'#ERROR!', 'N/A', 'NULL', 'null', ''}
    if value is None:
        return None

    # strings: strip, drop %, reject error tokens
    if isinstance(value, str):
        s = value.strip()
        if s in ERROR_STRINGS:
            return None
        # common textual NaN/Inf
        if s.lower() in {'nan', '+nan', '-nan', 'inf', '+inf', '-inf', 'infinity', '+infinity', '-infinity'}:
            return None
        if s.endswith('%'):
            s = s[:-1].strip()
        try:
            f = float(s)
        except ValueError:
            return None
    elif isinstance(value, (int, float)):
        f = float(value)
    elif isinstance(value, Decimal):
        try:
            if value.is_nan() or value.is_infinite():
                return None
            f = float(value)
        except (InvalidOperation, ValueError):
            return None
    else:
        return None

    # final guard
    if math.isnan(f) or math.isinf(f):
        return None
    return f


# General function to calculate average of percentage-based hygiene scores
def calculate_average_percentage_hygiene(column_name, data):
    """
    Average a percentage-ish column, ignoring invalid/NaN/Inf values.
    Accepts values like '100%', '85', 85, Decimal, etc.
    """
    values = []
    for record in data:
        raw = record.get(column_name, '')
        f = _parse_percent_number(raw)
        if f is not None:
            values.append(f)
    return (sum(values) / len(values)) if values else 0.0

# Filter out rows with too many invalid values
def is_valid_row(row):
    error_count = 0
    for col in ['Price_Hygiene', 'Coupon_Hygiene', 'Activation_Hygiene', 'Availability_Hygiene', 'Deal_Hygiene', 'EDD_Hygiene', 'Sold By Validation', 'Rating_Hygiene', 'Catalog_Hygiene']:
        value = row.get(col, '')
        if isinstance(value, str) and value.strip() in ['#ERROR!', 'N/A', 'NULL', 'null', '']:
            error_count += 1
    # Allow rows with up to 3 invalid values
    return error_count <= 3

# ---------------------------------------------------------------------
# 2️⃣ Helper: parse date safely
# ---------------------------------------------------------------------
def parse_date(val):
    try:
        return datetime.strptime(val, "%Y-%m-%d").date() if val else None
    except ValueError:
        return None
