import React, { useMemo, useState } from 'react';
import MultiSelectDropdown from '../../components/common/MultiSelectDropdown';
import NumericConditionDropdown from '../../components/common/NumericConditionDropdown';
import TextFilterDropdown from '../../components/common/TextFilterDropdown';
import { formatNumber } from '../../utils/format';
import { compareValues } from '../../utils/sort';

const PlatformSummary = ({
  data,
  loading,
  error,
  sortState,
  onSort,
  sortArrow,
  filters,
  options,
  onChangeFilters,
  onRefresh,
  onDownload,
  isDownloading,
  onCategoryDrilldown,
  drilldownData,
  isDrilldownView,
  selectedCategory,
  onBackToCategories,
}) => {
  const rows = Array.isArray(data) ? [...data] : [];

  const [columnFilters, setColumnFilters] = useState({
    category: [],
    sub_category: [],
    drr: { op: 'gt', num: '' },
    last_7_days_avg: { op: 'gt', num: '' },
    last_14_days_avg: { op: 'gt', num: '' },
    total_gmv: { op: 'gt', num: '' },
    total_units: { op: 'gt', num: '' },
    asp: { op: 'gt', num: '' },
  });

  const numericPasses = (value, filter) => {
    const num = filter?.num;
    if (num === '' || num === null || Number.isNaN(Number(num))) return true;
    const x = Number(value) || 0;
    const n = Number(num);
    if (filter.op === 'gt') return x > n;
    if (filter.op === 'lt') return x < n;
    return x === n;
  };

  const uniqueOptions = useMemo(() => {
    const catKey = isDrilldownView ? 'sub_category' : 'category';
    const categories = Array.from(new Set(rows.map((r) => r[catKey]).filter(Boolean))).sort();
    return { categories };
  }, [rows, isDrilldownView]);

  const filtered = useMemo(() => {
    const catKey = isDrilldownView ? 'sub_category' : 'category';
    const catSelected = isDrilldownView ? columnFilters.sub_category : columnFilters.category;
    return rows.filter((item) => {
      if ((catSelected || []).length > 0 && !catSelected.includes(item[catKey])) return false;
      if (!numericPasses(item.drr, columnFilters.drr)) return false;
      if (!numericPasses(item.last_7_days_avg, columnFilters.last_7_days_avg)) return false;
      if (!numericPasses(item.last_14_days_avg, columnFilters.last_14_days_avg)) return false;
      if (!numericPasses(item.total_gmv, columnFilters.total_gmv)) return false;
      if (!numericPasses(item.total_units, columnFilters.total_units)) return false;
      if (!numericPasses(item.asp, columnFilters.asp)) return false;
      return true;
    });
  }, [rows, columnFilters, isDrilldownView]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortState?.key) arr.sort((a, b) => compareValues(a[sortState.key], b[sortState.key], sortState.direction));
    return arr;
  }, [filtered, sortState]);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Platform Sales Summary</h2>
        <div className="date-filters">
          <div className="date-input-group">
            <label htmlFor="platform-summary-start-date">Start Date:</label>
            <input
              id="platform-summary-start-date"
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                console.log('📅 USER ACTION: Start Date changed', {
                  component: 'PlatformSummary',
                  oldValue: filters.startDate,
                  newValue: e.target.value,
                  willTriggerAPI: false
                });
                onChangeFilters({ startDate: e.target.value });
              }}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-summary-end-date">End Date:</label>
            <input
              id="platform-summary-end-date"
              type="date"
              max={new Date().toISOString().split('T')[0]}
              value={filters.endDate}
              onChange={(e) => {
                console.log('📅 USER ACTION: End Date changed', {
                  component: 'PlatformSummary',
                  oldValue: filters.endDate,
                  newValue: e.target.value,
                  willTriggerAPI: false
                });
                onChangeFilters({ endDate: e.target.value });
              }}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-summary-filter">Platform:</label>
            <MultiSelectDropdown
              id="platform-summary-filter"
              options={options.platforms || []}
              values={filters.platform || []}
              onChange={(vals) => {
                console.log('🏢 USER ACTION: Platform changed', {
                  component: 'PlatformSummary',
                  oldValue: filters.platform,
                  newValue: vals,
                  willTriggerAPI: false
                });
                onChangeFilters({ platform: vals });
              }}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-summary-city-filter">Sales City:</label>
            <MultiSelectDropdown
              id="platform-summary-city-filter"
              options={options.cities || []}
              values={filters.city || []}
              onChange={(vals) => {
                console.log('🏙️ USER ACTION: City changed', {
                  component: 'PlatformSummary',
                  oldValue: filters.city,
                  newValue: vals,
                  willTriggerAPI: false
                });
                onChangeFilters({ city: vals });
              }}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-summary-supply-filter">PO/FC-DC:</label>
            <MultiSelectDropdown
              id="platform-summary-supply-filter"
              options={options.supply_sources || []}
              values={filters.supply_source || []}
              onChange={(vals) => {
                console.log('📦 USER ACTION: Supply Source changed', {
                  component: 'PlatformSummary',
                  oldValue: filters.supply_source,
                  newValue: vals,
                  willTriggerAPI: false
                });
                onChangeFilters({ supply_source: vals });
              }}
            />
          </div>
          {/* Removed duplicate manufacture source (first one). Keep a single MultiSelect below. */}
          <div className="date-input-group">
            <label htmlFor="platform-summary-brand-filter">Brand:</label>
            <MultiSelectDropdown
              id="platform-summary-brand-filter"
              options={options.brands || []}
              values={filters.brand || []}
              onChange={(vals) => {
                console.log('🏷️ USER ACTION: Brand changed', {
                  component: 'PlatformSummary',
                  oldValue: filters.brand,
                  newValue: vals,
                  willTriggerAPI: false
                });
                onChangeFilters({ brand: vals });
              }}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-summary-manufacture-filter">Manufacture Source:</label>
            <MultiSelectDropdown
              id="platform-summary-manufacture-filter"
              options={options.manufacturing_cities || []}
              values={filters.manufacturing_city || []}
              onChange={(vals) => {
                console.log('🏭 USER ACTION: Manufacturing City changed', {
                  component: 'PlatformSummary',
                  oldValue: filters.manufacturing_city,
                  newValue: vals,
                  willTriggerAPI: false
                });
                onChangeFilters({ manufacturing_city: vals });
              }}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-summary-category-filter">Category:</label>
            <MultiSelectDropdown
              id="platform-summary-category-filter"
              options={options.categories || []}
              values={filters.category || []}
              onChange={(vals) => {
                console.log('📂 USER ACTION: Category changed', {
                  component: 'PlatformSummary',
                  oldValue: filters.category,
                  newValue: vals,
                  willTriggerAPI: false
                });
                onChangeFilters({ category: vals });
              }}
            />
          </div>
          <button
            onClick={() => {
              console.log('🔘 USER ACTION: APPLY button clicked', {
                component: 'PlatformSummary',
                action: 'Manual API trigger',
                filters: {
                  startDate: filters.startDate,
                  endDate: filters.endDate,
                  platform: filters.platform,
                  city: filters.city,
                  supply_source: filters.supply_source,
                  brand: filters.brand,
                  manufacturing_city: filters.manufacturing_city,
                  category: filters.category
                }
              });
              onRefresh();
            }}
            className="refresh-btn"
          >
            APPLY
          </button>
          <button onClick={onDownload} className="btn-ghost" disabled={isDownloading}>{isDownloading ? 'Downloading...' : 'Download XLSX'}</button>
        </div>
      </div>

      {loading && <div className="loading">Loading Platform Sales Summary data...</div>}
      {error && (
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={onRefresh} className="retry-btn">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          {isDrilldownView && (
            <div className="drilldown-header">
              <button onClick={onBackToCategories} className="back-btn">
                ← Back to Categories
              </button>
              <h3>Sub-categories for: <span className="category-name">{selectedCategory}</span></h3>
            </div>
          )}
          
          <div className="data-table">
            <table className="platform-summary-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'left' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort(isDrilldownView ? 'sub_category' : 'category')}>
                        {isDrilldownView ? 'Sub-Category' : 'Category'}
                      </span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort(isDrilldownView ? 'sub_category' : 'category')}>{sortArrow(isDrilldownView ? 'sub_category' : 'category')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <TextFilterDropdown
                          id="filter-category-icon"
                          options={uniqueOptions.categories}
                          values={isDrilldownView ? columnFilters.sub_category : columnFilters.category}
                          onChange={(vals) => setColumnFilters((prev) => ({ ...prev, [isDrilldownView ? 'sub_category' : 'category']: vals }))}
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', width: 90 }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('drr')}>DRR</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('drr')}>{sortArrow('drr')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="filter-drr-icon"
                          value={columnFilters.drr}
                          onChange={(val) => setColumnFilters((prev) => ({ ...prev, drr: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', width: 130 }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('last_7_days_avg')}>Last 7 Days DRR</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('last_7_days_avg')}>{sortArrow('last_7_days_avg')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="filter-last7-icon"
                          value={columnFilters.last_7_days_avg}
                          onChange={(val) => setColumnFilters((prev) => ({ ...prev, last_7_days_avg: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', width: 140 }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('last_14_days_avg')}>Last 14 Days DRR</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('last_14_days_avg')}>{sortArrow('last_14_days_avg')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="filter-last14-icon"
                          value={columnFilters.last_14_days_avg}
                          onChange={(val) => setColumnFilters((prev) => ({ ...prev, last_14_days_avg: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', width: 120 }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('total_gmv')}>GMV</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('total_gmv')}>{sortArrow('total_gmv')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="filter-gmv-icon"
                          value={columnFilters.total_gmv}
                          onChange={(val) => setColumnFilters((prev) => ({ ...prev, total_gmv: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', width: 90 }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('total_units')}>Units</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('total_units')}>{sortArrow('total_units')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="filter-units-icon"
                          value={columnFilters.total_units}
                          onChange={(val) => setColumnFilters((prev) => ({ ...prev, total_units: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', width: 90 }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('asp')}>ASP</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('asp')}>{sortArrow('asp')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="filter-asp-icon"
                          value={columnFilters.asp}
                          onChange={(val) => setColumnFilters((prev) => ({ ...prev, asp: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(isDrilldownView ? (drilldownData || []) : sorted).map((item, index) => (
                  <tr key={index} className={!isDrilldownView ? 'clickable-row' : ''}>
                    <td 
                      className={`${isDrilldownView ? 'sub-category-cell' : 'category-cell'} ${!isDrilldownView ? 'clickable' : ''}`}
                      onClick={() => !isDrilldownView && onCategoryDrilldown && onCategoryDrilldown(item.category)}
                      title={!isDrilldownView ? 'Click to view sub-categories' : ''}
                    >
                      {isDrilldownView ? item.sub_category : item.category}
                      {!isDrilldownView && <span className="drill-indicator">🔍</span>}
                    </td>
                    <td>{formatNumber(item.drr || 0)}</td>
                    <td>{formatNumber(item.last_7_days_avg || 0)}</td>
                    <td>{formatNumber(item.last_14_days_avg || 0)}</td>
                    <td>{formatNumber(item.total_gmv || 0)}</td>
                    <td>{formatNumber(item.total_units || 0)}</td>
                    <td>{formatNumber(item.asp || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default PlatformSummary;


