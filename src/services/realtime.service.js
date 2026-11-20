const clientsByBusiness = new Map();

const serializeEvent = (event, data) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const toIsoString = (value) =>
  value instanceof Date ? value.toISOString() : value;

export const buildMessageEventData = (message, extra = {}) => {
  const source = message?.toObject ? message.toObject() : message;
  const customerId = String(source?.customerId?._id || source?.customerId || "");

  return {
    customerId,
    messageId: String(source?._id || ""),
    message: {
      _id: String(source?._id || ""),
      direction: source?.direction,
      contentType: source?.contentType,
      content: source?.content,
      status: source?.status,
      type: source?.type,
      waCustomerPhone: source?.waCustomerPhone,
      customerId,
      staffId: source?.staffId,
      sentAt: toIsoString(source?.sentAt),
      createdAt: toIsoString(source?.createdAt),
    },
    ...extra,
  };
};

export const subscribeToBusinessEvents = ({ businessId, req, res }) => {
  const key = String(businessId);
  const clients = clientsByBusiness.get(key) || new Set();

  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const client = { res };
  clients.add(client);
  clientsByBusiness.set(key, clients);
  res.write(
    serializeEvent("connected", {
      connectedAt: new Date().toISOString(),
    }),
  );

  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(": heartbeat\n\n");
    }
  }, 25_000);
  heartbeat.unref?.();

  const cleanup = () => {
    clearInterval(heartbeat);
    clients.delete(client);
    if (clients.size === 0) clientsByBusiness.delete(key);
  };

  req.once("close", cleanup);
  res.once("close", cleanup);
};

export const publishBusinessEvent = (businessId, event, data = {}) => {
  const clients = clientsByBusiness.get(String(businessId));
  if (!clients?.size) return 0;

  const payload = serializeEvent(event, {
    ...data,
    occurredAt: new Date().toISOString(),
  });
  let delivered = 0;

  for (const client of clients) {
    if (client.res.writableEnded || client.res.destroyed) continue;
    client.res.write(payload);
    delivered += 1;
  }

  return delivered;
};

export const getRealtimeClientCount = (businessId) =>
  clientsByBusiness.get(String(businessId))?.size || 0;
