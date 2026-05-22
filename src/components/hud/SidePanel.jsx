import { useEffect, useMemo, useRef, useState } from 'react';

function TextValueEditor({ initialValue, onApplyValue }) {
  const [text, setText] = useState(() => String(initialValue ?? ''));
  const [dirty, setDirty] = useState(false);
  const lastAppliedRef = useRef(String(initialValue ?? ''));

  const apply = () => {
    const next = String(text ?? '');
    if (next === lastAppliedRef.current) {
      setDirty(false);
      return;
    }
    lastAppliedRef.current = next;
    onApplyValue(next);
    setDirty(false);
  };

  const cancel = () => {
    const cur = String(lastAppliedRef.current ?? '');
    setText(cur);
    setDirty(false);
  };

  return (
    <>
      <textarea
        className="min-h-[120px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/50"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        onBlur={() => {
          if (!dirty) return;
          apply();
        }}
        placeholder="请输入文字…"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:hover:bg-white"
          onClick={cancel}
          disabled={!dirty}
        >
          取消
        </button>
        <button
          type="button"
          className="px-2 py-1 text-xs rounded-md border border-emerald-500/30 text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500/10"
          onClick={apply}
          disabled={!dirty}
        >
          应用
        </button>
      </div>
    </>
  );
}

function SidePanel({ activeHotspot, onHotspotValueChange, onEdited }) {
  const anchorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const onEditedRef = useRef(onEdited);
  useEffect(() => {
    onEditedRef.current = onEdited;
  }, [onEdited]);

  useEffect(() => {
    // 当选中的热区变化时，强制更新连线
    onEditedRef.current?.();
  }, [activeHotspot?.id]);

  const type = useMemo(() => {
    const t = activeHotspot?.type || activeHotspot?.varType;
    if (t === 'img') return 'image';
    return t || null;
  }, [activeHotspot?.type, activeHotspot?.varType]);

  const canEdit = typeof onHotspotValueChange === 'function';

  const handlePickLocalImage = async (file) => {
    if (!canEdit) return;
    if (!activeHotspot?.id) return;
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) return;
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return;
    onHotspotValueChange?.(activeHotspot.id, dataUrl);
    onEditedRef.current?.();
  };

  return (
    <div className="h-full bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
      <div id="hud-panel-anchor" ref={anchorRef} className="h-0 w-0" />

      {!activeHotspot ? (
        <div className="text-sm text-gray-500">点击左侧热区开始编辑</div>
      ) : (
        <>
          <div className="mb-3">
            <div className="text-sm font-semibold text-gray-900 truncate" title={activeHotspot.name || activeHotspot.key || activeHotspot.id}>
              {activeHotspot.name || activeHotspot.key || activeHotspot.id}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {type === 'text' ? '文字' : '图片'} · {Math.round(activeHotspot.x ?? activeHotspot.rect?.x ?? 0)},{' '}
              {Math.round(activeHotspot.y ?? activeHotspot.rect?.y ?? 0)}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs text-gray-600">当前值</div>
            {type === 'image' ? (
              <div
                className={[
                  'min-h-[120px] border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50',
                  dragActive ? 'ring-2 ring-emerald-400/60 bg-emerald-50' : '',
                ].join(' ')}
                onDragOver={canEdit ? (e) => {
                  e.preventDefault();
                  setDragActive(true);
                } : undefined}
                onDragLeave={canEdit ? () => setDragActive(false) : undefined}
                onDrop={canEdit ? async (e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer?.files?.[0];
                  await handlePickLocalImage(file);
                } : undefined}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs rounded-md border border-emerald-500/30 text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors"
                        onClick={() => fileInputRef.current?.click?.()}
                      >
                        选择本地图片
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          if (!activeHotspot?.id) return;
                          onHotspotValueChange?.(activeHotspot.id, undefined);
                          onEditedRef.current?.();
                        }}
                      >
                        清除
                      </button>
                    </>
                  ) : (
                    <div className="text-[11px] text-gray-500">仅预览</div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      if (!canEdit) return;
                      const file = e.target.files && e.target.files[0];
                      if (e.target) e.target.value = '';
                      await handlePickLocalImage(file);
                    }}
                  />
                </div>
                {activeHotspot.value ? (
                  <img src={String(activeHotspot.value)} alt="" className="w-full h-[120px] object-contain bg-white rounded" />
                ) : (
                  <div className="text-xs text-gray-500">{canEdit ? '拖入图片或点击按钮选择' : '暂无值'}</div>
                )}
              </div>
            ) : (
              <>
                {canEdit ? (
                  <TextValueEditor
                    key={String(activeHotspot?.id ?? '')}
                    initialValue={String(activeHotspot.value ?? activeHotspot.defaultValue ?? '')}
                    onApplyValue={(next) => {
                      if (!activeHotspot?.id) return;
                      onHotspotValueChange?.(activeHotspot.id, next);
                      onEditedRef.current?.();
                    }}
                  />
                ) : (
                  <div className="min-h-[120px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 whitespace-pre-wrap">
                    {String(activeHotspot.value ?? activeHotspot.defaultValue ?? '') || '暂无值'}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
            {canEdit ? '修改后失焦或点击“应用”生效，导出以当前值为准' : '仅用于预览'}
          </div>
        </>
      )}
    </div>
  );
}

export default SidePanel;
