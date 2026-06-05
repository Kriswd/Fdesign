import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(relPath) {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

test('开源版本应支持可配置店铺选购入口且不硬编码私有链接', () => {
  const appMeta = readText('src/config/appMeta.js');
  const shopButton = readText('src/components/ShopLinkButton.jsx');
  const workbenchTabs = readText('src/pages/WorkbenchTabsPage.jsx');
  const workbenchPage = readText('src/pages/WorkbenchPage.jsx');
  const envExample = readText('.env.example');

  assert.ok(appMeta.includes('VITE_SHOP_URL'));
  assert.ok(appMeta.includes('APP_SHOP_LINK_ENABLED'));
  assert.ok(appMeta.includes('APP_SHOP_LINK_LABEL'));
  assert.ok(shopButton.includes('APP_SHOP_LINK_ENABLED'));
  assert.ok(shopButton.includes('ShoppingBag'));
  assert.ok(shopButton.includes('target="_blank"'));
  assert.ok(shopButton.includes('rel="noreferrer"'));
  assert.ok(workbenchTabs.includes('<ShopLinkButton />'));
  assert.ok(workbenchPage.includes('<ShopLinkButton />'));
  assert.ok(envExample.includes('VITE_SHOP_URL='));
  assert.equal(shopButton.includes('taobao.com'), false);
  assert.equal(shopButton.includes('tmall.com'), false);
  assert.equal(shopButton.includes('pay.ldxp.cn'), false);
});
