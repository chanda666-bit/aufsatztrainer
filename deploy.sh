#!/bin/bash

echo "⬇️ Pull latest code from GitHub..."
cd /var/www/aufsatz-trainer || exit

git pull

echo "📦 Installing backend dependencies..."
cd backend || exit
npm install

echo "🔁 Restarting server..."
pm2 restart aufsatztrainer --update-env

echo "✅ Deployment finished"
pm2 list
