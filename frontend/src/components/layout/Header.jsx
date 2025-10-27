import React from 'react';
import BrandSelector from '../common/BrandSelector';

const Header = ({ tokenRefreshed, children }) => (
  <header className="App-header">
    <div className="header-content">
      <h1>NuvrOS</h1>
      <p>Consolidated Data Dashboard</p>
    </div>
    {tokenRefreshed && (
      <div className="token-refresh-notification">✅ Session refreshed successfully</div>
    )}
    <div className="header-actions">
      <BrandSelector />
      {children}
    </div>
  </header>
);

export default Header;


