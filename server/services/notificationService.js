const Notification = require("../models/Notification");

function hashId(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase();
}

async function sendNotification({ userId, type, title, message, channel = "IN_APP", metadata = {} }) {
  if (!userId) return null;

  try {
    const notifId = `NOTIF-${Date.now().toString(36).toUpperCase()}-${hashId(type)}`;
    const notif = await Notification.create({
      id: notifId,
      userId,
      type,
      title,
      message,
      channel,
      metadata,
    });

    if (channel === "SMS") {
      console.log(`[SMS-Provider Mock] Sending SMS to User ${userId}: ${title} - ${message}`);
    } else if (channel === "EMAIL") {
      console.log(`[Email-Provider Mock] Sending Email to User ${userId}: ${title} - ${message}`);
    }

    return notif;
  } catch (err) {
    console.error("[notification] failed to record notification:", err.message);
    return null;
  }
}

async function getUserNotifications(userId) {
  return Notification.find({ userId }).sort({ createdAt: -1 }).limit(50);
}

module.exports = { sendNotification, getUserNotifications };
