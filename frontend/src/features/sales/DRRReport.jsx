import React, { useMemo, useState } from 'react';
import MultiSelectDropdown from '../../components/common/MultiSelectDropdown';
import NumericConditionDropdown from '../../components/common/NumericConditionDropdown';
import TextFilterDropdown from '../../components/common/TextFilterDropdown';
import { formatNumber } from '../../utils/format';
import { compareValues } from '../../utils/sort';
import Pagination from '../../components/common/Pagination';

const DRRReport = ({
  data,
  loading,
  error,
  pagination,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
  sortState,
  onSort,
  sortArrow,
  filters,
  options,
  onChangeFilters,
  onRefresh,
  onDownload,
  isDownloading,
  downloadProgress,
}) => {
  const rows = Array.isArray(data) ? [...data] : [];

  const [columnFilters, setColumnFilters] = useState({
    platform_item_id: [],
    title: [],
    platform: [],
    remark_7d: [],
    remark_14d: [],
    drr: { op: 'gt', num: '' },
    last_7_days_drr: { op: 'gt', num: '' },
    last_14_days_drr: { op: 'gt', num: '' },
    total_gmv: { op: 'gt', num: '' },
    total_units: { op: 'gt', num: '' },
  });

  const uniqueOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map((r) => r.platform_item_id).filter(Boolean))).sort();
    const titles = Array.from(new Set(rows.map((r) => r.title).filter(Boolean))).sort();
    const platforms = Array.from(new Set(rows.map((r) => r.platform).filter(Boolean))).sort();
    const remarks_7d = Array.from(new Set(rows.map((r) => ((r.drr || 0) > (r.last_7_days_drr || 0)) ? 'Growing' : 'Need Attention'))).sort();
    const remarks_14d = Array.from(new Set(rows.map((r) => ((r.drr || 0) > (r.last_14_days_drr || 0)) ? 'Growing' : 'Need Attention'))).sort();
    return { ids, titles, platforms, remarks_7d, remarks_14d };
  }, [rows]);

  const numericPasses = (value, filter) => {
    const num = filter?.num;
    if (num === '' || num === null || Number.isNaN(Number(num))) return true;
    const x = Number(value) || 0;
    const n = Number(num);
    if (filter.op === 'gt') return x > n;
    if (filter.op === 'lt') return x < n;
    return x === n;
  };

  const filtered = useMemo(() => {
    return rows.filter((item) => {
      if ((columnFilters.platform_item_id || []).length > 0 && !columnFilters.platform_item_id.includes(item.platform_item_id)) return false;
      if ((columnFilters.title || []).length > 0 && !columnFilters.title.includes(item.title)) return false;
      if ((columnFilters.platform || []).length > 0 && !columnFilters.platform.includes(item.platform)) return false;
      
      const remark7dVal = (item.drr || 0) > (item.last_7_days_drr || 0) ? 'Growing' : 'Need Attention';
      if ((columnFilters.remark_7d || []).length > 0 && !columnFilters.remark_7d.includes(remark7dVal)) return false;
      
      const remark14dVal = (item.drr || 0) > (item.last_14_days_drr || 0) ? 'Growing' : 'Need Attention';
      if ((columnFilters.remark_14d || []).length > 0 && !columnFilters.remark_14d.includes(remark14dVal)) return false;

      if (!numericPasses(item.drr, columnFilters.drr)) return false;
      if (!numericPasses(item.last_7_days_drr, columnFilters.last_7_days_drr)) return false;
      if (!numericPasses(item.last_14_days_drr, columnFilters.last_14_days_drr)) return false;
      if (!numericPasses(item.total_gmv, columnFilters.total_gmv)) return false;
      if (!numericPasses(item.total_units, columnFilters.total_units)) return false;
      return true;
    });
  }, [rows, columnFilters]);

  const sorted = [...filtered];
  if (sortState?.key) sorted.sort((a, b) => compareValues(a[sortState.key], b[sortState.key], sortState.direction));

  const infoLabel = `Showing ${((pagination.current_page - 1) * pagination.page_size) + 1} to ${Math.min(pagination.current_page * pagination.page_size, pagination.total_count)} of ${pagination.total_count} entries`;

  // Local search states per filter (lightweight, non-visual change)
  const [platformSearch, setPlatformSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [supplySearch, setSupplySearch] = useState('');
  const [manufacturingSearch, setManufacturingSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [subCategorySearch, setSubCategorySearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');

  const filteredPlatforms = useMemo(() => (options.platforms || []).filter(p => !platformSearch || (p || '').toLowerCase().includes(platformSearch.toLowerCase())), [options.platforms, platformSearch]);
  const filteredCities = useMemo(() => (options.cities || []).filter(c => !citySearch || (c || '').toLowerCase().includes(citySearch.toLowerCase())), [options.cities, citySearch]);
  const filteredSupplies = useMemo(() => (options.supply_sources || []).filter(s => !supplySearch || (s || '').toLowerCase().includes(supplySearch.toLowerCase())), [options.supply_sources, supplySearch]);
  const filteredManufacturing = useMemo(() => (options.manufacturing_cities || []).filter(m => !manufacturingSearch || (m || '').toLowerCase().includes(manufacturingSearch.toLowerCase())), [options.manufacturing_cities, manufacturingSearch]);
  const filteredCategories = useMemo(() => (options.categories || []).filter(c => !categorySearch || (c || '').toLowerCase().includes(categorySearch.toLowerCase())), [options.categories, categorySearch]);
  const filteredSubCategories = useMemo(() => (options.sub_categories || []).filter(sc => !subCategorySearch || (sc || '').toLowerCase().includes(subCategorySearch.toLowerCase())), [options.sub_categories, subCategorySearch]);
  const filteredBrands = useMemo(() => (options.brands || []).filter(b => !brandSearch || (b || '').toLowerCase().includes(brandSearch.toLowerCase())), [options.brands, brandSearch]);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>DRR Report</h2>
        <div className="date-filters">
          <div className="date-input-group">
            <label htmlFor="drr-start-date">Start Date:</label>
            <input id="drr-start-date" type="date" value={filters.startDate} onChange={(e) => onChangeFilters({ startDate: e.target.value })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="drr-end-date">End Date:</label>
            <input id="drr-end-date" type="date"
            max={new Date().toISOString().split('T')[0]}
            value={filters.endDate} onChange={(e) => onChangeFilters({ endDate: e.target.value })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-filter">Platform:</label>
            <MultiSelectDropdown
              id="platform-filter"
              options={filteredPlatforms}
              values={filters.platform || []}
              onChange={(vals) => onChangeFilters({ platform: vals })}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="city-filter">Sales City:</label>
            <MultiSelectDropdown
              id="city-filter"
              options={filteredCities}
              values={filters.city || []}
              onChange={(vals) => onChangeFilters({ city: vals })}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="supply-filter">PO/FC-DC:</label>
            <MultiSelectDropdown
              id="supply-filter"
              options={filteredSupplies}
              values={filters.supply_source || []}
              onChange={(vals) => onChangeFilters({ supply_source: vals })}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="manufacturing-city-filter">Manufacture Source:</label>
            <MultiSelectDropdown
              id="manufacturing-city-filter"
              options={filteredManufacturing}
              values={filters.manufacturing_city || []}
              onChange={(vals) => onChangeFilters({ manufacturing_city: vals })}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="category-filter">Category:</label>
            <MultiSelectDropdown
              id="category-filter"
              options={filteredCategories}
              values={filters.category || []}
              onChange={(vals) => onChangeFilters({ category: vals })}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="sub-category-filter">Sub-Category:</label>
            <MultiSelectDropdown
              id="sub-category-filter"
              options={filteredSubCategories}
              values={filters.sub_category || []}
              onChange={(vals) => onChangeFilters({ sub_category: vals })}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="drr-brand-filter">Brand:</label>
            <MultiSelectDropdown
              id="drr-brand-filter"
              options={filteredBrands}
              values={filters.brand || []}
              onChange={(vals) => onChangeFilters({ brand: vals })}
            />
          </div>
          <button onClick={onRefresh} className="refresh-btn">Refresh Data</button>
          <div className="download-section">
            <button onClick={onDownload} className="btn-ghost" disabled={isDownloading}>
              {isDownloading ? 'Downloading...' : 'Download XLSX'}
            </button>
            {isDownloading && downloadProgress && downloadProgress.total > 0 && (
              <div className="download-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${downloadProgress.percentage}%` }}
                  ></div>
                </div>
                <span className="progress-text">
                  {downloadProgress.current > 0 ? 
                    `Page ${downloadProgress.current}/${downloadProgress.total} - ${downloadProgress.records} records (${downloadProgress.percentage}%)` :
                    'Preparing download...'
                  }
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="loading">Loading DRR data...</div>}
      {error && (
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={onRefresh} className="retry-btn">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="data-table">
            <table className="platform-summary-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('platform_item_id')}>Platform Item ID</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('platform_item_id')}>{sortArrow('platform_item_id')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <TextFilterDropdown
                          id="filter-platform-item-id-icon"
                          options={uniqueOptions.ids}
                          values={columnFilters.platform_item_id}
                          onChange={(vals) => setColumnFilters((prev) => ({ ...prev, platform_item_id: vals }))}
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('title')}>Title</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('title')}>{sortArrow('title')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <TextFilterDropdown
                          id="filter-title-icon"
                          options={uniqueOptions.titles}
                          values={columnFilters.title}
                          onChange={(vals) => setColumnFilters((prev) => ({ ...prev, title: vals }))}
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('platform')}>Platform</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('platform')}>{sortArrow('platform')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <TextFilterDropdown
                          id="filter-platform-icon"
                          options={uniqueOptions.platforms}
                          values={columnFilters.platform}
                          onChange={(vals) => setColumnFilters((prev) => ({ ...prev, platform: vals }))}
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
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', width: 120 }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('last_7_days_drr')}>Last 7 Days DRR</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('last_7_days_drr')}>{sortArrow('last_7_days_drr')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="filter-last-7-drr-icon"
                          value={columnFilters.last_7_days_drr}
                          onChange={(val) => setColumnFilters((prev) => ({ ...prev, last_7_days_drr: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', width: 130 }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('last_14_days_drr')}>Last 14 Days DRR</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('last_14_days_drr')}>{sortArrow('last_14_days_drr')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="filter-last-14-drr-icon"
                          value={columnFilters.last_14_days_drr}
                          onChange={(val) => setColumnFilters((prev) => ({ ...prev, last_14_days_drr: val }))}
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
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div className="table-header-content">
                      <span className="table-header-text">Remark (7D DRR)</span>
                      <span className="table-header-filter-icon">
                        <TextFilterDropdown
                          id="filter-remark-7d-icon"
                          options={uniqueOptions.remarks_7d}
                          values={columnFilters.remark_7d}
                          onChange={(vals) => setColumnFilters((prev) => ({ ...prev, remark_7d: vals }))}
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div className="table-header-content">
                      <span className="table-header-text">Remark (14D DRR)</span>
                      <span className="table-header-filter-icon">
                        <TextFilterDropdown
                          id="filter-remark-14d-icon"
                          options={uniqueOptions.remarks_14d}
                          values={columnFilters.remark_14d}
                          onChange={(vals) => setColumnFilters((prev) => ({ ...prev, remark_14d: vals }))}
                        />
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item, index) => (
                  <tr key={index}>
                    <td style={{ textAlign: 'center' }}>{item.platform_item_id}</td>
                    <td className="category-cell" style={{ textAlign: 'left' }}>{item.title}</td>
                    <td style={{ textAlign: 'center' }}>{item.platform}</td>
                    <td style={{ textAlign: 'center', width: 90 }}>{formatNumber(item.drr || 0)}</td>
                    <td style={{ textAlign: 'center', width: 120 }}>{formatNumber(item.last_7_days_drr || 0)}</td>
                    <td style={{ textAlign: 'center', width: 130 }}>{formatNumber(item.last_14_days_drr || 0)}</td>
                    <td style={{ textAlign: 'center', width: 120 }}>{formatNumber(item.total_gmv || 0)}</td>
                    <td style={{ textAlign: 'center', width: 90 }}>{formatNumber(item.total_units || 0)}</td>
                    <td style={{ textAlign: 'center' }}>{item.drr > item.last_7_days_drr ? 'Growing' : 'Need Attention'}</td>
                    <td style={{ textAlign: 'center' }}>{item.drr > item.last_14_days_drr ? 'Growing' : 'Need Attention'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            infoLabel={infoLabel}
            currentPage={pagination.current_page}
            totalPages={pagination.total_pages}
            hasPrevious={pagination.has_previous}
            hasNext={pagination.has_next}
            onFirst={() => setCurrentPage(1)}
            onPrev={() => setCurrentPage(currentPage - 1)}
            onNext={() => setCurrentPage(currentPage + 1)}
            onLast={() => setCurrentPage(pagination.total_pages)}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            pageSizeId="page-size"
          />
        </>
      )}
    </div>
  );
};

export default DRRReport;


