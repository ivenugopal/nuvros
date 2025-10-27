/**
 * Utility functions to access user brands stored globally
 */

/**
 * Get all user brands from localStorage
 * @returns {Object} Object containing all brand categories
 */
export const getUserBrands = () => {
  try {
    const brandsJson = localStorage.getItem('userBrands');
    if (!brandsJson) {
      return {
        Sales: [],
        Ads: [],
        Hygiene: [],
        Inventory: []
      };
    }
    return JSON.parse(brandsJson);
  } catch (error) {
    console.error('Error parsing user brands from localStorage:', error);
    return {
      Sales: [],
      Ads: [],
      Hygiene: [],
      Inventory: []
    };
  }
};

/**
 * Get brands for a specific category
 * @param {string} category - Category name (e.g., 'Sales', 'Ads', 'Hygiene', 'Inventory')
 * @returns {Array} Array of brand names
 */
export const getBrandsByCategory = (category) => {
  const allBrands = getUserBrands();
  return allBrands[category] || [];
};

/**
 * Get Sales brands (most commonly used)
 * @returns {Array} Array of sales brand names
 */
export const getSalesBrands = () => {
  return getBrandsByCategory('Sales');
};

/**
 * Get Ads brands
 * @returns {Array} Array of ads brand names
 */
export const getAdsBrands = () => {
  return getBrandsByCategory('Ads');
};

/**
 * Get Hygiene brands
 * @returns {Array} Array of hygiene brand names
 */
export const getHygieneBrands = () => {
  return getBrandsByCategory('Hygiene');
};

/**
 * Get Inventory brands
 * @returns {Array} Array of inventory brand names
 */
export const getInventoryBrands = () => {
  return getBrandsByCategory('Inventory');
};

/**
 * Check if a brand exists in a specific category
 * @param {string} brandName - Brand name to check
 * @param {string} category - Category name
 * @returns {boolean} True if brand exists in the category
 */
export const hasBrandInCategory = (brandName, category) => {
  const brands = getBrandsByCategory(category);
  return brands.includes(brandName);
};

/**
 * Get all unique brands across all categories
 * @returns {Array} Array of all unique brand names
 */
export const getAllUniqueBrands = () => {
  const allBrands = getUserBrands();
  const uniqueBrands = new Set();

  Object.values(allBrands).forEach(categoryBrands => {
    if (Array.isArray(categoryBrands)) {
      categoryBrands.forEach(brand => uniqueBrands.add(brand));
    }
  });

  return Array.from(uniqueBrands).sort();
};

