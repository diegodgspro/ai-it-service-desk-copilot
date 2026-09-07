# Identity: Microsoft 365

Portfolio knowledge article. Synthetic lab context; technician validation required.

## Symptoms
- outlook keeps asking password microsoft 365 login
- microsoft 365 mfa authentication sign in error
- outlook authentication loop office token expired
- office 365 mailbox cannot sign in
- outlook web access works desktop sign in fails

## Working hypothesis
An expired sign-in session or a tenant authentication policy may be interrupting Outlook access.

## Troubleshooting
1. Capture the error, sign-in time and whether Outlook on the web works.
2. Check Microsoft 365 service health through the authorized administrator.
3. Validate account, license and MFA status through approved support channels.
4. Try an approved sign-out and sign-in; preserve drafts and avoid deleting profiles prematurely.
5. Escalate Conditional Access or repeated authentication failures with correlation IDs, without tokens or passwords.

## Escalation and closure
Escalate when scope exceeds authorization, symptoms persist, or security indicators appear. Close only after user validation. Record evidence and outcome.
