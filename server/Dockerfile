FROM node:22-alpine
WORKDIR /app
RUN echo '{"type":"module"}' > package.json && npm install ws
COPY relay.js ./relay.js
ENV PORT=8080
EXPOSE 8080
CMD ["node", "relay.js"]
