FROM node:20-slim AS build


# 비워두면 프론트엔드가 런타임에 window.location.hostname을 기준으로
# 게이트웨이 URL을 계산한다(localhost/LAN IP 어느 쪽으로 접속해도 동작).
# 다른 호스트에 떠 있는 게이트웨이를 쓰는 배포 환경에서만 명시적으로 값을 준다.
ARG VITE_API_BASE_URL=
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
