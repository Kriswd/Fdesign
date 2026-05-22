import test from 'node:test';
import assert from 'node:assert/strict';

import { buildArtboardRenameMap, extractTemplateMeta } from '../server/utils/templateMeta.js';

test('extractTemplateMeta offsets local artboard coordinates into document space', () => {
  const psd = {
    width: 2400,
    height: 1800,
    children: [
      {
        id: 100,
        name: 'Artboard A',
        artboard: { artboardRect: { left: 800, top: 300, right: 1800, bottom: 1300 } },
        children: [
          {
            id: 2001,
            name: '{text:title}',
            left: 40,
            top: 50,
            right: 340,
            bottom: 130,
            text: { text: 'Title' },
          },
          {
            id: 2002,
            name: '{img:hero}',
            left: 120,
            top: 200,
            right: 720,
            bottom: 900,
            imageData: { width: 600, height: 700 },
          },
        ],
      },
    ],
  };

  const meta = extractTemplateMeta(psd);
  const byPsId = new Map((meta.variables || []).map((v) => [Number(v.psId), v]));
  assert.equal(byPsId.get(2001)?.x, 840);
  assert.equal(byPsId.get(2001)?.y, 350);
  assert.equal(byPsId.get(2002)?.x, 920);
  assert.equal(byPsId.get(2002)?.y, 500);
});

test('extractTemplateMeta keeps absolute child coordinates unchanged', () => {
  const psd = {
    width: 2400,
    height: 1800,
    children: [
      {
        id: 101,
        name: 'Artboard B',
        artboard: { artboardRect: { left: 800, top: 300, right: 1800, bottom: 1300 } },
        children: [
          {
            id: 3001,
            name: '{text:subtitle}',
            left: 860,
            top: 360,
            right: 1260,
            bottom: 450,
            text: { text: 'Subtitle' },
          },
        ],
      },
    ],
  };

  const meta = extractTemplateMeta(psd);
  const target = (meta.variables || []).find((v) => Number(v.psId) === 3001);
  assert.equal(target?.x, 860);
  assert.equal(target?.y, 360);
});

test('buildArtboardRenameMap replaces style and color for tmall main artboards while keeping suffix', () => {
  const variables = [
    { psId: 101, path: '\u5929\u732b\u4e3b\u56fe BL3208 C50 \u7279\u4ef7\u8272/\u7ec4/{img:\u4e3b\u56fe}' },
  ];
  const updates = [
    { psId: 101, varType: 'img', sourceName: 'BX7007_A15_\u4e3b\u56fe.png' },
  ];
  const out = buildArtboardRenameMap({ variables, updates });
  assert.deepEqual(out, { 101: '\u5929\u732b\u4e3b\u56fe BX7007 A15 \u7279\u4ef7\u8272' });
});

test('buildArtboardRenameMap replaces pure style-color artboard names with uploaded style-color', () => {
  const variables = [
    { psId: 201, path: 'BL3208 C50/\u7ec4/{img:\u4e3b\u56fe}' },
  ];
  const updates = [
    { psId: 201, varType: 'img', sourceName: 'BX7007_A15_\u7ec6\u8282\u56fe.jpg' },
  ];
  const out = buildArtboardRenameMap({ variables, updates });
  assert.deepEqual(out, { 201: 'BX7007 A15' });
});

test('buildArtboardRenameMap supports two-letter color codes for tmall main artboards', () => {
  const variables = [
    { psId: 301, path: '\u5929\u732b\u4e3b\u56fe BL3208 C50 \u7279\u4ef7\u8272/\u7ec4/{img:\u4e3b\u56fe}' },
  ];
  const updates = [
    { psId: 301, varType: 'img', sourceName: 'QN3010 XX_\u4e3b\u56fe.png' },
  ];
  const out = buildArtboardRenameMap({ variables, updates });
  assert.deepEqual(out, { 301: '\u5929\u732b\u4e3b\u56fe QN3010 XX \u7279\u4ef7\u8272' });
});

test('buildArtboardRenameMap supports two-letter color codes for pure style-color artboards', () => {
  const variables = [
    { psId: 401, path: 'BL3208 C50/\u7ec4/{img:\u4e3b\u56fe}' },
  ];
  const updates = [
    { psId: 401, varType: 'img', sourceName: 'QN3010 XX.png' },
  ];
  const out = buildArtboardRenameMap({ variables, updates });
  assert.deepEqual(out, { 401: 'QN3010 XX' });
});

test('buildArtboardRenameMap replaces both style and color for simple tmall main artboard names', () => {
  const variables = [
    { psId: 501, path: '\u5929\u732b\u4e3b\u56fe BL3208 C21/{img:\u4e3b\u56fe}' },
  ];
  const updates = [
    { psId: 501, varType: 'img', sourceName: 'BR6000_B12_\u4e3b\u56fe.png' },
  ];
  const out = buildArtboardRenameMap({ variables, updates });
  assert.deepEqual(out, { 501: '\u5929\u732b\u4e3b\u56fe BR6000 B12' });
});

test('buildArtboardRenameMap replaces style only when optional-color tmall artboard already has a style', () => {
  const variables = [
    { psId: 551, path: '\u5929\u732b\u4e3b\u56fe BL3208 \u53ef\u90092\u8272/{img:COLOR01}' },
  ];
  const updates = [
    { psId: 551, varType: 'img', sourceName: 'BR6000_B12_\u4e3b\u56fe.png' },
  ];
  const out = buildArtboardRenameMap({ variables, updates });
  assert.deepEqual(out, { 551: '\u5929\u732b\u4e3b\u56fe BR6000 \u53ef\u90092\u8272' });
});

test('buildArtboardRenameMap injects style when optional-color tmall artboard name lacks it', () => {
  const variables = [
    { psId: 601, path: '\u5929\u732b\u4e3b\u56fe \u53ef\u90092\u8272/{img:COLOR01}' },
  ];
  const updates = [
    { psId: 601, varType: 'img', sourceName: 'BR6000_B12_\u4e3b\u56fe.png' },
  ];
  const out = buildArtboardRenameMap({ variables, updates });
  assert.deepEqual(out, { 601: '\u5929\u732b\u4e3b\u56fe BR6000 \u53ef\u90092\u8272' });
});
