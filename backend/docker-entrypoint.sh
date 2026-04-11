#!/bin/sh
# Dynamically add node user to docker socket group at container startup
if [ -S /var/run/docker.sock ]; then
  DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
  if ! id -G node | grep -qw "$DOCKER_GID"; then
    addgroup -g "$DOCKER_GID" -S dockersock 2>/dev/null || true
    addgroup node dockersock 2>/dev/null || true
  fi
fi

# Ensure mounted data directories are writable by node user
for dir in /app/databot/logs /app/databot/workfolder /app/databot/dictionary /app/databot/knowledge /app/databot/uploads; do
  if [ -d "$dir" ]; then
    chown -R node:node "$dir" 2>/dev/null || true
  fi
done

# Run database migrations before starting the app
su-exec node npx prisma migrate deploy

exec su-exec node "$@"
