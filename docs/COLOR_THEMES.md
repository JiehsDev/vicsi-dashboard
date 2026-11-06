# Dashboard color themes

The palette button beside the light/dark button opens **Color theme**. Choices
are Default (the accepted existing colors), ParSU Blue (deep blue), Green,
Pink and Monochrome. Light/dark mode remains a separate choice for every palette.
The ParSU Blue option is an application palette, not a claim of an official
university brand specification.

The choice applies immediately and persists in this browser as `vicsi-palette`.
Existing `vicsi-theme` preferences are preserved. A whitelisted first-paint script
restores both preferences before the page is shown. Invalid or unavailable palette
storage falls back to Default. Changes in other tabs are synchronized through the
browser storage event. No account, authentication or database settings change.

`src/app/palettes.css` overrides the existing design tokens. Text, controls,
answers, navigation, dialogs and status colors use the established tokens.
Monochrome uses neutral status colors; status text retains its meaning.
Fixed colors in the picker swatches intentionally preview the other choices.

The supplied logo's alpha mask is preserved in `public/brand/logo-mask.svg`;
CSS supplies a readable palette-specific foreground for the emblem and wordmark.
No image-generation or tracing step changes the user's artwork. The script
`node Tools/generate-favicon.mjs` recreates the mask and self-contained palette
favicons from `public/brand/vicsi-logo.png`. The favicon follows the palette across
page loads, including authentication pages with a previously saved preference.

Verification:

Run `npm run test:themes` for the focused palette checks.

- `colorTheme.test.ts`: all first-paint combinations, invalid preference values
  and unavailable storage.
- `palette-responsive.test.mjs`: the real controls, logo mask and favicon in a
  browser, three account roles at 375/768/1440 pixels, every palette in both modes
  (90 combinations), checked text contrast of at least 4.5:1, logo contrast at
  least 3:1, no horizontal overflow, keyboard radio selection and reload persistence.
- Existing dashboard regression and browser fixtures retain the Default palette
  unless the test explicitly selects another palette. Screenshots remain local
  in the Temp directory, outside source control.

Validated on 2026-11-06: production webpack build, TypeScript, scoped lint,
dashboard regression suite and all focused palette checks passed. The broader
browser run passed 256 checks; its six authentication-logo checks still queried
the old inline image element. Those checks were updated to verify the rendered
logo mask and all six passed on the focused rerun. Product layout and contrast
checks did not require a production-code correction.
