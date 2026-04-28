const {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  format,
  parseISO,
} = require("date-fns");
const Task = require("../models/Task");
const User = require("../models/User");
const { sendTaskSummaryEmail } = require("./mailer");

const toISODate = (date) => format(date, "yyyy-MM-dd");

const nextDateByRecurrence = (fromDate, recurrence) => {
  if (recurrence === "Daily") return addDays(fromDate, 1);
  if (recurrence === "Weekly") return addWeeks(fromDate, 1);
  if (recurrence === "Monthly") return addMonths(fromDate, 1);
  return null;
};

const ensureRecurringTask = async (task) => {
  if (task.recurrence === "None") return;
  const current = parseISO(task.currentDate);
  const next = nextDateByRecurrence(current, task.recurrence);
  if (!next) return;

  const nextDate = toISODate(next);
  const existing = await Task.findOne({
    userId: task.userId,
    title: task.title,
    currentDate: nextDate,
    recurrence: task.recurrence,
    originalDate: task.originalDate,
  });
  if (existing) return;

  await Task.create({
    userId: task.userId,
    title: task.title,
    description: task.description,
    note: task.note,
    priority: task.priority,
    category: task.category,
    dueTime: task.dueTime,
    originalDate: task.originalDate,
    currentDate: nextDate,
    recurrence: task.recurrence,
  });
};

const rolloverPendingTasks = async (sourceDate, targetDate, userId = null) => {
  const query = {
    currentDate: sourceDate,
    status: "Pending",
  };
  if (userId) query.userId = userId;
  const pending = await Task.find(query);

  if (!pending.length) return { moved: 0 };

  await Promise.all(
    pending.map((task) => {
      const pendingDays = differenceInCalendarDays(
        parseISO(targetDate),
        parseISO(task.originalDate)
      );
      return Task.findByIdAndUpdate(task._id, {
        currentDate: targetDate,
        rolledOver: true,
        pendingDays: Math.max(pendingDays, 1),
      });
    })
  );

  return { moved: pending.length };
};

const sendDailyTaskSummaryEmails = async (date) => {
  const users = await User.find({}).select("_id name email");
  if (!users.length) return { sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    const tasks = await Task.find({ userId: user._id, currentDate: date }).sort({
      dueTime: 1,
      createdAt: 1,
    });
    const completed = tasks.filter((task) => task.status === "Completed");
    const pending = tasks.filter((task) => task.status === "Pending");
    const ok = await sendTaskSummaryEmail({
      to: user.email,
      name: user.name,
      date,
      completed,
      pending,
    });
    if (ok) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped };
};

module.exports = {
  ensureRecurringTask,
  rolloverPendingTasks,
  sendDailyTaskSummaryEmails,
  toISODate,
};
