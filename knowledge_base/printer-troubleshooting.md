---
id: kb-hardware-printing
title: Hardware: Printing
source_type: runbook
service: Printing
category: Printer
product: Network printer
operating_system: any
language: en
approval_status: approved
version: 1.0
last_reviewed: 2026-09-11
tags: printer, print queue, spooler
classification: synthetic-demo
---

# Hardware: Printing

Portfolio knowledge article. Synthetic lab context; technician validation required.

## Symptoms
- printer offline cannot print documents queue stuck
- print spooler service stopped jobs pending
- network printer offline print queue error
- printing fails printer unavailable
- documents stuck in spooler printing queue

## Working hypothesis
The printer connection, queue or spooler may be unavailable; confirm which layer is failing.

## Troubleshooting
1. Check printer power, display errors, paper and network connection.
2. Confirm whether one user or the entire printer queue is affected.
3. Check the configured printer port and queue status before changing settings.
4. Inspect Print Spooler status; record pending jobs before proposing a restart.
5. If approved, restart the spooler during an agreed window and print a test page; escalate hardware faults.

## Escalation and closure
Escalate when scope exceeds authorization, symptoms persist, or security indicators appear. Close only after user validation. Record evidence and outcome.
