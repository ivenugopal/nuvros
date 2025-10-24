import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const menuBaseStyle = {
  position: 'fixed',
  zIndex: 9999,
  background: 'var(--dropdown-bg, linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.98) 100%))',
  border: '1px solid var(--border-color, rgba(102, 126, 234, 0.2))',
  borderRadius: '12px',
  boxShadow: '0 8px 32px rgba(102, 126, 234, 0.15), 0 4px 16px rgba(0, 0, 0, 0.1)',
  maxHeight: '320px',
  overflow: 'auto',
  padding: '12px',
  fontSize: '13.5px',
  backdropFilter: 'blur(8px)',
  color: 'var(--text-color, #333)'
};

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

const valueTextStyle = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const searchStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  marginBottom: '8px',
  borderRadius: '8px',
  border: '1px solid var(--border-color, rgba(102, 126, 234, 0.3))',
  background: 'var(--input-bg, rgba(255, 255, 255, 0.9))',
  color: 'var(--text-color, #495057)'
};

const listItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 8px',
  cursor: 'pointer',
  lineHeight: 1.6,
  borderRadius: '6px',
  transition: 'background-color 0.2s ease'
};

export default function SingleSelectDropdown({
  id,
  className = 'platform-select',
  placeholder = 'Select...',
  options = [],
  value = '',
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

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
    const width = Math.max(rect.width, 260);
    const padding = 12;

    let left = rect.left;
    let top = rect.bottom + 6;

    if (left + width + padding > viewportWidth) {
      left = Math.max(padding, viewportWidth - width - padding);
    }
    if (left < padding) left = padding;

    const estimatedHeight = Math.min(320, viewportHeight - top - padding);
    if (top + estimatedHeight + padding > viewportHeight) {
      const aboveTop = rect.top - Math.min(320, rect.top - padding) - 6;
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = Array.isArray(options) ? options : [];
    if (!q) return arr.filter(Boolean);
    return arr.filter((opt) => (opt || '').toLowerCase().includes(q));
  }, [options, query]);

  const display = () => {
    return value || '';
  };

  const selectValue = (val) => {
    onChange && onChange(val);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        id={id}
        className={className}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((o) => !o); }}
        style={triggerStyle}
      >
        <span style={{ ...valueTextStyle, opacity: display() ? 1 : 0.6 }}>
          {display() || placeholder}
        </span>
        <span style={{ marginLeft: 8, opacity: 0.6 }}>▾</span>
      </div>
      {open && createPortal((
        <div
          ref={menuRef}
          style={{
            ...menuBaseStyle,
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: Math.min(320, Math.max(200, window.innerHeight - menuPos.top - 16)),
          }}
        >
          <input style={searchStyle} type="text" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
          {filtered.map((opt) => (
            <div
              key={opt}
              style={listItemStyle}
              onClick={() => selectValue(opt)}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg, rgba(102, 126, 234, 0.1))'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span>{opt}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 8, color: 'var(--text-secondary, #777)' }}>No options</div>
          )}
        </div>
      ), document.body)}
    </div>
  );
}












