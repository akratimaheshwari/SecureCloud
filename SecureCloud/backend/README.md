# Secure Cloud File Storage with DLP and Intelligent Access Control: Backend

Express + Mongoose + JWT + AWS SDK v3. Files live in S3 (browser uploads/downloads with pre-signed URLs);
MongoDB stores metadata only. **No AI/ML**: classification, risk scoring and access decisions are plain rules
that can be explained line by line.

## Run it

```bash
npm install
cp .env.example .env        # fill in MONGO_URI, JWT_SECRET, AWS_REGION, S3_BUCKET, LAMBDA_API_KEY, FRONTEND_URL
npm run seed                # admin + demo user + 4 default policies (safe to re-run)
npm run dev                 # or: npm start      -> http://localhost:5000/health
npm test                    # unit tests for the rule logic
```

Seeded logins (from `.env`): `admin@demo.com` / `Admin@123` (admin) and `user@demo.com` / `User@123` (user).
These are demo values; change them outside local demos. Generate secrets with `openssl rand -hex 48` (JWT) and
`openssl rand -hex 32` (Lambda key).

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | default 5000 |
| `MONGO_URI` | yes | Atlas connection string |
| `JWT_SECRET` | yes | at least 32 characters |
| `JWT_EXPIRES_IN` | no | default `1h` |
| `AWS_REGION`, `S3_BUCKET` | yes | no access keys: the SDK uses the default credential chain (IAM role, or your AWS profile/SSO locally) |
| `LAMBDA_API_KEY` | yes | value the DLP Lambda sends in `x-api-key` |
| `FRONTEND_URL` | yes | CORS origin(s), comma-separated; also the base of share links (`<FRONTEND_URL>/shared/<token>`) |
| `S3_KMS_KEY_ID` | no | customer-managed KMS key; omit to use the AWS-managed `aws/s3` key |
| `TRUST_PROXY` | no | set `1` behind a load balancer so rate limits and audit logs see real client IPs |

## AWS setup

1. **Bucket**: block all public access; enable default SSE-KMS encryption. Object keys look like
   `uploads/<fileId>/<fileName>`; the Lambda reads the `fileId` from the key.
2. **Bucket CORS** (browser uploads): origin = your `FRONTEND_URL`, methods `PUT, GET`, headers `*`, expose `ETag`.
3. **IAM role for the API** (least privilege):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::YOUR_BUCKET/uploads/*" },
    { "Effect": "Allow", "Action": ["kms:GenerateDataKey", "kms:Decrypt"], "Resource": "arn:aws:kms:REGION:ACCOUNT:key/YOUR_KEY_ID" }
  ]
}
```
   (`kms:*` lines are only needed for a customer-managed key.)
4. **DLP Lambda**: S3 `ObjectCreated` trigger on prefix `uploads/`. It scans the object with regex/keyword rules, then calls
   `POST /api/dlp/scan-result` with header `x-api-key: <LAMBDA_API_KEY>` and body
   `{ "fileId", "detectedTypes", "matchCounts" }`.

### Upload flow (frontend)

1. `POST /api/files/upload-url` returns `{ fileId, uploadUrl, headers }`.
2. `PUT` the file to `uploadUrl` with **exactly** the returned `headers` (Content-Type + SSE-KMS headers). They are part of the signature.
3. `POST /api/files/:id/confirm`. The API checks the object exists and is SSE-KMS encrypted, then sets `SCANNING`.
4. The Lambda posts the scan; the file becomes `ACTIVE` with its classification and risk score.
   If the Lambda finishes before `/confirm`, `/confirm` moves the file straight to `ACTIVE`.

## Rules (all in `utils/constants.js` and `services/`)

**Severity** (from the scanner's findings): CRITICAL = PAN/account number + salary keyword, or 10+ PAN/account matches;
HIGH = any PAN/account number, or salary + confidential keyword; MEDIUM = salary or confidential keyword, email + phone together,
or 20+ email/phone matches; LOW = email or phone alone; NONE otherwise.

**Classification**: HIGHLY_CONFIDENTIAL = (PAN or ACCOUNT_NUMBER) with SALARY_KEYWORD, or severity CRITICAL;
CONFIDENTIAL = severity HIGH or MEDIUM; INTERNAL = LOW; PUBLIC otherwise.

**Risk score** (clamped 0-100; Low 0-30, Medium 31-60, High 61-80, Critical 81-100): sensitive personal/financial content +30
(PAN, ACCOUNT_NUMBER, SALARY_KEYWORD, EMAIL, PHONE), HIGHLY_CONFIDENTIAL +20, external sharing +20, more than 10 downloads by the
user in the last hour +20, unknown/unregistered recipient +20, admin-approved action -10. The `breakdown` array lists every point.

**Policy engine**: external = recipient domain differs from the owner's domain **or** recipient is not a registered user.
Locked file => BLOCK. Otherwise enabled policies are checked by ascending `priority`, first match wins
(`minClassification` means "this level or higher"). Seeded: 10 block external HIGHLY_CONFIDENTIAL, 20 require approval for
external CONFIDENTIAL, 30 warn on internal CONFIDENTIAL, 100 allow all.

**Suspicious downloads**: more than 10 downloads by one user in an hour => `SUSPICIOUS_DOWNLOADS` event (one open event per user per hour).
**Failed logins**: 5 failures for the same email within 15 minutes => `FAILED_LOGIN` event (again at 10, 15...); login is also rate limited per IP.

## Demo flow: salary file, external share, BLOCK

Set `BASE=http://localhost:5000` and use the `token` from each login response.

```bash
# 1. Log in as the normal user
curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"user@demo.com","password":"User@123"}'                                  # -> USER_TOKEN

# 2. Ask for an upload URL for a salary file
curl -s -X POST $BASE/api/files/upload-url -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"fileName":"salary-march.csv","fileType":"text/csv","size":2048}'                # -> fileId, uploadUrl, headers

# 3. PUT the file to S3 with the returned headers, then confirm
curl -X PUT "$UPLOAD_URL" -H 'Content-Type: text/csv' -H 'x-amz-server-side-encryption: aws:kms' --data-binary @salary-march.csv
curl -s -X POST $BASE/api/files/$FILE_ID/confirm -H "Authorization: Bearer $USER_TOKEN"

# 4. The Lambda reports the scan. If it is not deployed yet, play its part:
curl -s -X POST $BASE/api/dlp/scan-result -H "x-api-key: $LAMBDA_API_KEY" -H 'Content-Type: application/json' \
  -d '{"fileId":"'$FILE_ID'","detectedTypes":["SALARY_KEYWORD","PAN","ACCOUNT_NUMBER","EMAIL"],"matchCounts":{"SALARY_KEYWORD":6,"PAN":3,"ACCOUNT_NUMBER":3,"EMAIL":4}}'
#    -> classification HIGHLY_CONFIDENTIAL, risk 50 (Medium), file status ACTIVE

# 5. Try an external share -> BLOCK (HTTP 403, details.decision = "BLOCK")
curl -s -X POST $BASE/api/shares -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"fileId":"'$FILE_ID'","recipientEmail":"someone@gmail.com","expiresInHours":24,"maxDownloads":3}'

# 6. Log in as admin and look at the evidence
curl -s "$BASE/api/events?type=BLOCKED_SHARE" -H "Authorization: Bearer $ADMIN_TOKEN"   # BLOCKED_SHARE, severity CRITICAL, risk 90
curl -s "$BASE/api/audit?action=SHARE_BLOCKED" -H "Authorization: Bearer $ADMIN_TOKEN"  # who, which file, which policy, IP
curl -s $BASE/api/admin/stats -H "Authorization: Bearer $ADMIN_TOKEN"                  # blockedShares: 1, allowedVsBlocked...
```

More to try: share the same file to `admin@demo.com` (registered, same domain) => **WARN** (201, a `WARNED_SHARE` event);
lock the file (`PATCH /api/files/:id/lock` as admin) and share again => **BLOCK**; a CONFIDENTIAL file shared externally =>
**REQUIRE_APPROVAL** (202), then approve with `POST /api/shares/:id/approve` as admin.
Steps 2-3 need a real S3 bucket and credentials; everything after the upload can be exercised with curl only.

All endpoints with sample requests and responses: **[docs/API.md](docs/API.md)**.

## Project layout

```
config/       env validation, S3 client
db/           MongoDB layer: db.js (connection), models/ (the seven Mongoose models), seed/ (admin, demo user, default policies)
middleware/   authenticate, authorizeRoles, validate, errorHandler, rateLimiter, verifyLambdaKey, requestId
routes/       one router per area, mounted under /api
controllers/  request handling (auth, file, share, dlp, event, audit, admin)
services/     classification, risk, policy, s3, audit, suspicious, share (+ security-event and file-access helpers)
utils/        constants (all rule values), validators (Joi), serializers, ApiError, policy matcher
tests/        node:test unit tests for the rule logic
```

## Decisions worth knowing

- **Severity is computed by the API.** The Lambda sends only types and counts, so `classificationService.computeSeverity` turns them
  into a severity (rules above). If the Lambda also sends a `severity`, the API keeps the higher of the two.
- **HIGH_RISK_UPLOAD is hard to reach with the specified weights.** An upload alone can score at most 50 (content +30, HIGHLY_CONFIDENTIAL +20);
  61+ needs the uploader to also exceed 10 downloads in the last hour. To flag more uploads, lower `HIGH_RISK_THRESHOLD` in `utils/constants.js`.
- **BLOCK returns HTTP 403** with the full decision in `error.details` (`decision`, `reason`, `riskScore`, `breakdown`, `link: null`).
  REQUIRE_APPROVAL returns 202; ALLOW and WARN return 201. Every attempt, including blocked ones, is stored as a `SharingLink`.
- **Approval endpoints were added** (`GET /shares/pending-approval`, `POST /shares/:id/approve|reject`, admin only); without them a
  `PENDING_APPROVAL` link could never be resolved. Approval applies the -10 "trusted approved action" weight.
- **Downloads are owner-only** (`/files/:id/download-url`); admins can see metadata and delete, but cannot download other users' files.
- **Share links**: a link addressed to a *registered* account only works for that account (or the creator); a link for an unregistered
  address is a bearer link (anyone with the token). Tokens are 256-bit random values; they are redacted from access logs.
- **Delete** soft-deletes the metadata, revokes open links and removes the S3 object. Turn on bucket versioning if you need recovery.
- Audit and security-event writes are best effort: a failure is logged to the console and never breaks the request.

## Known limitations

- No email verification at registration, so a person who registers with an address could use links shared to it.
- Anonymous downloads through bearer links cannot be attributed to a user, so the 10-per-hour rule applies to logged-in users only
  (each link still has its own `maxDownloads`).
- Tokens are stored as issued (the schema looks links up by `token`); hash them at rest if a database leak is in your threat model.
- Re-sent scan results from the Lambda create a new `DlpResult` (no de-duplication).
- Abandoned uploads stay `UPLOADING`; add an S3 lifecycle rule or a cleanup job.
- Only the pure rule logic has automated tests (`npm test`); routes were checked for syntax but not run against a live MongoDB/S3 here.
