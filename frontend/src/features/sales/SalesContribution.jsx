import React, { useMemo, useState } from 'react';
import MultiSelectDropdown from '../../components/common/MultiSelectDropdown';
import SingleSelectDropdown from '../../components/common/SingleSelectDropdown';
import NumericConditionDropdown from '../../components/common/NumericConditionDropdown';
import TextFilterDropdown from '../../components/common/TextFilterDropdown';
import { formatNumber } from '../../utils/format';
import { compareValues } from '../../utils/sort';
import Pagination from '../../components/common/Pagination';

const SalesContribution = ({
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
  pagination,
  pageSize,
  setPageSize,
  currentPage,
  setCurrentPage,
}) => {
  const rows = Array.isArray(data) ? [...data] : [];

  const [columnFilters, setColumnFilters] = useState({
    title: [],
    platform_item_id: [],
    gmv: { op: 'gt', num: '' },
    units: { op: 'gt', num: '' },
    contribution: { op: 'gt', num: '' },
    units_contribution: { op: 'gt', num: '' },
  });

  const uniqueOptions = useMemo(() => {
    const titles = Array.from(new Set(rows.map((r) => r.title).filter(Boolean))).sort();
    const ids = Array.from(new Set(rows.map((r) => r.platform_item_id).filter(Boolean))).sort();
    return { titles, ids };
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

  const percentPasses = (valueFraction, filter) => {
    const num = filter?.num;
    if (num === '' || num === null || Number.isNaN(Number(num))) return true;
    const nRaw = Number(num);
    const n = nRaw > 1 ? nRaw / 100 : nRaw; // allow entering percent like 10 => 0.10
    const x = Number(valueFraction) || 0;
    if (filter.op === 'gt') return x > n;
    if (filter.op === 'lt') return x < n;
    return x === n;
  };

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if ((columnFilters.title || []).length > 0 && !columnFilters.title.includes(row.title)) return false;
      if ((columnFilters.platform_item_id || []).length > 0 && !columnFilters.platform_item_id.includes(row.platform_item_id)) return false;
      if (!numericPasses(row.gmv, columnFilters.gmv)) return false;
      if (!numericPasses(row.units, columnFilters.units)) return false;
      if (!percentPasses(row.contribution, columnFilters.contribution)) return false;
      if (!percentPasses(row.units_contribution, columnFilters.units_contribution)) return false;
      return true;
    });
  }, [rows, columnFilters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortState?.key) arr.sort((a, b) => compareValues(a[sortState.key], b[sortState.key], sortState.direction));
    return arr;
  }, [filtered, sortState]);

  const infoLabel = `Showing ${((pagination.current_page - 1) * pagination.page_size) + 1} to ${Math.min(pagination.current_page * pagination.page_size, pagination.total_count)} of ${pagination.total_count} entries`;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Sales Contribution</h2>
        <div className="date-filters">
          <div className="date-input-group">
            <label htmlFor="contrib-start-date">Start Date:</label>
            <input id="contrib-start-date" type="date" value={filters.startDate} onChange={(e) => onChangeFilters({ startDate: e.target.value })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="contrib-end-date">End Date:</label>
            <input id="contrib-end-date" type="date"
            max={new Date().toISOString().split('T')[0]}
            value={filters.endDate} onChange={(e) => onChangeFilters({ endDate: e.target.value })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="contrib-platform-filter">Platform:</label>
            <MultiSelectDropdown id="contrib-platform-filter" options={options.platforms || []} values={filters.platforms || []} onChange={(vals) => onChangeFilters({ platforms: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="contrib-city-filter">Sales City:</label>
            <MultiSelectDropdown id="contrib-city-filter" options={options.cities || []} values={filters.city || []} onChange={(vals) => onChangeFilters({ city: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="contrib-supply-filter">PO/FC-DC:</label>
            <MultiSelectDropdown id="contrib-supply-filter" options={options.supply_sources || []} values={filters.supply_source || []} onChange={(vals) => onChangeFilters({ supply_source: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="contrib-manufacturing-filter">Manufacturing Source:</label>
            <MultiSelectDropdown id="contrib-manufacturing-filter" options={options.manufacturing_cities || []} values={filters.manufacturing_city || []} onChange={(vals) => onChangeFilters({ manufacturing_city: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="contrib-brand-filter">Brand:</label>
            <MultiSelectDropdown id="contrib-brand-filter" options={options.brands || []} values={filters.brand || []} onChange={(vals) => onChangeFilters({ brand: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="contrib-category-filter">Category:</label>
            <MultiSelectDropdown id="contrib-category-filter" options={options.categories || []} values={filters.category || []} onChange={(vals) => onChangeFilters({ category: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="contrib-sub-category-filter">Sub-Category:</label>
            <MultiSelectDropdown id="contrib-sub-category-filter" options={options.sub_categories || []} values={filters.sub_category || []} onChange={(vals) => onChangeFilters({ sub_category: vals })} />
          </div>
          <button onClick={onRefresh} className="refresh-btn">APPLY</button>
          <button onClick={onDownload} className="btn-ghost" disabled={isDownloading}>{isDownloading ? 'Downloading...' : 'Download XLSX'}</button>
        </div>
      </div>

      {loading && <div className="loading">Loading Sales Contribution...</div>}
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
                  <th style={{ whiteSpace: 'nowrap', minWidth: '120px' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('title')}>Title</span>
                      <div className="table-header-actions">
                        <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('title')}>{sortArrow('title')}</span>
                        <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <TextFilterDropdown
                            id="contrib-filter-title"
                            options={uniqueOptions.titles}
                            values={columnFilters.title}
                            onChange={(vals) => setColumnFilters((prev) => ({ ...prev, title: vals }))}
                          />
                        </span>
                      </div>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', minWidth: '140px' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('platform_item_id')}>Platform Item ID</span>
                      <div className="table-header-actions">
                        <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('platform_item_id')}>{sortArrow('platform_item_id')}</span>
                        <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <TextFilterDropdown
                            id="contrib-filter-id"
                            options={uniqueOptions.ids}
                            values={columnFilters.platform_item_id}
                            onChange={(vals) => setColumnFilters((prev) => ({ ...prev, platform_item_id: vals }))}
                          />
                        </span>
                      </div>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', minWidth: '100px' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('gmv')}>GMV</span>
                      <div className="table-header-actions">
                        <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('gmv')}>{sortArrow('gmv')}</span>
                        <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <NumericConditionDropdown
                            id="contrib-filter-gmv"
                            value={columnFilters.gmv}
                            onChange={(val) => setColumnFilters((prev) => ({ ...prev, gmv: val }))}
                            iconOnly
                          />
                        </span>
                      </div>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', minWidth: '100px' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('units')}>Units</span>
                      <div className="table-header-actions">
                        <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('units')}>{sortArrow('units')}</span>
                        <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <NumericConditionDropdown
                            id="contrib-filter-units"
                            value={columnFilters.units}
                            onChange={(val) => setColumnFilters((prev) => ({ ...prev, units: val }))}
                            iconOnly
                          />
                        </span>
                      </div>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', minWidth: '140px' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('contribution')}>GMV Contribution</span>
                      <div className="table-header-actions">
                        <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('contribution')}>{sortArrow('contribution')}</span>
                        <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <NumericConditionDropdown
                            id="contrib-filter-contribution"
                            value={columnFilters.contribution}
                            onChange={(val) => setColumnFilters((prev) => ({ ...prev, contribution: val }))}
                            iconOnly
                          />
                        </span>
                      </div>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center', minWidth: '140px' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSort('units_contribution')}>Units Contribution</span>
                      <div className="table-header-actions">
                        <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSort('units_contribution')}>{sortArrow('units_contribution')}</span>
                        <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <NumericConditionDropdown
                            id="contrib-filter-units-contribution"
                            value={columnFilters.units_contribution}
                            onChange={(val) => setColumnFilters((prev) => ({ ...prev, units_contribution: val }))}
                            iconOnly
                          />
                        </span>
                      </div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => (
                  <tr key={idx}>
                    <td className="category-cell">{row.title}</td>
                    <td>{row.platform_item_id}</td>
                    <td>{formatNumber(row.gmv)}</td>
                    <td>{formatNumber(row.units)}</td>
                    <td>{`${Number((row.contribution || 0) * 100).toFixed(2)}%`}</td>
                    <td>{`${Number((row.units_contribution || 0) * 100).toFixed(2)}%`}</td>
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
            pageSizeId="contrib-page-size"
          />
        </>
      )}
    </div>
  );
};

export default SalesContribution;


