# DEPRECATED: Old AnimazingPal Directory

⚠️ **This directory is deprecated and not in use.**

## Active Plugin Location

The active AnimazingPal plugin is located at:
```
app/plugins/animazingpal/
```

## Why This Exists

This directory contains an older version of the AnimazingPal plugin that was kept for reference but is no longer maintained or loaded by the application.

## Differences

- Port configuration (8008 vs 9000)
- Missing latest features (standalone mode, logic matrix, enhanced memory)
- Older plugin structure

## Action Recommended

This directory can be safely removed in a future cleanup as all active development happens in `app/plugins/animazingpal/`.

## Migration

If you need to migrate any custom configurations from this old directory:
1. Check `app/plugins/animazingpal/` for the current structure
2. Use the Admin UI at `/animazingpal/ui` to configure settings
3. All data is stored in the database, not in plugin files

---
**Last Updated:** 2026-01-22  
**Status:** DEPRECATED  
**Active Version:** app/plugins/animazingpal/
