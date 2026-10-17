#!/bin/bash
# GO Classes Social Studio - Created by Mrinal
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22 or newer from https://nodejs.org then try again."
  read -r -p "Press Enter to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install
  npm run setup
fi
echo "Open http://localhost:3000 after the server starts."
npm start
