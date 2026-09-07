# Network: VPN

Portfolio knowledge article. Synthetic lab context; technician validation required.

## Symptoms
- vpn connection failed after changing password
- remote access vpn tunnel authentication rejected
- vpn client cannot connect gateway timeout
- vpn disconnect remote worker authentication error
- unable to establish corporate vpn tunnel

## Working hypothesis
Saved VPN credentials or a client authentication state may be stale after a password change.

## Troubleshooting
1. Confirm internet access before troubleshooting the VPN tunnel.
2. Capture the VPN error and time; verify the approved gateway and service status.
3. Validate account status and MFA through approved processes without sharing credentials.
4. Re-enter updated credentials in the approved client; do not disable MFA or certificate validation.
5. Reconnect and validate access to an approved internal resource; escalate persistent gateway failures.

## Escalation and closure
Escalate when scope exceeds authorization, symptoms persist, or security indicators appear. Close only after user validation. Record evidence and outcome.
