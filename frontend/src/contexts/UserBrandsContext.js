import React, { createContext, useContext, useState, useEffect } from 'react';
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
    all: [],
    loading: false,
    error: null,
    lastFetched: null
  });

  // Global selected brand state
  const [selectedBrand, setSelectedBrand] = useState('');

  // Fetch brands from API
  const fetchBrands = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      return; // Don't fetch if not authenticated
    }

    try {
      setUserBrands(prev => ({ ...prev, loading: true, error: null }));
      const response = await api.get('/user-brands/');

      if (response.data.success) {
        const brands = response.data.brands;

        // Update brands state
        setUserBrands({
          sales: brands.Sales || brands.ALL || brands || [],
          all: brands.ALL || brands.Sales || brands || [],
          loading: false,
          error: null,
          lastFetched: new Date().toISOString()
        });

        // Set first brand as default if not already set
        const defaultBrands = brands.Sales || brands.ALL || brands || [];
        if (defaultBrands.length > 0 && !selectedBrand) {
          setSelectedBrand(defaultBrands[0]);
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
      console.error('Error fetching user brands:', err);
      setUserBrands(prev => ({
        ...prev,
        loading: false,
        error: err.response?.data?.error || err.message || 'Failed to fetch brands'
      }));
    }
  };

  // Fetch brands when component mounts and token is available
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchBrands();
    }
  }, []);

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

  const value = {
    userBrands,
    updateUserBrands,
    setLoading,
    setError,
    fetchBrands, // Expose fetch function
    // Convenience getters
    salesBrands: userBrands.sales,
    allBrands: userBrands.all,
    isLoading: userBrands.loading,
    hasError: userBrands.error,
    // Global brand selection
    selectedBrand,
    setSelectedBrand
  };

  return (
    <UserBrandsContext.Provider value={value}>
      {children}
    </UserBrandsContext.Provider>
  );
};

