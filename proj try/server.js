import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const app = express();
const server = createServer(app);
const io = new Server(server);

const allUsers = {}; // { username: { username, id } }

// Resolve __dirname for ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));

// ✅ Serve static files (CSS, JS, images, socket.io client)
app.use(express.static(join(__dirname, "public")));

// ✅ Serve main HTML
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "app", "index.html"));
});

// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  let connectedUsername = null;

  // User joins
  socket.on("join-user", (username) => {
    connectedUsername = username;
    allUsers[username] = { username, id: socket.id };
    io.emit("joined", allUsers);
    console.log("👤 Joined:", username);
  });

  // Offer
  socket.on("offer", ({ from, to, offer }) => {
    if (allUsers[to]) {
      io.to(allUsers[to].id).emit("offer", { from, to, offer });
    }
  });

  // Answer
  socket.on("answer", ({ from, to, answer }) => {
    if (allUsers[from]) {
      io.to(allUsers[from].id).emit("answer", { from, to, answer });
    }
  });

  // ICE candidate
  socket.on("icecandidate", (candidate, participants) => {
    if (!participants || participants.length !== 2) return;

    const receiver = participants.find(u => u !== connectedUsername);
    if (receiver && allUsers[receiver]) {
      io.to(allUsers[receiver].id).emit("icecandidate", candidate);
    }
  });

  // Call ended
  socket.on("call-ended", (participants) => {
    if (!participants) return;
    participants.forEach(user => {
      if (allUsers[user]) {
        io.to(allUsers[user].id).emit("call-ended", participants);
      }
    });
  });

  // Shared Pomodoro timer sync
  socket.on("timer-action", ({ type, studyDuration, breakDuration, currentPhase, timeLeft, to }) => {
    if (allUsers[to]) {
      io.to(allUsers[to].id).emit("timer-action-remote", {
        type,
        studyDuration,
        breakDuration,
        currentPhase,
        timeLeft
      });
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    if (connectedUsername) {
      delete allUsers[connectedUsername];
      io.emit("joined", allUsers);
    }
  });
});

// ================= START SERVER =================
server.listen(9000, () => {
  console.log("🚀 Server running at http://localhost:9000");
});
