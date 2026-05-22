import fs from 'fs';

const checks = [
  {
    file: 'e:/ProjectX/Fdesign/psd-to-ecommerce-new/src/pages/AdminSlotEditor.jsx',
    mustInclude: ['松开即可上传 Excel', '中间符号', '傻瓜拼句', '关键词搜索字段'],
  },
  {
    file: 'e:/ProjectX/Fdesign/psd-to-ecommerce-new/docs/USER_MANUAL_PSD_AUTOFILL.md',
    mustInclude: ['傻瓜拼句', '模板字符串'],
  },
  {
    file: 'e:/ProjectX/Fdesign/psd-to-ecommerce-new/start_psd_to_ecommerce_new.bat',
    mustInclude: ['http://127.0.0.1:3010/'],
  },
];

const failures = [];

for (const c of checks) {
  const raw = fs.readFileSync(c.file, 'utf8');
  for (const token of c.mustInclude) {
    if (!raw.includes(token)) {
      failures.push(`${c.file} missing ${token}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join(' | '));
  process.exit(1);
}

console.log('PASS');
