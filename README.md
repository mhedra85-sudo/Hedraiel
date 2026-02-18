# Hedra – Teacher Edition (V6.4 Rebuild)

## What’s new
- Clean rebuild: one `index.html`, separated files.
- Fix: PIN unlock button (click + Enter) + always enabled.
- PrintPRO: in-app print preview + "فاتورة مختصرة" + Print + Save-as-PDF via browser dialog.
- Relative PWA manifest & safer service worker for GitHub Pages subfolders.

## Deploy
Upload all files to your GitHub Pages folder. Then in browser:
- DevTools → Application → Service Workers → Unregister
- Clear storage → Clear site data
- Hard refresh (Ctrl+Shift+R)
