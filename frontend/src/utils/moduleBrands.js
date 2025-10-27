/**
 * Helper to get brands by module key from localStorage
 * This allows any component to fetch module-specific brands
 */

export const getBrandsByModule = (moduleKey) => {
  try {
    const brandsJson = localStorage.getItem('userBrands');
    if (!brandsJson) {
      return [];
    }

    const allBrands = JSON.parse(brandsJson);

    // Map module keys to brand categories
    const moduleMapping = {
      'sales': allBrands.Sales || [],
      'hygiene': allBrands.Hygiene || allBrands.Sales || [],
      'ads': allBrands.Ads || allBrands.Sales || [],
      'inventory': allBrands.Inventory || allBrands.Sales || [],
    };

    return moduleMapping[moduleKey] || allBrands.Sales || [];
  } catch (error) {
    console.error('Error getting brands by module:', error);
    return [];
  }
};

/**
 * Get the current active module from the URL or default
 */
export const getCurrentModule = () => {
  // You can implement this based on your routing logic
  // For now, return 'sales' as default
  return 'sales';
};

