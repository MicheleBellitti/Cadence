import { describe, it, expect } from "vitest";
import { isBusinessDay, addBusinessDays, businessDaysBetween, formatDate, parseDate } from "./date-utils";

describe("isBusinessDay", () => {
  it("returns true for Monday through Friday", () => {
    expect(isBusinessDay(new Date("2026-03-30"))).toBe(true); // Monday
    expect(isBusinessDay(new Date("2026-04-01"))).toBe(true); // Wednesday
    expect(isBusinessDay(new Date("2026-04-03"))).toBe(true); // Friday
  });

  it("returns false for Saturday and Sunday", () => {
    expect(isBusinessDay(new Date("2026-03-28"))).toBe(false); // Saturday
    expect(isBusinessDay(new Date("2026-03-29"))).toBe(false); // Sunday
  });
});

describe("addBusinessDays", () => {
  it("adds days within the same week", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 3);
    expect(result.toISOString().slice(0, 10)).toBe("2026-04-01"); // Wednesday
  });

  it("skips weekends", () => {
    const friday = new Date("2026-04-03");
    const result = addBusinessDays(friday, 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-04-03"); // Friday (1-day task stays on Friday)
  });

  it("handles multi-week spans", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 7);
    expect(result.toISOString().slice(0, 10)).toBe("2026-04-07"); // Tuesday next week
  });

  it("returns same day for 1 day (item occupies that day)", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-30");
  });

  it("returns same day for 0 days", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 0);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-30");
  });

  it("2-day task from Monday ends on Tuesday", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 2);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-31"); // Tuesday
  });

  it("5-day task from Monday ends on Friday", () => {
    const monday = new Date("2026-03-30");
    const result = addBusinessDays(monday, 5);
    expect(result.toISOString().slice(0, 10)).toBe("2026-04-03"); // Friday
  });

  it("advances weekend start to Monday", () => {
    const saturday = new Date("2026-03-28");
    const result = addBusinessDays(saturday, 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-30"); // Monday
  });
});

describe("businessDaysBetween", () => {
  it("counts days within a week", () => {
    const monday = new Date("2026-03-30");
    const friday = new Date("2026-04-03");
    expect(businessDaysBetween(monday, friday)).toBe(4);
  });

  it("excludes weekends", () => {
    const friday = new Date("2026-04-03");
    const nextMonday = new Date("2026-04-06");
    expect(businessDaysBetween(friday, nextMonday)).toBe(1);
  });

  it("returns 0 for same day", () => {
    const day = new Date("2026-03-30");
    expect(businessDaysBetween(day, day)).toBe(0);
  });

  it("counts full 2-week span", () => {
    const mon1 = new Date("2026-03-30");
    const fri2 = new Date("2026-04-10");
    expect(businessDaysBetween(mon1, fri2)).toBe(9);
  });
});

describe("formatDate / parseDate", () => {
  it("formats date to ISO date string", () => {
    const date = new Date("2026-03-30T12:00:00Z");
    expect(formatDate(date)).toBe("2026-03-30");
  });

  it("parseDate returns start of day", () => {
    const date = parseDate("2026-03-30");
    expect(date.getHours()).toBe(0);
  });

  it("roundtrips correctly", () => {
    const str = "2026-04-15";
    expect(formatDate(parseDate(str))).toBe(str);
  });
});
