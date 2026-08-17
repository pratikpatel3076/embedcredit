const WebhookLog = require("../models/WebhookLog");
const DLA = require("../models/DLA");

function hashId(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase();
}

async function dispatchWebhook({ dlaId, eventType, resourceId, payload }) {
  try {
    const dla = await DLA.findOne({ id: dlaId || "DLA-001" });
    const targetUrl = dla?.webhookUrl || "http://localhost:5099/api/mock-dla-webhook";

    const eventId = `EVT-${hashId(eventType + resourceId)}-${Date.now().toString(36).toUpperCase()}`;
    const logId = `WH-${Date.now().toString(36).toUpperCase()}`;

    const bodyObj = {
      eventId,
      eventType,
      timestamp: new Date().toISOString(),
      resourceId,
      payload,
    };

    const log = await WebhookLog.create({
      id: logId,
      dlaId: dlaId || "DLA-001",
      eventId,
      eventType,
      resourceId,
      payload: bodyObj,
      status: "PENDING",
      attempts: 1,
      lastAttemptAt: new Date(),
    });

    // Fire non-blocking HTTP request
    fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vantage-Webhook-Signature": dla?.webhookSecret || "secret" },
      body: JSON.stringify(bodyObj),
    })
      .then(async (res) => {
        log.status = res.ok ? "SUCCESS" : "FAILED";
        log.responseCode = res.status;
        await log.save();
      })
      .catch(async (err) => {
        log.status = "FAILED";
        log.responseBody = err.message;
        await log.save();
      });

    return log;
  } catch (err) {
    console.error("[webhook] failed to initiate webhook log:", err.message);
    return null;
  }
}

module.exports = { dispatchWebhook };
