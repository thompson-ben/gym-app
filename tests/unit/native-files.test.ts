import { describe, expect, it } from "vitest";
import { filenameFromDisposition, isShareCancel } from "@/lib/native-files";

describe("native file sharing", () => {
  it("takes the download's file name from its header", () => {
    expect(filenameFromDisposition('attachment; filename="setmodo-2026-10-30.csv"', "x.csv")).toBe("setmodo-2026-10-30.csv");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''my%20export.json", "x.json")).toBe("my export.json");
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"', "x")).toBe("..-..-etc-passwd");
    expect(filenameFromDisposition(null, "setmodo-export.csv")).toBe("setmodo-export.csv");
  });

  it("treats closing the share sheet as a cancel, not an error", () => {
    expect(isShareCancel(new Error("Share canceled"))).toBe(true);
    expect(isShareCancel(new Error("Write failed"))).toBe(false);
  });
});
