# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Node backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Production image — Node serves both API and static frontend
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
# Copy compiled backend
COPY --from=backend-builder /app/backend/dist ./dist
# Copy frontend build into dist/public where Express will serve it
COPY --from=frontend-builder /app/frontend/dist ./dist/public

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
