import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const app = express();
const server = createServer(app);
const io = new Server(server);
const allUsers = {}; // Stores { username: { username: "...", id: "socketId" } }

// Allow serving files from "public" folder
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static("public"));

// Serve index.html from "app" folder
app.get("/", (req, res) => {
    console.log(`GET / at ${new Date().toLocaleTimeString()}`);
    res.sendFile(join(__dirname, "app", "index.html"));
});

// ✅ Socket Handling
io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Map socket ID to username for easy lookup during disconnect
    let connectedUsername = null;

    // New user joined
    socket.on("join-user", (username) => {
        console.log(`${username} joined with socket ID ${socket.id}`);
        allUsers[username] = { username, id: socket.id };
        connectedUsername = username; // Store the username associated with this socket
        io.emit("joined", allUsers); // Broadcast updated user list to all
    });

    // Offer sent
    socket.on("offer", ({ from, to, offer }) => {
        console.log("Offer:", { from, to });
        if (allUsers[to]) {
            // Target the specific socket ID of the 'to' user
            io.to(allUsers[to].id).emit("offer", { from, to, offer });
        } else {
            console.warn(`Attempted to send offer to non-existent user: ${to}`);
            // Optionally, emit an error back to 'from' user
            io.to(allUsers[from].id).emit('call-failed', { to: to, message: `User ${to} is not available.` });
        }
    });

    // Handle 'call-busy' signal from client
    socket.on('call-busy', ({ from, to }) => {
        if (allUsers[to]) {
            io.to(allUsers[to].id).emit('call-busy', { from, to }); // Forward to the original offerer
        }
    });


    // Answer received
    socket.on("answer", ({ from, to, answer }) => {
        console.log("Answer:", { from, to });
        if (allUsers[from]) {
            // Target the specific socket ID of the 'from' user (the offerer)
            io.to(allUsers[from].id).emit("answer", { from, to, answer });
        } else {
            console.warn(`Attempted to send answer to non-existent user: ${from}`);
        }
    });

    // ICE Candidate (Modified to target the other person in the call)
    // Client must send `caller` array with the candidate
    socket.on("icecandidate", (candidate, currentCallParticipants) => {
        // console.log(`ICE candidate received from ${connectedUsername}`); // Too verbose for console
        // `currentCallParticipants` should be an array like [caller1_username, caller2_username]
        if (currentCallParticipants && currentCallParticipants.length === 2) {
            const senderUsername = connectedUsername; // This socket's username
            const receiverUsername = currentCallParticipants.find(user => user !== senderUsername);

            if (receiverUsername && allUsers[receiverUsername]) {
                const receiverSocketId = allUsers[receiverUsername].id;
                // console.log(`Sending ICE candidate from ${senderUsername} to ${receiverUsername}`); // Too verbose
                io.to(receiverSocketId).emit("icecandidate", candidate);
            } else {
                console.warn(`Could not find receiver for ICE candidate: ${receiverUsername}`);
            }
        } else {
            console.warn("ICE candidate received without valid currentCallParticipants array.");
        }
    });

    // Call ended (Modified to correctly send to both parties)
    socket.on("call-ended", caller => {
        console.log(`Call ended signal from ${connectedUsername}. Caller info:`, caller);
        if (caller && caller.length === 2) {
            const [user1, user2] = caller;
            // Notify both participants that the call has ended
            if (allUsers[user1]) {
                io.to(allUsers[user1].id).emit("call-ended", caller);
            }
            if (allUsers[user2]) {
                io.to(allUsers[user2].id).emit("call-ended", caller);
            }
        }
    });

    // --- ✅ FIXED POMODORO SHARED TIMER EVENTS ---
    socket.on("timer-action", ({ type, studyDuration, breakDuration, currentPhase, timeLeft, from, to }) => {
        console.log(`Timer action '${type}' received from ${from} for ${to}. Phase: ${currentPhase}, Time Left: ${timeLeft}`);
        // Find the socket ID of the 'to' user (the other participant in the call)
        const targetSocketId = allUsers[to] ? allUsers[to].id : null;

        if (targetSocketId && targetSocketId !== socket.id) { // Ensure target exists and is not the sender
            // Emit a remote action event to the target user with all relevant data
            io.to(targetSocketId).emit('timer-action-remote', { type, studyDuration, breakDuration, currentPhase, timeLeft });
            console.log(`Broadcasting timer action '${type}' to ${to}`);
        } else {
            console.warn(`Could not broadcast timer action. Target user ${to} not found or is sender.`);
        }
    });


    // Handle disconnection
    socket.on("disconnect", () => {
        console.log(`Socket disconnected: ${socket.id}`);
        if (connectedUsername) {
            delete allUsers[connectedUsername]; // Remove the user from the active list
            console.log(`User ${connectedUsername} removed. Active users:`, allUsers);
            io.emit("joined", allUsers); // Broadcast updated user list to all remaining users

            // Notify the other person in an active call that this user disconnected
            // This relies on the client's 'caller' state. A more robust server-side
            // solution would track active calls more explicitly.
            for (const user in allUsers) {
                if (allUsers[user].id === socket.id) {
                    continue; // Skip self
                }
                // Check if this disconnected user was 'from' or 'to' in any active call
                // (This part would be more complex without explicit server-side call state)
                // For a 1:1 call, relying on client-side 'call-ended' is generally okay.
            }
        }
    });
});

// ✅ Start server
server.listen(9000, () => {
    console.log("🚀 Server listening on http://localhost:9000");
});