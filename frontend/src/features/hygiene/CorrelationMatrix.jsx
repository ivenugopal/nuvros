import React, { useEffect, useState, useMemo } from 'react';
import MultiSelectDropdown from '../../components/common/MultiSelectDropdown';

const CorrelationMatrix = ({
  data,
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
    platform: filters?.platform || [],
  }));

  // Load brands from localStorage on component mount (Hygiene module)
  const [localOptions, setLocalOptions] = useState(options || {});

  useEffect(() => {
    try {
      const userBrandsJson = localStorage.getItem('userBrands');
      if (userBrandsJson) {
        const userBrands = JSON.parse(userBrandsJson);
        // Use Hygiene brands if available, otherwise fall back to Sales brands
        const hygieneBrands = userBrands.Hygiene || userBrands.Sales || [];
        setLocalOptions(prev => ({
          ...prev,
          brands: hygieneBrands
        }));
      }
    } catch (error) {
      console.error('Error loading brands from localStorage:', error);
    }
  }, []);

  // Update local options when props change (but don't override brands)
  useEffect(() => {
    setLocalOptions(prev => ({
      ...prev,
      platforms: options?.platforms || prev.platforms || []
    }));
  }, [options]);

  // Define the columns for correlation matrix
  const correlationColumns = useMemo(() => [
    'Price_Hygiene',
    'Coupon_Hygiene',
    'Activation_Hygiene',
    'Availability_Hygiene',
    'Deal_Hygiene',
    'EDD_Hygiene',
    'Sold By Validation',
    'Rating_Hygiene',
    'Catalog_Hygiene'
  ], []);

  useEffect(() => {
    setLocalFilters((prev) => ({
      ...prev,
      startDate: filters?.startDate || '',
      endDate: filters?.endDate || '',
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
      component: 'CorrelationMatrix',
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
  // }, [localFilters.startDate, localFilters.endDate, localFilters.brand, localFilters.platform]);

  // Helper function to safely parse percentage values
  const parsePercentageValue = (value) => {
    if (value === null || value === undefined || value === '') return 0;

    // Handle string values
    if (typeof value === 'string') {
      const cleanValue = value.trim();

      // Handle error strings
      if (cleanValue === '#ERROR!' || cleanValue === 'N/A' || cleanValue === 'NULL' || cleanValue === 'null') {
        return 0;
      }

      // Remove % if present and convert to float
      if (cleanValue.includes('%')) {
        return parseFloat(cleanValue.replace('%', '')) / 100 || 0;
      } else {
        return parseFloat(cleanValue) / 100 || 0;
      }
    }

    // Handle numeric values
    return parseFloat(value) / 100 || 0;
  };

  // Calculate correlation matrix
  const calculateCorrelation = (data, columns) => {
    if (!Array.isArray(data) || data.length === 0) return {};

    const matrix = {};

    for (let i = 0; i < columns.length; i++) {
      for (let j = 0; j < columns.length; j++) {
        const col1 = columns[i];
        const col2 = columns[j];

        if (!matrix[col1]) matrix[col1] = {};
        if (!matrix[col2]) matrix[col2] = {};

        if (i === j) {
          matrix[col1][col2] = 1.0;
        } else {
          // Get values for correlation calculation (all are already numeric 0-1)
          const values1 = data.map(item => parsePercentageValue(item[col1])).filter(val => !isNaN(val) && val !== null);
          const values2 = data.map(item => parsePercentageValue(item[col2])).filter(val => !isNaN(val) && val !== null);

          if (values1.length < 2 || values2.length < 2) {
            matrix[col1][col2] = 0;
            matrix[col2][col1] = 0;
            continue;
          }

          // Calculate Pearson correlation coefficient
          const mean1 = values1.reduce((sum, val) => sum + val, 0) / values1.length;
          const mean2 = values2.reduce((sum, val) => sum + val, 0) / values2.length;

          const numerator = values1.reduce((sum, val1, idx) => {
            const val2 = values2[idx];
            return sum + ((val1 - mean1) * (val2 - mean2));
          }, 0);

          const denominator1 = Math.sqrt(values1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0));
          const denominator2 = Math.sqrt(values2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0));

          const correlation = denominator1 && denominator2 ?
            numerator / (denominator1 * denominator2) : 0;

          matrix[col1][col2] = Math.round(correlation * 100) / 100;
          matrix[col2][col1] = Math.round(correlation * 100) / 100;
        }
      }
    }

    return matrix;
  };

  const correlationMatrix = React.useMemo(() => {
    return calculateCorrelation(data, correlationColumns);
  }, [data, correlationColumns]);

  // Get correlation value with color coding
  const getCorrelationValue = (col1, col2) => {
    if (!correlationMatrix[col1] || correlationMatrix[col1][col2] === undefined) return '—';
    return correlationMatrix[col1][col2];
  };

  // Format percentage value for display
  const formatPercentage = (value) => {
    if (value === '—') return '—';
    return `${(value * 100).toFixed(1)}%`;
  };

  const getCorrelationColor = (value) => {
    if (value === '—') return '#f0f0f0';
    const absValue = Math.abs(value);
    if (absValue >= 0.8) return '#d73027'; // Strong correlation (red)
    if (absValue >= 0.6) return '#fc8d59'; // Moderate-strong (orange)
    if (absValue >= 0.4) return '#fee08b'; // Moderate (yellow)
    if (absValue >= 0.2) return '#d9ef8b'; // Weak-moderate (light green)
    return '#91cf60'; // Weak (green)
  };

  const renderToolbar = () => (
    <div className="filters-toolbar">
      <div className="filters-row">
        <label>
          Start Date
          <input
            type="date"
            value={localFilters.startDate}
            onChange={(e) => onField('startDate', e.target.value)}
          />
        </label>
        <label>
          End Date
          <input
            type="date"
            value={localFilters.endDate}
            onChange={(e) => onField('endDate', e.target.value)}
          />
        </label>
        <label>
          Brand
          <select
            value={localFilters.brand}
            onChange={(e) => onField('brand', e.target.value)}
          >
            <option value="">All Brands</option>
            {(localOptions?.brands || []).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <div className="filter-group">
          <label>Platform</label>
          <MultiSelectDropdown
            options={localOptions?.platforms || []}
            values={localFilters.platform || []}
            onChange={(vals) => onField('platform', vals)}
            triggerPlaceholder="Select platforms..."
            selectAllLabel="All Platforms"
          />
        </div>
        <button onClick={onApply} className="refresh-btn">Apply</button>
      </div>
    </div>
  );

  const renderMatrix = () => {
    if (!data || data.length === 0) {
      return (
        <div className="matrix-container">
          <p>No data available for correlation analysis</p>
        </div>
      );
    }

    return (
      <div className="matrix-container">
        <div className="matrix-wrapper">
          <table className="correlation-matrix">
            <thead>
              <tr>
                <th className="matrix-header matrix-corner"></th>
                {correlationColumns.map((col) => (
                  <th key={col} className="matrix-header" title={col}>
                    {col.replace('_', ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {correlationColumns.map((rowCol, rowIndex) => (
                <tr key={rowCol}>
                  <th className="matrix-header" title={rowCol}>
                    {rowCol.replace('_', ' ')}
                  </th>
                  {correlationColumns.map((colCol, colIndex) => {
                    const value = getCorrelationValue(rowCol, colCol);
                    const color = getCorrelationColor(value);

                    return (
                      <td
                        key={colCol}
                        className="matrix-cell"
                        style={{
                          backgroundColor: color,
                          color: Math.abs(value) > 0.5 ? 'white' : 'black'
                        }}
                        title={`${rowCol} vs ${colCol}: ${formatPercentage(value)}`}
                      >
                        {formatPercentage(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Correlation Legend */}
        <div className="matrix-legend">
          <h4>Correlation Coefficient Strength</h4>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#91cf60' }}></div>
              <span>Weak (0.0 - 0.2)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#d9ef8b' }}></div>
              <span>Weak-Moderate (0.2 - 0.4)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#fee08b' }}></div>
              <span>Moderate (0.4 - 0.6)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#fc8d59' }}></div>
              <span>Moderate-Strong (0.6 - 0.8)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: '#d73027' }}></div>
              <span>Strong (0.8 - 1.0)</span>
            </div>
          </div>
          <p className="legend-note">
            Values represent correlation coefficients between hygiene percentage metrics.
            Positive values indicate positive correlation, negative indicate negative correlation.
            Color intensity shows absolute correlation strength regardless of direction.
          </p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>Correlation Matrix</h2>
        </div>
        <div className="loading">Loading correlation data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h2>Correlation Matrix</h2>
        </div>
        <div className="error">Error: {String(error)}</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Correlation Matrix</h2>
        <p>Analyze correlations between hygiene percentage metrics and business performance indicators</p>
      </div>
      {renderToolbar()}
      {renderMatrix()}
    </div>
  );
};

export default CorrelationMatrix;
