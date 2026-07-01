import mongoose from "mongoose";

const schedulerLockSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    owner: {
      type: String,
      required: true,
    },
    lockedUntil: {
      type: Date,
      required: true,
      index: true,
    },
    lastRunAt: Date,
    lastFinishedAt: Date,
    lastResult: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

const SchedulerLock = mongoose.model("SchedulerLock", schedulerLockSchema);
export default SchedulerLock;
