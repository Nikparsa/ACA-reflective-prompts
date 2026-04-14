FROM node:20-alpine as build

WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

COPY package.json package-lock.json* ./
ENV NODE_ENV=development
RUN npm ci --include=dev

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]







