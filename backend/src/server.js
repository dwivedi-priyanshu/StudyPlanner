require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { addDays } = require("date-fns");
const connectDB = require("./config/db");
const taskRoutes = require("./routes/taskRoutes");
const authRoutes = require("./routes/authRoutes");
const {
  rolloverPendingTasks,
  sendDailyTaskSummaryEmails,
  toISODate,
} = require("./services/taskService");

const app = express();
const PORT = process.env.PORT || 5000;
app.locals.dbReady = false;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: app.locals.dbReady ? "ok" : "degraded", dbReady: app.locals.dbReady });
});

const requireDatabase = (_req, res, next) => {
  if (!app.locals.dbReady) {
    return res.status(503).json({
      message: "Database is unavailable. Check MONGODB_URI/DNS connectivity and try again.",
    });
  }

  return next();
};

app.use("/api/auth", requireDatabase, authRoutes);
app.use("/api/tasks", requireDatabase, taskRoutes);

cron.schedule("0 0 * * *", async () => {
  const today = toISODate(new Date());
  const yesterday = toISODate(addDays(new Date(), -1));
  await rolloverPendingTasks(yesterday, today);
});

cron.schedule("0 23 * * *", async () => {
  const today = toISODate(new Date());
  try {
    const result = await sendDailyTaskSummaryEmails(today);
    // eslint-disable-next-line no-console
    console.log(`11PM summary emails sent: ${result.sent}, skipped: ${result.skipped}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to send 11PM summary emails", error);
  }
});

connectDB()
  .then(() => {
    app.locals.dbReady = true;
    // eslint-disable-next-line no-console
    console.log("Running with database connectivity");
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to connect database, starting in degraded mode", error);
  });

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${PORT}`);
});
