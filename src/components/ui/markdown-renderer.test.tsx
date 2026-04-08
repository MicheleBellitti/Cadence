import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarkdownRenderer } from "./markdown-renderer";

describe("MarkdownRenderer", () => {
  it("renders markdown as HTML", () => {
    render(<MarkdownRenderer content="**bold text**" />);
    expect(screen.getByText("bold text").tagName).toBe("STRONG");
  });

  it("renders links with target=_blank", () => {
    render(<MarkdownRenderer content="[link](https://example.com)" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("returns null for empty content", () => {
    const { container } = render(<MarkdownRenderer content="   " />);
    expect(container.firstChild).toBeNull();
  });
});
