from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.db import connection
import json
from datetime import datetime, date, timedelta
import calendar
from django.utils.crypto import pbkdf2
import os
import logging
import math
from decimal import Decimal, InvalidOperation
from typing import Any, Optional
import hashlib, json
from django.core.cache import cache

from .models import AppUser
from .auth import generate_jwt, require_auth, refresh_jwt

logger = logging.getLogger(__name__)

@api_view(['GET'])
@require_auth
def get_consolidated_data(request):
    """
    Optimized: Aggregated sales data by platform with optional date filtering and growth rate calculation.
    Uses CTEs and reduced query overhead for faster performance.
    """
    try:
        q = request.query_params
        brand = q.get("brand")
        start_date_str, end_date_str = q.get("start_date"), q.get("end_date")

        # --- Optional caching ---
        key = f"consolidated:{brand}:{start_date_str}:{end_date_str}"
        cached = cache.get(key)
        if cached:
            cached["cache_hit"] = True
            return Response(cached, status=status.HTTP_200_OK)

        def parse_date(val):
            try:
                return datetime.strptime(val, "%Y-%m-%d").date() if val else None
            except ValueError:
                return None

        start_date, end_date = parse_date(start_date_str), parse_date(end_date_str)
        if start_date_str and not start_date:
            return Response({'success': False, 'error': 'Invalid start_date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        if end_date_str and not end_date:
            return Response({'success': False, 'error': 'Invalid end_date format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        # --- Compute previous period ---
        prev_start_date = prev_end_date = None
        if start_date and end_date:
            period_days = (end_date - start_date).days + 1
            prev_end_date = start_date - timedelta(days=1)
            prev_start_date = prev_end_date - timedelta(days=period_days - 1)

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

        # --- Unified query with previous & current GMV ---
        where_clause, params = build_filter_clause(start_date, end_date, brand)
        prev_clause, prev_params = build_filter_clause(prev_start_date, prev_end_date, brand)

        sql = f"""
            WITH current_data AS (
                SELECT platform,
                       SUM(COALESCE(gmv, 0)) AS sales_gmv,
                       SUM(COALESCE(units, 0)) AS sales_units,
                       COUNT(DISTINCT sales_city) AS cities_live,
                       COUNT(DISTINCT title) AS total_articles
                FROM public.sales_master_consolidated_final_test
                {where_clause}
                GROUP BY platform
            ),
            prev_data AS (
                SELECT platform,
                       SUM(COALESCE(gmv, 0)) AS prev_gmv
                FROM public.sales_master_consolidated_final_test
                {prev_clause}
                GROUP BY platform
            )
            SELECT c.platform,
                   c.sales_gmv,
                   c.sales_units,
                   c.cities_live,
                   c.total_articles,
                   p.prev_gmv
            FROM current_data c
            LEFT JOIN prev_data p ON c.platform = p.platform
            ORDER BY c.platform;
        """

        with connection.cursor() as cursor:
            cursor.execute(sql, params + prev_params)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()

        data = []
        total_current_gmv = total_prev_gmv = 0.0
        for row in rows:
            row_dict = dict(zip(columns, row))
            current_gmv = float(row_dict.get("sales_gmv") or 0)
            prev_gmv = float(row_dict.get("prev_gmv") or 0)
            total_current_gmv += current_gmv
            total_prev_gmv += prev_gmv

            # Growth per platform
            if prev_gmv > 0:
                growth = ((current_gmv - prev_gmv) / prev_gmv) * 100
                row_dict["growth_rate"] = round(growth, 2)
            else:
                row_dict["growth_rate"] = None

            row_dict["sales_units"] = int(row_dict.get("sales_units") or 0)
            data.append(row_dict)

        # Total growth
        total_growth_rate = None
        if total_prev_gmv > 0:
            total_growth_rate = round(((total_current_gmv - total_prev_gmv) / total_prev_gmv) * 100, 2)

        # --- Additional summaries ---
        def run_count_query(field):
            clause, params = build_filter_clause(start_date, end_date, brand)
            with connection.cursor() as c:
                c.execute(f"SELECT COUNT(DISTINCT {field}) FROM public.sales_master_consolidated_final_test{clause}", params)
                return c.fetchone()[0] or 0

        total_cities_live = run_count_query("sales_city")
        total_articles = run_count_query("title")

        # --- Platform list ---
        clause, params = build_filter_clause(None, None, brand)
        with connection.cursor() as c:
            c.execute(f"SELECT DISTINCT platform FROM public.sales_master_consolidated_final_test{clause} ORDER BY platform", params)
            platforms = [r[0] for r in c.fetchall()]

        # --- Brand list ---
        with connection.cursor() as c:
            c.execute("SELECT DISTINCT brand FROM public.sales_master_consolidated_final_test WHERE brand IS NOT NULL ORDER BY brand")
            brands = [r[0] for r in c.fetchall()]

        response_data = {
            "success": True,
            "data": data,
            "count": len(data),
            "total_growth_rate": total_growth_rate,
            "total_cities_live": total_cities_live,
            "total_articles": total_articles,
            "platforms": platforms,
            "brands": brands,
            "filters": {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "prev_start_date": prev_start_date.isoformat() if prev_start_date else None,
                "prev_end_date": prev_end_date.isoformat() if prev_end_date else None,
                "brand": brand,
            },
        }

        # cache.set(key, response_data, timeout=600)
        return Response(response_data, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"success": False, "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@require_auth
def get_daily_report(request):
    """
    Optimized Daily Report: GMV/Units by date vs item/city/source.
    - Uses single CTE for all filters
    - Reduces redundant queries
    - Uses pre-indexed date_cast if available
    - Adds 10-min cache per unique filter set
    """

    try:
        # --- 1️⃣ Extract and validate params ---
        q = request.query_params
        start_date, end_date = q.get('start_date'), q.get('end_date')

        def parse_multi(name: str):
            raw = q.get(name)
            return [v.strip() for v in raw.split(',') if v.strip()] if raw else []

        filters = {
            "platform": parse_multi("platform"),
            "brand": parse_multi("brand"),
            "category": parse_multi("category"),
            "sub_category": parse_multi("sub_category"),
            "sales_city": parse_multi("city"),
            "supply_city": parse_multi("supply_source"),
            "manufacture_city": parse_multi("manufacturing_city"),
        }

        metric = q.get('metric', 'gmv').lower()
        view = q.get('view', 'platform_item_id')

        # Validate required fields
        if not start_date or not end_date:
            return Response({'success': False, 'error': 'start_date and end_date are required'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        except ValueError:
            return Response({'success': False, 'error': 'Invalid date format. Use YYYY-MM-DD'},
                            status=status.HTTP_400_BAD_REQUEST)

        if start_date > end_date:
            return Response({'success': False, 'error': 'start_date must be before end_date'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Validate metric/view
        if metric not in ['gmv', 'units']:
            metric = 'gmv'
        if view not in ['platform_item_id', 'supply_source', 'supply_city']:
            view = 'platform_item_id'

        # --- 2️⃣ Generate cache key and check ---
        cache_key = f"daily:{metric}:{view}:{start_date}:{end_date}:{str(filters)}"
        cached_response = cache.get(cache_key)
        if cached_response:
            return Response(cached_response, status=status.HTTP_200_OK)

        # --- 3️⃣ Detect date_cast column (for speed) ---
        if not hasattr(get_daily_report, "_has_date_cast"):
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema='public'
                        AND table_name='sales_master_consolidated_final_test'
                        AND column_name='date_cast'
                    );
                """)
                get_daily_report._has_date_cast = cursor.fetchone()[0]
        date_column = 'date_cast' if getattr(get_daily_report, '_has_date_cast', False) else 'date'

        # --- 4️⃣ Build WHERE dynamically ---
        where, params = [f"{date_column} BETWEEN %s AND %s"], [start_date, end_date]
        for col, vals in filters.items():
            if vals:
                placeholders = ','.join(['%s'] * len(vals))
                where.append(f"{col} IN ({placeholders})")
                params.extend(vals)
        where_sql = " AND ".join(where)

        # --- 5️⃣ CTE for filtered data ---
        cte = f"""
            WITH filtered AS (
                SELECT * FROM public.sales_master_consolidated_final_test
                WHERE {where_sql}
            )
        """

        # --- 6️⃣ Choose grouping and metric fields ---
        group_field = {
            "platform_item_id": "platform_item_id",
            "supply_source": "supply_city",
            "supply_city": "sales_city",
        }[view]
        metric_field = 'gmv' if metric == 'gmv' else 'units'

        # --- 7️⃣ Fetch data in one DB session ---
        with connection.cursor() as cursor:
            # Distinct dates
            cursor.execute(f"{cte} SELECT DISTINCT {date_column} FROM filtered ORDER BY {date_column} ASC;", params)
            unique_dates = [r[0] for r in cursor.fetchall()]

            # Distinct items
            cursor.execute(f"""
                {cte}
                SELECT DISTINCT {group_field}
                FROM filtered
                WHERE {group_field} IS NOT NULL AND {group_field} != ''
                ORDER BY {group_field};
            """, params)
            unique_items = [r[0] for r in cursor.fetchall()]

            # Aggregated data
            cursor.execute(f"""
                {cte}
                SELECT 
                    {group_field} AS identifier,
                    {date_column}::date AS parsed_date,
                    SUM(COALESCE({metric_field}, 0)) AS daily_value
                FROM filtered
                WHERE {group_field} IS NOT NULL AND {group_field} != ''
                GROUP BY {group_field}, {date_column}
                ORDER BY {group_field}, {date_column};
            """, params)
            data = cursor.fetchall()

        # --- 8️⃣ Pivot in Python ---
        metric_map = {}
        for ident, parsed_date, val in data:
            metric_map.setdefault(ident, {})[parsed_date] = float(val or 0)

        table_data = []
        for item in unique_items:
            row = {view: item, 'dates': {}}
            running_total = 0.0
            for d in unique_dates:
                val = float(metric_map.get(item, {}).get(d, 0))
                if view == 'supply_city':
                    running_total += val
                    row['dates'][d.isoformat()] = running_total
                else:
                    row['dates'][d.isoformat()] = val
            table_data.append(row)

        # --- 9️⃣ Dropdown filters ---
        dropdowns = {}
        dropdown_fields = [
            'platform', 'brand', 'sales_city', 'supply_city',
            'manufacture_city', 'category', 'sub_category'
        ]
        with connection.cursor() as cursor:
            for field in dropdown_fields:
                cursor.execute(f"""
                    {cte}
                    SELECT DISTINCT {field}
                    FROM filtered
                    WHERE {field} IS NOT NULL
                    ORDER BY {field};
                """, params)
                dropdowns[field] = [r[0] for r in cursor.fetchall()]

        # --- 🔟 Build and cache response ---
        response_data = {
            'success': True,
            'data': table_data,
            'unique_dates': [d.isoformat() for d in unique_dates],
            'metric': metric,
            'view': view,
            'filters': filters,
            **dropdowns
        }
        cache.set(cache_key, response_data, timeout=600)
        return Response(response_data, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@require_auth
def get_sales_contribution(request):
    """
    Sales Contribution by item within selected platforms and date range.
    Columns: title, platform_item_id, gmv, units, contribution (= gmv / total_gmv)

    Query params:
    - start_date: YYYY-MM-DD (optional)
    - end_date: YYYY-MM-DD (optional)
    - platforms: comma-separated platform names (optional; if missing => all)
    - page: Page number (default: 1)
    - page_size: Items per page (default: 20, max: 100)
    """
    try:
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        platforms_param = request.query_params.get('platforms')
        city_param = request.query_params.get('city')
        supply_source_param = request.query_params.get('supply_source')
        manufacturing_param = request.query_params.get('manufacturing_city')
        brand_param = request.query_params.get('brand')
        category = request.query_params.get('category')
        sub_category = request.query_params.get('sub_category')
        
        # Get pagination parameters
        try:
            page = int(request.query_params.get('page', 1))
        except (ValueError, TypeError):
            page = 1
            
        try:
            page_size = int(request.query_params.get('page_size', 20))
        except (ValueError, TypeError):
            page_size = 20
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 100:  # Limit max page size to 100
            page_size = 20

        # Validate dates if provided
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({'success': False, 'error': 'Invalid start_date format. Use YYYY-MM-DD'}, status=400)
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({'success': False, 'error': 'Invalid end_date format. Use YYYY-MM-DD'}, status=400)

        platforms = None
        if platforms_param:
            platforms = [p.strip() for p in platforms_param.split(',') if p.strip()]

        with connection.cursor() as cursor:
            where_conditions = []
            params = []

            if start_date and end_date:
                where_conditions.append("date BETWEEN %s AND %s")
                params.extend([start_date, end_date])
            elif start_date:
                where_conditions.append("date >= %s")
                params.append(start_date)
            elif end_date:
                where_conditions.append("date <= %s")
                params.append(end_date)

            if platforms and len(platforms) > 0:
                placeholders = ','.join(['%s'] * len(platforms))
                where_conditions.append(f"platform IN ({placeholders})")
                params.extend(platforms)

            # Handle multi-selects for city/supply/manufacturing
            city_values = [c.strip() for c in city_param.split(',')] if city_param else []
            supply_values = [s.strip() for s in supply_source_param.split(',')] if supply_source_param else []
            manufacturing_values = [m.strip() for m in manufacturing_param.split(',')] if manufacturing_param else []

            if city_values:
                placeholders = ','.join(['%s'] * len(city_values))
                where_conditions.append(f"sales_city IN ({placeholders})")
                params.extend(city_values)
                
            if supply_values:
                placeholders = ','.join(['%s'] * len(supply_values))
                where_conditions.append(f"supply_city IN ({placeholders})")
                params.extend(supply_values)
                
            # Handle multi-brand (comma-separated) or single brand
            brand_values = []
            if brand_param:
                brand_values = [b.strip() for b in brand_param.split(',') if b and b.strip()]
            if brand_values:
                if len(brand_values) == 1:
                    where_conditions.append("brand = %s")
                    params.append(brand_values[0])
                else:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    where_conditions.append(f"brand IN ({placeholders})")
                    params.extend(brand_values)

            # Apply manufacturing city filter to main data if provided
            if manufacturing_values:
                placeholders = ','.join(['%s'] * len(manufacturing_values))
                where_conditions.append(f"manufacture_city IN ({placeholders})")
                params.extend(manufacturing_values)

            if category and category.strip():
                where_conditions.append("category = %s")
                params.append(category.strip())
                
            if sub_category and sub_category.strip():
                where_conditions.append("sub_category = %s")
                params.append(sub_category.strip())

            where_clause = ' WHERE ' + ' AND '.join(where_conditions) if where_conditions else ''

            # Total GMV for denominator
            total_query = f"""
                SELECT COALESCE(SUM(COALESCE(gmv, 0)), 0)
                FROM public.sales_master_consolidated_final_test
                {where_clause}
            """
            cursor.execute(total_query, params)
            total_gmv = float(cursor.fetchone()[0] or 0)

            # Total Units for denominator (for units contribution)
            total_units_query = f"""
                SELECT COALESCE(SUM(COALESCE(units, 0)), 0)
                FROM public.sales_master_consolidated_final_test
                {where_clause}
            """
            cursor.execute(total_units_query, params)
            total_units = float(cursor.fetchone()[0] or 0)

            # Count total records for pagination
            count_query = f"""
                SELECT COUNT(*)
                FROM (
                    SELECT platform_item_id, title, platform
                    FROM public.sales_master_consolidated_final_test
                    {where_clause}
                    GROUP BY platform_item_id, title, platform
                ) AS grouped_data
            """
            cursor.execute(count_query, params)
            total_count = cursor.fetchone()[0]
            
            # Calculate pagination metadata
            total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1
            offset = (page - 1) * page_size
            has_previous = page > 1
            has_next = page < total_pages

            # Per item aggregation with pagination
            main_query = f"""
                SELECT 
                    platform_item_id,
                    title,
                    platform,
                    SUM(COALESCE(gmv, 0)) AS gmv,
                    SUM(COALESCE(units, 0)) AS units
                FROM public.sales_master_consolidated_final_test
                {where_clause}
                GROUP BY platform_item_id, title, platform
                ORDER BY gmv DESC
                LIMIT %s OFFSET %s
            """
            cursor.execute(main_query, params + [page_size, offset])
            columns = [c[0] for c in cursor.description]
            rows = cursor.fetchall()

        data = []
        for row in rows:
            record = dict(zip(columns, row))
            gmv_val = float(record.get('gmv') or 0)
            contribution = (gmv_val / total_gmv) if total_gmv > 0 else 0.0
            units_val = int(record.get('units') or 0)
            units_contribution = (units_val / total_units) if total_units > 0 else 0.0
            data.append({
                'title': record.get('title') or '',
                'platform_item_id': record.get('platform_item_id'),
                'platform': record.get('platform'),
                'gmv': gmv_val,
                'units': units_val,
                'contribution': contribution,
                'units_contribution': units_contribution
            })

        # Comprehensive cascading filter logic for Sales Contribution
        with connection.cursor() as cursor:
            # Build base WHERE conditions for all filter dropdown queries
            base_conditions = []
            base_params = []
            
            # Add date filtering to base conditions
            if start_date and end_date:
                base_conditions.append("date BETWEEN %s AND %s")
                base_params.extend([start_date, end_date])
            elif start_date:
                base_conditions.append("date >= %s")
                base_params.append(start_date)
            elif end_date:
                base_conditions.append("date <= %s")
                base_params.append(end_date)
            
            # Add platforms filtering to base conditions if platforms are selected
            if platforms and len(platforms) > 0:
                placeholders = ','.join(['%s'] * len(platforms))
                base_conditions.append(f"platform IN ({placeholders})")
                base_params.extend(platforms)
            
            # Add category and sub_category filtering to base conditions
            if category and category.strip():
                base_conditions.append("category = %s")
                base_params.append(category.strip())
                
            if sub_category and sub_category.strip():
                base_conditions.append("sub_category = %s")
                base_params.append(sub_category.strip())
            
            # Platforms list for dropdown (with comprehensive cascading filter support)
            platform_conditions = base_conditions.copy()
            platform_params = base_params.copy()
            if city_values:
                placeholders = ','.join(['%s'] * len(city_values))
                platform_conditions.append(f"sales_city IN ({placeholders})")
                platform_params.extend(city_values)
            if supply_values:
                placeholders = ','.join(['%s'] * len(supply_values))
                platform_conditions.append(f"supply_city IN ({placeholders})")
                platform_params.extend(supply_values)
            if manufacturing_values:
                placeholders = ','.join(['%s'] * len(manufacturing_values))
                platform_conditions.append(f"manufacture_city IN ({placeholders})")
                platform_params.extend(manufacturing_values)
            if brand_values:
                if len(brand_values) == 1:
                    platform_conditions.append("brand = %s")
                    platform_params.append(brand_values[0])
                else:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    platform_conditions.append(f"brand IN ({placeholders})")
                    platform_params.extend(brand_values)
            
            platform_where = " WHERE " + " AND ".join(platform_conditions) if platform_conditions else ""
            platform_query = f"SELECT DISTINCT platform FROM public.sales_master_consolidated_final_test{platform_where} ORDER BY platform"
            cursor.execute(platform_query, platform_params)
            platform_list = [r[0] for r in cursor.fetchall()]
            
            # Cities list for dropdown (with comprehensive cascading filter support)
            city_conditions = base_conditions.copy()
            city_params = base_params.copy()
            if supply_values:
                placeholders = ','.join(['%s'] * len(supply_values))
                city_conditions.append(f"supply_city IN ({placeholders})")
                city_params.extend(supply_values)
            if brand_values:
                if len(brand_values) == 1:
                    city_conditions.append("brand = %s")
                    city_params.append(brand_values[0])
                else:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    city_conditions.append(f"brand IN ({placeholders})")
                    city_params.extend(brand_values)
            if manufacturing_values:
                placeholders = ','.join(['%s'] * len(manufacturing_values))
                city_conditions.append(f"manufacture_city IN ({placeholders})")
                city_params.extend(manufacturing_values)
            
            city_conditions.append("sales_city IS NOT NULL")
            city_where = " WHERE " + " AND ".join(city_conditions)
            city_query = f"SELECT DISTINCT sales_city FROM public.sales_master_consolidated_final_test{city_where} ORDER BY sales_city"
            cursor.execute(city_query, city_params)
            city_list = [r[0] for r in cursor.fetchall()]
            
            # Supply sources list for dropdown (with comprehensive cascading filter support)
            supply_conditions = base_conditions.copy()
            supply_params = base_params.copy()
            if city_values:
                placeholders = ','.join(['%s'] * len(city_values))
                supply_conditions.append(f"sales_city IN ({placeholders})")
                supply_params.extend(city_values)
            if brand_values:
                if len(brand_values) == 1:
                    supply_conditions.append("brand = %s")
                    supply_params.append(brand_values[0])
                else:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    supply_conditions.append(f"brand IN ({placeholders})")
                    supply_params.extend(brand_values)
            if manufacturing_values:
                placeholders = ','.join(['%s'] * len(manufacturing_values))
                supply_conditions.append(f"manufacture_city IN ({placeholders})")
                supply_params.extend(manufacturing_values)
            
            supply_conditions.append("supply_city IS NOT NULL")
            supply_where = " WHERE " + " AND ".join(supply_conditions)
            supply_query = f"SELECT DISTINCT supply_city FROM public.sales_master_consolidated_final_test{supply_where} ORDER BY supply_city"
            cursor.execute(supply_query, supply_params)
            supply_source_list = [r[0] for r in cursor.fetchall()]
            
            # Brands list for dropdown (with comprehensive cascading filter support)
            brand_conditions = base_conditions.copy()
            brand_params = base_params.copy()
            if city_values:
                placeholders = ','.join(['%s'] * len(city_values))
                brand_conditions.append(f"sales_city IN ({placeholders})")
                brand_params.extend(city_values)
            if supply_values:
                placeholders = ','.join(['%s'] * len(supply_values))
                brand_conditions.append(f"supply_city IN ({placeholders})")
                brand_params.extend(supply_values)
            if manufacturing_values:
                placeholders = ','.join(['%s'] * len(manufacturing_values))
                brand_conditions.append(f"manufacture_city IN ({placeholders})")
                brand_params.extend(manufacturing_values)
            
            # Always return full brand list regardless of other filters (consistent across tabs)
            cursor.execute("SELECT DISTINCT brand FROM public.sales_master_consolidated_final_test WHERE brand IS NOT NULL ORDER BY brand")
            brand_list = [r[0] for r in cursor.fetchall()]
            
            # Categories list for dropdown (with comprehensive cascading filter support)
            category_conditions = base_conditions.copy()
            category_params = base_params.copy()
            if city_values:
                placeholders = ','.join(['%s'] * len(city_values))
                category_conditions.append(f"sales_city IN ({placeholders})")
                category_params.extend(city_values)
            if supply_values:
                placeholders = ','.join(['%s'] * len(supply_values))
                category_conditions.append(f"supply_city IN ({placeholders})")
                category_params.extend(supply_values)
            if brand_values:
                if len(brand_values) == 1:
                    category_conditions.append("brand = %s")
                    category_params.append(brand_values[0])
                else:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    category_conditions.append(f"brand IN ({placeholders})")
                    category_params.extend(brand_values)
            if manufacturing_values:
                placeholders = ','.join(['%s'] * len(manufacturing_values))
                category_conditions.append(f"manufacture_city IN ({placeholders})")
                category_params.extend(manufacturing_values)
            
            category_conditions.append("category IS NOT NULL")
            category_where = " WHERE " + " AND ".join(category_conditions)
            category_query = f"SELECT DISTINCT category FROM public.sales_master_consolidated_final_test{category_where} ORDER BY category"
            cursor.execute(category_query, category_params)
            category_list = [r[0] for r in cursor.fetchall()]
            
            # Sub-categories list for dropdown (with comprehensive cascading filter support)
            sub_category_conditions = base_conditions.copy()
            sub_category_params = base_params.copy()
            if city_values:
                placeholders = ','.join(['%s'] * len(city_values))
                sub_category_conditions.append(f"sales_city IN ({placeholders})")
                sub_category_params.extend(city_values)
            if supply_values:
                placeholders = ','.join(['%s'] * len(supply_values))
                sub_category_conditions.append(f"supply_city IN ({placeholders})")
                sub_category_params.extend(supply_values)
            if brand_values:
                if len(brand_values) == 1:
                    sub_category_conditions.append("brand = %s")
                    sub_category_params.append(brand_values[0])
                else:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    sub_category_conditions.append(f"brand IN ({placeholders})")
                    sub_category_params.extend(brand_values)
            if category:
                sub_category_conditions.append("category = %s")
                sub_category_params.append(category)
            if manufacturing_values:
                placeholders = ','.join(['%s'] * len(manufacturing_values))
                sub_category_conditions.append(f"manufacture_city IN ({placeholders})")
                sub_category_params.extend(manufacturing_values)

            # Manufacturing cities list for dropdown (exclude manufacturing filter itself)
            manufacturing_conditions = base_conditions.copy()
            manufacturing_params = base_params.copy()
            if city_values:
                placeholders = ','.join(['%s'] * len(city_values))
                manufacturing_conditions.append(f"sales_city IN ({placeholders})")
                manufacturing_params.extend(city_values)
            if supply_values:
                placeholders = ','.join(['%s'] * len(supply_values))
                manufacturing_conditions.append(f"supply_city IN ({placeholders})")
                manufacturing_params.extend(supply_values)
            if brand_values:
                if len(brand_values) == 1:
                    manufacturing_conditions.append("brand = %s")
                    manufacturing_params.append(brand_values[0])
                else:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    manufacturing_conditions.append(f"brand IN ({placeholders})")
                    manufacturing_params.extend(brand_values)
            if category:
                manufacturing_conditions.append("category = %s")
                manufacturing_params.append(category)
            if sub_category:
                manufacturing_conditions.append("sub_category = %s")
                manufacturing_params.append(sub_category)
            
            sub_category_conditions.append("sub_category IS NOT NULL")
            sub_category_where = " WHERE " + " AND ".join(sub_category_conditions)
            sub_category_query = f"SELECT DISTINCT sub_category FROM public.sales_master_consolidated_final_test{sub_category_where} ORDER BY sub_category"
            cursor.execute(sub_category_query, sub_category_params)
            sub_category_list = [r[0] for r in cursor.fetchall()]

            # Execute manufacturing list query
            manufacturing_where = ' WHERE ' + ' AND '.join(manufacturing_conditions + ["manufacture_city IS NOT NULL"]) if manufacturing_conditions else ' WHERE manufacture_city IS NOT NULL'
            cursor.execute(
                f"SELECT DISTINCT manufacture_city FROM public.sales_master_consolidated_final_test{manufacturing_where} ORDER BY manufacture_city",
                manufacturing_params,
            )
            manufacturing_list = [r[0] for r in cursor.fetchall()]

            return Response({
            'success': True,
            'data': data,
            'count': len(data),
            'total_gmv': total_gmv,
            'total_units': int(total_units),
            'platforms': platform_list,
            'cities': city_list,
            'supply_sources': supply_source_list,
            'brands': brand_list,
                'categories': category_list,
                'sub_categories': sub_category_list,
                'manufacturing_cities': manufacturing_list,
            'pagination': {
                'current_page': page,
                'page_size': page_size,
                'total_count': total_count,
                'total_pages': total_pages,
                'has_previous': has_previous,
                'has_next': has_next
            },
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'platforms': platforms,
                    'city': city_values or None,
                    'supply_source': supply_values or None,
                    'manufacturing_city': manufacturing_values or None,
                'brand': brand_values if brand_values else None,
                'category': category,
                'sub_category': sub_category
            }
        }, status=200)
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@require_auth
def get_ads_overview(request):
    """
    Ads Overview aggregated table sourced from public.ads_master_consolidated.

    Returns rows grouped by category (default) with base metrics and derived KPIs.

    Query params:
    - start_date: YYYY-MM-DD (optional)
    - end_date: YYYY-MM-DD (optional)
    - brand: optional brand filter
    - platform: optional platform filter
    - group_by: one of 'platform' | 'category' | 'campaign' (optional; default 'category')
    """
    try:
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        brand = request.query_params.get('brand')
        platform = request.query_params.get('platform')
        group_by = (request.query_params.get('group_by') or 'category').strip().lower()

        if group_by not in ['platform', 'category', 'campaign']:
            group_by = 'category'

        if group_by == 'platform':
            # When grouping by platform, coalesce NULLs to 'Unknown' for display
            group_col_sql = "COALESCE(platform, 'Unknown')"
        elif group_by == 'campaign':
            group_col_sql = 'campaign'
        else:
            group_col_sql = 'category'

        where_parts = []
        params = []
        if start_date:
            where_parts.append('date::date >= %s')
            params.append(start_date)
        if end_date:
            where_parts.append('date::date <= %s')
            params.append(end_date)
        if brand:
            where_parts.append('brand = %s')
            params.append(brand)
        if platform:
            # Treat a special sentinel or label for unknown platform as NULL/empty in DB
            if platform in ['__unknown__', 'Unknown']:
                where_parts.append("(platform IS NULL OR platform = '')")
            else:
                where_parts.append('platform = %s')
                params.append(platform)
        where_clause = (' WHERE ' + ' AND '.join(where_parts)) if where_parts else ''

        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT
                    {group_col_sql} AS group_key,
                    SUM(COALESCE(impressions, 0))::FLOAT AS impressions,
                    SUM(COALESCE(clicks, 0))::FLOAT AS clicks,
                    SUM(COALESCE(spend, 0))::FLOAT AS spend,
                    SUM(COALESCE(sales, 0))::FLOAT AS sales,
                    SUM(COALESCE(orders, 0))::FLOAT AS orders
                FROM public.ads_master_consolidated
                {where_clause}
                GROUP BY {group_col_sql}
                ORDER BY SUM(COALESCE(spend, 0)) DESC
                """,
                params,
            )
            rows = cursor.fetchall()
            columns = [c[0] for c in cursor.description]

            def safe_div(n, d):
                return (float(n) / float(d)) if d not in (None, 0) else 0.0

            data = []
            totals = { 'impressions': 0.0, 'clicks': 0.0, 'spend': 0.0, 'sales': 0.0, 'orders': 0.0 }
            for r in rows:
                row = dict(zip(columns, r))
                impressions = float(row.get('impressions') or 0)
                clicks = float(row.get('clicks') or 0)
                spend = float(row.get('spend') or 0)
                sales_val = float(row.get('sales') or 0)
                orders = float(row.get('orders') or 0)

                ctr = safe_div(clicks, impressions) * 100.0
                cpc = safe_div(spend, clicks)
                cvr = safe_div(orders, clicks) * 100.0
                acos = safe_div(spend, sales_val) * 100.0

                # Map first column key by group_by
                first_key = 'platform' if group_by == 'platform' else ('campaign' if group_by == 'campaign' else 'category')
                data.append({
                    first_key: row.get('group_key'),
                    'impressions': round(impressions, 2),
                    'clicks': round(clicks, 2),
                    'spend': round(spend, 2),
                    'sales': round(sales_val, 2),
                    'orders': round(orders, 2),
                    'ctr': round(ctr, 2),
                    'cpc': round(cpc, 2),
                    'cvr': round(cvr, 2),
                    'acos': round(acos, 2),
                })

                totals['impressions'] += impressions
                totals['clicks'] += clicks
                totals['spend'] += spend
                totals['sales'] += sales_val
                totals['orders'] += orders

            # Derived totals
            totals_ctr = (totals['clicks'] / totals['impressions'] * 100.0) if totals['impressions'] else 0.0
            totals_cpc = (totals['spend'] / totals['clicks']) if totals['clicks'] else 0.0
            totals_cvr = (totals['orders'] / totals['clicks'] * 100.0) if totals['clicks'] else 0.0
            totals_acos = (totals['spend'] / totals['sales'] * 100.0) if totals['sales'] else 0.0

            # Dropdown options for filters (respect current date window)
            filters = {}
            cursor.execute(
                f"SELECT DISTINCT brand FROM public.ads_master_consolidated{where_clause} AND brand IS NOT NULL ORDER BY brand" if where_clause else "SELECT DISTINCT brand FROM public.ads_master_consolidated WHERE brand IS NOT NULL ORDER BY brand",
                params if where_clause else [],
            )
            filters['brands'] = [r[0] for r in cursor.fetchall()]

            cursor.execute(
                f"SELECT DISTINCT platform FROM public.ads_master_consolidated{where_clause} AND platform IS NOT NULL ORDER BY platform" if where_clause else "SELECT DISTINCT platform FROM public.ads_master_consolidated WHERE platform IS NOT NULL ORDER BY platform",
                params if where_clause else [],
            )
            filters['platforms'] = [r[0] for r in cursor.fetchall()]

            cursor.execute(
                f"SELECT DISTINCT category FROM public.ads_master_consolidated{where_clause} AND category IS NOT NULL ORDER BY category" if where_clause else "SELECT DISTINCT category FROM public.ads_master_consolidated WHERE category IS NOT NULL ORDER BY category",
                params if where_clause else [],
            )
            filters['categories'] = [r[0] for r in cursor.fetchall()]

            cursor.execute(
                f"SELECT DISTINCT campaign FROM public.ads_master_consolidated{where_clause} AND campaign IS NOT NULL ORDER BY campaign" if where_clause else "SELECT DISTINCT campaign FROM public.ads_master_consolidated WHERE campaign IS NOT NULL ORDER BY campaign",
                params if where_clause else [],
            )
            filters['campaigns'] = [r[0] for r in cursor.fetchall()]

            return Response({
                'success': True,
                'data': data,
                'totals': {
                    'impressions': round(totals['impressions'], 2),
                    'clicks': round(totals['clicks'], 2),
                    'spend': round(totals['spend'], 2),
                    'sales': round(totals['sales'], 2),
                    'orders': round(totals['orders'], 2),
                    'ctr': round(totals_ctr, 2),
                    'cpc': round(totals_cpc, 2),
                    'cvr': round(totals_cvr, 2),
                    'acos': round(totals_acos, 2),
                },
                'filters': filters,
                'group_by': group_by,
                'start_date': start_date,
                'end_date': end_date,
                'brand': brand,
                'platform': platform,
            })
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@require_auth
def get_ads_category_spends(request):
    """
    Return a pivot-style dataset of SUM(spend) by category across a date range (max 30 days).

    Query params:
    - start_date, end_date: YYYY-MM-DD (required if either provided; inclusive)
    - brands: comma-separated list of brand names (optional)
    """
    try:
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        brands_param = request.query_params.get('brands') or request.query_params.get('brand')

        # Validate and parse dates
        if start_date_str:
            try:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'success': False, 'error': 'Invalid start_date. Use YYYY-MM-DD'}, status=400)
        else:
            start_date = None

        if end_date_str:
            try:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({'success': False, 'error': 'Invalid end_date. Use YYYY-MM-DD'}, status=400)
        else:
            end_date = None

        # Require both dates for a bounded window
        if (start_date and not end_date) or (end_date and not start_date):
            return Response({'success': False, 'error': 'Provide both start_date and end_date'}, status=400)

        # Enforce 30-day window (inclusive)
        if start_date and end_date:
            days = (end_date - start_date).days + 1
            if days > 30:
                return Response({'success': False, 'error': 'Date range cannot exceed 30 days'}, status=400)

        # Parse brands list
        brands = []
        if brands_param:
            brands = [b.strip() for b in brands_param.split(',') if b and b.strip()]

        where_parts = []
        params = []
        if start_date and end_date:
            where_parts.append('date::date BETWEEN %s AND %s')
            params.extend([start_date, end_date])
        if brands:
            placeholders = ','.join(['%s'] * len(brands))
            where_parts.append(f'brand IN ({placeholders})')
            params.extend(brands)
        where_clause = (' WHERE ' + ' AND '.join(where_parts)) if where_parts else ''

        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT 
                    category,
                    date::date AS d,
                    SUM(COALESCE(spend, 0))::FLOAT AS spend
                FROM public.ads_master_consolidated
                {where_clause}
                GROUP BY category, d
                ORDER BY category, d
                """,
                params,
            )
            rows = cursor.fetchall()

            # Extract unique categories and dates
            categories = []
            dates_set = set()
            for cat, d, _spend in rows:
                if cat not in categories:
                    categories.append(cat)
                dates_set.add(d)

            unique_dates = sorted(list(dates_set))

            # Build map category->date->spend
            from collections import defaultdict
            cat_date_map = defaultdict(dict)
            totals_per_date = {d: 0.0 for d in unique_dates}
            grand_total = 0.0

            for cat, d, spend in rows:
                val = float(spend or 0.0)
                cat_date_map[cat][d] = val
                totals_per_date[d] += val
                grand_total += val

            # Prepare row list in the shape the frontend expects
            table_rows = []
            for cat in categories:
                row_dates = {}
                for d in unique_dates:
                    row_dates[d.isoformat()] = float(cat_date_map.get(cat, {}).get(d, 0.0))
                table_rows.append({'category': cat, 'dates': row_dates})

            # Dropdown options - brands (respect current window)
            cursor.execute(
                f"SELECT DISTINCT brand FROM public.ads_master_consolidated{where_clause} AND brand IS NOT NULL ORDER BY brand" if where_clause else "SELECT DISTINCT brand FROM public.ads_master_consolidated WHERE brand IS NOT NULL ORDER BY brand",
                params if where_clause else [],
            )
            brand_options = [r[0] for r in cursor.fetchall()]

        return Response({
            'success': True,
            'dates': [d.isoformat() for d in unique_dates],
            'rows': table_rows,
            'totals_per_date': {d.isoformat(): float(v) for d, v in totals_per_date.items()},
            'grand_total': float(grand_total),
            'filters': {
                'brands': brand_options,
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
            }
        })
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@require_auth
def get_drr_report(request):
    """
    DRR Report with caching — second identical call returns instantly (<100ms).
    """
    try:
        q = request.query_params

        # Convert all params into a deterministic cache key
        key_str = json.dumps(dict(sorted(q.items())), sort_keys=True)
        cache_key = f"drr_report:{hashlib.sha256(key_str.encode()).hexdigest()}"

        # Try cached result first
        cached = cache.get(cache_key)
        if cached:
            # Add metadata for debugging
            cached["cache_hit"] = True
            return Response(cached, status=status.HTTP_200_OK)

        # If not cached, compute fresh
        def get_str(k):
            v = q.get(k)
            return v.strip() if isinstance(v, str) else v

        start_date_raw = get_str("start_date")
        end_date_raw = get_str("end_date")

        def parse_date(s):
            if not s:
                return None
            try:
                return datetime.strptime(s, "%Y-%m-%d").date()
            except ValueError:
                return None

        start_date = parse_date(start_date_raw)
        end_date = parse_date(end_date_raw)
        platform = get_str("platform")
        city = get_str("city")
        supply_source = get_str("supply_source")
        manufacturing_city = get_str("manufacturing_city")
        category_filter = get_str("category")
        sub_category_filter = get_str("sub_category")
        brand = get_str("brand")

        # Pagination
        page = int(q.get("page", 1) or 1)
        page_size = min(max(int(q.get("page_size", 20) or 20), 1), 100)
        offset = (page - 1) * page_size

        table = "public.sales_master_consolidated_final_test"

        # Get latest date (scoped to brand if provided)
        with connection.cursor() as cursor:
            if brand:
                cursor.execute(f"SELECT MAX(date) FROM {table} WHERE brand = %s", [brand])
                max_date = cursor.fetchone()[0]
            else:
                cursor.execute(f"SELECT MAX(date) FROM {table}")
                max_date = cursor.fetchone()[0]

        if not max_date:
            return Response({'success': False, 'error': 'No data found.'}, status=status.HTTP_404_NOT_FOUND)

        # Compute window ranges
        last7_start, last7_end = max_date - timedelta(days=7), max_date - timedelta(days=1)
        last14_start, last14_end = max_date - timedelta(days=14), max_date - timedelta(days=1)

        # Build filters
        filters, params = [], []
        if start_date and end_date:
            filters.append("date BETWEEN %s AND %s")
            params.extend([start_date, end_date])
        elif start_date:
            filters.append("date >= %s")
            params.append(start_date)
        elif end_date:
            filters.append("date <= %s")
            params.append(end_date)

        for col, val in [
            ("platform", platform),
            ("sales_city", city),
            ("supply_city", supply_source),
            ("manufacture_city", manufacturing_city),
            ("category", category_filter),
            ("sub_category", sub_category_filter),
            ("brand", brand),
        ]:
            if val:
                filters.append(f"{col} = %s")
                params.append(val)

        where_clause = " WHERE " + " AND ".join(filters) if filters else ""

        # Get total count
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(DISTINCT platform_item_id) FROM {table}{where_clause}", params)
            total_count = cursor.fetchone()[0] or 0
        total_pages = (total_count + page_size - 1) // page_size

        days_count = (end_date - start_date).days + 1 if start_date and end_date else None

        # --------------------------
        # LEFT JOIN version
        # --------------------------
        main_query = f"""
            WITH last7 AS (
                SELECT platform_item_id, SUM(units)::FLOAT/7 AS last_7_days_drr
                FROM {table}
                WHERE date BETWEEN %s AND %s
                GROUP BY platform_item_id
            ),
            last14 AS (
                SELECT platform_item_id, SUM(units)::FLOAT/14 AS last_14_days_drr
                FROM {table}
                WHERE date BETWEEN %s AND %s
                GROUP BY platform_item_id
            )
            SELECT
                cd.platform_item_id,
                cd.title,
                cd.platform,
                SUM(COALESCE(cd.units, 0)) AS total_units,
                SUM(COALESCE(cd.gmv, 0)) AS total_gmv,
                CASE WHEN %s IS NOT NULL THEN SUM(COALESCE(cd.units, 0))::FLOAT / %s ELSE 0 END AS drr,
                COALESCE(l7.last_7_days_drr, 0) AS last_7_days_drr,
                COALESCE(l14.last_14_days_drr, 0) AS last_14_days_drr
            FROM {table} cd
            LEFT JOIN last7 l7 ON l7.platform_item_id = cd.platform_item_id
            LEFT JOIN last14 l14 ON l14.platform_item_id = cd.platform_item_id
            {where_clause}
            GROUP BY cd.platform_item_id, cd.title, cd.platform, l7.last_7_days_drr, l14.last_14_days_drr
            ORDER BY cd.platform_item_id
            LIMIT %s OFFSET %s
        """

        query_params = [last7_start, last7_end, last14_start, last14_end, days_count, days_count] + params + [page_size, offset]

        with connection.cursor() as cursor:
            cursor.execute(main_query, query_params)
            columns = [c[0] for c in cursor.description]
            rows = cursor.fetchall()

        data = [dict(zip(columns, row)) for row in rows]
        for d in data:
            for key in ['total_units', 'total_gmv', 'drr', 'last_7_days_drr', 'last_14_days_drr']:
                d[key] = float(d.get(key) or 0)

        response_data = {
            'success': True,
            'cache_hit': False,  # will be True for cached responses
            'data': data,
            'pagination': {
                'current_page': page,
                'page_size': page_size,
                'total_count': total_count,
                'total_pages': total_pages,
                'has_previous': page > 1,
                'has_next': page < total_pages
            },
            'filters': dict(q)
        }

        # Cache for 10 minutes (600s)
        cache.set(cache_key, response_data, timeout=600)

        return Response(response_data, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@require_auth
def get_platform_sales_summary(request):
    """
    Fetch Platform Sales Summary data aggregated by category with optional filters
    """
    try:
        # Get filter parameters
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        # Accept comma-separated lists for multi-select filters
        def parse_multi(param_name: str):
            raw = request.query_params.get(param_name)
            if not raw:
                return []
            # Allow values separated by comma; strip whitespace and drop empties
            return [v.strip() for v in raw.split(',') if v and v.strip()]

        platform_list = parse_multi('platform')
        city_list = parse_multi('city')
        supply_source_list = parse_multi('supply_source')
        brand_list = parse_multi('brand')
        category_list = parse_multi('category')
        manufacturing_city_list = parse_multi('manufacturing_city')  # maps to manufacture_city column
        
        # Validate date parameters if provided
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid start_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid end_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Calculate brand-scoped latest date windows for Last 7 and 14 Days averages
        last7_start = None
        last7_end = None
        last14_start = None
        last14_end = None
        max_date_in_db = None
        
        # Get the maximum date from the database (scoped to selected brands if provided). Fallback to global max.
        with connection.cursor() as cursor:
            if brand_list:
                placeholders = ','.join(['%s'] * len(brand_list))
                cursor.execute(f"SELECT MAX(date) FROM public.sales_master_consolidated_final_test WHERE brand IN ({placeholders})", brand_list)
                max_date_result = cursor.fetchone()
                max_date_in_db = max_date_result[0] if max_date_result else None
                if not max_date_in_db:
                    cursor.execute("SELECT MAX(date) FROM public.sales_master_consolidated_final_test")
                    max_date_result = cursor.fetchone()
                    max_date_in_db = max_date_result[0] if max_date_result else None
            else:
                cursor.execute("SELECT MAX(date) FROM public.sales_master_consolidated_final_test")
                max_date_result = cursor.fetchone()
                max_date_in_db = max_date_result[0] if max_date_result else None

            if max_date_in_db:
                # Exclude the latest day itself; use the previous 7/14 full days
                last7_start = max_date_in_db - timedelta(days=7)
                last7_end = max_date_in_db - timedelta(days=1)
                last14_start = max_date_in_db - timedelta(days=14)
                last14_end = max_date_in_db - timedelta(days=1)
        
        with connection.cursor() as cursor:
            # Build WHERE conditions for filtering
            where_conditions = []
            filter_params = []
            
            # Add date filtering
            if start_date and end_date:
                where_conditions.append("date BETWEEN %s AND %s")
                filter_params.extend([start_date, end_date])
            elif start_date:
                where_conditions.append("date >= %s")
                filter_params.append(start_date)
            elif end_date:
                where_conditions.append("date <= %s")
                filter_params.append(end_date)
            
            # Helper to build IN clause for list filters
            def add_in_condition(column: str, values: list):
                if not values:
                    return
                placeholders = ','.join(['%s'] * len(values))
                where_conditions.append(f"{column} IN ({placeholders})")
                filter_params.extend(values)

            # Apply list-based filters
            add_in_condition('platform', platform_list)
            add_in_condition('sales_city', city_list)
            add_in_condition('supply_city', supply_source_list)
            add_in_condition('brand', brand_list)
            add_in_condition('category', category_list)
            add_in_condition('manufacture_city', manufacturing_city_list)
            
            where_clause = " WHERE " + " AND ".join(where_conditions) if where_conditions else ""

            # Build dynamic IN clauses for subqueries using the selected filters (used for both 7- and 14-day subqueries)
            def build_subquery_filter(prefix: str):
                clauses = []
                values = []
                if platform_list:
                    placeholders = ','.join(['%s'] * len(platform_list))
                    clauses.append(f" AND {prefix}.platform IN ({placeholders})")
                    values.extend(platform_list)
                if city_list:
                    placeholders = ','.join(['%s'] * len(city_list))
                    clauses.append(f" AND {prefix}.sales_city IN ({placeholders})")
                    values.extend(city_list)
                if supply_source_list:
                    placeholders = ','.join(['%s'] * len(supply_source_list))
                    clauses.append(f" AND {prefix}.supply_city IN ({placeholders})")
                    values.extend(supply_source_list)
                if brand_list:
                    placeholders = ','.join(['%s'] * len(brand_list))
                    clauses.append(f" AND {prefix}.brand IN ({placeholders})")
                    values.extend(brand_list)
                if manufacturing_city_list:
                    placeholders = ','.join(['%s'] * len(manufacturing_city_list))
                    clauses.append(f" AND {prefix}.manufacture_city IN ({placeholders})")
                    values.extend(manufacturing_city_list)
                return ''.join(clauses), values

            sub_clause, sub_params = build_subquery_filter('cd2')

            # Build main query for category-wise aggregation
            base_query = f"""
                SELECT 
                    category,
                    SUM(COALESCE(units, 0)) AS total_units,
                    SUM(COALESCE(gmv, 0)) AS total_gmv,
                    CASE 
                        WHEN SUM(COALESCE(units, 0)) > 0 
                        THEN SUM(COALESCE(gmv, 0))::FLOAT / SUM(COALESCE(units, 0))
                        ELSE 0 
                    END AS asp,
                    CASE 
                        WHEN %s IS NOT NULL AND %s IS NOT NULL 
                        THEN CASE 
                            WHEN (%s - %s + 1) > 0 
                            THEN SUM(COALESCE(units, 0))::FLOAT / (%s - %s + 1)
                            ELSE 0 
                        END
                        ELSE 0 
                    END AS drr,
                    CASE 
                        WHEN %s IS NOT NULL 
                        THEN (
                            SELECT SUM(COALESCE(units, 0))::FLOAT / 7
                            FROM public.sales_master_consolidated_final_test cd2
                            WHERE cd2.category = cd.category
                            AND cd2.date BETWEEN %s AND %s
                            {sub_clause}
                        )
                        ELSE 0 
                    END AS last_7_days_avg,
                    CASE 
                        WHEN %s IS NOT NULL 
                        THEN (
                            SELECT SUM(COALESCE(units, 0))::FLOAT / 14
                            FROM public.sales_master_consolidated_final_test cd2
                            WHERE cd2.category = cd.category
                            AND cd2.date BETWEEN %s AND %s
                            {sub_clause}
                        )
                        ELSE 0 
                    END AS last_14_days_avg
                FROM public.sales_master_consolidated_final_test cd
                {where_clause}
                GROUP BY category
                ORDER BY category
            """
            
            # Prepare parameters for the main query
            params = []
            
            # Parameters for DRR calculation
            if start_date and end_date:
                params.extend([end_date, start_date, end_date, start_date, end_date, start_date])  # For DRR calculation
                params.extend([max_date_in_db])  # 7-day window presence check
                params.extend([last7_start, last7_end])  # 7-day window
                params.extend(sub_params)  # filters for 7-day subquery
                params.extend([max_date_in_db])  # 14-day window presence check
                params.extend([last14_start, last14_end])  # 14-day window
                params.extend(sub_params)  # filters for 14-day subquery
            elif start_date:
                params.extend([None, None, None, None, None, None])  # For DRR calculation
                params.extend([max_date_in_db])  # 7-day window presence check
                params.extend([last7_start, last7_end])  # 7-day window
                params.extend(sub_params)
                params.extend([max_date_in_db])  # 14-day window presence check
                params.extend([last14_start, last14_end])  # 14-day window
                params.extend(sub_params)
            elif end_date:
                params.extend([end_date, None, end_date, None, end_date, None])  # For DRR calculation
                params.extend([max_date_in_db])  # 7-day window presence check
                params.extend([last7_start, last7_end])  # 7-day window
                params.extend(sub_params)
                params.extend([max_date_in_db])  # 14-day window presence check
                params.extend([last14_start, last14_end])  # 14-day window
                params.extend(sub_params)
            else:
                # No date filters
                params.extend([None, None, None, None, None, None])  # For DRR calculation
                params.extend([max_date_in_db])  # 7-day window presence check
                params.extend([last7_start, last7_end])  # 7-day window
                params.extend(sub_params)
                params.extend([max_date_in_db])  # 14-day window presence check
                params.extend([last14_start, last14_end])  # 14-day window
                params.extend(sub_params)
            
            # Add filter parameters for WHERE clause
            params.extend(filter_params)
            
            cursor.execute(base_query, params)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            
            # Convert rows to list of dictionaries
            data = []
            for row in rows:
                row_dict = dict(zip(columns, row))
                # Handle any data types that might not be JSON serializable
                for key, value in row_dict.items():
                    if hasattr(value, 'isoformat'):  # datetime objects
                        row_dict[key] = value.isoformat()
                    elif isinstance(value, (bytes, bytearray)):  # binary data
                        row_dict[key] = str(value)
                    elif value is None:
                        row_dict[key] = 0 if key in ['total_units', 'total_gmv', 'asp', 'drr', 'last_7_days_avg'] else value
                data.append(row_dict)
            
            # Get available platforms for filter dropdown (scoped by brand/manufacture if provided)
            option_where = []
            option_params = []
            def add_opt(column: str, values: list):
                if values:
                    placeholders = ','.join(['%s'] * len(values))
                    option_where.append(f"{column} IN ({placeholders})")
                    option_params.extend(values)

            add_opt('brand', brand_list)
            add_opt('manufacture_city', manufacturing_city_list)
            where_sql = (' WHERE ' + ' AND '.join(option_where)) if option_where else ''
            platform_query = f"SELECT DISTINCT platform FROM public.sales_master_consolidated_final_test{where_sql} ORDER BY platform"
            cursor.execute(platform_query, option_params)
            platforms = [row[0] for row in cursor.fetchall()]
            
            # Get available cities for filter dropdown (with cascading filter support)
            city_where = []
            city_params = []
            if supply_source_list:
                placeholders = ','.join(['%s'] * len(supply_source_list))
                city_where.append(f"supply_city IN ({placeholders})")
                city_params.extend(supply_source_list)
            add_opt_city_extra = []
            if platform_list:
                placeholders = ','.join(['%s'] * len(platform_list))
                city_where.append(f"platform IN ({placeholders})")
                city_params.extend(platform_list)
            if brand_list:
                placeholders = ','.join(['%s'] * len(brand_list))
                city_where.append(f"brand IN ({placeholders})")
                city_params.extend(brand_list)
            if manufacturing_city_list:
                placeholders = ','.join(['%s'] * len(manufacturing_city_list))
                city_where.append(f"manufacture_city IN ({placeholders})")
                city_params.extend(manufacturing_city_list)
            city_where_sql = (' WHERE ' + ' AND '.join(city_where + ["sales_city IS NOT NULL"])) if city_where else " WHERE sales_city IS NOT NULL"
            city_query = f"SELECT DISTINCT sales_city FROM public.sales_master_consolidated_final_test{city_where_sql} ORDER BY sales_city"
            cursor.execute(city_query, city_params)
            cities = [row[0] for row in cursor.fetchall()]
            
            # Get available supply sources for filter dropdown (with cascading filter support)
            supply_where = []
            supply_params = []
            if city_list:
                placeholders = ','.join(['%s'] * len(city_list))
                supply_where.append(f"sales_city IN ({placeholders})")
                supply_params.extend(city_list)
            if platform_list:
                placeholders = ','.join(['%s'] * len(platform_list))
                supply_where.append(f"platform IN ({placeholders})")
                supply_params.extend(platform_list)
            if brand_list:
                placeholders = ','.join(['%s'] * len(brand_list))
                supply_where.append(f"brand IN ({placeholders})")
                supply_params.extend(brand_list)
            if manufacturing_city_list:
                placeholders = ','.join(['%s'] * len(manufacturing_city_list))
                supply_where.append(f"manufacture_city IN ({placeholders})")
                supply_params.extend(manufacturing_city_list)
            supply_where_sql = (' WHERE ' + ' AND '.join(supply_where + ["supply_city IS NOT NULL"])) if supply_where else " WHERE supply_city IS NOT NULL"
            supply_source_query = f"SELECT DISTINCT supply_city FROM public.sales_master_consolidated_final_test{supply_where_sql} ORDER BY supply_city"
            cursor.execute(supply_source_query, supply_params)
            supply_sources = [row[0] for row in cursor.fetchall()]
            
            # Get available manufacturing cities for filter dropdown
            manuf_where = []
            manuf_params = []
            if city_list:
                placeholders = ','.join(['%s'] * len(city_list))
                manuf_where.append(f"sales_city IN ({placeholders})")
                manuf_params.extend(city_list)
            if supply_source_list:
                placeholders = ','.join(['%s'] * len(supply_source_list))
                manuf_where.append(f"supply_city IN ({placeholders})")
                manuf_params.extend(supply_source_list)
            if platform_list:
                placeholders = ','.join(['%s'] * len(platform_list))
                manuf_where.append(f"platform IN ({placeholders})")
                manuf_params.extend(platform_list)
            if brand_list:
                placeholders = ','.join(['%s'] * len(brand_list))
                manuf_where.append(f"brand IN ({placeholders})")
                manuf_params.extend(brand_list)
            manuf_where_sql = (' WHERE ' + ' AND '.join(manuf_where + ["manufacture_city IS NOT NULL"])) if manuf_where else " WHERE manufacture_city IS NOT NULL"
            manufacturing_query = f"SELECT DISTINCT manufacture_city FROM public.sales_master_consolidated_final_test{manuf_where_sql} ORDER BY manufacture_city"
            cursor.execute(manufacturing_query, manuf_params)
            manufacturing_cities = [row[0] for row in cursor.fetchall()]

            # Get available brands for filter dropdown
            brand_where = []
            brand_params_q = []
            if platform_list:
                placeholders = ','.join(['%s'] * len(platform_list))
                brand_where.append(f"platform IN ({placeholders})")
                brand_params_q.extend(platform_list)
            if city_list:
                placeholders = ','.join(['%s'] * len(city_list))
                brand_where.append(f"sales_city IN ({placeholders})")
                brand_params_q.extend(city_list)
            if supply_source_list:
                placeholders = ','.join(['%s'] * len(supply_source_list))
                brand_where.append(f"supply_city IN ({placeholders})")
                brand_params_q.extend(supply_source_list)
            if manufacturing_city_list:
                placeholders = ','.join(['%s'] * len(manufacturing_city_list))
                brand_where.append(f"manufacture_city IN ({placeholders})")
                brand_params_q.extend(manufacturing_city_list)
            # Always return full brand list regardless of other filters (consistent across tabs)
            cursor.execute("SELECT DISTINCT brand FROM public.sales_master_consolidated_final_test WHERE brand IS NOT NULL ORDER BY brand")
            brands = [row[0] for row in cursor.fetchall()]
            
            # Get available categories for filter dropdown
            cat_where = []
            cat_params = []
            if platform_list:
                placeholders = ','.join(['%s'] * len(platform_list))
                cat_where.append(f"platform IN ({placeholders})")
                cat_params.extend(platform_list)
            if city_list:
                placeholders = ','.join(['%s'] * len(city_list))
                cat_where.append(f"sales_city IN ({placeholders})")
                cat_params.extend(city_list)
            if supply_source_list:
                placeholders = ','.join(['%s'] * len(supply_source_list))
                cat_where.append(f"supply_city IN ({placeholders})")
                cat_params.extend(supply_source_list)
            if brand_list:
                placeholders = ','.join(['%s'] * len(brand_list))
                cat_where.append(f"brand IN ({placeholders})")
                cat_params.extend(brand_list)
            if manufacturing_city_list:
                placeholders = ','.join(['%s'] * len(manufacturing_city_list))
                cat_where.append(f"manufacture_city IN ({placeholders})")
                cat_params.extend(manufacturing_city_list)
            category_query = f"SELECT DISTINCT category FROM public.sales_master_consolidated_final_test{' WHERE ' + ' AND '.join(cat_where + ['category IS NOT NULL']) if cat_where else ' WHERE category IS NOT NULL'} ORDER BY category"
            cursor.execute(category_query, cat_params)
            categories = [row[0] for row in cursor.fetchall()]
        
        return Response({
            'success': True,
            'data': data,
            'count': len(data),
            'platforms': platforms,
            'cities': cities,
            'supply_sources': supply_sources,
            'manufacturing_cities': manufacturing_cities,
            'brands': brands,
            'categories': categories,
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'platform': platform_list,
                'city': city_list,
                'supply_source': supply_source_list,
                'manufacturing_city': manufacturing_city_list,
                'brand': brand_list,
                'category': category_list
            }
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@require_auth
def get_platform_sales_subcategory_drilldown(request):
    """
    Fetch Platform Sales Summary data aggregated by sub-category for a specific category
    """
    try:
        # Get filter parameters
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        platform = request.query_params.get('platform')
        city = request.query_params.get('city')
        supply_source = request.query_params.get('supply_source')
        brand = request.query_params.get('brand')
        category = request.query_params.get('category')  # Required for subcategory drill-down
        
        print(f"Drill-down API called with parameters:")
        print(f"  start_date: {start_date}")
        print(f"  end_date: {end_date}")
        print(f"  platform: {platform}")
        print(f"  city: {city}")
        print(f"  supply_source: {supply_source}")
        print(f"  brand: {brand}")
        print(f"  category: {category}")
        
        if not category:
            return Response({
                'success': False,
                'error': 'Category parameter is required for subcategory drill-down'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate date parameters if provided
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid start_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid end_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Calculate brand-scoped latest date windows for Last 7 and 14 Days averages (subcategory drilldown)
        last7_start = None
        last7_end = None
        last14_start = None
        last14_end = None
        max_date_in_db = None
        
        with connection.cursor() as cursor:
            if brand:
                cursor.execute("SELECT MAX(date) FROM public.sales_master_consolidated_final_test WHERE brand = %s", [brand])
                max_date_result = cursor.fetchone()
                max_date_in_db = max_date_result[0] if max_date_result else None
                if not max_date_in_db:
                    cursor.execute("SELECT MAX(date) FROM public.sales_master_consolidated_final_test")
                    max_date_result = cursor.fetchone()
                    max_date_in_db = max_date_result[0] if max_date_result else None
            else:
                cursor.execute("SELECT MAX(date) FROM public.sales_master_consolidated_final_test")
                max_date_result = cursor.fetchone()
                max_date_in_db = max_date_result[0] if max_date_result else None

            if max_date_in_db:
                last7_start = max_date_in_db - timedelta(days=7)
                last7_end = max_date_in_db - timedelta(days=1)
                last14_start = max_date_in_db - timedelta(days=14)
                last14_end = max_date_in_db - timedelta(days=1)
        
        with connection.cursor() as cursor:
            # Build WHERE conditions for filtering
            where_conditions = ["category = %s"]  # Always filter by category
            filter_params = [category]
            
            # Add date filtering
            if start_date and end_date:
                where_conditions.append("date BETWEEN %s AND %s")
                filter_params.extend([start_date, end_date])
            elif start_date:
                where_conditions.append("date >= %s")
                filter_params.append(start_date)
            elif end_date:
                where_conditions.append("date <= %s")
                filter_params.append(end_date)
            
            # Add platform filtering
            if platform:
                where_conditions.append("platform = %s")
                filter_params.append(platform)
            
            # Add city filtering
            if city:
                where_conditions.append("sales_city = %s")
                filter_params.append(city)
            
            # Add supply source filtering
            if supply_source:
                where_conditions.append("supply_city = %s")
                filter_params.append(supply_source)
            
            # Add brand filtering
            if brand:
                where_conditions.append("brand = %s")
                filter_params.append(brand)
            
            where_clause = " WHERE " + " AND ".join(where_conditions)
            
            # Test query to verify data exists
            test_query = f"SELECT COUNT(*), COUNT(DISTINCT sub_category) FROM public.sales_master_consolidated_final_test {where_clause}"
            cursor.execute(test_query, filter_params)
            test_result = cursor.fetchone()
            print(f"Test query: {test_query}")
            print(f"Test result: {test_result[0]} total records, {test_result[1]} distinct sub-categories")
            
            # Simple test query to see sub-categories
            simple_query = f"SELECT DISTINCT sub_category FROM public.sales_master_consolidated_final_test {where_clause} ORDER BY sub_category"
            cursor.execute(simple_query, filter_params)
            subcategories = cursor.fetchall()
            print(f"Sub-categories found: {[row[0] for row in subcategories]}")
            
            # Build main query for sub-category-wise aggregation
            base_query = f"""
                SELECT 
                    sub_category,
                    SUM(COALESCE(units, 0)) AS total_units,
                    SUM(COALESCE(gmv, 0)) AS total_gmv,
                    CASE 
                        WHEN SUM(COALESCE(units, 0)) > 0 
                        THEN SUM(COALESCE(gmv, 0))::FLOAT / SUM(COALESCE(units, 0))
                        ELSE 0 
                    END AS asp,
                    CASE 
                        WHEN %s IS NOT NULL AND %s IS NOT NULL 
                        THEN CASE 
                            WHEN (%s - %s + 1) > 0 
                            THEN SUM(COALESCE(units, 0))::FLOAT / (%s - %s + 1)
                            ELSE 0 
                        END
                        ELSE 0 
                    END AS drr,
                    CASE 
                        WHEN %s IS NOT NULL 
                        THEN (
                            SELECT SUM(COALESCE(units, 0))::FLOAT / 7
                            FROM public.sales_master_consolidated_final_test cd2
                            WHERE cd2.sub_category = cd.sub_category
                            AND cd2.category = %s
                            AND cd2.date BETWEEN %s AND %s
                            {' AND cd2.platform = %s' if platform else ''}
                            {' AND cd2.sales_city = %s' if city else ''}
                            {' AND cd2.supply_city = %s' if supply_source else ''}
                            {' AND cd2.brand = %s' if brand else ''}
                        )
                        ELSE 0 
                    END AS last_7_days_avg,
                    CASE 
                        WHEN %s IS NOT NULL 
                        THEN (
                            SELECT SUM(COALESCE(units, 0))::FLOAT / 14
                            FROM public.sales_master_consolidated_final_test cd2
                            WHERE cd2.sub_category = cd.sub_category
                            AND cd2.category = %s
                            AND cd2.date BETWEEN %s AND %s
                            {' AND cd2.platform = %s' if platform else ''}
                            {' AND cd2.sales_city = %s' if city else ''}
                            {' AND cd2.supply_city = %s' if supply_source else ''}
                            {' AND cd2.brand = %s' if brand else ''}
                        )
                        ELSE 0 
                    END AS last_14_days_avg
                FROM public.sales_master_consolidated_final_test cd
                {where_clause}
                GROUP BY sub_category
                ORDER BY sub_category
            """
            
            # Prepare parameters for the main query
            params = []
            
            # Parameters for DRR calculation
            if start_date and end_date:
                params.extend([end_date, start_date, end_date, start_date, end_date, start_date])  # For DRR calculation
                params.extend([max_date_in_db])  # 7-day window presence check
                params.append(category)  # Category for 7-day subquery
                params.extend([last7_start, last7_end])  # 7-day window
                if platform:
                    params.append(platform)  # Platform filter for 7-day subquery
                if city:
                    params.append(city)  # City filter for 7-day subquery
                if supply_source:
                    params.append(supply_source)  # Supply source filter for 7-day subquery
                if brand:
                    params.append(brand)  # Brand filter for 7-day subquery
                params.extend([max_date_in_db])  # 14-day window presence check
                params.append(category)  # Category for 14-day subquery
                params.extend([last14_start, last14_end])  # 14-day window
                if platform:
                    params.append(platform)  # Platform filter for 14-day subquery
                if city:
                    params.append(city)  # City filter for 14-day subquery
                if supply_source:
                    params.append(supply_source)  # Supply source filter for 14-day subquery
                if brand:
                    params.append(brand)  # Brand filter for 14-day subquery
            else:
                params.extend([None, None, None, None, None, None])  # For DRR calculation
                params.extend([max_date_in_db])  # 7-day window presence check
                params.append(category)  # Category for 7-day subquery
                params.extend([last7_start, last7_end])  # 7-day window
                if platform:
                    params.append(platform)
                if city:
                    params.append(city)
                if supply_source:
                    params.append(supply_source)
                if brand:
                    params.append(brand)
                params.extend([max_date_in_db])  # 14-day window presence check
                params.append(category)  # Category for 14-day subquery
                params.extend([last14_start, last14_end])  # 14-day window
                if platform:
                    params.append(platform)
                if city:
                    params.append(city)
                if supply_source:
                    params.append(supply_source)
                if brand:
                    params.append(brand)
            
            # Add the filter parameters at the end
            params.extend(filter_params)
            
            # Execute the main query
            print(f"Drill-down query: {base_query}")
            print(f"Drill-down params: {params}")
            cursor.execute(base_query, params)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            
            print(f"Drill-down query returned {len(rows)} rows")
            if rows:
                print(f"First row: {dict(zip(columns, rows[0]))}")
            
            data = []
            for row in rows:
                record = dict(zip(columns, row))
                data.append(record)
        
        return Response({
            'success': True,
            'data': data,
            'count': len(data),
            'category': category,
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'platform': platform,
                'city': city,
                'supply_source': supply_source,
                'brand': brand,
                'category': category
            }
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@require_auth
def get_sales_target_data(request):
    """
    Fetch aggregated sales target data by platform with optional date filtering
    """
    try:
        # Get date parameters
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        # Validate date parameters if provided
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid start_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid end_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            # Build where conditions for date filtering
            where_conditions = []
            params = []
            
            if start_date:
                where_conditions.append("year >= %s")
                params.append(start_date.year)
                if start_date.month > 1:
                    where_conditions.append("(year > %s OR (year = %s AND month_num >= %s))")
                    params.extend([start_date.year, start_date.year, start_date.month])
            
            if end_date:
                where_conditions.append("year <= %s")
                params.append(end_date.year)
                if end_date.month < 12:
                    where_conditions.append("(year < %s OR (year = %s AND month_num <= %s))")
                    params.extend([end_date.year, end_date.year, end_date.month])
            
            where_clause = " WHERE " + " AND ".join(where_conditions) if where_conditions else ""
            
            # Query to get monthly target data per platform
            query = f"""
                SELECT 
                    platform,
                    year,
                    month_num,
                    SUM(COALESCE(targets, 0)) AS monthly_gmv,
                    SUM(COALESCE(units, 0)) AS monthly_units
                FROM (
                    SELECT 
                        platform,
                        targets,
                        units,
                        year,
                        CASE 
                            WHEN month = 'January' THEN 1
                            WHEN month = 'February' THEN 2
                            WHEN month = 'March' THEN 3
                            WHEN month = 'April' THEN 4
                            WHEN month = 'May' THEN 5
                            WHEN month = 'June' THEN 6
                            WHEN month = 'July' THEN 7
                            WHEN month = 'August' THEN 8
                            WHEN month = 'September' THEN 9
                            WHEN month = 'October' THEN 10
                            WHEN month = 'November' THEN 11
                            WHEN month = 'December' THEN 12
                            ELSE 1
                        END AS month_num
                    FROM public.sales_target
                ) st
                {where_clause}
                GROUP BY platform, year, month_num
                ORDER BY platform, year, month_num
            """
            cursor.execute(query, params)
            rows = cursor.fetchall()
            # Process and normalize by daily values over selected range
            from datetime import date
            import calendar
            platform_map = {}
            for platform, yr, mn, m_gmv, m_units in rows:
                platform_map.setdefault(platform, []).append((yr, mn, float(m_gmv), float(m_units)))
            data = []
            for platform, months in platform_map.items():
                agg_gmv = 0.0
                agg_units = 0.0
                for yr, mn, m_gmv, m_units in months:
                    # total days in month
                    days_in_month = calendar.monthrange(yr, mn)[1]
                    # overlap period
                    month_start = date(yr, mn, 1)
                    month_end = date(yr, mn, days_in_month)
                    sel_start = max(start_date, month_start)
                    sel_end = min(end_date, month_end)
                    days_selected = (sel_end - sel_start).days + 1
                    # per-day values
                    per_day_gmv = m_gmv / days_in_month if days_in_month else 0
                    per_day_units = m_units / days_in_month if days_in_month else 0
                    agg_gmv += per_day_gmv * days_selected
                    agg_units += per_day_units * days_selected
                asp_val = agg_gmv / agg_units if agg_units else 0
                data.append({
                    'platform': platform,
                    'sales_gmv': round(agg_gmv, 2),
                    'sales_units': round(agg_units, 2),
                    'asp': round(asp_val, 2)
                })
        
        return Response({
            'success': True,
            'data': data,
            'count': len(data)
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@require_auth
def get_platform_sales_report(request):
    """
    Platform Sales Report by category with Current, Target, Projected, Attainment.

    Query params:
    - month: 1-12 (required)
    - year: YYYY (required)
    - platform: optional platform name ("All" or missing => all)
    - brand: optional brand name (missing => all)
    - metric: one of gmv, units, asp (default gmv)
    """
    try:
        # Parse inputs
        month_param = request.query_params.get('month')
        year_param = request.query_params.get('year')
        month_start_param = request.query_params.get('month_start')
        month_end_param = request.query_params.get('month_end')
        platform = request.query_params.get('platform')
        city = request.query_params.get('city')
        supply_source = request.query_params.get('supply_source')
        brand = request.query_params.get('brand')
        category = request.query_params.get('category')
        manufacturing_city = request.query_params.get('manufacturing_city')
        metric = (request.query_params.get('metric') or 'gmv').lower()

        # Compute date range from either month_start/month_end or month/year
        range_start = None
        range_end = None
        start_year = None
        start_month = None
        end_year = None
        end_month = None

        if month_start_param and month_end_param:
            try:
                start_year, start_month = [int(x) for x in month_start_param.split('-')]
                end_year, end_month = [int(x) for x in month_end_param.split('-')]
                range_start = date(start_year, start_month, 1)
                last_day = calendar.monthrange(end_year, end_month)[1]
                range_end = date(end_year, end_month, last_day)
            except Exception:
                return Response({'success': False, 'error': 'Invalid month_start/month_end. Use YYYY-MM'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            try:
                month = int(month_param) if month_param else None
                year = int(year_param) if year_param else None
            except (TypeError, ValueError):
                return Response({'success': False, 'error': 'Invalid month/year'}, status=status.HTTP_400_BAD_REQUEST)

            if not month or not year:
                return Response({'success': False, 'error': 'month and year are required'}, status=status.HTTP_400_BAD_REQUEST)

            start_year = year
            end_year = year
            start_month = month
            end_month = month
            range_start = date(year, month, 1)
            next_month = month + 1 if month < 12 else 1
            next_month_year = year if month < 12 else year + 1
            range_end = date(next_month_year, next_month, 1) - timedelta(days=1)

        if metric not in ['gmv', 'units', 'asp']:
            return Response({'success': False, 'error': 'metric must be one of gmv, units, asp'}, status=status.HTTP_400_BAD_REQUEST)

        # Determine projection factors over selected range
        total_days = (range_end - range_start).days + 1
        today = date.today()
        in_progress = (today >= range_start) and (today <= range_end)
        elapsed_days = (today - range_start).days + 1 if in_progress else total_days

        with connection.cursor() as cursor:
            # Build filters for consolidated_data across range
            where_conditions = ["date BETWEEN %s AND %s"]
            filter_params = [range_start, range_end]

            if platform and platform.strip():
                where_conditions.append("platform = %s")
                filter_params.append(platform.strip())

            if city and city.strip():
                where_conditions.append("sales_city = %s")
                filter_params.append(city.strip())

            if supply_source and supply_source.strip():
                where_conditions.append("supply_city = %s")
                filter_params.append(supply_source.strip())

            if brand and brand.strip() and brand != 'All Brands':
                brand_values = [b.strip() for b in brand.split(',') if b.strip()]
                if len(brand_values) == 1:
                    where_conditions.append("brand = %s")
                    filter_params.append(brand_values[0])
                elif len(brand_values) > 1:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    where_conditions.append(f"brand IN ({placeholders})")
                    filter_params.extend(brand_values)

            if category and category.strip():
                where_conditions.append("category = %s")
                filter_params.append(category.strip())

            if manufacturing_city and manufacturing_city.strip():
                where_conditions.append("manufacture_city = %s")
                filter_params.append(manufacturing_city.strip())

            where_clause = ' WHERE ' + ' AND '.join(where_conditions)

            # Current totals per category
            current_query = f"""
                SELECT
                    category,
                    SUM(COALESCE(gmv, 0)) AS current_gmv,
                    SUM(COALESCE(units, 0)) AS current_units
                FROM public.sales_master_consolidated_final_test
                {where_clause}
                GROUP BY category
            """
            cursor.execute(current_query, filter_params)
            current_rows = cursor.fetchall()

            # Map category -> current metrics
            category_to_current = {}
            for row in current_rows:
                cat = row[0] if row[0] is not None and str(row[0]).strip() != '' else 'Uncategorized'
                category_to_current[cat] = {
                    'current_gmv': float(row[1] or 0),
                    'current_units': float(row[2] or 0),
                }

            # Targets across range (no brand filter; targets table may not have brand)
            target_params = [start_year, start_year, start_month, end_year, end_year, end_month]
            extra = ""
            if platform and platform.strip():
                extra += " AND platform = %s"
                target_params.append(platform.strip())
            if category and category.strip():
                extra += " AND category = %s"
                target_params.append(category.strip())

            target_query = f"""
                WITH st AS (
                    SELECT 
                        platform,
                        category,
                        targets,
                        units,
                        year,
                        CASE 
                            WHEN month = 'January' THEN 1
                            WHEN month = 'February' THEN 2
                            WHEN month = 'March' THEN 3
                            WHEN month = 'April' THEN 4
                            WHEN month = 'May' THEN 5
                            WHEN month = 'June' THEN 6
                            WHEN month = 'July' THEN 7
                            WHEN month = 'August' THEN 8
                            WHEN month = 'September' THEN 9
                            WHEN month = 'October' THEN 10
                            WHEN month = 'November' THEN 11
                            WHEN month = 'December' THEN 12
                            ELSE 1
                        END AS month_num
                    FROM public.sales_target
                )
                SELECT category,
                       SUM(COALESCE(targets, 0)) AS target_gmv,
                       SUM(COALESCE(units, 0)) AS target_units
                FROM st
                WHERE (year > %s OR (year = %s AND month_num >= %s))
                  AND (year < %s OR (year = %s AND month_num <= %s))
                  {extra}
                GROUP BY category
            """
            cursor.execute(target_query, target_params)

            target_rows = cursor.fetchall()
            category_to_target = {}
            for row in target_rows:
                cat = row[0] if row[0] is not None and str(row[0]).strip() != '' else 'Uncategorized'
                category_to_target[cat] = {
                    'target_gmv': float(row[1] or 0),
                    'target_units': float(row[2] or 0),
                    'target_asp': None,
                }

            # Comprehensive cascading filter logic for Platform Sales Summary
            # Build base WHERE conditions for all filter dropdown queries
            base_conditions = []
            base_params = []

            # Platforms list for dropdown (with comprehensive cascading filter support)
            platform_conditions = base_conditions.copy()
            platform_params = base_params.copy()
            if city:
                platform_conditions.append("sales_city = %s")
                platform_params.append(city)
            if supply_source:
                platform_conditions.append("supply_city = %s")
                platform_params.append(supply_source)
            if brand and brand != 'All Brands':
                brand_values = [b.strip() for b in brand.split(',') if b.strip()]
                if len(brand_values) == 1:
                    platform_conditions.append("brand = %s")
                    platform_params.append(brand_values[0])
                elif len(brand_values) > 1:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    platform_conditions.append(f"brand IN ({placeholders})")
                    platform_params.extend(brand_values)
            if manufacturing_city:
                platform_conditions.append("manufacture_city = %s")
                platform_params.append(manufacturing_city)
            
            platform_where = " WHERE " + " AND ".join(platform_conditions) if platform_conditions else ""
            platform_query = f"SELECT DISTINCT platform FROM public.sales_master_consolidated_final_test{platform_where} ORDER BY platform"
            cursor.execute(platform_query, platform_params)
            platforms = [r[0] for r in cursor.fetchall()]
            
            # Add date filtering to base conditions (using selected range)
            base_conditions.append("date BETWEEN %s AND %s")
            base_params.extend([range_start, range_end])
            
            # Cities list for dropdown (with comprehensive cascading filter support)
            city_conditions = base_conditions.copy()
            city_params = base_params.copy()
            if platform:
                city_conditions.append("platform = %s")
                city_params.append(platform)
            if supply_source:
                city_conditions.append("supply_city = %s")
                city_params.append(supply_source)
            if brand and brand != 'All Brands':
                brand_values = [b.strip() for b in brand.split(',') if b.strip()]
                if len(brand_values) == 1:
                    city_conditions.append("brand = %s")
                    city_params.append(brand_values[0])
                elif len(brand_values) > 1:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    city_conditions.append(f"brand IN ({placeholders})")
                    city_params.extend(brand_values)
            if manufacturing_city:
                city_conditions.append("manufacture_city = %s")
                city_params.append(manufacturing_city)
            
            city_conditions.append("sales_city IS NOT NULL")
            city_where = " WHERE " + " AND ".join(city_conditions)
            city_query = f"SELECT DISTINCT sales_city FROM public.sales_master_consolidated_final_test{city_where} ORDER BY sales_city"
            cursor.execute(city_query, city_params)
            cities = [r[0] for r in cursor.fetchall()]

            # Supply sources list for dropdown (with comprehensive cascading filter support)
            supply_conditions = base_conditions.copy()
            supply_params = base_params.copy()
            if platform:
                supply_conditions.append("platform = %s")
                supply_params.append(platform)
            if city:
                supply_conditions.append("sales_city = %s")
                supply_params.append(city)
            if brand and brand != 'All Brands':
                brand_values = [b.strip() for b in brand.split(',') if b.strip()]
                if len(brand_values) == 1:
                    supply_conditions.append("brand = %s")
                    supply_params.append(brand_values[0])
                elif len(brand_values) > 1:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    supply_conditions.append(f"brand IN ({placeholders})")
                    supply_params.extend(brand_values)
            if manufacturing_city:
                supply_conditions.append("manufacture_city = %s")
                supply_params.append(manufacturing_city)
            
            supply_conditions.append("supply_city IS NOT NULL")
            supply_where = " WHERE " + " AND ".join(supply_conditions)
            supply_query = f"SELECT DISTINCT supply_city FROM public.sales_master_consolidated_final_test{supply_where} ORDER BY supply_city"
            cursor.execute(supply_query, supply_params)
            supply_sources = [r[0] for r in cursor.fetchall()]

            # Brands list for dropdown (with comprehensive cascading filter support)
            brand_conditions = base_conditions.copy()
            brand_params = base_params.copy()
            if platform:
                brand_conditions.append("platform = %s")
                brand_params.append(platform)
            if city:
                brand_conditions.append("sales_city = %s")
                brand_params.append(city)
            if supply_source:
                brand_conditions.append("supply_city = %s")
                brand_params.append(supply_source)
            if manufacturing_city:
                brand_conditions.append("manufacture_city = %s")
                brand_params.append(manufacturing_city)
            
            # Always return full brand list regardless of other filters (consistent across tabs)
            cursor.execute("SELECT DISTINCT brand FROM public.sales_master_consolidated_final_test WHERE brand IS NOT NULL ORDER BY brand")
            brands = [r[0] for r in cursor.fetchall()]
            
            # Categories list for dropdown (with comprehensive cascading filter support)
            category_conditions = base_conditions.copy()
            category_params = base_params.copy()
            if platform:
                category_conditions.append("platform = %s")
                category_params.append(platform)
            if city:
                category_conditions.append("sales_city = %s")
                category_params.append(city)
            if supply_source:
                category_conditions.append("supply_city = %s")
                category_params.append(supply_source)
            if brand and brand != 'All Brands':
                brand_values = [b.strip() for b in brand.split(',') if b.strip()]
                if len(brand_values) == 1:
                    category_conditions.append("brand = %s")
                    category_params.append(brand_values[0])
                elif len(brand_values) > 1:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    category_conditions.append(f"brand IN ({placeholders})")
                    category_params.extend(brand_values)
            if manufacturing_city:
                category_conditions.append("manufacture_city = %s")
                category_params.append(manufacturing_city)

            # Manufacturing cities list for dropdown (with comprehensive cascading filter support)
            manufacturing_conditions = base_conditions.copy()
            manufacturing_params = base_params.copy()
            if platform:
                manufacturing_conditions.append("platform = %s")
                manufacturing_params.append(platform)
            if city:
                manufacturing_conditions.append("sales_city = %s")
                manufacturing_params.append(city)
            if supply_source:
                manufacturing_conditions.append("supply_city = %s")
                manufacturing_params.append(supply_source)
            if brand and brand != 'All Brands':
                brand_values = [b.strip() for b in brand.split(',') if b.strip()]
                if len(brand_values) == 1:
                    manufacturing_conditions.append("brand = %s")
                    manufacturing_params.append(brand_values[0])
                elif len(brand_values) > 1:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    manufacturing_conditions.append(f"brand IN ({placeholders})")
                    manufacturing_params.extend(brand_values)

            manufacturing_conditions.append("manufacture_city IS NOT NULL")
            manufacturing_where = " WHERE " + " AND ".join(manufacturing_conditions)
            manufacturing_query = f"SELECT DISTINCT manufacture_city FROM public.sales_master_consolidated_final_test{manufacturing_where} ORDER BY manufacture_city"
            cursor.execute(manufacturing_query, manufacturing_params)
            manufacturing_cities = [r[0] for r in cursor.fetchall()]
            
            category_conditions.append("category IS NOT NULL")
            category_where = " WHERE " + " AND ".join(category_conditions)
            category_query = f"SELECT DISTINCT category FROM public.sales_master_consolidated_final_test{category_where} ORDER BY category"
            cursor.execute(category_query, category_params)
            categories = [r[0] for r in cursor.fetchall()]

        # Combine categories from both sources
        # If a brand filter is applied, restrict categories strictly to those present in current data
        # to avoid leaking categories from generic target definitions unrelated to the brand.
        if brand and str(brand).strip() and str(brand).strip() != 'All Brands':
            all_categories = sorted(set(list(category_to_current.keys())))
        else:
            all_categories = sorted(set(list(category_to_current.keys()) + list(category_to_target.keys())))

        # Compute projected and attainment
        response_rows = []
        for category in all_categories:
            current_gmv = category_to_current.get(category, {}).get('current_gmv', 0.0)
            current_units = category_to_current.get(category, {}).get('current_units', 0.0)
            current_asp = (current_gmv / current_units) if current_units else None

            if in_progress:
                projected_gmv = (current_gmv / max(elapsed_days, 1)) * total_days
                projected_units = (current_units / max(elapsed_days, 1)) * total_days
            else:
                projected_gmv = current_gmv
                projected_units = current_units

            projected_asp = (projected_gmv / projected_units) if projected_units else None

            tgt = category_to_target.get(category, {})
            target_gmv = float(tgt.get('target_gmv', 0.0))
            target_units = float(tgt.get('target_units', 0.0))
            target_asp_raw = tgt.get('target_asp')
            # Derive ASP if missing but both targets exist
            target_asp = None
            if target_asp_raw is not None and target_asp_raw > 0:
                target_asp = float(target_asp_raw)
            elif target_gmv and target_units:
                target_asp = target_gmv / target_units

            # Select the metric values per request
            def select_metric(curr_gmv, curr_units, curr_asp, proj_gmv, proj_units, proj_asp, tgt_gmv, tgt_units, tgt_asp):
                if metric == 'gmv':
                    return curr_gmv, proj_gmv, tgt_gmv
                if metric == 'units':
                    return curr_units, proj_units, tgt_units
                # asp
                return (curr_asp if curr_asp is not None else None,
                        proj_asp if proj_asp is not None else None,
                        tgt_asp if tgt_asp is not None else None)

            current_val, projected_val, target_val = select_metric(
                current_gmv, current_units, current_asp,
                projected_gmv, projected_units, projected_asp,
                target_gmv, target_units, target_asp
            )

            # Attainment (%) = Projected / Target * 100
            attainment_pct = None
            if target_val and target_val != 0 and projected_val is not None:
                attainment_pct = (projected_val / target_val) * 100.0

            response_rows.append({
                'category': category,
                'current': round(current_val, 2) if isinstance(current_val, (int, float)) and current_val is not None else None,
                'projected': round(projected_val, 2) if isinstance(projected_val, (int, float)) and projected_val is not None else None,
                'target': round(target_val, 2) if isinstance(target_val, (int, float)) and target_val is not None else None,
                'attainment': round(attainment_pct, 2) if attainment_pct is not None else None
            })

        return Response({
            'success': True,
            'data': response_rows,
            'filters': {
                'month_start': month_start_param or (f"{start_year}-{str(start_month).zfill(2)}" if start_year and start_month else None),
                'month_end': month_end_param or (f"{end_year}-{str(end_month).zfill(2)}" if end_year and end_month else None),
                'platform': platform,
                'city': city,
                'supply_source': supply_source,
                'brand': brand,
                'category': category,
                'manufacturing_city': manufacturing_city,
                'metric': metric,
                'in_progress': in_progress,
                'total_days': total_days,
                'elapsed_days': elapsed_days
            },
            'platforms': platforms,
            'cities': cities,
            'supply_sources': supply_sources,
            'brands': brands,
            'categories': categories,
            'manufacturing_cities': manufacturing_cities
        }, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@require_auth
def get_sales_performance_weekly(request):
    """
    Weekly category data for a selected month/year and optional platform.
    Columns: category, w1, w2, w3, w4. Days beyond week 4 are bucketed into W4.

    metric: gmv | units | asp (default gmv)
    """
    try:
        month_param = request.query_params.get('month')
        year_param = request.query_params.get('year')
        platform = request.query_params.get('platform')
        city = request.query_params.get('city')
        supply_source = request.query_params.get('supply_source')
        brand = request.query_params.get('brand')
        metric = (request.query_params.get('metric') or 'gmv').lower()

        try:
            month = int(month_param) if month_param else None
            year = int(year_param) if year_param else None
        except (TypeError, ValueError):
            return Response({'success': False, 'error': 'Invalid month/year'}, status=status.HTTP_400_BAD_REQUEST)

        if not month or not year:
            return Response({'success': False, 'error': 'month and year are required'}, status=status.HTTP_400_BAD_REQUEST)

        if metric not in ['gmv', 'units', 'asp']:
            return Response({'success': False, 'error': 'metric must be one of gmv, units, asp'}, status=status.HTTP_400_BAD_REQUEST)

        month_start = date(year, month, 1)
        next_month = month + 1 if month < 12 else 1
        next_month_year = year if month < 12 else year + 1
        month_end = date(next_month_year, next_month, 1) - timedelta(days=1)

        with connection.cursor() as cursor:
            where_conditions = ["date BETWEEN %s AND %s"]
            params = [month_start, month_end]
            if platform and platform.strip():
                where_conditions.append("platform = %s")
                params.append(platform.strip())
            if city and city.strip():
                where_conditions.append("sales_city = %s")
                params.append(city.strip())
            if supply_source and supply_source.strip():
                where_conditions.append("supply_city = %s")
                params.append(supply_source.strip())
            # Support multiple brands (comma-separated)
            if brand and brand.strip() and brand != 'All Brands':
                brand_values = [b.strip() for b in brand.split(',') if b.strip()]
                if len(brand_values) == 1:
                    where_conditions.append("brand = %s")
                    params.append(brand_values[0])
                elif len(brand_values) > 1:
                    placeholders = ','.join(['%s'] * len(brand_values))
                    where_conditions.append(f"brand IN ({placeholders})")
                    params.extend(brand_values)
            where_clause = ' WHERE ' + ' AND '.join(where_conditions)

            # Aggregate totals per category per week bucket (1..4) using a CTE to avoid aliasing in GROUP BY
            weekly_base_query = f"""
                WITH dated AS (
                    SELECT 
                        category,
                        date AS d,
                        gmv,
                        units
                    FROM public.sales_master_consolidated_final_test
                    {where_clause}
                ), wk AS (
                    SELECT 
                        category,
                        LEAST(4, FLOOR((EXTRACT(DAY FROM d) - 1) / 7) + 1)::INT AS week_index,
                        gmv,
                        units
                    FROM dated
                )
                SELECT 
                    category,
                    week_index AS w,
                    SUM(COALESCE(gmv, 0)) AS total_gmv,
                    SUM(COALESCE(units, 0)) AS total_units
                FROM wk
                GROUP BY category, week_index
            """
            cursor.execute(weekly_base_query, params)
            rows = cursor.fetchall()

        # Build map category -> week -> values
        from collections import defaultdict
        cat_week_map = defaultdict(lambda: {1: {'gmv': 0.0, 'units': 0.0},
                                            2: {'gmv': 0.0, 'units': 0.0},
                                            3: {'gmv': 0.0, 'units': 0.0},
                                            4: {'gmv': 0.0, 'units': 0.0}})
        for category, w, total_gmv, total_units in rows:
            c = category if category else 'Uncategorized'
            w_index = int(w)
            if w_index < 1:
                w_index = 1
            if w_index > 4:
                w_index = 4
            cat_week_map[c][w_index]['gmv'] += float(total_gmv or 0)
            cat_week_map[c][w_index]['units'] += float(total_units or 0)

        data = []
        for category in sorted(cat_week_map.keys()):
            weeks = cat_week_map[category]
            def metric_val(week_idx: int):
                g = weeks[week_idx]['gmv']
                u = weeks[week_idx]['units']
                if metric == 'gmv':
                    return g
                if metric == 'units':
                    return u
                # asp
                return (g / u) if u else None

            row = {
                'category': category,
                'w1': None if metric_val(1) is None else round(metric_val(1), 2),
                'w2': None if metric_val(2) is None else round(metric_val(2), 2),
                'w3': None if metric_val(3) is None else round(metric_val(3), 2),
                'w4': None if metric_val(4) is None else round(metric_val(4), 2),
            }
            data.append(row)

        return Response({
            'success': True,
            'data': data,
            'filters': {
                'month': month,
                'year': year,
                'platform': platform,
                'city': city,
                'supply_source': supply_source,
                'brand': brand,
                'metric': metric
            }
        }, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)




@api_view(['GET'])
def health_check(request):
    return Response({'status': 'OK'}, status=status.HTTP_200_OK)


# ===== Authentication Endpoints ===== #

def _hash_password(password: str, salt: bytes) -> str:
    # PBKDF2 with SHA256 (default digest)
    dk = pbkdf2(password, salt, 260000, dklen=32)
    return dk.hex()


def _split_hash(stored: str):
    try:
        salt_hex, hash_hex = stored.split(":", 1)
        return bytes.fromhex(salt_hex), hash_hex
    except Exception:
        return None, None


@api_view(['POST'])
def signup(request):
    try:
        body = request.data if hasattr(request, 'data') else json.loads(request.body or '{}')
        username = (body.get('username') or '').strip()
        email = (body.get('email') or '').strip()
        full_name = (body.get('full_name') or '').strip()
        password = body.get('password') or ''

        if not username or not password:
            return Response({'success': False, 'error': 'username and password are required'}, status=400)

        if AppUser.objects.filter(username__iexact=username).exists():
            return Response({'success': False, 'error': 'username already exists'}, status=400)

        salt = os.urandom(16)
        password_hash = f"{salt.hex()}:{_hash_password(password, salt)}"

        user = AppUser.objects.create(
            username=username,
            email=email or None,
            full_name=full_name or None,
            password_hash=password_hash,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        token = generate_jwt(user.id)
        return Response({'success': True, 'token': token, 'user': {'id': user.id, 'username': user.username, 'full_name': user.full_name, 'email': user.email}}, status=201)
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['POST'])
def login(request):
    try:
        body = request.data if hasattr(request, 'data') else json.loads(request.body or '{}')
        username = (body.get('username') or '').strip()
        password = body.get('password') or ''

        if not username or not password:
            return Response({'success': False, 'error': 'username and password are required'}, status=400)

        try:
            user = AppUser.objects.get(username__iexact=username, is_active=True)
        except AppUser.DoesNotExist:
            return Response({'success': False, 'error': 'invalid credentials'}, status=401)

        salt, stored_hash = _split_hash(user.password_hash or '')
        if not salt or not stored_hash:
            return Response({'success': False, 'error': 'invalid credentials'}, status=401)

        calc_hash = _hash_password(password, salt)
        if calc_hash != stored_hash:
            return Response({'success': False, 'error': 'invalid credentials'}, status=401)

        token = generate_jwt(user.id)
        return Response({'success': True, 'token': token, 'user': {'id': user.id, 'username': user.username, 'full_name': user.full_name, 'email': user.email}})
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@require_auth
def me(request):
    user = getattr(request, 'current_user', None)
    if not user:
        return Response({'success': False, 'error': 'Unauthorized'}, status=401)
    return Response({'success': True, 'user': {'id': user.id, 'username': user.username, 'full_name': user.full_name, 'email': user.email}})


@api_view(['POST'])
def refresh_token(request):
    """
    Refresh an expired or expiring JWT token
    """
    try:
        # Get token from Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return Response({'success': False, 'error': 'Missing or invalid Authorization header'}, status=400)
        
        token = auth_header.split(" ", 1)[1]
        success, new_token, error = refresh_jwt(token)
        
        if not success:
            return Response({'success': False, 'error': error or 'Failed to refresh token'}, status=401)
        
        return Response({'success': True, 'token': new_token})
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@require_auth
def get_inventory_overview(request):
    """
    Inventory Overview matrix sourced from public.inventory_master_consolidated.

    Returns SKU/Title rows and day-level columns (AS ON DATE) with DRR/DOH/DOC values.

    Query params:
    - period: 'prev7' | 'prev30' | 'YYYY-MM' (month key). Defaults to 'prev30'.
    - platform: optional exact match filter.
    - supply_source: optional exact match filter (uses available supply source column if present,
      otherwise falls back to warehouse_city).
    """
    try:
        period = (request.query_params.get('period') or 'prev30').strip()
        platform = request.query_params.get('platform')
        brand_filter = request.query_params.get('brand')
        supply_source_filter = request.query_params.get('supply_source')

        with connection.cursor() as cursor:
            # Discover available columns
            cursor.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'inventory_master_consolidated'
                """
            )
            column_names = {r[0] for r in cursor.fetchall()}

            # Determine canonical column names
            # Resolve AS-ON date column robustly (supports names like "As on")
            def resolve_col(possible_names):
                lower_to_actual = {str(c).lower(): c for c in column_names}
                for cand in possible_names:
                    if cand in lower_to_actual:
                        return lower_to_actual[cand]
                return None

            as_on_col = resolve_col(['as_on_date', 'as_on', 'as on'])
            if not as_on_col:
                return Response({'success': False, 'error': 'as_on_date column not found in inventory_master_consolidated'}, status=400)
            # Quote identifier for safe SQL usage (handles spaces/case)
            as_on_sql = '"' + str(as_on_col).replace('"', '""') + '"'

            # Metric columns, resolved case-insensitively and quoted if needed
            drr_col = resolve_col(['drr'])
            doh_col = resolve_col(['doh', 'days_of_stock'])
            doc_col = resolve_col(['doc', 'days_of_cover'])
            drr_expr = f"COALESCE({('"' + drr_col.replace('"','""') + '"')}, 0)" if drr_col else '0'
            doh_expr = f"COALESCE({('"' + doh_col.replace('"','""') + '"')}, 0)" if (doh_col and doh_col.lower() != 'days_of_stock') else (f"COALESCE({'\"days_of_stock\"'}, 0)" if doh_col == 'days_of_stock' or 'days_of_stock' in column_names else '0')
            if doc_col:
                doc_expr = f"COALESCE({('"' + doc_col.replace('"','""') + '"')}, 0)"
            else:
                doc_expr = '0'

            sku_col = resolve_col(['sku', 'sku_id', 'platform_item_id', 'platform item id', 'platform ite_id', 'platform ite id'])
            title_col = resolve_col(['title', 'item_name', 'name'])
            platform_col = resolve_col(['platform'])
            supply_source_col = resolve_col([
                'supply_source', 'supply source',
                'supply_city', 'supply city',
                'manufacturing_source',
                'warehouse_city', 'warehouse city',
                'sales_city', 'sales city'
            ])
            brand_col = resolve_col(['brand'])

            # Quoted SQL identifiers for dynamic columns
            def q(identifier):
                return '"' + str(identifier).replace('"', '""') + '"' if identifier else None

            sku_sql = q(sku_col)
            title_sql = q(title_col)
            platform_sql = q(platform_col)
            supply_source_sql = q(supply_source_col)
            brand_sql = q(brand_col)

            # Compute available date range
            cursor.execute(f"SELECT MAX({as_on_sql}) FROM public.inventory_master_consolidated")
            max_date_row = cursor.fetchone()
            max_date = max_date_row[0]
            if not max_date:
                return Response({'success': True, 'data': [], 'dates': [], 'filters': {'platforms': [], 'supply_sources': [], 'periods': {'months': [], 'defaults': ['prev7','prev30']}}})

            # Determine start/end dates from period
            if period == 'prev7':
                end_date = max_date
                start_date = max_date - timedelta(days=6)
            elif period == 'prev30':
                end_date = max_date
                start_date = max_date - timedelta(days=29)
            else:
                try:
                    year, month = map(int, period.split('-'))
                    start_date = date(year, month, 1)
                    if month == 12:
                        end_date = date(year + 1, 1, 1) - timedelta(days=1)
                    else:
                        end_date = date(year, month + 1, 1) - timedelta(days=1)
                except Exception:
                    end_date = max_date
                    start_date = max_date - timedelta(days=29)

            where_parts = [f"{as_on_sql} BETWEEN %s AND %s"]
            params = [start_date, end_date]
            if platform and platform_sql:
                where_parts.append(f"{platform_sql} = %s")
                params.append(platform)
            if brand_filter and brand_sql:
                where_parts.append(f"{brand_sql} = %s")
                params.append(brand_filter)
            if supply_source_filter and supply_source_sql:
                where_parts.append(f"{supply_source_sql} = %s")
                params.append(supply_source_filter)
            where_clause = " WHERE " + " AND ".join(where_parts)

            # Header dates
            cursor.execute(
                f"""
                SELECT DISTINCT {as_on_sql}::date AS d
                FROM public.inventory_master_consolidated
                {where_clause}
                ORDER BY d DESC
                """,
                params,
            )
            dates = [r[0].isoformat() for r in cursor.fetchall()]

            # Select and pivot in-memory (avoid leading comma when no id columns)
            prefix_cols = []
            if sku_sql:
                prefix_cols.append(f"{sku_sql} AS sku")
            if title_sql:
                prefix_cols.append(f"{title_sql} AS title")
            # Build aggregated metrics per SKU/Title/Date to avoid duplicates
            select_ident_sql = ", ".join(prefix_cols + [f"{as_on_sql}::date AS d"]) if prefix_cols else f"{as_on_sql}::date AS d"
            agg_cols_sql = ", ".join([
                f"AVG({drr_expr}::FLOAT) AS drr",
                f"AVG({doh_expr}::FLOAT) AS doh",
                f"AVG({doc_expr}::FLOAT) AS doc",
            ])
            select_list_sql = ", ".join([select_ident_sql, agg_cols_sql])
            cursor.execute(
                f"""
                SELECT {select_list_sql}
                FROM public.inventory_master_consolidated
                {where_clause}
                GROUP BY {', '.join([c.split(' AS ')[-1] for c in prefix_cols]) + (', ' if prefix_cols else '')}{as_on_sql}::date
                ORDER BY {sku_sql if sku_sql else '1'}, {as_on_sql}::date
                """,
                params,
            )
            rows = cursor.fetchall()
            colnames = [desc[0] for desc in cursor.description]
            idx = {name: i for i, name in enumerate(colnames)}

            data_map = {}
            for r in rows:
                sku_val = r[idx['sku']] if 'sku' in idx else None
                title_val = r[idx['title']] if 'title' in idx else ''
                key = (sku_val, title_val)
                if key not in data_map:
                    data_map[key] = {'sku': sku_val, 'title': title_val, 'dates': {}}
                d = r[idx['d']]
                d_iso = d.isoformat() if hasattr(d, 'isoformat') else str(d)
                data_map[key]['dates'][d_iso] = {
                    'drr': float(r[idx['drr']] or 0),
                    'doh': float(r[idx['doh']] or 0),
                    'doc': float(r[idx['doc']] or 0),
                }

            # Filter dropdown options
            # Cascading dropdowns (respect current selections and date window)
            platforms = []
            if platform_sql:
                pf_where = [f"{as_on_sql} BETWEEN %s AND %s", f"{platform_sql} IS NOT NULL"]
                pf_params = [start_date, end_date]
                if brand_filter and brand_sql:
                    pf_where.append(f"{brand_sql} = %s")
                    pf_params.append(brand_filter)
                if supply_source_filter and supply_source_sql:
                    pf_where.append(f"{supply_source_sql} = %s")
                    pf_params.append(supply_source_filter)
                cursor.execute(
                    f"SELECT DISTINCT {platform_sql} FROM public.inventory_master_consolidated WHERE " + " AND ".join(pf_where) + f" ORDER BY {platform_sql}",
                    pf_params,
                )
                platforms = [row[0] for row in cursor.fetchall()]

            brands = []
            if brand_sql:
                br_where = [f"{as_on_sql} BETWEEN %s AND %s", f"{brand_sql} IS NOT NULL"]
                br_params = [start_date, end_date]
                if platform and platform_sql:
                    br_where.append(f"{platform_sql} = %s")
                    br_params.append(platform)
                if supply_source_filter and supply_source_sql:
                    br_where.append(f"{supply_source_sql} = %s")
                    br_params.append(supply_source_filter)
                cursor.execute(
                    f"SELECT DISTINCT {brand_sql} FROM public.inventory_master_consolidated WHERE " + " AND ".join(br_where) + f" ORDER BY {brand_sql}",
                    br_params,
                )
                brands = [row[0] for row in cursor.fetchall()]

            supply_sources = []
            if supply_source_sql:
                ss_where = [f"{as_on_sql} BETWEEN %s AND %s", f"{supply_source_sql} IS NOT NULL"]
                ss_params = [start_date, end_date]
                if platform and platform_sql:
                    ss_where.append(f"{platform_sql} = %s")
                    ss_params.append(platform)
                if brand_filter and brand_sql:
                    ss_where.append(f"{brand_sql} = %s")
                    ss_params.append(brand_filter)
                cursor.execute(
                    f"SELECT DISTINCT {supply_source_sql} FROM public.inventory_master_consolidated WHERE " + " AND ".join(ss_where) + f" ORDER BY {supply_source_sql}",
                    ss_params,
                )
                supply_sources = [row[0] for row in cursor.fetchall()]

            cursor.execute(
                f"""
                SELECT to_char(date_trunc('month', {as_on_sql}), 'YYYY-MM') AS ym
                FROM public.inventory_master_consolidated
                WHERE {as_on_sql} IS NOT NULL
                GROUP BY ym
                ORDER BY ym DESC
                """
            )
            months = [r[0] for r in cursor.fetchall()]

            return Response({
                'success': True,
                'data': list(data_map.values()),
                'dates': dates,
                'filters': {
                    'platforms': platforms,
                    'brands': brands,
                    'supply_sources': supply_sources,
                    'periods': {
                        'months': months,
                        'defaults': ['prev7', 'prev30']
                    }
                }
            })
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@require_auth
def get_inventory_stock_snapshot(request):
    """
    Inventory Stock Levels snapshot for a single query date with filters and sorting.

    Query params:
    - query_date: YYYY-MM-DD; if missing, uses MAX(As on) from table
    - platform: optional platform filter
    - brand: optional brand filter
    - supply_source: optional supply city/warehouse/manufacturing source filter
    - sort: one of drr_desc, drr_asc, doh_desc, doh_asc, doc_desc, doc_asc
    """
    try:
        query_date = request.query_params.get('query_date')
        platform = request.query_params.get('platform')
        brand_filter = request.query_params.get('brand')
        supply_source_filter = request.query_params.get('supply_source')
        sort_key = (request.query_params.get('sort') or 'drr_desc').lower()

        with connection.cursor() as cursor:
            # Column discovery helpers
            cursor.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'inventory_master_consolidated'
                """
            )
            column_names = {r[0] for r in cursor.fetchall()}

            def resolve_col(possible_names):
                lower_to_actual = {str(c).lower(): c for c in column_names}
                for cand in possible_names:
                    if cand in lower_to_actual:
                        return lower_to_actual[cand]
                return None

            def q(identifier):
                return '"' + str(identifier).replace('"', '""') + '"' if identifier else None

            # Key columns
            as_on_col = resolve_col(['as_on_date', 'as_on', 'as on'])
            if not as_on_col:
                return Response({'success': False, 'error': 'as_on_date column not found in inventory_master_consolidated'}, status=400)
            as_on_sql = q(as_on_col)

            sku_col = resolve_col(['sku', 'sku_id', 'platform_item_id', 'platform item id', 'platform ite_id', 'platform ite id'])
            title_col = resolve_col(['title', 'item_name', 'name'])
            platform_col = resolve_col(['platform'])
            brand_col = resolve_col(['brand'])
            supply_source_col = resolve_col([
                'supply_source', 'supply source', 'supply_city', 'supply city',
                'warehouse_city', 'warehouse city', 'manufacturing_source',
                'sales_city', 'sales city'
            ])

            sku_sql = q(sku_col)
            title_sql = q(title_col)
            platform_sql = q(platform_col)
            brand_sql = q(brand_col)
            supply_source_sql = q(supply_source_col)
            # Platform item identifier (SKU)
            sku_col = resolve_col(['sku', 'sku_id', 'platform_item_id', 'platform item id', 'platform ite_id', 'platform ite id'])
            sku_sql = q(sku_col)

            # Metric columns (quote identifiers)
            drr_col = resolve_col(['drr'])
            doh_col = resolve_col(['doh', 'days_of_stock'])
            doc_col = resolve_col(['doc', 'days_of_cover'])
            drr_expr = f"COALESCE({q(drr_col)}, 0)" if drr_col else '0'
            doh_expr = f"COALESCE({q(doh_col)}, 0)" if doh_col else '0'
            doc_expr = f"COALESCE({q(doc_col)}, 0)" if doc_col else '0'

            stock_col = resolve_col(['stock_quantity', 'stock in hand', 'stock_in_hand', 'stock'])
            open_po_col = resolve_col(['open_po', 'open po', 'open_po_units', 'open_units'])
            stock_expr = f"COALESCE({q(stock_col)}, 0)" if stock_col else '0'
            open_po_expr = f"COALESCE({q(open_po_col)}, 0)" if open_po_col else '0'

            # Determine query date
            if query_date:
                try:
                    query_date_parsed = datetime.strptime(query_date, '%Y-%m-%d').date()
                except Exception:
                    return Response({'success': False, 'error': 'Invalid query_date format. Use YYYY-MM-DD'}, status=400)
            else:
                cursor.execute(f"SELECT MAX({as_on_sql}) FROM public.inventory_master_consolidated")
                query_date_parsed = cursor.fetchone()[0]
                if not query_date_parsed:
                    return Response({'success': True, 'data': [], 'filters': {'platforms': [], 'brands': [], 'supply_sources': []}, 'query_date': None})

            # Build filters
            where_parts = [f"{as_on_sql}::date = %s"]
            params = [query_date_parsed]
            if platform and platform_sql:
                where_parts.append(f"{platform_sql} = %s")
                params.append(platform)
            if brand_filter and brand_sql:
                where_parts.append(f"{brand_sql} = %s")
                params.append(brand_filter)
            if supply_source_filter and supply_source_sql:
                where_parts.append(f"{supply_source_sql} = %s")
                params.append(supply_source_filter)
            where_clause = ' WHERE ' + ' AND '.join(where_parts)

            # Sorting
            sort_map = {
                'drr_desc': 'drr_value DESC',
                'drr_asc': 'drr_value ASC',
                'doh_desc': 'doh_value DESC',
                'doh_asc': 'doh_value ASC',
                'doc_desc': 'doc_value DESC',
                'doc_asc': 'doc_value ASC',
            }
            order_by_sql = sort_map.get(sort_key, 'drr_value DESC')

            # Main query (aggregate to ensure uniqueness)
            ident_cols = []
            if sku_sql:
                ident_cols.append(f"{sku_sql} AS sku")
            if title_sql:
                ident_cols.append(f"{title_sql} AS title")
            select_ident_sql = ', '.join(ident_cols) if ident_cols else 'NULL::text AS sku, NULL::text AS title'

            cursor.execute(
                f"""
                SELECT {select_ident_sql},
                       AVG({drr_expr}::FLOAT) AS drr_value,
                       AVG({doh_expr}::FLOAT) AS doh_value,
                       AVG({doc_expr}::FLOAT) AS doc_value,
                       SUM({stock_expr}::FLOAT) AS stock_in_hand,
                       SUM({open_po_expr}::FLOAT) AS open_po
                FROM public.inventory_master_consolidated
                {where_clause}
                GROUP BY {', '.join([c.split(' AS ')[-1] for c in ident_cols]) if ident_cols else '1'}
                ORDER BY {order_by_sql}
                """,
                params,
            )
            rows = cursor.fetchall()
            columns = [col[0] for col in cursor.description]
            data = [dict(zip(columns, r)) for r in rows]

            # Cascading dropdowns for the date
            platforms = []
            if platform_sql:
                cursor.execute(
                    f"SELECT DISTINCT {platform_sql} FROM public.inventory_master_consolidated WHERE {as_on_sql}::date = %s AND {platform_sql} IS NOT NULL ORDER BY {platform_sql}",
                    [query_date_parsed],
                )
                platforms = [r[0] for r in cursor.fetchall()]

            brands = []
            if brand_sql:
                cursor.execute(
                    f"SELECT DISTINCT {brand_sql} FROM public.inventory_master_consolidated WHERE {as_on_sql}::date = %s AND {brand_sql} IS NOT NULL ORDER BY {brand_sql}",
                    [query_date_parsed],
                )
                brands = [r[0] for r in cursor.fetchall()]

            supply_sources = []
            if supply_source_sql:
                cursor.execute(
                    f"SELECT DISTINCT {supply_source_sql} FROM public.inventory_master_consolidated WHERE {as_on_sql}::date = %s AND {supply_source_sql} IS NOT NULL ORDER BY {supply_source_sql}",
                    [query_date_parsed],
                )
                supply_sources = [r[0] for r in cursor.fetchall()]

            return Response({
                'success': True,
                'data': [
                    {
                        'sku': item.get('sku'),
                        'title': item.get('title'),
                        'drr': float(item.get('drr_value') or 0),
                        'doh': float(item.get('doh_value') or 0),
                        'doc': float(item.get('doc_value') or 0),
                        'stock_in_hand': float(item.get('stock_in_hand') or 0),
                        'open_po': float(item.get('open_po') or 0),
                    }
                    for item in data
                ],
                'filters': {
                    'platforms': platforms,
                    'brands': brands,
                    'supply_sources': supply_sources,
                },
                'query_date': query_date_parsed.isoformat() if query_date_parsed else None,
            })
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@require_auth
def get_inventory_movements(request):
    """
    Inventory Movements summary for a single query date.

    Returns per-platform counts of DISTINCT SKUs matching the conditions on the
    chosen date (optionally filtered by Brand and Supply City):
      - DOC < 15 days
      - DOC >= 15 days
      - DOH < 5 days
      - DOH >= 5 days
      - STOCK IN HAND == 0
      - DRR Reducing (current day DRR < average DRR of previous 7 days)
      - DRR Increasing (current day DRR > average DRR of previous 7 days)

    Query params:
    - query_date: YYYY-MM-DD; if missing, uses MAX(As on)
    - brand: optional exact brand filter
    - supply_source: optional supply city/source filter
    """
    try:
        query_date = request.query_params.get('query_date')
        brand_filter = request.query_params.get('brand')
        supply_source_filter = request.query_params.get('supply_source')

        with connection.cursor() as cursor:
            # Discover columns dynamically (same approach as other inventory endpoints)
            cursor.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'inventory_master_consolidated'
                """
            )
            column_names = {r[0] for r in cursor.fetchall()}

            def resolve_col(possible_names):
                lower_to_actual = {str(c).lower(): c for c in column_names}
                for cand in possible_names:
                    if cand in lower_to_actual:
                        return lower_to_actual[cand]
                return None

            def q(identifier):
                return '"' + str(identifier).replace('"', '""') + '"' if identifier else None

            # Key columns
            as_on_col = resolve_col(['as_on_date', 'as_on', 'as on'])
            if not as_on_col:
                return Response({'success': False, 'error': 'as_on_date column not found in inventory_master_consolidated'}, status=400)
            as_on_sql = q(as_on_col)

            platform_col = resolve_col(['platform'])
            brand_col = resolve_col(['brand'])
            supply_source_col = resolve_col([
                'supply_source', 'supply source', 'supply_city', 'supply city',
                'warehouse_city', 'warehouse city', 'manufacturing_source',
                'sales_city', 'sales city'
            ])

            platform_sql = q(platform_col)
            brand_sql = q(brand_col)
            supply_source_sql = q(supply_source_col)
            # Platform item identifier (SKU)
            sku_col = resolve_col(['sku', 'sku_id', 'platform_item_id', 'platform item id', 'platform ite_id', 'platform ite id'])
            sku_sql = q(sku_col)

            drr_col = resolve_col(['drr'])
            doh_col = resolve_col(['doh', 'days_of_stock'])
            doc_col = resolve_col(['doc', 'days_of_cover'])
            stock_col = resolve_col(['stock_quantity', 'stock in hand', 'stock_in_hand', 'stock'])

            drr_expr = f"COALESCE({q(drr_col)}, 0)" if drr_col else '0'
            doh_expr = f"COALESCE({q(doh_col)}, 0)" if doh_col else '0'
            doc_expr = f"COALESCE({q(doc_col)}, 0)" if doc_col else '0'
            stock_expr = f"COALESCE({q(stock_col)}, 0)" if stock_col else '0'

            # Determine query date
            if query_date:
                try:
                    query_date_parsed = datetime.strptime(query_date, '%Y-%m-%d').date()
                except Exception:
                    return Response({'success': False, 'error': 'Invalid query_date format. Use YYYY-MM-DD'}, status=400)
            else:
                cursor.execute(f"SELECT MAX({as_on_sql}) FROM public.inventory_master_consolidated")
                query_date_parsed = cursor.fetchone()[0]
                if not query_date_parsed:
                    return Response({'success': True, 'data': { 'platforms': [], 'rows': [] }, 'filters': { 'brands': [], 'platforms': [] }, 'query_date': None})

            # Build WHERE clause
            where_parts = [f"{as_on_sql}::date = %s"]
            params = [query_date_parsed]
            if brand_filter and brand_sql:
                where_parts.append(f"{brand_sql} = %s")
                params.append(brand_filter)
            if supply_source_filter and supply_source_sql:
                where_parts.append(f"{supply_source_sql} = %s")
                params.append(supply_source_filter)
            where_clause = ' WHERE ' + ' AND '.join(where_parts)

            # Aggregate by platform and SKU to compute DOC/DOH/Stock for the chosen date
            select_parts = []
            if platform_sql:
                select_parts.append(f"{platform_sql} AS platform")
            else:
                select_parts.append("NULL::text AS platform")
            if sku_sql:
                select_parts.append(f"{sku_sql} AS sku")
            else:
                select_parts.append("NULL::text AS sku")

            select_ident_sql = ', '.join(select_parts)

            cursor.execute(
                f"""
                SELECT {select_ident_sql},
                       AVG({doc_expr}::FLOAT) AS doc_value,
                       AVG({doh_expr}::FLOAT) AS doh_value,
                       SUM({stock_expr}::FLOAT) AS stock_in_hand
                FROM public.inventory_master_consolidated
                {where_clause}
                GROUP BY {', '.join([p.split(' AS ')[-1] for p in select_parts])}
                """,
                params,
            )
            rows = cursor.fetchall()
            columns = [col[0] for col in cursor.description]

            idx = {name: i for i, name in enumerate(columns)}
            platforms_set = set()

            # Track distinct SKUs per platform per condition
            bucket_to_platform_to_skus = {
                'doc_lt_15': {},
                'doc_ge_15': {},
                'doh_lt_5': {},
                'doh_ge_5': {},
                'stock_zero': {},
            }

            def add_sku(bucket, platform, sku):
                if platform not in bucket_to_platform_to_skus[bucket]:
                    bucket_to_platform_to_skus[bucket][platform] = set()
                if sku is not None and str(sku).strip() != '':
                    bucket_to_platform_to_skus[bucket][platform].add(sku)

            for r in rows:
                platform_val = r[idx['platform']]
                sku_val = r[idx['sku']]
                platforms_set.add(platform_val)
                doc_val = float(r[idx['doc_value']] or 0)
                doh_val = float(r[idx['doh_value']] or 0)
                stock_val = float(r[idx['stock_in_hand']] or 0)

                if doc_val < 15:
                    add_sku('doc_lt_15', platform_val, sku_val)
                else:
                    add_sku('doc_ge_15', platform_val, sku_val)

                if doh_val < 5:
                    add_sku('doh_lt_5', platform_val, sku_val)
                else:
                    add_sku('doh_ge_5', platform_val, sku_val)

                if stock_val == 0:
                    add_sku('stock_zero', platform_val, sku_val)

            platforms = sorted([p for p in platforms_set if p is not None])

            # Compute DRR movement using current day vs average of previous 7 days from sales table
            drr_reducing_by_platform = {}
            drr_increasing_by_platform = {}
            try:
                cursor.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'sales_master_consolidated_final_test'
                    """
                )
                sales_columns = {r[0] for r in cursor.fetchall()}

                def resolve_sales(possible_names):
                    lower_to_actual = {str(c).lower(): c for c in sales_columns}
                    for cand in possible_names:
                        if cand in lower_to_actual:
                            return lower_to_actual[cand]
                    return None

                def q2(identifier):
                    return '"' + str(identifier).replace('"', '""') + '"' if identifier else None

                s_date = q2(resolve_sales(['date']))
                s_platform = q2(resolve_sales(['platform']))
                s_sku = q2(resolve_sales(['platform_item_id', 'sku', 'sku_id']))
                s_units = q2(resolve_sales(['units']))
                s_brand = q2(resolve_sales(['brand']))
                s_supply = q2(resolve_sales(['supply_city', 'supply_source']))

                if s_date and s_platform and s_sku and s_units:
                    start_prev = query_date_parsed - timedelta(days=7)
                    end_prev = query_date_parsed - timedelta(days=1)

                    where_today_parts = [f"{s_date} = %s"]
                    params_today = [query_date_parsed]
                    if brand_filter and s_brand:
                        where_today_parts.append(f"{s_brand} = %s")
                        params_today.append(brand_filter)
                    if supply_source_filter and s_supply:
                        where_today_parts.append(f"{s_supply} = %s")
                        params_today.append(supply_source_filter)
                    where_today = ' WHERE ' + ' AND '.join(where_today_parts)

                    where_prev_parts = [f"{s_date} BETWEEN %s AND %s"]
                    params_prev = [start_prev, end_prev]
                    if brand_filter and s_brand:
                        where_prev_parts.append(f"{s_brand} = %s")
                        params_prev.append(brand_filter)
                    if supply_source_filter and s_supply:
                        where_prev_parts.append(f"{s_supply} = %s")
                        params_prev.append(supply_source_filter)
                    where_prev = ' WHERE ' + ' AND '.join(where_prev_parts)

                    cursor.execute(
                        f"""
                        WITH drr_today AS (
                            SELECT {s_platform} AS platform,
                                   {s_sku} AS sku,
                                   SUM(COALESCE({s_units}, 0))::FLOAT AS drr
                            FROM public.sales_master_consolidated_final_test
                            {where_today}
                            GROUP BY {s_platform}, {s_sku}
                        ), drr_prev7 AS (
                            SELECT {s_platform} AS platform,
                                   {s_sku} AS sku,
                                   SUM(COALESCE({s_units}, 0))::FLOAT / 7.0 AS drr_avg
                            FROM public.sales_master_consolidated_final_test
                            {where_prev}
                            GROUP BY {s_platform}, {s_sku}
                        ), joined AS (
                            SELECT t.platform,
                                   t.sku,
                                   t.drr AS drr_t,
                                   COALESCE(p.drr_avg, 0) AS drr_prev7
                            FROM drr_today t
                            LEFT JOIN drr_prev7 p
                              ON p.platform = t.platform AND p.sku = t.sku
                        )
                        SELECT platform,
                               SUM(CASE WHEN drr_t < drr_prev7 THEN 1 ELSE 0 END) AS drr_reducing,
                               SUM(CASE WHEN drr_t > drr_prev7 THEN 1 ELSE 0 END) AS drr_increasing
                        FROM joined
                        GROUP BY platform
                        ORDER BY platform
                        """,
                        params_today + params_prev,
                    )
                    drr_mv_rows = cursor.fetchall()
                    drr_mv_cols = [c[0] for c in cursor.description]
                    mv_idx = {name: i for i, name in enumerate(drr_mv_cols)}
                    for r in drr_mv_rows:
                        p = r[mv_idx['platform']]
                        drr_reducing_by_platform[p] = int(r[mv_idx['drr_reducing']] or 0)
                        drr_increasing_by_platform[p] = int(r[mv_idx['drr_increasing']] or 0)
            except Exception:
                pass

            def make_row(key, label):
                counts = {p: len(bucket_to_platform_to_skus[key].get(p, set())) for p in platforms}
                return { 'key': key, 'label': label, 'counts': counts }

            data_rows = [
                make_row('doc_lt_15', 'SKU DOC < 15 Days'),
                make_row('doc_ge_15', 'SKU DOC ≥ 15 Days'),
                make_row('doh_lt_5', 'SKU DOH < 5 Days'),
                make_row('doh_ge_5', 'SKU DOH ≥ 5 Days'),
                make_row('stock_zero', 'SKU Out of Stock (Stock in Hand = 0)'),
            ]

            # Append DRR movement rows (counts by platform based on platform item id changes)
            if platforms:
                drr_red_counts = {p: drr_reducing_by_platform.get(p, 0) for p in platforms}
                drr_inc_counts = {p: drr_increasing_by_platform.get(p, 0) for p in platforms}
                data_rows.append({ 'key': 'drr_reducing', 'label': 'DRR Reducing', 'counts': drr_red_counts })
                data_rows.append({ 'key': 'drr_increasing', 'label': 'DRR Increasing', 'counts': drr_inc_counts })

            # Brands list for dropdown on the given date
            brands = []
            supply_sources = []
            if brand_sql:
                cursor.execute(
                    f"SELECT DISTINCT {brand_sql} FROM public.inventory_master_consolidated WHERE {as_on_sql}::date = %s AND {brand_sql} IS NOT NULL ORDER BY {brand_sql}",
                    [query_date_parsed],
                )
                brands = [r[0] for r in cursor.fetchall()]
            if supply_source_sql:
                cursor.execute(
                    f"SELECT DISTINCT {supply_source_sql} FROM public.inventory_master_consolidated WHERE {as_on_sql}::date = %s AND {supply_source_sql} IS NOT NULL ORDER BY {supply_source_sql}",
                    [query_date_parsed],
                )
                supply_sources = [r[0] for r in cursor.fetchall()]

            return Response({
                'success': True,
                'data': {
                    'platforms': platforms,
                    'rows': data_rows,
                },
                'filters': {
                    'brands': brands,
                    'platforms': platforms,
                    'supply_sources': supply_sources,
                },
                'query_date': query_date_parsed.isoformat() if query_date_parsed else None,
            })
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


def _sanitize_for_json(value):
    """Recursively sanitize values so the JSON renderer doesn't see NaN/Infinity.

    - Replace float('nan'), float('inf'), float('-inf') with None
    - Convert Decimal to float
    - Recurse into dicts and lists/tuples
    """
  
    import math
    from decimal import Decimal

    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, Decimal):
       
        try:
            as_float = float(value)
        except Exception:
            return None
        return _sanitize_for_json(as_float)
    if isinstance(value, dict):
        return {k: _sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [ _sanitize_for_json(v) for v in value ]
    return value


@api_view(['GET'])
@require_auth
def get_hygiene_overview(request):
    """
    Hygiene Overview data sourced from public.ecom_consolidated table.

    Returns hygiene data with price and coupon validation scores.

    Query params:
    - start_date: YYYY-MM-DD (optional)
    - end_date: YYYY-MM-DD (optional)
    - brand: optional brand filter
    - platform: optional platform filter (comma-separated for multiple)
    """
    try:
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        brand = request.query_params.get('brand')
        platform = request.query_params.get('platform')

        with connection.cursor() as cursor:
            # Check if ecom_consolidated table exists
            cursor.execute(
                """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'ecom_consolidated'
                );
                """
            )
            table_exists = cursor.fetchone()[0]
        

            if not table_exists:
                # Return mock data structure for development
                mock_data = [
                    {
                        'date': '2024-01-15',
                        'brand': 'Clear',
                        'platform': 'Amazon',
                        'price_rule': 'Standard',
                        'live_price': 299.00,
                        'price_hygiene': '100%',
                        'coupon_hygiene': '95%',
                        'activation_hygiene': '100%',
                        'availability_hygiene': '98%',
                        'deal_hygiene': '100%',
                        'edd_hygiene': '95%',
                        'sold_by_validation': '90%',
                        'rating_hygiene': '90%',
                        'catalog_hygiene': '88%'
                    },
                    {
                        'date': '2024-01-15',
                        'brand': 'Clear',
                        'platform': 'Flipkart',
                        'price_rule': 'Standard',
                        'live_price': 299.00,
                        'price_hygiene': '85%',
                        'coupon_hygiene': '75%',
                        'activation_hygiene': '50%',
                        'availability_hygiene': '60%',
                        'deal_hygiene': '45%',
                        'edd_hygiene': '80%',
                        'sold_by_validation': '95%',
                        'rating_hygiene': '75%',
                        'catalog_hygiene': '82%'
                    },
                    {
                        'date': '2024-01-16',
                        'brand': 'Clear',
                        'platform': 'Amazon',
                        'price_rule': 'Premium',
                        'live_price': 350.00,
                        'price_hygiene': '70%',
                        'coupon_hygiene': '88%',
                        'activation_hygiene': '0%',
                        'availability_hygiene': '92%',
                        'deal_hygiene': '100%',
                        'edd_hygiene': '70%',
                        'sold_by_validation': '60%',
                        'rating_hygiene': '85%',
                        'catalog_hygiene': '78%'
                    }
                ]

                # Calculate hygiene scores from percentage values
                def calculate_average_percentage_hygiene_mock(column_name):
                    """Calculate average of percentage values from a column (e.g., '100%', '50%', '0%')"""
                    values = []
                    for record in mock_data:
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

                # Calculate all hygiene scores using the general function
                price_hygiene_score = calculate_average_percentage_hygiene_mock('price_hygiene')
                coupon_hygiene_score = calculate_average_percentage_hygiene_mock('coupon_hygiene')
                activation_hygiene_score = calculate_average_percentage_hygiene_mock('activation_hygiene')
                availability_hygiene_score = calculate_average_percentage_hygiene_mock('availability_hygiene')
                deal_hygiene_score = calculate_average_percentage_hygiene_mock('deal_hygiene')
                edd_hygiene_score = calculate_average_percentage_hygiene_mock('edd_hygiene')
                rating_hygiene_score = calculate_average_percentage_hygiene_mock('rating_hygiene')
                catalog_hygiene_score = calculate_average_percentage_hygiene_mock('catalog_hygiene')
                sold_by_validation_score = calculate_average_percentage_hygiene_mock('sold_by_validation')

                response_payload = {
                    'success': True,
                    'data': mock_data,
                    'hygiene_scores': {
                        'price_hygiene_score': round(price_hygiene_score, 2),
                        'coupon_hygiene_score': round(coupon_hygiene_score, 2),
                        'availability_hygiene_score': round(availability_hygiene_score, 2),
                        'deal_hygiene_score': round(deal_hygiene_score, 2),
                        'activation_hygiene_score': round(activation_hygiene_score, 2),
                        'edd_hygiene_score': round(edd_hygiene_score, 2),
                        'rating_hygiene_score': round(rating_hygiene_score, 2),
                        'catalog_hygiene_score': round(catalog_hygiene_score, 2),
                        'sold_by_validation_score': round(sold_by_validation_score, 2)
                    },
                    'options': {
                        'brands': ['Clear', 'Dove', 'Pantene'],
                        'platforms': ['Amazon', 'Flipkart', 'Myntra']
                    }
                }
                return Response(_sanitize_for_json(response_payload))

            # If table exists, query actual data
            where_parts = []
            params = []
            
            if start_date:
                # Convert YYYY-MM-DD to DD-MM-YYYY for database comparison
                try:
                    start_date_obj = datetime.strptime(start_date, '%Y-%m-%d')
                    start_date_formatted = start_date_obj.strftime('%d-%m-%Y')
                    where_parts.append('"Date" >= %s')
                    params.append(start_date_formatted)
                except ValueError:
                    # If conversion fails, use original date
                    where_parts.append('"Date" >= %s')
                    params.append(start_date)
            if end_date:
                # Convert YYYY-MM-DD to DD-MM-YYYY for database comparison
                try:
                    end_date_obj = datetime.strptime(end_date, '%Y-%m-%d')
                    end_date_formatted = end_date_obj.strftime('%d-%m-%Y')
                    where_parts.append('"Date" <= %s')
                    params.append(end_date_formatted)
                except ValueError:
                    # If conversion fails, use original date
                    where_parts.append('"Date" <= %s')
                    params.append(end_date)
            if brand:
                where_parts.append('"Brand" = %s')
                params.append(brand)
            if platform:
                platforms = [p.strip() for p in platform.split(',') if p.strip()]
                if platforms:
                    placeholders = ','.join(['%s'] * len(platforms))
                    where_parts.append(f'"Platform" IN ({placeholders})')
                    params.extend(platforms)

            where_clause = ' WHERE ' + ' AND '.join(where_parts) if where_parts else ''

            # Query the actual data
            query = f"""
                SELECT
                    "Date",
                    "Brand",
                    "Platform",
                    "Price Rule",
                    "Live Price",
                    "Price_Hygiene",
                    "Coupon_Hygiene",
                    "Activation_Hygiene",
                    "Availability_Hygiene",
                    "Deal_Hygiene",
                    "EDD_Hygiene",
                    "Sold By Validation",
                    "Rating_Hygiene",
                    "Catalog_Hygiene"
                FROM public.ecom_consolidated
                {where_clause}
                ORDER BY "Date" DESC, "Platform", "Brand"
            """

            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()

            # Convert to list of dictionaries
            data = [dict(zip(columns, row)) for row in rows]

            # Filter out rows with too many invalid values
            def is_valid_row(row):
                error_count = 0
                for col in ['Price_Hygiene', 'Coupon_Hygiene', 'Activation_Hygiene', 'Availability_Hygiene', 'Deal_Hygiene', 'EDD_Hygiene', 'Sold By Validation', 'Rating_Hygiene', 'Catalog_Hygiene']:
                    value = row.get(col, '')
                    if isinstance(value, str) and value.strip() in ['#ERROR!', 'N/A', 'NULL', 'null', '']:
                        error_count += 1
                # Allow rows with up to 3 invalid values
                return error_count <= 3

            # Filter and log rows
            filtered = [row for row in data if is_valid_row(row)]
            logger.debug("get_hygiene_overview: filtered %d/%d rows", len(filtered), len(data))
            # Log a small sample to avoid huge logs
            try:
                logger.debug("get_hygiene_overview: sample rows (up to 50): %s", json.dumps(filtered[:50], default=str))
            except Exception:
                logger.debug("get_hygiene_overview: sample rows repr: %s", repr(filtered[:50]))
            data = filtered


            ERROR_STRINGS = {'#ERROR!', 'N/A', 'NULL', 'null', ''}

            def _parse_percent_number(value):
                """
                Accepts '85%', '85', 85, Decimal('85'), etc.
                Returns float in [0, +inf) or None if invalid/NaN/Inf.
                Strips '%' and whitespace. Skips error tokens and NaN/Inf.
                """
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
            def calculate_average_percentage_hygiene(column_name):
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
            # Calculate all hygiene scores using the general function
            price_hygiene_score = calculate_average_percentage_hygiene('Price_Hygiene')
            coupon_hygiene_score = calculate_average_percentage_hygiene('Coupon_Hygiene')
            activation_hygiene_score = calculate_average_percentage_hygiene('Activation_Hygiene')
            availability_hygiene_score = calculate_average_percentage_hygiene('Availability_Hygiene')
            deal_hygiene_score = calculate_average_percentage_hygiene('Deal_Hygiene')
            edd_hygiene_score = calculate_average_percentage_hygiene('EDD_Hygiene')
            rating_hygiene_score = calculate_average_percentage_hygiene('Rating_Hygiene')
            catalog_hygiene_score = calculate_average_percentage_hygiene('Catalog_Hygiene')
            sold_by_validation_score = calculate_average_percentage_hygiene('Sold By Validation')

            # Get unique brands and platforms for filter options
            cursor.execute('SELECT DISTINCT "Brand" FROM public.ecom_consolidated WHERE "Brand" IS NOT NULL ORDER BY "Brand"')
            brands = [row[0] for row in cursor.fetchall()]
            
            cursor.execute('SELECT DISTINCT "Platform" FROM public.ecom_consolidated WHERE "Platform" IS NOT NULL ORDER BY "Platform"')
            platforms = [row[0] for row in cursor.fetchall()]

            response_payload = {
                'success': True,
                'data': data,
                'hygiene_scores': {
                    'price_hygiene_score': round(price_hygiene_score, 2),
                    'coupon_hygiene_score': round(coupon_hygiene_score, 2),
                    'availability_hygiene_score': round(availability_hygiene_score, 2),
                    'deal_hygiene_score': round(deal_hygiene_score, 2),
                    'activation_hygiene_score': round(activation_hygiene_score, 2),
                    'edd_hygiene_score': round(edd_hygiene_score, 2),
                    'rating_hygiene_score': round(rating_hygiene_score, 2),
                    'catalog_hygiene_score': round(catalog_hygiene_score, 2),
                    'sold_by_validation_score': round(sold_by_validation_score, 2)
                },
                'options': {
                    'brands': brands,
                    'platforms': platforms
                }
            }
            return Response(_sanitize_for_json(response_payload))

    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


@api_view(["GET"])
@require_auth
def get_trend_analysis(request):
    """
    Optimized Trend Analysis API.
    - Checks table existence only once.
    - Uses efficient parameterized filtering.
    - Adds caching for repeated queries.
    - Converts DB dates safely.
    """

    try:
        q = request.query_params
        start_date_str = q.get("start_date")
        end_date_str = q.get("end_date")
        brand = q.get("brand")
        platform = q.get("platform")

        # ---------------------------------------------------------------------
        # 1️⃣ Optional caching
        # ---------------------------------------------------------------------
        cache_key = f"trend:{brand}:{platform}:{start_date_str}:{end_date_str}"
        cached = cache.get(cache_key)
        if cached:
            cached["cache_hit"] = True
            return Response(cached, status=status.HTTP_200_OK)

        # ---------------------------------------------------------------------
        # 2️⃣ Helper: parse date safely
        # ---------------------------------------------------------------------
        def parse_date(val):
            try:
                return datetime.strptime(val, "%Y-%m-%d").date() if val else None
            except ValueError:
                return None

        start_date = parse_date(start_date_str)
        end_date = parse_date(end_date_str)

        # ---------------------------------------------------------------------
        # 3️⃣ Ensure table exists (check once, not every request ideally)
        # ---------------------------------------------------------------------
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'ecom_consolidated'
                );
                """
            )
            if not cursor.fetchone()[0]:
                # Return mock data for development environment
                mock_data = [
                    {"Date": "2024-01-01", "Brand": "Clear", "Platform": "Amazon", "Live Price": 299.0,
                     "Sub-Category BSR": 150.0, "Category BSR": 450.0, "Discount": 10.0},
                    {"Date": "2024-01-02", "Brand": "Clear", "Platform": "Amazon", "Live Price": 295.0,
                     "Sub-Category BSR": 145.0, "Category BSR": 440.0, "Discount": 12.0},
                    {"Date": "2024-01-03", "Brand": "Clear", "Platform": "Amazon", "Live Price": 301.0,
                     "Sub-Category BSR": 155.0, "Category BSR": 460.0, "Discount": 8.0},
                ]
                return Response(
                    {
                        "success": True,
                        "data": mock_data,
                        "options": {
                            "brands": ["Clear", "Dove", "Pantene"],
                            "platforms": ["Amazon", "Flipkart", "Myntra"],
                        },
                    },
                    status=status.HTTP_200_OK,
                )

        # ---------------------------------------------------------------------
        # 4️⃣ Build WHERE clause and parameters efficiently
        # ---------------------------------------------------------------------
        where, params = [], []
        if start_date:
            where.append('CAST("Date" AS DATE) >= %s')
            params.append(start_date)
        if end_date:
            where.append('CAST("Date" AS DATE) <= %s')
            params.append(end_date)
        if brand:
            where.append('"Brand" = %s')
            params.append(brand)
        if platform:
            where.append('"Platform" = %s')
            params.append(platform)

        where_clause = f"WHERE {' AND '.join(where)}" if where else ""

        # ---------------------------------------------------------------------
        # 5️⃣ Fetch trend data efficiently
        # ---------------------------------------------------------------------
        query = f"""
            SELECT
                "Date",
                "Brand",
                "Platform",
                "Live Price",
                "Sub-Category BSR",
                "Category BSR",
                "Discount"
            FROM public.ecom_consolidated
            {where_clause}
            ORDER BY "Date" ASC
        """

        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()

        data = []
        for row in rows:
            record = dict(zip(columns, row))
            # Convert dates to ISO for frontend use
            if isinstance(record.get("Date"), datetime):
                record["Date"] = record["Date"].date().isoformat()
            data.append(record)

        # ---------------------------------------------------------------------
        # 6️⃣ Distinct brands and platforms (only once)
        # ---------------------------------------------------------------------
        if data:
            brands = sorted({d["Brand"] for d in data if d.get("Brand")})
            platforms = sorted({d["Platform"] for d in data if d.get("Platform")})
        else:
            brands = []
            platforms = []

        response_data = {
            "success": True,
            "data": data,
            "options": {"brands": brands, "platforms": platforms},
            "cache_hit": False,
        }

        cache.set(cache_key, response_data, timeout=600)
        return Response(response_data, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"success": False, "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@require_auth
def get_correlation_matrix(request):
    """
    Correlation Matrix data sourced from public.ecom_consolidated table.

    Returns correlation data between hygiene metrics and business performance indicators.

    Query params:
    - start_date: YYYY-MM-DD (optional)
    - end_date: YYYY-MM-DD (optional)
    - brand: optional brand filter
    - platform: optional platform filter (comma-separated for multiple)
    """
    try:
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        brand = request.query_params.get('brand')
        platform = request.query_params.get('platform')

        with connection.cursor() as cursor:
            # Check if ecom_consolidated table exists
            cursor.execute(
                """
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'ecom_consolidated'
                );
                """
            )
            table_exists = cursor.fetchone()[0]

            if not table_exists:
                # Return mock correlation data for development
                mock_correlation_data = [
                    {
                        'Date': '2024-01-15',
                        'Brand': 'Clear',
                        'Platform': 'Amazon',
                        'Price_Hygiene': '100%',
                        'Coupon_Hygiene': '95%',
                        'Activation_Hygiene': '100%',
                        'Availability_Hygiene': '98%',
                        'Deal_Hygiene': '100%',
                        'EDD_Hygiene': '95%',
                        'Sold By Validation': '90%',
                        'Rating_Hygiene': '90%',
                        'Catalog_Hygiene': '88%',
                        'GMV': '15000.00',
                        'Units': '50'
                    },
                    {
                        'Date': '2024-01-15',
                        'Brand': 'Clear',
                        'Platform': 'Flipkart',
                        'Price_Hygiene': '85%',
                        'Coupon_Hygiene': '75%',
                        'Activation_Hygiene': '50%',
                        'Availability_Hygiene': '60%',
                        'Deal_Hygiene': '45%',
                        'EDD_Hygiene': '80%',
                        'Sold By Validation': '95%',
                        'Rating_Hygiene': '75%',
                        'Catalog_Hygiene': '82%',
                        'GMV': '12000.00',
                        'Units': '40'
                    },
                    {
                        'Date': '2024-01-16',
                        'Brand': 'Clear',
                        'Platform': 'Amazon',
                        'Price_Hygiene': '70%',
                        'Coupon_Hygiene': '88%',
                        'Activation_Hygiene': '0%',
                        'Availability_Hygiene': '92%',
                        'Deal_Hygiene': '100%',
                        'EDD_Hygiene': '70%',
                        'Sold By Validation': '60%',
                        'Rating_Hygiene': '85%',
                        'Catalog_Hygiene': '78%',
                        'GMV': '18000.00',
                        'Units': '60'
                    }
                ]

                # Define the columns for correlation analysis
                mock_correlation_columns = [
                    'Price_Hygiene',
                    'Coupon_Hygiene',
                    'Activation_Hygiene',
                    'Availability_Hygiene',
                    'Deal_Hygiene',
                    'EDD_Hygiene',
                    'Sold By Validation',
                    'Rating_Hygiene',
                    'Catalog_Hygiene',
                    'GMV',
                    'Units'
                ]

                # Calculate correlation matrix from mock data
                correlation_data = calculate_correlation_from_data(mock_correlation_data, mock_correlation_columns)

                # Get unique brands and platforms for filter options
                brands = list(set([record.get('Brand', '') for record in mock_correlation_data if record.get('Brand')]))
                platforms = list(set([record.get('Platform', '') for record in mock_correlation_data if record.get('Platform')]))
                brands.sort()
                platforms.sort()

                return Response({
                    'success': True,
                    'data': correlation_data,
                    'options': {
                        'brands': brands,
                        'platforms': platforms
                    }
                })

            # If table exists, query actual data
            where_parts = []
            params = []

            if start_date:
                # Convert YYYY-MM-DD to DD-MM-YYYY for database comparison
                try:
                    start_date_obj = datetime.strptime(start_date, '%Y-%m-%d')
                    start_date_formatted = start_date_obj.strftime('%d-%m-%Y')
                    where_parts.append('"Date" >= %s')
                    params.append(start_date_formatted)
                except ValueError:
                    # If conversion fails, use original date
                    where_parts.append('"Date" >= %s')
                    params.append(start_date)
            if end_date:
                # Convert YYYY-MM-DD to DD-MM-YYYY for database comparison
                try:
                    end_date_obj = datetime.strptime(end_date, '%Y-%m-%d')
                    end_date_formatted = end_date_obj.strftime('%d-%m-%Y')
                    where_parts.append('"Date" <= %s')
                    params.append(end_date_formatted)
                except ValueError:
                    # If conversion fails, use original date
                    where_parts.append('"Date" <= %s')
                    params.append(end_date)
            if brand:
                where_parts.append('"Brand" = %s')
                params.append(brand)
            if platform:
                platforms = [p.strip() for p in platform.split(',') if p.strip()]
                if platforms:
                    placeholders = ','.join(['%s'] * len(platforms))
                    where_parts.append(f'"Platform" IN ({placeholders})')
                    params.extend(platforms)

            where_clause = ' WHERE ' + ' AND '.join(where_parts) if where_parts else ''

            # Query the actual data
            query = f"""
                SELECT
                    "Date",
                    "Brand",
                    "Platform",
                    COALESCE(NULLIF(LOWER("Price_Hygiene"), 'nan')::float, 0) AS "Price_Hygiene",
                    COALESCE(NULLIF(LOWER("Coupon_Hygiene"), 'nan')::float, 0) AS "Coupon_Hygiene",
                    COALESCE(NULLIF(LOWER("Activation_Hygiene"), 'nan')::float, 0) AS "Activation_Hygiene",
                    COALESCE(NULLIF(LOWER("Availability_Hygiene"), 'nan')::float, 0) AS "Availability_Hygiene",
                    COALESCE(NULLIF(LOWER("Deal_Hygiene"), 'nan')::float, 0) AS "Deal_Hygiene",
                    COALESCE(NULLIF(LOWER("EDD_Hygiene"), 'nan')::float, 0) AS "EDD_Hygiene",
                    COALESCE("Sold By Validation"::float, 0) AS "Sold By Validation",
                    COALESCE(NULLIF(LOWER("Rating_Hygiene"), 'nan')::float, 0) AS "Rating_Hygiene",
                    COALESCE(NULLIF(LOWER("Catalog_Hygiene"), 'nan')::float, 0) AS "Catalog_Hygiene"
                FROM public.ecom_consolidated
                {where_clause}
                ORDER BY "Date" DESC, "Platform", "Brand"
            """

            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()

            # Convert to list of dictionaries
            data = [dict(zip(columns, row)) for row in rows]

            # Define the columns for correlation analysis
            correlation_columns = [
                'Price_Hygiene',
                'Coupon_Hygiene',
                'Activation_Hygiene',
                'Availability_Hygiene',
                'Deal_Hygiene',
                'EDD_Hygiene',
                'Sold By Validation',
                'Rating_Hygiene',
                'Catalog_Hygiene'
            ]

            # Filter out rows with too many invalid values
            def is_valid_row(row):
                error_count = 0
                for col in correlation_columns:
                    value = row.get(col, '')
                    if isinstance(value, str) and value.strip() in ['#ERROR!', 'N/A', 'NULL', 'null', '']:
                        error_count += 1
                # Allow rows with up to 2 invalid values
                return error_count <= 2

            data = [row for row in data if is_valid_row(row)]

            # Calculate correlation matrix
            correlation_data = calculate_correlation_from_data(data, correlation_columns)

            # Get unique brands and platforms for filter options
            brands = []
            platforms = []
            if data:
                brands = list(set([record.get('Brand', '') for record in data if record.get('Brand')]))
                platforms = list(set([record.get('Platform', '') for record in data if record.get('Platform')]))
                brands.sort()
                platforms.sort()

            return Response({
                'success': True,
                'data': correlation_data,
                'options': {
                    'brands': brands,
                    'platforms': platforms
                }
            })

    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


def calculate_correlation_from_data(data, correlation_columns):
    """
    Calculate correlation matrix from the given data.

    Args:
        data: List of dictionaries containing the raw data
        correlation_columns: List of column names to analyze

    Returns:
        List of dictionaries representing the correlation matrix
    """
    if not data or len(data) < 2:
        # Return empty matrix if insufficient data
        return []

    # Convert data to numeric format (all columns are percentages 0-100%)
    numeric_data = []
    for item in data:
        numeric_item = {}
        for col in correlation_columns:
            # All columns are percentage values (0-100%)
            hygiene_value = item.get(col, '')
            try:
                # Handle common error strings
                if isinstance(hygiene_value, str):
                    clean_value = hygiene_value.strip()
                    if clean_value in ['#ERROR!', 'N/A', 'NULL', 'null', '']:
                        numeric_item[col] = 0  # Default to 0 for invalid values
                        continue

                    # Remove % and convert to float
                    if '%' in clean_value:
                        numeric_value = float(clean_value.replace('%', '').strip())
                    else:
                        numeric_value = float(clean_value)
                else:
                    numeric_value = float(hygiene_value) if hygiene_value else 0

                # Convert to 0-1 range (percentages are 0-100, so divide by 100)
                numeric_item[col] = numeric_value / 100
            except (ValueError, AttributeError, TypeError):
                # Skip invalid values, use 0 as default
                numeric_item[col] = 0

        numeric_data.append(numeric_item)

    # Calculate correlation matrix
    correlation_matrix = {}
    n = len(correlation_columns)

    for i in range(n):
        col1 = correlation_columns[i]
        correlation_matrix[col1] = {}

        for j in range(n):
            col2 = correlation_columns[j]

            if i == j:
                correlation_matrix[col1][col2] = 1.0
            else:
                # Get values for correlation calculation
                values1 = [item[col1] for item in numeric_data if col1 in item]
                values2 = [item[col2] for item in numeric_data if col2 in item]

                if len(values1) < 2 or len(values2) < 2:
                    correlation_matrix[col1][col2] = 0.0
                    continue

                # Calculate Pearson correlation coefficient
                mean1 = sum(values1) / len(values1)
                mean2 = sum(values2) / len(values2)

                numerator = sum((x - mean1) * (y - mean2) for x, y in zip(values1, values2))
                denominator1 = (sum((x - mean1) ** 2 for x in values1)) ** 0.5
                denominator2 = (sum((y - mean2) ** 2 for y in values2)) ** 0.5

                if denominator1 == 0 or denominator2 == 0:
                    correlation_matrix[col1][col2] = 0.0
                else:
                    correlation_matrix[col1][col2] = numerator / (denominator1 * denominator2)

    # Convert to list of dictionaries for frontend consumption
    result = []
    for row_col in correlation_columns:
        row_data = {'metric': row_col}
        for col_col in correlation_columns:
            row_data[col_col] = round(correlation_matrix[row_col][col_col], 3)
        result.append(row_data)

    return result


@api_view(['GET'])
@require_auth
def get_hygiene_table_data(request):
    """
    Optimized Hygiene Table View:
    - Uses efficient column selection
    - Handles both YYYY-MM-DD and DD-MM-YYYY text dates
    - Prevents redundant DB hits
    - Caches results for repeated requests
    """
    try:
        q = request.query_params
        start_date = q.get("start_date")
        end_date = q.get("end_date")
        brand = q.get("brand")
        platform = q.get("platform")
        hygiene = q.get("hygiene", "All")

        # ---------------------------------------------------------------------
        # 1️⃣ Optional caching
        # ---------------------------------------------------------------------
        cache_key = f"hygiene:{brand}:{platform}:{hygiene}:{start_date}:{end_date}"
        cached = cache.get(cache_key)
        if cached:
            cached["cache_hit"] = True
            return Response(cached, status=status.HTTP_200_OK)

        # ---------------------------------------------------------------------
        # 2️⃣ Hygiene column mapping
        # ---------------------------------------------------------------------
        hygiene_columns_map = {
            "Price Hygiene": ["Price Rule", "Live Price", "Price Validation", "Price_Hygiene"],
            "Coupon Hygiene": ["Coupon Rule", "Live Coupon", "Coupon Validation", "Coupon_Hygiene"],
            "Activation_Hygiene": [
                "SNS Rule", "Live SNS", "SNS Validation",
                "BXGY Rule", "Live BXGY", "BXGY Validation", "Activation_Hygiene"
            ],
            "Availability Hygiene": ["Availability", "Availability_Hygiene"],
            "Deal Hygiene": ["Deal Tag", "Deal_Hygiene"],
            "EDD Hygiene": [
                "EDD_400013", "EDD_600005", "EDD_122102", "EDD_700016", "EDD_560068", "EDD_Hygiene"
            ],
            "Sold By Validation": [
                *[f'Sold By {i}_{code}' for i in range(1, 4) for code in ['400013', '600005', '122102', '700016', '560068']],
                "Sold By Validation"
            ],
            "Rating Hygiene": ["3 Star Ratings", "2 Star Ratings", "1 Star Ratings", "Total Ratings", "Ratings", "Rating_Hygiene"],
            "Catalog_Hygiene": [
                "Ratings", "Sub-Category BSR", "Category BSR", "Number of Other Sellers",
                "Title Length", "Bullet Point Count", "Videos Count", "Images Count", "A+", "Catalog_Hygiene"
            ]
        }

        # Common columns
        common_columns = [
            "Date", "Brand", "Platform", "SKU Code", "ASIN", "Generic Title",
            "Category", "Sub-category", "GMV", "Units"
        ]

        # ---------------------------------------------------------------------
        # 3️⃣ Column selection (efficient dynamic list)
        # ---------------------------------------------------------------------
        selected_columns = common_columns.copy()
        if hygiene == "All":
            for cols in hygiene_columns_map.values():
                selected_columns.extend(cols)
        else:
            selected_columns.extend(hygiene_columns_map.get(hygiene, []))

        # ---------------------------------------------------------------------
        # 4️⃣ Table existence check
        # ---------------------------------------------------------------------
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='ecom_consolidated'
                )
                """
            )
            if not cursor.fetchone()[0]:
                # Mock data for dev/local
                mock_data = [
                    {"Date": "2024-01-15", "Brand": "Clear", "Platform": "Amazon", "Price_Hygiene": "95%"},
                    {"Date": "2024-01-16", "Brand": "Clear", "Platform": "Flipkart", "Price_Hygiene": "90%"},
                ]
                return Response({
                    "success": True,
                    "data": mock_data,
                    "hygiene_columns": hygiene_columns_map,
                    "options": {"brands": ["Clear"], "platforms": ["Amazon", "Flipkart"]}
                })

        # ---------------------------------------------------------------------
        # 5️⃣ Build WHERE clause dynamically
        # ---------------------------------------------------------------------
        where_clauses, params = [], []

        def parse_date(value):
            try:
                return datetime.strptime(value, "%Y-%m-%d").date()
            except Exception:
                return None

        start_date_obj, end_date_obj = parse_date(start_date), parse_date(end_date)

        # Check once if 'date_cast' column exists
        if not hasattr(get_hygiene_table_data, "_has_date_cast"):
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                        AND table_name = 'ecom_consolidated'
                        AND column_name = 'date_cast'
                    );
                """)
                get_hygiene_table_data._has_date_cast = cursor.fetchone()[0]

        date_column = "date_cast" if getattr(get_hygiene_table_data, "_has_date_cast", False) else '"Date"'

        if start_date_obj:
            where_clauses.append(f"{date_column} >= %s")
            params.append(start_date_obj)

        if end_date_obj:
            where_clauses.append(f"{date_column} <= %s")
            params.append(end_date_obj)

        if brand:
            where_clauses.append('"Brand" = %s')
            params.append(brand)

        if platform:
            platforms = [p.strip() for p in platform.split(",") if p.strip()]
            placeholders = ", ".join(["%s"] * len(platforms))
            where_clauses.append(f'"Platform" IN ({placeholders})')
            params.extend(platforms)

        where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        # ---------------------------------------------------------------------
        # 6️⃣ Filter selected columns based on DB existence
        # ---------------------------------------------------------------------
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema='public' AND table_name='ecom_consolidated'
            """)
            existing_cols = {row[0] for row in cursor.fetchall()}

        selected_columns = [c for c in selected_columns if c in existing_cols]
        if not selected_columns:
            return Response({"success": False, "error": "No valid columns found."}, status=status.HTTP_400_BAD_REQUEST)

        columns_sql = ", ".join(f'"{c}"' for c in selected_columns)

        # ---------------------------------------------------------------------
        # 7️⃣ Main query (optimized order + minimal formatting)
        # ---------------------------------------------------------------------
        query = f"""
            SELECT {columns_sql}
            FROM public.ecom_consolidated
            {where_sql}
            ORDER BY
                CASE
                    WHEN "Date" ~ '^\d{2}-\d{2}-\d{4}$' THEN TO_DATE("Date", 'DD-MM-YYYY')
                    WHEN "Date" ~ '^\d{4}-\d{2}-\d{2}$' THEN TO_DATE("Date", 'YYYY-MM-DD')
                END DESC,
                "Platform", "Brand"
        """

        # ---------------------------------------------------------------------
        # 8️⃣ Fetch data efficiently
        # ---------------------------------------------------------------------
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            cols = [col[0] for col in cursor.description]
            data = [dict(zip(cols, row)) for row in cursor.fetchall()]

        # ---------------------------------------------------------------------
        # 9️⃣ Fetch filter dropdowns
        # ---------------------------------------------------------------------
        with connection.cursor() as cursor:
            cursor.execute('SELECT DISTINCT "Brand" FROM public.ecom_consolidated WHERE "Brand" IS NOT NULL ORDER BY "Brand"')
            brands = [r[0] for r in cursor.fetchall()]
            cursor.execute('SELECT DISTINCT "Platform" FROM public.ecom_consolidated WHERE "Platform" IS NOT NULL ORDER BY "Platform"')
            platforms = [r[0] for r in cursor.fetchall()]

        response_data = {
            "success": True,
            "data": data,
            "hygiene_columns": hygiene_columns_map,
            "selected_columns": selected_columns,
            "options": {"brands": brands, "platforms": platforms},
            "cache_hit": False,
        }

        cache.set(cache_key, response_data, timeout=600)
        return Response(response_data, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"success": False, "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)