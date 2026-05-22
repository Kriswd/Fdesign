
import { readPsd, initializeCanvas } from 'ag-psd';
import * as fs from 'fs';

// Mock Canvas
initializeCanvas((width, height) => {
  return {
    width,
    height,
    getContext: () => ({
      fillRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => {},
      createImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }),
    }),
  };
});

const filePath = 'e:\\ProjectX\\vibe design\\模版-整套太阳镜\\天猫主图PC可选颜色规范.psd';

try {
  const buffer = fs.readFileSync(filePath);
  const psd = readPsd(buffer, {
    skipLayerImageData: false,
    skipThumbnail: true,
    useCanvas: true, // Use our mock
  });

  console.log('PSD Structure:');
  
  function printLayer(layer, depth = 0) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}- ${layer.name} (ID: ${layer.id}) [${layer.left},${layer.top}-${layer.right},${layer.bottom}]`);
    
    if (layer.adjustments) {
        // console.log(`${indent}  Adjustments:`, JSON.stringify(layer.adjustments));
        console.log(`${indent}  [Adjustments present]`);
    }

    if (layer.children) {
      layer.children.forEach(child => printLayer(child, depth + 1));
    }
  }

  if (psd.children) {
    psd.children.forEach((child) => printLayer(child));

    const findLayer = (list) => {
        for (const child of list) {
            if (child.name === 'COLOR01-正') {
                 console.log('Found COLOR01-正 (ID: ' + child.id + '):');
                 console.log('Canvas:', !!child.canvas);
                 console.log('ImageData:', !!child.imageData);
                 if (child.placedLayer) {
                     console.log('PlacedLayer:', JSON.stringify(child.placedLayer, null, 2));
                 }
                 return;
             }
             if (child.children) findLayer(child.children);
         }
    };
    findLayer(psd.children);
    
    if (psd.linkedFiles) {
        console.log('Linked Files:', psd.linkedFiles.length);
        psd.linkedFiles.forEach(f => console.log('Linked:', f.id, f.name, f.type));
    } else {
        console.log('No Linked Files');
    }
    
  }

} catch (err) {
  console.error('Error reading PSD:', err);
}
