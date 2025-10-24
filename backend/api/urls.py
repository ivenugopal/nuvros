from django.urls import path
from . import views

urlpatterns = [
    path('consolidated-data/', views.get_consolidated_data, name='consolidated_data'),
    path('sales-target-data/', views.get_sales_target_data, name='sales_target_data'),
    path('drr-report/', views.get_drr_report, name='drr_report'),
    path('user-brands/', views.get_user_brands, name='user-brands'),
    path('platform-sales-summary/', views.get_platform_sales_summary, name='platform_sales_summary'),
    path('platform-sales-subcategory-drilldown/', views.get_platform_sales_subcategory_drilldown, name='platform_sales_subcategory_drilldown'),
    path('platform-sales-report/', views.get_platform_sales_report, name='platform_sales_report'),
    path('sales-performance-weekly/', views.get_sales_performance_weekly, name='sales_performance_weekly'),
    path('sales-contribution/', views.get_sales_contribution, name='sales_contribution'),
    path('daily-report/', views.get_daily_report, name='daily_report'),
    path('inventory-overview/', views.get_inventory_overview, name='inventory_overview'),
    path('inventory-stock-snapshot/', views.get_inventory_stock_snapshot, name='inventory_stock_snapshot'),
    path('inventory-movements/', views.get_inventory_movements, name='inventory_movements'),
    path('ads-overview/', views.get_ads_overview, name='ads_overview'),
    path('ads-category-spends/', views.get_ads_category_spends, name='ads_category_spends'),
    path('hygiene-overview/', views.get_hygiene_overview, name='hygiene_overview'),
    path('hygiene-table/', views.get_hygiene_table_data, name='hygiene_table'),
    path('trend-analysis/', views.get_trend_analysis, name='trend_analysis'),
    path('correlation-matrix/', views.get_correlation_matrix, name='correlation_matrix'),
    path('healthcheck/', views.health_check, name='healthcheck'),
    # Auth endpoints
    path('auth/signup/', views.signup, name='auth_signup'),
    path('auth/login/', views.login, name='auth_login'),
    path('auth/refresh/', views.refresh_token, name='auth_refresh'),
    path('auth/me/', views.me, name='auth_me'),
]