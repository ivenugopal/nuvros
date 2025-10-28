import React, { useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../../utils/format';
import { useUserBrands } from '../../contexts/UserBrandsContext';

const maxRangeDays = 30;

const CategorySpends = ({
  data, // { rows, dates, totals_per_date, grand_total, filters }
  loading,
  error,
  filters,
  options,
  onChangeFilters,
  onRefresh,
}) => {
  const { selectedBrand } = useUserBrands();
  const [localFilters, setLocalFilters] = useState(() => ({
    startDate: filters?.startDate || '',
    endDate: filters?.endDate || '',
  }));

  useEffect(() => {
    setLocalFilters((prev) => ({
      ...prev,
      startDate: filters?.startDate || '',
      endDate: filters?.endDate || '',
    }));
  }, [filters]);

  const setField = (key, value) => setLocalFilters((prev) => ({ ...prev, [key]: value }));

  const dateRangeTooLong = useMemo(() => {
    if (!localFilters.startDate || !localFilters.endDate) return false;
    const sd = new Date(localFilters.startDate);
    const ed = new Date(localFilters.endDate);
    const diff = Math.floor((ed - sd) / (1000 * 60 * 60 * 24)) + 1;
    return diff > maxRangeDays;
  }, [localFilters.startDate, localFilters.endDate]);

  const disabled = dateRangeTooLong;

  const apply = () => {
    if (disabled) return;
    onChangeFilters && onChangeFilters({
      startDate: localFilters.startDate,
      endDate: localFilters.endDate,
    });
  };

  // Auto-apply filters and fetch when valid
  useEffect(() => {
    if (!onChangeFilters) return;
    if (disabled) return; // avoid fetching with invalid range
    onChangeFilters({
      startDate: localFilters.startDate,
      endDate: localFilters.endDate,
      brands: localFilters.brands,
    });
    if (onRefresh) onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFilters.startDate, localFilters.endDate, JSON.stringify(localFilters.brands), disabled]);

  const dates = data?.dates || [];
  const rows = data?.rows || [];
  const totalsPerDate = data?.totals_per_date || {};
  const grandTotal = data?.grand_total || 0;

  const renderToolbar = () => (
    <div className="filters-toolbar">
      <div className="filters-row">
        <div className="date-input-group">
          <label htmlFor="category-start-date">Start Date:</label>
          <input id="category-start-date" type="date" value={localFilters.startDate} onChange={(e) => setField('startDate', e.target.value)} />
        </div>
        <div className="date-input-group">
          <label htmlFor="category-end-date">End Date:</label>
          <input id="category-end-date" type="date" max={new Date().toISOString().split('T')[0]} value={localFilters.endDate} onChange={(e) => setField('endDate', e.target.value)} />
        </div>
        <button onClick={apply} className="refresh-btn" disabled={disabled}>Apply</button>
      </div>
      {dateRangeTooLong && (
        <div className="error" style={{ marginTop: 8 }}>Date range cannot exceed {maxRangeDays} days.</div>
      )}
    </div>
  );

  const renderTable = () => {
    if (loading) return <div className="loading">Loading Category Spends...</div>;
    if (error) return <div className="error">{String(error)}</div>;
    if (!rows.length) return <div className="empty">No data</div>;

    const tableStyle = { '--date-count': dates.length };

    return (
      <div className="table-container">
        <table className="daily-report-table" style={tableStyle}>
          <thead>
            <tr>
              <th className="sticky-column">Category</th>
              {dates.map((d) => (
                <th key={d} className="date-column">{new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td className="sticky-column">{r.category}</td>
                {dates.map((d) => (
                  <td key={d} className="metric-cell">{formatNumber(r.dates[d] || 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              {dates.map((d) => (
                <th key={d}>{formatNumber(totalsPerDate[d] || 0)}</th>
              ))}
            </tr>
            <tr>
              <th>Grand Total</th>
              <th colSpan={dates.length} style={{ textAlign: 'left' }}>{formatNumber(grandTotal || 0)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Category Spends</h2>
      </div>
      {renderToolbar()}
      {renderTable()}
    </div>
  );
};

export default CategorySpends;


