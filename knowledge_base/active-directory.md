---
id: kb-active-directory-account-lockout
title: Identity: Account lockout
source_type: runbook
service: Identity and access
category: Active Directory
product: Active Directory
operating_system: Windows
language: en
approval_status: approved
version: 1.0
last_reviewed: 2026-09-11
tags: account lockout, authentication, password change
classification: synthetic-demo
---

# Identity: Account lockout

Portfolio knowledge article. Synthetic lab context; technician validation required.

## Symptoms
- active directory account locked repeated failed domain logon
- domain user locked out after password change
- windows sign in account lockout on domain controller
- directory authentication account disabled or locked
- cannot logon domain account says locked

## Working hypothesis
Directory authentication is blocked by a lockout; stale credentials are one possible source.

## Troubleshooting
1. Confirm user identity using the approved verification procedure; never request a password.
2. Ask the directory team to inspect lockout events and the originating device.
3. Check for stored credentials in scheduled tasks, mobile mail and mapped drives.
4. After identity verification, request an authorized unlock and update stale credentials.
5. Validate a fresh sign-in and monitor for repeated lockouts; escalate suspicious activity.

## Escalation and closure
Escalate when scope exceeds authorization, symptoms persist, or security indicators appear. Close only after user validation. Record evidence and outcome.
