import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    deviceInfo: {
      userAgent: {
        type: String,
        default: "unknown",
      },
      platform: {
        type: String,
        default: "unknown",
      },
      ip: {
        type: String,
        default: "unknown",
      },
      lastUsed: {
        type: Date,
        default: Date.now,
      },
    },
    usageCount: {
      type: Number,
      default: 0,
    },
  },
  { _id: false, timestamps: true },
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
      index: true,
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match: [
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ],
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    passwordChangedAt: {
      type: Date,
      select: false,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    role: {
      type: String,
      enum: ["owner", "staff", "admin"],
      default: "owner",
    },
    profilePicture: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null,
      index: true,
    },
    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
      select: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      select: false,
    },
    verificationTokenExpiry: {
      type: Date,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpiry: {
      type: Date,
      select: false,
    },
    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    passwordHistory: {
      type: [String],
      default: [],
      select: false,
    },
    consentToDataProcessing: {
      type: Boolean,
      default: false,
    },
    dataRetentionDate: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.refreshTokens;
        delete ret.verificationToken;
        delete ret.verificationTokenExpiry;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpiry;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.passwordHistory;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.refreshTokens;
        delete ret.verificationToken;
        delete ret.verificationTokenExpiry;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpiry;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.passwordHistory;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Indexes for performance
userSchema.index({ "refreshTokens.expiresAt": 1 });
userSchema.index({ "refreshTokens.tokenHash": 1 });
userSchema.index({ email: 1, isActive: 1 });

// Virtual for full profile
userSchema.virtual("profile").get(function () {
  return {
    id: this._id,
    name: this.name,
    username: this.username,
    email: this.email,
    profilePicture: this.profilePicture,
    role: this.role,
    isActive: this.isActive,
    isEmailVerified: this.isEmailVerified,
  };
});

// Virtual for account lock status
userSchema.virtual("isLocked").get(function () {
  return Boolean(this.lockUntil && this.lockUntil > Date.now());
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  try {
    if (!this.isModified("password")) return next();

    // Check password history (prevent reuse of last 3 passwords)
    if (this.passwordHistory && this.passwordHistory.length > 0) {
      for (const oldHash of this.passwordHistory.slice(-3)) {
        const isReused = await bcrypt.compare(this.password, oldHash);
        if (isReused) {
          throw new Error("Cannot reuse your last 3 passwords");
        }
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(this.password, salt);

    // Add to password history before updating
    if (!this.passwordHistory) this.passwordHistory = [];
    this.passwordHistory.push(hashedPassword);

    // Keep only last 5 passwords in history
    if (this.passwordHistory.length > 5) {
      this.passwordHistory = this.passwordHistory.slice(-5);
    }

    this.password = hashedPassword;

    // Set password changed timestamp (skip for new users)
    if (!this.isNew) {
      this.passwordChangedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Generate access token (short-lived)
userSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      role: this.role,
      tokenVersion: this.tokenVersion || 1,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" },
  );
};

// Generate refresh token (long-lived, hashed in DB)
userSchema.methods.generateRefreshToken = function (deviceInfo = {}) {
  const expiryDays = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;

  // Create token with unique identifier
  const tokenId = crypto.randomBytes(16).toString("hex");
  const token = jwt.sign(
    {
      _id: this._id,
      type: "refresh",
      tokenId: tokenId,
      tokenVersion: this.tokenVersion || 1,
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: `${expiryDays}d` },
  );

  // CRITICAL: Hash the token before storing
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  // Clean expired tokens
  this.refreshTokens = this.refreshTokens.filter(
    (t) => t.expiresAt > new Date(),
  );

  // Max 5 active sessions (security measure)
  const MAX_SESSIONS = 5;
  if (this.refreshTokens.length >= MAX_SESSIONS) {
    // Remove oldest session
    this.refreshTokens.sort((a, b) => a.createdAt - b.createdAt);
    this.refreshTokens.shift();
  }

  // Store the HASH, not the token
  this.refreshTokens.push({
    tokenHash,
    expiresAt,
    deviceInfo: {
      userAgent: deviceInfo.userAgent || "unknown",
      platform: deviceInfo.platform || "unknown",
      ip: deviceInfo.ip || "unknown",
      lastUsed: new Date(),
    },
    usageCount: 0,
  });

  this.markModified("refreshTokens");

  // Return the RAW token to client (only time token is exposed)
  return token;
};

// Verify refresh token
userSchema.methods.verifyRefreshToken = function (incomingToken) {
  if (!incomingToken) return false;

  // Hash the incoming token
  const incomingHash = crypto
    .createHash("sha256")
    .update(incomingToken)
    .digest("hex");

  // Find matching token that hasn't expired
  const tokenRecord = this.refreshTokens.find(
    (t) => t.tokenHash === incomingHash && t.expiresAt > new Date(),
  );

  if (tokenRecord) {
    // Update usage metrics
    tokenRecord.usageCount += 1;
    tokenRecord.deviceInfo.lastUsed = new Date();
    this.markModified("refreshTokens");
    return true;
  }

  return false;
};

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if password changed after JWT issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Login attempt management
userSchema.methods.incrementLoginAttempts = async function () {
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

  // Reset if lock expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1, lockUntil: null },
    });
  }

  const newAttempts = (this.loginAttempts || 0) + 1;
  const update = { $set: { loginAttempts: newAttempts } };

  if (newAttempts >= MAX_ATTEMPTS) {
    update.$set.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
  }

  return this.updateOne(update);
};

// Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $set: {
      loginAttempts: 0,
      lockUntil: null,
      lastLoginAt: new Date(),
    },
  });
};

// Remove specific refresh token
userSchema.methods.removeRefreshToken = async function (incomingToken) {
  const incomingHash = crypto
    .createHash("sha256")
    .update(incomingToken)
    .digest("hex");

  this.refreshTokens = this.refreshTokens.filter(
    (t) => t.tokenHash !== incomingHash,
  );

  this.markModified("refreshTokens");
  return this.save();
};

// Clear all refresh tokens (logout from all devices)
userSchema.methods.clearAllRefreshTokens = function () {
  this.refreshTokens = [];
  this.markModified("refreshTokens");
  return this.save();
};

// Increment token version to invalidate all tokens
userSchema.methods.incrementTokenVersion = function () {
  this.tokenVersion = (this.tokenVersion || 1) + 1;
  return this.save();
};

// Get active sessions for user dashboard
userSchema.methods.getActiveSessions = function () {
  return this.refreshTokens
    .filter((t) => t.expiresAt > new Date())
    .map((t) => ({
      deviceInfo: t.deviceInfo,
      lastUsed: t.deviceInfo.lastUsed,
      expiresAt: t.expiresAt,
      usageCount: t.usageCount,
    }));
};

const User = mongoose.model("User", userSchema);
export default User;
