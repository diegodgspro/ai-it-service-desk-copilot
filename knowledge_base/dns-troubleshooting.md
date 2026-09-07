# Network: DNS

Portfolio knowledge article. Synthetic lab context; technician validation required.

## Symptoms
- dns server not responding hostname lookup failure
- internal website name resolution fails but ip works
- cannot resolve intranet hostname dns record
- dns nxdomain on company network
- network connectivity dns lookup timeout

## Working hypothesis
An incorrect DNS server, stale cache or missing record may prevent name resolution.

## Troubleshooting
1. Confirm scope and record the affected hostname and exact error.
2. Compare connectivity by approved IP and hostname; ping failure alone does not prove an outage.
3. Inspect adapter and DNS configuration; use Resolve-DnsName against the configured resolver.
4. Compare with a working device; do not replace corporate DNS with public resolvers.
5. Consider an approved cache flush only when evidence supports it; escalate authoritative record or resolver faults.

## Escalation and closure
Escalate when scope exceeds authorization, symptoms persist, or security indicators appear. Close only after user validation. Record evidence and outcome.
