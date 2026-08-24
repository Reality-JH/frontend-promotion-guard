FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY examples/vite-react ./examples/vite-react
RUN npm run example:build
ARG FPG_BREAK_CSS_BUILD=0
RUN if [ "$FPG_BREAK_CSS_BUILD" = "1" ]; then find examples/vite-react/dist -name '*.css' -exec sh -c 'printf "/* intentionally broken */" > "$1"' _ {} \;; fi

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/examples/vite-react/dist ./dist
COPY examples/vite-react/server.mjs ./server.mjs
EXPOSE 8080
CMD ["node", "server.mjs"]
