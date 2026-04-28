FROM alpine:latest
RUN apk add --no-cache nodejs squid apache2-utils
WORKDIR /app
COPY package.json index.js ./
RUN chmod +x /app/index.js && ln -s /app/index.js /usr/bin/proxyfoxy
ENTRYPOINT ["node", "/app/index.js", "docker"]