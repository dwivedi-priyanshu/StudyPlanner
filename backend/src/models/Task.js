const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    note: { type: String, default: "" },
    priority: {
      type: String,
      enum: ["High", "Medium", "Low"],
      default: "Medium",
    },
    category: {
      type: String,
      enum: [
        "Study",
        "Coding",
        "Internship",
        "Placement",
        "Personal",
        "Health",
        "Other",
      ],
      default: "Other",
    },
    status: { type: String, enum: ["Pending", "Completed"], default: "Pending" },
    dueTime: { type: String, default: "" },
    originalDate: { type: String, required: true },
    currentDate: { type: String, required: true, index: true },
    rolledOver: { type: Boolean, default: false },
    manuallyMoved: { type: Boolean, default: false },
    pendingDays: { type: Number, default: 0 },
    recurrence: {
      type: String,
      enum: ["None", "Daily", "Weekly", "Monthly"],
      default: "None",
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TaskSchema.index({ userId: 1, currentDate: 1, status: 1, priority: 1 });

module.exports = mongoose.model("Task", TaskSchema);
