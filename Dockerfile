# 1. Use pure Alpine Linux
FROM alpine:latest

# 2. Install ONLY what we need (Node runtime, Squid, htpasswd)
RUN apk add --no-cache nodejs squid apache2-utils

# 3. Setup workspace
WORKDIR /app

# 4. Copy ONLY your script files
COPY package.json index.js ./

# 5. Run our specific docker command directly
ENTRYPOINT ["node", "/app/index.js", "docker"]