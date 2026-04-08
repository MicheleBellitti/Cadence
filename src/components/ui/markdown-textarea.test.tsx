import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MarkdownTextarea } from "./markdown-textarea";

describe("MarkdownTextarea", () => {
  it("shows textarea in edit mode by default", () => {
    render(<MarkdownTextarea value="hello" onChange={vi.fn()} id="test" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("switches to preview on tab click", async () => {
    render(<MarkdownTextarea value="**bold**" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("shows placeholder in empty preview", async () => {
    render(<MarkdownTextarea value="" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByText("Nothing to preview")).toBeInTheDocument();
  });

  it("has correct ARIA attributes", () => {
    render(<MarkdownTextarea value="" onChange={vi.fn()} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const editTab = screen.getByRole("tab", { name: "Edit" });
    expect(editTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });
});
