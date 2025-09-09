# Google Drive Upload API

This project provides a RESTful API for uploading files to Google Drive using a Node.js backend. It is containerized with Docker and supports both production and development workflows using Docker Compose.

## Features

- Upload files to Google Drive via API endpoints
- Supports Google Service Account authentication
- Healthcheck endpoint for monitoring
- Hot-reload in development with nodemon
- Secure container setup (non-root user, isolated volumes)
- Environment variable configuration for secrets and runtime options

## Project Structure

```
/var/www/google-drive-api
├── credentials/         # Google Service Account credentials (not tracked in git)
├── uploads/             # Temporary uploaded files (not tracked in git)
├── logs/                # Application logs (not tracked in git)
├── server.js            # Main Node.js application file
├── package.json         # Node.js dependencies and scripts
├── Dockerfile           # Container build instructions
├── docker-compose.yml   # Production compose file
├── docker-compose.dev.yml # Development compose file
├── .env.production      # Production environment variables
├── .env.development     # Development environment variables
└── README.md            # Project documentation
```

## Getting Started

### Prerequisites

- Docker & Docker Compose installed
- Google Service Account credentials in `credentials/service-account-key.json`
- Node.js 18+ (for local development)

### Environment Variables

Create `.env.production` and `.env.development` files with the following (example):

```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
PORT=3000
```

### Build and Run (Production)

```sh
docker-compose up --build
```

The API will be available at `http://localhost:3010`.

### Development Mode (Hot Reload)

```sh
docker-compose -f docker-compose.dev.yml up --build
```

Changes to `server.js` will trigger automatic reloads.

## API Endpoints

- `POST /upload` — Upload a file to Google Drive
- `GET /health` — Healthcheck endpoint

## Security

- Runs as a non-root user inside the container
- Credentials and uploads are mounted as volumes and not tracked in git
- Sensitive environment variables are loaded from `.env.*` files

## Healthchecks

- Docker healthcheck monitors the `/health` endpoint
- Configurable via `HEALTHCHECK_URL` environment variable

## Development Notes

- Use `docker-compose.dev.yml` for local development and hot-reloading
- Mounts source code and logs for easier debugging
- Optional services (Postgres, Redis) can be enabled for extended features

## License

MIT License

---

**Maintainer:**  
Tincho  
martin@seemple.com.ar