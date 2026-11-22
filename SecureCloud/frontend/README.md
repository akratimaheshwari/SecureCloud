# SecureCloud frontend

React 18 + Vite + Tailwind CSS 4 client for the SecureCloud backend (`../backend`).

## Run it

```bash
cd frontend
npm install
cp .env.example .env     # VITE_API_URL=http://localhost:5000/api
npm run dev              # http://localhost:3000
```

Start the backend first (`cd backend && npm run dev`). The dev server uses **port 3000** on purpose: it matches
`FRONTEND_URL=http://localhost:3000` in `backend/.env`, which is both the CORS allow-list and the base of share links
(`/shared/:token`). If you change the port, change `FRONTEND_URL` too.

In development the login page shows buttons that fill the seeded demo accounts (`npm run seed` in the backend).

## One-time AWS setup: S3 bucket CORS

Files go from the browser straight to S3 with the pre-signed URL, so the bucket must allow that origin.
S3 console > your bucket > Permissions > Cross-origin resource sharing (CORS):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "x-amz-server-side-encryption", "x-amz-server-side-encryption-aws-kms-key-id"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Add your deployed frontend origin to `AllowedOrigins` (and to `FRONTEND_URL`, comma-separated) when you deploy.
Without this, uploads fail with "Could not reach storage".

## What is in it

| Area | Pages |
|---|---|
| Public | `/login`, `/register`, `/shared/:token` (opening a share link) |
| Every user | `/` dashboard, `/files` (upload, search, filter, download, share, delete), `/files/:id` (scan findings, risk), `/shares/mine`, `/shares/with-me`, `/activity` |
| Admin only | `/admin` overview charts, `/admin/approvals`, `/admin/events`, `/admin/audit`, `/admin/users`; lock, unlock and release actions on `/files/:id` |

## How it talks to the backend

```
src/api/client.js     axios instance: base URL, Bearer token, 401 -> sign out
src/api/*.js          one function per endpoint (auth, files, shares, events/audit, admin)
src/context/AuthContext.jsx   session, login/register/logout, restores the session from the saved token
src/hooks/useFetch.js         loading/error/reload for every page
```

- **Upload flow** (`components/UploadDialog.jsx`): `POST /files/upload-url` -> `PUT` to S3 with the returned headers
  (no Authorization header goes to S3) -> `POST /files/:id/confirm`. Then the Files page polls every 6 s while a
  file is `SCANNING`, until the Lambda reports and the status becomes `ACTIVE`, `RESTRICTED` or `QUARANTINED`.
- **Sharing** (`components/ShareDialog.jsx`): shows the policy decision, the reason and the risk breakdown for
  `ALLOW`, `WARN`, `REQUIRE_APPROVAL` (202) and `BLOCK` (403 `SHARE_BLOCKED`).
- **Share links**: `/shared/:token` does not call the API on load, because every access consumes a download.
  The person clicks "Download file" first. If the link was shared with a registered account it asks them to sign in.
- The API allows 300 requests per 15 minutes per IP, so the only polling is the scan-status refresh above.

## Notes

- The JWT is kept in `localStorage` (the backend uses Bearer tokens, not cookies). Keep an eye on XSS: this app never
  renders HTML from the API, and React escapes everything it prints.
- `GET /api/files` returns only the caller's own files, so admins reach other users' files from the security events
  table (file name links to `/files/:id`). A `GET /api/files?all=true` for admins would give them a full file browser.
- `PATCH /api/files/:id/release` exists in the backend routes (used for quarantined files) but is missing from
  `backend/docs/API.md`.

## Build

```bash
npm run build     # output in dist/
npm run preview
```
