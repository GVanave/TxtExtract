import { describe, expect, it } from "vitest";

import { draftToReceipt, emptyItem, parseAmount, receiptToDraft } from "@/lib/draft";

import { LIDL_ITEMS, receipt } from "./fixtures";

describe("parseAmount", () => {
  it.each([
    ["1,99", 1.99],
    ["1.99", 1.99],
    ["-0,30", -0.3],
    ["1.234,56", 1234.56],
    ["2,49 €", 2.49],
    ["", null],
    ["abc", undefined],
    ["1,", undefined],
  ])("%s -> %s", (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });
});

describe("draft round trip", () => {
  it("returns the same receipt after editing nothing", () => {
    const original = receipt(LIDL_ITEMS, { store_address: "Hauptstraße 5" });
    const { receipt: rebuilt, problems } = draftToReceipt(receiptToDraft(original));
    expect(problems).toEqual([]);
    expect(rebuilt).toEqual(original);
  });

  it("shows amounts with a German decimal comma and two decimals", () => {
    const draft = receiptToDraft(receipt(LIDL_ITEMS));
    expect(draft.items[1].unit_price).toBe("2,99");
    expect(draft.items[1].quantity).toBe("0,482");
    expect(draft.items[3].total_price).toBe("-0,30");
    expect(draft.total).toBe("2,33");
  });

  it("ignores empty rows and reports invalid input", () => {
    const draft = receiptToDraft(receipt(LIDL_ITEMS));
    draft.items.push(emptyItem());
    expect(draftToReceipt(draft).problems).toEqual([]);

    draft.items[0].total_price = "1,x";
    draft.store_name = " ";
    draft.total = "";
    expect(draftToReceipt(draft).problems).toEqual([
      "The store name is empty.",
      "The receipt total is not a valid amount.",
      "Line 1 (BIO VOLLM. 3,8%): the total is not a valid amount.",
    ]);
  });

  it("uses the product name as printed text for new lines", () => {
    const draft = receiptToDraft(receipt([]));
    draft.items = [{ ...emptyItem(), name: "Äpfel", total_price: "2,50" }];
    draft.total = "2,50";
    const { receipt: rebuilt } = draftToReceipt(draft);
    expect(rebuilt?.line_items[0]).toMatchObject({ raw_text: "Äpfel", name: "Äpfel", total_price: 2.5, quantity: null });
  });
});
