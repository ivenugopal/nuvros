from django.db import connection
from datetime import datetime, date, timedelta
from django.utils.crypto import pbkdf2


def get_allowed_brands_for_user(username: str):
    """
    Fetch comma-separated allowed brands for the given username
    from the users table.
    Returns a list of allowed brands (upper/lowercase preserved).
    """
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT allowed_brands
            FROM public.users_data
            WHERE full_name = %s
        """, [username])
        result = cursor.fetchone()
        if not result or not result[0]:
            return []  # no restriction => no brands allowed
        allowed = [b.strip() for b in result[0].split(',') if b.strip()]
        return allowed

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

