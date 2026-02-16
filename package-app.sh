#!/usr/bin/env bash
set -euo pipefail

APP_NAME="studioflow-web-app"
OUT_DIR="dist"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ZIP_PATH="${OUT_DIR}/${APP_NAME}-${TIMESTAMP}.zip"

mkdir -p "$OUT_DIR"

zip -r "$ZIP_PATH" \
  index.html 404.html about-the-app.html support.html \
  auth.html register.html portal.html book.html shop.html \
  admin.html clients.html services.html settings.html reminders.html packages.html teacher_book.html \
  billing.html receipts.html invoice.html lesson-editor.html \
  app-api.js app-ui.js pwa-init.js sw.js manifest.webmanifest offline.html \
  readme.md APP_DOCUMENTATION.md icons

echo "Created: $ZIP_PATH"
