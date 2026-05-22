import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(process.cwd(), 'src/pages/AdminSlotEditor.jsx');

test('值映射规则应提供精确匹配开关', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('精确匹配'));
  assert.ok(content.includes('exactMatchOnly'));
});

test('文本拼接忽略值应支持中文逗号分隔', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('split(/[\\n,，]/g)') || content.includes('split(/[,，\\n]/g)'));
});

test('文本拼接规则行应使用网格布局并显示字段标签', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('grid grid-cols-12 gap-2'));
  assert.ok(content.includes('>字段<'));
  assert.ok(content.includes('>前缀<'));
  assert.ok(content.includes('>连接符<'));
  assert.ok(content.includes('>后缀<'));
  assert.ok(content.includes('>过滤值<'));
});

test('规则链文案应明确按顺序串行执行', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('规则链（按顺序串行执行）'));
  assert.ok(content.includes('加入规则链（继续）'));
});

test('字段拼接规则应在高级设置中提供特殊值覆盖编辑能力', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('高级设置'));
  assert.ok(content.includes('特殊值覆盖'));
  assert.ok(content.includes('命中后直接使用整段输出，不再拼接前缀/后缀'));
  assert.ok(content.includes('fieldPartOverrides'));
});

test('字段拼接规则摘要应标记特殊值覆盖', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('，含特殊值覆盖'));
  assert.ok(content.includes('const hasPartOverrides = partOverrides.some'));
});

test('规则链编辑应优先回填配置界面而不是直接退回 raw JSON', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const loadRuleIntoEditor = useCallback('));
  assert.ok(content.includes('loadRuleIntoEditor(target);'));
  assert.ok(!content.includes("setRuleEditorMode('raw');\n                                try {\n                                  setRuleEditorRawJson(JSON.stringify(target, null, 2))"));
});

test('规则链编辑态应提供覆盖当前条的明确提示和按钮文案', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const [editingChainIndex, setEditingChainIndex] = useState(null);'));
  assert.ok(content.includes('当前正在编辑：规则链第'));
  assert.ok(content.includes('保存后会覆盖这条规则'));
  assert.ok(content.includes("{editingChainIndex !== null ? '更新此条规则' : '保存规则'}"));
  assert.ok(content.includes('const nextChain = [...(Array.isArray(ruleEditorChain) ? ruleEditorChain : [])];'));
});

test('规则更新后应同步刷新 slotsRef，避免马上点外层保存时把旧规则写回去', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const latestSlots = Array.isArray(slotsRef.current) ? slotsRef.current : [];'));
  assert.ok(content.includes('slots: slotsRef.current'));
  assert.ok(content.includes('const next = typeof updater === \'function\' ? updater(prev) : updater;'));
  assert.ok(content.includes('slotsRef.current = next;'));
  assert.ok(content.includes('updateVariableRule = useCallback'));
  assert.ok(content.includes('updateVariableRuleChain = useCallback'));
  assert.ok(content.includes('const nextSlots = (Array.isArray(slotsRef.current) ? slotsRef.current : []).map((s) =>'));
  assert.ok(content.includes('slotsRef.current = nextSlots;'));
  assert.ok(content.includes('setSlotsSafe(nextSlots);'));
});

test('打开已有规则链后，当前编辑区若对应链中规则，应自动进入该条编辑态', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const rule = v ? v.computedRule : null;'));
  assert.ok(content.includes('const chain = v && Array.isArray(v.computedRules) ? v.computedRules : [];'));
  assert.ok(content.includes('const matchedChainIndex ='));
  assert.ok(content.includes('chain.findIndex((item) =>'));
  assert.ok(content.includes('JSON.stringify({ ...normalized, id: undefined, enabled: undefined, op: undefined })'));
  assert.ok(content.includes('setEditingChainIndex(matchedChainIndex >= 0 ? matchedChainIndex : null);'));
  assert.ok(content.includes('loadRuleIntoEditor(rule);'));
});

test('特殊规则弹窗应限制最大高度并让内容区独立滚动，避免保存按钮超出视口', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('max-h-[90vh]'));
  assert.ok(content.includes('overflow-hidden'));
  assert.ok(content.includes('flex items-start justify-between gap-4 shrink-0 pb-4 border-b border-white/10'));
  assert.ok(content.includes('mt-5 space-y-4 flex-1 min-h-0 overflow-y-auto pr-1'));
  assert.ok(content.includes('shrink-0 mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-3'));
});

test('模板配置加载应先清洗 fieldDefinitions 脏项，避免渲染期访问 f.key 崩溃', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes('const normalizeFieldDefinitions = useCallback('));
  assert.ok(content.includes('setFieldDefinitionsSafe(normalizeFieldDefinitions(configData.fieldDefinitions));'));
  assert.ok(content.includes(".filter((item) => item && typeof item === 'object' && typeof item.key === 'string' && item.key.trim())"));
  assert.ok(content.includes("label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : key"));
});

test('模板加载失败后应显示明确错误态，而不是因 template 为空继续停留在加载中', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes("const [loadError, setLoadError] = useState('');"));
  assert.ok(content.includes('setLoadError(err?.message ? String(err.message) : \'加载数据失败\');'));
  assert.ok(content.includes('if (loading) {'));
  assert.ok(content.includes('if (!template) {'));
  assert.ok(content.includes('加载失败'));
  assert.ok(content.includes('{loadError || \'模版配置不存在或已损坏\'}'));
  assert.ok(!content.includes('if (loading || !template) {'));
});

test('手动保存前后应输出 slot-config 调试日志，便于核对请求摘要与返回摘要', () => {
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.includes("console.info('[debug][slot-config] manual-save request'"));
  assert.ok(content.includes("console.info('[debug][slot-config] manual-save response'"));
  assert.ok(content.includes('ruleChainLengths'));
  assert.ok(content.includes('fieldDefinitionKeys'));
});
