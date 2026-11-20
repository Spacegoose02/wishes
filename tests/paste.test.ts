import { describe, expect, it } from "vitest";
import { formForPaste, isTextEntry, pastedImage } from "@/lib/paste";

const png = new File(["x"], "image.png", { type: "image/png" });
const pdf = new File(["x"], "doc.pdf", { type: "application/pdf" });

describe("pasting a picture into the wish form", () => {
  it("finds a pasted picture in files or items", () => {
    expect(pastedImage({ files: [png] })).toBe(png);
    expect(pastedImage({ files: [], items: [{ kind: "string", type: "text/plain", getAsFile: () => null }, { kind: "file", type: "image/png", getAsFile: () => png }] })).toBe(png);
  });

  it("ignores text and files that aren't pictures", () => {
    expect(pastedImage({ files: [pdf], items: [{ kind: "string", type: "text/plain", getAsFile: () => null }] })).toBeNull();
    expect(pastedImage(null)).toBeNull();
  });

  it("knows which boxes take typed text", () => {
    expect(isTextEntry({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTextEntry({ tagName: "input" })).toBe(true);
    expect(isTextEntry({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextEntry({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTextEntry({ tagName: "INPUT", type: "file" })).toBe(false);
    expect(isTextEntry({ tagName: "BODY" })).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });

  it("picks the form you're in, else the first open one", () => {
    const forms = [{ form: "a", contains: false, visible: false }, { form: "b", contains: false, visible: true }, { form: "c", contains: true, visible: true }];
    expect(formForPaste(forms, true)).toBe("c");
    expect(formForPaste(forms.slice(0, 2), false)).toBe("b");
    // Pasting into some other box on the page (like a chat) is left alone.
    expect(formForPaste(forms.slice(0, 2), true)).toBeNull();
    expect(formForPaste([{ form: "a", contains: false, visible: false }], false)).toBeNull();
  });
});
