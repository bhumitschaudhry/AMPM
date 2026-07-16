import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

describe("checkContentSafety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns safe result when all categories are UNLIKELY", async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        responses: [
          {
            safeSearchAnnotation: {
              adult: "UNLIKELY",
              spoof: "UNLIKELY",
              medical: "UNLIKELY",
              violence: "UNLIKELY",
              racy: "UNLIKELY",
            },
          },
        ],
      },
    });

    const { checkContentSafety } = await import("../pipeline/check-content-safety");
    const result = await checkContentSafety(Buffer.from("test"));
    expect(result.isSafe).toBe(true);
    expect(result.flaggedCategory).toBeNull();
  });

  it("flags content when adult is VERY_LIKELY", async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        responses: [
          {
            safeSearchAnnotation: {
              adult: "VERY_LIKELY",
              spoof: "UNLIKELY",
              medical: "UNLIKELY",
              violence: "UNLIKELY",
              racy: "UNLIKELY",
            },
          },
        ],
      },
    });

    const { checkContentSafety } = await import("../pipeline/check-content-safety");
    const result = await checkContentSafety(Buffer.from("test"));
    expect(result.isSafe).toBe(false);
    expect(result.flaggedCategory).toBe("adult");
  });

  it("flags first risky category found (only first flagged)", async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        responses: [
          {
            safeSearchAnnotation: {
              adult: "LIKELY",
              spoof: "VERY_LIKELY",
              medical: "UNLIKELY",
              violence: "UNLIKELY",
              racy: "UNLIKELY",
            },
          },
        ],
      },
    });

    const { checkContentSafety } = await import("../pipeline/check-content-safety");
    const result = await checkContentSafety(Buffer.from("test"));
    expect(result.isSafe).toBe(false);
    expect(result.flaggedCategory).toBe("adult"); // first category wins
  });

  it("handles missing annotation gracefully", async () => {
    (axios.post as any).mockResolvedValue({
      data: { responses: [{}] },
    });

    const { checkContentSafety } = await import("../pipeline/check-content-safety");
    const result = await checkContentSafety(Buffer.from("test"));
    expect(result.isSafe).toBe(true);
  });

  it("throws on network error", async () => {
    (axios.post as any).mockRejectedValue(new Error("ECONNABORTED"));

    const { checkContentSafety } = await import("../pipeline/check-content-safety");
    await expect(checkContentSafety(Buffer.from("test"))).rejects.toThrow();
  });

  it("throws when responses[0] contains an error object", async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        responses: [
          {
            error: {
              code: 3,
              message: "Bad image data.",
            },
          },
        ],
      },
    });

    const { checkContentSafety } = await import("../pipeline/check-content-safety");
    await expect(checkContentSafety(Buffer.from("test"))).rejects.toThrow(
      "Google Cloud Vision SafeSearch error: Bad image data. (code 3)"
    );
  });
});

describe("detectLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns labels from annotation response", async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        responses: [
          {
            labelAnnotations: [
              { description: "cat", score: 0.98 },
              { description: "mammal", score: 0.85 },
            ],
          },
        ],
      },
    });

    const { detectLabels } = await import("../pipeline/detect-labels");
    const labels = await detectLabels(Buffer.from("test"));
    expect(labels).toHaveLength(2);
    expect(labels[0]).toEqual({ name: "cat", score: 0.98 });
    expect(labels[1]).toEqual({ name: "mammal", score: 0.85 });
  });

  it("returns empty array when no annotations", async () => {
    (axios.post as any).mockResolvedValue({
      data: { responses: [{}] },
    });

    const { detectLabels } = await import("../pipeline/detect-labels");
    const labels = await detectLabels(Buffer.from("test"));
    expect(labels).toEqual([]);
  });

  it("throws on network error", async () => {
    (axios.post as any).mockRejectedValue(new Error("ETIMEDOUT"));

    const { detectLabels } = await import("../pipeline/detect-labels");
    await expect(detectLabels(Buffer.from("test"))).rejects.toThrow();
  });

  it("throws when responses[0] contains an error object", async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        responses: [
          {
            error: {
              code: 3,
              message: "Bad image data.",
            },
          },
        ],
      },
    });

    const { detectLabels } = await import("../pipeline/detect-labels");
    await expect(detectLabels(Buffer.from("test"))).rejects.toThrow(
      "Google Cloud Vision LabelDetection error: Bad image data. (code 3)"
    );
  });
});

describe("generateCaption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns generated caption text", async () => {
    (axios.post as any).mockResolvedValue({
      data: [{ generated_text: "a cat sitting on a couch" }],
    });

    const { generateCaption } = await import("../pipeline/generate-caption");
    const caption = await generateCaption(Buffer.from("test"));
    expect(caption).toBe("a cat sitting on a couch");
  });

  it("throws on network error", async () => {
    (axios.post as any).mockRejectedValue(new Error("Request failed"));

    const { generateCaption } = await import("../pipeline/generate-caption");
    await expect(generateCaption(Buffer.from("test"))).rejects.toThrow();
  });

  it("throws when HuggingFace returns an error object (like model loading)", async () => {
    (axios.post as any).mockResolvedValue({
      data: {
        error: "Model Salesforce/blip-image-captioning-base is currently loading",
      },
    });

    const { generateCaption } = await import("../pipeline/generate-caption");
    await expect(generateCaption(Buffer.from("test"))).rejects.toThrow(
      "HuggingFace API error: Model Salesforce/blip-image-captioning-base is currently loading"
    );
  });

  it("throws when HuggingFace returns invalid response structure", async () => {
    (axios.post as any).mockResolvedValue({
      data: "not-an-array-or-error-object",
    });

    const { generateCaption } = await import("../pipeline/generate-caption");
    await expect(generateCaption(Buffer.from("test"))).rejects.toThrow(
      "Invalid response structure from HuggingFace caption API"
    );
  });
});
