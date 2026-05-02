# Poker Chip Manager

A web app for managing poker chips across multiple players.

## Features
- Create a game with custom chip colors and values
- Share a 6-character game code with players
- Distribute chips to players
- Track buy-ins and payments
- Real-time sync via polling

## Development

### Prerequisites
- Node.js 18+
- Azure Functions Core Tools v4
- Azure Cosmos DB (or emulator)

### Frontend
```bash
cd src/web
npm install
npm run dev
```

### API
```bash
cd src/api
npm install
# Set COSMOS_CONNECTION_STRING in local.settings.json
npm run start
```
