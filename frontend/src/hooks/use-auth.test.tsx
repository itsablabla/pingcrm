import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./use-auth";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  client: {
    GET: mockGet,
    POST: mockPost,
  },
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthProvider registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs context when restoring the authenticated user fails", async () => {
    localStorage.setItem("access_token", "expired-token");
    mockGet.mockRejectedValueOnce(new Error("Network unavailable"));

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(console.error).toHaveBeenCalledWith(
      "Failed to fetch authenticated user",
      expect.any(Error)
    );
  });

  it("surfaces a validation error without attempting login", async () => {
    mockPost.mockResolvedValueOnce({
      error: {
        detail: [
          {
            loc: ["body", "password"],
            msg: "Password must be at least 8 characters",
            type: "value_error",
          },
        ],
      },
    });
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await expect(
      result.current.register("jane@example.com", "short", "Jane Smith")
    ).rejects.toThrow("Password must be at least 8 characters");

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/v1/auth/register", {
      body: {
        email: "jane@example.com",
        password: "short",
        full_name: "Jane Smith",
      },
    });
  });
});
