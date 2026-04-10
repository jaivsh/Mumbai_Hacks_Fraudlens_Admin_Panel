# FraudLens marketing website (static)

This folder is a **static landing site** (no build tooling) designed to be uploaded to a GCS bucket + served via Cloud CDN.

## Edit content
- `index.html` (sections + copy)
- `faq.html` (FAQ page)
- `contact.html` (company intake form template)
- `terms.html`, `privacy.html`, `sla.html`, `nda.html`, `dpa.html`, `aup.html` (legal pages)
- `styles.css` (theme)
- `main.js` (mobile menu + contact form email/copy behavior)

## Deploy (GCS + Cloud CDN)
Upload the folder contents to a bucket (example: `fraudlens-website-prod`) at the root:

```bash
BUCKET="fraudlens-website-prod"
gcloud storage rsync -r "marketing_site" "gs://$BUCKET"
```

Then set website main/error pages:

```bash
gsutil web set -m index.html -e index.html "gs://$BUCKET"
```

If you put Cloud CDN in front via a backend bucket + URL map, invalidate cache after updates:

```bash
URL_MAP="fraudlens-website-map"
gcloud compute url-maps invalidate-cdn-cache "$URL_MAP" --path "/*" --async
```

