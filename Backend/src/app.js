const express = require("express");
const cookieParser = require("cookie-parser");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
const authRouter = require("./routes/auth.routes");
app.use("/api/auth", authRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Internal server error", error: err.message });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

module.exports = app;