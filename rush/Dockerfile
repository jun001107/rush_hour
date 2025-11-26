FROM golang:1.24

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build the app with a unique name 'rush-server' to avoid conflict
RUN go build -o rush-server cmd/survey-server/main.go

EXPOSE 8080

# Run the unique name
CMD ["./rush-server"]