# Browser test environment

This directory is intentionally free of local or production configuration.
Playwright injects the synthetic public browser-test values into its web server.

Only one Playwright suite may use a workspace at a time. The browser-server
lock fails a concurrent suite before it can clean or rebuild shared artifacts.
