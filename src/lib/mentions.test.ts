import { describe, expect, it } from "vitest";
import {
  extractMentionedUserIds,
  mentionToken,
  splitMentionSegments,
  stripMentionTokens,
} from "@/lib/mentions";

describe("mentionToken", () => {
  it("round-trips through the parser", () => {
    const content = `Ping ${mentionToken("Jay Baker", "user_1")} about this`;
    expect(extractMentionedUserIds(content)).toEqual(["user_1"]);
  });
});

describe("splitMentionSegments", () => {
  it("splits text and mentions in order", () => {
    expect(
      splitMentionSegments("Hey @[Jay Baker](user_1), see @[Sam](user_2)."),
    ).toEqual([
      { type: "text", text: "Hey " },
      { type: "mention", name: "Jay Baker", userId: "user_1" },
      { type: "text", text: ", see " },
      { type: "mention", name: "Sam", userId: "user_2" },
      { type: "text", text: "." },
    ]);
  });

  it("returns plain content as a single text segment", () => {
    expect(splitMentionSegments("No tags here")).toEqual([
      { type: "text", text: "No tags here" },
    ]);
  });

  it("leaves bare @names and emails untouched", () => {
    expect(splitMentionSegments("email jay@example.com or @jay")).toEqual([
      { type: "text", text: "email jay@example.com or @jay" },
    ]);
  });
});

describe("extractMentionedUserIds", () => {
  it("dedupes repeated mentions of the same user", () => {
    const content = "@[Jay](user_1) and again @[Jay](user_1) plus @[Sam](user_2)";
    expect(extractMentionedUserIds(content)).toEqual(["user_1", "user_2"]);
  });

  it("returns nothing for plain text", () => {
    expect(extractMentionedUserIds("just a note")).toEqual([]);
  });
});

describe("stripMentionTokens", () => {
  it("replaces tokens with plain @Name text", () => {
    expect(stripMentionTokens("Ask @[Jay Baker](user_1) to review")).toBe(
      "Ask @Jay Baker to review",
    );
  });
});
