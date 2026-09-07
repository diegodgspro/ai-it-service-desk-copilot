# Access: Shared folder

Portfolio knowledge article. Synthetic lab context; technician validation required.

## Symptoms
- mapped network drive access denied shared folder
- smb file share permission denied unc path
- network drive disconnected file server access
- shared folder ntfs permissions cannot open
- mapped drive missing after login share access

## Working hypothesis
An SMB session, group membership or share/NTFS permission mismatch may deny access.

## Troubleshooting
1. Capture the UNC path and error; confirm VPN or local network connectivity.
2. Check name resolution and connectivity to the approved file server.
3. Compare effective share and NTFS permissions with the documented entitlement.
4. Check recent group changes and reconnect the session after an approved sign-in refresh.
5. Request data-owner authorization for permission changes; never grant broad access as a shortcut.

## Escalation and closure
Escalate when scope exceeds authorization, symptoms persist, or security indicators appear. Close only after user validation. Record evidence and outcome.
