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

1. Confirm `/`, `/robots.txt`, `/sitemap.xml` and `/cedar-valley.webp` return HTTP
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
