# Use ultra-lightweight Node on Alpine Linux
FROM node:24-alpine

# Install Squid and Apache HTTP tools (for htpasswd)
RUN apk update && apk add squid apache2-utils

# Setup workspace
WORKDIR /app

# Copy project files
COPY package.json index.js ./

# Link the package globally so 'proxyfoxy' command works
RUN npm link

# Expose default port (User can map to anything with docker run -p)
EXPOSE 8000

# Run our specific docker command in the foreground
ENTRYPOINT ["node", "/app/index.js", "docker"]