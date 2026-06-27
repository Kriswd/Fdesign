import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PUBLIC_SURFACE_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/DISCUSSION_TEMPLATE/show-and-tell.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/quickstart_feedback.yml',
  '.github/ISSUE_TEMPLATE/template_showcase.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  'docs/index.html',
  'docs/DEMO.md',
  'docs/FAQ.md',
  'docs/QUICKSTART_CN.md',
  'docs/TROUBLESHOOTING_CN.md',
  'docs/SHOWCASE_GUIDE.md',
  'docs/CONTRIBUTING_CN.md',
  'docs/OPEN_SOURCE_CHECKLIST.md',
  'docs/ROADMAP.md',
  'docs/github/release-v3.0.0.md',
  'docs/demo-kit/README.md',
  'docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md',
  'docs/showcases/README.md',
  'docs/showcases/MAIN_IMAGE_COLOR_VARIANTS_CN.md',
  'docs/showcases/MULTI_ARTBOARD_BATCH_EXPORT_CN.md',
  'docs/showcases/EYEWEAR_DETAIL_WORKFLOW_CN.md',
  'scripts/setup_github_growth.ps1',
];

const BANNED_PHRASES = [
  '客户数据',
  '客户资料',
  '订单信息',
  '订单数据',
  '报价',
  '合同',
  '商业',
  'customer data',
  'customer assets',
  'order data',
  'order information',
  'quotes',
  'contracts',
  'commercial material',
  'business material',
  'business information',
  'sensitive business',
];

const INTERNAL_PUBLIC_PATHS = [
  'docs/PROMOTION_KIT_CN.md',
  'docs/launch',
  'docs/superpowers',
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function findPhraseHits(text, relPath) {
  const haystack = text.toLowerCase();
  const hits = [];
  for (const phrase of BANNED_PHRASES) {
    const needle = phrase.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const start = Math.max(0, index - 48);
      const end = Math.min(text.length, index + phrase.length + 48);
      hits.push({
        file: relPath,
        phrase,
        snippet: text.slice(start, end).replace(/\s+/g, ' ').trim(),
      });
      index = haystack.indexOf(needle, index + needle.length);
    }
  }
  return hits;
}

export function verifyPublicSurface(rootDir = process.cwd()) {
  const missingFiles = [];
  const phraseHits = [];

  for (const relPath of PUBLIC_SURFACE_FILES) {
    const absPath = path.resolve(rootDir, relPath);
    if (!fs.existsSync(absPath)) {
      missingFiles.push(relPath);
      continue;
    }
    phraseHits.push(...findPhraseHits(readText(absPath), relPath));
  }

  const internalPathHits = INTERNAL_PUBLIC_PATHS.filter((relPath) => {
    return fs.existsSync(path.resolve(rootDir, relPath));
  });

  return {
    ok: missingFiles.length === 0 && phraseHits.length === 0 && internalPathHits.length === 0,
    checkedFiles: PUBLIC_SURFACE_FILES.length,
    missingFiles,
    phraseHits,
    internalPathHits,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = verifyPublicSurface();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
