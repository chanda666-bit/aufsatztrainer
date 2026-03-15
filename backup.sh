#!/bin/bash

DATE=$(date +%Y-%m-%d_%H-%M)

echo "Creating backup..."

cp /var/www/aufsatz-trainer/backend/data/*.db /var/backups/aufsatztrainer/backup_$DATE.db

# nur letzte 30 Backups behalten
ls -t /var/backups/aufsatztrainer/*.db | tail -n +31 | xargs rm -f

echo "Backup finished"#!/bin/bash

DATE=$(date +%Y-%m-%d_%H-%M)

echo "Creating backup..."

cp /var/www/aufsatz-trainer/backend/data/*.db /var/backups/aufsatztrainer/backup_$DATE.db

echo "Backup finished"
