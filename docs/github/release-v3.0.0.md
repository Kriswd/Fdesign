## 闪图 Fdesign V3.0

Fdesign V3.0 is the first public open-source release focused on ecommerce PSD production automation.

## Who should try this

- Ecommerce designers who repeatedly update PSD templates with product data.
- Ecommerce operators who manage product sheets and need repeatable image output.
- Developers exploring local Photoshop automation with React and Node.js.

## Highlights

- Value-led README and public demo materials.
- Real workbench screenshot showing canvas preview, product-slot binding, Excel data console, and export entry.
- Chinese minimal PSD template walkthrough for first-time users who need a safe local test template.
- Chinese troubleshooting checklist for npm install, local ports, health checks, image matching, and Photoshop export failures.
- Local workflow for binding Excel fields and product images to PSD variables.
- Batch export path for PSD, PSB, PNG, and JPEG.
- Public issue templates, roadmap, demo kit, and contribution paths.
- Configurable shop/service entry kept separate from open-source usage.

## Requirements

- Node.js 18+
- Windows 10/11 x64
- Local Adobe Photoshop installation that can be called by scripts

The repository does not include Photoshop, fonts, private templates, product assets, or generated outputs.

## Quick start

```bash
npm install
npm run server
npm run dev
```

- Frontend: `http://127.0.0.1:3010/`
- Backend health check: `http://127.0.0.1:3001/health`

Domestic first-run path:

- Chinese quick start: `docs/QUICKSTART_CN.md`
- Minimal PSD walkthrough: `docs/demo-kit/MINIMAL_PSD_TEMPLATE_CN.md`
- Troubleshooting checklist: `docs/TROUBLESHOOTING_CN.md`
- Workflow fit feedback: `https://github.com/Kriswd/Fdesign/issues/new?template=workflow_fit.yml`

## Known limitations

- Photoshop is required for production export.
- Some complex PSD templates need layer and variable naming cleanup before automation.
- The current public package focuses on local Windows workflows.
- Large PSD/PSB exports depend on machine performance and Photoshop behavior.

## Verification

The release should be validated with:

```bash
npm run lint
npm run build
npm test
```

For Photoshop export changes, run an end-to-end export with a sanitized PSD template before publishing client-facing artifacts.
