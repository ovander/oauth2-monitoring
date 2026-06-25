# Socrate Monitoring BFF — multi-stage build → distroless static (nonroot) image.
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /bff .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /bff /bff
EXPOSE 8090
USER nonroot:nonroot
ENTRYPOINT ["/bff"]
