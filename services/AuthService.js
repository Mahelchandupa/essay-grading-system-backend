const { catchAsync } = require("../utils/errors/catchAsync");
const {
  DuplicateRecordsError,
  FailureOccurredError,
  RecordNotFoundError,
  PasswordMismatchError,
} = require("../utils/errors/CustomErrors");
const { generateToken } = require("../utils/tokens/getToken");
const { handleResponse } = require("../utils/response/response");
const User = require("../models/User");
const Progress = require("../models/Progress");

exports.signUpAsUser = catchAsync(async (req, res, next) => {
  const {
    firstName,
    lastName,
    username,
    email,
    password,
    university,
    studentIndex,
    skillLevel,
  } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    return next(new DuplicateRecordsError("Email or Username"));
  }

  // Create user with proper validation
  const user = new User({
    firstName,
    lastName,
    username,
    email,
    password, // Will be hashed by pre-save middleware
    university,
    studentIndex,
    profile: {
      skillLevel: skillLevel || "beginner",
      writingGoals: [],
      preferredTopics: [],
      learningStyle: "analytical",
    },
  });

  const newUser = await user.save();

  if (!newUser) {
    return next(new FailureOccurredError("User Registration"));
  }

  // Create progress tracking
  const progress = new Progress({
    userId: newUser._id,
    skillTracking: {
      grammar: { score: 0, trend: "stable" },
      vocabulary: { score: 0, trend: "stable" },
      structure: { score: 0, trend: "stable" },
      argumentation: { score: 0, trend: "stable" },
      citations: { score: 0, trend: "stable" },
    },
  });

  await progress.save();

  // Generate token with user ID
  const accessToken = generateToken(newUser._id);

  const userData = {
    id: newUser._id,
    firstName: newUser.firstName,
    lastName: newUser.lastName,
    username: newUser.username,
    email: newUser.email,
    university: newUser.university,
    studentIndex: newUser.studentIndex,
    skillLevel: newUser.profile.skillLevel,
  };

  return handleResponse(res, 201, "User Registered Successfully", {
    token: accessToken,
    userData,
  });
});

exports.signInAsUser = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await User.findOne({
    $or: [{ email }, { username: email }], // Allow login with email or username
  });

  if (!user) {
    return next(new RecordNotFoundError("User not found"));
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return next(new PasswordMismatchError("Invalid password"));
  }

  // Update last active
  user.lastActive = new Date();
  await user.save();

  const accessToken = generateToken(user._id);

  return handleResponse(res, 200, "User signed in successfully", {
    token: accessToken,
    userData: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      university: user.university,
      studentIndex: user.studentIndex,
      skillLevel: user.profile.skillLevel,
      statistics: user.statistics,
    },
  });
});