import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { CosmosClient } from "@azure/cosmos";

function getCosmosClient() {
  const connStr = process.env.COSMOS_CONNECTION_STRING!;
  const dbName = process.env.COSMOS_DATABASE || "pokerdb";
  const containerName = process.env.COSMOS_CONTAINER || "games";
  const client = new CosmosClient(connStr);
  const container = client.database(dbName).container(containerName);
  return container;
}

function generateId(len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function cors(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}

// POST /api/games — create game
app.http("createGame", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "games",
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    if (req.method === "OPTIONS") return cors({});
    try {
      const body = await req.json() as any;
      if (!body.hostName || !body.chipConfig) return cors({ error: "hostName and chipConfig required" }, 400);

      const id = generateId(6);
      const game = {
        id,
        hostName: body.hostName,
        chipConfig: body.chipConfig,
        players: [],
        status: "active",
        createdAt: new Date().toISOString(),
      };

      const container = getCosmosClient();
      await container.items.create(game);
      return cors(game, 201);
    } catch (e: any) {
      ctx.error("createGame error:", e);
      return cors({ error: "Internal server error" }, 500);
    }
  },
});

// GET /api/games/{id} — get game
app.http("getGame", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "games/{id}",
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    if (req.method === "OPTIONS") return cors({});
    const id = req.params.id;
    try {
      const container = getCosmosClient();
      const { resource } = await container.item(id, id).read();
      if (!resource) return cors({ error: "Game not found" }, 404);
      return cors(resource);
    } catch (e: any) {
      if (e.code === 404) return cors({ error: "Game not found" }, 404);
      ctx.error("getGame error:", e);
      return cors({ error: "Internal server error" }, 500);
    }
  },
});

// POST /api/games/{id}/players — join game
app.http("joinGame", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "games/{id}/players",
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    if (req.method === "OPTIONS") return cors({});
    const id = req.params.id;
    try {
      const body = await req.json() as any;
      if (!body.name) return cors({ error: "name required" }, 400);

      const container = getCosmosClient();
      const { resource: game } = await container.item(id, id).read();
      if (!game) return cors({ error: "Game not found" }, 404);

      const playerId = generateId(8);
      const player = {
        id: playerId,
        name: body.name,
        chips: [],
        payments: [],
      };
      game.players.push(player);
      await container.item(id, id).replace(game);
      return cors({ playerId, gameId: id }, 201);
    } catch (e: any) {
      ctx.error("joinGame error:", e);
      return cors({ error: "Internal server error" }, 500);
    }
  },
});

// PUT /api/games/{id}/players/{playerId}/chips — update chips
app.http("updateChips", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "games/{id}/players/{playerId}/chips",
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    if (req.method === "OPTIONS") return cors({});
    const { id, playerId } = req.params;
    try {
      const body = await req.json() as any;
      const container = getCosmosClient();
      const { resource: game } = await container.item(id, id).read();
      if (!game) return cors({ error: "Game not found" }, 404);

      const player = game.players.find((p: any) => p.id === playerId);
      if (!player) return cors({ error: "Player not found" }, 404);

      player.chips = body.chips;
      await container.item(id, id).replace(game);
      return cors({ success: true });
    } catch (e: any) {
      ctx.error("updateChips error:", e);
      return cors({ error: "Internal server error" }, 500);
    }
  },
});

// POST /api/games/{id}/players/{playerId}/payments — record payment
app.http("recordPayment", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "games/{id}/players/{playerId}/payments",
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    if (req.method === "OPTIONS") return cors({});
    const { id, playerId } = req.params;
    try {
      const body = await req.json() as any;
      if (!body.amount) return cors({ error: "amount required" }, 400);

      const container = getCosmosClient();
      const { resource: game } = await container.item(id, id).read();
      if (!game) return cors({ error: "Game not found" }, 404);

      const player = game.players.find((p: any) => p.id === playerId);
      if (!player) return cors({ error: "Player not found" }, 404);

      player.payments.push({
        amount: body.amount,
        note: body.note || "Buy-in",
        ts: new Date().toISOString(),
      });
      await container.item(id, id).replace(game);
      return cors({ success: true });
    } catch (e: any) {
      ctx.error("recordPayment error:", e);
      return cors({ error: "Internal server error" }, 500);
    }
  },
});
