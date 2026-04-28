const mongoose = require("mongoose");
const dns = require("node:dns");

const applyDnsServers = (servers) => {
  if (!servers?.length) return false;
  try {
    dns.setServers(servers);
    // eslint-disable-next-line no-console
    console.log(`Using custom DNS servers for MongoDB SRV lookup: ${servers.join(", ")}`);
    return true;
  } catch (_error) {
    return false;
  }
};

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured in environment variables.");
  }

  const envDnsServers = process.env.MONGODB_DNS_SERVERS
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (mongoUri.startsWith("mongodb+srv://") && envDnsServers?.length) {
    applyDnsServers(envDnsServers);
  }

  const connectWithOptions = () =>
    mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      family: 4,
    });

  try {
    await connectWithOptions();
    // eslint-disable-next-line no-console
    console.log("MongoDB connected successfully");
  } catch (error) {
    const isSrvLookupIssue =
      mongoUri.startsWith("mongodb+srv://") &&
      (error?.code === "ECONNREFUSED" || error?.code === "ENOTFOUND");

    if (!isSrvLookupIssue || envDnsServers?.length) {
      throw error;
    }

    // Retry once with public DNS resolvers when local DNS blocks SRV queries.
    const fallbackApplied = applyDnsServers(["8.8.8.8", "1.1.1.1"]);
    if (!fallbackApplied) throw error;

    await connectWithOptions();
    // eslint-disable-next-line no-console
    console.log("MongoDB connected successfully (after DNS fallback)");
  }
};

module.exports = connectDB;
