# Socrate Monitoring BFF — multi-stage build → distroless static (nonroot) image.
# Pinned to the toolchain go.mod / backendkit v1.12.0 build with (P3-25).
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /bff .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /bff /bff
EXPOSE 8090
USER nonroot:nonroot
ENTRYPOINT ["/bff"]
