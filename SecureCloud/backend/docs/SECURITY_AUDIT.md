# SecureCloud: Code Audit, Fixes and Verification

Scope: everything in the ZIP (`backend/`, no `.env`, no `node_modules` were read). **The DLP Lambda source is not in the ZIP**, so Section 6
is a checklist, not a code review. Nothing in AWS, Render or MongoDB was touched.

## 1. Architecture summary

Express + Mongoose API. Upload: `POST /files/upload-url` (File = UPLOADING, presigned PUT with SSE-KMS signed headers) -> browser PUT to S3 ->
`POST /files/:id/confirm` (HEAD the object, check SSE-KMS) -> S3 event -> Lambda scan -> `POST /dlp/scan-result` (API key) -> severity ->
classification -> risk -> File status. Access: owner-only presigned downloads, share links with policy engine, admin lock/unlock, audit + security events.

## A. Audit report

| # | Sev | Where | Problem | Result |
|---|---|---|---|---|
| 1 | Critical | `dlpController.saveScanResult` | Any finished scan moved SCANNING -> ACTIVE regardless of severity (CRITICAL data ACTIVE) | **Fixed**, tested |
| 2 | Critical | `fileController.confirmUpload` | COMPLETED/UNSUPPORTED scan => ACTIVE, severity ignored | **Fixed**, tested |
| 3 | High | `confirmUpload` | `scanned` undefined: ReferenceError after the status was already saved, so every confirm returned HTTP 500 | **Fixed**, tested |
| 4 | High | callback vs confirm | Read-modify-write races: confirm could set SCANNING *after* the result was stored (file stuck), or ACTIVE over a quarantine | **Fixed**: atomic status-conditioned updates + one shared `reconcileStatus`, interleaving tested |
| 5 | High | `riskService` | Risk never received severity: flat +30 and +20 capped an upload at 50 even for CRITICAL; `HIGH_RISK_UPLOAD` could not fire | **Fixed** (severity floor, shown in `breakdown`) |
| 6 | High | `unlockFile` | Unlock set ACTIVE whenever any COMPLETED scan existed (a CRITICAL file could be unlocked to ACTIVE) | **Fixed**, tested |
| 7 | High | share paths | Blacklist checks (LOCKED/QUARANTINED only); `approveShare` accepted any non-LOCKED file; old links kept working if a later scan tightened the file | **Fixed** (whitelist: only ACTIVE is shareable), tested |
| 8 | High | status model | QUARANTINED had no review path (permanent) | **Added** `PATCH /files/:id/release` (-> RESTRICTED only) |
| 9 | Med | callback | UNSUPPORTED released straight to ACTIVE | **Fixed** (-> RESTRICTED) |
| 10 | Med | callback | FAILED only quarantined while SCANNING; a later FAILED/CRITICAL scan of an ACTIVE file did nothing | **Fixed** (tighten-only transitions from any state) |
| 11 | Med | `DlpResult` | Retried callbacks created duplicate records | **Fixed** (payload hash + unique partial index; duplicate returns `duplicate:true`) |
| 12 | Med | `confirmUpload` | Client-supplied SHA-256 blocked the scanner's authoritative hash | **Fixed** (scanner wins; mismatch audited) |
| 13 | Med | `confirmUpload` | Object size taken from S3 without checking the limit or the declared size; KMS key id not verified | **Fixed** (reject + delete), tested |
| 14 | Med | presigned PUT | URL valid 15 min: content could be replaced after scanning | **Mitigated**: ETag baseline checked on owner download and share-link access (quarantine on change); a re-scan can only tighten. Residual in 7 |
| 15 | Low | validators | `status` filter lacked RESTRICTED | Fixed |
| 16 | Low | `.env.example` | `JWT_SECRET` placeholder shorter than the enforced 32 chars | Fixed (placeholder only) |
| 17 | Low | `contentDisposition` | RFC 5987 value left `' ( ) *` unencoded | Fixed |
| 18 | Low | uploads | No content-type allow-list | Optional `ALLOWED_MIME_TYPES` (unset = unchanged behaviour) |

Checked, no issue found: JWT (HS256 pinned, user reloaded each request), Lambda key (timing-safe, failed attempts rate limited), NoSQL injection
(Joi-validated strings/enums, regex escaped), path traversal (`sanitizeFileName` strips slashes and leading dots), ReDoS in backend (user input escaped),
IDOR on files/shares/events (owner checks, tested), error handler (no internals in production), CORS (explicit origins), body limit (100 kb).

### Not fixable from the code in the ZIP (needs you)
- **Lambda**: source not provided (see section 6).
- **Presigned URL after a status change**: a download URL issued just before a quarantine stays valid up to 5 minutes. Inherent to presigned URLs.
- **Unconfirmed uploads** stay in S3 (and are scanned). Add an S3 lifecycle rule for `uploads/` incomplete/old objects.
- **Render**: set `TRUST_PROXY=1`, otherwise rate limits and audit IPs see Render's proxy, not the client. I could not see your env, so this is unverified.
- **Bucket hardening** (recommended, not changed): block public access, default SSE-KMS, and a bucket policy denying `s3:PutObject` without `aws:kms`.
- Share tokens are stored in plain text (documented trade-off).

## C. Files changed

| File | Change |
|---|---|
| `services/dlpPolicyService.js` (new) | The only place that maps scan result -> status; pure and tested |
| `services/fileSecurityService.js` (new) | Atomic, tighten-only `reconcileStatus`; `verifyObjectIntegrity` |
| `controllers/dlpController.js` | Idempotent callback; severity -> classification -> risk; status via policy |
| `controllers/fileController.js` | `confirmUpload` rewrite (atomic claim, size/KMS checks, real `dlpStatus`); download whitelist + integrity; lock/unlock/release |
| `controllers/shareController.js` | RESTRICTED handling, approve only ACTIVE, integrity check before a link download |
| `services/riskService.js`, `utils/constants.js` | Severity floor, statuses, policy constants |
| `services/shareService.js`, `services/policyService.js` | Whitelist: only ACTIVE is shareable; severity passed to risk |
| `services/s3Service.js` | HEAD returns ETag and KMS key id |
| `db/models/File.js`, `DlpResult.js` | New fields (`dlpSeverity`, `s3ETag`, `statusBeforeLock`, `reviewedBy/At`, `payloadHash`), RESTRICTED status, unique partial index |
| `db/migrations/reconcile-file-status.js` (new) | Dry-run-by-default tightening of existing data |
| `routes/fileRoutes.js`, `utils/validators.js`, `utils/serializers.js`, `utils/strings.js`, `config/env.js`, `controllers/adminController.js` | release route/schema, MEDIUM `warning`, hidden internals, header encoding, optional MIME list, stats |
| `tests/*`, `README.md`, `docs/API.md`, `.env.example`, `package.json` | tests, docs, `migrate:reconcile` script |

## D. DLP security policy

| Result | Status | Download | Share link / new share | Notes |
|---|---|---|---|---|
| LOW (or NONE) | ACTIVE | owner | allowed by policy engine | |
| MEDIUM | ACTIVE | owner | allowed by policy engine | `warning` shown to owner |
| HIGH | RESTRICTED | owner only | **blocked** | admin may lock/delete |
| CRITICAL | QUARANTINED | **nobody** | **blocked** | admin `release` -> RESTRICTED |
| FAILED | QUARANTINED | nobody | blocked | fail closed; recommend Lambda posts FAILED only on its final attempt |
| UNSUPPORTED | RESTRICTED | owner only | blocked | explicit policy: unscannable is not clean; change `UNSUPPORTED_SCAN_STATUS` to `QUARANTINED` for stricter |
| pending | SCANNING / UPLOADING | nobody | blocked | |

Invariants: automatic transitions only tighten; no endpoint produces ACTIVE for HIGH/CRITICAL/FAILED/UNSUPPORTED; unlock restores the pre-lock status but never below the policy;
release goes to RESTRICTED and is not undone by later lock/unlock or scans; the highest severity ever recorded is kept.
Admins can still see metadata and delete, but (existing design) cannot download other users' files.

## E. Testing report

Run: `cd backend && npm test`. In my environment: **80 tests, 80 pass** (`node --test` on all files except `validators.test.js`).
`validators.test.js` could not run here because it needs `joi` from `node_modules` (not extracted by design; it fails identically on the original code). Run it on your machine.

How the new tests work: the real controllers and services run against in-memory fakes of the Mongoose models and S3 (`tests/helpers/harness.js`) that implement atomic
conditional updates, `$in/$ne/$exists`, sorting and the unique index. I checked the suite can fail by mutating the policy and the confirm logic (tests turned red).

| Your scenario | Automated | Where |
|---|---|---|
| 1-5 clean/LOW/MEDIUM/HIGH/CRITICAL | yes, both execution orders | `dlp-flow` "policy:" tests |
| 6 scan failure | yes | same |
| 7 unsupported | yes | same |
| 8 large file | yes (limit and size mismatch at confirm) | `dlp-flow` |
| 9 invalid encryption | yes (none, AES256) | `dlp-flow` |
| 10-12 unauthorized/quarantined/other user | yes | `dlp-flow` |
| 13 callback failure | yes (fails midway, retry converges) | `dlp-flow` |
| 14 duplicate callback | yes | `dlp-flow` |
| 15 / 16 Lambda first / confirm first | yes, plus forced race inside the claim window | `dlp-flow` |
| 17 lock/unlock | yes (+ DLP bypass attempts, release) | `dlp-flow` |
| 18 delete | yes | `dlp-flow` |

**Still needs manual verification (cannot be proven by fakes):** real MongoDB index creation and atomicity, S3 enforcing the signed `Content-Length` and SSE headers
(upload with a wrong size/without SSE and expect an S3 error), HEAD ETag/KMS values on your bucket, the Lambda itself, Joi validators (`npm test` locally), CORS from the real frontend, Render behaviour.

## F. Deployment

1. **Render (backend):** deploy the changed code. No new required variables. Optional: `ALLOWED_MIME_TYPES`; recommended: `TRUST_PROXY=1`. On first start Mongoose builds one new
   index on `dlpresults` (partial unique on `fileId + payloadHash`; existing documents are unaffected). Existing documents need no manual change.
2. **Existing data:** from a machine with `.env`, run `npm run migrate:reconcile` (dry run, prints ids and status changes only), review, then `npm run migrate:reconcile -- --apply`.
   It only tightens (e.g. your CRITICAL `securecloud-test.txt` ACTIVE -> QUARANTINED) and deletes nothing.
3. **Lambda:** no change is *required* for the backend to work; the callback contract is unchanged. Recommended hardening is in section 6.
4. **Frontend (not in the ZIP):** must handle the new `RESTRICTED` status, the `warning` field, `dlpStatus`/`dlpSeverity` in the confirm response, and new error codes
   `FILE_RESTRICTED`, `FILE_MODIFIED`, `SIZE_MISMATCH`.

## 6. Lambda checklist (source not provided)

Please send `securecloud-dlp-scanner` code and I will review it. Verify, at least: fileId is parsed from `uploads/<fileId>/...` and the key is URL-decoded (`+` and `%xx` in S3 events);
size is checked from the event (`object.size`) before downloading, and streams are bounded; empty, unreadable or unsupported files are reported as `FAILED`/`UNSUPPORTED`,
never as "no findings"; SHA-256 is computed over the stream; the callback uses a timeout shorter than the Lambda timeout, retries with backoff **only on network/5xx errors** and
resends the identical payload (the backend now de-duplicates); a non-2xx 4xx is not retried; `FAILED` is posted only on the final attempt (Lambda's own async retries otherwise
quarantine files that a retry would have scanned); the API key comes from an environment variable/Secrets Manager and is never logged; matched values are never logged (counts only);
timeout >= callback timeout + download time (your earlier 15 s callback timeout suggests raising the Lambda timeout and fixing the callback timeout, since Render free instances sleep and need a cold start).

## G. Post-fix verification (Postman)

Variables: `{{base}}`, `{{userToken}}`, `{{adminToken}}`, `{{lambdaKey}}`. Create the files with real S3 uploads, or simulate the Lambda with the callback request.

1. `POST {{base}}/api/files/upload-url` `{"fileName":"t.txt","fileType":"text/plain","size":120}` -> 201 `fileId`, `uploadUrl`, `headers`. PUT the bytes with exactly those headers.
2. `POST {{base}}/api/files/{{fileId}}/confirm` -> 200 `file.status` `SCANNING` and `dlpStatus` `PENDING` (no 500).
3. CRITICAL callback: `POST {{base}}/api/dlp/scan-result`, header `x-api-key: {{lambdaKey}}`,
   `{"fileId":"{{fileId}}","detectedTypes":["EMAIL","PHONE","PAN","ACCOUNT_NUMBER","SALARY_KEYWORD","CONFIDENTIAL_KEYWORD"],"matchCounts":{"EMAIL":1,"PHONE":1,"PAN":1,"ACCOUNT_NUMBER":1,"SALARY_KEYWORD":1,"CONFIDENTIAL_KEYWORD":1}}`
   -> 200 `severity` CRITICAL, `classification` HIGHLY_CONFIDENTIAL, `riskScore` 81, `status` QUARANTINED, `duplicate` false.
   Send it again -> `duplicate` true, same values.
4. `GET {{base}}/api/files/{{fileId}}/download-url` (user) -> 403 `FILE_QUARANTINED`. `POST /api/shares` -> 409 `FILE_NOT_READY`.
5. `PATCH {{base}}/api/files/{{fileId}}/release` (admin) -> `status` RESTRICTED; download by owner -> 200; `POST /api/shares` -> 403 `SHARE_BLOCKED`.
6. Repeat 1-2 with `["PAN"]` / `{"PAN":1}` -> HIGH, RESTRICTED. With `["SALARY_KEYWORD"]` -> MEDIUM, ACTIVE, response file has `warning`. With `"scanStatus":"FAILED"` -> QUARANTINED. With `"UNSUPPORTED"` -> RESTRICTED.
7. Order check: call the callback *before* confirm for a CRITICAL file, then confirm -> `QUARANTINED`, `dlpStatus` `COMPLETED`.
8. Other user's token on any `/api/files/{{fileId}}*` -> 403 and a `UNAUTHORIZED_ACCESS` event under `GET /api/events` (admin).
9. Lock/unlock a RESTRICTED file (admin) -> unlock returns `RESTRICTED`.

MongoDB fields to check: `files`: `status`, `dlpSeverity`, `classification`, `riskScore`, `s3ETag`, `reviewedAt`; `dlpresults`: exactly one COMPLETED document per distinct callback,
`payloadHash` present; `securityevents`: one `HIGH_RISK_UPLOAD` per quarantine; `auditlogs`: `FILE_STATUS_CHANGE`, `DLP_SCAN_RESULT` (`duplicate`), `FILE_RELEASE`.
