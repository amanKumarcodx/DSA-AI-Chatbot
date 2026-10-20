# DSA AI Chatbot

A React-based DSA chatbot with an Express API. The server uses Gemini to generate replies, Firebase Authentication to authorize user requests, MongoDB to store chats, and Redis as an optional cache.

## Requirements

- Node.js and npm
- A MongoDB connection
- A Firebase project and service-account credentials
- A Gemini API key
- Redis is optional

## Getting started

Install the dependencies:

```bash
npm install
```

Create a local `.env` file from the example:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and provide the values for your environment:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `FIREBASE_PROJECT_ID` | Firebase project ID used by the server to verify user tokens |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to your Firebase service-account JSON file |
| `GEMINI_API_KEY` | Server-side Gemini API key |
| `GEMINI_MODEL` | Gemini model name; defaults to `gemini-3.8-flash` |
| `API_PORT` | API port; defaults to `3003` |
| `CLIENT_ORIGINS` | Optional comma-separated list of allowed client origins |
| `API_URL` | Client API base URL; defaults to `http://localhost:3003/api` |
| `REDIS_URL` | Optional Redis connection URL |

Keep `.env` and service-account credentials private; do not commit secrets.

## Run locally

Start the API server in one terminal:

```bash
npm run server
```

Start the Parcel development server in another terminal:

```bash
npx parcel src/index.html
```

Parcel serves the client at `http://localhost:1234` by default. The API listens on `http://localhost:3003` by default. Check that the required database, Firebase, and Gemini settings are configured before starting the API.

## Build

Create a production client build:

```bash
npm run build
```

The generated site is written to `dist/`.

## API health check

With the API running, visit `http://localhost:3003/api/health`.

## Architecture diagrams

- [DSA chatbot runtime](docs/architecture-dsa-chatbot-runtime-20261020-175044/dsa-chatbot-runtime.html)
- [Cache-miss web request](docs/sequence-cache-miss-web-request-20261020-173900/cache-miss-web-request.html)
