FROM node:20-slim AS build

ARG VITE_API_BASE_URL=http://localhost:3000
ARG VITE_IDENTITY_API_BASE_URL=http://localhost:8080

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_IDENTITY_API_BASE_URL=$VITE_IDENTITY_API_BASE_URL

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5175
CMD ["nginx", "-g", "daemon off;"]
