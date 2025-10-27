import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatNumber } from '../../utils/format';
import SingleSelectDropdown from '../../components/common/SingleSelectDropdown';
import { useUserBrands } from '../../contexts/UserBrandsContext';

const TrendAnalysis = ({
  data,
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
    platform: filters?.platform || [],
    metric1: filters?.metric1 || 'Live Price',
    metric2: filters?.metric2 || 'Discount',
  }));

  // Available metrics for selection
  const availableMetrics = [
    { key: 'Live Price', label: 'Live Price' },
    { key: 'Sub-Category BSR', label: 'Sub-Category BSR' },
    { key: 'Category BSR', label: 'Category BSR' },
    { key: 'Discount', label: 'Discount' },
  ];
  // Update local options when props change
  // Load brands from localStorage on component mount (Hygiene module)
  const [localOptions, setLocalOptions] = useState(options || {});
  // Update local options when props change (but don't override brands)
  useEffect(() => {
    setLocalOptions(prev => ({
      ...prev,
      platforms: options?.platforms || prev.platforms || []
    }));
  }, [options]);

  useEffect(() => {
    setLocalFilters((prev) => ({
      ...prev,
      startDate: filters?.startDate || '',
      brand: filters?.brand || '',
      platform: filters?.platform || [],
    }));
  }, [filters]);

  const onField = (key, value) => {
    const next = { ...localFilters, [key]: value };
    setLocalFilters(next);
  };

  const onApply = () => {
    console.log('🔘 USER ACTION: APPLY button clicked', {
      component: 'TrendAnalysis',
      action: 'Manual API trigger',
      filters: localFilters
    });
    onChangeFilters && onChangeFilters({ ...localFilters });
    onRefresh && onRefresh();
  };

  // REMOVED: Auto-trigger on filter changes - users must click Apply button
  // useEffect(() => {
  //   if (!onChangeFilters) return;
  //   onChangeFilters({ ...localFilters });
  // }, [localFilters.startDate, localFilters.endDate, localFilters.brand, localFilters.platform, localFilters.metric1, localFilters.metric2]);

  // Process data for chart
  const chartData = React.useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];

    // Sort data by date
    const sortedData = [...data].sort((a, b) => new Date(a.Date) - new Date(b.Date));

    return sortedData.map((item) => ({
      date: item.Date,
      dateFormatted: new Date(item.Date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
      [localFilters.metric1]: Number(item[localFilters.metric1]) || 0,
      [localFilters.metric2]: Number(item[localFilters.metric2]) || 0,
    }));
  }, [data, localFilters.metric1, localFilters.metric2]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{`Date: ${label}`}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.dataKey}: ${formatNumber(entry.value)}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderToolbar = () => (
    <div className="date-filters">
      <div className="date-input-group">
        <label htmlFor="trend-start-date">Start Date:</label>
        <input
          id="trend-start-date"
          type="date"
          value={localFilters.startDate}
          onChange={(e) => onField('startDate', e.target.value)}
        />
      </div>
      <div className="date-input-group">
        <label htmlFor="trend-end-date">End Date:</label>
        <input
          id="trend-end-date"
          type="date"
          max={new Date().toISOString().split('T')[0]}
          value={localFilters.endDate}
          onChange={(e) => onField('endDate', e.target.value)}
        />
      </div>
      <div className="date-input-group">
        <label>Platform</label>
        <SingleSelectDropdown
          options={localOptions?.platforms || []}
          value={localFilters.platform[0] || ''}
          onChange={(val) => onField('platform', val ? [val] : [])}
          placeholder="Select platform..."
        />
      </div>
      <div className="date-input-group">
        <label>Metric 1 (Y-Axis 1)</label>
        <SingleSelectDropdown
          options={availableMetrics.map(m => m.key)}
          value={localFilters.metric1}
          onChange={(val) => onField('metric1', val)}
          placeholder="Select metric 1..."
        />
      </div>
      <div className="date-input-group">
        <label>Metric 2 (Y-Axis 2)</label>
        <SingleSelectDropdown
          options={availableMetrics.map(m => m.key)}
          value={localFilters.metric2}
          onChange={(val) => onField('metric2', val)}
          placeholder="Select metric 2..."
        />
      </div>
      <button onClick={onApply} className="refresh-btn">Apply</button>
    </div>
  );

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>Trend Analysis</h2>
        </div>
        <div className="loading">Loading Trend Data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>Trend Analysis</h2>
        </div>
        <div className="error">Error: {String(error)}</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Trend Analysis</h2>
        <p>Analyze trends for selected metrics over time</p>
      </div>
      {renderToolbar()}

      <div className="chart-container">
        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={600}>
            <LineChart
              data={chartData}
              margin={{
                top: 20,
                right: 80,
                left: 20,
                bottom: 60,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="dateFormatted"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 12 }}
                label={{
                  value: localFilters.metric1,
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                label={{
                  value: localFilters.metric2,
                  angle: 90,
                  position: 'insideRight',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey={localFilters.metric1}
                stroke="#8884d8"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey={localFilters.metric2}
                stroke="#82ca9d"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-info">
        <div className="info-item">
          <span className="legend-color" style={{ backgroundColor: '#8884d8' }}></span>
          <span>{localFilters.metric1}</span>
        </div>
        <div className="info-item">
          <span className="legend-color" style={{ backgroundColor: '#82ca9d' }}></span>
          <span>{localFilters.metric2}</span>
        </div>
      </div>
    </div>
  );
};

export default TrendAnalysis;
