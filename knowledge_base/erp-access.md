---
id: kb-business-application-erp
title: Application: ERP
source_type: runbook
service: Business application
category: ERP
product: Northstar Demo ERP
operating_system: any
language: en
approval_status: approved
version: 1.0
last_reviewed: 2026-09-11
tags: erp, access, service unavailable
classification: synthetic-demo
---

# Application: ERP

Portfolio knowledge article. Synthetic lab context; technician validation required.

## Symptoms
- erp application unavailable all users order entry
- enterprise resource planning login server error
- erp access denied application role
- business application erp service unavailable
- erp application returns 503 backend connection

## Working hypothesis
The ERP service, backend connectivity or application authorization may be failing.

## Troubleshooting
1. Capture the application error, timestamp and affected business workflow.
2. Confirm whether the issue affects multiple users and check the service status.
3. Test the approved application endpoint without collecting business records.
4. Gather sanitized correlation IDs and compare recent approved deployments.
5. Escalate to application support with impact and evidence; do not restart the database or change production records.

## Escalation and closure
Escalate when scope exceeds authorization, symptoms persist, or security indicators appear. Close only after user validation. Record evidence and outcome.
