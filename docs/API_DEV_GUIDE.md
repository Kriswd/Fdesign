# API 开发指南

本文档记录了 PSD 自动化引擎的核心 API 接口规范。

---

## 1. 模板入库 (Ingest)

将 PSD 文件上传至服务器，初始化渲染环境。

*   **Endpoint**: `POST /api/template/ingest`
*   **Content-Type**: `multipart/form-data`

### 请求参数
| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `psd` | File | PSD 文件二进制流 (必填) |

### 响应示例
```json
{
  "success": true,
  "id": "a1b2c3d4e5f67890", // templateId (16位 Hash)
  "width": 800,
  "height": 1200,
  "backdropUrl": "/templates/a1b2.../backdrop.png", // 自动生成的背景图
  "referenceUrl": "/templates/a1b2.../reference.png" // 自动生成的参考图
}
```

---

## 2. 模板导出 (Export)

基于模板 ID 和修改指令，调用 Photoshop 生成最终图片。

*   **Endpoint**: `POST /api/template/export`
*   **Content-Type**: `application/json`

### 请求参数
| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `templateId` | string | 必须是 Ingest 返回的有效 ID |
| `updates` | Array | **推荐**。明确的修改指令列表（详见下文） |
| `format` | string | `png` (默认) 或 `jpeg` |
| `quality` | number | 图片质量 (1-100) |
| `values` | Object | (兼容旧版) 变量值映射 |
| `variables` | Array | (兼容旧版) 变量定义列表 |

### Updates 结构详解
`updates` 数组是导出的核心，每一项代表一个图层的修改操作：

#### 文本修改 (Text)
```json
{
  "psId": 123,          // PSD 内部图层 ID (必填)
  "varType": "text",    // 类型标识
  "value": "¥99.00"     // 新的文本内容
}
```

#### 图片替换 (Image)
```json
{
  "psId": 456,
  "varType": "img",
  "value": "data:image/png;base64,iVBORw0K...", // Base64 数据流
  // 或者
  "imagePath": "/absolute/path/to/image.png"    // 服务器本地路径（后端自动处理）
}
```

### 响应示例
```json
{
  "success": true,
  "url": "/templates/a1b2.../exports/export_1712345678.png", // 最终图片 URL
  "outputPath": "e:/ProjectX/.../export_1712345678.png"
}
```

---

## 3. 常见错误码

*   **400 Bad Request**: 缺少 `templateId` 或参数格式错误。
*   **500 Internal Server Error**:
    *   `无效的 templateId`: ID 格式校验失败或目录不存在。
    *   `模板PSD不存在`: 服务器上找不到源文件（可能是服务重启或被清理）。
    *   `Photoshop 执行失败`: 脚本报错或超时。
