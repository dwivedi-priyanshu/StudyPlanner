import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  endOfWeek,
  format,
  isToday,
  parseISO,
  startOfWeek,
  subMinutes,
} from "date-fns";
import {
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaFire,
  FaMoon,
  FaSun,
} from "react-icons/fa";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "./api";

const categories = ["Study", "Coding", "Internship", "Placement", "Personal", "Health", "Other"];
const filters = ["All", "Pending", "Completed", "High Priority", "Rolled-over"];

const emptyForm = {
  title: "",
  description: "",
  dueTime: "",
  priority: "Medium",
  category: "Other",
  recurrence: "None",
};

const priorityBorderClass = {
  High: "border-l-4 border-l-rose-500",
  Medium: "border-l-4 border-l-amber-500",
  Low: "border-l-4 border-l-emerald-500",
};

const dueSoon = (task) => {
  if (!task.dueTime || task.status === "Completed") return false;
  const now = new Date();
  const due = parseISO(`${task.currentDate}T${task.dueTime}:00`);
  return now >= subMinutes(due, 30) && now <= due;
};

export default function App() {
  const todayIso = format(new Date(), "yyyy-MM-dd");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [theme, setTheme] = useState(localStorage.getItem("sdp_theme") || "light");
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [tasks, setTasks] = useState([]);
  const [week, setWeek] = useState([]);
  const [filter, setFilter] = useState("All");
  const [form, setForm] = useState(emptyForm);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("planner");
  const [suggestions, setSuggestions] = useState([]);
  const [streak, setStreak] = useState(0);
  const [showWeekPicker, setShowWeekPicker] = useState(false);

  const loadTasks = async () => {
    const { data } = await api.get("/tasks", { params: { date: selectedDate, filter } });
    setTasks(data);
  };
  const loadWeek = async () => {
    const { data } = await api.get("/tasks/week/overview", { params: { date: selectedDate } });
    setWeek(data);
  };
  const loadSummary = async () => {
    const { data } = await api.get("/tasks/summary/stats", { params: { date: selectedDate } });
    setSummary(data);
  };
  const loadSuggestions = async () => {
    const { data } = await api.get("/tasks/suggestions");
    setSuggestions(data);
  };

  const checkSession = async () => {
    if (!localStorage.getItem("sdp_token")) return;
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (_error) {
      localStorage.removeItem("sdp_token");
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("sdp_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!user) return;
    api.post("/tasks/rollover/run", { today: todayIso }).catch(() => null);
  }, [user, todayIso]);

  useEffect(() => {
    if (!user) return;
    Promise.all([loadTasks(), loadWeek(), loadSummary(), loadSuggestions()]).catch(() => null);
  }, [user, selectedDate, filter]);

  useEffect(() => {
    if (!user) return;
    if (Notification.permission === "default") Notification.requestPermission();
    tasks.forEach((task) => {
      if (dueSoon(task) && Notification.permission === "granted") {
        new Notification("Task due soon", { body: `${task.title} is near due time.` });
      }
    });
  }, [user, tasks]);

  useEffect(() => {
    if (!summary?.completionByDay?.length) return;
    let count = 0;
    for (let i = summary.completionByDay.length - 1; i >= 0; i -= 1) {
      const day = summary.completionByDay[i];
      if (day.total > 0 && day.completed === day.total) count += 1;
      else break;
    }
    setStreak(count);
  }, [summary]);

  const progress = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((x) => x.status === "Completed").length;
    return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
  }, [tasks]);

  const currentWeek = useMemo(() => {
    const start = startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 });
    const end = endOfWeek(parseISO(selectedDate), { weekStartsOn: 1 });
    const map = new Map(week.map((x) => [x.date, x]));
    const items = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const iso = format(d, "yyyy-MM-dd");
      items.push(map.get(iso) || { date: iso, day: format(d, "EEE"), total: 0, completed: 0 });
    }
    return items;
  }, [selectedDate, week]);

  const selectedDayData = useMemo(
    () =>
      currentWeek.find((day) => day.date === selectedDate) || {
        date: selectedDate,
        day: format(parseISO(selectedDate), "EEE"),
        total: 0,
        completed: 0,
      },
    [currentWeek, selectedDate]
  );

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthError("");
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : authForm;
      const { data } = await api.post(endpoint, payload);
      localStorage.setItem("sdp_token", data.token);
      setUser(data.user);
    } catch (error) {
      setAuthError(error.response?.data?.message || "Authentication failed.");
    }
  };

  const addTask = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    await api.post("/tasks", { ...form, currentDate: selectedDate, originalDate: selectedDate });
    setForm(emptyForm);
    await Promise.all([loadTasks(), loadWeek(), loadSummary()]);
  };

  const updateTask = async (id, payload) => {
    await api.patch(`/tasks/${id}`, payload);
    await Promise.all([loadTasks(), loadWeek(), loadSummary()]);
  };

  const moveTask = async (id, direction) => {
    await api.post(`/tasks/${id}/move`, { direction });
    await Promise.all([loadTasks(), loadWeek(), loadSummary()]);
  };

  const editNote = async (task) => {
    const current = task.note || "";
    const updated = window.prompt("Private note", current);
    if (updated === null) return;
    await updateTask(task._id, { note: updated });
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-100 to-indigo-100 p-6 dark:from-slate-950 dark:to-slate-900">
        <form
          onSubmit={submitAuth}
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <h1 className="text-2xl font-bold">{authMode === "login" ? "Welcome back" : "Create account"}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to manage your personal planner.</p>
          {authMode === "register" && (
            <input
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              placeholder="Name"
              value={authForm.name}
              onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
            />
          )}
          <input
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder="Email"
            type="email"
            value={authForm.email}
            onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
          />
          <input
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder="Password"
            type="password"
            value={authForm.password}
            onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
          />
          {authError && <p className="mt-2 text-sm text-red-600">{authError}</p>}
          <button className="mt-4 w-full rounded-lg bg-indigo-600 py-2 font-semibold text-white">
            {authMode === "login" ? "Login" : "Register"}
          </button>
          <div className="mt-4 border-t border-slate-200 pt-3 text-center dark:border-slate-700">
            <button
              type="button"
              onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {authMode === "login" ? "Need an account? Register" : "Already have an account? Login"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const rolledOverTasks = tasks.filter((task) => task.rolledOver);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 md:px-10 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-linear-to-r from-indigo-600 to-violet-600 p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">Smart Daily Planner</h1>
              <p className="mt-1 text-indigo-100">{format(parseISO(selectedDate), "EEEE, dd MMMM yyyy")}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="rounded-full bg-white/20 p-2"
                title="Toggle theme"
              >
                {theme === "dark" ? <FaSun /> : <FaMoon />}
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("sdp_token");
                  setUser(null);
                }}
                className="rounded-full bg-white/20 px-3 py-1 text-sm"
              >
                Logout
              </button>
            </div>
          </div>
          {streak > 0 && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1 text-sm">
              <FaFire /> {streak} Day Streak! You completed all tasks for consecutive days.
            </p>
          )}
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="md:hidden">
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-xl border border-indigo-600 bg-indigo-50 p-3 text-left dark:bg-indigo-900/30">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                  {selectedDayData.day}
                </p>
                <p className="text-sm font-bold">{format(parseISO(selectedDayData.date), "dd MMM")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedDayData.completed}/{selectedDayData.total} done
                </p>
              </div>
              <button
                onClick={() => setShowWeekPicker((prev) => !prev)}
                className="rounded-xl border border-slate-200 p-3 text-slate-700 dark:border-slate-700 dark:text-slate-200"
                title="Select day from this week"
              >
                <FaCalendarAlt />
              </button>
            </div>
            {showWeekPicker && (
              <div className="mt-3 grid gap-2">
                {currentWeek.map((day) => (
                  <button
                    key={day.date}
                    onClick={() => {
                      setSelectedDate(day.date);
                      setShowWeekPicker(false);
                    }}
                    className={`rounded-xl border p-2 text-left ${selectedDate === day.date ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30" : "border-slate-200 dark:border-slate-700"}`}
                  >
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{day.day}</p>
                    <p className="text-sm font-bold">{format(parseISO(day.date), "dd MMM")}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {day.completed}/{day.total} done
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="hidden gap-3 md:grid md:grid-cols-7">
            {currentWeek.map((day) => (
              <button
                key={day.date}
                onClick={() => setSelectedDate(day.date)}
                className={`rounded-xl border p-3 text-left ${selectedDate === day.date ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30" : "border-slate-200 dark:border-slate-700"}`}
              >
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{day.day}</p>
                <p className="text-sm font-bold">{format(parseISO(day.date), "dd MMM")}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{day.completed}/{day.total} done</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          {["planner", "summary"].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === item ? "bg-indigo-600 text-white" : "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
            >
              {item === "planner" ? "Planner" : "Summary"}
            </button>
          ))}
        </div>

        {tab === "planner" ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {filters.map((item) => (
                      <button
                        key={item}
                        onClick={() => setFilter(item)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === item ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>

                <div className="mb-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Daily Progress</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full bg-emerald-500" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <p className="mt-1 text-sm font-semibold">
                    {progress.completed}/{progress.total} tasks completed ({progress.percent}%)
                  </p>
                </div>

                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task._id} className={`rounded-xl border border-slate-200 p-4 dark:border-slate-700 ${priorityBorderClass[task.priority] || "border-l-4 border-l-slate-300"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`font-semibold ${task.status === "Completed" ? "line-through text-slate-400" : ""}`}>
                            {task.title}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <span className="rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">{task.category}</span>
                            <span className={`rounded px-2 py-1 ${task.priority === "High" ? "bg-rose-100 text-rose-700" : "bg-slate-100 dark:bg-slate-800"}`}>
                              {task.priority}
                            </span>
                            {task.rolledOver && <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">Rolled-over</span>}
                            {task.dueTime && (
                              <span className={`rounded px-2 py-1 ${dueSoon(task) ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                                Due {task.dueTime}
                              </span>
                            )}
                            {task.pendingDays > 0 && <span className="rounded bg-orange-100 px-2 py-1 text-orange-700">Pending for {task.pendingDays} days</span>}
                          </div>
                          {!!task.note && (
                            <p className="mt-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              📝 {task.note}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => editNote(task)}
                            className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold dark:bg-slate-800"
                            title="Private note"
                          >
                            📝
                          </button>
                          <button
                            onClick={() => updateTask(task._id, { status: task.status === "Completed" ? "Pending" : "Completed" })}
                            className={`rounded-lg px-3 py-1 text-xs font-bold ${task.status === "Completed" ? "bg-slate-200 dark:bg-slate-700" : "bg-emerald-500 text-white"}`}
                          >
                            {task.status === "Completed" ? "Undo" : "Done"}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => moveTask(task._id, "previous")} className="rounded bg-slate-100 p-2 dark:bg-slate-800">
                          <FaChevronLeft />
                        </button>
                        <button onClick={() => moveTask(task._id, "next")} className="rounded bg-slate-100 p-2 dark:bg-slate-800">
                          <FaChevronRight />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!tasks.length && <p className="text-sm text-slate-500 dark:text-slate-400">{isToday(parseISO(selectedDate)) ? "No tasks for today." : "No tasks for selected date."}</p>}
                </div>
              </div>
              {!!rolledOverTasks.length && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Overdue / Rolled-over Tasks ({rolledOverTasks.length})</p>
                  <ul className="mt-2 text-sm text-amber-700 dark:text-amber-200">
                    {rolledOverTasks.map((task) => (
                      <li key={task._id}>- {task.title} (from {task.originalDate})</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="space-y-6">
              <form onSubmit={addTask} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-lg font-bold">Add Task</h2>
                <div className="space-y-3">
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <input type="time" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={form.dueTime} onChange={(e) => setForm({ ...form, dueTime: e.target.value })} />
                  <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option>High</option><option>Medium</option><option>Low</option>
                  </select>
                  <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {categories.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                    <option>None</option><option>Daily</option><option>Weekly</option><option>Monthly</option>
                  </select>
                  <button className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white">Create Task</button>
                </div>
              </form>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="text-sm font-bold">Smart Suggestions</p>
                <div className="mt-2 space-y-2 text-sm">
                  {suggestions.map((s) => (
                    <button key={s.title} onClick={() => setForm({ ...form, title: s.title })} className="block w-full rounded-lg bg-slate-50 px-3 py-2 text-left dark:bg-slate-800">
                      You usually add <b>{s.title}</b>. Add it today?
                    </button>
                  ))}
                  {!suggestions.length && <p className="text-slate-500 dark:text-slate-400">Suggestions appear after repeated tasks.</p>}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-4 text-lg font-bold">14-Day Completion Rate</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary?.completionByDay || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="percentage" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="mb-4 text-lg font-bold">Summary Stats</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Total tasks" value={summary?.total ?? 0} />
                <Stat label="Completed" value={summary?.completed ?? 0} />
                <Stat label="Pending" value={summary?.pending ?? 0} />
                <Stat label="Rolled-over" value={summary?.rolledOver ?? 0} />
                <Stat label="High priority" value={summary?.highPriority ?? 0} />
                <Stat label="Completion %" value={`${summary?.completionPercentage ?? 0}%`} />
                <Stat label="Current streak" value={streak} />
                <Stat label="Most productive day" value={summary?.mostProductiveDay ?? "N/A"} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
