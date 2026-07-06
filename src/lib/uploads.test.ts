import path from "path";
import { describe, expect, it } from "vitest";
import { getUploadAbsolutePath } from "@/lib/uploads";

describe("getUploadAbsolutePath", () => {
  it("resolves relative stored paths against the project root", () => {
    expect(getUploadAbsolutePath(path.join("uploads", "email", "a.pdf"))).toBe(
      path.join(process.cwd(), "uploads", "email", "a.pdf"),
    );
  });

  it("re-anchors legacy absolute paths from another machine", () => {
    expect(
      getUploadAbsolutePath("/Users/someone/dev/project/uploads/email/a.pdf"),
    ).toBe(path.join(process.cwd(), "uploads", "email", "a.pdf"));
  });

  it("re-anchors legacy absolute paths from the current machine", () => {
    expect(
      getUploadAbsolutePath(path.join(process.cwd(), "uploads", "invoices", "b.pdf")),
    ).toBe(path.join(process.cwd(), "uploads", "invoices", "b.pdf"));
  });

  it("uses the last uploads segment when the project path also contains one", () => {
    expect(
      getUploadAbsolutePath("/srv/uploads/project/uploads/email/c.pdf"),
    ).toBe(path.join(process.cwd(), "uploads", "email", "c.pdf"));
  });

  it("leaves absolute paths outside an uploads directory untouched", () => {
    expect(getUploadAbsolutePath("/tmp/other/file.pdf")).toBe("/tmp/other/file.pdf");
  });
});
