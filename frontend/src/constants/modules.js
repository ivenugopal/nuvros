export const modules = [
  {
    key: 'sales',
    label: 'Sales',
    icon: '📊',
    tabs: [
      { key: 'overall', label: 'Overall Sales Summary' },
      { key: 'drr', label: 'DRR Report' },
      { key: 'platformSummary', label: 'Platform Sales Summary' },
      { key: 'platformReport', label: 'Sales Performance' },
      { key: 'salesContribution', label: 'Sales Contribution' },
      { key: 'dailyReport', label: 'Daily Report' },
    ],
  },
//  {
//    key: 'inventory',
//    label: 'Inventory',
//    icon: '📦',
//    tabs: [
//      { key: 'inventory-overview', label: 'Inventory Overview' },
//      { key: 'stock-levels', label: 'Stock Levels' },
//      { key: 'inventory-movements', label: 'Inventory Movements' },
//    ],
//  },
//  {
//    key: 'po',
//    label: 'PO',
//    icon: '📋',
//    tabs: [
//      { key: 'po-overview', label: 'PO Overview' },
//      { key: 'po-tracking', label: 'PO Tracking' },
//      { key: 'po-analytics', label: 'PO Analytics' },
//    ],
//  },
//  {
//    key: 'ads',
//    label: 'Ads',
//    icon: '📢',
//    tabs: [
//      { key: 'ads-overview', label: 'Ads Overview' },
//      { key: 'campaign-performance', label: 'Category Spends' },
//      { key: 'ads-analytics', label: 'Ads Analytics' },
//    ],
//  },
  {
    key: 'hygiene',
    label: 'Hygiene ECOM',
    icon: '📢',
    tabs: [
      { key: 'hygiene-overview', label: 'Hygiene Overview' },
      { key: 'hygiene-table', label: 'Table View' },
      { key: 'trend-analysis', label: 'Trend Analysis' },
      { key: 'correlation-matrix', label: 'Correlation Matrix' },
//      { key: 'quality-metrics', label: 'Quality Metrics' },
//      { key: 'compliance-reports', label: 'Compliance Reports' },
    ],
  },
    {
    key: 'hygiene_eqcom',
    label: 'Hygiene EQCOM',
    icon: '🧼',
    tabs: [
      { key: 'hygiene-overview', label: 'Hygiene Overview' },
      { key: 'hygiene-table', label: 'Table View' },
      { key: 'trend-analysis', label: 'Trend Analysis' },
//      { key: 'quality-metrics', label: 'Quality Metrics' },
//      { key: 'compliance-reports', label: 'Compliance Reports' },
    ],
  },
];

export const getCurrentModule = (activeModule) => modules.find((m) => m.key === activeModule);
export const getCurrentTabs = (activeModule) => getCurrentModule(activeModule)?.tabs || [];
export const getCurrentTab = (activeModule, activeTab) => (
  getCurrentTabs(activeModule).find((t) => t.key === activeTab)
);


