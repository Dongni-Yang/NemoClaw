// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import {
  isGatewayHealthy,
  getGatewayReuseState,
  isSandboxReady,
  hasStaleGateway,
  getReportedGatewayName,
  isGatewayConnected,
} from "../../dist/lib/gateway-state";

// Realistic openshell CLI output fixtures
const STATUS_CONNECTED_NEMOCLAW = "  Status: Connected\n  Gateway: nemoclaw\n";
const GW_INFO_NEMOCLAW = "  Gateway: nemoclaw\n  Status: Running\n";
const ACTIVE_INFO_NEMOCLAW = "  Gateway: nemoclaw\n  Gateway endpoint: http://localhost:8080\n";

const STATUS_CONNECTED_OTHER = "  Status: Connected\n  Gateway: other-gateway\n";
const GW_INFO_NO_METADATA = "No gateway metadata found\n  Gateway: nemoclaw\n";
const STATUS_DISCONNECTED = "  Status: Disconnected\n  Gateway: nemoclaw\n";

describe("isGatewayHealthy", () => {
  it("returns true when gateway is running — second onboard should reuse, not restart", () => {
    expect(isGatewayHealthy(STATUS_CONNECTED_NEMOCLAW, GW_INFO_NEMOCLAW, ACTIVE_INFO_NEMOCLAW)).toBe(
      true,
    );
  });

  it("returns false when not connected", () => {
    expect(isGatewayHealthy(STATUS_DISCONNECTED, GW_INFO_NEMOCLAW, ACTIVE_INFO_NEMOCLAW)).toBe(
      false,
    );
  });

  it("returns false when gateway metadata is absent", () => {
    expect(isGatewayHealthy(STATUS_CONNECTED_NEMOCLAW, "", ACTIVE_INFO_NEMOCLAW)).toBe(false);
  });

  it("returns false when active gateway is a foreign name", () => {
    expect(isGatewayHealthy(STATUS_CONNECTED_OTHER, GW_INFO_NEMOCLAW, ACTIVE_INFO_NEMOCLAW)).toBe(
      false,
    );
  });

  it("returns false when gwInfo contains no-metadata marker", () => {
    expect(
      isGatewayHealthy(STATUS_CONNECTED_NEMOCLAW, GW_INFO_NO_METADATA, ACTIVE_INFO_NEMOCLAW),
    ).toBe(false);
  });
});

describe("getGatewayReuseState", () => {
  it("returns healthy for a fully running gateway", () => {
    expect(getGatewayReuseState(STATUS_CONNECTED_NEMOCLAW, GW_INFO_NEMOCLAW, ACTIVE_INFO_NEMOCLAW)).toBe(
      "healthy",
    );
  });

  it("returns foreign-active when a different gateway is active", () => {
    expect(getGatewayReuseState(STATUS_CONNECTED_OTHER, GW_INFO_NEMOCLAW, ACTIVE_INFO_NEMOCLAW)).toBe(
      "foreign-active",
    );
  });

  it("returns stale when gateway metadata exists but is disconnected", () => {
    expect(getGatewayReuseState(STATUS_DISCONNECTED, GW_INFO_NEMOCLAW, "")).toBe("stale");
  });

  it("returns missing when no state is present", () => {
    expect(getGatewayReuseState("", "", "")).toBe("missing");
  });
});

describe("hasStaleGateway", () => {
  it("returns true for known gateway info", () => {
    expect(hasStaleGateway(GW_INFO_NEMOCLAW)).toBe(true);
  });

  it("returns false when no-metadata marker is present", () => {
    expect(hasStaleGateway(GW_INFO_NO_METADATA)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasStaleGateway("")).toBe(false);
  });
});

describe("getReportedGatewayName", () => {
  it("parses gateway name from status output", () => {
    expect(getReportedGatewayName(STATUS_CONNECTED_NEMOCLAW)).toBe("nemoclaw");
  });

  it("returns null for empty output", () => {
    expect(getReportedGatewayName("")).toBeNull();
  });
});

describe("isGatewayConnected", () => {
  it("returns true when Connected is present", () => {
    expect(isGatewayConnected(STATUS_CONNECTED_NEMOCLAW)).toBe(true);
  });

  it("returns false when Disconnected", () => {
    expect(isGatewayConnected(STATUS_DISCONNECTED)).toBe(false);
  });
});

describe("isSandboxReady", () => {
  it("returns true for a Ready sandbox", () => {
    const output = "  my-sandbox   Ready   running\n";
    expect(isSandboxReady(output, "my-sandbox")).toBe(true);
  });

  it("returns false for NotReady", () => {
    const output = "  my-sandbox   NotReady   pending\n";
    expect(isSandboxReady(output, "my-sandbox")).toBe(false);
  });

  it("returns false for a different sandbox name", () => {
    const output = "  other-sandbox   Ready   running\n";
    expect(isSandboxReady(output, "my-sandbox")).toBe(false);
  });

  it("strips ANSI codes before matching", () => {
    const output = "\x1b[32m  my-sandbox\x1b[0m   Ready   running\n";
    expect(isSandboxReady(output, "my-sandbox")).toBe(true);
  });
});
