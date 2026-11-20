import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  buildMessageEventData,
  getRealtimeClientCount,
  publishBusinessEvent,
  subscribeToBusinessEvents,
} from "../src/services/realtime.service.js";

const createStream = () => {
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.headers = {};
  res.chunks = [];
  res.writableEnded = false;
  res.destroyed = false;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.set = (headers) => {
    Object.assign(res.headers, headers);
    return res;
  };
  res.flushHeaders = () => {};
  res.write = (chunk) => {
    res.chunks.push(chunk);
    return true;
  };
  return { req, res };
};

describe("Realtime message events", () => {
  it("serializes only the message fields needed by realtime clients", () => {
    const data = buildMessageEventData({
      _id: "message-1",
      businessId: "must-not-leak",
      customerId: "customer-1",
      direction: "out",
      contentType: "text",
      content: "Hello",
      status: "delivered",
      type: "manual",
      sentAt: new Date("2026-11-20T00:00:00.000Z"),
      createdAt: new Date("2026-11-20T00:00:00.000Z"),
    });

    assert.equal(data.customerId, "customer-1");
    assert.equal(data.message.status, "delivered");
    assert.equal(data.message.sentAt, "2026-11-20T00:00:00.000Z");
    assert.equal(data.message.businessId, undefined);
  });

  it("streams business events only to that business and cleans up", () => {
    const first = createStream();
    const second = createStream();

    subscribeToBusinessEvents({
      businessId: "business-a",
      req: first.req,
      res: first.res,
    });
    subscribeToBusinessEvents({
      businessId: "business-b",
      req: second.req,
      res: second.res,
    });

    assert.equal(first.res.statusCode, 200);
    assert.equal(first.res.headers["Content-Type"], "text/event-stream");
    assert.equal(getRealtimeClientCount("business-a"), 1);

    const delivered = publishBusinessEvent("business-a", "message.updated", {
      customerId: "customer-1",
    });

    assert.equal(delivered, 1);
    assert.match(first.res.chunks.at(-1), /event: message\.updated/);
    assert.match(first.res.chunks.at(-1), /customer-1/);
    assert.doesNotMatch(second.res.chunks.join(""), /customer-1/);

    first.req.emit("close");
    second.req.emit("close");
    assert.equal(getRealtimeClientCount("business-a"), 0);
    assert.equal(getRealtimeClientCount("business-b"), 0);
  });
});
