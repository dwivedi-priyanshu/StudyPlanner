const express = require("express");
const mongoose = require("mongoose");
const {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
  subDays,
} = require("date-fns");
const Task = require("../models/Task");
const auth = require("../middleware/auth");
const {
  ensureRecurringTask,
  rolloverPendingTasks,
  toISODate,
} = require("../services/taskService");

const router = express.Router();
router.use(auth);

const priorityRank = {
  High: 0,
  Medium: 1,
  Low: 2,
};

router.get("/", async (req, res) => {
  const { date, filter = "All" } = req.query;
  if (!date) {
    return res.status(400).json({ message: "date query is required" });
  }

  const query = { currentDate: date, userId: req.user.id };
  if (filter === "Pending") query.status = "Pending";
  if (filter === "Completed") query.status = "Completed";
  if (filter === "High Priority") query.priority = "High";
  if (filter === "Rolled-over") query.rolledOver = true;

  const tasks = await Task.find(query).sort({ createdAt: -1 });
  const sorted = tasks.sort((a, b) => {
    const byPriority = (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99);
    if (byPriority !== 0) return byPriority;

    const aDue = a.dueTime || "99:99";
    const bDue = b.dueTime || "99:99";
    if (aDue < bDue) return -1;
    if (aDue > bDue) return 1;
    return b.createdAt - a.createdAt;
  });

  return res.json(sorted);
});

router.post("/", async (req, res) => {
  const payload = req.body;
  const task = await Task.create({
    ...payload,
    userId: req.user.id,
    originalDate: payload.originalDate || payload.currentDate,
  });
  return res.status(201).json(task);
});

router.patch("/:id", async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    req.body,
    { new: true }
  );
  if (!task) return res.status(404).json({ message: "Task not found" });
  if (req.body.status === "Completed") {
    await ensureRecurringTask(task);
  }
  return res.json(task);
});

router.delete("/:id", async (req, res) => {
  await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  return res.status(204).send();
});

router.post("/:id/move", async (req, res) => {
  const { direction } = req.body;
  const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
  if (!task) return res.status(404).json({ message: "Task not found" });

  const current = parseISO(task.currentDate);
  const nextDate =
    direction === "next" ? toISODate(addDays(current, 1)) : toISODate(addDays(current, -1));

  task.currentDate = nextDate;
  task.manuallyMoved = direction === "next";
  task.rolledOver = direction === "next" ? task.rolledOver : false;
  await task.save();
  return res.json(task);
});

router.post("/rollover/run", async (req, res) => {
  const today = req.body.today || toISODate(new Date());
  const yesterday = toISODate(addDays(parseISO(today), -1));
  const result = await rolloverPendingTasks(yesterday, today, req.user.id);
  return res.json(result);
});

router.get("/summary/stats", async (req, res) => {
  const { date } = req.query;
  const selected = parseISO(date || toISODate(new Date()));
  const start = toISODate(subDays(selected, 13));
  const end = toISODate(selected);

  const periodTasks = await Task.find({
    userId: req.user.id,
    currentDate: { $gte: start, $lte: end },
  });
  const selectedTasks = periodTasks.filter((task) => task.currentDate === end);

  const total = selectedTasks.length;
  const completed = selectedTasks.filter((task) => task.status === "Completed").length;
  const pending = total - completed;
  const rolledOver = selectedTasks.filter((task) => task.rolledOver).length;
  const highPriority = selectedTasks.filter((task) => task.priority === "High").length;

  const completionByDay = eachDayOfInterval({
    start: parseISO(start),
    end: parseISO(end),
  }).map((day) => {
    const dayIso = toISODate(day);
    const dayTasks = periodTasks.filter((task) => task.currentDate === dayIso);
    const done = dayTasks.filter((task) => task.status === "Completed").length;
    return {
      date: format(day, "dd MMM"),
      completed: done,
      total: dayTasks.length,
      percentage: dayTasks.length ? Math.round((done / dayTasks.length) * 100) : 0,
    };
  });

  const weekStart = startOfWeek(selected, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selected, { weekStartsOn: 1 });
  const weeklyTasks = await Task.find({
    userId: req.user.id,
    currentDate: { $gte: toISODate(weekStart), $lte: toISODate(weekEnd) },
  });

  let mostProductiveDay = "N/A";
  const dayMap = {};
  weeklyTasks.forEach((task) => {
    dayMap[task.currentDate] = dayMap[task.currentDate] || { done: 0 };
    if (task.status === "Completed") dayMap[task.currentDate].done += 1;
  });
  const entries = Object.entries(dayMap).sort((a, b) => b[1].done - a[1].done);
  if (entries.length) {
    mostProductiveDay = format(parseISO(entries[0][0]), "EEEE");
  }

  return res.json({
    total,
    completed,
    pending,
    rolledOver,
    highPriority,
    completionPercentage: total ? Math.round((completed / total) * 100) : 0,
    mostProductiveDay,
    completionByDay,
    highPriorityCompleted: selectedTasks.filter(
      (task) => task.priority === "High" && task.status === "Completed"
    ).length,
  });
});

router.get("/week/overview", async (req, res) => {
  const base = parseISO(req.query.date || toISODate(new Date()));
  const start = startOfWeek(base, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end: addDays(start, 6) });
  const startIso = toISODate(days[0]);
  const endIso = toISODate(days[6]);
  const tasks = await Task.find({
    userId: req.user.id,
    currentDate: { $gte: startIso, $lte: endIso },
  });

  const summary = days.map((day) => {
    const iso = toISODate(day);
    const dayTasks = tasks.filter((task) => task.currentDate === iso);
    const completed = dayTasks.filter((task) => task.status === "Completed").length;
    return {
      date: iso,
      day: format(day, "EEE"),
      total: dayTasks.length,
      completed,
    };
  });
  return res.json(summary);
});

router.get("/suggestions", async (req, res) => {
  const userObjectId = new mongoose.Types.ObjectId(req.user.id);
  const agg = await Task.aggregate([
    { $match: { userId: userObjectId } },
    { $group: { _id: "$title", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);
  return res.json(agg.map((x) => ({ title: x._id, count: x.count })));
});

module.exports = router;
