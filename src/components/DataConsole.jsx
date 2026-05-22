import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Database, Trash2, Key, FileSpreadsheet, Zap } from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import { parseExcelFile } from '../utils/excelParser';
import { buildHaystackLower, tokenizeQuery, rowMatchesTokens } from '../utils/fuzzySearch.mjs';

/**
 * 数据控制台组件
 * Bento Grid风格，包含Excel上传、字段管理和数据查询功能
 */

function DataConsole({ onRowSelected, onBindToSlot, slots }) {
  const { 
    activeHeaders, 
    rows, 
    primaryKey, 
    currentRow,
    setPrimaryKey,
    resetExcelData,
    fieldDefinitions,
    excelHeaderCheck,
  } = useDataStore();
  
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showAllSelectedFields, setShowAllSelectedFields] = useState(false);
  const [tableViewportHeight, setTableViewportHeight] = useState(0);
  const [tableStartIndex, setTableStartIndex] = useState(0);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const fileInputRef = useRef(null);
  const rowRefs = useRef(new Map());
  const lastAutoSelectedKeyRef = useRef('');
  const tableViewportRef = useRef(null);
  const tableScrollRef = useRef(null);
  const tableScrollRafRef = useRef(0);
  const pendingScrollTopRef = useRef(0);

  // 处理文件上传
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('请上传 Excel 文件（.xlsx 或 .xls）');
      return;
    }
    
    const expectedHeaders = (fieldDefinitions || [])
      .map((def) => def?.key)
      .filter(Boolean);
    try {
      await parseExcelFile(file, { expectedHeaders });
    } catch (err) {
      void err;
    }
  };

  // 处理拖拽上传
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('请上传 Excel 文件（.xlsx 或 .xls）');
      return;
    }
    
    const expectedHeaders = (fieldDefinitions || [])
      .map((def) => def?.key)
      .filter(Boolean);
    try {
      await parseExcelFile(file, { expectedHeaders });
    } catch (err) {
      void err;
    }
  };

  // 设置主键
  const handleSetPrimaryKey = (header) => {
    setPrimaryKey(header);
  };

  const getRowKey = useCallback((row, rowIndex) => {
    const idx = Number.isInteger(rowIndex) ? rowIndex : -1;
    const pk = String(primaryKey || '').trim();
    const pkValRaw = pk && row && typeof row === 'object' ? row[pk] : null;
    const pkVal = pkValRaw == null ? '' : String(pkValRaw).trim();
    if (pk && pkVal) return `${pk}:${pkVal}:${idx}`;
    return `row:${idx}`;
  }, [primaryKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 150);
    return () => clearTimeout(t);
  }, [searchInput]);

  const indexedRows = useMemo(() => {
    const headers = Array.isArray(activeHeaders) && activeHeaders.length > 0 ? activeHeaders : null;
    return (rows || []).map((row, idx) => ({
      row,
      rowIndex: idx,
      haystackLower: buildHaystackLower(row, headers),
    }));
  }, [activeHeaders, rows]);

  const queryTokens = useMemo(() => tokenizeQuery(debouncedQuery), [debouncedQuery]);

  const filteredEntries = useMemo(() => {
    if (!Array.isArray(indexedRows) || indexedRows.length === 0) return [];
    if (!Array.isArray(queryTokens) || queryTokens.length === 0) return indexedRows;
    return indexedRows.filter((it) => rowMatchesTokens(it.haystackLower, queryTokens));
  }, [indexedRows, queryTokens]);

  const normalizedSlots = useMemo(
    () => (Array.isArray(slots) ? slots.filter((s) => s && s.id != null) : []),
    [slots],
  );
  const effectiveSelectedSlotId = useMemo(() => {
    const v = String(selectedSlotId || '').trim();
    if (v && normalizedSlots.some((s) => String(s?.id) === v)) return v;
    const first = normalizedSlots[0];
    return first ? String(first.id) : '';
  }, [normalizedSlots, selectedSlotId]);

  useEffect(() => {
    if (!Array.isArray(queryTokens) || queryTokens.length === 0) {
      lastAutoSelectedKeyRef.current = '';
      return;
    }
    if (!Array.isArray(filteredEntries) || filteredEntries.length === 0) return;
    const first = filteredEntries[0];
    const key = getRowKey(first.row, first.rowIndex);
    if (lastAutoSelectedKeyRef.current === key) return;
    lastAutoSelectedKeyRef.current = key;

    onRowSelected?.(first.row);
    const ROW_HEIGHT = 34;
    const el = tableScrollRef.current;
    if (!el) return;
    const top = Math.max(0, first.rowIndex * ROW_HEIGHT - Math.round((tableViewportHeight || 0) * 0.35));
    if (typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: 'smooth' });
  }, [filteredEntries, getRowKey, onRowSelected, queryTokens, tableViewportHeight]);

  useEffect(() => {
    const el = tableViewportRef.current;
    if (!el) return;
    const update = () => {
      const box = el.getBoundingClientRect?.();
      const h = Math.round(box?.height || 0);
      if (h > 0) setTableViewportHeight((prev) => (Math.abs(prev - h) <= 2 ? prev : h));
    };
    update();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => () => {
    if (tableScrollRafRef.current) {
      cancelAnimationFrame(tableScrollRafRef.current);
      tableScrollRafRef.current = 0;
    }
  }, []);

  const visibleRows = useMemo(() => {
    const ROW_HEIGHT = 34;
    const total = filteredEntries.length;
    if (!total) return { topPad: 0, bottomPad: 0, slice: [] };
    const overscan = 8;
    const safeIndex = Math.max(0, Math.min(Number(tableStartIndex) || 0, total - 1));
    const start = Math.max(0, safeIndex - overscan);
    const viewportCount = Math.max(1, Math.ceil((tableViewportHeight || 0) / ROW_HEIGHT));
    const end = Math.min(total, start + viewportCount + overscan * 2);
    const topPad = start * ROW_HEIGHT;
    const bottomPad = Math.max(0, (total - end) * ROW_HEIGHT);
    return { topPad, bottomPad, slice: filteredEntries.slice(start, end) };
  }, [filteredEntries, tableStartIndex, tableViewportHeight]);

  const handleTableScroll = useCallback((e) => {
    pendingScrollTopRef.current = e.currentTarget?.scrollTop || 0;
    if (tableScrollRafRef.current) return;
    tableScrollRafRef.current = requestAnimationFrame(() => {
      tableScrollRafRef.current = 0;
      const ROW_HEIGHT = 34;
      const nextIndex = Math.max(0, Math.floor((pendingScrollTopRef.current || 0) / ROW_HEIGHT));
      setTableStartIndex((prev) => (prev === nextIndex ? prev : nextIndex));
    });
  }, []);

  const handleSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    setDebouncedQuery(searchInput);
  };

  // 重置数据
  const handleReset = () => {
    if (confirm('确定要清空所有数据吗？')) {
      resetExcelData();
      setSearchInput('');
      if (onRowSelected) {
          onRowSelected(null); // 清空选中
      }
    }
  };

  // 是否有数据
  const hasData = activeHeaders.length > 0;
  const MotionDiv = motion.div;

  return (
    <MotionDiv
      className="data-console h-full flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center justify-between mb-6 px-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Database className="w-4 h-4 text-emerald-500" />
          </div>
          <h3 className="font-semibold text-gray-200 tracking-tight">数据控制台</h3>
        </div>
        {hasData && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空
          </button>
        )}
      </div>

      {/* 状态A：空态 - 拖入Excel */}
      {!hasData && (
        <MotionDiv
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex-1 flex flex-col min-h-0"
        >
          <div
            className={`group relative overflow-hidden rounded-xl border border-dashed transition-all duration-300 min-h-[360px] flex-1 ${
              isDragging
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-white/10 bg-white/5 hover:border-emerald-500/50 hover:bg-white/10'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-sky-500/10 blur-3xl" />
            </div>
            <div className="relative h-full w-full px-10 py-12 flex flex-col items-center justify-center text-center">
              <div className="mb-5 p-4 rounded-2xl bg-black/20 border border-white/10 shadow-lg shadow-black/20">
                <FileSpreadsheet className="w-9 h-9 text-gray-300 group-hover:text-emerald-300 transition-colors" />
              </div>
              <p className="text-base font-semibold text-gray-100 group-hover:text-emerald-200 transition-colors">
                点击或拖入 Excel
              </p>
              <p className="text-xs text-gray-500 mt-2">支持 .xlsx / .xls 格式</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] text-gray-400">
                <span className="px-2.5 py-1 rounded-full bg-black/20 border border-white/10">可自动识别表头</span>
                <span className="px-2.5 py-1 rounded-full bg-black/20 border border-white/10">支持空格分词搜索</span>
                <span className="px-2.5 py-1 rounded-full bg-black/20 border border-white/10">可绑定到商品位</span>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </MotionDiv>
      )}

      {/* 状态B：数据态 - 字段管理 + 数据查询 */}
      {hasData && (
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 flex flex-col min-h-0"
        >
          {excelHeaderCheck && excelHeaderCheck.ok === false ? (
            <div className="mb-4 flex-shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="text-[11px] font-medium text-amber-300">Excel 字段与模板字段不一致（不阻断操作）</div>
              <div className="mt-1 text-[11px] text-amber-200/80">{String(excelHeaderCheck.message || '').trim()}</div>
            </div>
          ) : null}
          {/* 字段管理列表 */}
          <div className="mb-4 flex-shrink-0">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-3">字段列表（主键）</p>
            <div className="max-h-[96px] overflow-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20">
              <div className="flex flex-wrap gap-2">
              <AnimatePresence>
                {activeHeaders.map((header) => (
                  <MotionDiv
                    key={header}
                    className={`
                      group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md text-xs font-medium border transition-all cursor-pointer
                      ${header === primaryKey 
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' 
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20'
                      }
                    `}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => handleSetPrimaryKey(header)}
                  >
                    <span className="max-w-[80px] truncate">{header}</span>
                    {header === primaryKey && <Key className="w-3 h-3 text-emerald-500" />}
                    <span className="w-3 h-3" />
                  </MotionDiv>
                ))}
              </AnimatePresence>
              </div>
            </div>
          </div>

          {/* 数据查询栏 */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="relative group mb-4 flex-shrink-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-gray-500 group-focus-within:text-emerald-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="全表模糊搜索（支持空格分词）"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="block w-full pl-9 pr-10 py-2.5 text-sm bg-black/20 border border-white/10 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                <button
                  onClick={() => setDebouncedQuery(searchInput)}
                  className="p-1.5 rounded-md text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                >
                  <Zap className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between px-1 mb-2 flex-shrink-0">
               <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                 命中: <span className="text-gray-300">{filteredEntries.length}</span> / 总计: <span className="text-gray-300">{rows.length}</span>
               </span>
            </div>

            {/* 当前数据预览 */}
            <AnimatePresence>
              {currentRow && (
                <MotionDiv
                  className="mb-4 overflow-hidden rounded-lg border border-emerald-500/20 bg-emerald-500/5 flex-shrink-0"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-emerald-500/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                        <span className="text-xs font-semibold text-emerald-400">已选记录</span>
                        <div className="ml-auto flex items-center gap-2">
                          {Array.isArray(slots) && slots.length > 0 ? (
                            <>
                              <select
                                className="h-7 text-[11px] px-2 rounded-md border border-emerald-500/20 bg-black/20 text-emerald-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                                value={effectiveSelectedSlotId}
                                onChange={(e) => setSelectedSlotId(e.target.value)}
                              >
                                {normalizedSlots.map((s) => (
                                    <option key={String(s.id)} value={String(s.id)} className="bg-gray-900">
                                      {s.name || `商品位 ${String(s.id)}`}
                                    </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="h-7 px-2 rounded-md text-[11px] border border-emerald-500/30 text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors"
                                onClick={() => {
                                  const sid = String(effectiveSelectedSlotId || '').trim();
                                  if (!sid) return;
                                  const idx = Array.isArray(rows) ? rows.indexOf(currentRow) : -1;
                                  const ok = onBindToSlot?.(sid, currentRow, Number.isInteger(idx) ? idx : undefined);
                                  if (!ok) alert('绑定失败：请确认已选择商品位');
                                }}
                              >
                                添加到商品位
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-emerald-300/60">未配置商品位</span>
                          )}
                          <button
                            type="button"
                            className="text-[10px] text-emerald-300/80 hover:text-emerald-200 underline"
                            onClick={() => setShowAllSelectedFields((v) => !v)}
                          >
                            {showAllSelectedFields ? '收起' : '展开'}
                          </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(() => {
                        const entries = Object.entries(currentRow);
                        if (showAllSelectedFields) return entries;
                        const pk = String(primaryKey || '').trim();
                        const picked = [];
                        if (pk) {
                          const pkEntry = entries.find(([k]) => String(k) === pk);
                          if (pkEntry) picked.push(pkEntry);
                        }
                        for (let i = 0; i < entries.length && picked.length < 8; i += 1) {
                          const it = entries[i];
                          if (picked.some(([k]) => k === it[0])) continue;
                          picked.push(it);
                        }
                        return picked;
                      })().map(([key, value]) => (
                        <div key={key} className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium text-emerald-500/70 uppercase tracking-wide truncate">{key}</span>
                          <span className="text-xs text-gray-300 truncate font-mono" title={String(value)}>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </MotionDiv>
              )}
            </AnimatePresence>

            {/* 数据列表视图 (Data Table) */}
            <div className="flex-1 min-h-0 border border-white/10 rounded-lg overflow-hidden bg-black/20 flex flex-col">
              <div className="bg-white/5 px-3 py-2 border-b border-white/5">
                <h4 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">数据预览</h4>
              </div>
              <div
                ref={(el) => {
                  tableViewportRef.current = el;
                  tableScrollRef.current = el;
                }}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20"
                onScroll={handleTableScroll}
              >
                <table className="min-w-full divide-y divide-white/5">
                  <thead className="bg-white/5 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      {activeHeaders.map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {visibleRows.topPad > 0 ? (
                      <tr>
                        <td colSpan={Math.max(1, activeHeaders.length)} style={{ height: `${visibleRows.topPad}px` }} />
                      </tr>
                    ) : null}
                    {visibleRows.slice.map((it) => {
                       const row = it.row;
                       const idx = it.rowIndex;
                       const rowKey = getRowKey(row, idx);
                       const isSelected = currentRow === row;
                       return (
                        <tr 
                          key={rowKey}
                          ref={(el) => {
                            if (el) rowRefs.current.set(rowKey, el);
                            else rowRefs.current.delete(rowKey);
                          }}
                          onClick={() => {
                            if (onRowSelected) onRowSelected(row);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected 
                              ? 'bg-emerald-500/20 text-emerald-100' 
                              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                          }`}
                        >
                          {activeHeaders.map(h => (
                            <td key={h} className="px-3 py-2 whitespace-nowrap text-xs max-w-[120px] overflow-hidden text-ellipsis font-mono">
                              {String(row[h] || '')}
                            </td>
                          ))}
                        </tr>
                       );
                    })}
                    {visibleRows.bottomPad > 0 ? (
                      <tr>
                        <td colSpan={Math.max(1, activeHeaders.length)} style={{ height: `${visibleRows.bottomPad}px` }} />
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </MotionDiv>
      )}
    </MotionDiv>
  );
}

export default DataConsole;
