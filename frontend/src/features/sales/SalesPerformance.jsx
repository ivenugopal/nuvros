import React, { useMemo, useState } from 'react';
import { formatNumber, formatPercent } from '../../utils/format';
import MultiSelectDropdown from '../../components/common/MultiSelectDropdown';
import SingleSelectDropdown from '../../components/common/SingleSelectDropdown';
import { compareValues } from '../../utils/sort';
import { calculateWeeksBetweenMonths, generateWeekHeaders } from '../../utils/date';
import NumericConditionDropdown from '../../components/common/NumericConditionDropdown';
import TextFilterDropdown from '../../components/common/TextFilterDropdown';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart
} from 'recharts';

const SalesPerformance = ({
  view,
  setView,
  loadingTarget,
  errorTarget,
  loadingWeekly,
  errorWeekly,
  loadingMonthly,
  errorMonthly,
  dataTarget,
  dataWeekly,
  dataMonthly,
  sortTarget,
  sortWeekly,
  sortMonthly,
  onSortTarget,
  onSortWeekly,
  onSortMonthly,
  sortArrowTarget,
  sortArrowWeekly,
  sortArrowMonthly,
  filters,
  options,
  onChangeFilters,
  onRefreshTarget,
  onRefreshWeekly,
  onRefreshMonthly,
  onDownloadTarget,
  onDownloadWeekly,
  onDownloadMonthly,
  isDownloadingTarget,
  isDownloadingWeekly,
  isDownloadingMonthly,
}) => {
  const rowsTarget = Array.isArray(dataTarget) ? [...dataTarget] : [];
  const rowsWeekly = Array.isArray(dataWeekly) ? [...dataWeekly] : [];
  const rowsMonthly = Array.isArray(dataMonthly) ? [...dataMonthly] : [];

  const [filtersTarget, setFiltersTarget] = useState({
    category: [],
    current: { op: 'gt', num: '' },
    target: { op: 'gt', num: '' },
    projected: { op: 'gt', num: '' },
    attainment: { op: 'gt', num: '' },
  });

  const [filtersWeekly, setFiltersWeekly] = useState({
    category: [],
    // dynamic keys w1..wN stored as { [weekKey]: {op, num} }
  });

  const [filtersMonthly, setFiltersMonthly] = useState({
    category: [],
    // dynamic keys month_xxx
  });

  // Add state for toggling between table and graph view
  const [displayMode, setDisplayMode] = useState('table'); // 'table' or 'graph'

  const numericPasses = (value, filter) => {
    const num = filter?.num;
    if (num === '' || num === null || Number.isNaN(Number(num))) return true;
    const x = Number(value) || 0;
    const n = Number(num);
    if (filter.op === 'gt') return x > n;
    if (filter.op === 'lt') return x < n;
    return x === n;
  };

  const uniqueCategoriesTarget = useMemo(() => Array.from(new Set(rowsTarget.map(r => r.category).filter(Boolean))).sort(), [rowsTarget]);
  const uniqueCategoriesWeekly = useMemo(() => Array.from(new Set(rowsWeekly.map(r => r.category).filter(Boolean))).sort(), [rowsWeekly]);
  const uniqueCategoriesMonthly = useMemo(() => Array.from(new Set(rowsMonthly.map(r => r.category).filter(Boolean))).sort(), [rowsMonthly]);

  const filteredTarget = useMemo(() => {
    const cats = filtersTarget.category || [];
    return rowsTarget.filter((item) => {
      if (cats.length > 0 && !cats.includes(item.category)) return false;
      if (!numericPasses(item.current, filtersTarget.current)) return false;
      if (!numericPasses(item.target, filtersTarget.target)) return false;
      if (!numericPasses(item.projected, filtersTarget.projected)) return false;
      // attainment may be stored as 0..1, but displayed via formatPercent
      if (!numericPasses(item.attainment, filtersTarget.attainment)) return false;
      return true;
    });
  }, [rowsTarget, filtersTarget]);

  // Calculate number of weeks based on date range (used by weekly filters and headers)
  const numWeeks = calculateWeeksBetweenMonths(filters.month_start, filters.month_end);
  const weekHeaders = generateWeekHeaders(numWeeks);

  // Generate month headers from raw monthly rows to avoid circular dependency with filtering
  const allMonthKeys = useMemo(() => {
    const set = new Set();
    rowsMonthly.forEach((item) => {
      Object.keys(item || {}).forEach((key) => {
        if (key.startsWith('month_')) set.add(key);
      });
    });
    return set;
  }, [rowsMonthly]);
  const monthHeaders = useMemo(() => Array.from(allMonthKeys)
    .sort()
    .map((key) => key.replace('month_', '').charAt(0).toUpperCase() + key.replace('month_', '').slice(1)), [allMonthKeys]);

  const filteredWeekly = useMemo(() => {
    const cats = filtersWeekly.category || [];
    return rowsWeekly.filter((item) => {
      if (cats.length > 0 && !cats.includes(item.category)) return false;
      // Check dynamic week keys that have an active filter value
      for (let i = 1; i <= weekHeaders.length; i++) {
        const key = `w${i}`;
        const f = filtersWeekly[key];
        if (f && f.num !== '' && !numericPasses(item[key], f)) return false;
      }
      return true;
    });
  }, [rowsWeekly, filtersWeekly, weekHeaders.length]);

  const filteredMonthly = useMemo(() => {
    const cats = filtersMonthly.category || [];
    return rowsMonthly.filter((item) => {
      if (cats.length > 0 && !cats.includes(item.category)) return false;
      for (const monthHeader of monthHeaders) {
        const key = `month_${monthHeader.toLowerCase()}`;
        const f = filtersMonthly[key];
        if (f && f.num !== '' && !numericPasses(item[key], f)) return false;
      }
      return true;
    });
  }, [rowsMonthly, filtersMonthly, monthHeaders]);

  const sortedTarget = useMemo(() => {
    const arr = [...filteredTarget];
    if (sortTarget?.key) arr.sort((a, b) => compareValues(a[sortTarget.key], b[sortTarget.key], sortTarget.direction));
    return arr;
  }, [filteredTarget, sortTarget]);

  const sortedWeekly = useMemo(() => {
    const arr = [...filteredWeekly];
    if (sortWeekly?.key) arr.sort((a, b) => compareValues(a[sortWeekly.key], b[sortWeekly.key], sortWeekly.direction));
    return arr;
  }, [filteredWeekly, sortWeekly]);

  const sortedMonthly = useMemo(() => {
    const arr = [...filteredMonthly];
    if (sortMonthly?.key) arr.sort((a, b) => compareValues(a[sortMonthly.key], b[sortMonthly.key], sortMonthly.direction));
    return arr;
  }, [filteredMonthly, sortMonthly]);

  // Check if date range exceeds 3 months
  const exceedsThreeMonths = numWeeks > 12; // 3 months = ~12 weeks

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

  // Transform data for Target chart (interchange x-axis and legend)
  const transformedTargetData = useMemo(() => {
    const metrics = ['current', 'target', 'projected'];
    return metrics.map(metric => {
      const dataPoint = { metric: metric.charAt(0).toUpperCase() + metric.slice(1) };
      sortedTarget.forEach(item => {
        dataPoint[item.category] = item[metric];
      });
      return dataPoint;
    });
  }, [sortedTarget]);

  // Transform data for Weekly chart
  const transformedWeeklyData = useMemo(() => {
    return weekHeaders.map((weekHeader, index) => {
      const dataPoint = { week: weekHeader };
      sortedWeekly.forEach(item => {
        dataPoint[item.category] = item[`w${index + 1}`] || 0;
      });
      return dataPoint;
    });
  }, [sortedWeekly, weekHeaders]);

  // Transform data for Monthly chart
  const transformedMonthlyData = useMemo(() => {
    return monthHeaders.map(monthHeader => {
      const dataPoint = { month: monthHeader };
      sortedMonthly.forEach(item => {
        dataPoint[item.category] = item[`month_${monthHeader.toLowerCase()}`] || 0;
      });
      return dataPoint;
    });
  }, [sortedMonthly, monthHeaders]);

  // Chart component for target view
  const TargetChart = () => {
    const categories = Array.from(new Set(sortedTarget.map(item => item.category)));
    return (
      <ResponsiveContainer width="100%" height={420}>
        <BarChart data={transformedTargetData} margin={{ top: 20, right: 60, left: 60, bottom: 80 }} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="metric" 
            tick={{ fontSize: 12 }}
            height={60}
          />
          <YAxis 
            tickFormatter={(value) => formatNumber(value)}
            tick={{ fontSize: 12 }}
            width={50}
            domain={['dataMin - dataMin*0.05', 'dataMax + dataMax*0.05']}
            tickCount={6}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          {categories.map((category, index) => (
            <Bar
              key={category}
              dataKey={category}
              fill={`hsl(${(index * 360 / categories.length) % 360}, 70%, 50%)`}
              name={category}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Chart component for weekly view
  const WeeklyChart = () => {
    const categories = Array.from(new Set(sortedWeekly.map(item => item.category)));
    return (
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={transformedWeeklyData} margin={{ top: 20, right: 30, left: 60, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="week"
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
          {categories.map((category, index) => (
            <Line
              key={category}
              dataKey={category}
              stroke={`hsl(${(index * 360 / categories.length) % 360}, 70%, 50%)`}
              name={category}
              connectNulls={false}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  // Chart component for monthly view
  const MonthlyChart = () => {
    const categories = Array.from(new Set(sortedMonthly.map(item => item.category)));
    return (
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={transformedMonthlyData} margin={{ top: 20, right: 30, left: 60, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis 
            dataKey="month"
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
          {categories.map((category, index) => (
            <Line
              key={category}
              dataKey={category}
              stroke={`hsl(${(index * 360 / categories.length) % 360}, 70%, 50%)`}
              name={category}
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
        <h2>Sales Performance</h2>
        <div className="date-filters">
          <div className="date-input-group">
            <label htmlFor="platform-report-month-start">Month Start:</label>
            <input id="platform-report-month-start" type="month" value={filters.month_start} onChange={(e) => onChangeFilters({ month_start: e.target.value })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-report-month-end">Month End:</label>
            <input id="platform-report-month-end" type="month" value={filters.month_end} onChange={(e) => onChangeFilters({ month_end: e.target.value })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-report-platform">Platform:</label>
            <MultiSelectDropdown
              id="platform-report-platform"
              options={options.platforms || []}
              values={filters.platform || []}
              onChange={(vals) => onChangeFilters({ platform: vals })}
              triggerPlaceholder="All Platforms"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="performance-city-filter">Sales City:</label>
            <MultiSelectDropdown
              id="performance-city-filter"
              options={options.cities || []}
              values={filters.city || []}
              onChange={(vals) => onChangeFilters({ city: vals })}
              triggerPlaceholder="All Cities"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="performance-supply-filter">PO/FC-DC:</label>
            <MultiSelectDropdown
              id="performance-supply-filter"
              options={options.supply_sources || []}
              values={filters.supply_source || []}
              onChange={(vals) => onChangeFilters({ supply_source: vals })}
              triggerPlaceholder="All PO/FC-DC"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="performance-manufacture-filter">Manufacture Source:</label>
            <MultiSelectDropdown
              id="performance-manufacture-filter"
              options={options.manufacturing_cities || []}
              values={filters.manufacturing_city || []}
              onChange={(vals) => onChangeFilters({ manufacturing_city: vals })}
              triggerPlaceholder="All Manufacture Sources"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="platform-report-metric">Metric:</label>
            <SingleSelectDropdown
              id="platform-report-metric"
              options={[ 'gmv', 'units', 'asp' ]}
              value={filters.metric || 'gmv'}
              onChange={(val) => onChangeFilters({ metric: val })}
              placeholder="Metric"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="performance-brand-filter">Brand:</label>
            <MultiSelectDropdown id="performance-brand-filter" options={options.brands || []} values={filters.brand || []} onChange={(vals) => onChangeFilters({ brand: vals })} />
          </div>
          <div className="date-input-group">
            <label htmlFor="performance-category-filter">Category:</label>
            <MultiSelectDropdown
              id="performance-category-filter"
              options={options.categories || []}
              values={filters.category || []}
              onChange={(vals) => onChangeFilters({ category: vals })}
              triggerPlaceholder="All Categories"
            />
          </div>
          <div className="date-input-group">
            <label>View:</label>
            <div className="toggle-group">
              <button className={`toggle-btn ${view === 'target' ? 'active' : ''}`} onClick={() => setView('target')}>Target</button>
              <button className={`toggle-btn ${view === 'weekly' ? 'active' : ''}`} onClick={() => setView('weekly')}>Weekly</button>
              <button className={`toggle-btn ${view === 'monthly' ? 'active' : ''}`} onClick={() => setView('monthly')}>Monthly</button>
            </div>
          </div>
          <div className="date-input-group">
            <label>Display:</label>
            <div className="toggle-group">
              <button className={`toggle-btn ${displayMode === 'table' ? 'active' : ''}`} onClick={() => setDisplayMode('table')}>Table</button>
              <button className={`toggle-btn ${displayMode === 'graph' ? 'active' : ''}`} onClick={() => setDisplayMode('graph')}>Graph</button>
            </div>
          </div>
          <button onClick={view === 'target' ? onRefreshTarget : view === 'weekly' ? onRefreshWeekly : onRefreshMonthly} className="refresh-btn">APPLY</button>
          {view === 'target' ? (
            <button onClick={onDownloadTarget} className="btn-ghost" disabled={isDownloadingTarget}>{isDownloadingTarget ? 'Downloading...' : 'Download XLSX'}</button>
          ) : view === 'weekly' ? (
            <button onClick={onDownloadWeekly} className="btn-ghost" disabled={isDownloadingWeekly}>{isDownloadingWeekly ? 'Downloading...' : 'Download XLSX'}</button>
          ) : (
            <button onClick={onDownloadMonthly} className="btn-ghost" disabled={isDownloadingMonthly}>{isDownloadingMonthly ? 'Downloading...' : 'Download XLSX'}</button>
          )}
        </div>
      </div>

      {view === 'target' && loadingTarget && <div className="loading">Loading Sales Performance data...</div>}
      {view === 'weekly' && loadingWeekly && <div className="loading">Loading Weekly data...</div>}
      {view === 'monthly' && loadingMonthly && <div className="loading">Loading Monthly data...</div>}

      {view === 'target' && errorTarget && (
        <div className="error">
          <p>Error: {errorTarget}</p>
          <button onClick={onRefreshTarget} className="retry-btn">Retry</button>
        </div>
      )}
      {view === 'weekly' && errorWeekly && (
        <div className="error">
          <p>Error: {errorWeekly}</p>
          <button onClick={onRefreshWeekly} className="retry-btn">Retry</button>
        </div>
      )}
      {view === 'monthly' && errorMonthly && (
        <div className="error">
          <p>Error: {errorMonthly}</p>
          <button onClick={onRefreshMonthly} className="retry-btn">Retry</button>
        </div>
      )}

      {view === 'target' && !loadingTarget && !errorTarget && (
        <div className={displayMode === 'table' ? 'data-table' : 'chart-container'}>
          {displayMode === 'table' ? (
            <table className="platform-summary-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSortTarget('category')}>Category</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSortTarget('category')}>{sortArrowTarget('category')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <TextFilterDropdown
                          id="perf-target-filter-category"
                          options={uniqueCategoriesTarget}
                          values={filtersTarget.category}
                          onChange={(vals) => setFiltersTarget((prev) => ({ ...prev, category: vals }))}
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSortTarget('current')}>Current</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSortTarget('current')}>{sortArrowTarget('current')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="perf-target-filter-current"
                          value={filtersTarget.current}
                          onChange={(val) => setFiltersTarget((prev) => ({ ...prev, current: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSortTarget('target')}>Target</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSortTarget('target')}>{sortArrowTarget('target')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="perf-target-filter-target"
                          value={filtersTarget.target}
                          onChange={(val) => setFiltersTarget((prev) => ({ ...prev, target: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSortTarget('projected')}>Projected</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSortTarget('projected')}>{sortArrowTarget('projected')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="perf-target-filter-projected"
                          value={filtersTarget.projected}
                          onChange={(val) => setFiltersTarget((prev) => ({ ...prev, projected: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                  <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSortTarget('attainment')}>Attainment</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSortTarget('attainment')}>{sortArrowTarget('attainment')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <NumericConditionDropdown
                          id="perf-target-filter-attainment"
                          value={filtersTarget.attainment}
                          onChange={(val) => setFiltersTarget((prev) => ({ ...prev, attainment: val }))}
                          iconOnly
                        />
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTarget.map((item, index) => (
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
          ) : (
            <TargetChart />
          )}
        </div>
      )}

      {view === 'weekly' && !loadingWeekly && !errorWeekly && (
        <div className={displayMode === 'table' ? 'table-container' : 'chart-container'}>
          {exceedsThreeMonths ? (
            <div className="error" style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px', margin: '1rem 0' }}>
              <h3 style={{ color: '#856404', margin: '0 0 0.5rem 0' }}>Date Range Too Large</h3>
              <p style={{ color: '#856404', margin: '0' }}>Please switch to monthly view for date ranges exceeding 3 months.</p>
            </div>
          ) : (
            displayMode === 'table' ? (
              <table className="platform-summary-table">
                <thead>
                  <tr>
                    <th style={{ whiteSpace: 'nowrap' }}>
                      <div className="table-header-content">
                        <span className="table-header-text" onClick={() => onSortWeekly('category')}>Category</span>
                        <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSortWeekly('category')}>{sortArrowWeekly('category')}</span>
                        <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <TextFilterDropdown
                            id="perf-weekly-filter-category"
                            options={uniqueCategoriesWeekly}
                            values={filtersWeekly.category || []}
                            onChange={(vals) => setFiltersWeekly((prev) => ({ ...prev, category: vals }))}
                          />
                        </span>
                      </div>
                    </th>
                    {weekHeaders.map((weekHeader, index) => (
                      <th key={weekHeader} style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                        <div className="table-header-content">
                          <span className="table-header-text" onClick={() => onSortWeekly(`w${index + 1}`)}>{weekHeader}</span>
                          <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSortWeekly(`w${index + 1}`)}>{sortArrowWeekly(`w${index + 1}`)}</span>
                          <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                            <NumericConditionDropdown
                              id={`perf-weekly-filter-w${index + 1}`}
                              value={filtersWeekly[`w${index + 1}`] || { op: 'gt', num: '' }}
                              onChange={(val) => setFiltersWeekly((prev) => ({ ...prev, [`w${index + 1}`]: val }))}
                              iconOnly
                            />
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedWeekly.map((item, index) => (
                    <tr key={index}>
                      <td className="category-cell">{item.category}</td>
                      {weekHeaders.map((weekHeader, weekIndex) => (
                        <td key={weekHeader}>{formatNumber(item[`w${weekIndex + 1}`] || 0)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <WeeklyChart />
            )
          )}
        </div>
      )}

      {view === 'monthly' && !loadingMonthly && !errorMonthly && (
        <div className={displayMode === 'table' ? 'data-table' : 'chart-container'}>
          {displayMode === 'table' ? (
            <table className="platform-summary-table">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>
                    <div className="table-header-content">
                      <span className="table-header-text" onClick={() => onSortMonthly('category')}>Category</span>
                      <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSortMonthly('category')}>{sortArrowMonthly('category')}</span>
                      <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <TextFilterDropdown
                          id="perf-monthly-filter-category"
                          options={uniqueCategoriesMonthly}
                          values={filtersMonthly.category || []}
                          onChange={(vals) => setFiltersMonthly((prev) => ({ ...prev, category: vals }))}
                        />
                      </span>
                    </div>
                  </th>
                  {monthHeaders.map((monthHeader, index) => (
                    <th key={monthHeader} style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                      <div className="table-header-content">
                        <span className="table-header-text" onClick={() => onSortMonthly(`month_${monthHeader.toLowerCase()}`)}>{monthHeader}</span>
                        <span className="table-header-sort-icon" role="button" aria-label="Sort" onClick={() => onSortMonthly(`month_${monthHeader.toLowerCase()}`)}>{sortArrowMonthly(`month_${monthHeader.toLowerCase()}`)}</span>
                        <span className="table-header-filter-icon" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <NumericConditionDropdown
                            id={`perf-monthly-filter-${monthHeader.toLowerCase()}`}
                            value={filtersMonthly[`month_${monthHeader.toLowerCase()}`] || { op: 'gt', num: '' }}
                            onChange={(val) => setFiltersMonthly((prev) => ({ ...prev, [`month_${monthHeader.toLowerCase()}`]: val }))}
                            iconOnly
                          />
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMonthly.map((item, index) => (
                  <tr key={index}>
                    <td className="category-cell">{item.category}</td>
                    {monthHeaders.map((monthHeader, monthIndex) => (
                      <td key={monthHeader}>{formatNumber(item[`month_${monthHeader.toLowerCase()}`] || 0)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <MonthlyChart />
          )}
        </div>
      )}
    </div>
  );
};

export default SalesPerformance;


