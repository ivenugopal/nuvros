import React from 'react';

const Sidebar = ({
  modules,
  activeModule,
  setActiveModule,
  activeTab,
  setActiveTab,
  sidebarCollapsed,
  setSidebarCollapsed,
  expandedModules,
  toggleModuleExpansion,
  onLogout,
}) => (
  <nav className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
    <div className="sidebar-header">
      <div className="sidebar-brand">
        {!sidebarCollapsed && <span className="brand-text">Navigation</span>}
      </div>
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className="toggle-icon">
          {sidebarCollapsed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          )}
        </span>
      </button>
    </div>
    <div className="sidebar-content">
      {modules.map((module) => (
        <div key={module.key} className="module-section">
          <div
            className={`module-header ${activeModule === module.key ? 'active' : ''}`}
            onClick={() => {
              if (activeModule === module.key) {
                toggleModuleExpansion(module.key);
              } else {
                setActiveModule(module.key);
                // Expand and set first tab
                toggleModuleExpansion(module.key);
                if (module.tabs.length > 0) setActiveTab(module.tabs[0].key);
              }
            }}
          >
            <span className="module-icon">{module.icon}</span>
            {!sidebarCollapsed && <span className="module-label">{module.label}</span>}
            {!sidebarCollapsed && (
              <span className={`module-chevron ${expandedModules[module.key] ? 'expanded' : ''}`}>
                ▼
              </span>
            )}
          </div>
          {!sidebarCollapsed && activeModule === module.key && expandedModules[module.key] && (
            <ul className="module-tabs">
              {module.tabs.map((tab) => (
                <li
                  key={tab.key}
                  className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => {
                    setActiveModule(module.key);
                    setActiveTab(tab.key);
                  }}
                >
                  {tab.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
    <div className="sidebar-footer">
      <button 
        onClick={onLogout} 
        className="sidebar-logout-btn"
        title="Logout"
      >
        {!sidebarCollapsed && <span>Logout</span>}
        <svg 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          className="logout-icon"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16,17 21,12 16,7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </div>
  </nav>
);

export default Sidebar;


