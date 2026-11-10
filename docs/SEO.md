# Search visibility

Set `SITE_URL` to the public HTTPS origin when building the production export:

```sh
SITE_URL=https://your-domain.example npm run build
```

Use only the origin, with no path, query or fragment. This emits the homepage
canonical URL, absolute social preview URLs, WebSite structured data and the
homepage sitemap entry. Without `SITE_URL`, canonical URLs are omitted and the
sitemap is intentionally empty. Rebuild when changing the deployment origin.

The homepage contains descriptive content and WebApplication JSON-LD in the
exported HTML, so crawlers can read it without executing JavaScript. `/ride/`
remains `noindex, follow` and is excluded from the sitemap. Keep it crawlable so
search engines can read its noindex directive.

After deployment:

1. Confirm `/`, `/robots.txt`, `/sitemap.xml` and `/icon.svg` return HTTP
   200 from the public host. Configure hosting redirects to serve one HTTPS
   origin, including a consistent www/non-www preference.
2. Verify the homepage canonical and sitemap use that origin.
3. Verify ownership in Google Search Console, submit `/sitemap.xml`, and inspect
   the homepage URL to request indexing.
4. Check JSON-LD with Schema.org Validator and inspect the rendered page in Search
   Console. App markup describes the actual free app; no ratings or reviews are
   invented. Structured data does not guarantee rich results or rankings.
5. Monitor indexing and Core Web Vitals with production traffic. Local performance
   tests catch regressions but do not establish real-user search performance.

Run `npm run check` and `npm run test:e2e` before publishing. The static E2E spec
checks content and structured data with JavaScript disabled, crawler files, the
ride noindex directive, and landing performance constraints.

## Landing page review (October 2026)

- The homepage has one descriptive H1, a topic-specific title and description,
  English language metadata, Open Graph/Twitter previews, and WebApplication
  JSON-LD describing the free app.
- All twelve FAQ answers are included in the exported HTML inside native `details`
  elements. They can be opened without JavaScript. Content covers actual routes,
  trainer limitations, simulator use, imports, privacy, game modes, Wahoo GPS
  bike computers and free Zwift-alternative intent.
- Keep the existing app structured data. Google retired FAQ rich results in May
  2026, so FAQPage markup is not needed for that search feature. See
  [Google’s documentation updates](https://developers.google.com/search/updates#june-2026).
- Production origin configuration remains essential: a build without `SITE_URL`
  intentionally has no canonical, absolute social image URLs or sitemap entries.
  Confirm the deployed export was built with the real origin.
- This is a source and local export review. Public-host redirects, index status,
  Search Console data and real-user Core Web Vitals require deployment checks
  using the steps above.
