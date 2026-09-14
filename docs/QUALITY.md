# Quality and static hosting

Use Node.js 22.13 or newer. Run `npm ci`, then `npm run check` for zero-warning ESLint, strict TypeScript, formatting, and unit tests. `npm run test:e2e` builds a fresh static export and runs Chromium against it. `npx playwright install chromium` installs the browser when needed.

ESLint uses Next.js Core Web Vitals and TypeScript rules, with hook dependencies, unused variables, explicit `any`, and strict equality enforced as errors. ESLint 9 is retained because the React plugin bundled with the current Next.js lint configuration crashes under ESLint 10; revisit that version when the plugin supports it.

## Deployment metadata

Set `SITE_URL` to the real public origin before building, for example `SITE_URL=https://your-domain.example npm run build`. It must have no subpath, credentials, query, or fragment. The build emits an absolute home canonical URL, social preview URLs, and a sitemap containing the home page. `/ride/` is a duplicate setup entry point and carries `noindex, follow`.

Without `SITE_URL`, the build intentionally omits domain-dependent metadata and emits an empty sitemap instead of publishing an invented domain. `robots.txt` is available in either case. Serve `out/` over HTTPS for Bluetooth. Configure the host to cache `/_next/static/` with `public, max-age=31536000, immutable`; revalidate HTML and the unversioned preview image on deployment.

## Performance checks

The landing page is prerendered with a 27 KB WebP captured from the original Cedar Valley scene. It reserves the background dimensions, preloads the image, uses system fonts, and reserves space for Bluetooth availability text. Three.js is imported only after Start; the simulator timer also runs only during a simulated ride. Route profile geometry is computed once. Hidden tabs pause simulation and skip rendering.

Browser regressions check content without JavaScript, metadata and crawler files, no landing-page WebGL context, a 750 KB decoded script budget, CLS at or below 0.1, mobile overflow, renderer failure, and simulator/Bluetooth ride controls. A `landing-performance.json` attachment records local LCP, CLS, and decoded script bytes. These local measurements are diagnostics, not field Core Web Vitals results. Verify mobile LCP and INP on the deployed host and representative devices; real trainer hardware also needs manual testing.

References: [Next.js metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), [LCP optimization](https://web.dev/articles/optimize-lcp), [INP optimization](https://web.dev/articles/optimize-inp).
