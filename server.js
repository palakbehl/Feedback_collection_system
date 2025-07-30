const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "http://localhost:3000", credentials: true },
});

app.use(cors());
app.use(express.json());

// 🌐 Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// 🔐 Auth routes
app.use("/api/auth", authRoutes);

// ✅ In-memory store for active users
const activeUsers = new Map(); // socket.id => username

// 🔌 Socket.IO real-time communication
io.on("connection", async (socket) => {
  console.log("🔗 User connected:", socket.id);

  // 📨 Load last 50 messages from DB
  try {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(50);
    socket.emit("load-messages", messages);
  } catch (err) {
    console.error("❌ Failed to load messages:", err.message);
  }

  // ✅ Handle user joining with name
  socket.on("join", (username) => {
    activeUsers.set(socket.id, username);
    console.log(`👤 ${username} joined`);
    io.emit("active-users", [...activeUsers.values()]);
  });

  // 💬 Handle new message
  socket.on("send-message", async (msgObj) => {
    try {
      const savedMessage = new Message({
        sender: msgObj.sender,
        text: msgObj.text,
        timestamp: new Date(),
      });

      await savedMessage.save();
      io.emit("receive-message", savedMessage);
    } catch (err) {
      console.error("❌ Error saving message:", err.message);
    }
  });

  // ✍️ Handle typing events
  socket.on("typing", (username) => {
    socket.broadcast.emit("typing", username);
  });

  socket.on("stop-typing", () => {
    socket.broadcast.emit("stop-typing");
  });

  // ❌ Handle disconnect
  socket.on("disconnect", () => {
    const username = activeUsers.get(socket.id);
    console.log("🔌 User disconnected:", socket.id, username);
    activeUsers.delete(socket.id);
    io.emit("active-users", [...activeUsers.values()]);
  });
});

// 🚀 Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
