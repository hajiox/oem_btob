# OEM dashboard Gmail integration — 2026-09-22

## Account and infrastructure

- Only `staff@aizu-tv.com` may connect. OAuth callback verifies the Gmail profile server-side.
- Workspace organization shown in Cloud Console: `ai.aizu-tv.com`.
- Created dedicated Google Cloud project `aizu-oem-mail` (Aizu OEM Mail); Gmail API enabled.
- Correct production Vercel project: `oem`, `prj_EGhjPM1JhiWesDMUb02WA8AaUYI1`.
- Corrected local `.vercel/project.json` from separate `oem_btob` to `oem` after verifying the custom domain.

## Required setup before activation

1. Configure Google Auth Platform as an internal Workspace application. Create a web OAuth client with exact redirect URI `https://oem.aizubrandhall.com/api/oem/mail/callback`.
2. Set production server-only environment variables `OEM_GOOGLE_CLIENT_ID`, `OEM_GOOGLE_CLIENT_SECRET`, and `OEM_MAIL_ENCRYPTION_KEY` (canonical Base64, 32 random bytes). Never commit or print credentials. Set `NEXT_PUBLIC_BASE_URL=https://oem.aizubrandhall.com`.
3. Apply additive migration `sql/012_oem_conversations.sql` using the existing migration runner after rollback verification. Provision only the verified dashboard administrator's Supabase user ID in `oem_mail_admins`; ordinary authenticated accounts have no mailbox rights.
4. Deploy to the verified `oem` production project. Authorized administrator connects Google, selects staff account, and personally completes consent.
5. Verify outbound and inbound with a specifically approved test recipient. No customer emails should be sent as tests.

## Security and operational behavior

- OAuth scopes: `gmail.readonly` and `gmail.send`. Google grants mailbox-wide read access, but application searches/imports only exact OEM case tags with matching participants. No Gmail deletion/modification scope.
- Refresh token encrypted with AES-256-GCM; OAuth state single-use, user-bound, ten-minute expiry, PKCE S256.
- All mailbox routes require explicit admin membership and valid OEM lead. Mutations validate same-origin; attachments enforce case ownership.
- Subjects for new initial mail receive `[OEM-<full lead UUID>]` via insert-only trigger. Existing attempted/sent queue payloads remain unchanged.
- Untagged historical mail is not automatically imported. Replies that remove the tag are intentionally excluded; original Gmail remains available.
- Read-only HTML-to-text normalization, safe attachment downloads; send attachment maximum 10 files / 3 MB total.
- Stable send request and RFC Message-ID, pending-only atomic claim, and one unresolved send per case. Uncertain delivery is never automatically resent; synchronize to reconcile.
- Inbound synchronization is manual per case with pagination, not a scheduled background job.
- Attachment data is not persisted with drafts. Draft stores subject and body only.

## Verification / activation state

Local production build, TypeScript and targeted MIME/security/rollback DB tests passed. Migration 012 was subsequently applied to production. Only the existing `staff@aizu-tv.com` Supabase user was provisioned in `oem_mail_admins`. The production OAuth client and three server-only credentials plus public base URL are configured in Vercel. Deployment, final user authorization and real send/receive test must still be verified.

Google Auth Platform application `会津ブランド館 OEMメール管理` uses internal audience, support/contact `staff@aizu-tv.com`. User completed policy agreement; branding and web client `OEM Production Dashboard` were created with only the production callback URI. No Gmail access grant exists until the user completes dashboard OAuth authorization. Downloaded client credentials remain in the user's Downloads folder; never add them to Git.
