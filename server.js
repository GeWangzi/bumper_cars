import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

app.use(express.static("public"));

const players = {};
const streaks = {};
const lastHitBy = {};

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

  socket.emit("currentPlayers", players);

  socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

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

  socket.on("collisionImpulse", (data) => {
    const { targetId, nx, nz, speed } = data;

    if (players[targetId]) {
      lastHitBy[targetId] = socket.id;
    }

    io.to(targetId).emit("applyImpulse", {
      nx: -nx,
      nz: -nz,
      speed,
    });
  });

  socket.on("playerDied", (data) => {
    const victimId = socket.id;
    const { x, y, z } = data || {};

    io.emit("playerDied", {
      id: victimId,
      x,
      y,
      z,
    });

    const killerId = lastHitBy[victimId];
    console.log("last hit:",killerId);
    if (killerId && streaks.hasOwnProperty(killerId)) {
      streaks[killerId] = (streaks[killerId] || 0) + 1;

      io.to(killerId).emit("killCredit", {
        streak: streaks[killerId],
      });

      io.emit("streakUpdate", {
        id: killerId,
        streak: streaks[killerId],
      });
    }

    delete lastHitBy[victimId];
  });

  socket.on("playerRespawned", (data) => {
    if (!players[socket.id]) return;

    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].z = data.z;

    streaks[socket.id] = 0;

    io.emit("playerRespawned", { id: socket.id, ...players[socket.id] });

    io.emit("streakUpdate", {
      id: socket.id,
      streak: 0,
    });
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);

    delete players[socket.id];
    delete streaks[socket.id];

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
