const nodemailer = require("nodemailer");

const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

const formatTask = (task) => {
  const due = task.dueTime ? ` at ${task.dueTime}` : "";
  return `- ${task.title}${due}`;
};

const sendTaskSummaryEmail = async ({ to, name, date, completed, pending }) => {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!transporter || !from) return false;

  const completedList = completed.length
    ? completed.map(formatTask).join("\n")
    : "- No completed tasks";
  const pendingList = pending.length
    ? pending.map(formatTask).join("\n")
    : "- No pending tasks";

  const text = [
    `Hi ${name},`,
    "",
    `Here is your task summary for ${date}.`,
    "",
    `Completed (${completed.length}):`,
    completedList,
    "",
    `Pending (${pending.length}):`,
    pendingList,
    "",
    "Keep going!",
  ].join("\n");

  await transporter.sendMail({
    from,
    to,
    subject: `Task reminder for ${date}`,
    text,
  });

  return true;
};

module.exports = { sendTaskSummaryEmail };
