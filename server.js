// Run:  npm init -y
//       npm install express socket.io
//       node server.js

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// Serve static files (our Three.js client)
app.use(express.static("public"));

const players = {};  // { socketId: { x, y, z, color } }

function randomColor() {
  return "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  // Create a player object for this new connection
  players[socket.id] = {
    x: 0,
    y: 0.5,
    z: 0,
    color: randomColor(),
  };

  // 1) Send existing players + this player to the new client
  socket.emit("currentPlayers", players);

  // 2) Let everyone else know a new player joined
  socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

  // 3) Receive movement updates from this player
  socket.on("move", (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].z = data.z;

    // Broadcast to others (but not back to the sender)
    socket.broadcast.emit("playerMoved", { id: socket.id, ...players[socket.id] });
  });

  socket.on("collisionImpulse", (data) => {
    const { targetId, nx, nz, speed } = data;

    // Forward an impulse to the target player.
    // Note: we flip the normal so it points away from the collider.
    io.to(targetId).emit("applyImpulse", {
      nx: -nx,
      nz: -nz,
      speed,
    });
  });


  // 4) Handle disconnect
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    delete players[socket.id];
    io.emit("playerDisconnected", socket.id);
  });
});

httpServer.listen(3000, () => {
  console.log("Server listening on http://localhost:3000");
});
