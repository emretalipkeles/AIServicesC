#!/bin/bash
set -e

npm install --ignore-scripts
npm run db:push --force
