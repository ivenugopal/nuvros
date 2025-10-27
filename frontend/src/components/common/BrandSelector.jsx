import React from 'react';
import { useUserBrands } from '../../contexts/UserBrandsContext';
import './BrandSelector.css';

const BrandSelector = () => {
  const { selectedBrand, setSelectedBrand, allBrands, isLoading } = useUserBrands();

  const handleBrandChange = (e) => {
    setSelectedBrand(e.target.value);
  };

  return (
    <div className="brand-dropdown">
      <select
        value={selectedBrand}
        onChange={handleBrandChange}
        className="brand-select"
        aria-label="Select Brand"
        disabled={isLoading}
      >
        {isLoading ? (
          <option value="">Loading brands...</option>
        ) : (
          <>
            <option value="">All Brands</option>
            {allBrands && allBrands.length > 0 ? (
              allBrands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))
            ) : (
              <option value="" disabled>No brands available</option>
            )}
          </>
        )}
      </select>
    </div>
  );
};

export default BrandSelector;

