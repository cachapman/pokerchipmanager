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

// GET /api/games — list active games
app.http("listGames", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "games",
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    if (req.method === "OPTIONS") return cors({});
    try {
      const container = getCosmosClient();
      const { resources } = await container.items
        .query("SELECT c.id, c.hostName, c.status, c.createdAt, c.players, c.actionHistory FROM c WHERE c.status = 'active'")
        .fetchAll();
      // Return lightweight summary per game
      const summary = resources.map((g: any) => ({
        id: g.id,
        hostName: g.hostName,
        createdAt: g.createdAt,
        playerCount: (g.players ?? []).length,
        playerNames: (g.players ?? []).map((p: any) => p.name),
        lastAction: g.actionHistory?.length
          ? g.actionHistory[g.actionHistory.length - 1]
          : null,
      }));
      return cors(summary);
    } catch (e: any) {
      ctx.error("listGames error:", e);
      return cors({ error: "Internal server error" }, 500);
    }
  },
});

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
      const hostPlayerId = generateId(8);
      const game = {
        id,
        hostName: body.hostName,
        chipConfig: body.chipConfig,
        players: [{
          id: hostPlayerId,
          name: body.hostName,
          chips: [],
          payments: [],
          isHost: true,
        }],
        pot: [] as { color: string; count: number }[],
        actionHistory: [] as any[],
        status: "active",
        createdAt: new Date().toISOString(),
        hostPlayerId,
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
      if (body.totalBetsValue !== undefined) {
        player.totalBetsValue = body.totalBetsValue;
      }
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

// POST /api/games/{id}/pot/contribute — move chips from player to pot
app.http("contributeToPot", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "games/{id}/pot/contribute",
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    if (req.method === "OPTIONS") return cors({});
    const { id } = req.params;
    try {
      const body = await req.json() as any;
      if (!body.playerId || !Array.isArray(body.chips)) return cors({ error: "playerId and chips required" }, 400);

      const container = getCosmosClient();
      const { resource: game } = await container.item(id, id).read();
      if (!game) return cors({ error: "Game not found" }, 404);

      const player = game.players.find((p: any) => p.id === body.playerId);
      if (!player) return cors({ error: "Player not found" }, 404);

      if (!game.pot) game.pot = [];
      if (!game.potBreakdown) game.potBreakdown = [];
      if (!game.actionHistory) game.actionHistory = [];

      // Validate player has enough chips
      for (const contrib of body.chips as { color: string; count: number }[]) {
        if (contrib.count <= 0) continue;
        const playerChip = player.chips.find((c: any) => c.color === contrib.color);
        const available = playerChip?.count ?? 0;
        if (contrib.count > available) {
          return cors({ error: `Not enough ${contrib.color} chips (have ${available}, need ${contrib.count})` }, 400);
        }
      }

      // Compute contribution dollar value
      const contribValue = (body.chips as { color: string; count: number }[]).reduce((sum, c) => {
        if (c.count <= 0) return sum;
        const cfg = (game.chipConfig as { color: string; value: number }[]).find((x: any) => x.color === c.color);
        return sum + (cfg?.value ?? 0) * c.count;
      }, 0);

      // Save undo snapshot
      const prevState = {
        pot: JSON.parse(JSON.stringify(game.pot)),
        potBreakdown: JSON.parse(JSON.stringify(game.potBreakdown)),
        players: [{ id: player.id, chips: JSON.parse(JSON.stringify(player.chips)), totalBetsValue: player.totalBetsValue ?? 0 }],
      };

      // Deduct from player, add to pot
      for (const contrib of body.chips as { color: string; count: number }[]) {
        if (contrib.count <= 0) continue;
        const playerChip = player.chips.find((c: any) => c.color === contrib.color);
        if (playerChip) playerChip.count -= contrib.count;
        const potChip = game.pot.find((c: any) => c.color === contrib.color);
        if (potChip) potChip.count += contrib.count;
        else game.pot.push({ color: contrib.color, count: contrib.count });
      }

      // Update pot breakdown (accumulate if player contributed before)
      const existingBreakdown = game.potBreakdown.find((e: any) => e.playerId === player.id);
      if (existingBreakdown) {
        existingBreakdown.value += contribValue;
      } else {
        game.potBreakdown.push({ playerId: player.id, playerName: player.name, value: contribValue });
      }

      // Update player lifetime bet total
      player.totalBetsValue = (player.totalBetsValue ?? 0) + contribValue;

      game.actionHistory.push({
        type: "pot_contribution",
        description: `${player.name} contributed to pot`,
        prevState,
        ts: new Date().toISOString(),
      });
      // Keep history bounded
      if (game.actionHistory.length > 20) game.actionHistory = game.actionHistory.slice(-20);

      await container.item(id, id).replace(game);
      return cors({ success: true });
    } catch (e: any) {
      ctx.error("contributeToPot error:", e);
      return cors({ error: "Internal server error" }, 500);
    }
  },
});

// POST /api/games/{id}/pot/award — award pot to a player
app.http("awardPot", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "games/{id}/pot/award",
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    if (req.method === "OPTIONS") return cors({});
    const { id } = req.params;
    try {
      const body = await req.json() as any;
      if (!body.playerId) return cors({ error: "playerId required" }, 400);

      const container = getCosmosClient();
      const { resource: game } = await container.item(id, id).read();
      if (!game) return cors({ error: "Game not found" }, 404);

      const winner = game.players.find((p: any) => p.id === body.playerId);
      if (!winner) return cors({ error: "Player not found" }, 404);

      if (!game.pot || game.pot.length === 0) return cors({ error: "Pot is empty" }, 400);
      if (!game.actionHistory) game.actionHistory = [];
      if (!game.potBreakdown) game.potBreakdown = [];

      // Save undo snapshot
      const prevState = {
        pot: JSON.parse(JSON.stringify(game.pot)),
        potBreakdown: JSON.parse(JSON.stringify(game.potBreakdown)),
        players: [{ id: winner.id, chips: JSON.parse(JSON.stringify(winner.chips)), totalBetsValue: winner.totalBetsValue ?? 0 }],
      };

      // Add pot chips to winner
      for (const potChip of game.pot as { color: string; count: number }[]) {
        if (potChip.count <= 0) continue;
        const winnerChip = winner.chips.find((c: any) => c.color === potChip.color);
        if (winnerChip) winnerChip.count += potChip.count;
        else winner.chips.push({ color: potChip.color, count: potChip.count });
      }

      game.actionHistory.push({
        type: "pot_award",
        description: `Pot awarded to ${winner.name}`,
        prevState,
        ts: new Date().toISOString(),
      });
      if (game.actionHistory.length > 20) game.actionHistory = game.actionHistory.slice(-20);

      game.pot = [];
      game.potBreakdown = [];

      await container.item(id, id).replace(game);
      return cors({ success: true });
    } catch (e: any) {
      ctx.error("awardPot error:", e);
      return cors({ error: "Internal server error" }, 500);
    }
  },
});

// POST /api/games/{id}/undo — undo last pot action
app.http("undoAction", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "games/{id}/undo",
  handler: async (req: HttpRequest, ctx: InvocationContext) => {
    if (req.method === "OPTIONS") return cors({});
    const { id } = req.params;
    try {
      const container = getCosmosClient();
      const { resource: game } = await container.item(id, id).read();
      if (!game) return cors({ error: "Game not found" }, 404);

      if (!game.actionHistory || game.actionHistory.length === 0) {
        return cors({ error: "Nothing to undo" }, 400);
      }

      const lastAction = game.actionHistory.pop();

      // Restore pot
      game.pot = lastAction.prevState.pot;

      // Restore pot breakdown if snapshot includes it
      if (lastAction.prevState.potBreakdown !== undefined) {
        game.potBreakdown = lastAction.prevState.potBreakdown;
      }

      // Restore affected players' chips and totalBetsValue
      for (const prevPlayer of lastAction.prevState.players as { id: string; chips: any[]; totalBetsValue?: number }[]) {
        const player = game.players.find((p: any) => p.id === prevPlayer.id);
        if (player) {
          player.chips = prevPlayer.chips;
          if (prevPlayer.totalBetsValue !== undefined) {
            player.totalBetsValue = prevPlayer.totalBetsValue;
          }
        }
      }

      await container.item(id, id).replace(game);
      return cors({ success: true, undid: lastAction.description });
    } catch (e: any) {
      ctx.error("undoAction error:", e);
      return cors({ error: "Internal server error" }, 500);
    }
  },
});
