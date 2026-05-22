import * as XLSX from 'xlsx';
import { useDataStore } from '../store/dataStore.js';

/**
 * Excel解析工具
 * 负责解析Excel文件并更新Store状态
 */

/**
 * 解析Excel文件
 * @param {File} file - 上传的Excel文件
 * @returns {Promise<void>}
 */
export const parseExcelFile = async (file, options = {}) => {
  try {
    // 读取文件为ArrayBuffer
    const data = await file.arrayBuffer();
    
    // 使用xlsx库解析工作簿
    const workbook = XLSX.read(data);
    
    // 获取第一个工作表
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // 解析为JSON对象数组
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // 提取表头
    const headers = Object.keys(jsonData[0] || {});
    const normalizeHeaderKey = (h) => String(h || '').replace(/[\uFEFF\u200B\u200C\u200D]/g, '').trim();
    const normalizedHeaders = headers.map((h) => normalizeHeaderKey(h)).filter(Boolean);
    const expectedHeaders = Array.isArray(options.expectedHeaders) ? options.expectedHeaders : [];
    const normalizedExpected = expectedHeaders.map((h) => normalizeHeaderKey(h)).filter(Boolean);

    if (normalizedHeaders.length === 0) {
      throw new Error('Excel 表头为空或未找到可用字段');
    }

    useDataStore.getState().setExcelHeaderCheck(null);

    if (normalizedExpected.length > 0) {
      const headerSet = new Set(normalizedHeaders);
      const expectedSet = new Set(normalizedExpected);
      const missing = normalizedExpected.filter((h) => !headerSet.has(h));
      const extra = normalizedHeaders.filter((h) => !expectedSet.has(h));
      const ok = missing.length === 0 && extra.length === 0;
      const missingText = missing.length > 0 ? `缺少字段:${missing.join('、')}` : '';
      const extraText = extra.length > 0 ? `多余字段:${extra.join('、')}` : '';
      const detail = [missingText, extraText].filter(Boolean).join('；');
      useDataStore.getState().setExcelHeaderCheck({
        ok,
        expectedHeaders: normalizedExpected,
        actualHeaders: normalizedHeaders,
        missing,
        extra,
        message: ok ? '' : `Excel字段与模板不一致。${detail}`,
        at: Date.now(),
        fileName: String(file?.name || ''),
      });
    }
    
    const headerKeyMap = new Map();
    for (let i = 0; i < headers.length; i += 1) {
      const rawKey = String(headers[i] || '');
      const normKey = normalizeHeaderKey(rawKey);
      if (!normKey) continue;
      if (!headerKeyMap.has(rawKey)) headerKeyMap.set(rawKey, normKey);
    }

    const normalizedRows = (Array.isArray(jsonData) ? jsonData : []).map((row) => {
      if (!row || typeof row !== 'object') return row;
      const out = {};
      const keys = Object.keys(row);
      for (let i = 0; i < keys.length; i += 1) {
        const k = keys[i];
        const nk = headerKeyMap.get(k) || normalizeHeaderKey(k);
        if (!nk) continue;
        if (Object.prototype.hasOwnProperty.call(out, nk)) continue;
        out[nk] = row[k];
      }
      return out;
    });

    // 更新Store状态
    useDataStore.getState().setRawHeaders(normalizedHeaders);
    useDataStore.getState().setActiveHeaders(normalizedHeaders);
    useDataStore.getState().setRows(normalizedRows);
    
    // 默认将第一列设为主键
    if (normalizedHeaders.length > 0) {
      useDataStore.getState().setPrimaryKey(normalizedHeaders[0]);
    }
    
    console.log('Excel解析成功:', {
      文件名: file.name,
      表头: normalizedHeaders,
      数据行数: jsonData.length,
      主键: normalizedHeaders[0]
    });
    
    return {
      headers: normalizedHeaders,
      rows: normalizedRows,
      primaryKey: normalizedHeaders[0]
    };
  } catch (error) {
    console.error('Excel解析失败:', error);
    alert(`Excel解析失败: ${error.message}`);
    throw error;
  }
};

/**
 * 搜索产品数据
 * @param {string} inputId - 输入的商品编号
 * @returns {Record<string, any> | null} - 找到的数据行，未找到返回null
 */
export const searchProduct = (inputId) => {
  const { rows, primaryKey } = useDataStore.getState();
  
  // 核心查询逻辑：在内存中瞬间找到对应行
  // [Fix] 增强鲁棒性：统一转字符串、去除首尾空格、忽略大小写（可选，这里先只去空格）
  // 注意：Excel读取的数据可能是数字或字符串，统一转String来比较
  const targetRow = rows.find(row => {
    const cellValue = row[primaryKey];
    if (cellValue === null || cellValue === undefined) return false;
    return String(cellValue).trim() === String(inputId).trim();
  });
  
  if (targetRow) {
    useDataStore.getState().setCurrentRow(targetRow);
    console.log('查询成功:', { 查询值: inputId, 结果: targetRow });
    return targetRow;
  } else {
    console.warn('未找到数据:', { 查询值: inputId, 主键: primaryKey });
    return null;
  }
};

/**
 * 格式化数值显示
 * @param {any} value - 原始值
 * @param {string} type - 数据类型（number/text）
 * @returns {string} - 格式化后的值
 */
export const formatValue = (value, type = 'text') => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  
  if (type === 'number') {
    // 数值类型：保留2位小数
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(2);
  }
  
  return String(value);
};
