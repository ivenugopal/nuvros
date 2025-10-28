import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';

const UserBrandsContext = createContext();

export const useUserBrands = () => {
  const context = useContext(UserBrandsContext);
  if (!context) {
    throw new Error('useUserBrands must be used within a UserBrandsProvider');
  }
  return context;
};

export const UserBrandsProvider = ({ children }) => {
  const [userBrands, setUserBrands] = useState({
    sales: [],
    hygiene: [],
    drr: [],
    all: [],
    loading: false,
    error: null,
    lastFetched: null
  });

  // Global selected brand state - now supports multiple brands
  const [selectedBrand, setSelectedBrand] = useState([]);

  // Track current active module to show relevant brands
  const [activeModule, setActiveModule] = useState('sales');

  // Store selected brands per module to retain selection when switching back
  const [moduleSelectedBrands, setModuleSelectedBrands] = useState({
    sales: [],
    hygiene: [],
    hygiene_eqcom: [],
    drr: []
  });

  // Use ref to track if brands have been fetched to prevent duplicate calls
  const hasFetchedRef = useRef(false);

  // Use ref to track selected brand for use in fetchBrands callback
  const selectedBrandRef = useRef(selectedBrand);

  // Use ref to track activeModule for use in callbacks
  const activeModuleRef = useRef(activeModule);

  // Keep ref in sync with state
  useEffect(() => {
    selectedBrandRef.current = selectedBrand;
  }, [selectedBrand]);

  // Keep activeModule ref in sync
  useEffect(() => {
    activeModuleRef.current = activeModule;
  }, [activeModule]);

  // Auto-switch brand selection when module changes
  useEffect(() => {
    // Wait for brands to load
    if (userBrands.loading || (!userBrands.sales.length && !userBrands.hygiene.length && !userBrands.drr.length)) {
      return;
    }

    console.log('🔄 UserBrandsContext - activeModule changed:', activeModule);
    console.log('📦 moduleSelectedBrands:', moduleSelectedBrands);

    // Get the brands for the current module
    const currentModuleBrands = activeModule === 'sales' ? userBrands.sales
      : (activeModule === 'hygiene' || activeModule === 'hygiene_eqcom') ? userBrands.hygiene
      : activeModule === 'drr' ? userBrands.drr
      : userBrands.sales;

    // Check if there's a saved selection for this module
    const savedSelection = moduleSelectedBrands[activeModule];

    if (savedSelection && savedSelection.length > 0) {
      // Validate saved brands exist in current module
      const validSaved = savedSelection.filter(b => currentModuleBrands.includes(b));
      if (validSaved.length > 0) {
        console.log('♻️ Restoring saved brands for', activeModule, ':', validSaved);
        setSelectedBrand(validSaved);
        return;
      }
    }

    // No valid saved selection - select first brand
    if (currentModuleBrands.length > 0) {
      const firstBrand = [currentModuleBrands[0]];
      console.log('🔄 Auto-selecting first brand for', activeModule, ':', firstBrand);
      setSelectedBrand(firstBrand);
      // Save this selection
      setModuleSelectedBrands(prev => ({
        ...prev,
        [activeModule]: firstBrand
      }));
    }
  }, [activeModule, userBrands, moduleSelectedBrands]);

  // Fetch brands from API
  const fetchBrands = useCallback(async () => {
    // Prevent duplicate API calls
    if (hasFetchedRef.current) {
      console.log('⚠️ Brands already fetched, skipping duplicate API call');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.log('⚠️ No auth token, skipping brand fetch');
      return; // Don't fetch if not authenticated
    }

    try {
      hasFetchedRef.current = true; // Mark as fetched before the call
      setUserBrands(prev => ({ ...prev, loading: true, error: null }));
      console.log('🔥 Fetching user brands from API...');
      const response = await api.get('/user-brands/');

      if (response.data.success) {
        const brands = response.data.brands;
        console.log('✅ Brands fetched successfully:', brands);

        // Update brands state with module-specific brands
        const salesBrandsList = brands.Sales || brands.ALL || brands || [];
        const hygieneBrandsList = brands.Hygiene || brands.ALL || brands || [];
        const drrBrandsList = brands.DRR || brands.ALL || brands || [];
        const allBrandsList = brands.ALL || brands.Sales || brands || [];

        setUserBrands({
          sales: salesBrandsList,
          hygiene: hygieneBrandsList,
          drr: drrBrandsList,
          all: allBrandsList,
          loading: false,
          error: null,
          lastFetched: new Date().toISOString()
        });

        // Auto-select first brand from the active module (default to sales)
        const currentActiveModule = activeModuleRef.current;
        const currentModuleBrands = currentActiveModule === 'sales' ? salesBrandsList
          : currentActiveModule === 'hygiene' || currentActiveModule === 'hygiene_eqcom' ? hygieneBrandsList
          : currentActiveModule === 'drr' ? drrBrandsList
          : salesBrandsList;

        if (currentModuleBrands.length > 0 && selectedBrandRef.current.length === 0) {
          console.log('🔄 Auto-selecting first brand on initial load for module:', currentActiveModule, '→', currentModuleBrands[0]);
          const firstBrand = [currentModuleBrands[0]];
          setSelectedBrand(firstBrand);
          // Save to module-specific selection using the current active module from ref
          setModuleSelectedBrands(prev => {
            const updated = {
              ...prev,
              [currentActiveModule]: firstBrand
            };
            console.log('💾 Initial brand save - moduleSelectedBrands updated:', updated);
            return updated;
          });
        }

        // Store in localStorage for persistence
        localStorage.setItem('userBrands', JSON.stringify(brands));
      } else {
        setUserBrands(prev => ({
          ...prev,
          loading: false,
          error: response.data.error || 'Failed to fetch brands'
        }));
      }
    } catch (err) {
      console.error('❌ Error fetching user brands:', err);
      hasFetchedRef.current = false; // Reset flag on error so it can be retried
      setUserBrands(prev => ({
        ...prev,
        loading: false,
        error: err.response?.data?.error || err.message || 'Failed to fetch brands'
      }));
    }
  }, []); // Empty dependency array is now safe since we use refs

  // Fetch brands when component mounts and token is available
  useEffect(() => {
    console.log('🔍 UserBrandsContext useEffect triggered', {
      hasFetched: hasFetchedRef.current,
      hasToken: !!localStorage.getItem('token')
    });
    const token = localStorage.getItem('token');
    if (token && !hasFetchedRef.current) {
      console.log('✅ Conditions met, calling fetchBrands');
      fetchBrands();
    } else {
      console.log('⏭️ Skipping fetchBrands', {
        reason: !token ? 'No token' : 'Already fetched'
      });
    }
  }, [fetchBrands]);

  const updateUserBrands = (brandsData) => {
    setUserBrands({
      sales: brandsData.Sales || [],
      all: brandsData.All || brandsData.Sales || [],
      loading: false,
      error: null,
      lastFetched: new Date().toISOString()
    });
  };

  const setLoading = (loading) => {
    setUserBrands(prev => ({ ...prev, loading }));
  };

  const setError = (error) => {
    setUserBrands(prev => ({ ...prev, error, loading: false }));
  };

  // Force refetch brands (useful after login)
  const refetchBrands = useCallback(async () => {
    console.log('🔄 Force refetching brands...');
    hasFetchedRef.current = false; // Reset the flag to allow refetch
    await fetchBrands();
  }, [fetchBrands]);

  // Reset all brand state (useful on logout)
  const resetBrands = useCallback(() => {
    console.log('🔄 Resetting all brand state...');
    hasFetchedRef.current = false; // Reset the fetch flag
    setSelectedBrand([]); // Clear selected brands (now an array)
    setModuleSelectedBrands({
      sales: [],
      hygiene: [],
      hygiene_eqcom: [],
      drr: []
    });
    setUserBrands({
      sales: [],
      hygiene: [],
      drr: [],
      all: [],
      loading: false,
      error: null,
      lastFetched: null
    });
    localStorage.removeItem('userBrands');
  }, []);

  // Custom brand setter that saves selection per module
  const setSelectedBrandForModule = useCallback((brands) => {
    const currentModule = activeModuleRef.current;
    console.log(`💾 Saving brand selection for ${currentModule}:`, brands);
    setSelectedBrand(brands);
    // Save the selection for the current module
    setModuleSelectedBrands(prev => ({
      ...prev,
      [currentModule]: brands
    }));
  }, []); // Empty deps - uses ref for activeModule

  const value = {
    userBrands,
    updateUserBrands,
    setLoading,
    setError,
    fetchBrands, // Expose fetch function
    refetchBrands, // Expose refetch function for login scenarios
    resetBrands, // Expose reset function for logout scenarios
    // Convenience getters
    salesBrands: userBrands.sales,
    hygieneBrands: userBrands.hygiene,
    drrBrands: userBrands.drr,
    allBrands: userBrands.all,
    isLoading: userBrands.loading,
    hasError: userBrands.error,
    // Global brand selection
    selectedBrand,
    setSelectedBrand: setSelectedBrandForModule, // Use custom setter that saves per module
    // Active module tracking
    activeModule,
    setActiveModule,
    // Module-specific brand selections
    moduleSelectedBrands
  };

  return (
    <UserBrandsContext.Provider value={value}>
      {children}
    </UserBrandsContext.Provider>
  );
};

