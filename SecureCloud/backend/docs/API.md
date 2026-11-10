# API reference (Postman-ready)

Base URL: `{{baseUrl}}` = `http://localhost:5000`. Every route is under `/api`. Send `Content-Type: application/json`.
Protected routes need `Authorization: Bearer {{token}}`. Tip: in Postman, store `token` from the login response in an environment variable.

**Success**: `{ "success": true, "data": ..., "pagination": { "page", "limit", "total", "pages" } }` (pagination only on lists)
**Error**: `{ "success": false, "error": { "code", "message", "details"?, "requestId" } }`

| Status | Meaning |
|---|---|
| 400 | validation failed / bad input (`details` lists the fields) |
| 401 | missing, invalid or expired token / API key |
| 403 | not allowed (not the owner, not admin, locked file, blocked share, link denied) |
| 404 | not found |
| 409 | wrong state (e.g. already confirmed, already revoked) |
| 429 | rate limited |

List endpoints accept `page` (default 1) and `limit` (default 20, max 100). Dates are ISO 8601.

---

## Auth

### POST /api/auth/register  (public)
```json
{ "name": "Asha Rao", "email": "asha@demo.com", "password": "Passw0rd123" }
```
201 (password: 8-72 chars, at least one letter and one number; role is always `user`)
```json
{ "success": true, "data": { "user": { "_id": "665f...01", "name": "Asha Rao", "email": "asha@demo.com", "role": "user", "isActive": true, "createdAt": "2026-10-27T09:00:00.000Z", "updatedAt": "2026-10-27T09:00:00.000Z" }, "token": "eyJhbGciOi..." } }
```
Errors: 400 validation, 409 `EMAIL_TAKEN`, 429.

### POST /api/auth/login  (public, 10 failed attempts per IP per 15 min)
```json
{ "email": "user@demo.com", "password": "User@123" }
```
200 (same shape as register). 401 `INVALID_CREDENTIALS` (same message for unknown email and wrong password), 403 `ACCOUNT_DISABLED`.
After 5 failures for one email in 15 minutes a `FAILED_LOGIN` security event is created.

### GET /api/auth/me
200 `{ "success": true, "data": { "user": { "_id": "...", "name": "...", "email": "...", "role": "user", "isActive": true } } }`

---

## Files

### POST /api/files/upload-url
```json
{ "fileName": "salary-march.csv", "fileType": "text/csv", "size": 2048 }
```
201: creates the file with status `UPLOADING`
```json
{ "success": true, "data": {
  "fileId": "665f...a1",
  "uploadUrl": "https://BUCKET.s3.ap-south-1.amazonaws.com/uploads/665f...a1/salary-march.csv?X-Amz-Algorithm=...",
  "method": "PUT",
  "headers": { "Content-Type": "text/csv", "x-amz-server-side-encryption": "aws:kms" },
  "expiresIn": 900 } }
```
PUT the file to `uploadUrl` with exactly these headers.

### POST /api/files/:id/confirm  (owner)
No body. 200:
```json
{ "success": true, "data": { "file": { "id": "665f...a1", "ownerId": "665f...01", "originalName": "salary-march.csv", "size": 2048, "mimeType": "text/csv", "classification": "PUBLIC", "riskScore": 0, "status": "SCANNING" }, "dlpStatus": "PENDING" } }
```
Errors: 400 `UPLOAD_NOT_FOUND` / `ENCRYPTION_REQUIRED`, 409 `INVALID_STATE`, 403 not the owner.

### GET /api/files?page=1&limit=20&q=salary&classification=CONFIDENTIAL&status=ACTIVE
Own files only (deleted files hidden). `q` is a case-insensitive name search.
```json
{ "success": true, "data": [ { "id": "665f...a1", "originalName": "salary-march.csv", "classification": "HIGHLY_CONFIDENTIAL", "riskScore": 50, "status": "ACTIVE", "size": 2048, "mimeType": "text/csv", "createdAt": "2026-10-27T09:05:00.000Z" } ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 } }
```

### GET /api/files/:id  (owner or admin)
```json
{ "success": true, "data": {
  "file": { "id": "665f...a1", "originalName": "salary-march.csv", "classification": "HIGHLY_CONFIDENTIAL", "riskScore": 50, "status": "ACTIVE" },
  "dlpResult": { "_id": "665f...b2", "fileId": "665f...a1", "detectedTypes": ["SALARY_KEYWORD", "PAN", "ACCOUNT_NUMBER", "EMAIL"], "matchCounts": { "SALARY_KEYWORD": 6, "PAN": 3, "ACCOUNT_NUMBER": 3, "EMAIL": 4 }, "severity": "CRITICAL", "scanStatus": "COMPLETED", "scannedAt": "2026-10-27T09:05:20.000Z" } } }
```

### GET /api/files/:id/download-url  (owner only)
200 `{ "success": true, "data": { "downloadUrl": "https://...", "expiresIn": 300, "fileName": "salary-march.csv" } }`
403 `FILE_LOCKED` when the file is locked (also creates a `FILE_LOCKED_ACCESS` event). Writes a `DOWNLOAD` audit entry.

### DELETE /api/files/:id  (owner or admin)
Soft delete: status `DELETED`, open links revoked, S3 object removed.
`{ "success": true, "data": { "id": "665f...a1", "status": "DELETED", "s3Deleted": true, "linksRevoked": 2 } }`

### PATCH /api/files/:id/lock  (admin)
```json
{ "reason": "Under investigation" }
```
200 `{ "data": { "file": { "id": "...", "status": "LOCKED", "lockedBy": "665f...ad", "lockReason": "Under investigation" } } }`

### PATCH /api/files/:id/unlock  (admin)
No body. 200 `{ "data": { "file": { "id": "...", "status": "ACTIVE" } } }`

---

## Sharing

### POST /api/shares  (file owner)
```json
{ "fileId": "665f...a1", "recipientEmail": "someone@gmail.com", "expiresInHours": 24, "maxDownloads": 3 }
```
`expiresInHours` 1-720 (default 24), `maxDownloads` 1-100 (default 5). The file must be `ACTIVE` (or `LOCKED`, which always BLOCKs).

**ALLOW / WARN: 201**, **REQUIRE_APPROVAL: 202**
```json
{ "success": true, "data": {
  "decision": "WARN",
  "reason": "Policy \"Warn on internal share of confidential files\" matched (classification HIGHLY_CONFIDENTIAL is at least CONFIDENTIAL; recipient is INTERNAL (policy needs INTERNAL))",
  "riskScore": 50, "riskLevel": "Medium",
  "breakdown": [
    { "factor": "SENSITIVE_CONTENT", "points": 30, "reason": "Sensitive personal/financial content detected: PAN, ACCOUNT_NUMBER, SALARY_KEYWORD, EMAIL" },
    { "factor": "HIGHLY_CONFIDENTIAL", "points": 20, "reason": "File is classified HIGHLY_CONFIDENTIAL" } ],
  "link": { "id": "665f...c3", "fileId": "665f...a1", "recipientEmail": "admin@demo.com", "isExternal": false, "expiresAt": "2026-10-28T09:10:00.000Z", "maxDownloads": 3, "downloadCount": 0, "remainingDownloads": 3, "status": "ACTIVE", "policyDecision": "WARN", "riskScoreAtShare": 50, "token": "Zk3x...43chars", "url": "http://localhost:3000/shared/Zk3x..." } } }
```
For `REQUIRE_APPROVAL` the link has `status: "PENDING_APPROVAL"` and no `token`/`url` until an admin approves.

**BLOCK: 403**
```json
{ "success": false, "error": {
  "code": "SHARE_BLOCKED",
  "message": "Policy \"Block external share of highly confidential files\" matched (classification HIGHLY_CONFIDENTIAL is at least HIGHLY_CONFIDENTIAL; recipient is EXTERNAL (policy needs EXTERNAL))",
  "details": { "decision": "BLOCK", "reason": "Policy \"Block external share of highly confidential files\" matched (...)", "riskScore": 90, "riskLevel": "Critical",
    "breakdown": [ { "factor": "SENSITIVE_CONTENT", "points": 30, "reason": "..." }, { "factor": "HIGHLY_CONFIDENTIAL", "points": 20, "reason": "..." }, { "factor": "EXTERNAL_SHARING", "points": 20, "reason": "Shared outside the owner's organisation" }, { "factor": "UNKNOWN_RECIPIENT", "points": 20, "reason": "Recipient is not a registered user" } ],
    "link": null },
  "requestId": "0b7c..." } }
```
Other errors: 400 sharing with yourself, 403 not the owner, 409 `FILE_NOT_READY`.

### GET /api/shares/mine?status=ACTIVE
Links I created. Each item has the link fields shown above plus `file: { id, name, classification, status }`.

### GET /api/shares/with-me
ACTIVE, unexpired links addressed to my email. Items include `createdBy: { id, name, email }`, `file` and `token`.

### GET /api/shares/access/:token  (public; login optional)
Validates status, expiry, download limit and file lock, then increments `downloadCount` atomically.
If the link was shared with a **registered** account, send that account's `Authorization` header (401/403 otherwise).
```json
{ "success": true, "data": { "downloadUrl": "https://...", "expiresIn": 300, "fileName": "report.pdf", "size": 5120, "remainingDownloads": 2 } }
```
403 codes: `LINK_REVOKED`, `LINK_EXPIRED`, `DOWNLOAD_LIMIT_EXCEEDED`, `FILE_LOCKED`, `LINK_BLOCKED`, `LINK_PENDING_APPROVAL`, `FORBIDDEN`. 404 `LINK_NOT_FOUND`.
Each denial of the first four kinds creates a matching security event.

### POST /api/shares/:id/revoke  (creator or admin)
No body. 200 `{ "data": { "link": { "id": "...", "status": "REVOKED" } } }`. 409 if already revoked/expired/blocked.

### GET /api/shares/pending-approval  (admin)
Links waiting for approval (oldest first), with `file` and `createdBy`.

### POST /api/shares/:id/approve  (admin)
No body. Link becomes `ACTIVE` (token and url returned); stored risk drops by 10.
`{ "data": { "link": { "status": "ACTIVE", "token": "...", "url": "..." }, "riskScore": 60, "riskLevel": "Medium", "breakdown": [ { "factor": "TRUSTED_APPROVED_ACTION", "points": -10, "reason": "Action was approved by an administrator" } ] } }`

### POST /api/shares/:id/reject  (admin)
```json
{ "reason": "Recipient not verified" }
```
200 `{ "data": { "link": { "status": "BLOCKED" } } }` and a `BLOCKED_SHARE` event.

---

## DLP

### POST /api/dlp/scan-result  (Lambda only: header `x-api-key: {{lambdaApiKey}}`, no JWT)
```json
{ "fileId": "665f...a1", "detectedTypes": ["SALARY_KEYWORD", "PAN", "ACCOUNT_NUMBER", "EMAIL"], "matchCounts": { "SALARY_KEYWORD": 6, "PAN": 3, "ACCOUNT_NUMBER": 3, "EMAIL": 4 } }
```
Optional: `"scanStatus": "COMPLETED" | "FAILED" | "UNSUPPORTED"` (default COMPLETED), `"severity"` (scanner hint).
200:
```json
{ "success": true, "data": { "fileId": "665f...a1", "scanStatus": "COMPLETED", "severity": "CRITICAL", "classification": "HIGHLY_CONFIDENTIAL",
  "classificationReason": "Financial identifier with salary keywords", "riskScore": 50, "riskLevel": "Medium",
  "breakdown": [ { "factor": "SENSITIVE_CONTENT", "points": 30, "reason": "..." }, { "factor": "HIGHLY_CONFIDENTIAL", "points": 20, "reason": "..." } ],
  "status": "ACTIVE" } }
```
Creates a `HIGH_RISK_UPLOAD` event when the risk score is 61 or more. `FAILED` keeps the file in `SCANNING` (so the scan can be retried);
`UNSUPPORTED` releases it to `ACTIVE` unchanged. 401 `INVALID_API_KEY`, 404 file not found.

### GET /api/dlp/results/:fileId  (owner or admin)
`{ "data": { "fileId": "...", "classification": "HIGHLY_CONFIDENTIAL", "riskScore": 50, "results": [ { "detectedTypes": [...], "matchCounts": {...}, "severity": "CRITICAL", "scanStatus": "COMPLETED", "scannedAt": "..." } ] } }`

---

## Events

### GET /api/events/mine?severity=HIGH&type=BLOCKED_SHARE&from=2026-10-01T00:00:00Z&to=2026-10-31T23:59:59Z
My own security events, newest first.

### GET /api/events  (admin)
Same filters plus `userId` and `resolved=true|false`. Types: `BLOCKED_SHARE, WARNED_SHARE, FAILED_LOGIN, UNAUTHORIZED_ACCESS, EXPIRED_LINK_ACCESS, REVOKED_LINK_ACCESS, DOWNLOAD_LIMIT_EXCEEDED, SUSPICIOUS_DOWNLOADS, HIGH_RISK_UPLOAD, FILE_LOCKED_ACCESS`. Severities: `LOW, MEDIUM, HIGH, CRITICAL`.
```json
{ "success": true, "data": [ {
  "_id": "665f...e5", "eventType": "BLOCKED_SHARE", "severity": "CRITICAL", "actionTaken": "Share blocked", "riskScore": 90, "resolved": false,
  "reason": "Policy \"Block external share of highly confidential files\" matched (...)",
  "userId": { "_id": "665f...01", "name": "Demo User", "email": "user@demo.com" },
  "fileId": { "_id": "665f...a1", "originalName": "salary-march.csv", "classification": "HIGHLY_CONFIDENTIAL" },
  "createdAt": "2026-10-27T09:12:00.000Z" } ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 } }
```

---

## Audit

### GET /api/audit?userId=&action=SHARE_BLOCKED&targetType=File&from=&to=&page=1  (admin)
```json
{ "success": true, "data": [ {
  "_id": "665f...f6", "action": "SHARE_BLOCKED", "targetType": "File", "targetId": "665f...a1",
  "ipAddress": "203.0.113.7", "userAgent": "PostmanRuntime/7.39.0",
  "metadata": { "requestId": "0b7c...", "recipientEmail": "someone@gmail.com", "riskScore": 90, "policy": "Block external share of highly confidential files" },
  "userId": { "_id": "665f...01", "name": "Demo User", "email": "user@demo.com" },
  "createdAt": "2026-10-27T09:12:00.000Z" } ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 } }
```
Actions written: `REGISTER, LOGIN, LOGIN_FAILED, UPLOAD_URL_CREATE, UPLOAD, UPLOAD_REJECTED, DOWNLOAD, FILE_DELETE, FILE_LOCK, FILE_UNLOCK, SHARE_CREATE, SHARE_BLOCKED, SHARE_REVOKE, SHARE_APPROVED, SHARE_REJECTED, LINK_ACCESS_DENIED, ACCESS_DENIED, DLP_SCAN_RESULT, SUSPICIOUS_ACTIVITY, ROLE_CHANGE`.

---

## Admin

### GET /api/admin/stats
```json
{ "success": true, "data": {
  "totalFiles": 42, "highRiskFiles": 3, "blockedShares": 5, "suspiciousEvents": 2, "lockedFiles": 1,
  "filesBySensitivity": { "PUBLIC": 20, "INTERNAL": 8, "CONFIDENTIAL": 10, "HIGHLY_CONFIDENTIAL": 4 },
  "eventsOverTime": [ { "date": "2026-10-14", "count": 0 }, "... 14 entries, zero-filled, UTC days ...", { "date": "2026-10-27", "count": 4 } ],
  "downloadsByUser": [ { "userId": "665f...01", "name": "Demo User", "email": "user@demo.com", "downloads": 17 } ],
  "allowedVsBlocked": { "allowed": 30, "blocked": 5, "pendingApproval": 2 } } }
```
`highRiskFiles` = risk score 61 or more; `suspiciousEvents` = `SUSPICIOUS_DOWNLOADS`, `UNAUTHORIZED_ACCESS` and `HIGH_RISK_UPLOAD` events;
`downloadsByUser` = top 10 over the last 14 days; `allowed` counts ALLOW + WARN decisions.

### GET /api/admin/users?q=asha&role=user&page=1
`{ "data": [ { "_id": "...", "name": "Asha Rao", "email": "asha@demo.com", "role": "user", "isActive": true } ], "pagination": {...} }` (never includes password hashes)

### PATCH /api/admin/users/:id/role
```json
{ "role": "admin" }
```
200 `{ "data": { "user": { "_id": "...", "role": "admin" } } }`. 400 when changing your own role, 404 unknown user.

---

## Other
`GET /health` returns `{ "status": "ok" }` (no auth, outside `/api`).
