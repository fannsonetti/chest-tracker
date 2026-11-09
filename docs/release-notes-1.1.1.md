Chest Tracker 1.1.1 switches the default party relay to **85.220.66.209:47800** and makes the HUD quieter and more compact.

- Compact layout enabled by default, including the first upgrade from the previous interface.
- SVG line icons, neutral colors, and controls revealed on hover.
- Small match recap with a 250ms fade and 3px slide; no particles or glow.
- Three new compact SVG proposals: A Outline, B Inline, C Ledger. Final design selection is pending.
- Internet and Same network address shortcuts; use Same network on app-01’s LAN if router loopback is unavailable.
- app-01 relay runs as an enabled user service on TCP 47800, with firewall and router forwarding configured. Public health checks and a two-player match through 85.220.66.209:47800 pass, including guest permissions and consecutive-opening streaks.

Install **ChestTracker-Setup-1.1.1.exe**. Installed 1.1.0 copies will receive it through the automatic update check on launch. Portable copies require a one-time switch to the installer. Existing counts and history are preserved. The installer is unsigned.
