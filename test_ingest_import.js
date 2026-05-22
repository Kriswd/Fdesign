import PhotoshopIngestService from './server/services/photoshopIngest.js';

console.log('Loading service...');
try {
    const service = new PhotoshopIngestService({ outputRoot: './output' });
    console.log('Service instantiated successfully.');
    console.log('Methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(service)));
} catch (e) {
    console.error('Error instantiating service:', e);
}
