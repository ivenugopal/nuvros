// Add ESLint disable comment at the top to suppress react-hooks/exhaustive-deps and no-unused-vars warnings
/* eslint-disable react-hooks/exhaustive-deps, no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';
import { api, apiBaseURL, setupAuthInterceptors, startProactiveRefresh } from './services/api';
import { formatNumber, formatPercent } from './utils/format';
import { exportToXlsx, exportToXlsxOptimized } from './utils/export';
import { getCurrentMonthStartEnd, calculateWeeksBetweenMonths, generateWeekHeaders } from './utils/date';
import { compareValues } from './utils/sort';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import AuthCard from './components/auth/AuthCard';
import ThemeToggle from './components/common/ThemeToggle';
import { ThemeProvider } from './contexts/ThemeContext';
import { UserBrandsProvider, useUserBrands } from './contexts/UserBrandsContext';
import OverallSummary from './features/sales/OverallSummary';
import DRRReport from './features/sales/DRRReport';
import PlatformSummary from './features/sales/PlatformSummary';
import SalesPerformance from './features/sales/SalesPerformance';
import SalesContribution from './features/sales/SalesContribution';
import DailyReport from './features/sales/DailyReport';
import StockLevels from './features/inventory/StockLevels';
import InventoryOverview from './features/inventory/InventoryOverview';
import InventoryMovements from './features/inventory/InventoryMovements';
import { modules, getCurrentTab } from './constants/modules';
import { fetchPlatformSalesSubcategoryDrilldown, fetchAdsOverview, fetchAdsCategorySpends, fetchHygieneOverview, fetchHygieneTable, fetchTrendAnalysis, fetchCorrelationMatrix } from './services/api';
import AdsOverview from './features/ads/AdsOverview';
import CategorySpends from './features/ads/CategorySpends';
import HygieneOverview from './features/hygiene/HygieneOverview';
import HygieneEQCOMOverview from './features/hygiene/HygieneEQCOMOverview';
import HygieneTable from './features/hygiene/HygieneTable';
import TrendAnalysis from './features/hygiene/TrendAnalysis';
import CorrelationMatrix from './features/hygiene/CorrelationMatrix';

// Inner component that uses UserBrandsContext
function AppContent() {
  const { selectedBrand, salesBrands, isLoading: brandsLoading } = useUserBrands(); // Use global brand from context
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('token') || '');
  // Stock Levels (snapshot) filters
  const [stockQueryDate, setStockQueryDate] = useState('');
  const [stockSort, setStockSort] = useState('drr_desc');
  // Inventory Overview state
  const [invOvData, setInvOvData] = useState([]);
  const [invOvDates, setInvOvDates] = useState([]);
  const [invOvLoading, setInvOvLoading] = useState(false);
  const [invOvError, setInvOvError] = useState(null);
  const [invOvPeriod, setInvOvPeriod] = useState(['Previous 30 Days']);
  const [invOvPlatform, setInvOvPlatform] = useState(['All Platforms']);
  const [invOvBrand, setInvOvBrand] = useState(['Clear']);
  const [invOvSupply, setInvOvSupply] = useState(['All']);
  const [invOvMetric, setInvOvMetric] = useState(['drr']);
  const [invOvOptions, setInvOvOptions] = useState({ platforms: [], supply_sources: [], periods: { months: [], defaults: ['prev7','prev30'] } });

  // Inventory Movements state
  const [invMovData, setInvMovData] = useState({ platforms: [], rows: [] });
  const [invMovLoading, setInvMovLoading] = useState(false);
  const [invMovError, setInvMovError] = useState(null);
  const [invMovDate, setInvMovDate] = useState('');
  const [invMovSupply, setInvMovSupply] = useState('');

  const fetchInventoryOverview = async () => {
    try {
      setInvOvLoading(true);
      setInvOvError(null);
      const params = {};
      
      // Convert array filters to single values for API compatibility
      if (invOvPeriod && invOvPeriod.length > 0) {
        const period = invOvPeriod[0];
        if (period === 'Previous 7 Days') params.period = 'prev7';
        else if (period === 'Previous 30 Days') params.period = 'prev30';
        else params.period = period;
      }
      if (invOvPlatform && invOvPlatform.length > 0 && !invOvPlatform.includes('All Platforms')) {
        params.platform = invOvPlatform[0];
      }
      if (invOvBrand && invOvBrand.length > 0) {
        params.brand = invOvBrand[0];
      }
      if (invOvSupply && invOvSupply.length > 0 && !invOvSupply.includes('All')) {
        params.supply_source = invOvSupply[0];
      }
      
      const response = await api.get('/inventory-overview/', { params });
      if (response.data?.success) {
        setInvOvData(response.data.data || []);
        setInvOvDates(response.data.dates || []);
        setInvOvOptions(response.data.filters || {});
      } else {
        setInvOvError(response.data?.error || 'Failed to fetch');
      }
    } catch (err) {
      setInvOvError(err.response?.data?.error || err.message);
    } finally {
      setInvOvLoading(false);
    }
  };

  const fetchInventoryMovements = async () => {
    try {
      setInvMovLoading(true);
      setInvMovError(null);
      const params = {};
      if (invMovDate) params.query_date = invMovDate;
      if (selectedBrand) params.brand = selectedBrand;
      if (invMovSupply) params.supply_source = invMovSupply;
      const response = await api.get('/inventory-movements/', { params });
      if (response.data?.success) {
        setInvMovData(response.data.data || { platforms: [], rows: [] });
        // Brand options are now managed by UserBrandsContext
        if (response.data?.filters?.supply_sources) setAvailablePlatformReportSupplySources(response.data.filters.supply_sources);
      } else {
        setInvMovError(response.data?.error || 'Failed to fetch');
      }
    } catch (err) {
      setInvMovError(err.response?.data?.error || err.message);
    } finally {
      setInvMovLoading(false);
    }
  };
  const [authView, setAuthView] = useState('login'); // 'login' | 'signup'
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authForm, setAuthForm] = useState({ username: '', password: '', email: '', full_name: '' });
  const [tokenRefreshed, setTokenRefreshed] = useState(false);
  const [data, setData] = useState([]);
  const [targetData, setTargetData] = useState([]);
  const [totalGrowthRate, setTotalGrowthRate] = useState(null);
  const [totalCitiesLiveOverall, setTotalCitiesLiveOverall] = useState(0);
  const [totalArticlesOverall, setTotalArticlesOverall] = useState(0);
  const [loading, setLoading] = useState(true);
  const [targetLoading, setTargetLoading] = useState(true);
  const [error, setError] = useState(null);
  const [targetError, setTargetError] = useState(null);
  const [activeModule, setActiveModule] = useState('sales');
  const [activeTab, setActiveTab] = useState('overall');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedModules, setExpandedModules] = useState({ sales: true }); // Track which modules are expanded
  const { start: defaultMonthStart, end: defaultMonthEnd } = getCurrentMonthStartEnd();
  const [startDate, setStartDate] = useState(defaultMonthStart);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]); // Use current date instead of month end

  // DRR Report state
  const [drrData, setDrrData] = useState([]);
  const [drrLoading, setDrrLoading] = useState(false);
  const [drrError, setDrrError] = useState(null);
  const [drrStartDate, setDrrStartDate] = useState(defaultMonthStart);
  const [drrEndDate, setDrrEndDate] = useState(new Date().toISOString().split('T')[0]); // Use current date instead of month end
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [availablePlatforms, setAvailablePlatforms] = useState([]);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedSupplySource, setSelectedSupplySource] = useState('');
  const [selectedManufacturingCity, setSelectedManufacturingCity] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubCategory, setSelectedSubCategory] = useState('');
  const [availableCities, setAvailableCities] = useState([]);
  const [availableSupplySources, setAvailableSupplySources] = useState([]);
  const [availableManufacturingCities, setAvailableManufacturingCities] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableSubCategories, setAvailableSubCategories] = useState([]);

  // DRR-specific multi-select filters (arrays) to avoid impacting other tabs
  const [selectedDrrPlatforms, setSelectedDrrPlatforms] = useState([]);
  const [selectedDrrCities, setSelectedDrrCities] = useState([]);
  const [selectedDrrSupplySources, setSelectedDrrSupplySources] = useState([]);
  const [selectedDrrManufacturingCities, setSelectedDrrManufacturingCities] = useState([]);
  const [selectedDrrCategories, setSelectedDrrCategories] = useState([]);
  const [selectedDrrSubCategories, setSelectedDrrSubCategories] = useState([]);
  const [selectedDrrBrands, setSelectedDrrBrands] = useState([]);

  // Platform Sales Summary state
  const [platformSummaryData, setPlatformSummaryData] = useState([]);
  const [platformSummaryLoading, setPlatformSummaryLoading] = useState(false);
  const [platformSummaryError, setPlatformSummaryError] = useState(null);
  const [platformSummaryStartDate, setPlatformSummaryStartDate] = useState(defaultMonthStart);
  const [platformSummaryEndDate, setPlatformSummaryEndDate] = useState(new Date().toISOString().split('T')[0]); // Use current date instead of month end
  const [selectedPlatformSummary, setSelectedPlatformSummary] = useState('');
  const [selectedPlatformSummaryCity, setSelectedPlatformSummaryCity] = useState('');
  const [selectedPlatformSummarySupplySource, setSelectedPlatformSummarySupplySource] = useState('');
  const [availablePlatformsSummary, setAvailablePlatformsSummary] = useState([]);
  const [availablePlatformSummaryCities, setAvailablePlatformSummaryCities] = useState([]);
  const [availablePlatformSummarySupplySources, setAvailablePlatformSummarySupplySources] = useState([]);
  const [availablePlatformSummaryCategories, setAvailablePlatformSummaryCategories] = useState([]);
  const [selectedPlatformSummaryCategory, setSelectedPlatformSummaryCategory] = useState('');
  // Platform Summary additional: brand (local multi) and manufacturing city
  const [selectedPlatformSummaryBrands, setSelectedPlatformSummaryBrands] = useState([]);
  const [selectedPlatformSummaryManufacturingCity, setSelectedPlatformSummaryManufacturingCity] = useState([]);
  const [availablePlatformSummaryManufacturingCities, setAvailablePlatformSummaryManufacturingCities] = useState([]);
  
  // Drill-down state
  const [isDrilldownView, setIsDrilldownView] = useState(false);
  const [drilldownData, setDrilldownData] = useState([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState(null);
  const [selectedCategoryForDrilldown, setSelectedCategoryForDrilldown] = useState('');

  // Platform Sales Report state
  const [platformReportData, setPlatformReportData] = useState([]);
  const [platformReportLoading, setPlatformReportLoading] = useState(false);
  const [platformReportError, setPlatformReportError] = useState(null);
  const [platformReportMonthStart, setPlatformReportMonthStart] = useState(`${defaultMonthStart.slice(0,7)}`);
  const [platformReportMonthEnd, setPlatformReportMonthEnd] = useState(`${defaultMonthEnd.slice(0,7)}`);
  const [selectedPlatformReport, setSelectedPlatformReport] = useState([]);
  const [selectedPlatformReportCity, setSelectedPlatformReportCity] = useState([]);
  const [selectedPlatformReportSupplySource, setSelectedPlatformReportSupplySource] = useState([]);
  const [selectedPlatformReportCategory, setSelectedPlatformReportCategory] = useState([]);
  const [selectedPlatformReportManufacturingCity, setSelectedPlatformReportManufacturingCity] = useState([]);
  const [availablePlatformsReport, setAvailablePlatformsReport] = useState([]);
  const [availablePlatformReportCities, setAvailablePlatformReportCities] = useState([]);
  const [availablePlatformReportSupplySources, setAvailablePlatformReportSupplySources] = useState([]);
  const [availablePlatformReportCategories, setAvailablePlatformReportCategories] = useState([]);
  const [availablePlatformReportManufacturingCities, setAvailablePlatformReportManufacturingCities] = useState([]);
  const [selectedMetricReport, setSelectedMetricReport] = useState('gmv');
  // Sales Performance specific: multi-brand selection
  const [selectedPlatformReportBrands, setSelectedPlatformReportBrands] = useState([]);
  const [salesPerfView, setSalesPerfView] = useState('target'); // 'target' | 'weekly' | 'monthly'
  const [weeklyData, setWeeklyData] = useState([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState(null);
  const [monthlyData, setMonthlyData] = useState([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState(null);
  
  // Sales Contribution state
  const [contribData, setContribData] = useState([]);
  const [contribLoading, setContribLoading] = useState(false);
  const [contribError, setContribError] = useState(null);
  const [contribStartDate, setContribStartDate] = useState(defaultMonthStart);
  const [contribEndDate, setContribEndDate] = useState(new Date().toISOString().split('T')[0]); // Use current date instead of month end
  const [selectedContribPlatforms, setSelectedContribPlatforms] = useState([]); // multi-select
  const [selectedContribCity, setSelectedContribCity] = useState([]); // multi-select
  const [selectedContribSupplySource, setSelectedContribSupplySource] = useState([]); // multi-select
  const [selectedContribCategory, setSelectedContribCategory] = useState([]); // multi-select
  const [selectedContribSubCategory, setSelectedContribSubCategory] = useState([]); // multi-select
  // Sales Contribution specific: multi-brand selection
  const [selectedContribBrands, setSelectedContribBrands] = useState([]);
  const [selectedContribManufacturingCities, setSelectedContribManufacturingCities] = useState([]);
  
  // Sales Contribution pagination state
  const [contribCurrentPage, setContribCurrentPage] = useState(1);
  const [contribPageSize, setContribPageSize] = useState(20);
  const [contribPagination, setContribPagination] = useState({
    current_page: 1,
    page_size: 20,
    total_count: 0,
    total_pages: 1,
    has_previous: false,
    has_next: false
  });
  const [availableContribPlatforms, setAvailableContribPlatforms] = useState([]);
  const [availableContribCities, setAvailableContribCities] = useState([]);
  const [availableContribSupplySources, setAvailableContribSupplySources] = useState([]);
  const [availableContribCategories, setAvailableContribCategories] = useState([]);
  const [availableContribSubCategories, setAvailableContribSubCategories] = useState([]);
  const [availableContribManufacturingCities, setAvailableContribManufacturingCities] = useState([]);
  const [contribDropdownOpen, setContribDropdownOpen] = useState(false);
  const [contribSearch, setContribSearch] = useState('');
  
  // Ref to track ongoing API calls and prevent duplicates
  const contribFetchingRef = useRef(false);

  // Daily Report state
  const [dailyReportData, setDailyReportData] = useState([]);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const [dailyReportError, setDailyReportError] = useState(null);
  const [dailyReportStartDate, setDailyReportStartDate] = useState(defaultMonthStart);
  const [dailyReportEndDate, setDailyReportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedDailyReportPlatform, setSelectedDailyReportPlatform] = useState('');
  const [selectedDailyReportBrands, setSelectedDailyReportBrands] = useState([]);
  const [selectedDailyReportCities, setSelectedDailyReportCities] = useState([]);
  const [selectedDailyReportSupplySources, setSelectedDailyReportSupplySources] = useState([]);
  const [selectedDailyReportManufacturingCities, setSelectedDailyReportManufacturingCities] = useState([]);
  const [selectedDailyReportCategories, setSelectedDailyReportCategories] = useState([]);
  const [selectedDailyReportSubCategories, setSelectedDailyReportSubCategories] = useState([]);
  const [availableDailyReportPlatforms, setAvailableDailyReportPlatforms] = useState([]);
  const [availableDailyReportCities, setAvailableDailyReportCities] = useState([]);
  const [availableDailyReportSupplySources, setAvailableDailyReportSupplySources] = useState([]);
  const [availableDailyReportManufacturingCities, setAvailableDailyReportManufacturingCities] = useState([]);
  const [availableDailyReportCategories, setAvailableDailyReportCategories] = useState([]);
  const [availableDailyReportSubCategories, setAvailableDailyReportSubCategories] = useState([]);
  const [dailyReportDates, setDailyReportDates] = useState([]);
  const [selectedDailyReportMetric, setSelectedDailyReportMetric] = useState('gmv');
  const [dailyReportView, setDailyReportView] = useState('platform_item_id'); // 'platform_item_id' | 'supply_source' | 'supply_city'
  
  // Daily Report pagination state
  const [dailyReportCurrentPage, setDailyReportCurrentPage] = useState(1);
  const [dailyReportPageSize, setDailyReportPageSize] = useState(20);
  const [dailyReportPagination, setDailyReportPagination] = useState({
    current_page: 1,
    page_size: 20,
    total_count: 0,
    total_pages: 1,
    has_previous: false,
    has_next: false,
  });

  // Inventory Stock Levels state
  const [inventoryData, setInventoryData] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState(null);
  const [inventoryBrand, setInventoryBrand] = useState('Clear');
  const [inventoryPlatform, setInventoryPlatform] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('');
  const [inventorySubCategory, setInventorySubCategory] = useState('');
  const [inventoryWarehouseCity, setInventoryWarehouseCity] = useState('');
  const [inventoryMinStock, setInventoryMinStock] = useState('');
  const [inventoryMaxStock, setInventoryMaxStock] = useState('');
  const [inventoryCurrentPage, setInventoryCurrentPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(20);
  const [inventoryPagination, setInventoryPagination] = useState({
    page: 1,
    page_size: 20,
    total_count: 0,
    total_pages: 1,
    has_previous: false,
    has_next: false,
  });
  const [inventoryOptions, setInventoryOptions] = useState({
    brands: [],
    platforms: [],
    categories: [],
    sub_categories: [],
    warehouse_cities: [],
  });
  const [inventorySummary, setInventorySummary] = useState({});
  
  // Download loading states
  const [downloadLoading, setDownloadLoading] = useState({
    salesSummary: false,
    drr: false,
    platformSummary: false,
    platformReport: false,
    weekly: false,
    monthly: false,
    salesContribution: false,
    dailyReport: false,
    inventory: false
  });
  
  // Download progress states
  const [downloadProgress, setDownloadProgress] = useState({
    drr: { current: 0, total: 0, records: 0, percentage: 0 },
    platformSummary: { current: 0, total: 0, records: 0, percentage: 0 },
    platformReport: { current: 0, total: 0, records: 0, percentage: 0 },
    weekly: { current: 0, total: 0, records: 0, percentage: 0 },
    monthly: { current: 0, total: 0, records: 0, percentage: 0 },
    salesContribution: { current: 0, total: 0, records: 0, percentage: 0 },
    dailyReport: { current: 0, total: 0, records: 0, percentage: 0 },
    inventory: { current: 0, total: 0, records: 0, percentage: 0 }
  });
  
  // Sorting state per table (kept minimal; Overall Sales Summary sorting disabled)
  const [sortState, setSortState] = useState({
    drr: { key: null, direction: 'asc' },
    platformSummary: { key: null, direction: 'asc' },
    platformReport: { key: null, direction: 'asc' },
    weekly: { key: null, direction: 'asc' },
    monthly: { key: null, direction: 'asc' },
    salesContribution: { key: null, direction: 'asc' },
    inventory: { key: null, direction: 'asc' }
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    current_page: 1,
    page_size: 20,
    total_count: 0,
    total_pages: 1,
    has_previous: false,
    has_next: false
  });
  // Brand filter now managed by UserBrandsContext (global header brand)
  const [brandsInitialized, setBrandsInitialized] = useState(false);
  const [availableOverallPlatforms, setAvailableOverallPlatforms] = useState([]);

  // Ads Overview state
  const [adsData, setAdsData] = useState([]);
  const [adsTotals, setAdsTotals] = useState({});
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState(null);
  const [adsStartDate, setAdsStartDate] = useState(defaultMonthStart);
  const [adsEndDate, setAdsEndDate] = useState(defaultMonthEnd);
  const [adsBrand, setAdsBrand] = useState('Clear');
  const [adsPlatform, setAdsPlatform] = useState('');
  const [adsGroupBy, setAdsGroupBy] = useState('platform');
  const [adsOptions, setAdsOptions] = useState({ brands: [], platforms: [], categories: [], campaigns: [] });

  // Category Spends state
  const [catSpendData, setCatSpendData] = useState({ rows: [], dates: [], totals_per_date: {}, grand_total: 0, filters: { brands: [] } });
  const [catSpendLoading, setCatSpendLoading] = useState(false);
  const [catSpendError, setCatSpendError] = useState(null);
  const [catSpendStartDate, setCatSpendStartDate] = useState(defaultMonthStart);
  const [catSpendEndDate, setCatSpendEndDate] = useState(defaultMonthEnd);
  const [catSpendBrands, setCatSpendBrands] = useState(['Clear']);

  // Hygiene Overview state
  const [hygieneData, setHygieneData] = useState([]);
  const [hygieneScores, setHygieneScores] = useState({ price_hygiene_score: 0, coupon_hygiene_score: 0, activation_hygiene_score: 0 });
  const [hygieneLoading, setHygieneLoading] = useState(false);
  const [hygieneError, setHygieneError] = useState(null);
  const [hygieneStartDate, setHygieneStartDate] = useState(defaultMonthStart);
  const [hygieneEndDate, setHygieneEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [hygieneBrand, setHygieneBrand] = useState('');
  const [hygienePlatform, setHygienePlatform] = useState([]);
  const [hygieneOptions, setHygieneOptions] = useState({ brands: [], platforms: [] });

  // Trend Analysis state
  const [trendData, setTrendData] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState(null);
  const [trendStartDate, setTrendStartDate] = useState(defaultMonthStart);
  const [trendEndDate, setTrendEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [trendBrand, setTrendBrand] = useState('');
  const [trendPlatform, setTrendPlatform] = useState([]);
  const [trendMetric1, setTrendMetric1] = useState('Live Price');
  const [trendMetric2, setTrendMetric2] = useState('Discount');
  const [trendOptions, setTrendOptions] = useState({ brands: [], platforms: [] });

  // Correlation Matrix state
  const [correlationData, setCorrelationData] = useState([]);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  const [correlationError, setCorrelationError] = useState(null);
  const [correlationStartDate, setCorrelationStartDate] = useState(defaultMonthStart);
  const [correlationEndDate, setCorrelationEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [correlationBrand, setCorrelationBrand] = useState('');
  const [correlationPlatform, setCorrelationPlatform] = useState([]);
  const [correlationOptions, setCorrelationOptions] = useState({ brands: [], platforms: [] });

  // HygieneEQCOM Overview state
  const [hygieneEQCOMData, setHygieneEQCOMData] = useState([]);
  const [hygieneEQCOMScores, setHygieneEQCOMScores] = useState({ price_hygiene_score: 0, coupon_hygiene_score: 0, activation_hygiene_score: 0 });
  const [hygieneEQCOMLoading, setHygieneEQCOMLoading] = useState(false);
  const [hygieneEQCOMError, setHygieneEQCOMError] = useState(null);
  const [hygieneEQCOMStartDate, setHygieneEQCOMStartDate] = useState(defaultMonthStart);
  const [hygieneEQCOMEndDate, setHygieneEQCOMEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [hygieneEQCOMBrand, setHygieneEQCOMBrand] = useState('');
  const [hygieneEQCOMPlatform, setHygieneEQCOMPlatform] = useState([]);
  const [hygieneEQCOMOptions, setHygieneEQCOMOptions] = useState({ brands: [], platforms: [] });

  const [catSpendOptions, setCatSpendOptions] = useState({ brands: [] });

  const fetchAds = async () => {
    try {
      setAdsLoading(true);
      setAdsError(null);
      const res = await fetchAdsOverview({
        startDate: adsStartDate,
        endDate: adsEndDate,
        brand: adsBrand,
        platform: adsPlatform,
        // Top-level view must always be grouped by platform;
        // when drilling into a platform, use the selected metric level
        groupBy: adsPlatform ? (adsGroupBy === 'platform' ? 'category' : adsGroupBy) : 'platform',
      });
      if (res?.success) {
        setAdsData(res.data || []);
        setAdsTotals(res.totals || {});
        setAdsOptions(res.filters || {});
      } else {
        setAdsError(res?.error || 'Failed to fetch');
      }
    } catch (err) {
      setAdsError(err.response?.data?.error || err.message);
    } finally {
      setAdsLoading(false);
    }
  };

  const fetchCategorySpends = async () => {
    try {
      setCatSpendLoading(true);
      setCatSpendError(null);
      const res = await fetchAdsCategorySpends({ startDate: catSpendStartDate, endDate: catSpendEndDate, brands: catSpendBrands });
      if (res?.success) {
        setCatSpendData(res);
        setCatSpendOptions({ brands: (res?.filters?.brands) || [] });
      } else {
        setCatSpendError(res?.error || 'Failed to fetch');
      }
    } catch (err) {
      setCatSpendError(err.response?.data?.error || err.message);
    } finally {
      setCatSpendLoading(false);
    }
  };

  const fetchHygiene = async () => {
    try {
      setHygieneLoading(true);
      setHygieneError(null);
      const res = await fetchHygieneOverview({
        startDate: hygieneStartDate,
        endDate: hygieneEndDate,
        brand: hygieneBrand,
        platform: hygienePlatform,
      });
      if (res?.success) {
        setHygieneData(res.data || []);
        const defaultHygieneScores = { price_hygiene_score: 0, coupon_hygiene_score: 0, activation_hygiene_score: 0 };
        setHygieneScores({ ...defaultHygieneScores, ...(res.hygiene_scores || {}) });
        setHygieneOptions(res.options || { brands: [], platforms: [] });
      } else {
        setHygieneError(res?.error || 'Failed to fetch');
      }
    } catch (err) {
      setHygieneError(err.response?.data?.error || err.message);
    } finally {
      setHygieneLoading(false);
    }
  };

  const fetchTrend = async () => {
    try {
      setTrendLoading(true);
      setTrendError(null);
      const res = await fetchTrendAnalysis({
        startDate: trendStartDate,
        endDate: trendEndDate,
        brand: trendBrand,
        platform: trendPlatform,
      });
      if (res?.success) {
        setTrendData(res.data || []);
        setTrendOptions(res.options || { brands: [], platforms: [] });
      } else {
        setTrendError(res?.error || 'Failed to fetch');
      }
    } catch (err) {
      setTrendError(err.response?.data?.error || err.message);
    } finally {
      setTrendLoading(false);
    }
  };

  const fetchCorrelation = async () => {
    try {
      setCorrelationLoading(true);
      setCorrelationError(null);
      const res = await fetchCorrelationMatrix({
        startDate: correlationStartDate,
        endDate: correlationEndDate,
        brand: correlationBrand,
        platform: correlationPlatform,
      });
      if (res?.success) {
        setCorrelationData(res.data || []);
        setCorrelationOptions(res.options || { brands: [], platforms: [] });
      } else {
        setCorrelationError(res?.error || 'Failed to fetch');
      }
    } catch (err) {
      setCorrelationError(err.response?.data?.error || err.message);
    } finally {
      setCorrelationLoading(false);
    }
  };

  const fetchHygieneEQCOM = async () => {
    try {
      setHygieneEQCOMLoading(true);
      setHygieneEQCOMError(null);
      const res = await fetchHygieneOverview({
        startDate: hygieneEQCOMStartDate,
        endDate: hygieneEQCOMEndDate,
        brand: hygieneEQCOMBrand,
        platform: hygieneEQCOMPlatform,
      });
      if (res?.success) {
        setHygieneEQCOMData(res.data || []);
        const defaultHygieneScores = { price_hygiene_score: 0, coupon_hygiene_score: 0, activation_hygiene_score: 0 };
        setHygieneEQCOMScores({ ...defaultHygieneScores, ...(res.hygiene_scores || {}) });
        setHygieneEQCOMOptions(res.options || { brands: [], platforms: [] });
      } else {
        setHygieneEQCOMError(res?.error || 'Failed to fetch');
      }
    } catch (err) {
      setHygieneEQCOMError(err.response?.data?.error || err.message);
    } finally {
      setHygieneEQCOMLoading(false);
    }
  };

  // Modules and helpers moved to constants
  
  const toggleModuleExpansion = (moduleKey) => {
    setExpandedModules(prev => {
      const newExpandedState = !prev[moduleKey];

      // Note: Brand fetching is now handled by UserBrandsContext globally
      // No need to fetch brands when expanding modules

      return {
        ...prev,
        [moduleKey]: newExpandedState
      };
    });
  };

  // Note: User brands are now fetched by UserBrandsContext on app load
  // No need for a separate useEffect here

  // Set brandsInitialized when brands are loaded from UserBrandsContext
  useEffect(() => {
    if (!brandsLoading && salesBrands.length > 0) {
      console.log('✅ Brands loaded from context, setting brandsInitialized to true', {
        salesBrands,
        timestamp: new Date().toISOString()
      });
      setBrandsInitialized(true);
    }
  }, [brandsLoading, salesBrands]);

  // Fetch data only once on load when authToken is available and brands are initialized
  // Filter changes will NOT trigger API calls - user must click APPLY button
  useEffect(() => {
    if (authToken && brandsInitialized) {
      console.log('🔥 API TRIGGER - Initial load only:', {
        trigger: 'OverallSummary useEffect (load only)',
        startDate,
        endDate,
        selectedBrand,
        timestamp: new Date().toISOString()
      });
      fetchData();
      fetchTargetData();
    }
  }, [authToken, brandsInitialized]); // Only authToken and brandsInitialized dependencies - API called once on load

  // Fetch DRR data only when tab changes or pagination changes, and after brands are initialized
  // Filter changes will NOT trigger API calls - user must click APPLY button
  useEffect(() => {
    if (!authToken || !brandsInitialized) return;
    if (activeTab === 'drr') {
      console.log('🔥 API TRIGGER - DRR tab loaded or pagination changed:', {
        trigger: 'DRRReport useEffect',
        activeTab,
        currentPage,
        pageSize,
        selectedDrrBrands,
        timestamp: new Date().toISOString()
      });
      fetchDrrData();
    }
  }, [activeTab, currentPage, pageSize, authToken, brandsInitialized]); // Removed filter dependencies - only tab switch and pagination trigger API

  // Fetch PlatformSummary data only when tab changes and after brands are initialized
  // Filter changes will NOT trigger API calls - user must click APPLY button
  useEffect(() => {
    if (!authToken || !brandsInitialized) return;
    if (activeTab === 'platformSummary') {
      console.log('🔥 API TRIGGER - PlatformSummary tab loaded:', {
        trigger: 'PlatformSummary useEffect',
        activeTab,
        selectedPlatformSummaryBrands,
        timestamp: new Date().toISOString()
      });
      fetchPlatformSummaryData();
    }
  }, [activeTab, authToken, brandsInitialized]); // Removed filter dependencies - only tab switch triggers API

  useEffect(() => {
    if (!authToken) return;
    if (activeTab === 'ads-overview') {
      fetchAds();
    } else if (activeTab === 'campaign-performance') {
      fetchCategorySpends();
    }
  }, [activeTab, adsStartDate, adsEndDate, adsBrand, adsPlatform, adsGroupBy, authToken, catSpendStartDate, catSpendEndDate, catSpendBrands]);

  useEffect(() => {
    if (!authToken) return;
    console.log('🔍 Hygiene ECOM check:', { activeTab, activeModule, match: activeTab === 'hygiene-overview' && activeModule === 'hygiene' });
    if (activeTab === 'hygiene-overview' && activeModule === 'hygiene') {
      fetchHygiene();
    }
  }, [activeTab, activeModule, hygieneStartDate, hygieneEndDate, hygieneBrand, hygienePlatform, authToken]);

  useEffect(() => {
    if (!authToken) return;
    console.log('🔍 Hygiene EQCOM check:', { activeTab, activeModule, match: activeTab === 'hygiene-overview' && activeModule === 'hygiene_eqcom' });
    if (activeTab === 'hygiene-overview' && activeModule === 'hygiene_eqcom') {
      console.log('✅ Fetching HygieneEQCOM data...');
      fetchHygieneEQCOM();
    }
  }, [activeTab, activeModule, hygieneEQCOMStartDate, hygieneEQCOMEndDate, hygieneEQCOMBrand, hygieneEQCOMPlatform, authToken]);

  useEffect(() => {
    if (!authToken) return;
    if (activeTab === 'trend-analysis') {
      fetchTrend();
    }
  }, [activeTab, trendStartDate, trendEndDate, trendBrand, trendPlatform, authToken]);

  useEffect(() => {
    if (!authToken) return;
    if (activeTab === 'correlation-matrix') {
      fetchCorrelation();
    }
  }, [activeTab, correlationStartDate, correlationEndDate, correlationBrand, correlationPlatform, authToken]);

  // Fetch SalesPerformance data only when tab or view changes and after brands are initialized
  // Filter changes will NOT trigger API calls - user must click APPLY button
  useEffect(() => {
    if (!authToken || !brandsInitialized) return;
    // Note: salesContribution is handled in its own useEffect below (line ~679)
    if (activeTab === 'platformReport') {
      console.log('🔥 API TRIGGER - SalesPerformance tab/view changed:', {
        trigger: 'SalesPerformance useEffect',
        activeTab,
        salesPerfView,
        selectedPlatformReportBrands,
        timestamp: new Date().toISOString()
      });
      if (salesPerfView === 'target') {
        fetchPlatformReportData();
      } else if (salesPerfView === 'weekly') {
        fetchWeeklyData();
      } else if (salesPerfView === 'monthly') {
        fetchMonthlyData();
      }
      if (availablePlatformsReport.length === 0) {
        fetchPlatformsForReport();
      }
      // Fetch filter options when date range changes or when first loading
      if (platformReportMonthStart && platformReportMonthEnd) {
        fetchFilterOptionsForReport();
      }
    }
  }, [activeTab, salesPerfView, authToken, brandsInitialized]); // Removed filter dependencies - only tab and view switch trigger API

  useEffect(() => {
    if (!authToken || !brandsInitialized) return;
    if (activeTab === 'salesContribution') {
      console.log('🔥 API TRIGGER - SalesContribution:', {
        trigger: 'SalesContribution useEffect',
        selectedContribBrands,
        timestamp: new Date().toISOString()
      });
      fetchSalesContribution();
    }
  }, [activeTab, contribStartDate, contribEndDate, selectedContribPlatforms, selectedContribCity, selectedContribSupplySource, selectedContribCategory, selectedContribSubCategory, contribCurrentPage, contribPageSize, authToken, brandsInitialized, selectedContribBrands]);

  useEffect(() => {
    if (!authToken || !brandsInitialized) return;
    if (activeTab === 'dailyReport') {
      console.log('🔥 API TRIGGER - DailyReport:', {
        trigger: 'DailyReport useEffect',
        selectedDailyReportBrands,
        timestamp: new Date().toISOString()
      });
      fetchDailyReport();
    }
  }, [activeTab, dailyReportStartDate, dailyReportEndDate, selectedDailyReportPlatform, selectedDailyReportMetric, dailyReportView, authToken, brandsInitialized, selectedDailyReportBrands, selectedDailyReportCities, selectedDailyReportSupplySources, selectedDailyReportManufacturingCities, selectedDailyReportCategories, selectedDailyReportSubCategories]);

  useEffect(() => {
    if (!authToken) return;
    if (activeTab === 'stock-levels') {
      fetchInventoryData();
    } else if (activeTab === 'inventory-overview') {
      fetchInventoryOverview();
    }
  }, [activeTab, inventoryBrand, inventoryPlatform, inventoryCategory, inventorySubCategory, inventoryWarehouseCity, inventoryMinStock, inventoryMaxStock, authToken, invOvPeriod, invOvPlatform, invOvSupply, invOvMetric, stockQueryDate, stockSort]);

  // Auto-refresh Inventory Movements when filters change
  useEffect(() => {
    if (!authToken) return;
    if (activeTab === 'inventory-movements') {
      fetchInventoryMovements();
    }
  }, [activeTab, invMovDate, invMovSupply, selectedBrand, authToken]);

  // Reset to first page when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [drrStartDate, drrEndDate, selectedDrrPlatforms, selectedDrrCities, selectedDrrSupplySources, selectedDrrManufacturingCities, selectedDrrCategories, selectedDrrSubCategories, selectedDrrBrands]);

  // Reset Sales Contribution to first page when filters change
  useEffect(() => {
    if (contribCurrentPage !== 1) {
      setContribCurrentPage(1);
    }
  }, [contribStartDate, contribEndDate, selectedContribPlatforms, selectedContribSupplySource, selectedContribCategory, selectedContribSubCategory, selectedContribBrands]);

  // Reset Daily Report to first page when filters change
  useEffect(() => {
    if (dailyReportCurrentPage !== 1) {
      setDailyReportCurrentPage(1);
    }
  }, [dailyReportStartDate, dailyReportEndDate, selectedDailyReportPlatform, selectedDailyReportMetric, dailyReportView, selectedDailyReportBrands, selectedDailyReportCities, selectedDailyReportSupplySources, selectedDailyReportManufacturingCities, selectedDailyReportCategories, selectedDailyReportSubCategories]);

  useEffect(() => {
    if (inventoryCurrentPage !== 1) {
      setInventoryCurrentPage(1);
    }
  }, [inventoryBrand, inventoryPlatform, inventoryCategory, inventorySubCategory, inventoryWarehouseCity, inventoryMinStock, inventoryMaxStock]);

  // Setup shared API interceptors and proactive refresh
  useEffect(() => {
    setupAuthInterceptors({
      onTokenRefreshed: (newToken) => {
        localStorage.setItem('token', newToken);
        setAuthToken(newToken);
        setTokenRefreshed(true);
        setTimeout(() => setTokenRefreshed(false), 3000);
      },
      onSessionExpired: () => {
        localStorage.removeItem('token');
        setAuthToken('');
        setError('Session expired. Please log in again.');
      }
    });
  }, []);

  // Proactive token refresh - via service helper
  useEffect(() => {
    if (!authToken) return () => {};
    const stop = startProactiveRefresh(600000);
    return stop;
  }, [authToken]);

  // Utility function to check if error is authentication-related
  const isAuthError = (error) => {
    return error.response?.status === 401 || 
           error.message?.toLowerCase().includes('token') ||
           error.message?.toLowerCase().includes('unauthorized');
  };

  // formatNumber, formatPercent and exportToXlsx moved to utils

  // Download handlers per table (current view only)
  const handleDownloadSalesSummary = async () => {
    if (!Array.isArray(data) || data.length === 0) return;
    
    setDownloadLoading(prev => ({ ...prev, salesSummary: true }));
    try {
      let platforms = data.map(item => item.platform);
      const totalGMV = data.reduce((sum, item) => sum + (item.sales_gmv || 0), 0);
      const totalUnits = data.reduce((sum, item) => sum + (item.sales_units || 0), 0);
      const totalASP = totalUnits > 0 ? totalGMV / totalUnits : 0;
      const platformToItem = data.reduce((acc, item) => { acc[item.platform] = item; return acc; }, {});

      const header = ['Metric', ...platforms, 'Total'];
      const rowGMV = ['Sales GMV', ...platforms.map(p => formatNumber((platformToItem[p]?.sales_gmv) || 0)), formatNumber(totalGMV)];
      const rowUnits = ['Sales Units', ...platforms.map(p => formatNumber((platformToItem[p]?.sales_units) || 0)), formatNumber(totalUnits)];
      const rowASP = ['ASP', ...platforms.map(p => {
        const item = platformToItem[p] || {};
        const asp = item.sales_units > 0 ? item.sales_gmv / item.sales_units : 0;
        return formatNumber(asp);
      }), formatNumber(totalASP)];
      const rowGrowthRate = ['Growth Rate', ...platforms.map(p => {
        const item = platformToItem[p] || {};
        const growthRate = item.growth_rate;
        if (growthRate === null || growthRate === undefined) {
          return 'No Data';
        }
        return `${growthRate}%`;
      }), totalGrowthRate === null || totalGrowthRate === undefined ? 'No Data' : `${totalGrowthRate}%`];

      const file = `overall_sales_summary_${startDate || 'all'}_${endDate || 'all'}.xlsx`;
      exportToXlsx(file, [header, rowGMV, rowUnits, rowASP, rowGrowthRate], 'Overall Summary');
    } finally {
      setDownloadLoading(prev => ({ ...prev, salesSummary: false }));
    }
  };

  const fetchAllDrrData = async (onProgress = null) => {
    try {
      let allData = [];
      let currentPage = 1;
      let hasMoreData = true;
      let totalPages = 1;
      
      while (hasMoreData) {
        const params = {
          page: currentPage,
          page_size: 500 // Increased page size to reduce API calls
        };
        if (drrStartDate) params.start_date = drrStartDate;
        if (drrEndDate) params.end_date = drrEndDate;
        if (selectedPlatform) params.platform = selectedPlatform;
        if (selectedCity) params.city = selectedCity;
        if (selectedSupplySource) params.supply_source = selectedSupplySource;
        if (selectedManufacturingCity) params.manufacturing_city = selectedManufacturingCity;
        if (selectedCategory) params.category = selectedCategory;
        
        const response = await api.get('/drr-report/', { params });
        if (response.data.success && response.data.data) {
          // More memory efficient concatenation
          allData.push(...response.data.data);
          
          // Check if there are more pages
          const pagination = response.data.pagination;
          if (pagination) {
            totalPages = pagination.total_pages;
            if (onProgress) {
              onProgress({
                current: currentPage,
                total: totalPages,
                records: allData.length,
                percentage: Math.round((currentPage / totalPages) * 100)
              });
            }
            
            if (currentPage < pagination.total_pages) {
              currentPage++;
              // Add small delay to prevent overwhelming the server
              await new Promise(resolve => setTimeout(resolve, 50));
            } else {
              hasMoreData = false;
            }
          } else {
            hasMoreData = false;
          }
        } else {
          hasMoreData = false;
        }
      }
      
      return allData;
    } catch (err) {
      console.error('Failed to fetch all DRR data:', err);
      return [];
    }
  };

  const handleDownloadDrr = async () => {
    setDownloadLoading(prev => ({ ...prev, drr: true }));
    setDownloadProgress(prev => ({ ...prev, drr: { current: 0, total: 0, records: 0, percentage: 0 } }));
    
    try {
      // Use current filtered data instead of fetching all data
      const currentData = Array.isArray(drrData) ? [...drrData] : [];
      
      if (currentData.length === 0) {
        console.log('No data to export');
        return;
      }
      
      console.log(`Exporting ${currentData.length} filtered DRR records`);
      
      // Update progress to show data processing
      setDownloadProgress(prev => ({ 
        ...prev, 
        drr: { current: 1, total: 1, records: currentData.length, percentage: 100 } 
      }));
      
      const s = sortState.drr;
      const sorted = [...currentData];
      if (s && s.key) sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
      
      const header = ['Platform Item ID', 'Title', 'Platform', 'DRR', 'Last 7 Days DRR', 'Last 14 Days DRR', 'GMV', 'Units', 'Remark (7D DRR)', 'Remark (14D DRR)'];
      const rows = sorted.map(item => [
        item.platform_item_id,
        item.title,
        item.platform,
        formatNumber(item.drr || 0),
        formatNumber(item.last_7_days_drr || 0),
        formatNumber(item.last_14_days_drr || 0),
        formatNumber(item.total_gmv || 0),
        formatNumber(item.total_units || 0),
        item.drr > item.last_7_days_drr ? 'Growing' : 'Need Attention',
        item.drr > item.last_14_days_drr ? 'Growing' : 'Need Attention'
      ]);
      
      const filterInfo = [];
      if (drrStartDate) filterInfo.push(`from_${drrStartDate}`);
      if (drrEndDate) filterInfo.push(`to_${drrEndDate}`);
      if (selectedDrrPlatforms && selectedDrrPlatforms.length > 0) filterInfo.push(`platform_${selectedDrrPlatforms.join('-')}`);
      if (selectedDrrCities && selectedDrrCities.length > 0) filterInfo.push(`city_${selectedDrrCities.join('-')}`);
      
      const file = `drr_report_filtered_${filterInfo.join('_')}_${currentData.length}records.xlsx`;
      
      // Use optimized export for large datasets
      if (rows.length > 1000) {
        await exportToXlsxOptimized(file, [header, ...rows], 'DRR');
      } else {
        exportToXlsx(file, [header, ...rows], 'DRR');
      }
    } finally {
      setDownloadLoading(prev => ({ ...prev, drr: false }));
      setDownloadProgress(prev => ({ ...prev, drr: { current: 0, total: 0, records: 0, percentage: 0 } }));
    }
  };

  const fetchAllPlatformSummaryData = async () => {
    try {
      // Platform summary doesn't seem to have pagination based on the regular fetch function
      const params = {};
      if (platformSummaryStartDate) params.start_date = platformSummaryStartDate;
      if (platformSummaryEndDate) params.end_date = platformSummaryEndDate;
      if (selectedPlatformSummary) params.platform = selectedPlatformSummary;
      if (selectedPlatformSummaryCity) params.city = selectedPlatformSummaryCity;
      if (selectedPlatformSummarySupplySource) params.supply_source = selectedPlatformSummarySupplySource;
      if (selectedPlatformSummaryCategory) params.category = selectedPlatformSummaryCategory;
      if (Array.isArray(selectedPlatformSummaryManufacturingCity) && selectedPlatformSummaryManufacturingCity.length > 0) params.manufacturing_city = selectedPlatformSummaryManufacturingCity.join(',');
      if (Array.isArray(selectedPlatformSummaryBrands) && selectedPlatformSummaryBrands.length > 0) params.brand = selectedPlatformSummaryBrands.join(',');
      
      const response = await api.get('/platform-sales-summary/', { params });
      return response.data.success ? response.data.data : [];
    } catch (err) {
      console.error('Failed to fetch all Platform Summary data:', err);
      return [];
    }
  };

  const handleDownloadPlatformSummary = async () => {
    setDownloadLoading(prev => ({ ...prev, platformSummary: true }));
    setDownloadProgress(prev => ({ ...prev, platformSummary: { current: 0, total: 0, records: 0, percentage: 0 } }));
    
    try {
      // Use current filtered data instead of fetching all data
      const currentData = Array.isArray(platformSummaryData) ? [...platformSummaryData] : [];
      
      if (currentData.length === 0) {
        console.log('No data to export');
        return;
      }
      
      console.log(`Exporting ${currentData.length} filtered Platform Summary records`);
      
      // Update progress to show data processing
      setDownloadProgress(prev => ({ 
        ...prev, 
        platformSummary: { current: 1, total: 1, records: currentData.length, percentage: 100 } 
      }));
      
      const s = sortState.platformSummary;
      const sorted = [...currentData];
      if (s && s.key) sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
      
      const header = ['Category', 'DRR', 'Last 7 days Avg', 'GMV', 'Units', 'ASP'];
      const rows = sorted.map(item => [
        item.category,
        formatNumber(item.drr || 0),
        formatNumber(item.last_7_days_avg || 0),
        formatNumber(item.total_gmv || 0),
        formatNumber(item.total_units || 0),
        formatNumber(item.asp || 0)
      ]);
      
      const filterInfo = [];
      if (platformSummaryStartDate) filterInfo.push(`from_${platformSummaryStartDate}`);
      if (platformSummaryEndDate) filterInfo.push(`to_${platformSummaryEndDate}`);
      if (selectedPlatformSummary && selectedPlatformSummary.length > 0) filterInfo.push(`platform_${selectedPlatformSummary.join('-')}`);
      if (selectedPlatformSummaryCity && selectedPlatformSummaryCity.length > 0) filterInfo.push(`city_${selectedPlatformSummaryCity.join('-')}`);
      
      const file = `platform_summary_filtered_${filterInfo.join('_')}_${currentData.length}records.xlsx`;
      
      // Use optimized export for large datasets
      if (rows.length > 1000) {
        await exportToXlsxOptimized(file, [header, ...rows], 'Platform Summary');
      } else {
        exportToXlsx(file, [header, ...rows], 'Platform Summary');
      }
    } finally {
      setDownloadLoading(prev => ({ ...prev, platformSummary: false }));
      setDownloadProgress(prev => ({ ...prev, platformSummary: { current: 0, total: 0, records: 0, percentage: 0 } }));
    }
  };

  const fetchAllPlatformReportData = async () => {
    try {
      // Platform report doesn't seem to have pagination based on the regular fetch function
      const params = {};
      if (platformReportMonthStart) params.month_start = platformReportMonthStart;
      if (platformReportMonthEnd) params.month_end = platformReportMonthEnd;
      if (Array.isArray(selectedPlatformReport) && selectedPlatformReport.length > 0) params.platform = selectedPlatformReport.join(',');
      if (Array.isArray(selectedPlatformReportCity) && selectedPlatformReportCity.length > 0) params.city = selectedPlatformReportCity.join(',');
      if (Array.isArray(selectedPlatformReportSupplySource) && selectedPlatformReportSupplySource.length > 0) params.supply_source = selectedPlatformReportSupplySource.join(',');
      if (selectedMetricReport) params.metric = selectedMetricReport;
      if (Array.isArray(selectedPlatformReportManufacturingCity) && selectedPlatformReportManufacturingCity.length > 0) params.manufacturing_city = selectedPlatformReportManufacturingCity.join(',');

      const response = await api.get('/platform-sales-report/', { params });
      return response.data.success ? response.data.data : [];
    } catch (err) {
      console.error('Failed to fetch all Platform Report data:', err);
      return [];
    }
  };

  const handleDownloadPlatformReport = async () => {
    setDownloadLoading(prev => ({ ...prev, platformReport: true }));
    try {
      // Use current filtered data instead of fetching all data
      const currentData = Array.isArray(platformReportData) ? [...platformReportData] : [];
      
      if (currentData.length === 0) {
        console.log('No data to export');
        return;
      }
      
      console.log(`Exporting ${currentData.length} filtered Platform Report records`);
      
      const s = sortState.platformReport;
      const sorted = [...currentData];
      if (s && s.key) sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
      
      const header = ['Category', 'Current', 'Target', 'Projected', 'Attainment'];
      const rows = sorted.map(item => [
        item.category,
        formatNumber(item.current),
        formatNumber(item.target),
        formatNumber(item.projected),
        `${Number(item.attainment ?? 0).toFixed(2)}%`
      ]);
      
      const filterInfo = [];
      if (platformReportMonthStart) filterInfo.push(`from_${platformReportMonthStart}`);
      if (platformReportMonthEnd) filterInfo.push(`to_${platformReportMonthEnd}`);
      if (Array.isArray(selectedPlatformReport) && selectedPlatformReport.length > 0) filterInfo.push(`platform_${selectedPlatformReport.join('-')}`);
      if (selectedMetricReport) filterInfo.push(`metric_${selectedMetricReport}`);
      
      const file = `sales_performance_filtered_${filterInfo.join('_')}_${currentData.length}records.xlsx`;
      exportToXlsx(file, [header, ...rows], 'Sales Performance');
    } finally {
      setDownloadLoading(prev => ({ ...prev, platformReport: false }));
    }
  };

  const fetchAllWeeklyData = async () => {
    try {
      if (!platformReportMonthStart || !platformReportMonthEnd) {
        return [];
      }

      // Calculate the months in the range
      const startDate = new Date(platformReportMonthStart + '-01');
      const endDate = new Date(platformReportMonthEnd + '-01');
      const months = [];
      
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        months.push({
          year: currentDate.getFullYear(),
          month: currentDate.getMonth() + 1
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      // Fetch data for each month and combine
      const categoryMap = new Map();

      for (const { year, month } of months) {
        const params = {
          year,
          month,
          platform: Array.isArray(selectedPlatformReport) && selectedPlatformReport.length > 0 ? selectedPlatformReport.join(',') : undefined,
          city: Array.isArray(selectedPlatformReportCity) && selectedPlatformReportCity.length > 0 ? selectedPlatformReportCity.join(',') : undefined,
          supply_source: Array.isArray(selectedPlatformReportSupplySource) && selectedPlatformReportSupplySource.length > 0 ? selectedPlatformReportSupplySource.join(',') : undefined,
          metric: selectedMetricReport,
          manufacturing_city: Array.isArray(selectedPlatformReportManufacturingCity) && selectedPlatformReportManufacturingCity.length > 0 ? selectedPlatformReportManufacturingCity.join(',') : undefined,
          brand: Array.isArray(selectedPlatformReportBrands) && selectedPlatformReportBrands.length > 0 
            ? selectedPlatformReportBrands.join(',') : undefined
        };

        // Remove undefined values
        Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

        const response = await api.get('/sales-performance-weekly/', { params });
        if (response.data.success && response.data.data) {
          // Process each category's data
          response.data.data.forEach(item => {
            if (!categoryMap.has(item.category)) {
              categoryMap.set(item.category, {
                category: item.category,
                weeks: {}
              });
            }
            
            const categoryData = categoryMap.get(item.category);
            // Map w1-w4 to the appropriate week numbers based on month position
            const monthIndex = months.findIndex(m => m.year === year && m.month === month);
            const weekOffset = monthIndex * 4;
            
            if (item.w1 !== undefined) categoryData.weeks[weekOffset + 1] = item.w1;
            if (item.w2 !== undefined) categoryData.weeks[weekOffset + 2] = item.w2;
            if (item.w3 !== undefined) categoryData.weeks[weekOffset + 3] = item.w3;
            if (item.w4 !== undefined) categoryData.weeks[weekOffset + 4] = item.w4;
          });
        }
      }

      // Convert map to array and format for display
      const formattedData = Array.from(categoryMap.values()).map(categoryData => {
        const result = { category: categoryData.category };
        const maxWeeks = Math.max(...Object.keys(categoryData.weeks).map(Number));
        
        for (let i = 1; i <= maxWeeks; i++) {
          result[`w${i}`] = categoryData.weeks[i] || 0;
        }
        
        return result;
      });

      return formattedData;
    } catch (err) {
      console.error('Failed to fetch all Weekly data:', err);
      return [];
    }
  };

  const handleDownloadWeekly = async () => {
    setDownloadLoading(prev => ({ ...prev, weekly: true }));
    try {
      // Use current filtered data instead of fetching all data
      const currentData = Array.isArray(weeklyData) ? [...weeklyData] : [];
      
      if (currentData.length === 0) {
        console.log('No weekly data to export');
        return;
      }
      
      console.log(`Exporting ${currentData.length} filtered Weekly records`);
      
      const s = sortState.weekly;
      const sorted = [...currentData];
      if (s && s.key) sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
      
      // Calculate dynamic week columns based on date range
      const numWeeks = calculateWeeksBetweenMonths(platformReportMonthStart, platformReportMonthEnd);
      const weekHeaders = generateWeekHeaders(numWeeks);
      
      const header = ['Category', ...weekHeaders];
      const rows = sorted.map(item => [
        item.category,
        ...weekHeaders.map((_, index) => formatNumber(item[`w${index + 1}`] || 0))
      ]);
      
      const filterInfo = [];
      if (platformReportMonthStart) filterInfo.push(`from_${platformReportMonthStart}`);
      if (platformReportMonthEnd) filterInfo.push(`to_${platformReportMonthEnd}`);
      if (Array.isArray(selectedPlatformReport) && selectedPlatformReport.length > 0) filterInfo.push(`platform_${selectedPlatformReport.join('-')}`);
      
      const file = `weekly_performance_filtered_${filterInfo.join('_')}_${currentData.length}records.xlsx`;
      exportToXlsx(file, [header, ...rows], 'Weekly');
    } finally {
      setDownloadLoading(prev => ({ ...prev, weekly: false }));
    }
  };

  // Generic sort helpers
  const compareValues = (a, b, direction = 'asc') => {
    const aNum = Number(a);
    const bNum = Number(b);
    const aIsNum = Number.isFinite(aNum);
    const bIsNum = Number.isFinite(bNum);

    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;

    let cmp = 0;
    if (aIsNum && bIsNum) {
      cmp = aNum - bNum;
    } else {
      const aStr = String(a).toLowerCase();
      const bStr = String(b).toLowerCase();
      if (aStr > bStr) cmp = 1;
      else if (aStr < bStr) cmp = -1;
      else cmp = 0;
    }
    return direction === 'asc' ? cmp : -cmp;
  };

  const handleSort = (tableKey, columnKey) => {
    setSortState((prev) => {
      const current = prev[tableKey] || { key: null, direction: 'asc' };

      // Cycle through: no sort → asc → desc → no sort
      if (current.key !== columnKey) {
        // Different column clicked, start with asc
        return { ...prev, [tableKey]: { key: columnKey, direction: 'asc' } };
      } else if (current.direction === 'asc') {
        // Same column, was asc, go to desc
        return { ...prev, [tableKey]: { key: columnKey, direction: 'desc' } };
      } else {
        // Same column, was desc, clear sort
        return { ...prev, [tableKey]: { key: null, direction: 'asc' } };
      }
    });
  };

  // Overall Sales Summary sorting removed

  const sortArrow = (tableKey, columnKey) => {
    const s = sortState[tableKey];
    const variant = !s || s.key !== columnKey ? 'default' : (s.direction === 'asc' ? 'asc' : 'desc');
    return <span className={`sort-icon sort-icon--${variant}`} aria-hidden="true" />;
  };

  const setSort = (tableKey, columnKey, direction) => {
    setSortState((prev) => ({ ...prev, [tableKey]: { key: columnKey || null, direction: direction || 'asc' } }));
  };

  const clearSort = (tableKey) => setSortState((prev) => ({ ...prev, [tableKey]: { key: null, direction: 'asc' } }));

  const fetchSalesContribution = async () => {
    // Prevent duplicate API calls
    if (contribFetchingRef.current) {
      console.log('⚠️ SalesContribution API call already in progress, skipping duplicate');
      return;
    }

    try {
      contribFetchingRef.current = true;
      console.log('🔥 API CALL - Fetching SalesContribution data');
      setContribLoading(true);
      setContribError(null);
      const params = {
        page: contribCurrentPage,
        page_size: contribPageSize
      };
      if (contribStartDate) params.start_date = contribStartDate;
      if (contribEndDate) params.end_date = contribEndDate;
      if (selectedContribPlatforms && selectedContribPlatforms.length > 0) {
        params.platforms = selectedContribPlatforms.join(',');
      }
      if (Array.isArray(selectedContribCity) && selectedContribCity.length > 0) params.city = selectedContribCity.join(',');
      if (Array.isArray(selectedContribSupplySource) && selectedContribSupplySource.length > 0) params.supply_source = selectedContribSupplySource.join(',');
      if (Array.isArray(selectedContribManufacturingCities) && selectedContribManufacturingCities.length > 0) params.manufacturing_city = selectedContribManufacturingCities.join(',');
      if (Array.isArray(selectedContribCategory) && selectedContribCategory.length > 0) params.category = selectedContribCategory.join(',');
      if (Array.isArray(selectedContribSubCategory) && selectedContribSubCategory.length > 0) params.sub_category = selectedContribSubCategory.join(',');
      if (Array.isArray(selectedContribBrands) && selectedContribBrands.length > 0) params.brand = selectedContribBrands.join(',');
      const response = await api.get('/sales-contribution/', { params });
      if (response.data.success) {
        setContribData(response.data.data || []);
        setAvailableContribPlatforms(response.data.platforms || []);
        setAvailableContribCities(response.data.cities || []);
        setAvailableContribSupplySources(response.data.supply_sources || []);
        setAvailableContribManufacturingCities(response.data.manufacturing_cities || []);
        setAvailableContribCategories(response.data.categories || []);
        setAvailableContribSubCategories(response.data.sub_categories || []);
        // Brands are now managed by UserBrandsContext
        setContribPagination(response.data.pagination || {});
      } else {
        setContribError(response.data.error || 'Failed to fetch');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setContribError(`Failed to fetch Sales Contribution: ${errorMessage}`);
    } finally {
      setContribLoading(false);
      contribFetchingRef.current = false;
    }
  };

  const fetchInventoryData = async () => {
    try {
      setInventoryLoading(true);
      setInventoryError(null);
      // Use the new snapshot endpoint for Stock Levels tab
      const params = {};
      if (inventoryBrand) params.brand = inventoryBrand;
      if (inventoryPlatform) params.platform = inventoryPlatform;
      if (inventoryWarehouseCity) params.supply_source = inventoryWarehouseCity;
      if (inventoryMinStock) params.min_stock = inventoryMinStock;
      if (inventoryMaxStock) params.max_stock = inventoryMaxStock;
      if (stockQueryDate) params.query_date = stockQueryDate;
      if (stockSort) params.sort = stockSort;

      const response = await api.get('/inventory-stock-snapshot/', { params });
      if (response.data.success) {
        setInventoryData(response.data.data || []);
        setInventoryOptions(response.data.filters || {});
      } else {
        setInventoryError(response.data.error || 'Failed to fetch inventory data');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setInventoryError(`Failed to fetch inventory data: ${errorMessage}`);
    } finally {
      setInventoryLoading(false);
    }
  };

  const fetchDailyReport = async () => {
    try {
      setDailyReportLoading(true);
      setDailyReportError(null);
      const params = {};
      if (dailyReportStartDate) params.start_date = dailyReportStartDate;
      if (dailyReportEndDate) params.end_date = dailyReportEndDate;
      if (Array.isArray(selectedDailyReportPlatform) && selectedDailyReportPlatform.length > 0) params.platform = selectedDailyReportPlatform.join(',');
      else if (typeof selectedDailyReportPlatform === 'string' && selectedDailyReportPlatform) params.platform = selectedDailyReportPlatform;
      if (selectedDailyReportMetric) params.metric = selectedDailyReportMetric;
      if (dailyReportView) params.view = dailyReportView;
      if (Array.isArray(selectedDailyReportBrands) && selectedDailyReportBrands.length > 0) params.brand = selectedDailyReportBrands.join(',');
      if (Array.isArray(selectedDailyReportCities) && selectedDailyReportCities.length > 0) params.city = selectedDailyReportCities.join(',');
      if (Array.isArray(selectedDailyReportSupplySources) && selectedDailyReportSupplySources.length > 0) params.supply_source = selectedDailyReportSupplySources.join(',');
      if (Array.isArray(selectedDailyReportManufacturingCities) && selectedDailyReportManufacturingCities.length > 0) params.manufacturing_city = selectedDailyReportManufacturingCities.join(',');
      if (Array.isArray(selectedDailyReportCategories) && selectedDailyReportCategories.length > 0) params.category = selectedDailyReportCategories.join(',');
      if (Array.isArray(selectedDailyReportSubCategories) && selectedDailyReportSubCategories.length > 0) params.sub_category = selectedDailyReportSubCategories.join(',');
      
      const response = await api.get('/daily-report/', { params });
      if (response.data.success) {
        const tableData = response.data.data || [];
        setDailyReportData(tableData);
        setAvailableDailyReportPlatforms(response.data.platforms || []);
//        const nextBrands = response.data.brands || [];
        const nextBrands = JSON.parse(localStorage.userBrands).Sales || []; // Preserve existing brands
        const nextCities = response.data.cities || [];
        const nextSupply = response.data.supply_sources || [];
        const nextManu = response.data.manufacturing_cities || [];
        const nextCats = response.data.categories || [];
        const nextSubs = response.data.sub_categories || [];

        // Brands are now managed by UserBrandsContext
        setAvailableDailyReportCities(nextCities);
        // Brands are now managed by UserBrandsContext
        setAvailableDailyReportManufacturingCities(nextManu);
        setAvailableDailyReportCategories(nextCats);
        setAvailableDailyReportSubCategories(nextSubs);
        setDailyReportDates(response.data.unique_dates || []);

        // Sanitize selections against refreshed option lists (hard cascading)
        const intersect = (arr, opts) => Array.isArray(arr) ? arr.filter(v => (opts || []).includes(v)) : [];
        const arrayify = (val) => Array.isArray(val) ? val : (val ? [val] : []);
        const platArr = arrayify(selectedDailyReportPlatform);
        const nextPlatArr = intersect(platArr, response.data.platforms || []);
        if (JSON.stringify(nextPlatArr) !== JSON.stringify(platArr)) {
          setSelectedDailyReportPlatform(nextPlatArr.length <= 1 ? (nextPlatArr[0] || '') : nextPlatArr);
        }
        const nextSelectedBrands = intersect(selectedDailyReportBrands, nextBrands);
        if (JSON.stringify(nextSelectedBrands) !== JSON.stringify(selectedDailyReportBrands)) setSelectedDailyReportBrands(nextSelectedBrands);
        const nextSelectedCities = intersect(selectedDailyReportCities, nextCities);
        if (JSON.stringify(nextSelectedCities) !== JSON.stringify(selectedDailyReportCities)) setSelectedDailyReportCities(nextSelectedCities);
        const nextSelectedSupply = intersect(selectedDailyReportSupplySources, nextSupply);
        if (JSON.stringify(nextSelectedSupply) !== JSON.stringify(selectedDailyReportSupplySources)) setSelectedDailyReportSupplySources(nextSelectedSupply);
        const nextSelectedManu = intersect(selectedDailyReportManufacturingCities, nextManu);
        if (JSON.stringify(nextSelectedManu) !== JSON.stringify(selectedDailyReportManufacturingCities)) setSelectedDailyReportManufacturingCities(nextSelectedManu);
        const nextSelectedCats = intersect(selectedDailyReportCategories, nextCats);
        if (JSON.stringify(nextSelectedCats) !== JSON.stringify(selectedDailyReportCategories)) setSelectedDailyReportCategories(nextSelectedCats);
        const nextSelectedSubs = intersect(selectedDailyReportSubCategories, nextSubs);
        if (JSON.stringify(nextSelectedSubs) !== JSON.stringify(selectedDailyReportSubCategories)) setSelectedDailyReportSubCategories(nextSelectedSubs);
        // Initialize pagination
        const totalCount = tableData.length;
        const pageSize = dailyReportPageSize;
        const totalPages = Math.ceil(totalCount / pageSize) || 1;
        setDailyReportPagination({
          current_page: 1,
          page_size: pageSize,
          total_count: totalCount,
          total_pages: totalPages,
          has_previous: false,
          has_next: totalPages > 1,
        });
      } else {
        setDailyReportError(response.data.error || 'Failed to fetch');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setDailyReportError(`Failed to fetch Daily Report: ${errorMessage}`);
    } finally {
      setDailyReportLoading(false);
    }
  };

  const handleDownloadSalesContribution = async () => {
    if (!Array.isArray(contribData) || contribData.length === 0) return;
    setDownloadLoading(prev => ({ ...prev, salesContribution: true }));
    try {
      const s = sortState.salesContribution;
      const sorted = Array.isArray(contribData) ? [...contribData] : [];
      if (s && s.key) sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
      const header = ['Title', 'Platform Item ID', 'GMV', 'Units', 'GMV Contribution %', 'Units Contribution %'];
      const rows = sorted.map(item => [
        item.title,
        item.platform_item_id,
        Number(item.gmv || 0),
        Number(item.units || 0),
        Number(((item.contribution || 0) * 100).toFixed(2)),
        Number(((item.units_contribution || 0) * 100).toFixed(2))
      ]);
      const file = `sales_contribution_${contribStartDate || ''}_${contribEndDate || ''}.xlsx`;
      exportToXlsx(file, [header, ...rows], 'Sales Contribution');
    } finally {
      setDownloadLoading(prev => ({ ...prev, salesContribution: false }));
    }
  };

  const handleDownloadDailyReport = async () => {
    if (!Array.isArray(dailyReportData) || dailyReportData.length === 0) return;
    setDownloadLoading(prev => ({ ...prev, dailyReport: true }));
    try {
      // Determine the identifier column based on view
      const identifierColumn = dailyReportView === 'supply_source' ? 'Supply Source' : (dailyReportView === 'supply_city' ? 'Supply City' : 'Platform Item ID');
      const identifierKey = dailyReportView === 'supply_source' ? 'supply_source' : (dailyReportView === 'supply_city' ? 'supply_city' : 'platform_item_id');
      
      const header = [identifierColumn, ...dailyReportDates.map(date => 
        new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      )];
      
      const rows = dailyReportData.map(item => {
        const row = [item[identifierKey]];
        dailyReportDates.forEach(date => {
          const value = item.dates[date] || 0;
          row.push(value);
        });
        return row;
      });
      
      const file = `daily_report_${dailyReportView}_${selectedDailyReportMetric}_${dailyReportStartDate || ''}_${dailyReportEndDate || ''}.xlsx`;
      exportToXlsx(file, [header, ...rows], 'Daily Report');
    } finally {
      setDownloadLoading(prev => ({ ...prev, dailyReport: false }));
    }
  };

  const handleDownloadInventory = async () => {
    if (!Array.isArray(inventoryData) || inventoryData.length === 0) return;
    setDownloadLoading(prev => ({ ...prev, inventory: true }));
    try {
      const s = sortState.inventory;
      const sorted = Array.isArray(inventoryData) ? [...inventoryData] : [];
      if (s && s.key) sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
      
      const header = [
        'SKU', 'Title', 'Brand', 'Platform', 'Category', 'Sub Category', 'Warehouse City',
        'Stock Quantity', 'Available Quantity', 'Reserved Quantity', 'Unit Cost', 'Total Value',
        'Days of Stock', 'Stock Status', 'Last Updated'
      ];
      
      const rows = sorted.map(item => [
        item.sku,
        item.title,
        item.brand,
        item.platform,
        item.category,
        item.sub_category,
        item.warehouse_city,
        Number(item.stock_quantity || 0),
        Number(item.available_quantity || 0),
        Number(item.reserved_quantity || 0),
        Number(item.unit_cost || 0),
        Number(item.total_value || 0),
        Number(item.days_of_stock || 0),
        item.stock_status,
        item.last_updated ? new Date(item.last_updated).toLocaleDateString() : ''
      ]);
      
      const file = `inventory_stock_levels_${new Date().toISOString().split('T')[0]}.xlsx`;
      exportToXlsx(file, [header, ...rows], 'Inventory Stock Levels');
    } finally {
      setDownloadLoading(prev => ({ ...prev, inventory: false }));
    }
  };

  const onContribPlatformsChange = (e) => {
    const options = Array.from(e.target.selectedOptions || []);
    setSelectedContribPlatforms(options.map(o => o.value));
  };

  const toggleAllContribPlatforms = (selectAll) => {
    if (selectAll) {
      setSelectedContribPlatforms([...availableContribPlatforms]);
    } else {
      setSelectedContribPlatforms([]);
    }
  };

  const isAllPlatformsSelected = selectedContribPlatforms.length === 0 || selectedContribPlatforms.length === availableContribPlatforms.length;
  const filteredContribPlatforms = (availableContribPlatforms || []).filter(p => p && p.toLowerCase().includes(contribSearch.toLowerCase()));

  // Note: fetchUserBrands has been removed - UserBrandsContext handles all brand fetching globally

  const fetchData = async () => {
    try {
      console.log('🌐 API CALL - fetchData() called', {
        endpoint: '/consolidated-data/',
        params: {
          start_date: startDate,
          end_date: endDate,
          brand: selectedBrand
        }
      });
      setLoading(true);
      setError(null);
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (selectedBrand) params.brand = selectedBrand;
      const response = await api.get('/consolidated-data/', { params });
      if (response.data.success) {
        setData(response.data.data);
      } else {
        setError(response.data.error);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setError(`Failed to fetch: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchTargetData = async () => {
    try {
      setTargetLoading(true);
      setTargetError(null); // Clear any previous errors
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (selectedBrand) params.brand = selectedBrand;
      const response = await api.get('/sales-target-data/', { params });
      if (response.data.success) {
        setTargetData(response.data.data);
        setTargetError(null); // Clear error on successful response
      } else {
        setTargetError(response.data.error);
      }
    } catch (err) {
      // Handle authentication errors gracefully
      if (isAuthError(err)) {
        // Don't show error for auth issues, let the interceptor handle it
        console.log('Authentication error in fetchTargetData, handled by interceptor');
      } else {
        // Show detailed backend error if available for non-auth errors
        const errorMessage = err.response?.data?.error || err.message;
        setTargetError(`Failed to fetch target data: ${errorMessage}`);
      }
    } finally {
      setTargetLoading(false);
    }
  };

  const fetchWeeklyData = async () => {
    try {
      console.log('🌐 API CALL - fetchWeeklyData() called', {
        endpoint: '/platform-sales-subcategory-drilldown/',
        view: 'Weekly',
        params: {
          month_start: platformReportMonthStart,
          month_end: platformReportMonthEnd,
          platform: selectedPlatformReport,
          city: selectedPlatformReportCity,
          supply_source: selectedPlatformReportSupplySource,
          category: selectedPlatformReportCategory,
          metric: selectedMetricReport,
          manufacturing_city: selectedPlatformReportManufacturingCity,
          brand: selectedPlatformReportBrands
        },
        timestamp: new Date().toISOString()
      });
      setWeeklyLoading(true);
      setWeeklyError(null);
      
      if (!platformReportMonthStart || !platformReportMonthEnd) {
        setWeeklyError('Month start and end are required');
        return;
      }

      // Calculate the months in the range
      const startDate = new Date(platformReportMonthStart + '-01');
      const endDate = new Date(platformReportMonthEnd + '-01');
      const months = [];
      
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        months.push({
          year: currentDate.getFullYear(),
          month: currentDate.getMonth() + 1
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      
      console.log('Fetching weekly data for months:', months);

      // Fetch data for each month and combine
      const allData = [];
      const categoryMap = new Map();

      for (const { year, month } of months) {
        const params = {
          year,
          month,
          platform: Array.isArray(selectedPlatformReport) && selectedPlatformReport.length > 0 ? selectedPlatformReport.join(',') : undefined,
          city: Array.isArray(selectedPlatformReportCity) && selectedPlatformReportCity.length > 0 ? selectedPlatformReportCity.join(',') : undefined,
          supply_source: Array.isArray(selectedPlatformReportSupplySource) && selectedPlatformReportSupplySource.length > 0 ? selectedPlatformReportSupplySource.join(',') : undefined,
          metric: selectedMetricReport,
          manufacturing_city: Array.isArray(selectedPlatformReportManufacturingCity) && selectedPlatformReportManufacturingCity.length > 0 ? selectedPlatformReportManufacturingCity.join(',') : undefined,
          brand: Array.isArray(selectedPlatformReportBrands) && selectedPlatformReportBrands.length > 0
            ? selectedPlatformReportBrands.join(',') : undefined
        };

        // Remove undefined values
        Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

        const response = await api.get('/sales-performance-weekly/', { params });
        if (response.data.success && response.data.data) {
          // Process each category's data
          response.data.data.forEach(item => {
            if (!categoryMap.has(item.category)) {
              categoryMap.set(item.category, {
                category: item.category,
                weeks: {}
              });
            }
            
            const categoryData = categoryMap.get(item.category);
            // Map w1-w4 to the appropriate week numbers based on month position
            const monthIndex = months.findIndex(m => m.year === year && m.month === month);
            const weekOffset = monthIndex * 4;
            
            if (item.w1 !== undefined) categoryData.weeks[weekOffset + 1] = item.w1;
            if (item.w2 !== undefined) categoryData.weeks[weekOffset + 2] = item.w2;
            if (item.w3 !== undefined) categoryData.weeks[weekOffset + 3] = item.w3;
            if (item.w4 !== undefined) categoryData.weeks[weekOffset + 4] = item.w4;
          });
        }
      }

      // Convert map to array and format for display
      const formattedData = Array.from(categoryMap.values()).map(categoryData => {
        const result = { category: categoryData.category };
        const maxWeeks = Math.max(...Object.keys(categoryData.weeks).map(Number));
        
        for (let i = 1; i <= maxWeeks; i++) {
          result[`w${i}`] = categoryData.weeks[i] || 0;
        }
        
        return result;
      });

      console.log('Formatted weekly data:', formattedData);
      setWeeklyData(formattedData);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setWeeklyError(`Failed to fetch Weekly data: ${errorMessage}`);
    } finally {
      setWeeklyLoading(false);
    }
  };

  const fetchMonthlyData = async () => {
    try {
      console.log('🌐 API CALL - fetchMonthlyData() called', {
        endpoint: '/platform-sales-subcategory-drilldown/',
        view: 'Monthly',
        params: {
          month_start: platformReportMonthStart,
          month_end: platformReportMonthEnd,
          platform: selectedPlatformReport,
          city: selectedPlatformReportCity,
          supply_source: selectedPlatformReportSupplySource,
          category: selectedPlatformReportCategory,
          metric: selectedMetricReport,
          manufacturing_city: selectedPlatformReportManufacturingCity,
          brand: selectedPlatformReportBrands
        },
        timestamp: new Date().toISOString()
      });
      setMonthlyLoading(true);
      setMonthlyError(null);
      
      if (!platformReportMonthStart || !platformReportMonthEnd) {
        setMonthlyError('Month start and end are required');
        return;
      }

      // Calculate the months in the range
      const startDate = new Date(platformReportMonthStart + '-01');
      const endDate = new Date(platformReportMonthEnd + '-01');
      const months = [];
      
      let currentDate = new Date(startDate);
      const targetEndDate = new Date(endDate);
      targetEndDate.setMonth(targetEndDate.getMonth() + 1); // Include the end month
      
      while (currentDate < targetEndDate) {
        months.push({
          year: currentDate.getFullYear(),
          month: currentDate.getMonth() + 1,
          name: currentDate.toLocaleString('default', { month: 'short' }).toLowerCase()
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      
      console.log('Fetching monthly data for months:', months);

      // Fetch data for each month and combine
      const categoryMap = new Map();

      for (const { year, month, name } of months) {
        const params = {
          year,
          month,
          platform: selectedPlatformReport,
          city: selectedPlatformReportCity,
          supply_source: selectedPlatformReportSupplySource,
          category: selectedPlatformReportCategory,
          metric: selectedMetricReport,
          manufacturing_city: selectedPlatformReportManufacturingCity,
          brand: Array.isArray(selectedPlatformReportBrands) && selectedPlatformReportBrands.length > 0 
            ? selectedPlatformReportBrands.join(',') : undefined
        };

        // Remove undefined values
        Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

        console.log(`API call for ${name} (${year}-${month}):`, params);
        const response = await api.get('/sales-performance-weekly/', { params });
        console.log(`API response for ${name} (${year}-${month}):`, response.data);
        
        if (response.data.success && response.data.data) {
          console.log(`Data for ${name} (${year}-${month}):`, response.data.data.length, 'items');
          // Process each category's data and sum up all weeks for the month
          response.data.data.forEach(item => {
            if (!categoryMap.has(item.category)) {
              categoryMap.set(item.category, {
                category: item.category,
                months: {}
              });
            }
            
            const categoryData = categoryMap.get(item.category);
            // Sum all weeks for this month
            const monthlyTotal = (item.w1 || 0) + (item.w2 || 0) + (item.w3 || 0) + (item.w4 || 0);
            categoryData.months[`month_${name}`] = monthlyTotal;
            console.log(`Category ${item.category} for ${name}: ${monthlyTotal}`);
          });
        } else {
          console.log(`No data for ${name} (${year}-${month}) - Success: ${response.data.success}, Data:`, response.data.data);
        }
      }

      // Convert map to array and format for display
      const formattedData = Array.from(categoryMap.values()).map(categoryData => {
        const result = { category: categoryData.category };
        
        // Get all unique month keys from all categories
        const allMonthKeys = new Set();
        Array.from(categoryMap.values()).forEach(cat => {
          Object.keys(cat.months).forEach(monthKey => allMonthKeys.add(monthKey));
        });
        
        // Add all month data, setting 0 for missing months
        Array.from(allMonthKeys).forEach(monthKey => {
          result[monthKey] = categoryData.months[monthKey] || 0;
        });
        
        return result;
      });

      console.log('Formatted monthly data:', formattedData);
      setMonthlyData(formattedData);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setMonthlyError(`Failed to fetch Monthly data: ${errorMessage}`);
    } finally {
      setMonthlyLoading(false);
    }
  };

  const fetchAllMonthlyData = async () => {
    try {
      if (!platformReportMonthStart || !platformReportMonthEnd) {
        return [];
      }

      // Calculate the months in the range
      const startDate = new Date(platformReportMonthStart + '-01');
      const endDate = new Date(platformReportMonthEnd + '-01');
      const months = [];
      
      let currentDate = new Date(startDate);
      const targetEndDate = new Date(endDate);
      targetEndDate.setMonth(targetEndDate.getMonth() + 1); // Include the end month
      
      while (currentDate < targetEndDate) {
        months.push({
          year: currentDate.getFullYear(),
          month: currentDate.getMonth() + 1,
          name: currentDate.toLocaleString('default', { month: 'short' }).toLowerCase()
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      // Fetch data for each month and combine
      const categoryMap = new Map();

      for (const { year, month, name } of months) {
        const params = {
          year,
          month,
          platform: selectedPlatformReport,
          city: selectedPlatformReportCity,
          supply_source: selectedPlatformReportSupplySource,
          metric: selectedMetricReport,
          manufacturing_city: selectedPlatformReportManufacturingCity,
          brand: Array.isArray(selectedPlatformReportBrands) && selectedPlatformReportBrands.length > 0 
            ? selectedPlatformReportBrands.join(',') : undefined
        };

        // Remove undefined values
        Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

        const response = await api.get('/sales-performance-weekly/', { params });
        if (response.data.success && response.data.data) {
          // Process each category's data and sum up all weeks for the month
          response.data.data.forEach(item => {
            if (!categoryMap.has(item.category)) {
              categoryMap.set(item.category, {
                category: item.category,
                months: {}
              });
            }
            
            const categoryData = categoryMap.get(item.category);
            // Sum all weeks for this month
            const monthlyTotal = (item.w1 || 0) + (item.w2 || 0) + (item.w3 || 0) + (item.w4 || 0);
            categoryData.months[`month_${name}`] = monthlyTotal;
          });
        }
      }

      // Convert map to array and format for display
      const formattedData = Array.from(categoryMap.values()).map(categoryData => {
        const result = { category: categoryData.category };
        
        // Get all unique month keys from all categories
        const allMonthKeys = new Set();
        Array.from(categoryMap.values()).forEach(cat => {
          Object.keys(cat.months).forEach(monthKey => allMonthKeys.add(monthKey));
        });
        
        // Add all month data, setting 0 for missing months
        Array.from(allMonthKeys).forEach(monthKey => {
          result[monthKey] = categoryData.months[monthKey] || 0;
        });
        
        return result;
      });

      return formattedData;
    } catch (err) {
      console.error('Failed to fetch all Monthly data:', err);
      return [];
    }
  };

  const handleDownloadMonthly = async () => {
    setDownloadLoading(prev => ({ ...prev, monthly: true }));
    try {
      // Use current filtered data instead of fetching all data
      const currentData = Array.isArray(monthlyData) ? [...monthlyData] : [];
      
      if (currentData.length === 0) {
        console.log('No monthly data to export');
        return;
      }
      
      console.log(`Exporting ${currentData.length} filtered Monthly records`);
      
      const s = sortState.monthly;
      const sorted = [...currentData];
      if (s && s.key) sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
      
      // Get month columns dynamically
      const monthColumns = sorted.length > 0 ? Object.keys(sorted[0]).filter(key => key.startsWith('month_')) : [];
      const header = ['Category', ...monthColumns.map(col => col.replace('month_', '').charAt(0).toUpperCase() + col.replace('month_', '').slice(1))];
      const rows = sorted.map(item => [
        item.category,
        ...monthColumns.map(col => formatNumber(item[col] || 0))
      ]);
      
      const filterInfo = [];
      if (platformReportMonthStart) filterInfo.push(`from_${platformReportMonthStart}`);
      if (platformReportMonthEnd) filterInfo.push(`to_${platformReportMonthEnd}`);
      if (Array.isArray(selectedPlatformReport) && selectedPlatformReport.length > 0) filterInfo.push(`platform_${selectedPlatformReport.join('-')}`);
      
      const file = `monthly_performance_filtered_${filterInfo.join('_')}_${currentData.length}records.xlsx`;
      exportToXlsx(file, [header, ...rows], 'Monthly');
    } finally {
      setDownloadLoading(prev => ({ ...prev, monthly: false }));
    }
  };

  const fetchDrrData = async () => {
    try {
      setDrrLoading(true);
      setDrrError(null);
      const params = {
        page: currentPage,
        page_size: pageSize
      };
      if (drrStartDate) params.start_date = drrStartDate;
      if (drrEndDate) params.end_date = drrEndDate;
      if (selectedDrrPlatforms && selectedDrrPlatforms.length > 0) params.platform = selectedDrrPlatforms.join(',');
      if (selectedDrrCities && selectedDrrCities.length > 0) params.city = selectedDrrCities.join(',');
      if (selectedDrrSupplySources && selectedDrrSupplySources.length > 0) params.supply_source = selectedDrrSupplySources.join(',');
      if (selectedDrrManufacturingCities && selectedDrrManufacturingCities.length > 0) params.manufacturing_city = selectedDrrManufacturingCities.join(',');
      if (selectedDrrCategories && selectedDrrCategories.length > 0) params.category = selectedDrrCategories.join(',');
      if (selectedDrrSubCategories && selectedDrrSubCategories.length > 0) params.sub_category = selectedDrrSubCategories.join(',');
      if (selectedDrrBrands && selectedDrrBrands.length > 0) params.brand = selectedDrrBrands.join(',');
      
      const response = await api.get('/drr-report/', { params });
      if (response.data.success) {
        console.log('DRR API Response:', response.data);
        console.log('Sub-categories received:', response.data.sub_categories);
        setDrrData(response.data.data);
        setAvailablePlatforms(response.data.platforms || []);
        setAvailableCities(response.data.cities || []);
        setAvailableSupplySources(response.data.supply_sources || []);
        setAvailableManufacturingCities(response.data.manufacturing_cities || []);
        setAvailableCategories(response.data.categories || []);
        setAvailableSubCategories(response.data.sub_categories || []);
//        setAvailableBrands(response.data.brands || []);
        setPagination(response.data.pagination || {});
      } else {
        setDrrError(response.data.error);
      }
    } catch (err) {
      // Show detailed backend error if available
      const errorMessage = err.response?.data?.error || err.message;
      setDrrError(`Failed to fetch DRR data: ${errorMessage}`);
    } finally {
      setDrrLoading(false);
    }
  };

  const fetchPlatformSummaryData = async () => {
    try {
      console.log('🌐 API CALL - fetchPlatformSummaryData() called', {
        endpoint: '/platform-sales-summary/',
        params: {
          start_date: platformSummaryStartDate,
          end_date: platformSummaryEndDate,
          platform: selectedPlatformSummary,
          city: selectedPlatformSummaryCity,
          supply_source: selectedPlatformSummarySupplySource,
          category: selectedPlatformSummaryCategory,
          manufacturing_city: selectedPlatformSummaryManufacturingCity,
          brand: selectedPlatformSummaryBrands
        },
        timestamp: new Date().toISOString()
      });
      setPlatformSummaryLoading(true);
      setPlatformSummaryError(null);
      const params = {};
      if (platformSummaryStartDate) params.start_date = platformSummaryStartDate;
      if (platformSummaryEndDate) params.end_date = platformSummaryEndDate;
      if (Array.isArray(selectedPlatformSummary) && selectedPlatformSummary.length > 0) params.platform = selectedPlatformSummary.join(',');
      if (Array.isArray(selectedPlatformSummaryCity) && selectedPlatformSummaryCity.length > 0) params.city = selectedPlatformSummaryCity.join(',');
      if (Array.isArray(selectedPlatformSummarySupplySource) && selectedPlatformSummarySupplySource.length > 0) params.supply_source = selectedPlatformSummarySupplySource.join(',');
      if (Array.isArray(selectedPlatformSummaryCategory) && selectedPlatformSummaryCategory.length > 0) params.category = selectedPlatformSummaryCategory.join(',');
      if (Array.isArray(selectedPlatformSummaryManufacturingCity) && selectedPlatformSummaryManufacturingCity.length > 0) params.manufacturing_city = selectedPlatformSummaryManufacturingCity.join(',');
      if (Array.isArray(selectedPlatformSummaryBrands) && selectedPlatformSummaryBrands.length > 0) params.brand = selectedPlatformSummaryBrands.join(',');
      
      const response = await api.get('/platform-sales-summary/', { params });
      if (response.data.success) {
        setPlatformSummaryData(response.data.data);
        setAvailablePlatformsSummary(response.data.platforms || []);
        setAvailablePlatformSummaryCities(response.data.cities || []);
        setAvailablePlatformSummarySupplySources(response.data.supply_sources || []);
        setAvailablePlatformSummaryCategories(response.data.categories || []);
//        setAvailableBrands(response.data.brands || []);
        setAvailablePlatformSummaryManufacturingCities(response.data.manufacturing_cities || []);
      } else {
        setPlatformSummaryError(response.data.error);
      }
    } catch (err) {
      // Show detailed backend error if available
      const errorMessage = err.response?.data?.error || err.message;
      setPlatformSummaryError(`Failed to fetch Platform Sales Summary data: ${errorMessage}`);
    } finally {
      setPlatformSummaryLoading(false);
    }
  };

  const handleCategoryDrilldown = async (category) => {
    try {
      setDrilldownLoading(true);
      setDrilldownError(null);
      setSelectedCategoryForDrilldown(category);
      
      // Normalize filters: the backend endpoint expects single values for equality checks.
      // If multiple are selected, omit the param to represent "all" instead of sending comma-joined values.
      const normalizedPlatform = Array.isArray(selectedPlatformSummary)
        ? (selectedPlatformSummary.length === 1 ? selectedPlatformSummary[0] : undefined)
        : selectedPlatformSummary || undefined;
      const normalizedCity = Array.isArray(selectedPlatformSummaryCity)
        ? (selectedPlatformSummaryCity.length === 1 ? selectedPlatformSummaryCity[0] : undefined)
        : selectedPlatformSummaryCity || undefined;
      const normalizedSupply = Array.isArray(selectedPlatformSummarySupplySource)
        ? (selectedPlatformSummarySupplySource.length === 1 ? selectedPlatformSummarySupplySource[0] : undefined)
        : selectedPlatformSummarySupplySource || undefined;
      const normalizedBrand = (() => {
        if (Array.isArray(selectedPlatformSummaryBrands)) {
          return selectedPlatformSummaryBrands.length === 1 ? selectedPlatformSummaryBrands[0] : undefined;
        }
        if (Array.isArray(selectedBrand)) {
          return selectedBrand.length === 1 ? selectedBrand[0] : undefined;
        }
        return selectedBrand || undefined;
      })();

      const filters = {
        startDate: platformSummaryStartDate,
        endDate: platformSummaryEndDate,
        platform: normalizedPlatform,
        city: normalizedCity,
        supply_source: normalizedSupply,
        brand: normalizedBrand,
        category: category
      };
      
      console.log('Drill-down filters being sent:', filters);
      console.log('Selected platform summary brands:', selectedPlatformSummaryBrands);
      console.log('Selected brand:', selectedBrand);
      
      const response = await fetchPlatformSalesSubcategoryDrilldown(filters);
      
      console.log('Drill-down API response:', response);
      
      if (response.success) {
        setDrilldownData(response.data);
        setIsDrilldownView(true);
      } else {
        setDrilldownError(response.error);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setDrilldownError(`Failed to fetch subcategory data: ${errorMessage}`);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const handleBackToCategories = () => {
    setIsDrilldownView(false);
    setDrilldownData([]);
    setSelectedCategoryForDrilldown('');
    setDrilldownError(null);
  };

  const fetchPlatformsForReport = async () => {
    try {
      // Reuse an existing endpoint that returns platforms list
      const response = await api.get('/platform-sales-summary/');
      setAvailablePlatformsReport(response.data.platforms || []);
    } catch (err) {
      // Non-blocking
    }
  };

  const fetchFilterOptionsForReport = async (filters = {}) => {
    try {
      const params = {
        month_start: platformReportMonthStart,
        month_end: platformReportMonthEnd,
        ...filters
      };
      
      // Remove undefined values
      Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
      // Normalize array values into comma-separated strings for API
      ['platform','city','supply_source','manufacturing_city','category','brand'].forEach((k) => {
        const v = params[k];
        if (Array.isArray(v)) {
          params[k] = v.length > 0 ? v.join(',') : undefined;
        }
      });
      
      // Try the new endpoint first, fallback to existing endpoint if not available
      try {
        const response = await api.get('/platform-sales-report-options/', { params });
        if (response.data?.success) {
          const options = response.data.options || {};
          if (options.cities) setAvailablePlatformReportCities(options.cities);
          if (options.supply_sources) setAvailablePlatformReportSupplySources(options.supply_sources);
          if (options.manufacturing_cities) setAvailablePlatformReportManufacturingCities(options.manufacturing_cities);
          if (options.categories) setAvailablePlatformReportCategories(options.categories);
          return;
        }
      } catch (endpointErr) {
        console.log('New filter options endpoint not available, trying fallback...');
      }
      
      // Fallback: try to get options from existing platform report endpoint
      const fallbackResponse = await api.get('/platform-sales-report/', { params });
      if (fallbackResponse.data?.success) {
        const data = fallbackResponse.data;
        if (data.cities) setAvailablePlatformReportCities(data.cities);
        if (data.supply_sources) setAvailablePlatformReportSupplySources(data.supply_sources);
        if (data.manufacturing_cities) setAvailablePlatformReportManufacturingCities(data.manufacturing_cities);
        if (data.categories) setAvailablePlatformReportCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to fetch filter options:', err);
    }
  };

  const fetchPlatformReportData = async () => {
    try {
      console.log('🌐 API CALL - fetchPlatformReportData() called', {
        endpoint: '/platform-sales-subcategory-drilldown/',
        view: 'Target',
        params: {
          month_start: platformReportMonthStart,
          month_end: platformReportMonthEnd,
          platform: selectedPlatformReport,
          city: selectedPlatformReportCity,
          supply_source: selectedPlatformReportSupplySource,
          category: selectedPlatformReportCategory,
          metric: selectedMetricReport,
          manufacturing_city: selectedPlatformReportManufacturingCity,
          brand: selectedPlatformReportBrands
        },
        timestamp: new Date().toISOString()
      });
      setPlatformReportLoading(true);
      setPlatformReportError(null);
      const params = {};
      if (platformReportMonthStart) params.month_start = platformReportMonthStart;
      if (platformReportMonthEnd) params.month_end = platformReportMonthEnd;
      if (Array.isArray(selectedPlatformReport) && selectedPlatformReport.length > 0) params.platform = selectedPlatformReport.join(',');
      if (Array.isArray(selectedPlatformReportCity) && selectedPlatformReportCity.length > 0) params.city = selectedPlatformReportCity.join(',');
      if (Array.isArray(selectedPlatformReportSupplySource) && selectedPlatformReportSupplySource.length > 0) params.supply_source = selectedPlatformReportSupplySource.join(',');
      if (Array.isArray(selectedPlatformReportCategory) && selectedPlatformReportCategory.length > 0) params.category = selectedPlatformReportCategory.join(',');
      if (selectedMetricReport) params.metric = selectedMetricReport;
      if (Array.isArray(selectedPlatformReportManufacturingCity) && selectedPlatformReportManufacturingCity.length > 0) params.manufacturing_city = selectedPlatformReportManufacturingCity.join(',');
      if (Array.isArray(selectedPlatformReportBrands) && selectedPlatformReportBrands.length > 0) params.brand = selectedPlatformReportBrands.join(',');

      const response = await api.get('/platform-sales-report/', { params });
      if (response.data.success) {
        setPlatformReportData(response.data.data);
        if (Array.isArray(response.data.platforms)) {
          setAvailablePlatformsReport(response.data.platforms);
        }
        // Also populate filter options if they're available
        if (Array.isArray(response.data.cities)) {
          setAvailablePlatformReportCities(response.data.cities);
        }
        if (Array.isArray(response.data.supply_sources)) {
          setAvailablePlatformReportSupplySources(response.data.supply_sources);
        }
        if (Array.isArray(response.data.manufacturing_cities)) {
          setAvailablePlatformReportManufacturingCities(response.data.manufacturing_cities);
        }
        if (Array.isArray(response.data.categories)) {
          setAvailablePlatformReportCategories(response.data.categories);
        }
        if (Array.isArray(response.data.brands)) {
//          setAvailableBrands(response.data.brands);
        }
      } else {
        setPlatformReportError(response.data.error || 'Failed to fetch');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setPlatformReportError(`Failed to fetch Sales Performance data: ${errorMessage}`);
    } finally {
      setPlatformReportLoading(false);
    }
  };

  // Overall summary tables moved to component

  const renderDrrTable = () => {
    if (drrData.length === 0) return <p>No data available</p>;

    const s = sortState.drr;
    const sorted = Array.isArray(drrData) ? [...drrData] : [];
    if (s && s.key) {
      sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
    }

    return (
      <div>
        <div className="table-container">
          {/* Sorting controls removed as requested */}
          <table className="data-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('drr', 'platform_item_id')} style={{ cursor: 'pointer' }}>Platform Item ID{sortArrow('drr', 'platform_item_id')}</th>
                <th onClick={() => handleSort('drr', 'title')} style={{ cursor: 'pointer' }}>Title{sortArrow('drr', 'title')}</th>
                <th onClick={() => handleSort('drr', 'platform')} style={{ cursor: 'pointer' }}>Platform{sortArrow('drr', 'platform')}</th>
                <th onClick={() => handleSort('drr', 'drr')} style={{ cursor: 'pointer' }}>DRR{sortArrow('drr', 'drr')}</th>
                <th onClick={() => handleSort('drr', 'last_7_days_drr')} style={{ cursor: 'pointer' }}>Last 7 Days DRR{sortArrow('drr', 'last_7_days_drr')}</th>
                <th onClick={() => handleSort('drr', 'total_gmv')} style={{ cursor: 'pointer' }}>GMV{sortArrow('drr', 'total_gmv')}</th>
                <th onClick={() => handleSort('drr', 'total_units')} style={{ cursor: 'pointer' }}>Units{sortArrow('drr', 'total_units')}</th>
                <th>Remark</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, index) => (
                <tr key={index}>
                  <td>{item.platform_item_id}</td>
                  <td>{item.title}</td>
                  <td>{item.platform}</td>
                  <td>{formatNumber(item.drr || 0)}</td>
                  <td>{formatNumber(item.last_7_days_drr || 0)}</td>
                  <td>{formatNumber(item.total_gmv || 0)}</td>
                  <td>{formatNumber(item.total_units || 0)}</td>
                  <td>{item.last_7_days_drr > item.drr ? 'Growing' : 'Need Attention'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="pagination-container">
          <div className="pagination-info">
            Showing {((pagination.current_page - 1) * pagination.page_size) + 1} to {Math.min(pagination.current_page * pagination.page_size, pagination.total_count)} of {pagination.total_count} entries
          </div>
          
          <div className="pagination-controls">
            <div className="page-size-selector">
              <label htmlFor="page-size">Show:</label>
              <select 
                id="page-size"
                value={pageSize} 
                onChange={(e) => setPageSize(parseInt(e.target.value))}
                className="page-size-select"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>per page</span>
            </div>
            
            <div className="pagination-buttons">
              <button 
                onClick={() => setCurrentPage(1)} 
                disabled={!pagination.has_previous}
                className="pagination-btn"
              >
                First
              </button>
              <button 
                onClick={() => setCurrentPage(currentPage - 1)} 
                disabled={!pagination.has_previous}
                className="pagination-btn"
              >
                Previous
              </button>
              
              <span className="page-info">
                Page {pagination.current_page} of {pagination.total_pages}
              </span>
              
              <button 
                onClick={() => setCurrentPage(currentPage + 1)} 
                disabled={!pagination.has_next}
                className="pagination-btn"
              >
                Next
              </button>
              <button 
                onClick={() => setCurrentPage(pagination.total_pages)} 
                disabled={!pagination.has_next}
                className="pagination-btn"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPlatformSummaryTable = () => {
    if (platformSummaryData.length === 0) return <p>No data available</p>;

    const s = sortState.platformSummary;
    const sorted = Array.isArray(platformSummaryData) ? [...platformSummaryData] : [];
    if (s && s.key) {
      sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
    }

    return (
      <div className="table-container">
        {/* Sorting controls removed as requested */}
        <table className="platform-summary-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('platformSummary', 'category')} style={{ cursor: 'pointer' }}>Category{sortArrow('platformSummary', 'category')}</th>
              <th onClick={() => handleSort('platformSummary', 'drr')} style={{ cursor: 'pointer' }}>DRR{sortArrow('platformSummary', 'drr')}</th>
              <th onClick={() => handleSort('platformSummary', 'last_7_days_avg')} style={{ cursor: 'pointer' }}>Last 7 days Avg{sortArrow('platformSummary', 'last_7_days_avg')}</th>
              <th onClick={() => handleSort('platformSummary', 'total_gmv')} style={{ cursor: 'pointer' }}>GMV{sortArrow('platformSummary', 'total_gmv')}</th>
              <th onClick={() => handleSort('platformSummary', 'total_units')} style={{ cursor: 'pointer' }}>Units{sortArrow('platformSummary', 'total_units')}</th>
              <th onClick={() => handleSort('platformSummary', 'asp')} style={{ cursor: 'pointer' }}>ASP{sortArrow('platformSummary', 'asp')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, index) => (
              <tr key={index}>
                <td className="category-cell">{item.category}</td>
                <td>{formatNumber(item.drr || 0)}</td>
                <td>{formatNumber(item.last_7_days_avg || 0)}</td>
                <td>{formatNumber(item.total_gmv || 0)}</td>
                <td>{formatNumber(item.total_units || 0)}</td>
                <td>{formatNumber(item.asp || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPlatformReportTable = () => {
    if (platformReportData.length === 0) return <p>No data available</p>;

    const s = sortState.platformReport;
    const sorted = Array.isArray(platformReportData) ? [...platformReportData] : [];
    if (s && s.key) {
      sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
    }

    const formatPercent = (num) => {
      if (num === null || num === undefined) return '—';
      return `${Number(num).toFixed(2)}%`;
    };

    return (
      <div className="table-container">
        {/* Sorting controls removed as requested */}
        <table className="platform-summary-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('platformReport', 'category')} style={{ cursor: 'pointer' }}>Category{sortArrow('platformReport', 'category')}</th>
              <th onClick={() => handleSort('platformReport', 'current')} style={{ cursor: 'pointer' }}>Current{sortArrow('platformReport', 'current')}</th>
              <th onClick={() => handleSort('platformReport', 'target')} style={{ cursor: 'pointer' }}>Target{sortArrow('platformReport', 'target')}</th>
              <th onClick={() => handleSort('platformReport', 'projected')} style={{ cursor: 'pointer' }}>Projected{sortArrow('platformReport', 'projected')}</th>
              <th onClick={() => handleSort('platformReport', 'attainment')} style={{ cursor: 'pointer' }}>Attainment{sortArrow('platformReport', 'attainment')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, index) => (
              <tr key={index}>
                <td className="category-cell">{item.category}</td>
                <td>{formatNumber(item.current)}</td>
                <td>{formatNumber(item.target)}</td>
                <td>{formatNumber(item.projected)}</td>
                <td>{formatPercent(item.attainment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderWeeklyTable = () => {
    if (weeklyData.length === 0) return <p>No data available</p>;

    const s = sortState.weekly;
    const sorted = Array.isArray(weeklyData) ? [...weeklyData] : [];
    if (s && s.key) {
      sorted.sort((a, b) => compareValues(a[s.key], b[s.key], s.direction));
    }

    return (
      <div className="table-container">
        {/* Sorting controls removed as requested */}
        <table className="platform-summary-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('weekly', 'category')} style={{ cursor: 'pointer' }}>Category{sortArrow('weekly', 'category')}</th>
              <th onClick={() => handleSort('weekly', 'w1')} style={{ cursor: 'pointer' }}>W1{sortArrow('weekly', 'w1')}</th>
              <th onClick={() => handleSort('weekly', 'w2')} style={{ cursor: 'pointer' }}>W2{sortArrow('weekly', 'w2')}</th>
              <th onClick={() => handleSort('weekly', 'w3')} style={{ cursor: 'pointer' }}>W3{sortArrow('weekly', 'w3')}</th>
              <th onClick={() => handleSort('weekly', 'w4')} style={{ cursor: 'pointer' }}>W4{sortArrow('weekly', 'w4')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, index) => (
              <tr key={index}>
                <td className="category-cell">{item.category}</td>
                <td>{formatNumber(item.w1)}</td>
                <td>{formatNumber(item.w2)}</td>
                <td>{formatNumber(item.w3)}</td>
                <td>{formatNumber(item.w4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderDailyReportTable = () => {
    if (dailyReportData.length === 0) return <p>No data available</p>;

    // Client-side pagination
    const { current_page, page_size } = dailyReportPagination;
    const startIdx = (current_page - 1) * page_size;
    const endIdx = startIdx + page_size;
    const pageItems = dailyReportData.slice(startIdx, endIdx);

    // Set CSS custom property for date count
    const dateCount = dailyReportDates.length;
    const tableStyle = {
      '--date-count': dateCount
    };

    // Determine the identifier column based on view
    const identifierColumn = dailyReportView === 'supply_source' ? 'Supply Source' : (dailyReportView === 'supply_city' ? 'Supply City' : 'Platform Item ID');
    const identifierKey = dailyReportView === 'supply_source' ? 'supply_source' : (dailyReportView === 'supply_city' ? 'supply_city' : 'platform_item_id');

    return (
      <div className="table-container">
        <div className="daily-report-table-wrapper">
          <h3 className="metric-title">
            Showing {selectedDailyReportMetric.toUpperCase()} Data by {identifierColumn}
          </h3>
          <table className="daily-report-table" style={tableStyle}>
            <thead>
              <tr>
                <th className="sticky-column">{identifierColumn}</th>
                {dailyReportDates.map((date, index) => (
                  <th key={index} className="date-column">
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item, idx) => (
                <tr key={idx}>
                  <td 
                    className="sticky-column platform-item-cell"
                    title={item[identifierKey]}
                  >
                    {item[identifierKey]}
                  </td>
                  {dailyReportDates.map((date, dateIndex) => {
                    const value = item.dates[date] || 0;
                    return (
                      <td key={dateIndex} className="metric-cell">
                        {formatNumber(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const onAuthChange = (e) => setAuthForm({ ...authForm, [e.target.name]: e.target.value });

  const doLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await axios.post(`${apiBaseURL}auth/login/`, {
        username: authForm.username,
        password: authForm.password,
      });
      if (res.data.success && res.data.token) {
        localStorage.setItem('token', res.data.token);
        setAuthToken(res.data.token);
      } else {
        setAuthError(res.data.error || 'Login failed');
      }
    } catch (err) {
      setAuthError(err.response?.data?.error || err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const doSignup = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await axios.post(`${apiBaseURL}auth/signup/`, {
        username: authForm.username,
        password: authForm.password,
        email: authForm.email,
        full_name: authForm.full_name,
      });
      if (res.data.success && res.data.token) {
        localStorage.setItem('token', res.data.token);
        setAuthToken(res.data.token);
      } else {
        setAuthError(res.data.error || 'Signup failed');
      }
    } catch (err) {
      setAuthError(err.response?.data?.error || err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userBrands');
    setAuthToken('');
  };

  if (!authToken) {
    return (
      <ThemeProvider>
        <div className="App">
          <header className="App-header">
            <div className="header-content">
              <h1>NuvrOS</h1>
              <p>Please {authView === 'login' ? 'sign in' : 'sign up'} to continue</p>
            </div>
            <div className="header-actions">
              <ThemeToggle />
            </div>
          </header>
          <main className="App-main">
            <AuthCard
              authView={authView}
              setAuthView={setAuthView}
              authError={authError}
              authLoading={authLoading}
              authForm={authForm}
              onAuthChange={onAuthChange}
              onLogin={doLogin}
              onSignup={doSignup}
            />
          </main>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="App">
        <Header tokenRefreshed={tokenRefreshed}>
          <ThemeToggle />
        </Header>

      <main className="App-main">
        <div className="layout">
          <Sidebar
            modules={modules}
            activeModule={activeModule}
            setActiveModule={setActiveModule}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            expandedModules={expandedModules}
            toggleModuleExpansion={toggleModuleExpansion}
            onLogout={logout}
          />
          <div className="content">
            {activeTab === 'overall' ? (
              <OverallSummary
                data={data}
                targetData={targetData}
                totalGrowthRate={totalGrowthRate}
                totalCitiesLiveOverall={totalCitiesLiveOverall}
                totalArticlesOverall={totalArticlesOverall}
                loading={loading}
                error={error}
                targetLoading={targetLoading}
                targetError={targetError}
                startDate={startDate}
                endDate={endDate}
                setStartDate={setStartDate}
                setEndDate={setEndDate}
                onRefresh={fetchData}
                onRefreshTargets={fetchTargetData}
                onDownload={handleDownloadSalesSummary}
                isDownloading={downloadLoading.salesSummary}
              />
            ) : activeTab === 'drr' ? (
              <DRRReport
                data={drrData}
                loading={drrLoading}
                error={drrError}
                pagination={pagination}
                pageSize={pageSize}
                setPageSize={(v) => setPageSize(v)}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                sortState={sortState.drr}
                onSort={(key) => handleSort('drr', key)}
                sortArrow={(key) => sortArrow('drr', key)}
                filters={{
                  startDate: drrStartDate,
                  endDate: drrEndDate,
                  platform: selectedDrrPlatforms,
                  city: selectedDrrCities,
                  supply_source: selectedDrrSupplySources,
                  manufacturing_city: selectedDrrManufacturingCities,
                  category: selectedDrrCategories,
                  sub_category: selectedDrrSubCategories,
                  brand: selectedDrrBrands,
                }}
                options={{
                  platforms: availablePlatforms,
                  cities: availableCities,
                  supply_sources: availableSupplySources,
                  manufacturing_cities: availableManufacturingCities,
                  categories: availableCategories,
                  sub_categories: availableSubCategories,
                }}
                onChangeFilters={(next) => {
                  // Comprehensive cascading filter logic for DRR Report (multi-select arrays)
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) {
                    setDrrStartDate(next.startDate);
                  }
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) {
                    setDrrEndDate(next.endDate);
                  }

                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) {
                    const newBrands = Array.isArray(next.brand) ? next.brand : [];
                    const changed = JSON.stringify(newBrands) !== JSON.stringify(selectedDrrBrands);
                    setSelectedDrrBrands(newBrands);
                    if (changed) {
                      setSelectedDrrPlatforms([]);
                      setSelectedDrrCities([]);
                      setSelectedDrrSupplySources([]);
                      setSelectedDrrManufacturingCities([]);
                      setSelectedDrrCategories([]);
                      setSelectedDrrSubCategories([]);
                    }
                  }

                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) {
                    const newPlatforms = Array.isArray(next.platform) ? next.platform : [];
                    const changed = JSON.stringify(newPlatforms) !== JSON.stringify(selectedDrrPlatforms);
                    setSelectedDrrPlatforms(newPlatforms);
                    if (changed) {
                      setSelectedDrrCategories([]);
                      setSelectedDrrSubCategories([]);
                    }
                  }

                  if (Object.prototype.hasOwnProperty.call(next, 'city')) {
                    const newCities = Array.isArray(next.city) ? next.city : [];
                    const changed = JSON.stringify(newCities) !== JSON.stringify(selectedDrrCities);
                    setSelectedDrrCities(newCities);
                    if (changed) {
                      setSelectedDrrSupplySources([]);
                      setSelectedDrrManufacturingCities([]);
                    }
                  }

                  if (Object.prototype.hasOwnProperty.call(next, 'supply_source')) {
                    const newSupplies = Array.isArray(next.supply_source) ? next.supply_source : [];
                    const changed = JSON.stringify(newSupplies) !== JSON.stringify(selectedDrrSupplySources);
                    setSelectedDrrSupplySources(newSupplies);
                    if (changed) {
                      setSelectedDrrManufacturingCities([]);
                    }
                  }

                  if (Object.prototype.hasOwnProperty.call(next, 'manufacturing_city')) {
                    const newManu = Array.isArray(next.manufacturing_city) ? next.manufacturing_city : [];
                    setSelectedDrrManufacturingCities(newManu);
                  }

                  if (Object.prototype.hasOwnProperty.call(next, 'category')) {
                    const newCats = Array.isArray(next.category) ? next.category : [];
                    const changed = JSON.stringify(newCats) !== JSON.stringify(selectedDrrCategories);
                    setSelectedDrrCategories(newCats);
                    if (changed) {
                      setSelectedDrrSubCategories([]);
                    }
                  }

                  if (Object.prototype.hasOwnProperty.call(next, 'sub_category')) {
                    const newSubs = Array.isArray(next.sub_category) ? next.sub_category : [];
                    setSelectedDrrSubCategories(newSubs);
                  }
                }}
                onRefresh={fetchDrrData}
                onDownload={handleDownloadDrr}
                isDownloading={downloadLoading.drr}
                downloadProgress={downloadProgress.drr}
              />
            ) : activeTab === 'platformSummary' ? (
              <PlatformSummary
                data={platformSummaryData}
                loading={platformSummaryLoading}
                error={platformSummaryError}
                sortState={sortState.platformSummary}
                onSort={(key) => handleSort('platformSummary', key)}
                sortArrow={(key) => sortArrow('platformSummary', key)}
                filters={{ startDate: platformSummaryStartDate, endDate: platformSummaryEndDate, platform: selectedPlatformSummary || [], city: selectedPlatformSummaryCity || [], supply_source: selectedPlatformSummarySupplySource || [], category: selectedPlatformSummaryCategory || [], manufacturing_city: selectedPlatformSummaryManufacturingCity || [], brand: selectedPlatformSummaryBrands || [] }}
                options={{ platforms: availablePlatformsSummary, cities: availablePlatformSummaryCities, supply_sources: availablePlatformSummarySupplySources, categories: availablePlatformSummaryCategories, manufacturing_cities: availablePlatformSummaryManufacturingCities }}
                onChangeFilters={(next) => {
                  // Comprehensive cascading filter logic for Platform Summary
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) {
                    setPlatformSummaryStartDate(next.startDate);
                    // Date changes affect all filter options
                  }
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) {
                    setPlatformSummaryEndDate(next.endDate);
                    // Date changes affect all filter options
                  }
                  
                  // Brand → Platform → City → Supply Source hierarchy
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) {
                    const newBrands = Array.isArray(next.brand) ? next.brand : [];
                    const changed = JSON.stringify(newBrands) !== JSON.stringify(selectedPlatformSummaryBrands || []);
                    setSelectedPlatformSummaryBrands(newBrands);
                    if (changed) {
                      setSelectedPlatformSummary([]);
                      setSelectedPlatformSummaryCity([]);
                      setSelectedPlatformSummarySupplySource([]);
                      setSelectedPlatformSummaryManufacturingCity([]);
                    }
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) {
                    const newPlatforms = Array.isArray(next.platform) ? next.platform : [];
                    const changed = JSON.stringify(newPlatforms) !== JSON.stringify(selectedPlatformSummary || []);
                    setSelectedPlatformSummary(newPlatforms);
                    if (changed) {
                      setSelectedPlatformSummaryCity([]);
                      setSelectedPlatformSummarySupplySource([]);
                    }
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'city')) {
                    const newCities = Array.isArray(next.city) ? next.city : [];
                    const changed = JSON.stringify(newCities) !== JSON.stringify(selectedPlatformSummaryCity || []);
                    setSelectedPlatformSummaryCity(newCities);
                    if (changed) {
                      setSelectedPlatformSummarySupplySource([]);
                    }
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'supply_source')) {
                    const newSupplies = Array.isArray(next.supply_source) ? next.supply_source : [];
                    const changed = JSON.stringify(newSupplies) !== JSON.stringify(selectedPlatformSummarySupplySource || []);
                    setSelectedPlatformSummarySupplySource(newSupplies);
                    if (changed) {
                      setSelectedPlatformSummaryCity([]);
                    }
                  }

                  if (Object.prototype.hasOwnProperty.call(next, 'manufacturing_city')) {
                    const newManufs = Array.isArray(next.manufacturing_city) ? next.manufacturing_city : [];
                    setSelectedPlatformSummaryManufacturingCity(newManufs);
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'category')) {
                    const newCats = Array.isArray(next.category) ? next.category : [];
                    setSelectedPlatformSummaryCategory(newCats);
                    // Category changes might affect subcategory drill-down
                    if (isDrilldownView) {
                      handleBackToCategories(); // Reset drill-down view when category filter changes
                    }
                  }
                  
                }}
                onRefresh={fetchPlatformSummaryData}
                options={{ platforms: availablePlatformsSummary, cities: availablePlatformSummaryCities, supply_sources: availablePlatformSummarySupplySources, categories: availablePlatformSummaryCategories, manufacturing_cities: availablePlatformSummaryManufacturingCities }}
                isDownloading={downloadLoading.platformSummary}
                onCategoryDrilldown={handleCategoryDrilldown}
                drilldownData={drilldownData}
                isDrilldownView={isDrilldownView}
                selectedCategory={selectedCategoryForDrilldown}
                onBackToCategories={handleBackToCategories}
              />
            ) : activeTab === 'platformReport' ? (
              <SalesPerformance
                view={salesPerfView}
                setView={setSalesPerfView}
                loadingTarget={platformReportLoading}
                errorTarget={platformReportError}
                loadingWeekly={weeklyLoading}
                errorWeekly={weeklyError}
                loadingMonthly={monthlyLoading}
                errorMonthly={monthlyError}
                dataTarget={platformReportData}
                dataWeekly={weeklyData}
                dataMonthly={monthlyData}
                sortTarget={sortState.platformReport}
                sortWeekly={sortState.weekly}
                sortMonthly={sortState.monthly}
                onSortTarget={(key) => handleSort('platformReport', key)}
                onSortWeekly={(key) => handleSort('weekly', key)}
                onSortMonthly={(key) => handleSort('monthly', key)}
                sortArrowTarget={(key) => sortArrow('platformReport', key)}
                sortArrowWeekly={(key) => sortArrow('weekly', key)}
                sortArrowMonthly={(key) => sortArrow('monthly', key)}
                filters={{ month_start: platformReportMonthStart, month_end: platformReportMonthEnd, platform: selectedPlatformReport, city: selectedPlatformReportCity, supply_source: selectedPlatformReportSupplySource, manufacturing_city: selectedPlatformReportManufacturingCity, category: selectedPlatformReportCategory, metric: selectedMetricReport, brand: selectedPlatformReportBrands || [] }}
                options={{ platforms: availablePlatformsReport, cities: availablePlatformReportCities, supply_sources: availablePlatformReportSupplySources, manufacturing_cities: availablePlatformReportManufacturingCities, categories: availablePlatformReportCategories }}
                onChangeFilters={(next) => {
                  // Comprehensive cascading filter logic for Sales Performance
                  if (Object.prototype.hasOwnProperty.call(next, 'month_start')) {
                    setPlatformReportMonthStart(next.month_start);
                  }
                  if (Object.prototype.hasOwnProperty.call(next, 'month_end')) {
                    setPlatformReportMonthEnd(next.month_end);
                  }
                  
                  // Brand → Platform → City → Supply Source → Category hierarchy
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) {
                    const newBrands = Array.isArray(next.brand) ? next.brand : [];
                    const changed = JSON.stringify(newBrands) !== JSON.stringify(selectedPlatformReportBrands || []);
                    setSelectedPlatformReportBrands(newBrands);
                    if (changed) {
                      setSelectedPlatformReportCity('');
                      setSelectedPlatformReportSupplySource('');
                      setSelectedPlatformReportManufacturingCity('');
                      setSelectedPlatformReportCategory('');
                      // Fetch new filter options based on selected brands (for Category dropdown)
                      fetchFilterOptionsForReport({ brand: newBrands.join(',') });
                    }
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) {
                    setSelectedPlatformReport(next.platform);
                    // When platform changes, clear dependent filters and fetch new options
                    if (next.platform !== selectedPlatformReport) {
                      setSelectedPlatformReportCity('');
                      setSelectedPlatformReportSupplySource('');
                      setSelectedPlatformReportManufacturingCity('');
                      setSelectedPlatformReportCategory('');
                      // Fetch new filter options based on selected platform and brands
                      const brandFilter = Array.isArray(selectedPlatformReportBrands) && selectedPlatformReportBrands.length > 0
                        ? { brand: selectedPlatformReportBrands.join(',') } : {};
                      fetchFilterOptionsForReport({ platform: next.platform, ...brandFilter });
                    }
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'city')) {
                    setSelectedPlatformReportCity(next.city);
                    // When city changes, clear dependent filters and fetch new options
                    setSelectedPlatformReportSupplySource('');
                    setSelectedPlatformReportManufacturingCity('');
                    setSelectedPlatformReportCategory('');
                    // Fetch new filter options based on selected city, platform and brands
                    const brandFilter = Array.isArray(selectedPlatformReportBrands) && selectedPlatformReportBrands.length > 0
                      ? { brand: selectedPlatformReportBrands.join(',') } : {};
                    fetchFilterOptionsForReport({
                      platform: selectedPlatformReport,
                      city: next.city,
                      ...brandFilter
                    });
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'supply_source')) {
                    setSelectedPlatformReportSupplySource(next.supply_source);
                    // When supply source changes, clear dependent filters and fetch new options
                    setSelectedPlatformReportCategory('');
                    // Fetch new filter options based on selected supply source, platform and brands
                    const brandFilter = Array.isArray(selectedPlatformReportBrands) && selectedPlatformReportBrands.length > 0
                      ? { brand: selectedPlatformReportBrands.join(',') } : {};
                    fetchFilterOptionsForReport({
                      platform: selectedPlatformReport,
                      supply_source: next.supply_source,
                      ...brandFilter
                    });
                  }

                  if (Object.prototype.hasOwnProperty.call(next, 'manufacturing_city')) {
                    setSelectedPlatformReportManufacturingCity(next.manufacturing_city);
                    // Manufacturing city affects category options
                    setSelectedPlatformReportCategory('');
                    // DISABLED: Don't fetch filter options on manufacturing city change - user must click APPLY
                    // const brandFilter = Array.isArray(selectedPlatformReportBrands) && selectedPlatformReportBrands.length > 0
                    //   ? { brand: selectedPlatformReportBrands.join(',') } : {};
                    // fetchFilterOptionsForReport({
                    //   platform: selectedPlatformReport,
                    //   city: selectedPlatformReportCity,
                    //   supply_source: selectedPlatformReportSupplySource,
                    //   manufacturing_city: next.manufacturing_city,
                    //   ...brandFilter
                    // });
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'category')) {
                    setSelectedPlatformReportCategory(next.category);
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'metric')) setSelectedMetricReport(next.metric);
                  
                }}
                onRefreshTarget={fetchPlatformReportData}
                onRefreshWeekly={fetchWeeklyData}
                onRefreshMonthly={fetchMonthlyData}
                onDownloadTarget={handleDownloadPlatformReport}
                onDownloadWeekly={handleDownloadWeekly}
                onDownloadMonthly={handleDownloadMonthly}
                isDownloadingTarget={downloadLoading.platformReport}
                isDownloadingWeekly={downloadLoading.weekly}
                isDownloadingMonthly={downloadLoading.monthly}
              />
            ) : activeTab === 'salesContribution' ? (
              <SalesContribution
                data={contribData}
                loading={contribLoading}
                error={contribError}
                sortState={sortState.salesContribution}
                onSort={(key) => handleSort('salesContribution', key)}
                sortArrow={(key) => sortArrow('salesContribution', key)}
                filters={{ startDate: contribStartDate, endDate: contribEndDate, platforms: selectedContribPlatforms, city: selectedContribCity, supply_source: selectedContribSupplySource, manufacturing_city: selectedContribManufacturingCities, category: selectedContribCategory, sub_category: selectedContribSubCategory, brand: selectedContribBrands || [] }}
                options={{ platforms: availableContribPlatforms, cities: availableContribCities, supply_sources: availableContribSupplySources, manufacturing_cities: availableContribManufacturingCities, categories: availableContribCategories, sub_categories: availableContribSubCategories }}
                onChangeFilters={(next) => {
                  // Comprehensive cascading filter logic for Sales Contribution
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) {
                    setContribStartDate(next.startDate);
                    // Date changes affect all filter options
                  }
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) {
                    setContribEndDate(next.endDate);
                    // Date changes affect all filter options
                  }
                  
                  // Brand → Platform → City ↔ Supply Source ↔ Manufacturing hierarchy
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) {
                    const newBrands = Array.isArray(next.brand) ? next.brand : [];
                    const changed = JSON.stringify(newBrands) !== JSON.stringify(selectedContribBrands || []);
                    setSelectedContribBrands(newBrands);
                    if (changed) {
                      setSelectedContribPlatforms([]);
                      setSelectedContribCity([]);
                      setSelectedContribSupplySource([]);
                      setSelectedContribManufacturingCities([]);
                    }
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'platforms')) {
                    setSelectedContribPlatforms(next.platforms);
                    // When platforms change, clear dependent filters
                    if (JSON.stringify(next.platforms) !== JSON.stringify(selectedContribPlatforms)) {
                      setSelectedContribCity([]);
                      setSelectedContribSupplySource([]);
                      setSelectedContribManufacturingCities([]);
                    }
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'city')) {
                    setSelectedContribCity(next.city);
                    // When city changes, clear dependent filters
                    setSelectedContribSupplySource([]);
                    setSelectedContribManufacturingCities([]);
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'supply_source')) {
                    setSelectedContribSupplySource(next.supply_source);
                    // Clear linked filters
                    setSelectedContribCity([]);
                    setSelectedContribManufacturingCities([]);
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'manufacturing_city')) {
                    setSelectedContribManufacturingCities(next.manufacturing_city);
                    setSelectedContribCity([]);
                    setSelectedContribSupplySource([]);
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'category')) {
                    setSelectedContribCategory(next.category);
                    // When category changes, clear sub_category (cascading relationship)
                    setSelectedContribSubCategory([]);
                  }
                  
                  if (Object.prototype.hasOwnProperty.call(next, 'sub_category')) {
                    setSelectedContribSubCategory(next.sub_category);
                  }
                  
                }}
                onRefresh={fetchSalesContribution}
                onDownload={handleDownloadSalesContribution}
                isDownloading={downloadLoading.salesContribution}
                pagination={contribPagination}
                pageSize={contribPageSize}
                setPageSize={(v) => setContribPageSize(v)}
                currentPage={contribCurrentPage}
                setCurrentPage={setContribCurrentPage}
                dropdownOpen={contribDropdownOpen}
                setDropdownOpen={setContribDropdownOpen}
                search={contribSearch}
                setSearch={setContribSearch}
              />
            ) : activeTab === 'dailyReport' ? (
              <DailyReport
                data={dailyReportData}
                loading={dailyReportLoading}
                error={dailyReportError}
                dates={dailyReportDates}
                view={dailyReportView}
                setView={setDailyReportView}
                metric={selectedDailyReportMetric}
                setMetric={setSelectedDailyReportMetric}
                filters={{ startDate: dailyReportStartDate, endDate: dailyReportEndDate, platform: Array.isArray(selectedDailyReportPlatform) ? selectedDailyReportPlatform : (selectedDailyReportPlatform ? [selectedDailyReportPlatform] : []), brand: selectedDailyReportBrands || [], city: selectedDailyReportCities || [], supply_source: selectedDailyReportSupplySources || [], manufacturing_city: selectedDailyReportManufacturingCities || [], category: selectedDailyReportCategories || [], sub_category: selectedDailyReportSubCategories || [] }}
                options={{ platforms: availableDailyReportPlatforms, cities: availableDailyReportCities, supply_sources: availableDailyReportSupplySources, manufacturing_cities: availableDailyReportManufacturingCities, categories: availableDailyReportCategories, sub_categories: availableDailyReportSubCategories }}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) setDailyReportStartDate(next.startDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) setDailyReportEndDate(next.endDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) setSelectedDailyReportPlatform(next.platform);
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) {
                    setSelectedDailyReportBrands(next.brand);
                    // Reset dependent filters on brand change
                    setSelectedDailyReportCategories([]);
                    setSelectedDailyReportSubCategories([]);
                  }
                  if (Object.prototype.hasOwnProperty.call(next, 'city')) setSelectedDailyReportCities(next.city);
                  if (Object.prototype.hasOwnProperty.call(next, 'supply_source')) setSelectedDailyReportSupplySources(next.supply_source);
                  if (Object.prototype.hasOwnProperty.call(next, 'manufacturing_city')) setSelectedDailyReportManufacturingCities(next.manufacturing_city);
                  if (Object.prototype.hasOwnProperty.call(next, 'category')) {
                    setSelectedDailyReportCategories(next.category);
                    // Reset sub-category when category changes
                    setSelectedDailyReportSubCategories([]);
                  }
                  if (Object.prototype.hasOwnProperty.call(next, 'sub_category')) setSelectedDailyReportSubCategories(next.sub_category);
                }}
                onRefresh={fetchDailyReport}
                onDownload={handleDownloadDailyReport}
                isDownloading={downloadLoading.dailyReport}
                pagination={dailyReportPagination}
                setPagination={setDailyReportPagination}
                pageSize={dailyReportPageSize}
                setPageSize={setDailyReportPageSize}
              />
            ) : activeTab === 'inventory-overview' ? (
              <InventoryOverview
                data={invOvData}
                dates={invOvDates}
                loading={invOvLoading}
                error={invOvError}
                filters={{ period: invOvPeriod, platform: invOvPlatform, brand: invOvBrand, supply_source: invOvSupply, metric: invOvMetric }}
                options={invOvOptions}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'metric')) setInvOvMetric(Array.isArray(next.metric) ? next.metric : [next.metric]);
                  if (Object.prototype.hasOwnProperty.call(next, 'period')) setInvOvPeriod(Array.isArray(next.period) ? next.period : [next.period]);
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) setInvOvPlatform(Array.isArray(next.platform) ? next.platform : [next.platform]);
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) setInvOvBrand(Array.isArray(next.brand) ? next.brand : [next.brand]);
                  if (Object.prototype.hasOwnProperty.call(next, 'supply_source')) setInvOvSupply(Array.isArray(next.supply_source) ? next.supply_source : [next.supply_source]);
                }}
                onRefresh={fetchInventoryOverview}
              />
            ) : activeTab === 'stock-levels' ? (
              <StockLevels
                data={inventoryData}
                loading={inventoryLoading}
                error={inventoryError}
                filters={{
                  query_date: stockQueryDate,
                  sort: stockSort,
                  platform: inventoryPlatform,
                  brand: inventoryBrand,
                  supply_source: inventoryWarehouseCity,
                }}
                options={inventoryOptions}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'query_date')) setStockQueryDate(next.query_date);
                  if (Object.prototype.hasOwnProperty.call(next, 'sort')) setStockSort(next.sort);
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) setInventoryPlatform(next.platform);
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) setInventoryBrand(next.brand);
                  if (Object.prototype.hasOwnProperty.call(next, 'supply_source')) setInventoryWarehouseCity(next.supply_source);
                }}
                onRefresh={fetchInventoryData}
              />
            ) : activeTab === 'inventory-movements' ? (
              <InventoryMovements
                data={invMovData}
                loading={invMovLoading}
                error={invMovError}
                filters={{ query_date: invMovDate, brand: selectedBrand, supply_source: invMovSupply }}
                options={{ supply_sources: availablePlatformReportSupplySources }}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'query_date')) setInvMovDate(next.query_date);
                  // Brand is now managed globally by UserBrandsContext
                  if (Object.prototype.hasOwnProperty.call(next, 'supply_source')) setInvMovSupply(next.supply_source);
                }}
                onRefresh={fetchInventoryMovements}
              />
            ) : activeTab === 'ads-overview' ? (
              <AdsOverview
                data={adsData}
                totals={adsTotals}
                loading={adsLoading}
                error={adsError}
                filters={{
                  startDate: adsStartDate,
                  endDate: adsEndDate,
                  brand: adsBrand,
                  platform: adsPlatform,
                  groupBy: adsGroupBy,
                }}
                options={adsOptions}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) setAdsStartDate(next.startDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) setAdsEndDate(next.endDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) setAdsBrand(next.brand);
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) setAdsPlatform(next.platform);
                  if (Object.prototype.hasOwnProperty.call(next, 'groupBy')) setAdsGroupBy(next.groupBy);
                }}
                onRefresh={fetchAds}
              />
            ) : activeTab === 'campaign-performance' ? (
              <CategorySpends
                data={catSpendData}
                loading={catSpendLoading}
                error={catSpendError}
                filters={{ startDate: catSpendStartDate, endDate: catSpendEndDate, brands: catSpendBrands }}
                options={catSpendOptions}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) setCatSpendStartDate(next.startDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) setCatSpendEndDate(next.endDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'brands')) setCatSpendBrands(next.brands || []);
                }}
                onRefresh={fetchCategorySpends}
              />
            ) : activeTab === 'hygiene-overview' && activeModule === 'hygiene' ? (
              <HygieneOverview
                data={hygieneData}
                hygieneScores={hygieneScores}
                loading={hygieneLoading}
                error={hygieneError}
                filters={{
                  startDate: hygieneStartDate,
                  endDate: hygieneEndDate,
                  brand: hygieneBrand,
                  platform: hygienePlatform,
                }}
                options={hygieneOptions}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) setHygieneStartDate(next.startDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) setHygieneEndDate(next.endDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) setHygieneBrand(next.brand);
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) setHygienePlatform(next.platform || []);
                }}
                onRefresh={fetchHygiene}
              />
            ) : activeTab === 'hygiene-overview' && activeModule === 'hygiene_eqcom' ? (
              <HygieneEQCOMOverview
                data={hygieneEQCOMData}
                hygieneScores={hygieneEQCOMScores}
                loading={hygieneEQCOMLoading}
                error={hygieneEQCOMError}
                filters={{
                  startDate: hygieneEQCOMStartDate,
                  endDate: hygieneEQCOMEndDate,
                  brand: hygieneEQCOMBrand,
                  platform: hygieneEQCOMPlatform,
                }}
                options={hygieneEQCOMOptions}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) setHygieneEQCOMStartDate(next.startDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) setHygieneEQCOMEndDate(next.endDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) setHygieneEQCOMBrand(next.brand);
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) setHygieneEQCOMPlatform(next.platform || []);
                }}
                onRefresh={fetchHygieneEQCOM}
              />
            ) : activeTab === 'hygiene-table' ? (
              <HygieneTable />
            ) : activeTab === 'trend-analysis' ? (
              <TrendAnalysis
                data={trendData}
                loading={trendLoading}
                error={trendError}
                filters={{
                  startDate: trendStartDate,
                  endDate: trendEndDate,
                  brand: trendBrand,
                  platform: trendPlatform,
                  metric1: trendMetric1,
                  metric2: trendMetric2,
                }}
                options={trendOptions}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) setTrendStartDate(next.startDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) setTrendEndDate(next.endDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) setTrendBrand(next.brand);
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) setTrendPlatform(next.platform || []);
                  if (Object.prototype.hasOwnProperty.call(next, 'metric1')) setTrendMetric1(next.metric1);
                  if (Object.prototype.hasOwnProperty.call(next, 'metric2')) setTrendMetric2(next.metric2);
                }}
                onRefresh={fetchTrend}
              />
            ) : activeTab === 'correlation-matrix' ? (
              <CorrelationMatrix
                data={correlationData}
                loading={correlationLoading}
                error={correlationError}
                filters={{
                  startDate: correlationStartDate,
                  endDate: correlationEndDate,
                  brand: correlationBrand,
                  platform: correlationPlatform,
                }}
                options={correlationOptions}
                onChangeFilters={(next) => {
                  if (Object.prototype.hasOwnProperty.call(next, 'startDate')) setCorrelationStartDate(next.startDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'endDate')) setCorrelationEndDate(next.endDate);
                  if (Object.prototype.hasOwnProperty.call(next, 'brand')) setCorrelationBrand(next.brand);
                  if (Object.prototype.hasOwnProperty.call(next, 'platform')) setCorrelationPlatform(next.platform || []);
                }}
                onRefresh={fetchCorrelation}
              />
            ) : (
              <div className="dashboard-container">
                <div className="dashboard-header">
                  <h2>{getCurrentTab()?.label || 'Module'}</h2>
                  <p>Coming soon - This module is under development</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
    </ThemeProvider>
  );
} // Close AppContent function

// Wrapper component that provides UserBrandsProvider context from the outside
function App() {
  return (
    <UserBrandsProvider>
      <AppContent />
    </UserBrandsProvider>
  );
}


export default App;

