import React, { useMemo } from 'react';
import { useUserBrands } from '../../contexts/UserBrandsContext';
import MultiSelectDropdown from './MultiSelectDropdown';
import './BrandSelector.css';

const BrandSelector = () => {
  const {
    selectedBrand,
    setSelectedBrand,
    salesBrands,
    hygieneBrands,
    drrBrands,
    allBrands,
    activeModule,
    isLoading
  } = useUserBrands();

  // Get brands based on the active module
  const moduleBrands = useMemo(() => {
    let brands;
    switch (activeModule) {
      case 'sales':
        brands = salesBrands;
        break;
      case 'hygiene':
      case 'hygiene_eqcom':
        brands = hygieneBrands;
        break;
      case 'drr':
        brands = drrBrands;
        break;
      default:
        brands = allBrands;
    }

    console.log('🎯 BrandSelector - moduleBrands for', activeModule, ':', brands?.slice(0, 3));
    return brands;
  }, [activeModule, salesBrands, hygieneBrands, drrBrands, allBrands]);

  const handleBrandChange = (newBrands) => {
    console.log('🔄 BrandSelector - Manual brand change:', newBrands, 'for module:', activeModule);
    setSelectedBrand(newBrands);
  };

  console.log('🎯 BrandSelector render:', {
    activeModule,
    selectedBrand,
    moduleBrandsCount: moduleBrands?.length
  });

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
              ? 'Select brands...'
              : selectedBrand.length === 1
                ? selectedBrand[0]
                : `${selectedBrand.length} brands selected`
        }
        options={moduleBrands || []}
        values={selectedBrand}
        onChange={handleBrandChange}
        selectAllLabel="" // Remove "Select All" option
      />
    </div>
  );
};

export default BrandSelector;

