import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// Serve static files (the client)
app.use(express.static("public"));

const players = {};   // { socketId: { x, y, z, color } }
const streaks = {};   // { socketId: number }
const lastHitBy = {}; // victimId -> attackerId

function randomColor() {
  return (
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
  );
}

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  players[socket.id] = {
    x: 0,
    y: 0.5,
    z: 0,
    color: randomColor(),
  };

  streaks[socket.id] = 0;

  // send everyone to this client
  socket.emit("currentPlayers", players);

  // tell others about this player
  socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

  // movement
  socket.on("move", (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].z = data.z;

    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      ...players[socket.id],
    });
  });

  // collision impulse from one player to another
  socket.on("collisionImpulse", (data) => {
    const { targetId, nx, nz, speed } = data;

    // record last hitter: socket.id hit targetId
    if (players[targetId]) {
      lastHitBy[targetId] = socket.id;
    }

    io.to(targetId).emit("applyImpulse", {
      nx: -nx,
      nz: -nz,
      speed,
    });
  });

  // death / respawn events
  socket.on("playerDied", (data) => {
    // data: { x, y, z } – where this player died
    const victimId = socket.id;
    const { x, y, z } = data || {};

    // broadcast the death + explosion position
    io.emit("playerDied", {
      id: victimId,
      x,
      y,
      z,
    });

    // credit last hitter, if any
    const killerId = lastHitBy[victimId];
    console.log("last hit:",killerId);
    if (killerId && streaks.hasOwnProperty(killerId)) {
      streaks[killerId] = (streaks[killerId] || 0) + 1;

      // tell killer their streak (for knockback/UI)
      io.to(killerId).emit("killCredit", {
        streak: streaks[killerId],
      });

      // tell everyone to update killer's size
      io.emit("streakUpdate", {
        id: killerId,
        streak: streaks[killerId],
      });
    }

    // clear last hit record for this victim
    delete lastHitBy[victimId];
  });

  socket.on("playerRespawned", (data) => {
    if (!players[socket.id]) return;

    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].z = data.z;

    // reset this player's streak on respawn
    streaks[socket.id] = 0;

    io.emit("playerRespawned", { id: socket.id, ...players[socket.id] });

    io.emit("streakUpdate", {
      id: socket.id,
      streak: 0,
    });
  });

  // disconnect
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);

    delete players[socket.id];
    delete streaks[socket.id];

    // clean up any lastHitBy entries where they were hitter or victim
    for (const victim in lastHitBy) {
      if (victim === socket.id || lastHitBy[victim] === socket.id) {
        delete lastHitBy[victim];
      }
    }

    io.emit("playerDisconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log("Server listening on PORT", PORT);
});
