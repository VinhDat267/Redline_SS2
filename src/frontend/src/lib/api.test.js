import { describe, it, expect } from "vitest";
import { humanizeError, ApiError } from "./api";

describe("humanizeError business-friendly mapping", () => {
    // --- Auth & Session errors ---
    it("maps 'Invalid CSRF token' to session expired", () => {
        expect(humanizeError("Invalid CSRF token")).toBe(
            "Your session has expired. Please sign in again."
        );
    });

    it("maps 'CSRF token is required' to session expired", () => {
        expect(humanizeError("CSRF token is required")).toBe(
            "Your session has expired. Please sign in again."
        );
    });

    it("maps 'Authentication required' to sign-in prompt", () => {
        expect(humanizeError("Authentication required")).toBe(
            "Please sign in to continue."
        );
    });

    it("maps 'Access token has been revoked' to session expired", () => {
        expect(humanizeError("Access token has been revoked")).toBe(
            "Your session has expired. Please sign in again."
        );
    });

    // --- Server errors ---
    it("maps 'Internal Server Error' to friendly server message", () => {
        expect(humanizeError("Internal Server Error")).toBe(
            "A server error occurred while processing your request. Please try again later."
        );
    });

    // --- Not Found resources ---
    it("maps 'Project not found' to friendly message", () => {
        expect(humanizeError("Project not found")).toBe(
            "The requested project could not be found."
        );
    });

    it("maps 'Document not found' to friendly message", () => {
        expect(humanizeError("Document not found")).toBe(
            "The requested document could not be found."
        );
    });

    it("maps 'Requirement not found' to obligation message", () => {
        expect(humanizeError("Requirement not found")).toBe(
            "The requested obligation could not be found."
        );
    });

    it("maps 'Test case not found' to compliance check message", () => {
        expect(humanizeError("Test case not found")).toBe(
            "The requested compliance check could not be found."
        );
    });

    it("maps 'Compare run not found' to comparison message", () => {
        expect(humanizeError("Compare run not found")).toBe(
            "The requested comparison could not be found."
        );
    });

    it("maps 'Chat session not found' to friendly message", () => {
        expect(humanizeError("Chat session not found")).toBe(
            "This chat session could not be found. It may have been deleted."
        );
    });

    // --- Conflict errors ---
    it("maps 'Version already exists' to friendly message", () => {
        expect(humanizeError("Version already exists")).toBe(
            "A version with this label already exists. Please choose a different name."
        );
    });

    it("maps 'Member already exists' to friendly message", () => {
        expect(humanizeError("Member already exists")).toBe(
            "This user is already a member of the project."
        );
    });

    it("maps 'Mapping already exists' to friendly message", () => {
        expect(humanizeError("Mapping already exists")).toBe(
            "This mapping already exists."
        );
    });

    // --- Permission errors ---
    it("maps 'Project owner access required' to permission message", () => {
        expect(humanizeError("Project owner access required")).toBe(
            "You do not have permission to perform this action. Owner access is required."
        );
    });

    // --- Passthrough: unknown messages stay unchanged ---
    it("passes through unknown error messages unchanged", () => {
        expect(humanizeError("Some brand new error")).toBe("Some brand new error");
    });

    it("passes through empty string unchanged", () => {
        expect(humanizeError("")).toBe("");
    });
});

describe("ApiError", () => {
    it("is an instance of Error with message, status, and payload", () => {
        const err = new ApiError("test message", 404, { detail: "Not found" });
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe("test message");
        expect(err.status).toBe(404);
        expect(err.payload).toEqual({ detail: "Not found" });
        expect(err.name).toBe("ApiError");
    });
});
