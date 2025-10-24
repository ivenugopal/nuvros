import React, { useEffect, useState } from "react";
import { fetchHygieneTable } from "../../services/api";
import MultiSelectDropdown from "../../components/common/MultiSelectDropdown";
import Pagination from "../../components/common/Pagination";
import * as XLSX from 'xlsx';

const HygieneTable = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [appliedFilters, setAppliedFilters] = useState({
    startDate: "",
    endDate: "",
    brand: "",
    platform: [],
    hygiene: "All",
    category: "",
    subcategory: "",
  });
  const [localFilters, setLocalFilters] = useState({
    startDate: "",
    endDate: "",
    brand: "",
    platform: [],
    hygiene: "All",
    category: "",
    subcategory: "",
  });
  const [options, setOptions] = useState({
    brands: [],
    platforms: [],
    categories: [],
    subcategories: [],
  });
  const [hygieneColumns, setHygieneColumns] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  const hygieneOptions = [
    "All",
    "Price Hygiene",
    "Coupon Hygiene",
    "Activation_Hygiene",
    "Availability Hygiene",
    "Deal Hygiene",
    "EDD Hygiene",
    "Sold By Validation",
    "Rating Hygiene",
    "Catalog_Hygiene",
  ];

  const commonColumns = [
    "Date",
    "Brand",
    "Platform",
    "SKU Code",
    "ASIN",
    "Generic Title",
    "Category",
    "Sub-category",
  ];

  // Load brands from localStorage on component mount
  useEffect(() => {
    try {
      const userBrandsJson = localStorage.getItem('userBrands');
      if (userBrandsJson) {
        const userBrands = JSON.parse(userBrandsJson);
        // Use Hygiene brands if available, otherwise fall back to Sales brands
        const hygieneBrands = userBrands.Hygiene || userBrands.Sales || [];
        setOptions(prev => ({
          ...prev,
          brands: hygieneBrands
        }));
      }
    } catch (error) {
      console.error('Error loading brands from localStorage:', error);
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null); // Clear any previous errors

    try {
      const response = await fetchHygieneTable(appliedFilters);

      // Check if response was canceled (due to our debouncing mechanism)
      if (response.canceled) {
        return; // Don't update state if request was canceled
      }

      if (response.success) {
        setTotalRecords(response.data.length);
        // Only update platforms, categories, and subcategories from API response, keep brands from localStorage
        setOptions(prev => ({
          ...prev,
          platforms: response.options.platforms || [],
          categories: response.options.categories || [],
          subcategories: response.options.subcategories || []
        }));
        setHygieneColumns(response.hygiene_columns);

        // Apply pagination to the data
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedData = response.data.slice(startIndex, endIndex);
        setData(paginatedData);
        // Only clear loading when we have success
        setLoading(false);
      } else {
        // Only set error after loading is complete
        setLoading(false);
        setError(response.error || "Failed to load data");
      }
    } catch (err) {
      // Only set error after loading is complete
      setLoading(false);
      setError("Failed to load data");
    }
  };

  useEffect(() => {
    loadData();
  }, [appliedFilters, currentPage, pageSize]);

  const handleFilterChange = (key, value) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApplyFilters = () => {
    // Use React's state update batching to prevent multiple API calls
    // Wrap both state updates in a single function to be processed in the next render
    React.startTransition(() => {
      setAppliedFilters({ ...localFilters });
      setCurrentPage(1); // Reset to first page when filters change
    });
  };

  const onDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetchHygieneTable(appliedFilters);
      if (response.success) {
        const columns = getColumns();
        const worksheet = XLSX.utils.json_to_sheet(response.data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Hygiene Data");

        // Generate filename with current date
        const date = new Date().toISOString().split('T')[0];
        const filename = `hygiene_data_${date}.xlsx`;

        // Save the file
        XLSX.writeFile(workbook, filename);
      } else {
        console.error("Failed to download data");
      }
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  // Pagination handlers
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when page size changes
  };

  const handleFirstPage = () => handlePageChange(1);
  const handlePrevPage = () => handlePageChange(currentPage - 1);
  const handleNextPage = () => handlePageChange(currentPage + 1);
  const handleLastPage = () =>
    handlePageChange(Math.ceil(totalRecords / pageSize));

  // Calculate pagination values
  const totalPages = Math.ceil(totalRecords / pageSize);
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;
  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalRecords);
  const infoLabel = `Showing ${startRecord}-${endRecord} of ${totalRecords} records`;

  const getColumns = () => {
    let columns = [...commonColumns];

    if (appliedFilters.hygiene === "All") {
      // Include all hygiene-specific columns
      Object.values(hygieneColumns).forEach((hygieneCols) => {
        columns = [...columns, ...hygieneCols];
      });
    } else if (hygieneColumns[appliedFilters.hygiene]) {
      // Include only columns for selected hygiene type
      columns = [...columns, ...hygieneColumns[appliedFilters.hygiene]];
    }

    // Remove duplicates
    return [...new Set(columns)];
  };

  const renderFilters = () => (
    <div className="filters-panel">
      <div className="filters-row">
        <div className="filter-group">
          <label>Start Date</label>
          <input
            type="date"
            value={localFilters.startDate}
            onChange={(e) => handleFilterChange("startDate", e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>End Date</label>
          <input
            type="date"
            value={localFilters.endDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => handleFilterChange("endDate", e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Brand</label>
          <select
            value={localFilters.brand}
            onChange={(e) => handleFilterChange("brand", e.target.value)}
          >
            <option value="">All Brands</option>
            {options.brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Platform</label>
          <MultiSelectDropdown
            options={options.platforms}
            values={localFilters.platform}
            onChange={(values) => handleFilterChange("platform", values)}
            triggerPlaceholder="Select platforms..."
            selectAllLabel="All Platforms"
          />
        </div>
        <div className="filter-group">
          <label>Hygiene Type</label>
          <select
            value={localFilters.hygiene}
            onChange={(e) => handleFilterChange("hygiene", e.target.value)}
          >
            {hygieneOptions.map((hygiene) => (
              <option key={hygiene} value={hygiene}>
                {hygiene}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Category</label>
          <select
            value={localFilters.category}
            onChange={(e) => handleFilterChange("category", e.target.value)}
          >
            <option value="">All Categories</option>
            {options.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Sub-category</label>
          <select
            value={localFilters.subcategory}
            onChange={(e) => handleFilterChange("subcategory", e.target.value)}
          >
            <option value="">All Sub-categories</option>
            {options.subcategories.map((subcategory) => (
              <option key={subcategory} value={subcategory}>
                {subcategory}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <button className="apply-filters-btn" onClick={handleApplyFilters}>
            Apply
          </button>
        </div>
        <div className="filter-group">
          <button
            onClick={onDownload}
            className="btn-ghost"
            disabled={isDownloading}
          >
            {isDownloading ? "Downloading..." : "Download XLSX"}
          </button>
        </div>
      </div>
    </div>
  );

  const renderTable = () => {
    const columns = getColumns();

    if (data.length === 0) {
      return <div className="no-data">No data available</div>;
    }

    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} title={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column} title={row[column] || "-"}>
                    {row[column] || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="hygiene-table-container">
      <div className="table-header">
        <h2>Hygiene Table View</h2>
      </div>

      {renderFilters()}

      {loading && <div className="loading">Loading table data...</div>}
      {error && <div className="error">Error: {error}</div>}

      <div className="table-info">
        <p>Selected Category: {appliedFilters.hygiene}</p>
      </div>

      {renderTable()}

      {totalRecords > 0 && (
        <Pagination
          infoLabel={infoLabel}
          currentPage={currentPage}
          totalPages={totalPages}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          onFirst={handleFirstPage}
          onPrev={handlePrevPage}
          onNext={handleNextPage}
          onLast={handleLastPage}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          pageSizeId="hygiene-page-size"
        />
      )}
    </div>
  );
};

export default HygieneTable;
