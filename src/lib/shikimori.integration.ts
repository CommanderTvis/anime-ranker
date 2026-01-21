/**
 * Standalone integration tests for Shikimori API
 * Run with: bun run src/lib/shikimori.integration.ts
 *
 * These tests make real network requests to verify:
 * 1. The API structure hasn't changed
 * 2. Our parsing logic works with real data
 * 3. The user's profile is accessible
 */

import { fetchShikimoriUser, fetchShikimoriAnimeList } from "./shikimori";

const TEST_USERNAME = "SolAstrius";
const EXPECTED_USER_ID = 692906;

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n=== Shikimori Integration Tests ===\n");

  // Test 1: Fetch user profile
  console.log("Testing fetchShikimoriUser...");
  const user = await fetchShikimoriUser(TEST_USERNAME);

  assert(user !== null, "User should not be null");
  assert(user?.id === EXPECTED_USER_ID, `User ID should be ${EXPECTED_USER_ID}`);
  assert(user?.nickname === TEST_USERNAME, `Nickname should be ${TEST_USERNAME}`);

  // Test 2: Fetch non-existent user
  console.log("\nTesting fetchShikimoriUser with non-existent user...");
  const nonExistent = await fetchShikimoriUser("ThisUserDefinitelyDoesNotExist12345678");
  assert(nonExistent === null, "Non-existent user should return null");

  // Test 3: Fetch anime list
  console.log("\nTesting fetchShikimoriAnimeList...");
  const progressUpdates: Array<{ loaded: number; status: string }> = [];
  const list = await fetchShikimoriAnimeList(TEST_USERNAME, (loaded, status) => {
    progressUpdates.push({ loaded, status });
  });

  assert(list !== null, "Anime list should not be null");
  assert(list?.source === "shikimori", "Source should be shikimori");
  assert(list?.userId === EXPECTED_USER_ID, `User ID should be ${EXPECTED_USER_ID}`);
  assert(list?.userName === TEST_USERNAME, `User name should be ${TEST_USERNAME}`);
  assert(Array.isArray(list?.anime), "Anime should be an array");

  // Test 4: Substantial anime count
  const animeCount = list?.anime.length ?? 0;
  console.log(`\nFound ${animeCount} anime entries`);
  assert(animeCount > 100, "Should have more than 100 anime entries");

  // Test 5: Entry fields
  console.log("\nTesting anime entry fields...");
  if (list && list.anime.length > 0) {
    const entry = list.anime[0];
    assert(typeof entry.animeId === "number", "animeId should be a number");
    assert(typeof entry.title === "string", "title should be a string");
    assert(entry.title.length > 0, "title should not be empty");
    assert(
      ["TV", "Movie", "OVA", "ONA", "Special", "TV Special", "Music", "PV", "CM", null].includes(
        entry.animeType
      ),
      "animeType should be valid"
    );
    assert(
      ["Completed", "Watching", "Plan to Watch", "On-Hold", "Dropped"].includes(entry.status),
      "status should be valid"
    );
  }

  // Test 6: Completed anime with scores
  console.log("\nTesting completed anime with scores...");
  const completedWithScores =
    list?.anime.filter((a) => a.status === "Completed" && a.myScore !== null && a.myScore > 0) ?? [];
  console.log(`Found ${completedWithScores.length} completed anime with scores`);
  assert(completedWithScores.length > 50, "Should have more than 50 completed anime with scores");

  // Test 7: Score range
  console.log("\nTesting score ranges...");
  const withScores = list?.anime.filter((a) => a.myScore !== null) ?? [];
  const invalidScores = withScores.filter((a) => a.myScore! < 1 || a.myScore! > 10);
  assert(invalidScores.length === 0, "All scores should be in range 1-10");

  // Test 8: Alphabetical sorting
  console.log("\nTesting alphabetical sorting...");
  const titles = list?.anime.map((a) => a.title) ?? [];
  let sortedCorrectly = true;
  for (let i = 1; i < titles.length; i++) {
    if (titles[i].localeCompare(titles[i - 1]) < 0) {
      sortedCorrectly = false;
      break;
    }
  }
  assert(sortedCorrectly, "Anime should be sorted alphabetically");

  // Test 9: Status distribution
  console.log("\nTesting status distribution...");
  const statuses = new Set(list?.anime.map((a) => a.status) ?? []);
  assert(statuses.has("Completed"), "Should have Completed status");
  assert(statuses.has("Plan to Watch"), "Should have Plan to Watch status");
  console.log("Statuses found:", Array.from(statuses).join(", "));

  // Test 10: Progress callback
  console.log("\nTesting progress callback...");
  assert(progressUpdates.length > 1, "Should have multiple progress updates");
  assert(
    progressUpdates[progressUpdates.length - 1].status === "Processing...",
    "Final status should be Processing..."
  );

  // Summary
  console.log("\n=== Results ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
