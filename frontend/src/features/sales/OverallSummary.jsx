import React from 'react';
import { formatNumber } from '../../utils/format';

const OverallSummary = ({
  data,
  targetData,
  totalGrowthRate,
  totalCitiesLiveOverall,
  totalArticlesOverall,
  loading,
  error,
  targetLoading,
  targetError,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  selectedBrand,
  availableBrands,
  setSelectedBrand,
  onRefresh,
  onRefreshTargets,
  onDownload,
  isDownloading,
}) => {
  const renderSalesSummaryTable = () => {
    if (!Array.isArray(data) || data.length === 0) return <p>No data available</p>;

    const platforms = data.map((item) => item.platform);
    const totalGMV = data.reduce((sum, item) => sum + (item.sales_gmv || 0), 0);
    const totalUnits = data.reduce((sum, item) => sum + (item.sales_units || 0), 0);
    const totalASP = totalUnits > 0 ? totalGMV / totalUnits : 0;

    const platformToItem = data.reduce((acc, item) => { acc[item.platform] = item; return acc; }, {});

    const metrics = [
      { label: 'Sales GMV', key: 'sales_gmv', format: (val) => formatNumber(val) },
      { label: 'Sales Units', key: 'sales_units', format: (val) => formatNumber(val) },
      { label: 'ASP', key: null, format: (item) => formatNumber(item.sales_units > 0 ? item.sales_gmv / item.sales_units : 0) },
      { label: 'Growth Rate', key: 'growth_rate', format: (val) => (val == null ? 'No Data' : `${val}%`) },
      { label: 'Cities Live', key: null, format: (item) => {
          if (Array.isArray(item.city_list) && item.city_list.length > 0) return item.city_list.join(', ');
          if (item.cities_live != null) return formatNumber(item.cities_live);
          return '';
        }
      },
      { label: 'Total Articles', key: null, format: (item) => (Array.isArray(item.title_list) ? item.title_list.join(', ') : formatNumber(item.total_articles || 0)) },
      { label: 'Platform Weightage', key: null, format: (item) => `${formatNumber(totalGMV ? (item.sales_gmv / totalGMV) * 100 : 0)}%` },
    ];

    return (
      <div className="data-table">
        <table className="sales-summary-table">
          <thead>
            <tr>
              <th>Metric</th>
              {platforms.map((platform, idx) => <th key={idx}>{platform}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, idx) => (
              <tr key={idx}>
                <td><strong>{metric.label}</strong></td>
                {platforms.map((platform, pi) => {
                  const item = platformToItem[platform] || {};
                  const value = metric.key ? item[metric.key] || 0 : metric.format(item);
                  return <td key={pi}>{metric.key ? metric.format(item[metric.key] || 0) : value}</td>;
                })}
                <td><strong>{(() => {
                  switch (metric.label) {
                    case 'Sales GMV': return formatNumber(totalGMV);
                    case 'Sales Units': return formatNumber(totalUnits);
                    case 'ASP': return formatNumber(totalASP);
                    case 'Growth Rate': return totalGrowthRate == null ? 'No Data' : `${totalGrowthRate}%`;
                    case 'Cities Live': return formatNumber(totalCitiesLiveOverall);
                    case 'Total Articles': return formatNumber(totalArticlesOverall);
                    case 'Platform Weightage': return '100%';
                    default: return '';
                  }
                })()}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTargetSummaryTable = () => {
    if (!Array.isArray(targetData) || targetData.length === 0) return <p>No target data available</p>;

    const platforms = targetData.map((item) => item.platform);
    const totalGMV = targetData.reduce((sum, item) => sum + (item.sales_gmv || 0), 0);
    const totalUnits = targetData.reduce((sum, item) => sum + (item.sales_units || 0), 0);
    const totalASP = totalUnits > 0 ? totalGMV / totalUnits : 0;
    const platformToItem = targetData.reduce((acc, item) => { acc[item.platform] = item; return acc; }, {});
    const platformToActual = (Array.isArray(data) ? data : []).reduce((acc, item) => { acc[item.platform] = item; return acc; }, {});

    return (
      <div className="data-table">
        <table className="sales-summary-table">
          <thead>
            <tr>
              <th></th>
              {platforms.map((platform, index) => (
                <th key={index}>{platform}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Sales GMV</strong></td>
              {platforms.map((platform, index) => {
                const item = platformToItem[platform] || {};
                return <td key={index}>{formatNumber(item.sales_gmv || 0)}</td>;
              })}
              <td><strong>{formatNumber(totalGMV)}</strong></td>
            </tr>
            <tr>
              <td><strong>Sales Units</strong></td>
              {platforms.map((platform, index) => {
                const item = platformToItem[platform] || {};
                return <td key={index}>{formatNumber(item.sales_units || 0)}</td>;
              })}
              <td><strong>{formatNumber(totalUnits)}</strong></td>
            </tr>
            <tr>
              <td><strong>ASP</strong></td>
              {platforms.map((platform, index) => {
                const item = platformToItem[platform] || {};
                const asp = item.sales_units > 0 ? item.sales_gmv / item.sales_units : 0;
                return <td key={index}>{formatNumber(asp)}</td>;
              })}
              <td><strong>{formatNumber(totalASP)}</strong></td>
            </tr>
            <tr>
              <td><strong>Target Attainment %</strong></td>
              {platforms.map((platform, index) => {
                const actualGMV = platformToActual[platform]?.sales_gmv || 0;
                const targetGMV = platformToItem[platform]?.sales_gmv || 0;
                const attainment = targetGMV ? (actualGMV / targetGMV) * 100 : 0;
                return <td key={index}>{formatNumber(attainment)}%</td>;
              })}
              <td><strong>{formatNumber(((Array.isArray(data) ? data : []).reduce((sum, item) => sum + (item.sales_gmv || 0), 0) / totalGMV) * 100)}%</strong></td>
            </tr>
            <tr>
              <td><strong>Platform Weightage</strong></td>
              {platforms.map((platform, index) => {
                const item = platformToItem[platform] || {};
                const weight = totalGMV ? (item.sales_gmv / totalGMV) * 100 : 0;
                return <td key={index}>{formatNumber(weight)}%</td>;
              })}
              <td><strong>100%</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderProjectionSummaryTable = () => {
    if (!Array.isArray(data) || data.length === 0) return <p>No projection data available</p>;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysElapsed = (end - start) / (1000 * 60 * 60 * 24) + 1;
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const factor = daysInMonth / daysElapsed;
    const platforms = data.map((item) => item.platform);
    const actualMap = data.reduce((acc, item) => { acc[item.platform] = item; return acc; }, {});
    const targetMap = (Array.isArray(targetData) ? targetData : []).reduce((acc, item) => { acc[item.platform] = item; return acc; }, {});
    const projections = platforms.map((platform) => {
      const actual = actualMap[platform] || {};
      const projGMV = actual.sales_gmv * factor;
      const projUnits = actual.sales_units * factor;
      const projASP = projUnits > 0 ? projGMV / projUnits : 0;
      const targetItem = targetMap[platform] || {};
      const tgtGMV = targetItem.sales_gmv || 0;
      const attainment = tgtGMV ? (projGMV / tgtGMV) * 100 : 0;
      return { platform, projGMV, projUnits, projASP, attainment };
    });
    const totalProjGMV = projections.reduce((sum, item) => sum + item.projGMV, 0);
    const totalProjUnits = projections.reduce((sum, p) => sum + p.projUnits, 0);
    return (
      <div className="data-table">
        <table className="sales-summary-table">
          <thead>
            <tr>
              <th></th>
              {platforms.map((p, i) => <th key={i}>{p}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Sales GMV</strong></td>
              {projections.map((p, i) => <td key={i}>{formatNumber(p.projGMV)}</td>)}
              <td><strong>{formatNumber(totalProjGMV)}</strong></td>
            </tr>
            <tr>
              <td><strong>Sales Units</strong></td>
              {projections.map((p, i) => <td key={i}>{formatNumber(p.projUnits)}</td>)}
              <td><strong>{formatNumber(totalProjUnits)}</strong></td>
            </tr>
            <tr>
              <td><strong>ASP</strong></td>
              {projections.map((p, i) => <td key={i}>{formatNumber(p.projASP)}</td>)}
              <td><strong>{formatNumber(totalProjUnits > 0 ? totalProjGMV / totalProjUnits : 0)}</strong></td>
            </tr>
            <tr>
              <td><strong>Target Attainment %</strong></td>
              {projections.map((p, i) => <td key={i}>{formatNumber(p.attainment)}%</td>)}
              <td><strong>{formatNumber((totalProjGMV / (targetData.reduce((sum, item) => sum + (item.sales_gmv || 0), 0) || 1)) * 100)}%</strong></td>
            </tr>
            <tr>
              <td><strong>Platform Weightage</strong></td>
              {projections.map((p, i) => <td key={i}>{formatNumber(totalProjGMV ? (p.projGMV / totalProjGMV) * 100 : 0)}%</td>)}
              <td><strong>100%</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Overall Sales Summary</h2>
        <div className="date-filters">
          <div className="date-input-group">
            <label htmlFor="start-date">Start Date:</label>
            <input 
              id="start-date" 
              type="date" 
              value={startDate} 
              onChange={(e) => {
                console.log('📅 USER ACTION: Start Date changed', {
                  component: 'OverallSummary',
                  oldValue: startDate,
                  newValue: e.target.value,
                  willTriggerAPI: true
                });
                setStartDate(e.target.value);
              }}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="end-date">End Date:</label>
            <input 
              id="end-date" 
              type="date" 
              value={endDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => {
                console.log('📅 USER ACTION: End Date changed', {
                  component: 'OverallSummary',
                  oldValue: endDate,
                  newValue: e.target.value,
                  willTriggerAPI: true
                });
                setEndDate(e.target.value);
              }}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="brand-filter">Brand:</label>
            <select
              id="brand-filter"
              value={selectedBrand}
              onChange={(e) => {
                console.log('🏷️ USER ACTION: Brand changed', {
                  component: 'OverallSummary',
                  oldValue: selectedBrand,
                  newValue: e.target.value,
                  willTriggerAPI: true
                });
                setSelectedBrand(e.target.value);
              }}
              className="platform-select"
            >
              {(availableBrands || []).map((brand) => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              console.log('🔘 USER ACTION: APPLY button clicked', {
                component: 'OverallSummary',
                action: 'Manual API trigger',
                filters: { startDate, endDate, selectedBrand }
              });
              onRefresh();
            }}
            className="refresh-btn"
          >
            APPLY
          </button>
          <button onClick={onDownload} className="btn-ghost" disabled={isDownloading}>
            {isDownloading ? 'Downloading...' : 'Download XLSX'}
          </button>
        </div>
      </div>

      {loading && <div className="loading">Loading data...</div>}

      {error && (
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={onRefresh} className="retry-btn">Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div>
          <div className="table-section">
            <h3 className="table-section-header">Actuals</h3>
            {renderSalesSummaryTable()}
          </div>
          <div className="table-section">
            <h3 className="table-section-header">Targets</h3>
            {targetLoading && <div className="loading">Loading target data...</div>}
            {targetError && (
              <div className="error">
                <p>Error: {targetError}</p>
                <button onClick={onRefreshTargets} className="retry-btn">Retry</button>
              </div>
            )}
            {!targetLoading && !targetError && renderTargetSummaryTable()}
          </div>
          <div className="table-section">
            <h3 className="table-section-header">Projections</h3>
            {renderProjectionSummaryTable()}
          </div>
        </div>
      )}
    </div>
  );
};

export default OverallSummary;


