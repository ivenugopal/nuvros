import React from 'react';

const AuthCard = ({
  authView,
  setAuthView,
  authError,
  authLoading,
  authForm,
  onAuthChange,
  onLogin,
  onSignup,
}) => (
  <div className="auth-container">
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-logo">
          <div className="logo-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="12" fill="url(#gradient)" />
              <path d="M20 10L28 15V25L20 30L12 25V15L20 10Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 20L28 15M20 20L12 15M20 20V30" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="40" y2="40">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
        <h2 className="auth-title">Welcome</h2>
        <p className="auth-subtitle">
          {authView === 'login'
            ? 'Sign in to access your analytics dashboard'
            : 'Create an account to get started'}
        </p>
      </div>

      <nav className="auth-toggle" role="tablist">
        <button
          className={`auth-tab ${authView === 'login' ? 'active' : ''}`}
          onClick={() => setAuthView('login')}
          role="tab"
          aria-selected={authView === 'login'}
          type="button"
        >
          <span className="tab-icon">🔐</span>
          Sign In
        </button>
        <button
          className={`auth-tab ${authView === 'signup' ? 'active' : ''}`}
          onClick={() => setAuthView('signup')}
          role="tab"
          aria-selected={authView === 'signup'}
          type="button"
        >
          <span className="tab-icon">✨</span>
          Sign Up
        </button>
      </nav>

      {authError && (
        <div className="auth-error" role="alert">
          <span className="error-icon">⚠️</span>
          {authError}
        </div>
      )}

      <div className="auth-content">
        {authView === 'login' ? (
          <form onSubmit={onLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="login-username" className="form-label">
                <span className="label-text">Username</span>
                <span className="label-required">*</span>
              </label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input
                  id="login-username"
                  name="username"
                  value={authForm.username}
                  onChange={onAuthChange}
                  placeholder="Enter your username"
                  className="form-input"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="login-password" className="form-label">
                <span className="label-text">Password</span>
                <span className="label-required">*</span>
              </label>
              <div className="input-wrapper">
                <span className="input-icon">🔒</span>
                <input
                  id="login-password"
                  type="password"
                  name="password"
                  value={authForm.password}
                  onChange={onAuthChange}
                  placeholder="Enter your password"
                  className="form-input"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button type="submit" disabled={authLoading} className="auth-submit-btn">
              {authLoading ? (
                <>
                  <span className="btn-loader"></span>
                  Signing in...
                </>
              ) : (
                <>
                  <span className="btn-icon">→</span>
                  Sign In
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={onSignup} className="auth-form">
            <div className="form-group">
              <label htmlFor="signup-username" className="form-label">
                <span className="label-text">Username</span>
                <span className="label-required">*</span>
              </label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input
                  id="signup-username"
                  name="username"
                  value={authForm.username}
                  onChange={onAuthChange}
                  placeholder="Choose a username"
                  className="form-input"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-email" className="form-label">
                <span className="label-text">Email</span>
              </label>
              <div className="input-wrapper">
                <span className="input-icon">📧</span>
                <input
                  id="signup-email"
                  type="email"
                  name="email"
                  value={authForm.email}
                  onChange={onAuthChange}
                  placeholder="Enter your email"
                  className="form-input"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-fullname" className="form-label">
                <span className="label-text">Full Name</span>
              </label>
              <div className="input-wrapper">
                <span className="input-icon">✍️</span>
                <input
                  id="signup-fullname"
                  name="full_name"
                  value={authForm.full_name}
                  onChange={onAuthChange}
                  placeholder="Enter your full name"
                  className="form-input"
                  autoComplete="name"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-password" className="form-label">
                <span className="label-text">Password</span>
                <span className="label-required">*</span>
              </label>
              <div className="input-wrapper">
                <span className="input-icon">🔒</span>
                <input
                  id="signup-password"
                  type="password"
                  name="password"
                  value={authForm.password}
                  onChange={onAuthChange}
                  placeholder="Create a strong password"
                  className="form-input"
                  required
                  autoComplete="new-password"
                />
              </div>
              <small className="form-hint">At least 8 characters recommended</small>
            </div>

            <button type="submit" disabled={authLoading} className="auth-submit-btn">
              {authLoading ? (
                <>
                  <span className="btn-loader"></span>
                  Creating account...
                </>
              ) : (
                <>
                  <span className="btn-icon">✓</span>
                  Create Account
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <div className="auth-footer">
        <p className="footer-text">
          {authView === 'login'
            ? "Don't have an account? "
            : "Already have an account? "}
          <button
            type="button"
            className="footer-link"
            onClick={() => setAuthView(authView === 'login' ? 'signup' : 'login')}
          >
            {authView === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  </div>
);

export default AuthCard;


