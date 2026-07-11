import mongoose from "mongoose";

const timeValidator = {
  validator: function (v) {
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
  },
  message: "Time must be in 24-hour format (HH:MM)",
};

const breakSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "Break",
    },
    startTime: {
      type: String,
      required: true,
      validate: timeValidator,
    },
    endTime: {
      type: String,
      required: true,
      validate: timeValidator,
    },
    recurrence: {
      type: String,
      enum: ["daily", "weekly", "friday_only", "ramadan"],
      default: "daily",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const workingHoursSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: {
        values: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        message: "{VALUE} is not a valid day",
      },
      required: true,
    },
    isOpen: {
      type: Boolean,
      default: true,
    },
    openTime: {
      type: String,
      default: "09:00",
      validate: timeValidator,
    },
    closeTime: {
      type: String,
      default: "18:00",
      validate: timeValidator,
    },
    breaks: [breakSchema],
    ramadanHours: {
      isDifferent: {
        type: Boolean,
        default: false,
      },
      openTime: {
        type: String,
        validate: timeValidator,
      },
      closeTime: {
        type: String,
        validate: timeValidator,
      },
    },
    notes: String,
  },
  { _id: false },
);

// Helper method to check if open at specific time
workingHoursSchema.methods.isOpenAt = function (date = new Date()) {
  if (!this.isOpen) return false;

  const timeStr = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

  // Check Ramadan hours
  const isRamadan = this._isRamadan(date); // Function to check Islamic calendar
  if (isRamadan && this.ramadanHours?.isDifferent) {
    return (
      timeStr >= this.ramadanHours.openTime &&
      timeStr <= this.ramadanHours.closeTime
    );
  }

  // Check regular hours
  const effectiveClose = this.closeTime === "00:00" ? "23:59" : this.closeTime;
  if (timeStr < this.openTime || timeStr > effectiveClose) {
    return false;
  }

  // Check breaks
  if (this.breaks && this.breaks.length > 0) {
    for (const breakPeriod of this.breaks) {
      if (!breakPeriod.isActive) continue;

      // Check if break applies today
      const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
        date.getDay()
      ];
      if (breakPeriod.recurrence === "friday_only" && dayName !== "fri")
        continue;

      if (timeStr >= breakPeriod.startTime && timeStr <= breakPeriod.endTime) {
        return false;
      }
    }
  }

  return true;
};

workingHoursSchema.methods._isRamadan = function (date) {
  // Integration with Islamic calendar API
  // For now, simple check (TODO: Implement proper check)
  return false;
};

export default workingHoursSchema;
