import PSDParser from '../src/utils/psdParser.js';
import { LAYER_FILTER_RULES } from '../src/config/layerRules.js';
import { filterVariablesByLayerRules } from '../src/utils/templateExtractor.js';

const parser = new PSDParser();

const makeImageData = (data, width = 10, height = 10) => ({ data, width, height });

const makeSolidRGBA = (r, g, b, a = 255, width = 10, height = 10) => {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return out;
};

const makeDeterministicNoise = (baseR, baseG, baseB, width = 10, height = 10) => {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    const n = ((i / 4) * 13) % 23;
    const delta = (n % 11) - 5;
    out[i] = Math.max(0, Math.min(255, baseR + delta));
    out[i + 1] = Math.max(0, Math.min(255, baseG - delta));
    out[i + 2] = Math.max(0, Math.min(255, baseB + (delta * 2)));
    out[i + 3] = 255;
  }
  return out;
};

const makeMostlyWhiteWithSparseMarks = (width = 50, height = 50) => {
  const out = makeSolidRGBA(255, 255, 255, 255, width, height);
  for (let i = 0; i < 10; i++) {
    const pixelIndex = i * 250;
    const base = pixelIndex * 4;
    out[base] = 10;
    out[base + 1] = 10;
    out[base + 2] = 10;
    out[base + 3] = 255;
  }
  return out;
};

const isSuspectByName = (name) => {
  const nameLower = (name || '').toLowerCase();
  return Boolean(name) && LAYER_FILTER_RULES.BANNED_KEYWORDS.some((k) => nameLower.includes(k));
};

const isWhitelistedByName = (name) => {
  const nameLower = (name || '').toLowerCase();
  return LAYER_FILTER_RULES.WHITELIST_KEYWORDS.some((k) => nameLower.includes(k));
};

const checkLayer = ({ name, imageData }) => {
  const suspect = isSuspectByName(name);
  const whitelisted = isWhitelistedByName(name);
  if (!suspect || whitelisted) return 'KEEP';
  return parser.isLayerUniform({ name, imageData }) ? 'DROPPED' : 'KEEP';
};

console.log('--- Ghost Buster Verification ---');

const solidYellow = makeImageData(makeSolidRGBA(228, 194, 86));
const noisyYellow = makeImageData(makeDeterministicNoise(228, 194, 86));

const ghostLayer1 = { name: '{img:color03_正_拷贝_2}', imageData: solidYellow };
const ghostLayer2 = { name: '{img:color01_正_拷贝_2}', imageData: solidYellow };
const productLayerCopy = { name: 'sunglasses copy', imageData: solidYellow };
const whitelistedLayer = { name: '商品主图 copy', imageData: solidYellow };
const suspectTextured = { name: '{img:color02_正_拷贝_3}', imageData: noisyYellow };
const suspectWhiteBgWithObject = {
  name: '{img:color05_正_拷贝_2}',
  imageData: makeImageData(makeMostlyWhiteWithSparseMarks(50, 50), 50, 50),
};

const result1 = checkLayer(ghostLayer1);
const result2 = checkLayer(ghostLayer2);
const result3 = checkLayer(productLayerCopy);
const result4 = checkLayer(whitelistedLayer);
const result5 = checkLayer(suspectTextured);
const result6 = checkLayer(suspectWhiteBgWithObject);

console.log(`Layer: ${ghostLayer1.name} -> Result: ${result1}`);
console.log(`Layer: ${ghostLayer2.name} -> Result: ${result2}`);
console.log(`Layer: ${productLayerCopy.name} -> Result: ${result3}`);
console.log(`Layer: ${whitelistedLayer.name} -> Result: ${result4}`);
console.log(`Layer: ${suspectTextured.name} -> Result: ${result5}`);
console.log(`Layer: ${suspectWhiteBgWithObject.name} -> Result: ${result6}`);

if (result1 === 'DROPPED' && result2 === 'DROPPED' && result3 === 'KEEP' && result4 === 'KEEP' && result5 === 'KEEP' && result6 === 'KEEP') {
  console.log('✅ VERIFICATION PASSED: Logic is correct.');
} else {
  console.log('❌ VERIFICATION FAILED');
  process.exitCode = 1;
}

console.log('--- Variable Filter Verification ---');

const variablesInput = [
  { id: '1', name: 'IMGcolor01_正_拷贝_2', type: 'img', defaultValue: 'data:image/png;base64,AAA' },
  { id: '2', name: '文案 copy', type: 'text', defaultValue: '测试文案' },
  { id: '3', key: 'color01_copy', defaultValue: 'https://example.com/a.png' },
  { id: '4', name: '商品主图 copy', type: 'img', defaultValue: 'data:image/png;base64,BBB' },
  { id: '5', name: '商品主图 copy', type: 'img', isGhost: true, defaultValue: 'data:image/png;base64,CCC' },
];

const filtered = filterVariablesByLayerRules(variablesInput);
const keptIds = filtered.map((v) => v.id).filter(Boolean).sort();

const expectedKept = ['1', '2', '3', '4'];
const passFilter =
  keptIds.length === expectedKept.length &&
  keptIds.every((id, idx) => id === expectedKept[idx]);

console.log('Kept IDs:', keptIds.join(',') || '(none)');
if (passFilter) {
  console.log('✅ VARIABLE FILTER PASSED');
} else {
  console.log('❌ VARIABLE FILTER FAILED');
  process.exitCode = 1;
}
