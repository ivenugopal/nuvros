import React, { createContext, useContext, useState } from 'react';

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
    // Convenience getters
    salesBrands: userBrands.sales,
    allBrands: userBrands.all,
    isLoading: userBrands.loading,
    hasError: userBrands.error
  };

  return (
    <UserBrandsContext.Provider value={value}>
      {children}
    </UserBrandsContext.Provider>
  );
};

