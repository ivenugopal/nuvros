import React, { useState, useEffect, useCallback } from 'react';
import { formatNumber } from '../../utils/format';
import { api } from '../../services/api';
import { exportToXlsx } from '../../utils/export';

const PlatformCityHeatmap = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    brand: '',
    metric: 'gmv'
  });
  const [availableBrands, setAvailableBrands] = useState([]);
  const [showCoverage, setShowCoverage] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Initialize default dates (last 30 days)
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    const formatDate = (date) => date.toISOString().split('T')[0];
    
    setFilters(prev => ({
      ...prev,
      endDate: formatDate(today),
      startDate: formatDate(thirtyDaysAgo)
    }));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('start_date', filters.startDate);
      if (filters.endDate) params.append('end_date', filters.endDate);
      if (filters.brand) params.append('brand', filters.brand);
      params.append('metric', filters.metric);

      const response = await api.get(`platform-city-heatmap/?${params}`);
      
      if (response.data.success) {
        setData(response.data.data);
        setAvailableBrands(response.data.brands || []);
      } else {
        setError(response.data.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Error fetching data');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load data when filters change
  useEffect(() => {
    if (filters.startDate && filters.endDate) {
      fetchData();
    }
  }, [filters.startDate, filters.endDate, fetchData]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleRefresh = () => {
    fetchData();
  };

  const handleDownload = async () => {
    if (!data) return;
    
    setIsDownloading(true);
    try {
      const { platforms, cities, heatmap_data, coverage_data, platform_totals, city_totals, grand_total } = data;
      
      // Create main heatmap matrix as array of arrays
      const heatmapRows = [];
      const headerRow = ['Platform', ...cities, 'Total'];
      heatmapRows.push(headerRow);
      
      platforms.forEach(platform => {
        const row = [platform];
        cities.forEach(city => {
          const value = heatmap_data[platform]?.[city] || 0;
          row.push(value);
        });
        row.push(platform_totals[platform] || 0);
        heatmapRows.push(row);
      });
      
      // Add totals row
      const totalsRow = ['Total'];
      cities.forEach(city => {
        totalsRow.push(city_totals[city] || 0);
      });
      totalsRow.push(grand_total);
      heatmapRows.push(totalsRow);
      
      const fileName = `platform-city-heatmap-${filters.metric}-${filters.startDate}-to-${filters.endDate}.xlsx`;
      exportToXlsx(fileName, heatmapRows, `${filters.metric.toUpperCase()} Heatmap`);
    } catch (err) {
      console.error('Error downloading data:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const getColorForValue = (value, minValue, maxValue) => {
    if (value === 0) return '#f8f9fa';
    
    const intensity = (value - minValue) / (maxValue - minValue);
    const hue = 240; // Blue hue
    const saturation = 70 + (intensity * 30); // 70-100%
    const lightness = 95 - (intensity * 40); // 95-55%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  const renderHeatmap = () => {
    if (!data) return null;

    const { platforms, cities, heatmap_data, coverage_data, platform_totals, city_totals, grand_total } = data;
    const currentData = showCoverage ? coverage_data : heatmap_data;
    
    // Calculate min/max for color scaling
    const allValues = [];
    platforms.forEach(platform => {
      cities.forEach(city => {
        const value = currentData[platform]?.[city];
        if (value !== undefined && value > 0) {
          allValues.push(value);
        }
      });
    });
    
    const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
    const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;

    return (
      <div className="heatmap-container">
        <div className="heatmap-header">
          <h3>{showCoverage ? 'Coverage SKUs Heatmap' : `${filters.metric.toUpperCase()} Heatmap`}</h3>
          <div className="heatmap-controls">
            <button
              onClick={() => setShowCoverage(!showCoverage)}
              className="toggle-btn"
            >
              {showCoverage ? 'Show Values' : 'Show Coverage'}
            </button>
          </div>
        </div>
        
        <div className="heatmap-wrapper">
          <div className="heatmap-table-container">
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th className="platform-header">Platform</th>
                  {cities.map(city => (
                    <th key={city} className="city-header" title={city}>
                      {city.length > 8 ? `${city.substring(0, 8)}...` : city}
                    </th>
                  ))}
                  <th className="total-header">Total</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map(platform => (
                  <tr key={platform}>
                    <td className="platform-cell" title={platform}>
                      {platform.length > 12 ? `${platform.substring(0, 12)}...` : platform}
                    </td>
                    {cities.map(city => {
                      const value = currentData[platform]?.[city] || 0;
                      const coverageValue = coverage_data[platform]?.[city] || 0;
                      const metricValue = heatmap_data[platform]?.[city] || 0;
                      const backgroundColor = getColorForValue(value, minValue, maxValue);
                      
                      return (
                        <td
                          key={`${platform}-${city}`}
                          className="heatmap-cell"
                          style={{ backgroundColor }}
                          title={`Platform: ${platform}\nCity: ${city}\n${filters.metric.toUpperCase()}: ${formatNumber(metricValue)}\nCoverage SKUs: ${coverageValue}`}
                          onClick={() => {
                            // Future: Navigate to drill-down view
                            console.log('Drill down:', { platform, city, metricValue, coverageValue });
                          }}
                        >
                          {value > 0 ? formatNumber(value) : '-'}
                        </td>
                      );
                    })}
                    <td className="total-cell">
                      {showCoverage ? '-' : formatNumber(platform_totals[platform] || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="total-footer">Total</td>
                  {cities.map(city => (
                    <td key={city} className="total-cell">
                      {showCoverage ? '-' : formatNumber(city_totals[city] || 0)}
                    </td>
                  ))}
                  <td className="grand-total-cell">
                    {showCoverage ? '-' : formatNumber(grand_total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        
        {!showCoverage && (
          <div className="heatmap-legend">
            <div className="legend-title">Color Scale ({filters.metric.toUpperCase()})</div>
            <div className="legend-bar">
              <span className="legend-min">{formatNumber(minValue)}</span>
              <div className="legend-gradient"></div>
              <span className="legend-max">{formatNumber(maxValue)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Platform × City Heatmap</h2>
        <div className="date-filters">
          <div className="date-input-group">
            <label htmlFor="heatmap-start-date">Start Date:</label>
            <input
              id="heatmap-start-date"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="heatmap-end-date">End Date:</label>
            <input
              id="heatmap-end-date"
              type="date"
              max={new Date().toISOString().split('T')[0]}
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="heatmap-brand">Brand:</label>
            <select
              id="heatmap-brand"
              value={filters.brand}
              onChange={(e) => handleFilterChange('brand', e.target.value)}
              className="platform-select"
            >
              <option value="">All Brands</option>
              {availableBrands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>
          <div className="date-input-group">
            <label htmlFor="heatmap-metric">Metric:</label>
            <select
              id="heatmap-metric"
              value={filters.metric}
              onChange={(e) => handleFilterChange('metric', e.target.value)}
              className="platform-select"
            >
              <option value="gmv">GMV</option>
              <option value="units">Units</option>
            </select>
          </div>
          <button onClick={handleRefresh} className="refresh-btn">
            Refresh
          </button>
          <button
            onClick={handleDownload}
            className="btn-ghost"
            disabled={isDownloading || !data}
          >
            {isDownloading ? 'Downloading...' : 'Download CSV'}
          </button>
        </div>
      </div>

      {loading && <div className="loading">Loading heatmap data...</div>}

      {error && (
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={handleRefresh} className="retry-btn">Retry</button>
        </div>
      )}

      {!loading && !error && data && renderHeatmap()}
    </div>
  );
};

export default PlatformCityHeatmap;
