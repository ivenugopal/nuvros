import React from 'react';
import { useUserBrands } from '../../contexts/UserBrandsContext';
import MultiSelectDropdown from './MultiSelectDropdown';
import './BrandSelector.css';

const BrandSelector = () => {
  const { selectedBrand, setSelectedBrand, allBrands, isLoading } = useUserBrands();

  const handleBrandChange = (newBrands) => {
    setSelectedBrand(newBrands);
  };

  return (
    <div className="brand-dropdown">
      <MultiSelectDropdown
        id="brand-selector"
        className="brand-select"
        placeholder="Search brands..."
        triggerPlaceholder={
          isLoading
            ? 'Loading brands...'
            : selectedBrand.length === 0
              ? 'All Brands'
              : selectedBrand.length === 1
                ? selectedBrand[0]
                : `${selectedBrand.length} brands selected`
        }
        options={allBrands || []}
        values={selectedBrand}
        onChange={handleBrandChange}
        selectAllLabel="All Brands"
      />
    </div>
  );
};

export default BrandSelector;

