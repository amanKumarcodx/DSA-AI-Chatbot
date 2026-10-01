const mongoose = require("mongoose");

async function connectDatabase() {
  const { MONGODB_URI } = process.env;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Add it to your local .env file.");
  }

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");
}

module.exports = { connectDatabase };
