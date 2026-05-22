Change: PSD artboard rename should follow uploaded product style/color

- For `天猫主图` artboards that already contain a `style + color` token, replace the full token with the uploaded product `style + color` instead of replacing only the style.
- For `天猫主图` artboards that contain only a style token, replace only the style token and keep the rest of the title unchanged.
- For `天猫主图` artboards that do not contain any style token, inject the uploaded product style after the `天猫主图` prefix so optional-color overview boards do not lose the model.
- Added regression coverage in `tests/template_meta_artboard.test.js` for:
  - main-artboard style/color replacement
  - two-letter color codes
  - optional-color artboards with and without an existing style token
