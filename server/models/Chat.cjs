const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 20000,
    },
  },
  { timestamps: true }
);

const chatSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "New chat",
      maxlength: 100,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

chatSchema.index({ firebaseUid: 1, updatedAt: -1 });

module.exports = mongoose.models.Chat || mongoose.model("Chat", chatSchema);
