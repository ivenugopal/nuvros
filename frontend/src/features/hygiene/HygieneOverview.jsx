import React, { useEffect, useState } from 'react';
import MultiSelectDropdown from '../../components/common/MultiSelectDropdown';
import { useUserBrands } from '../../contexts/UserBrandsContext';

const HygieneOverview = ({
  data,
  hygieneScores,
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
  }));

  // Update local options when props change
  const [localOptions, setLocalOptions] = useState(options || {});

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
      endDate: filters?.endDate || '',
      platform: filters?.platform || [],
    }));
  }, [filters]);

  const onField = (key, value) => {
    const next = { ...localFilters, [key]: value };
    setLocalFilters(next);
  };

  const onApply = () => {
    console.log('🔘 USER ACTION: APPLY button clicked', {
      component: 'HygieneOverview',
      action: 'Manual API trigger',
      filters: localFilters
    });
    onChangeFilters && onChangeFilters({ ...localFilters });
    onRefresh && onRefresh();
  };

  const renderStatCards = () => (
    <div className="stat-cards">
      <div className="stat-card">
        <div className="stat-card-header">
          <h3>Price Hygiene Score</h3>
        </div>
        <div className="stat-card-value">
          {hygieneScores?.price_hygiene_score !== undefined 
            ? `${hygieneScores.price_hygiene_score}%` 
            : '—'
          }
        </div>
        <div className="stat-card-description">
          Price Rule = Live Price validation
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-header">
          <h3>Coupon Hygiene Score</h3>
        </div>
        <div className="stat-card-value">
          {hygieneScores?.coupon_hygiene_score !== undefined 
            ? `${hygieneScores.coupon_hygiene_score}%` 
            : '—'
          }
        </div>
        <div className="stat-card-description">
          Coupon Rule = Live Coupon validation
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-header">
          <h3>Activation Hygiene Score</h3>
        </div>
        <div className="stat-card-value">
          {hygieneScores && Object.prototype.hasOwnProperty.call(hygieneScores, 'activation_hygiene_score')
            ? `${hygieneScores.activation_hygiene_score}%`
            : '—'}
        </div>
        <div className="stat-card-description">
          Avg Activation Hygiene across listings
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-header">
          <h3>Availability Hygiene Score</h3>
        </div>
        <div className="stat-card-value">
          {hygieneScores?.availability_hygiene_score !== undefined
            ? `${hygieneScores.availability_hygiene_score}%`
            : '—'
          }
        </div>
        <div className="stat-card-description">
          Availability = Yes validation rate
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-header">
          <h3>Deal Hygiene Score</h3>
        </div>
        <div className="stat-card-value">
          {hygieneScores?.deal_hygiene_score !== undefined
            ? `${hygieneScores.deal_hygiene_score}%`
            : '—'
          }
        </div>
        <div className="stat-card-description">
          Deal Tag = Yes validation rate
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-header">
          <h3>Rating Hygiene Score</h3>
        </div>
        <div className="stat-card-value">
          {hygieneScores?.rating_hygiene_score !== undefined
            ? `${hygieneScores.rating_hygiene_score}%`
            : '—'
          }
        </div>
        <div className="stat-card-description">
          Average Rating Hygiene across listings
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-header">
          <h3>Catalog Hygiene Score</h3>
        </div>
        <div className="stat-card-value">
          {hygieneScores?.catalog_hygiene_score !== undefined
            ? `${hygieneScores.catalog_hygiene_score}%`
            : '—'
          }
        </div>
        <div className="stat-card-description">
          Average Catalog Hygiene across listings
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-header">
          <h3>EDD Hygiene Score</h3>
        </div>
        <div className="stat-card-value">
          {hygieneScores?.edd_hygiene_score !== undefined
            ? `${hygieneScores.edd_hygiene_score}%`
            : '—'
          }
        </div>
        <div className="stat-card-description">
          Average EDD Hygiene across listings
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-card-header">
          <h3>Sold By Validation Hygiene Score</h3>
        </div>
        <div className="stat-card-value">
          {hygieneScores?.sold_by_validation_score !== undefined
            ? `${hygieneScores.sold_by_validation_score}%`
            : '—'
          }
        </div>
        <div className="stat-card-description">
          Sold By Validation = Yes validation rate
        </div>
      </div>
    </div>
  );

  const renderToolbar = () => (
    <div className="filters-toolbar">
      <div className="filters-row">
        <div className="date-input-group">
          <label htmlFor="hygiene-start-date">Start Date:</label>
          <input
            id="hygiene-start-date"
            type="date"
            value={localFilters.startDate}
            onChange={(e) => onField('startDate', e.target.value)} 
          />
        </div>
        <div className="date-input-group">
          <label htmlFor="hygiene-end-date">End Date:</label>
          <input
            id="hygiene-end-date"
            type="date"
            max={new Date().toISOString().split('T')[0]}
            value={localFilters.endDate} 
            onChange={(e) => onField('endDate', e.target.value)} 
          />
        </div>
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


  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Hygiene Overview</h2>
      </div>
      {renderToolbar()}
      {loading && <div className="loading">Loading Hygiene Data...</div>}
      {error && <div className="error">Error: {String(error)}</div>}
      {renderStatCards()}
    </div>
  );
};

export default React.memo(HygieneOverview);
