import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const triggerStyle = {
  width: '100%',
  minHeight: '38px',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color, #dcdcdc)',
  background: 'var(--input-bg, #fff)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: 'var(--text-color, inherit)',
  fontSize: '13.5px',
};

const menuBaseStyle = {
  position: 'fixed',
  zIndex: 9999,
  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.98) 100%)',
  border: '1px solid rgba(102, 126, 234, 0.2)',
  borderRadius: '12px',
  boxShadow: '0 8px 32px rgba(102, 126, 234, 0.15), 0 4px 16px rgba(0, 0, 0, 0.1)',
  padding: '16px',
  width: 280,
  backdropFilter: 'blur(8px)',
};

// Dark mode styles
const darkMenuBaseStyle = {
  ...menuBaseStyle,
  background: 'linear-gradient(135deg, rgba(45, 55, 72, 0.98) 0%, rgba(26, 32, 44, 0.98) 100%)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 4px 16px rgba(0, 0, 0, 0.2)',
};

export default function NumericConditionDropdown({
  id,
  className = 'platform-select',
  value = { op: 'gt', num: '' },
  onChange,
  placeholder = 'Filter...',
  iconOnly = false,
}) {
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState(value?.op || 'gt');
  const [num, setNum] = useState(value?.num ?? '');
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Check for dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.getAttribute('data-theme') === 'dark');
    };
    checkDarkMode();
    
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setOp(value?.op || 'gt');
    setNum(value?.num ?? '');
  }, [value]);

  useEffect(() => {
    const onDocClick = (e) => {
      const insideTrigger = containerRef.current && containerRef.current.contains(e.target);
      const insideMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!insideTrigger && !insideMenu) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const updateMenuPos = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const width = Math.max(rect.width, 280);
    const padding = 12;

    // Default: open below, left-aligned with trigger
    let left = rect.left;
    let top = rect.bottom + 6;

    // Constrain horizontally
    if (left + width + padding > viewportWidth) {
      left = Math.max(padding, viewportWidth - width - padding);
    }
    if (left < padding) left = padding;

    // If not enough space below, flip above
    const estimatedHeight = 200;
    if (top + estimatedHeight + padding > viewportHeight) {
      const aboveTop = rect.top - estimatedHeight - 6;
      top = Math.max(padding, aboveTop);
    }

    setMenuPos({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    const onScroll = () => updateMenuPos();
    const onResize = () => updateMenuPos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const label = useMemo(() => {
    if (num === '' || num === null || Number.isNaN(Number(num))) return '';
    const map = { gt: 'Greater Than', lt: 'Less Than', eq: 'Equals To' };
    return `${map[op]} ${num}`;
  }, [op, num]);

  const apply = () => {
    const parsed = num === '' ? '' : Number(num);
    onChange && onChange({ op, num: parsed });
    setOpen(false);
  };

  const clear = () => {
    setOp('gt');
    setNum('');
    onChange && onChange({ op: 'gt', num: '' });
    setOpen(false);
  };

  const iconButtonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    color: '#ffffff', // Explicit white color for visibility on gradient table headers
  };

  const SlidersIcon = ({ active }) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? 'var(--primary-color, #5b7cfa)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="14" cy="6" r="2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="8" cy="12" r="2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="12" cy="18" r="2" />
    </svg>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: iconOnly ? 'auto' : '100%' }}>
      <div
        id={id}
        className={iconOnly ? '' : className}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((o) => !o); }}
        style={iconOnly ? iconButtonStyle : triggerStyle}
        aria-label={iconOnly ? 'Open numeric filter' : undefined}
        title={iconOnly ? (label || 'Filter') : undefined}
      >
        {iconOnly ? (
          <SlidersIcon active={Boolean(label)} />
        ) : (
          <>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: label ? 1 : 0.6 }}>
              {label || placeholder}
            </span>
            <span style={{ marginLeft: 8, opacity: 0.6 }}>▾</span>
          </>
        )}
      </div>
      {open && createPortal((
        <div ref={menuRef} style={{ ...(isDarkMode ? darkMenuBaseStyle : menuBaseStyle), top: menuPos.top, left: menuPos.left, width: Math.max(menuPos.width, 260) }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <select
              value={op}
              onChange={(e) => setOp(e.target.value)}
              style={{ 
                flex: '0 0 55%', 
                height: 34, 
                borderRadius: 8, 
                padding: '4px 10px', 
                border: isDarkMode ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(102, 126, 234, 0.3)', 
                background: isDarkMode ? 'rgba(45, 55, 72, 0.9)' : 'rgba(255, 255, 255, 0.9)', 
                color: isDarkMode ? '#f7fafc' : '#495057' 
              }}
            >
              <option value="gt">Greater Than</option>
              <option value="lt">Less Than</option>
              <option value="eq">Equals To</option>
            </select>
            <input
              type="number"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
              placeholder="Enter number"
              style={{ 
                flex: 1, 
                height: 34, 
                borderRadius: 8, 
                padding: '6px 10px', 
                border: isDarkMode ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(102, 126, 234, 0.3)', 
                background: isDarkMode ? 'rgba(45, 55, 72, 0.9)' : 'rgba(255, 255, 255, 0.9)', 
                color: isDarkMode ? '#f7fafc' : '#495057' 
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn-ghost" onClick={clear} style={{ padding: '6px 10px', borderRadius: 8 }}>Clear</button>
            <button className="refresh-btn" onClick={apply} style={{ padding: '6px 12px', borderRadius: 8 }}>Apply</button>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}


