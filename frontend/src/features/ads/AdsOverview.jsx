import React, { useEffect, useMemo, useState } from 'react';
import { formatNumber } from '../../utils/format';

const AdsOverview = ({
  data,
  totals,
  loading,
  error,
  filters,
  options,
  onChangeFilters,
  onRefresh,
}) => {
  const [localFilters, setLocalFilters] = useState(() => ({
    startDate: filters?.startDate || '',
    endDate: filters?.endDate || '',
    brand: filters?.brand || '',
    groupBy: filters?.groupBy || 'campaign',
  }));

  useEffect(() => {
    setLocalFilters((prev) => ({
      ...prev,
      startDate: filters?.startDate || '',
      endDate: filters?.endDate || '',
      brand: filters?.brand || '',
      groupBy: filters?.groupBy || 'campaign',
    }));
  }, [filters]);

  const onField = (key, value) => {
    const next = { ...localFilters, [key]: value };
    setLocalFilters(next);
  };

  const onApply = () => {
    onChangeFilters && onChangeFilters({ ...localFilters });
    onRefresh && onRefresh();
  };

  // Apply filters immediately on change for seamless UX
  useEffect(() => {
    if (!onChangeFilters) return;
    onChangeFilters({ ...localFilters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFilters.startDate, localFilters.endDate, localFilters.brand, localFilters.groupBy]);

  const columns = useMemo(() => {
    let firstColLabel = 'Platform';
    if (filters?.platform) {
      firstColLabel = (filters?.groupBy === 'campaign') ? 'Campaign Name' : 'Category';
    }
    return [
      { key: 'label', label: firstColLabel },
      { key: 'impressions', label: 'Impressions' },
      { key: 'clicks', label: 'Clicks' },
      { key: 'spend', label: 'Spend' },
      { key: 'sales', label: 'Sales' },
      { key: 'orders', label: 'Orders' },
      { key: 'ctr', label: 'CTR' },
      { key: 'cpc', label: 'CPC' },
      { key: 'cvr', label: 'CVR' },
      { key: 'acos', label: 'ACOS' },
    ];
  }, [filters?.platform, filters?.groupBy]);

  // Server now returns platform or metric-level aggregation; no client aggregation

  const renderToolbar = () => (
    <div className="filters-toolbar">
      <div className="filters-row">
        <div className="date-input-group">
          <label htmlFor="ads-start-date">Start Date:</label>
          <input id="ads-start-date" type="date" value={localFilters.startDate} onChange={(e) => onField('startDate', e.target.value)} />
        </div>
        <div className="date-input-group">
          <label htmlFor="ads-end-date">End Date:</label>
          <input id="ads-end-date" type="date" max={new Date().toISOString().split('T')[0]} value={localFilters.endDate} onChange={(e) => onField('endDate', e.target.value)} />
        </div>
        <label>
          Brand
          <select value={localFilters.brand} onChange={(e) => onField('brand', e.target.value)}>
            {(options?.brands || []).map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label>
          Group By
          <select value={localFilters.groupBy} onChange={(e) => onField('groupBy', e.target.value)}>
            <option value="category">Category</option>
            <option value="campaign">Campaign</option>
          </select>
        </label>
        {filters?.platform && (
          <button
            onClick={() => {
              onChangeFilters && onChangeFilters({ ...filters, platform: '', groupBy: 'platform' });
            }}
            className="refresh-btn"
          >
            ← Back to Platforms
          </button>
        )}
        {/* Apply button retained for UX but now redundant */}
        <button onClick={onApply} className="refresh-btn">Apply</button>
      </div>
    </div>
  );

  const inDrilldown = Boolean(filters?.platform);
  const rows = Array.isArray(data) ? data : [];

  const renderTable = () => {
    if (loading) return <div className="loading">Loading Ads Overview...</div>;
    if (error) return <div className="error">{String(error)}</div>;
    const formatFixed2 = (val) => {
      const n = Number(val);
      if (!Number.isFinite(n)) return '—';
      return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    return (
      <div className="table-container">
        <table className="ads-overview-table">
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const label = inDrilldown
                ? ((filters?.groupBy === 'campaign') ? (r.campaign || r.category || '') : (r.category || r.campaign || ''))
                : (r.platform || r.label || 'Unknown');
              return (
                <tr
                  key={idx}
                  onClick={() => {
                    if (!inDrilldown && (r.platform || r.label)) {
                      const platform = (r.platform || r.label || 'Unknown') === 'Unknown' ? '__unknown__' : (r.platform || r.label);
                      onChangeFilters && onChangeFilters({ ...filters, platform, groupBy: localFilters.groupBy || filters?.groupBy || 'category' });
                    }
                  }}
                  style={{ cursor: inDrilldown ? 'default' : 'pointer' }}
                >
                  <td className="category-cell" title={label}>{label}</td>
                  <td className="num-cell">{formatNumber(r.impressions)}</td>
                  <td className="num-cell">{formatNumber(r.clicks)}</td>
                  <td className="num-cell">{formatFixed2(r.spend)}</td>
                  <td className="num-cell">{formatFixed2(r.sales)}</td>
                  <td className="num-cell">{formatNumber(r.orders)}</td>
                  <td className="num-cell">{`${formatFixed2(r.ctr)}%`}</td>
                  <td className="num-cell">{formatFixed2(r.cpc)}</td>
                  <td className="num-cell">{`${formatFixed2(r.cvr)}%`}</td>
                  <td className="num-cell">{`${formatFixed2(r.acos)}%`}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>Grand Total</th>
              <th className="num-cell">{formatNumber(totals?.impressions)}</th>
              <th className="num-cell">{formatNumber(totals?.clicks)}</th>
              <th className="num-cell">{formatFixed2(totals?.spend)}</th>
              <th className="num-cell">{formatFixed2(totals?.sales)}</th>
              <th className="num-cell">{formatNumber(totals?.orders)}</th>
              <th className="num-cell">{`${formatFixed2(totals?.ctr)}%`}</th>
              <th className="num-cell">{formatFixed2(totals?.cpc)}</th>
              <th className="num-cell">{`${formatFixed2(totals?.cvr)}%`}</th>
              <th className="num-cell">{`${formatFixed2(totals?.acos)}%`}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Ads Overview</h2>
      </div>
      {renderToolbar()}
      {renderTable()}
    </div>
  );
};

export default React.memo(AdsOverview);


