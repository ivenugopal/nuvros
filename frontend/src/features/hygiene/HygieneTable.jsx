import React, { useEffect, useState } from "react";
import { fetchHygieneTable } from "../../services/api";
import MultiSelectDropdown from "../../components/common/MultiSelectDropdown";
import SingleSelectDropdown from "../../components/common/SingleSelectDropdown";
import Pagination from "../../components/common/Pagination";
import * as XLSX from 'xlsx';

const HygieneTable = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [appliedFilters, setAppliedFilters] = useState({
    startDate: "",
    endDate: "",
    platform: [],
    hygiene: "All",
    category: "",
    subcategory: "",
  });
  const [localFilters, setLocalFilters] = useState({
    startDate: "",
    endDate: "",
    platform: [],
    hygiene: "All",
    category: "",
    subcategory: "",
  });
  const [options, setOptions] = useState({
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
        // Update platforms, categories, and subcategories from API response
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
    <div className="date-filters">
      <div className="date-input-group">
        <label htmlFor="hygiene-table-start-date">Start Date:</label>
        <input
          id="hygiene-table-start-date"
          type="date"
          value={localFilters.startDate}
          onChange={(e) => handleFilterChange("startDate", e.target.value)}
        />
      </div>
      <div className="date-input-group">
        <label htmlFor="hygiene-table-end-date">End Date:</label>
        <input
          id="hygiene-table-end-date"
          type="date"
          value={localFilters.endDate}
          max={new Date().toISOString().split('T')[0]}
          onChange={(e) => handleFilterChange("endDate", e.target.value)}
        />
      </div>
      <div className="date-input-group">
        <label>Platform</label>
        <MultiSelectDropdown
          options={options.platforms}
          values={localFilters.platform}
          onChange={(values) => handleFilterChange("platform", values)}
          triggerPlaceholder="Select platforms..."
          selectAllLabel="All Platforms"
        />
      </div>
      <div className="date-input-group">
        <label>Hygiene Type</label>
        <SingleSelectDropdown
          options={hygieneOptions}
          value={localFilters.hygiene}
          onChange={(value) => handleFilterChange("hygiene", value)}
          triggerPlaceholder="Select hygiene type..."
        />
      </div>
      <div className="date-input-group">
        <label>Category</label>
        <SingleSelectDropdown
          options={options.categories}
          value={localFilters.category}
          onChange={(value) => handleFilterChange("category", value)}
          triggerPlaceholder="Select category..."
          selectAllLabel="All Categories"
        />
      </div>
      <div className="date-input-group">
        <label>Sub-category</label>
        <SingleSelectDropdown
          options={options.subcategories}
          value={localFilters.subcategory}
          onChange={(value) => handleFilterChange("subcategory", value)}
          triggerPlaceholder="Select sub-category..."
          selectAllLabel="All Sub-categories"
        />
      </div>
      <button className="refresh-btn" onClick={handleApplyFilters}>
        Apply
      </button>
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

export default React.memo(HygieneTable);
