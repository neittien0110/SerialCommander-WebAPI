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

  describe("mapScenarioOutput — cột Banners JSON (issue #10)", () => {
    const sixLines = [
      "Sangaboard w/ Electreim 28BYJ-48 5V / ULN2003A shield",
      "https://youtu.be/kvwJRnc8nQo",
      "Assemble microscope with breadboard + arduino nano",
      "https://youtu.be/Ec65Ky3U3Lo",
      "Low cost version 6",
      "https://youtu.be/aQEyoch3iuo",
    ];

    test("giữ ĐỦ >2 dòng từ cột Banners (không bị cắt còn 2 như Banner1/Banner2)", () => {
      const result = mapScenarioOutput({
        Id: 1,
        Banner1: sixLines[0],
        Banner2: sixLines[1],
        Banners: JSON.stringify(sixLines),
      });
      expect(result.Banners).toEqual(sixLines);
      expect(result.Banners).toHaveLength(6);
    });

    test("ưu tiên cột Banners hơn Banner1/Banner2 khi cả hai cùng có", () => {
      const result = mapScenarioOutput({
        Id: 2,
        Banner1: "cũ-1",
        Banner2: "cũ-2",
        Banners: JSON.stringify(["mới-1", "mới-2", "mới-3"]),
      });
      expect(result.Banners).toEqual(["mới-1", "mới-2", "mới-3"]);
    });

    test("fallback Banner1/Banner2 khi cột Banners null (kịch bản cũ)", () => {
      const result = mapScenarioOutput({ Id: 3, Banner1: "a", Banner2: "b", Banners: null });
      expect(result.Banners).toEqual(["a", "b"]);
    });

    test("fallback khi cột Banners là JSON hỏng", () => {
      const result = mapScenarioOutput({ Id: 4, Banner1: "a", Banner2: null, Banners: "{hỏng" });
      expect(result.Banners).toEqual(["a"]);
    });

    test("không rò chuỗi Banners thô ra output", () => {
      const result = mapScenarioOutput({ Id: 5, Banners: JSON.stringify(["x"]) });
      expect(result.Banners).toEqual(["x"]);
      expect(typeof result.Banners).toBe("object");
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
