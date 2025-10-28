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

    return brands;
  }, [activeModule, salesBrands, hygieneBrands, drrBrands, allBrands]);

  // Filter selected brands to only include those that exist in current module's brand list
  const validSelectedBrands = useMemo(() => {
    if (!moduleBrands || moduleBrands.length === 0) return [];
    if (!selectedBrand || selectedBrand.length === 0) return [];

    const valid = selectedBrand.filter(brand => moduleBrands.includes(brand));

    // Log if there's a mismatch
    if (valid.length !== selectedBrand.length) {
      console.log('⚠️ BrandSelector - Filtering invalid brands:', {
        activeModule,
        selectedBrand,
        validSelectedBrands: valid,
        moduleBrands: moduleBrands.slice(0, 3)
      });
    }

    return valid;
  }, [selectedBrand, moduleBrands, activeModule]);

  const handleBrandChange = (newBrands) => {
    console.log('🔄 BrandSelector - Manual brand change:', newBrands, 'for module:', activeModule);
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
            : validSelectedBrands.length === 0
              ? 'Select brands...'
              : validSelectedBrands.length === 1
                ? validSelectedBrands[0]
                : `${validSelectedBrands.length} brands selected`
        }
        options={moduleBrands || []}
        values={validSelectedBrands}
        onChange={handleBrandChange}
      />
    </div>
  );
};

export default BrandSelector;

