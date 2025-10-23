import React from 'react';
import { formatNumber } from '../../utils/format';
import MultiSelectDropdown from '../../components/common/MultiSelectDropdown';

const InventoryOverview = ({
  data,
  dates,
  loading,
  error,
  filters,
  options,
  onChangeFilters,
  onRefresh,
}) => {
  const dateCount = (dates || []).length;
  const tableStyle = { '--date-count': dateCount };
  const selectedMetrics = Array.isArray(filters.metric) && (filters.metric || []).length > 0
    ? (filters.metric || []).map((m) => String(m || '').toLowerCase())
    : [String(filters.metric || 'drr').toLowerCase()];

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Inventory Overview</h2>
        <div className="date-filters">
          <div className="date-input-group">
            <label htmlFor="invovw-metric">Metric:</label>
            <MultiSelectDropdown
              id="invovw-metric"
              options={["DRR", "DOH", "DOC"]}
              values={(selectedMetrics || []).map((m) => m.toUpperCase())}
              onChange={(vals) => onChangeFilters({ metric: (vals || []).map((v) => v.toLowerCase()) })}
              triggerPlaceholder="Select metrics..."
              selectAllLabel="All Metrics"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="invovw-period">Choose Period:</label>
            <MultiSelectDropdown
              id="invovw-period"
              options={['Previous 7 Days', 'Previous 30 Days', ...(options.periods?.months || [])]}
              values={Array.isArray(filters.period) ? filters.period : [filters.period || 'Previous 30 Days']}
              onChange={(vals) => onChangeFilters({ period: vals })}
              triggerPlaceholder="Select period..."
              selectAllLabel="All Periods"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="invovw-platform">Platform:</label>
            <MultiSelectDropdown
              id="invovw-platform"
              options={['All Platforms', ...(options.platforms || [])]}
              values={Array.isArray(filters.platform) ? filters.platform : [filters.platform || 'All Platforms']}
              onChange={(vals) => onChangeFilters({ platform: vals })}
              triggerPlaceholder="Select platform..."
              selectAllLabel="All Platforms"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="invovw-brand">Brand:</label>
            <MultiSelectDropdown
              id="invovw-brand"
              options={options.brands || []}
              values={Array.isArray(filters.brand) ? filters.brand : [filters.brand || '']}
              onChange={(vals) => onChangeFilters({ brand: vals })}
              triggerPlaceholder="Select brand..."
              selectAllLabel="All Brands"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="invovw-supply">Supply Source:</label>
            <MultiSelectDropdown
              id="invovw-supply"
              options={['All', ...(options.supply_sources || [])]}
              values={Array.isArray(filters.supply_source) ? filters.supply_source : [filters.supply_source || 'All']}
              onChange={(vals) => onChangeFilters({ supply_source: vals })}
              triggerPlaceholder="Select supply source..."
              selectAllLabel="All Sources"
            />
          </div>
          <button onClick={onRefresh} className="refresh-btn">Refresh Data</button>
        </div>
      </div>

      {loading && <div className="loading">Loading Inventory Overview...</div>}
      {error && (
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={onRefresh} className="retry-btn">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className="data-table">
          <div className="daily-report-table-wrapper">
            <table className="daily-report-table" style={tableStyle}>
              <thead>
                <tr>
                  <th className="sticky-column">SKU</th>
                  <th className="sticky-column">Title</th>
                  {(dates || []).map((d) => (
                    <th key={d} className="date-column">{new Date(d).toLocaleDateString('en-GB')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data || []).map((row, idx) => (
                  <tr key={idx}>
                    <td className="sticky-column sku-cell">{row.sku}</td>
                    <td className="sticky-column title-cell" title={row.title}>{row.title}</td>
                    {(dates || []).map((d) => {
                      const cell = row.dates?.[d] || { drr: 0, doh: 0, doc: 0 };
                      if ((selectedMetrics || []).length <= 1) {
                        const m = (selectedMetrics[0] || 'drr');
                        const value = formatNumber(cell[m] || 0);
                        return <td key={d} className="metric-cell">{value}</td>;
                      }
                      return (
                        <td key={d} className="metric-cell metric-multi">
                          {(selectedMetrics || []).map((m) => (
                            <div key={m} className="metric-line">
                              <span className={`metric-tag metric-tag-${m}`}>{m.toUpperCase()}</span>
                              <span className="metric-value">{formatNumber(cell[m] || 0)}</span>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryOverview;


