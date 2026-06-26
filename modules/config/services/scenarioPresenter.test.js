const { mapScenarioOutput, mapScenarioFromMaybeDataValues, mapScenarioForExport } = require("./scenarioPresenter");

describe("scenarioPresenter", () => {
  describe("mapScenarioOutput", () => {
    test("gộp Banner1+Banner2 thành Banners, xóa keys Banner1/Banner2 gốc", () => {
      const result = mapScenarioOutput({ Id: 1, Name: "S", Banner1: "a.png", Banner2: "b.png" });
      expect(result.Banners).toEqual(["a.png", "b.png"]);
      expect(result).not.toHaveProperty("Banner1");
      expect(result).not.toHaveProperty("Banner2");
    });

    test("Banners chỉ có 1 phần tử khi Banner2 null", () => {
      const result = mapScenarioOutput({ Id: 2, Banner1: "a.png", Banner2: null });
      expect(result.Banners).toEqual(["a.png"]);
    });

    test("Banners rỗng khi cả hai đều null/undefined", () => {
      const result = mapScenarioOutput({ Id: 3, Banner1: null, Banner2: undefined });
      expect(result.Banners).toEqual([]);
    });

    test("giữ nguyên các field khác", () => {
      const result = mapScenarioOutput({ Id: 5, Name: "test", Content: "[]", Banner1: null, Banner2: null });
      expect(result.Id).toBe(5);
      expect(result.Name).toBe("test");
      expect(result.Content).toBe("[]");
    });
  });

  describe("mapScenarioFromMaybeDataValues", () => {
    test("dùng dataValues khi có", () => {
      const raw = { dataValues: { Id: 1, Banner1: "x", Banner2: null } };
      const result = mapScenarioFromMaybeDataValues(raw);
      expect(result.Id).toBe(1);
      expect(result.Banners).toEqual(["x"]);
    });

    test("dùng trực tiếp khi không có dataValues", () => {
      const raw = { Id: 2, Banner1: null, Banner2: null };
      expect(mapScenarioFromMaybeDataValues(raw).Id).toBe(2);
    });

    test("dùng trực tiếp khi raw không có dataValues và không phải object lồng nhau", () => {
      const raw = { Id: 10, Banner1: "img.png", Banner2: null };
      expect(mapScenarioFromMaybeDataValues(raw).Banners).toEqual(["img.png"]);
    });
  });

  describe("mapScenarioForExport", () => {
    test("parse Content JSON và merge vào output", () => {
      const cmds = [{ cmd: "AT" }];
      const result = mapScenarioForExport({ Id: 1, Content: JSON.stringify(cmds), Banner1: null, Banner2: null });
      expect(result.Content).toEqual(cmds);
    });

    test("fallback Content=[] khi JSON.parse fail", () => {
      const result = mapScenarioForExport({ Id: 2, Content: "{invalid json", Banner1: null, Banner2: null });
      expect(result.Content).toEqual([]);
    });
  });
});
