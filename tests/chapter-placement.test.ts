/**
 * SOURCE OF TRUTH KEYWORDS: chooseChapter, historicalYear, chapter placement, Black Refugees subject, Viola Desmond
 * WHAT: Locks the hall assignment against the catalog rows that were landing in the wrong chapter.
 * WHY: A shared exhibit subject and a web-page date were filling rooms with records from other centuries.
 * WHERE: tests/chapter-placement.test.ts, covering src/lib/archive/chapters.ts.
 */
import { describe, expect, it } from "vitest";

import {
  chooseChapter,
  historicalYear,
  type ChapterRecordText,
} from "@/src/lib/archive/chapters";

function record(partial: Partial<ChapterRecordText> & Pick<ChapterRecordText, "title">): ChapterRecordText {
  return {
    title: partial.title,
    description: partial.description ?? null,
    source: partial.source ?? "Nova Scotia Archives",
    publisher: partial.publisher ?? "Nova Scotia Archives",
    date: partial.date ?? null,
    dateText: partial.dateText ?? null,
    temporal: partial.temporal ?? null,
  };
}

describe("chooseChapter", () => {
  it("keeps a 1750 view of Halifax out of the Refugees room when only the exhibit subject says so", () => {
    const placement = chooseChapter(
      record({
        title: "A view of Halifax from the topmasthead",
        description:
          "This is the first known view of Halifax, sketched from the topmast of a ship in the harbour in 1749.",
        dateText: "published 25 January 1750",
      }),
    );

    expect(placement).toBeNull();
  });

  it("places a 1750 letter about enslaved people in the founding-of-Halifax room", () => {
    const placement = chooseChapter(
      record({
        title: "Letter from Governor Cornwallis about Captain Bloss and his slaves",
        dateText: "22 September 1750",
      }),
    );

    expect(placement?.key).toBe("slavery_and_halifax");
  });

  it("leaves the 1946 Viola Desmond papers out of the six chapter rooms", () => {
    const placement = chooseChapter(
      record({
        title: "Notice of Motion, affidavits of Viola Desmond",
        date: "1946-11-01",
      }),
    );

    expect(placement).toBeNull();
  });

  it("sends every Black Loyalist Heritage Centre page to the Loyalist room", () => {
    const placement = chooseChapter(
      record({
        title: "Boston King",
        publisher: "Black Loyalist Heritage Centre",
        source: "Canada's Digital Collections: Black Loyalists: Our Story, Our People",
      }),
    );

    expect(placement?.key).toBe("black_loyalists");
  });

  it("does not treat a 1752 sale to the West Indies as Caribbean migration", () => {
    const placement = chooseChapter(
      record({
        title: "Sale of a woman (age 35) and a man (age 30)",
        description: "The buyers arranged passage to the West Indies.",
        dateText: "30 May 1752",
      }),
    );

    expect(placement?.key).not.toBe("caribbean_migrants");
  });

  it("places an 1820 Trinidad sailing list with the Refugees, not the Caribbean migrants", () => {
    const placement = chooseChapter(
      record({
        title: "A list of Black Refugees at Beech Hill who wished to go to Trinidad",
        dateText: "1820",
      }),
    );

    expect(placement?.key).toBe("the_refugees");
  });

  it("reads 1916 from a battalion article and ignores the encyclopedia publication date", () => {
    const placement = chooseChapter(
      record({
        title: "No. 2 Construction Battalion",
        description: "The battalion was authorized on 5 July 1916 at Pictou.",
        publisher: "The Canadian Encyclopedia",
        source: "The Canadian Encyclopedia",
        date: "2016-02-10",
      }),
    );

    expect(placement?.key).toBe("construction_battalion");
    expect(historicalYear(record({
      title: "No. 2 Construction Battalion",
      description: "The battalion was authorized on 5 July 1916 at Pictou.",
      publisher: "The Canadian Encyclopedia",
      source: "The Canadian Encyclopedia",
      date: "2016-02-10",
    }))?.year).toBe(1916);
  });

  it("does not put a Montreal slavery case from 1734 in the Halifax chapter", () => {
    const placement = chooseChapter(
      record({
        title: "Marie-Josèphe Angélique : Montreal on Fire",
        description: "In 1734 Angélique was an enslaved woman in Montreal.",
        publisher: "The Canadian Encyclopedia",
        source: "The Canadian Encyclopedia",
        date: "2020-01-01",
      }),
    );

    expect(placement).toBeNull();
  });

  it("leaves a modern slavery poster with no Nova Scotia year out of the Halifax room", () => {
    const placement = chooseChapter(
      record({
        title: "Slavery, Memory and Citizenship in Iran",
        publisher: "A Black People's History of Canada",
        source: "A Black People's History of Canada",
        date: "2024-02-07",
      }),
    );

    expect(placement).toBeNull();
  });

  it("does not treat a passing mention of the Caribbean as the migration chapter", () => {
    const placement = chooseChapter(
      record({
        title: "Black Canadians",
        description: "Communities formed across Canada and the Caribbean after 1900.",
        publisher: "The Canadian Encyclopedia",
        source: "The Canadian Encyclopedia",
        date: "2013-02-19",
      }),
    );

    expect(placement?.key).not.toBe("caribbean_migrants");
  });

  it("does not place another First World War biography in the battalion room", () => {
    const placement = chooseChapter(
      record({
        title: "Charles Lightfoot Roman",
        description: "Roman served in the First World War and later practiced medicine.",
        publisher: "The Canadian Encyclopedia",
        source: "The Canadian Encyclopedia",
        date: "2015-09-21",
      }),
    );

    expect(placement).toBeNull();
  });
});
