# PSD 自动填充端到端测试用例（管理端配置 → 用户端导出）

## 目标
- 验证管理端配置的参考线绑定能落盘到模版配置
- 验证用户端加载后仅展示参考线，导出时使用管理端绑定对齐商品图左右边缘

## 测试前置
- 后端服务可启动（`npm run server`）
- 模版目录存在可用 PSD（`output/templates/{templateId}/source.psd`）
- 具备至少一个图片变量（`varType=img`）

## 测试数据选择
- 推荐模板：`7c5889dab5051c3e`
- 推荐图片变量 psId：`36728`（路径：颜色展示/1/BL5108 C90 45）
- 参考线绑定（示例值，需落在图片变量矩形内）：
  - leftX: 200
  - rightX: 800

## 用例 1：管理端保存参考线绑定
**步骤**
1. 管理端打开模板配置页（AdminSlotEditor）
2. 选择图片变量 psId=36728
3. 开启“绑定参考线”，点击两条竖向参考线或手动输入绑定位置
4. 点击“保存”

**预期**
- `/api/template/save` 返回 success
- `manifest.json` 的 `frontendConfig.guidePicks` 内包含该 psId 的 leftX/rightX

## 用例 2：用户端仅展示参考线
**步骤**
1. 用户端打开 PSD 自动填充页面
2. 加载该模板
3. 打开参考线显示

**预期**
- 参考线显示正常
- 页面无“绑定参考线/清除绑定”交互入口

## 用例 3：导出时按管理端绑定对齐
**步骤**
1. 用户端替换 psId=36728 的商品图片
2. 执行导出

**预期**
- 生成图片中该商品图左右边缘对齐到 leftX/rightX
- 导出日志内包含 guideLeftX/guideRightX 且来源为 manual

## 回归项
- 未配置 guidePicks 时导出不报错，仍可使用 PSD 原生参考线或 guideLayers
- guidePicks 数值非法时被忽略，不影响导出
