import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Upload, Sparkles, FolderPlus, Trash2, Shield, Info, Copy, Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import AdminSlotEditor from './AdminSlotEditor';
import AdminTaskTemplateTab from './AdminTaskTemplateTab';

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState('templates');
  const [templates, setTemplates] = useState([]);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadHint, setUploadHint] = useState('');
  const [psdDropActive, setPsdDropActive] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatingTemplate, setDuplicatingTemplate] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateOpenEditor, setDuplicateOpenEditor] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authNewPassword, setAuthNewPassword] = useState('');
  const [authNewPasswordConfirm, setAuthNewPasswordConfirm] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSaving, setAuthSaving] = useState(false);
  const [authShowPassword, setAuthShowPassword] = useState(false);
  const [authShowNewPassword, setAuthShowNewPassword] = useState(false);
  const [authShowNewPasswordConfirm, setAuthShowNewPasswordConfirm] = useState(false);
  const [authCapsLockOn, setAuthCapsLockOn] = useState(false);
  const [authCopied, setAuthCopied] = useState(false);
  const fileInputRef = useRef(null);
  const psdDragDepthRef = useRef(0);
  const renderServerBaseUrl = import.meta.env.VITE_RENDER_SERVER || '';
  const authDefaultPassword = useMemo(() => 'admin', []);

  const sortTemplatesBySavedAt = useCallback((rows) => {
    const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
    return list
      .slice()
      .sort((a, b) => {
        const ta = String(a?.savedAt || '');
        const tb = String(b?.savedAt || '');
        if (ta && tb && ta !== tb) return tb.localeCompare(ta);
        if (ta && !tb) return -1;
        if (!ta && tb) return 1;
        return String(b?.id || '').localeCompare(String(a?.id || ''));
      });
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const resp = await fetch(`${renderServerBaseUrl}/api/admin/me`, { credentials: 'include' });
      const data = await resp.json().catch(() => ({}));
      const authed = !!data?.authenticated;
      setIsAuthed(authed);
      setMustChangePassword(authed && data?.mustChangePassword === true);
      setAuthChecked(true);
      return { authed, mustChangePassword: authed && data?.mustChangePassword === true };
    } catch {
      setAuthChecked(true);
      setIsAuthed(false);
      setMustChangePassword(false);
      return { authed: false, mustChangePassword: false };
    }
  }, [renderServerBaseUrl]);

  const validateNewPasswordLocal = useCallback((raw) => {
    const s = String(raw || '');
    if (s.length < 6) return '新密码至少 6 位';
    if (s.length > 128) return '新密码过长';
    if (!s.trim()) return '新密码不能为空白';
    const hasLetter = /[A-Za-z]/.test(s);
    const hasDigit = /\d/.test(s);
    const hasSymbol = /[^A-Za-z0-9]/.test(s);
    const categories = [hasLetter, hasDigit, hasSymbol].filter(Boolean).length;
    if (categories < 2) return '新密码需至少包含字母、数字、符号中的两类';
    if (/^admin$/i.test(s)) return '新密码不能与默认密码相同';
    return null;
  }, []);

  const submitAuth = useCallback(async () => {
    if (!authPassword) {
      setAuthError('请输入管理员密码');
      return;
    }
    if (mustChangePassword) {
      const np = String(authNewPassword || '');
      const npc = String(authNewPasswordConfirm || '');
      if (!np || !npc) {
        setAuthError('请完整填写新密码与确认新密码');
        return;
      }
      if (np !== npc) {
        setAuthError('两次输入的新密码不一致');
        return;
      }
      const err = validateNewPasswordLocal(np);
      if (err) {
        setAuthError(err);
        return;
      }
    }
    try {
      setAuthSaving(true);
      setAuthError('');
      if (!isAuthed) {
        const resp = await fetch(`${renderServerBaseUrl}/api/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ password: authPassword }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || data?.message || '登录失败');
      }
      const st = await refreshAuth();
      if (st.mustChangePassword) {
        const resp = await fetch(`${renderServerBaseUrl}/api/admin/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ oldPassword: authPassword, newPassword: authNewPassword }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || data?.message || '修改密码失败');
      }
      const st2 = await refreshAuth();
      if (!st2.authed) throw new Error('登录状态未生效，请刷新后重试');
      if (st2.mustChangePassword) throw new Error('仍需修改密码，请检查新密码是否符合要求');
      setAuthPassword('');
      setAuthNewPassword('');
      setAuthNewPasswordConfirm('');
      setAuthModalOpen(false);
    } catch (e) {
      setAuthError(e?.message || String(e));
    } finally {
      setAuthSaving(false);
    }
  }, [
    authNewPassword,
    authNewPasswordConfirm,
    authPassword,
    isAuthed,
    mustChangePassword,
    refreshAuth,
    renderServerBaseUrl,
    validateNewPasswordLocal,
  ]);

  const authModalLocked = !isAuthed || mustChangePassword;
  const authNewPasswordClientError =
    mustChangePassword && authNewPassword ? validateNewPasswordLocal(authNewPassword) : null;
  const authNewPasswordMismatch =
    mustChangePassword && authNewPasswordConfirm && authNewPassword !== authNewPasswordConfirm;
  const authSubmitDisabled =
    authSaving ||
    !authPassword ||
    (mustChangePassword &&
      (!authNewPassword ||
        !authNewPasswordConfirm ||
        authNewPasswordMismatch ||
        !!authNewPasswordClientError));

  const copyDefaultPassword = useCallback(async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(authDefaultPassword);
      } else {
        const el = document.createElement('textarea');
        el.value = authDefaultPassword;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        el.style.top = '0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setAuthCopied(true);
      window.setTimeout(() => setAuthCopied(false), 1200);
    } catch {
      setAuthCopied(false);
    }
  }, [authDefaultPassword]);

  const requireAuth = useCallback(async () => {
    setAuthError('');
    const st = await refreshAuth();
    if (!st.authed || st.mustChangePassword) {
      setAuthModalOpen(true);
    }
  }, [refreshAuth]);

  useEffect(() => {
    refreshAuth().then((st) => {
      if (!st.authed || st.mustChangePassword) setAuthModalOpen(true);
    });
  }, [refreshAuth]);

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch(`${renderServerBaseUrl}/api/templates`);
      if (response.ok) {
        const data = await response.json();
        setTemplates(sortTemplatesBySavedAt(data));
      }
    } catch (error) {
      console.error('获取模板列表失败:', error);
    }
  }, [renderServerBaseUrl, sortTemplatesBySavedAt]);

  useEffect(() => {
    if (activeSection !== 'templates') return;
    fetchTemplates();
  }, [activeSection, fetchTemplates]);

  const handleUploadClick = () => {
    if (uploading) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const uploadPsdFile = useCallback(
    async (file) => {
      if (!file) return;

      if (!String(file.name || '').toLowerCase().endsWith('.psd')) {
        alert('请上传 PSD 文件');
        return;
      }

      try {
        setUploading(true);
        setUploadHint('正在上传并初始化模板...');

        const formData = new FormData();
        formData.append('psd', file);

        const ingestResp = await fetch(`${renderServerBaseUrl}/api/template/ingest`, {
          method: 'POST',
          body: formData,
        });

        if (!ingestResp.ok) {
          const err = await ingestResp.json().catch(() => ({}));
          throw new Error(err.message || err.error || '模版解析失败');
        }

        const ingestData = await ingestResp.json().catch(() => null);
        if (!ingestData || !ingestData.success || !ingestData.id) {
          throw new Error('服务端未返回有效的模版 ID');
        }

        setUploadHint('正在保存模版信息...');

        const name = String(file.name || '').replace(/\.psd$/i, '') || '未命名模版';
        const saveResp = await fetch(`${renderServerBaseUrl}/api/template/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            templateId: ingestData.id,
            name,
            config: null,
          }),
        });
        if (!saveResp.ok) {
          const err = await saveResp.json().catch(() => ({}));
          if (saveResp.status === 401) {
            requireAuth();
            throw new Error('未登录或登录已失效，请先登录');
          }
          throw new Error(err.message || err.error || '保存模版失败');
        }

        const savedPayload = await saveResp.json().catch(() => ({}));
        const savedAt =
          savedPayload && savedPayload.savedAt != null && String(savedPayload.savedAt).trim()
            ? String(savedPayload.savedAt).trim()
            : new Date().toISOString();
        const previewUrl =
          savedPayload && savedPayload.previewUrl != null && String(savedPayload.previewUrl).trim()
            ? String(savedPayload.previewUrl).trim()
            : null;
        const thumbnailUrl =
          savedPayload && savedPayload.thumbnailUrl != null && String(savedPayload.thumbnailUrl).trim()
            ? String(savedPayload.thumbnailUrl).trim()
            : null;

        const newId = String(ingestData.id);
        setTemplates((prev) =>
          sortTemplatesBySavedAt([
            { id: newId, name, previewUrl, thumbnailUrl, savedAt },
            ...(Array.isArray(prev) ? prev.filter((t) => String(t?.id || '') !== newId) : []),
          ]),
        );
        setActiveSection('templates');
        setEditingTemplateId(newId);

        fetchTemplates();
        setUploadHint('上传完成，可以开始配置模版');
        setTimeout(() => setUploadHint(''), 2000);
      } catch (err) {
        console.error(err);
        alert(`上传失败：${err.message}`);
      } finally {
        setUploading(false);
      }
    },
    [fetchTemplates, renderServerBaseUrl, requireAuth, sortTemplatesBySavedAt],
  );

  const handleUploadChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    await uploadPsdFile(file);
  };

  const extractDroppedFiles = useCallback((e) => Array.from(e?.dataTransfer?.files || []).filter(Boolean), []);

  const handlePsdDragEnter = useCallback(
    (e) => {
      if (uploading) return;
      e.preventDefault();
      e.stopPropagation();
      psdDragDepthRef.current += 1;
      setPsdDropActive(true);
    },
    [uploading],
  );

  const handlePsdDragOver = useCallback(
    (e) => {
      if (uploading) return;
      e.preventDefault();
      e.stopPropagation();
      setPsdDropActive(true);
    },
    [uploading],
  );

  const handlePsdDragLeave = useCallback(
    (e) => {
      if (uploading) return;
      e.preventDefault();
      e.stopPropagation();
      psdDragDepthRef.current = Math.max(0, psdDragDepthRef.current - 1);
      if (psdDragDepthRef.current === 0) setPsdDropActive(false);
    },
    [uploading],
  );

  const handlePsdDrop = useCallback(
    async (e) => {
      if (uploading) return;
      e.preventDefault();
      e.stopPropagation();
      psdDragDepthRef.current = 0;
      setPsdDropActive(false);
      const files = extractDroppedFiles(e);
      const psdFile = files.find((f) => /\.psd$/i.test(String(f?.name || '')));
      if (!psdFile) return alert('请拖入 PSD 文件');
      await uploadPsdFile(psdFile);
    },
    [extractDroppedFiles, uploadPsdFile, uploading],
  );

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('确定删除该模板及其所有配置吗？此操作不可恢复。')) {
      return;
    }
    try {
      const resp = await fetch(`${renderServerBaseUrl}/api/template/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          requireAuth();
          throw new Error('未登录或登录已失效，请先登录');
        }
        throw new Error(err.message || err.error || '删除失败');
      }
      await fetchTemplates();
    } catch (err) {
      console.error(err);
      alert(`删除失败：${err.message}`);
    }
  };

  const handleStartRename = (template) => {
    setRenamingId(template.id);
    setRenameValue(template.name || '');
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleConfirmRename = async (id) => {
    const name = renameValue.trim();
    if (!name) {
      alert('模版名称不能为空');
      return;
    }
    try {
      setRenaming(true);
      const resp = await fetch(`${renderServerBaseUrl}/api/template/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          templateId: id,
          name,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          requireAuth();
          throw new Error('未登录或登录已失效，请先登录');
        }
        throw new Error(err.message || err.error || '重命名失败');
      }
      await fetchTemplates();
      setRenamingId(null);
      setRenameValue('');
    } catch (err) {
      console.error(err);
      alert(`重命名失败：${err.message}`);
    } finally {
      setRenaming(false);
    }
  };

  const openDuplicateModal = useCallback((template) => {
    const baseName = String(template?.name || '').trim() || `未命名模版 (${String(template?.id || '').slice(0, 6)})`;
    setDuplicatingTemplate(template || null);
    setDuplicateName(`${baseName}（副本）`);
    setDuplicateOpenEditor(true);
    setDuplicateError('');
    setDuplicateModalOpen(true);
  }, []);

  const closeDuplicateModal = useCallback(() => {
    if (duplicating) return;
    setDuplicateModalOpen(false);
    setDuplicatingTemplate(null);
    setDuplicateName('');
    setDuplicateOpenEditor(true);
    setDuplicateError('');
  }, [duplicating]);

  const submitDuplicate = useCallback(async () => {
    const tpl = duplicatingTemplate;
    const fromId = String(tpl?.id || '').trim();
    const name = String(duplicateName || '').trim();
    if (!fromId) {
      setDuplicateError('未找到要复制的模版');
      return;
    }
    if (!name) {
      setDuplicateError('新模版名称不能为空');
      return;
    }
    try {
      setDuplicating(true);
      setDuplicateError('');
      const resp = await fetch(`${renderServerBaseUrl}/api/template/${fromId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 401) {
          requireAuth();
          throw new Error('未登录或登录已失效，请先登录');
        }
        throw new Error(data?.message || data?.error || '复制失败');
      }
      const nextTemplate = {
        id: data?.templateId,
        name: data?.name || name,
        savedAt: data?.savedAt || '',
        previewUrl: data?.previewUrl || null,
        thumbnailUrl: data?.thumbnailUrl || null,
      };
      setTemplates((prev) => sortTemplatesBySavedAt([nextTemplate, ...(Array.isArray(prev) ? prev : [])]));
      setDuplicateModalOpen(false);
      setDuplicatingTemplate(null);
      setDuplicateName('');
      setDuplicateError('');
      if (duplicateOpenEditor && nextTemplate.id) {
        setEditingTemplateId(nextTemplate.id);
      }
    } catch (err) {
      console.error(err);
      setDuplicateError(`复制失败：${err.message}`);
    } finally {
      setDuplicating(false);
    }
  }, [duplicateName, duplicateOpenEditor, duplicatingTemplate, renderServerBaseUrl, requireAuth, sortTemplatesBySavedAt]);

  if (activeSection === 'templates' && editingTemplateId) {
    return (
      <AdminSlotEditor
        templateId={editingTemplateId}
        onBack={() => setEditingTemplateId(null)}
        onRequireAuth={requireAuth}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-50">
      {duplicateModalOpen && (
        <div className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-2xl bg-slate-500/15 border border-white/10 flex items-center justify-center">
                    <Copy className="w-4 h-4 text-slate-200" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-50">复制模版</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {duplicatingTemplate?.name ? `来源：${duplicatingTemplate.name}` : '将当前模版复制一份并保留配置'}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDuplicateModal}
                disabled={duplicating}
                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-300" htmlFor="admin-duplicate-name">
                  新模版名称
                </label>
                <input
                  id="admin-duplicate-name"
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  className="w-full border border-white/10 rounded-xl px-3 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                  placeholder="请输入新模版名称"
                  autoFocus
                  disabled={duplicating}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitDuplicate();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      closeDuplicateModal();
                    }
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setDuplicateOpenEditor((v) => !v)}
                disabled={duplicating}
                className={[
                  'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                  duplicateOpenEditor ? 'bg-emerald-500/10 border-emerald-400/20' : 'bg-white/5 border-white/10 hover:bg-white/10',
                  duplicating ? 'opacity-60 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-200">复制后直接进入配置页</div>
                    <div className="mt-1 text-[11px] text-slate-500">适合复制后立即微调规则与商品位</div>
                  </div>
                  <div
                    className={[
                      'w-10 h-6 rounded-full border flex items-center px-1 transition-all',
                      duplicateOpenEditor ? 'bg-emerald-500/30 border-emerald-400/30' : 'bg-slate-950/40 border-white/10',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'w-4 h-4 rounded-full transition-all',
                        duplicateOpenEditor ? 'bg-emerald-300 translate-x-4' : 'bg-slate-400 translate-x-0',
                      ].join(' ')}
                    />
                  </div>
                </div>
              </button>

              {duplicateError ? (
                <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {duplicateError}
                </div>
              ) : null}

              <div className="pt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDuplicateModal}
                  disabled={duplicating}
                  className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submitDuplicate}
                  disabled={duplicating}
                  className="px-3 py-2 rounded-xl bg-sky-500/90 border border-sky-400/30 text-xs text-white hover:bg-sky-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {duplicating ? '正在创建副本...' : '创建副本'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-200 backdrop-blur">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>模版与任务模板一体化管理</span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-50 tracking-tight">模版管理后台</h1>
              <p className="text-sm text-slate-300 mt-1">集中管理 PSD 模版、商品位配置与导出能力</p>
            </div>
            <div className="flex items-center gap-2 p-1 bg-black/20 border border-white/10 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setActiveSection('templates')}
                className={[
                  'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  activeSection === 'templates' ? 'bg-white/10 text-slate-50' : 'text-slate-300 hover:text-white',
                ].join(' ')}
              >
                PSD 模板与商品位
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('task-templates')}
                className={[
                  'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  activeSection === 'task-templates' ? 'bg-white/10 text-slate-50' : 'text-slate-300 hover:text-white',
                ].join(' ')}
              >
                任务模板
              </button>
            </div>
          </div>
          <a
            href="/"
            className="px-4 py-2 rounded-full bg-white/5 border border-white/15 text-sm text-slate-100 hover:bg-white/10 transition-colors backdrop-blur"
          >
            返回工作台
          </a>
        </header>

        {activeSection === 'task-templates' ? (
          <div className="rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-xl p-6 shadow-2xl">
            <AdminTaskTemplateTab renderServerBaseUrl={renderServerBaseUrl} onRequireAuth={requireAuth} />
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-1">
            <div
              className={[
                'relative overflow-hidden rounded-[2rem] bg-white/5 border backdrop-blur-xl p-8 flex flex-col items-center justify-center cursor-pointer group hover:bg-white/10 transition-all duration-300 shadow-2xl hover:shadow-blue-900/20 hover:scale-[1.02] active:scale-[0.98]',
                psdDropActive ? 'border-emerald-400/35 ring-2 ring-emerald-400/15' : 'border-white/10',
              ].join(' ')}
              onClick={handleUploadClick}
              onDragEnter={handlePsdDragEnter}
              onDragOver={handlePsdDragOver}
              onDragLeave={handlePsdDragLeave}
              onDrop={handlePsdDrop}
            >
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.15),transparent_70%)]" />
              <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_0_0,rgba(96,165,250,0.1),transparent_55%),radial-gradient(circle_at_100%_100%,rgba(244,114,182,0.1),transparent_55%)]" />

              {psdDropActive ? (
                <div className="absolute inset-4 rounded-[1.5rem] border border-emerald-400/25 bg-black/45 backdrop-blur-sm flex items-center justify-center pointer-events-none z-10">
                  <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-100 text-xs">
                    松开即可上传 PSD
                  </div>
                </div>
              ) : null}
              
              <div className="relative flex flex-col items-center justify-center text-center z-10">
                <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-slate-900/50 border border-white/10 shadow-lg shadow-black/20 group-hover:border-blue-400/50 group-hover:scale-110 transition-all duration-300">
                  <Upload className="w-8 h-8 text-blue-400 group-hover:text-blue-300 transition-colors" />
                </div>
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-slate-50 tracking-tight group-hover:text-white transition-colors">
                    {uploading ? '正在解析模版...' : '上传 PSD 模版'}
                  </div>
                  <div className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                    点击或拖入文件，自动解析图层与变量
                  </div>
                  {uploadHint && (
                    <div className="text-xs font-medium text-emerald-400 mt-3 animate-pulse">
                      {uploadHint}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 w-full text-xs text-slate-500 border-t border-white/5 pt-5 space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  <span className="text-slate-400">后端自动解析图层结构</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                  <span className="text-slate-400">支持配置模版商品位并批量导出</span>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".psd"
                className="hidden"
                onChange={handleUploadChange}
                disabled={uploading}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-6 px-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-50 tracking-tight">已保存模版</h2>
                  <div className="text-xs text-slate-400 mt-1">
                    管理已解析的 PSD 模版与模版配置
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-slate-400">
                  {templates.length} 个模版
                </div>
              </div>

              {templates.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-center text-slate-400 text-sm">
                  <FolderPlus className="w-8 h-8 mb-3 text-slate-500" />
                  <p>暂未检测到已保存模版</p>
                  <p className="text-xs mt-1">
                    请先在工作台上传 PSD、配置变量并点击「保存为模板」
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="group relative rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden hover:border-blue-400/60 hover:shadow-[0_12px_40px_rgba(15,23,42,0.9)] transition-all"
                    >
                      <div className="aspect-[3/4] bg-slate-900 relative">
                        {template.thumbnailUrl || template.previewUrl ? (
                          <img
                            src={`${renderServerBaseUrl}${template.thumbnailUrl || template.previewUrl}`}
                            alt={template.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                            无预览图
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-slate-900/10 opacity-90 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="p-3.5 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            {renamingId === template.id ? (
                              <input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleConfirmRename(template.id);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleCancelRename();
                                  }
                                }}
                                className="w-full bg-slate-900/70 border border-white/20 rounded-lg px-2 py-1 text-xs text-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                autoFocus
                                placeholder="请输入模版名称"
                              />
                            ) : (
                              <p className="text-sm font-medium text-slate-50 truncate" title={template.name}>
                                {template.name}
                              </p>
                            )}
                            <p className="text-[11px] text-slate-400 mt-0.5" title={template.id}>
                              ID: {template.id.slice(0, 8)}...
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {renamingId === template.id ? (
                              <>
                                <button
                                  onClick={() => handleConfirmRename(template.id)}
                                  disabled={renaming}
                                  className="px-2 py-1 rounded-full bg-blue-500/90 text-[11px] text-white hover:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={handleCancelRename}
                                  className="px-2 py-1 rounded-full bg-slate-800/80 text-[11px] text-slate-200 hover:bg-slate-700/90"
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleStartRename(template)}
                                className="px-2 py-1 rounded-full bg-slate-800/80 text-[11px] text-slate-200 hover:bg-slate-700/90 whitespace-nowrap"
                              >
                                重命名
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-1 flex-nowrap">
                          <button
                            onClick={() => setEditingTemplateId(template.id)}
                            className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-blue-500/90 text-xs font-medium text-white hover:bg-blue-400 transition-colors whitespace-nowrap"
                          >
                            配置模版
                          </button>
                          <button
                            onClick={() => openDuplicateModal(template)}
                            className="w-9 h-9 rounded-xl bg-slate-800/80 text-slate-200 hover:bg-slate-700/90 inline-flex items-center justify-center"
                            aria-label="复制模版"
                            title="复制模版"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="w-9 h-9 rounded-xl bg-slate-800/80 text-red-300 hover:bg-slate-700/90 hover:text-red-200 inline-flex items-center justify-center"
                            aria-label="删除模版"
                            title="删除模版"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {authModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-emerald-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-50">管理员登录</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {mustChangePassword ? '首次登录需要设置新密码后才能继续' : '请输入管理员密码进入后台'}
                    </div>
                  </div>
                </div>
              </div>
              {!authModalLocked ? (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(false)}
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors"
                  aria-label="关闭"
                >
                  ×
                </button>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {mustChangePassword ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-slate-300">
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                        <span>初始密码：<span className="text-slate-50 font-semibold">{authDefaultPassword}</span></span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        新密码至少 6 位，且包含字母/数字/符号中的两类
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={copyDefaultPassword}
                      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border bg-slate-950/40 border-white/10 text-[11px] text-slate-200 hover:bg-slate-950/70 transition-colors"
                      aria-label="复制初始密码"
                    >
                      {authCopied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                      {authCopied ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <label className="text-xs text-slate-300" htmlFor="admin-auth-password">
                  {mustChangePassword ? '当前密码' : '密码'}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                    <KeyRound className="w-4 h-4 text-slate-500" />
                  </div>
                  <input
                    id="admin-auth-password"
                    type={authShowPassword ? 'text' : 'password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full border border-white/10 rounded-xl pl-10 pr-12 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                    placeholder={mustChangePassword ? `请输入当前管理员密码（初始：${authDefaultPassword}）` : '请输入管理员密码'}
                    autoFocus
                    onKeyDown={(e) => {
                      setAuthCapsLockOn(!!e.getModifierState?.('CapsLock'));
                      if (e.key === 'Enter') submitAuth();
                    }}
                    onKeyUp={(e) => setAuthCapsLockOn(!!e.getModifierState?.('CapsLock'))}
                    aria-invalid={!!authError}
                  />
                  <button
                    type="button"
                    onClick={() => setAuthShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-300 hover:text-slate-50"
                    aria-label={authShowPassword ? '隐藏密码' : '显示密码'}
                  >
                    {authShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {authCapsLockOn ? (
                  <div className="text-[11px] text-amber-200/90">检测到大写锁定已开启（Caps Lock）</div>
                ) : null}
              </div>
              {mustChangePassword && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300" htmlFor="admin-auth-new-password">
                      新密码
                    </label>
                    <div className="relative">
                      <input
                        id="admin-auth-new-password"
                        type={authShowNewPassword ? 'text' : 'password'}
                        value={authNewPassword}
                        onChange={(e) => setAuthNewPassword(e.target.value)}
                        className="w-full border border-white/10 rounded-xl px-3 pr-12 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                        placeholder="至少 6 位，且包含两类字符"
                        onKeyDown={(e) => {
                          setAuthCapsLockOn(!!e.getModifierState?.('CapsLock'));
                          if (e.key === 'Enter') submitAuth();
                        }}
                        onKeyUp={(e) => setAuthCapsLockOn(!!e.getModifierState?.('CapsLock'))}
                        aria-invalid={!!authNewPasswordClientError}
                      />
                      <button
                        type="button"
                        onClick={() => setAuthShowNewPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-300 hover:text-slate-50"
                        aria-label={authShowNewPassword ? '隐藏新密码' : '显示新密码'}
                      >
                        {authShowNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {authNewPasswordClientError ? (
                      <div className="text-[11px] text-amber-200/90">{authNewPasswordClientError}</div>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300" htmlFor="admin-auth-new-password-confirm">
                      确认新密码
                    </label>
                    <div className="relative">
                      <input
                        id="admin-auth-new-password-confirm"
                        type={authShowNewPasswordConfirm ? 'text' : 'password'}
                        value={authNewPasswordConfirm}
                        onChange={(e) => setAuthNewPasswordConfirm(e.target.value)}
                        className="w-full border border-white/10 rounded-xl px-3 pr-12 py-2 bg-slate-950/60 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                        placeholder="再次输入新密码"
                        onKeyDown={(e) => {
                          setAuthCapsLockOn(!!e.getModifierState?.('CapsLock'));
                          if (e.key === 'Enter') submitAuth();
                        }}
                        onKeyUp={(e) => setAuthCapsLockOn(!!e.getModifierState?.('CapsLock'))}
                        aria-invalid={authNewPasswordMismatch}
                      />
                      <button
                        type="button"
                        onClick={() => setAuthShowNewPasswordConfirm((v) => !v)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-300 hover:text-slate-50"
                        aria-label={authShowNewPasswordConfirm ? '隐藏确认新密码' : '显示确认新密码'}
                      >
                        {authShowNewPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {authNewPasswordMismatch ? (
                      <div className="text-[11px] text-amber-200/90">两次输入的新密码不一致</div>
                    ) : null}
                  </div>
                </>
              )}

              {authError ? (
                <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {authError}
                </div>
              ) : null}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={authSubmitDisabled}
                  onClick={submitAuth}
                  className="px-3 py-2 rounded-xl bg-emerald-500/90 border border-emerald-400/30 text-xs text-white hover:bg-emerald-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {authSaving ? '处理中...' : mustChangePassword ? '设置新密码并继续' : '登录'}
                </button>
              </div>

              {authChecked ? (
                <div className="text-[11px] text-slate-500">
                  当前状态：{isAuthed ? '已登录' : '未登录'}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
