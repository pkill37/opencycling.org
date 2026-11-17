# Hosting and deployment

[Documentation index](../README.md)

## Static export

```sh
SITE_URL=https://your-domain.example npm run build
npm start
```

`npm run build` exports the site to `out/`; `npm start` previews that directory on port 3000. Deploy the export to HTTPS static hosting. There is no runtime Node server, database or account service. HTTPS is required for real Bluetooth connections, and the browser must also implement Web Bluetooth.

Use only an HTTP(S) origin for `SITE_URL`: no credentials, subpath, query or fragment. Rebuild when it changes. With a configured origin, the build emits a home canonical URL, absolute social URLs, WebSite structured data and a home-page sitemap entry. Without it, domain-dependent metadata is omitted and the sitemap is intentionally empty. `robots.txt` remains available.

Configure `/_next/static/` with `Cache-Control: public, max-age=31536000, immutable`; revalidate HTML and unversioned assets on deployment. Serve one consistent HTTPS origin and configure host redirects accordingly.

## Search visibility

The exported homepage contains descriptive content, native expandable FAQs and WebApplication JSON-LD without requiring JavaScript. Keep structured data consistent with the actual free application; do not invent ratings or reviews. `/ride/` is an alternate setup entry point with `noindex, follow`, excluded from the sitemap. Keep it crawlable so its noindex directive can be read.

After deployment:

1. Check `/`, `/ride/`, `/robots.txt`, `/sitemap.xml` and `/icon.svg` on the public host.
2. Confirm canonical, sitemap and social URLs use the configured origin, including the desired www/non-www preference.
3. Verify the homepage content and metadata without JavaScript, and confirm `/ride/` retains its noindex directive.
4. Verify ownership in Google Search Console, submit the sitemap and inspect the homepage. Check JSON-LD with Schema.org Validator.
5. Monitor actual indexing and field Core Web Vitals. Local checks and structured data do not guarantee rankings or rich results.

## Performance and release checks

The landing page uses local preview imagery, reserved image dimensions and system fonts. Three.js and world preparation load after Start; simulator timers run only during simulated rides. Hidden tabs stop race progression, rendering and zombie sound.

Run `npm run check` and `npm run test:e2e` before publishing. The browser suite checks crawler files, metadata, script/layout budgets and ride flows; see [testing](../development/testing.md). Review real-device LCP/INP and frame rates, and follow [trainer compatibility](../trainer-compatibility.md) and [route accuracy/reuse gates](../routes/pipeline.md#budgets-and-release-gates) separately.

References: [Next.js static export](https://nextjs.org/docs/app/guides/static-exports), [metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), [LCP](https://web.dev/articles/optimize-lcp), [INP](https://web.dev/articles/optimize-inp).
