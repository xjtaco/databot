# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM eclipse-temurin:22-jdk-alpine AS build

RUN apk add --no-cache maven

WORKDIR /app

# Copy pom and local repo first for dependency caching
COPY pom.xml ./
COPY repo ./repo

# Download dependencies (cached layer)
RUN mvn dependency:go-offline -B

# Copy source and build fat jar
COPY src ./src
RUN mvn package -DskipTests -B

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM eclipse-temurin:22-jre-alpine

WORKDIR /app

COPY --from=build /app/target/bridge.jar ./bridge.jar

EXPOSE 8080

CMD ["java", "-jar", "bridge.jar"]
