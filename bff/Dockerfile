# Socrate Monitoring BFF — multi-stage build → distroless static (nonroot) image.
# Pinned to the exact patch release in go.mod's toolchain line; CI fails if the
# two drift (P3-25). The golang images set GOTOOLCHAIN=local, so this tag is
# the Go that compiles the shipped binary.
FROM golang:1.26.8-alpine AS build
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
