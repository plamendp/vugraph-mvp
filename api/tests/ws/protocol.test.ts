import { describe, it, expect } from "vitest";
import { parseInboundMessage } from "../../src/ws/protocol.js";

describe("parseInboundMessage", () => {
  it("rejects invalid JSON", () => {
    expect(() => parseInboundMessage("not json")).toThrow("Invalid JSON");
  });

  it("rejects missing type", () => {
    expect(() => parseInboundMessage('{"foo":"bar"}')).toThrow("Invalid or missing message type");
  });

  it("rejects unknown type", () => {
    expect(() => parseInboundMessage('{"type":"unknown"}')).toThrow("Invalid or missing message type");
  });

  it("parses auth message", () => {
    const msg = parseInboundMessage(
      JSON.stringify({ type: "auth", token: "abc", role: "operator", matchId: "m1" }),
    );
    expect(msg.type).toBe("auth");
    if (msg.type === "auth") {
      expect(msg.token).toBe("abc");
      expect(msg.role).toBe("operator");
      expect(msg.matchId).toBe("m1");
    }
  });

  it("rejects auth with missing token", () => {
    expect(() =>
      parseInboundMessage(JSON.stringify({ type: "auth", role: "operator", matchId: "m1" })),
    ).toThrow("Missing token");
  });

  it("rejects auth with invalid role", () => {
    expect(() =>
      parseInboundMessage(
        JSON.stringify({ type: "auth", token: "abc", role: "admin", matchId: "m1" }),
      ),
    ).toThrow("Invalid role");
  });

  it("parses call message", () => {
    const msg = parseInboundMessage(
      JSON.stringify({ type: "call", seat: "N", call: "1S" }),
    );
    expect(msg.type).toBe("call");
  });

  it("rejects call with invalid seat", () => {
    expect(() =>
      parseInboundMessage(JSON.stringify({ type: "call", seat: "X", call: "1S" })),
    ).toThrow("Invalid seat");
  });

  it("parses play message", () => {
    const msg = parseInboundMessage(
      JSON.stringify({ type: "play", seat: "E", card: "HA" }),
    );
    expect(msg.type).toBe("play");
  });

  it("parses undo message", () => {
    const msg = parseInboundMessage(JSON.stringify({ type: "undo" }));
    expect(msg.type).toBe("undo");
  });

  it("parses set_result message", () => {
    const msg = parseInboundMessage(
      JSON.stringify({ type: "set_result", declarer: "N", contract: "4S", tricks: 10 }),
    );
    expect(msg.type).toBe("set_result");
  });

  it("parses load_board message", () => {
    const msg = parseInboundMessage(
      JSON.stringify({
        type: "load_board",
        matchId: "m1",
        boardNumber: 1,
        dealer: "N",
        vulnerability: "None",
        hands: { N: [], E: [], S: [], W: [] },
      }),
    );
    expect(msg.type).toBe("load_board");
  });
});
