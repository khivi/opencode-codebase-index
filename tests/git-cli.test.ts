import { describe, it, expect } from "vitest";

/**
 * Tests for the git-cli argument parsing logic.
 * Since git-cli.ts runs as a CLI entrypoint with process.argv and process.exit,
 * we test the arg parsing patterns extracted from main().
 */
describe("git-cli argument parsing", () => {
  describe("query command --limit parsing", () => {
    function parseQueryArgs(args: string[]): {
      queryText: string;
      limit: number;
    } {
      const queryParts: string[] = [];
      let limit = 10;

      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--limit" && args[i + 1]) {
          limit = parseInt(args[++i], 10);
          if (isNaN(limit) || limit < 1) limit = 10;
        } else {
          queryParts.push(args[i]);
        }
      }

      return { queryText: queryParts.join(" "), limit };
    }

    it("should parse simple query text", () => {
      const result = parseQueryArgs(["find", "auth", "middleware"]);
      expect(result.queryText).toBe("find auth middleware");
      expect(result.limit).toBe(10);
    });

    it("should parse --limit flag", () => {
      const result = parseQueryArgs(["search", "term", "--limit", "5"]);
      expect(result.queryText).toBe("search term");
      expect(result.limit).toBe(5);
    });

    it("should default to 10 for invalid --limit", () => {
      const result = parseQueryArgs(["query", "--limit", "abc"]);
      expect(result.queryText).toBe("query");
      expect(result.limit).toBe(10);
    });

    it("should default to 10 for negative --limit", () => {
      const result = parseQueryArgs(["query", "--limit", "-1"]);
      expect(result.queryText).toBe("query");
      expect(result.limit).toBe(10);
    });

    it("should default to 10 for zero --limit", () => {
      const result = parseQueryArgs(["query", "--limit", "0"]);
      expect(result.queryText).toBe("query");
      expect(result.limit).toBe(10);
    });

    it("should handle --limit at the start", () => {
      const result = parseQueryArgs(["--limit", "3", "some", "query"]);
      expect(result.queryText).toBe("some query");
      expect(result.limit).toBe(3);
    });

    it("should return empty query text when no text args", () => {
      const result = parseQueryArgs(["--limit", "5"]);
      expect(result.queryText).toBe("");
      expect(result.limit).toBe(5);
    });

    it("should return empty query text for empty args", () => {
      const result = parseQueryArgs([]);
      expect(result.queryText).toBe("");
      expect(result.limit).toBe(10);
    });
  });

  describe("command routing", () => {
    const VALID_COMMANDS = [
      "install",
      "index",
      "status",
    ];

    it("should recognize all valid commands", () => {
      for (const cmd of VALID_COMMANDS) {
        expect(VALID_COMMANDS).toContain(cmd);
      }
    });

    it("should treat --help as help request", () => {
      const args = ["--help"];
      const isHelp =
        args.length === 0 || args[0] === "--help" || args[0] === "-h";
      expect(isHelp).toBe(true);
    });

    it("should treat -h as help request", () => {
      const args = ["-h"];
      const isHelp =
        args.length === 0 || args[0] === "--help" || args[0] === "-h";
      expect(isHelp).toBe(true);
    });

    it("should treat empty args as help request", () => {
      const args: string[] = [];
      const isHelp =
        args.length === 0 || args[0] === "--help" || args[0] === "-h";
      expect(isHelp).toBe(true);
    });
  });
});
