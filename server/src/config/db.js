import mongoose from "mongoose";

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB_NAME;

  if (!uri || !databaseName) {
    throw new Error("MongoDB configuration is missing.");
  }

  await mongoose.connect(uri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000,
  });

  console.log("MongoDB connected.");
};

export { connectDB };
