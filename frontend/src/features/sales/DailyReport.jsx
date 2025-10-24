import React, { useMemo, useState } from 'react';
import MultiSelectDropdown from '../../components/common/MultiSelectDropdown';
import NumericConditionDropdown from '../../components/common/NumericConditionDropdown';
import TextFilterDropdown from '../../components/common/TextFilterDropdown';
import { formatNumber } from '../../utils/format';
import { compareValues } from '../../utils/sort';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

const DailyReport = ({
  data,
  loading,
  error,
  dates,
  view,
  setView,
  metric,
  setMetric,
  filters,
  options,
  onChangeFilters,
  onRefresh,
  onDownload,
  isDownloading,
  pagination,
  setPagination,
  pageSize,
  setPageSize,
}) => {
  const [sortState, setSortState] = useState({ key: null, direction: 'asc' });
  const [displayMode, setDisplayMode] = useState('table'); // 'table' or 'graph'
  const { current_page, page_size } = pagination;

  const identifierColumn = view === 'supply_source' ? 'PO/FC-DC' : (view === 'supply_city' ? 'Sales City' : 'Platform Item ID');
  const identifierKey = view === 'supply_source' ? 'supply_source' : (view === 'supply_city' ? 'supply_city' : 'platform_item_id');

  const dateCount = dates.length;
  const tableStyle = { '--date-count': dateCount };

  const [columnFilters, setColumnFilters] = useState({ identifier: [] });

  const numericPasses = (value, filter) => {
    const num = filter?.num;
    if (num === '' || num === null || Number.isNaN(Number(num))) return true;
    const x = Number(value) || 0;
    const n = Number(num);
    if (filter.op === 'gt') return x > n;
    if (filter.op === 'lt') return x < n;
    return x === n;
  };

  const uniqueIdentifiers = useMemo(() => {
    const vals = Array.from(new Set((Array.isArray(data) ? data : []).map((r) => r[identifierKey]).filter(Boolean)));
    // sort with string compare
    return vals.sort();
  }, [data, identifierKey]);

  const filteredData = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    return rows.filter((row) => {
      if ((columnFilters.identifier || []).length > 0 && !columnFilters.identifier.includes(row[identifierKey])) return false;
      // numeric checks per date
      for (const date of dates) {
        const f = columnFilters[date];
        if (f && f.num !== '' && !numericPasses(row?.dates?.[date], f)) return false;
      }
      return true;
    });
  }, [data, columnFilters, dates, identifierKey]);

  const totalCount = filteredData.length;
  const infoLabel = `Showing ${Math.min(((current_page - 1) * page_size) + 1, Math.max(totalCount, 1))} to ${Math.min(current_page * page_size, totalCount)} of ${totalCount} entries`;

  const handleSort = (columnKey) => {
    setSortState((prev) => ({
      key: columnKey,
      direction: prev.key === columnKey && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortArrow = (columnKey) => {
    const variant = sortState.key !== columnKey ? 'default' : (sortState.direction === 'asc' ? 'asc' : 'desc');
    return <span className={`sort-icon sort-icon--${variant}`} aria-hidden="true" />;
  };

  const sortedData = useMemo(() => {
    const rows = Array.isArray(filteredData) ? [...filteredData] : [];
    if (!sortState.key) return rows;
    return rows.sort((a, b) => {
      let aVal;
      let bVal;
      if (sortState.key === 'identifier') {
        aVal = a[identifierKey];
        bVal = b[identifierKey];
      } else {
        aVal = a?.dates?.[sortState.key];
        bVal = b?.dates?.[sortState.key];
      }
      return compareValues(aVal, bVal, sortState.direction);
    });
  }, [filteredData, sortState, identifierKey]);

  const startIdx = (current_page - 1) * page_size;
  const endIdx = startIdx + page_size;
  const pageItems = sortedData.slice(startIdx, endIdx);

  // Helper function for custom chart tooltips
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="chart-tooltip">
          <p className="label">{`${label}`}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.name} : ${typeof entry.value === 'number' ? formatNumber(entry.value) : entry.value}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Transform data for chart view - dates on x-axis, identifiers as lines
  const transformedChartData = useMemo(() => {
    if (!filteredData.length || !dates.length) return [];
    
    return dates.map(date => {
      const dataPoint = { 
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };
      
      // Add data for each identifier
      filteredData.forEach(item => {
        const identifier = item[identifierKey];
        if (identifier) {
          dataPoint[identifier] = item.dates?.[date] || 0;
        }
      });
      
      return dataPoint;
    });
  }, [filteredData, dates, identifierKey]);

  // Chart component
  const DailyChart = () => {
    const identifiers = Array.from(new Set(filteredData.map(item => item[identifierKey]).filter(Boolean))).slice(0, 10); // Limit to first 10 for readability
    
    return (
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={transformedChartData} margin={{ top: 20, right: 30, left: 60, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="date"
            angle={-45}
            textAnchor="end"
            height={100}
            interval={0}
            tick={{ fontSize: 12 }}
          />
          <YAxis 
            tickFormatter={(value) => formatNumber(value)}
            tick={{ fontSize: 12 }}
            width={50}
            domain={['dataMin - dataMin*0.1', 'dataMax + dataMax*0.1']}
            tickCount={6}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          {identifiers.map((identifier, index) => (
            <Line
              key={identifier}
              dataKey={identifier}
              stroke={`hsl(${(index * 360 / identifiers.length) % 360}, 70%, 50%)`}
              name={identifier}
              connectNulls={false}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Daily Report</h2>
        <div className="date-filters">
          <div className="date-input-group">
            <label htmlFor="daily-report-start-date">Start Date:</label>
            <input id="daily-report-start-date" type="date" value={filters.startDate} onChange={(e) => onChangeFilters({ startDate: e.target.value })} required />
          </div>
          <div className="date-input-group">
            <label htmlFor="daily-report-end-date">End Date:</label>
            <input id="daily-report-end-date" type="date"
            max={new Date().toISOString().split('T')[0]}
            value={filters.endDate} onChange={(e) => onChangeFilters({ endDate: e.target.value })} required />
          </div>
          <div className="date-input-group">
            <label htmlFor="daily-report-platform">Platform:</label>
            <MultiSelectDropdown id="daily-report-platform" options={options.platforms || []} values={filters.platform || []} onChange={(vals) => onChangeFilters({ platform: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="daily-report-city-filter">Sales City:</label>
            <MultiSelectDropdown id="daily-report-city-filter" options={options.cities || []} values={filters.city || []} onChange={(vals) => onChangeFilters({ city: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="daily-report-supply-filter">PO/FC-DC:</label>
            <MultiSelectDropdown id="daily-report-supply-filter" options={options.supply_sources || []} values={filters.supply_source || []} onChange={(vals) => onChangeFilters({ supply_source: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="daily-report-manu-filter">Manufacture Source:</label>
            <MultiSelectDropdown id="daily-report-manu-filter" options={options.manufacturing_cities || []} values={filters.manufacturing_city || []} onChange={(vals) => onChangeFilters({ manufacturing_city: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="daily-report-metric">Metric:</label>
            <select id="daily-report-metric" value={metric} onChange={(e) => setMetric(e.target.value)} className="platform-select">
              <option value="gmv">GMV</option>
              <option value="units">Units</option>
            </select>
          </div>
          <div className="date-input-group">
            <label htmlFor="daily-report-brand-filter">Brand:</label>
            <MultiSelectDropdown id="daily-report-brand-filter" options={options.brands || []} values={filters.brand || []} onChange={(vals) => onChangeFilters({ brand: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="daily-report-category-filter">Category:</label>
            <MultiSelectDropdown id="daily-report-category-filter" options={options.categories || []} values={filters.category || []} onChange={(vals) => onChangeFilters({ category: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="daily-report-subcategory-filter">Sub-Category:</label>
            <MultiSelectDropdown id="daily-report-subcategory-filter" options={options.sub_categories || []} values={filters.sub_category || []} onChange={(vals) => onChangeFilters({ sub_category: vals })} />
          </div>
          <div className="date-input-group" style={{ minWidth: '360px', width: '360px', flex: '0 0 360px' }}>
            <label>View:</label>
            <div className="toggle-group" style={{ height: '40px', display: 'flex', alignItems: 'center' }}>
              <button className={`toggle-btn ${view === 'platform_item_id' ? 'active' : ''}`} onClick={() => setView('platform_item_id')} style={{ height: '36px' }}>Platform Item ID</button>
              <button className={`toggle-btn ${view === 'supply_source' ? 'active' : ''}`} onClick={() => setView('supply_source')} style={{ height: '36px' }}>PO/FC-DC</button>
              <button className={`toggle-btn ${view === 'supply_city' ? 'active' : ''}`} onClick={() => setView('supply_city')} style={{ height: '36px' }}>City</button>
            </div>
          </div>
          <div className="date-input-group" style={{ minWidth: '180px', width: '180px', flex: '0 0 180px' }}>
            <label>Display:</label>
            <div className="toggle-group" style={{ height: '40px', display: 'flex', alignItems: 'center' }}>
              <button className={`toggle-btn ${displayMode === 'table' ? 'active' : ''}`} onClick={() => setDisplayMode('table')} style={{ height: '36px' }}>Table</button>
              <button className={`toggle-btn ${displayMode === 'graph' ? 'active' : ''}`} onClick={() => setDisplayMode('graph')} style={{ height: '36px' }}>Graph</button>
            </div>
          </div>
          <button onClick={onRefresh} className="refresh-btn">APPLY</button>
          <button onClick={onDownload} className="btn-ghost" disabled={isDownloading}>{isDownloading ? 'Downloading...' : 'Download XLSX'}</button>
        </div>
      </div>

      {loading && <div className="loading">Loading Daily Report...</div>}
      {error && (
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={onRefresh} className="retry-btn">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className={displayMode === 'table' ? 'table-data' : 'chart-container'}>
          {displayMode === 'table' ? (
            <div className="daily-report-table-wrapper">
              <h3 className="metric-title">Showing {metric?.toUpperCase()} Data by {identifierColumn}</h3>
              <table className="daily-report-table" style={tableStyle}>
                <thead>
                  <tr>
                    <th
                      className="sticky-column"
                      onClick={() => handleSort('identifier')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="table-header-content">
                        <span className="table-header-text" onClick={() => handleSort('identifier')}>{identifierColumn}</span>
                        <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => handleSort('identifier')}>{sortArrow('identifier')}</span>
                        <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <TextFilterDropdown
                            id="daily-filter-identifier"
                            options={uniqueIdentifiers}
                            values={columnFilters.identifier}
                            onChange={(vals) => setColumnFilters((prev) => ({ ...prev, identifier: vals }))}
                          />
                        </span>
                      </div>
                    </th>
                    {dates.map((date, index) => (
                      <th
                        key={index}
                        className="date-column"
                        onClick={() => handleSort(date)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="table-header-content">
                          <span className="table-header-text" onClick={() => handleSort(date)}>
                            {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => handleSort(date)}>{sortArrow(date)}</span>
                          <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                            <NumericConditionDropdown
                              id={`daily-filter-${index}`}
                              value={columnFilters[date] || { op: 'gt', num: '' }}
                              onChange={(val) => setColumnFilters((prev) => ({ ...prev, [date]: val }))}
                              iconOnly
                            />
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="sticky-column platform-item-cell" title={item[identifierKey]}>{item[identifierKey]}</td>
                      {dates.map((date, dateIndex) => (
                        <td key={dateIndex} className="metric-cell">{formatNumber(item.dates[date] || 0)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <h3 className="metric-title">Showing {metric?.toUpperCase()} Data by {identifierColumn} Over Time</h3>
              <DailyChart />
              {filteredData.length > 10 && (
                <p style={{ textAlign: 'center', marginTop: '1rem', color: '#666', fontSize: '0.9rem' }}>
                  Note: Showing top 10 {identifierColumn.toLowerCase()} entries for better chart readability.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {displayMode === 'table' && (
        <div className="pagination-container">
          <div className="pagination-info">{infoLabel}</div>
          <div className="pagination-controls">
            <div className="page-size-selector">
              <label htmlFor="daily-report-page-size">Show:</label>
              <select id="daily-report-page-size" value={pageSize} onChange={(e) => {
                const ps = parseInt(e.target.value, 10);
                const totalCount = (Array.isArray(data) ? data : []).length;
                const totalPages = Math.ceil(totalCount / ps) || 1;
                setPageSize(ps);
                setPagination({
                  current_page: 1,
                  page_size: ps,
                  total_count: totalCount,
                  total_pages: totalPages,
                  has_previous: false,
                  has_next: totalPages > 1,
                });
              }} className="page-size-select">
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>per page</span>
            </div>
            <button onClick={() => setPagination((prev) => ({ ...prev, current_page: 1, has_previous: false, has_next: prev.total_pages > 1 }))} disabled={!pagination.has_previous} className="pagination-btn">First</button>
            <button onClick={() => setPagination((prev) => ({ ...prev, current_page: prev.current_page - 1, has_previous: prev.current_page - 1 > 1, has_next: prev.current_page - 1 < prev.total_pages }))} disabled={!pagination.has_previous} className="pagination-btn">Previous</button>
            <span className="page-info">Page {pagination.current_page} of {pagination.total_pages}</span>
            <button onClick={() => setPagination((prev) => ({ ...prev, current_page: prev.current_page + 1, has_previous: true, has_next: prev.current_page + 1 < prev.total_pages }))} disabled={!pagination.has_next} className="pagination-btn">Next</button>
            <button onClick={() => setPagination((prev) => ({ ...prev, current_page: prev.total_pages, has_previous: prev.total_pages > 1, has_next: false }))} disabled={!pagination.has_next} className="pagination-btn">Last</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyReport;


