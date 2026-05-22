import { useEffect, useMemo, useRef, useState } from 'react';

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = '选择',
  searchPlaceholder = '搜索…',
  className = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const normalizedOptions = useMemo(() => {
    const list = Array.isArray(options) ? options : [];
    return list
      .map((o) => {
        if (!o) return null;
        const v = o.value != null ? String(o.value) : '';
        const label = o.label != null ? String(o.label) : v;
        if (!v) return null;
        return { value: v, label };
      })
      .filter(Boolean);
  }, [options]);

  const selectedLabel = useMemo(() => {
    const v = value != null ? String(value) : '';
    if (!v) return '';
    const found = normalizedOptions.find((o) => o.value === v);
    return found ? found.label : v;
  }, [normalizedOptions, value]);

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((o) => {
      const hay = `${o.label} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [normalizedOptions, query]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus?.());
  }, [open]);

  return (
    <div ref={rootRef} className={['relative', className].join(' ')}>
      <button
        type="button"
        disabled={disabled}
        className={[
          'w-full flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 border text-xs',
          disabled
            ? 'bg-white/5 border-white/10 text-slate-500 opacity-60 cursor-not-allowed'
            : 'bg-slate-950/60 border-white/10 text-slate-100 hover:bg-slate-900/70',
        ].join(' ')}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => {
            const next = !v;
            if (next) setQuery('');
            return next;
          });
        }}
      >
        <span className={['truncate', selectedLabel ? 'text-slate-100' : 'text-slate-400'].join(' ')}>
          {selectedLabel || placeholder}
        </span>
        <span className="text-slate-400">▾</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-white/5">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full border border-white/10 rounded-xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
              onClick={() => {
                onChange?.('');
                setOpen(false);
              }}
            >
              {placeholder}
            </button>
            {filtered.length > 0 ? (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={[
                    'w-full text-left px-3 py-2 text-xs hover:bg-white/5',
                    String(value || '') === o.value ? 'text-emerald-200 bg-emerald-500/10' : 'text-slate-200',
                  ].join(' ')}
                  onClick={() => {
                    onChange?.(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{o.label}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-xs text-slate-500">未找到匹配字段</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
