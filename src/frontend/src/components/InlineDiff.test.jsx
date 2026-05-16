import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { InlineDiff, VIEW_MODES } from "./InlineDiff";

afterEach(cleanup);

describe("InlineDiff", () => {
  test("renders plain dashes when both texts are empty", () => {
    const { container } = render(<InlineDiff oldText="" newText="" />);
    const dashes = within(container).getAllByText("\u2014");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  test("renders plain view when only old_content exists", () => {
    const { container } = render(<InlineDiff oldText="original text" newText="" />);
    expect(within(container).getByText("Old content")).toBeInTheDocument();
    expect(within(container).getByText("original text")).toBeInTheDocument();
    // no mode toggle when only one side has content
    expect(within(container).queryByText("Side-by-side")).not.toBeInTheDocument();
  });

  test("renders plain view when only new_content exists", () => {
    const { container } = render(<InlineDiff oldText="" newText="new text" />);
    expect(within(container).getByText("New content")).toBeInTheDocument();
    expect(within(container).getByText("new text")).toBeInTheDocument();
  });

  test("renders side-by-side view by default with mode toggle", () => {
    const { container } = render(
      <InlineDiff
        oldText="The system shall process payments"
        newText="The system must process refunds"
      />
    );
    expect(within(container).getByText("Old content")).toBeInTheDocument();
    expect(within(container).getByText("New content")).toBeInTheDocument();
    expect(within(container).getByText("Side-by-side")).toBeInTheDocument();
    expect(within(container).getByText("Unified")).toBeInTheDocument();
    expect(within(container).getByText("Plain")).toBeInTheDocument();
  });

  test("highlights changed words with diff token classes", () => {
    const { container } = render(
      <InlineDiff oldText="hello world" newText="hello universe" />
    );
    const addedTokens = container.querySelectorAll(".diff-token-added");
    const removedTokens = container.querySelectorAll(".diff-token-removed");
    expect(addedTokens.length).toBeGreaterThan(0);
    expect(removedTokens.length).toBeGreaterThan(0);
  });

  test("switches to unified view on click", () => {
    const { container } = render(
      <InlineDiff oldText="old text here" newText="new text here" />
    );

    fireEvent.click(within(container).getByText("Unified"));
    expect(within(container).getByText("Unified Diff")).toBeInTheDocument();
    expect(within(container).queryByText("Old content")).not.toBeInTheDocument();
    expect(within(container).queryByText("New content")).not.toBeInTheDocument();
  });

  test("switches to plain view on click", () => {
    const { container } = render(
      <InlineDiff oldText="old text" newText="new text" />
    );

    fireEvent.click(within(container).getByText("Plain"));
    expect(within(container).getByText("Old content")).toBeInTheDocument();
    expect(within(container).getByText("New content")).toBeInTheDocument();
  });

  test("plain mode shows no diff highlighting", () => {
    const { container } = render(
      <InlineDiff
        oldText="old text"
        newText="new text"
        defaultMode={VIEW_MODES.PLAIN}
      />
    );
    expect(container.querySelectorAll(".diff-token-added").length).toBe(0);
    expect(container.querySelectorAll(".diff-token-removed").length).toBe(0);
  });

  test("respects defaultMode prop", () => {
    const { container } = render(
      <InlineDiff
        oldText="alpha"
        newText="beta"
        defaultMode={VIEW_MODES.UNIFIED}
      />
    );
    expect(within(container).getByText("Unified Diff")).toBeInTheDocument();
  });

  test("shows no diff tokens when content is identical", () => {
    const { container } = render(
      <InlineDiff oldText="same content" newText="same content" />
    );
    expect(container.querySelectorAll(".diff-token-added").length).toBe(0);
    expect(container.querySelectorAll(".diff-token-removed").length).toBe(0);
  });
});
