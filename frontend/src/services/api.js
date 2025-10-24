/* eslint-disable no-underscore-dangle */
import axios from 'axios';

// Base URL selection mirrors existing logic in App.js
export const apiBaseURL = process.env.REACT_APP_API_BASE_URL || (
  window.location.hostname === 'localhost'
    ? 'http://localhost:8000/api/'
    : 'https://nuvr.tech/api/'
);

export const api = axios.create({
  baseURL: apiBaseURL,
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

// Attach Authorization header if token exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    // eslint-disable-next-line no-param-reassign
    config.headers = config.headers || {};
    // eslint-disable-next-line no-param-reassign
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Allow consumers to hook into auth lifecycle
let onTokenRefreshedCb = () => {};
let onSessionExpiredCb = () => {};

export const setupAuthInterceptors = ({ onTokenRefreshed, onSessionExpired } = {}) => {
  onTokenRefreshedCb = typeof onTokenRefreshed === 'function' ? onTokenRefreshed : () => {};
  onSessionExpiredCb = typeof onSessionExpired === 'function' ? onSessionExpired : () => {};
};

// Response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            // eslint-disable-next-line no-param-reassign
            originalRequest.headers = originalRequest.headers || {};
            // eslint-disable-next-line no-param-reassign
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      // eslint-disable-next-line no-param-reassign
      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('No token available');

        const refreshResponse = await axios.post(`${apiBaseURL}auth/refresh/`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (refreshResponse.data?.success && refreshResponse.data?.token) {
          const newToken = refreshResponse.data.token;
          localStorage.setItem('token', newToken);
          try { onTokenRefreshedCb(newToken); } catch (e) {}

          processQueue(null, newToken);

          // Retry original request with new token
          // eslint-disable-next-line no-param-reassign
          originalRequest.headers = originalRequest.headers || {};
          // eslint-disable-next-line no-param-reassign
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }

        throw new Error('Token refresh failed');
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('token');
        try { onSessionExpiredCb(refreshError); } catch (e) {}
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Proactive token refresh: checks every 10 minutes by default
export const startProactiveRefresh = (intervalMs = 600000) => {
  const tick = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const parts = token.split('.');
      if (parts.length !== 3) return;
      const payload = JSON.parse(atob(parts[1]));
      const expiryTime = payload.exp * 1000;
      const timeUntilExpiry = expiryTime - Date.now();
      if (timeUntilExpiry <= 3600000 && timeUntilExpiry > 0) {
        const refreshResponse = await axios.post(`${apiBaseURL}auth/refresh/`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (refreshResponse.data?.success && refreshResponse.data?.token) {
          const newToken = refreshResponse.data.token;
          localStorage.setItem('token', newToken);
          try { onTokenRefreshedCb(newToken); } catch (e) {}
        }
      }
    } catch (err) {
      // non-blocking; interceptor handles expirations on demand
    }
  };

  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
};

// API functions for Platform Sales Summary
export const fetchPlatformSalesSubcategoryDrilldown = async (filters) => {
  const params = new URLSearchParams();
  
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.platform) params.append('platform', filters.platform);
  if (filters.city) params.append('city', filters.city);
  if (filters.supply_source) params.append('supply_source', filters.supply_source);
  if (filters.brand) params.append('brand', filters.brand);
  if (filters.category) params.append('category', filters.category);
  
  const response = await api.get(`platform-sales-subcategory-drilldown/?${params.toString()}`);
  return response.data;
};


// Ads Overview
export const fetchAdsOverview = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.brand) params.append('brand', filters.brand);
  if (filters.platform) params.append('platform', filters.platform);
  if (filters.groupBy) params.append('group_by', filters.groupBy);
  const response = await api.get(`ads-overview/?${params.toString()}`);
  return response.data;
};


// Ads Category Spends (pivot-style by dates)
export const fetchAdsCategorySpends = async ({ startDate, endDate, brands = [] } = {}) => {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  if (brands && brands.length > 0) params.append('brands', brands.join(','));
  const response = await api.get(`ads-category-spends/?${params.toString()}`);
  return response.data;
};

// Hygiene Overview
export const fetchHygieneOverview = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.brand) params.append('brand', filters.brand);
  if (filters.platform && filters.platform.length > 0) {
    params.append('platform', filters.platform.join(','));
  }

  const response = await api.get(`hygiene-overview/?${params.toString()}`);
  return response.data;
};

// Trend Analysis - Fetch data from public.ecom_consolidated
export const fetchTrendAnalysis = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.brand) params.append('brand', filters.brand);
  if (filters.platform && filters.platform.length > 0) {
    params.append('platform', filters.platform[0]); // Take first platform for trend analysis
  }
  // We don't need to specify metric1 and metric2 as the backend will return all relevant columns

  const response = await api.get(`trend-analysis/?${params.toString()}`);
  return response.data;
};

// Correlation Matrix - Fetch correlation data from public.ecom_consolidated
export const fetchCorrelationMatrix = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.brand) params.append('brand', filters.brand);
  if (filters.platform && filters.platform.length > 0) {
    params.append('platform', filters.platform.join(','));
  }

  const response = await api.get(`correlation-matrix/?${params.toString()}`);
  return response.data;
};

// Hygiene Table View - Fetch hygiene table data from public.ecom_consolidated
let hygieneTableRequestId = 0; // Request identifier to prevent race conditions

export const fetchHygieneTable = async (filters = {}) => {
  // Generate a unique request ID for this call
  const currentRequestId = ++hygieneTableRequestId;

  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.brand) params.append('brand', filters.brand);
  if (filters.platform && filters.platform.length > 0) {
    params.append('platform', filters.platform.join(','));
  }
  if (filters.hygiene) params.append('hygiene', filters.hygiene);

  // Create a small delay to allow other potential calls to be canceled
  await new Promise(resolve => setTimeout(resolve, 50));

  // If another request has been made after this one, abort this request
  if (currentRequestId !== hygieneTableRequestId) {
    console.log('Cancelling stale hygiene table request');
    return { success: false, canceled: true };
  }

  // Make the API call only if this is still the most recent request
  const response = await api.get(`hygiene-table/?${params.toString()}`);

  // Return the data only if this is still the most recent request
  if (currentRequestId === hygieneTableRequestId) {
    return response.data;
  } else {
    console.log('Discarding results from stale hygiene table request');
    return { success: false, canceled: true };
  }
};


